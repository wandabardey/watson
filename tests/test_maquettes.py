"""Maquettes : nettoyage du HTML, dessin par Claude avec la piste retenue, garde, import, brief Claude Design."""

import base64
import json
import shutil
from pathlib import Path

import pytest

from referentiel import avant_projet as ap
from referentiel import maquettes as mq

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    return racine


def faux_claude(reponse):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = {}

    async def requete(prompt, options):
        vus["prompt"], vus["options"] = prompt, options
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1,
                                session_id="s", result=json.dumps(reponse))

    return requete, vus


def test_nettoyage():
    sale = ('<style>@import url("https://evil.example/x.css");@import url("https://fonts.googleapis.com/css2?family=Inter");'
            'body{background:url(https://evil.example/t.png)}</style>'
            '<script>alert(1)</script><img src="https://evil.example/p.png" onerror="alert(2)">'
            '<a href="javascript:alert(3)">x</a><iframe src="https://x"></iframe><div onclick=alert(4)>Bonjour</div>'
            '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">')
    h = mq.nettoyer(sale)
    for interdit in ("<script", "alert(", "evil.example", "<iframe", "javascript:", "onerror", "onclick"):
        assert interdit not in h, interdit
    assert "fonts.googleapis.com/css2?family=Inter" in h and "Bonjour" in h


def test_dessiner_garder_et_reprendre(projet):
    piste = {"id": "sobre", "nom": "Sobre", "parti_pris": "x", "dials": {"variance": 3, "motion": 2, "densite": 7},
             "couleurs": [{"nom": "Bleu", "hex": "#1D4E89", "role": "marque"}, {"nom": "Blanc", "hex": "#FFFFFF", "role": "fond"}],
             "typo": {"titres": "Inter", "texte": "Inter"}}
    ap.enregistrer_moodboard(projet, {"pistes": [piste], "retenue": "sobre"})
    rep = {"titre": "Détail d'une expédition", "html": "<style>h1{color:#1D4E89}</style><h1>Expédition EXP-2481</h1><script>x()</script><p>Lyon vers Montréal</p>",
           "notes": "État rempli.", "donnees": "EXP-2481 Lyon vers Montréal, statut En attente de documents",
           "questions": [{"question": "Afficher le poids ?"}]}
    requete, vus = faux_claude(rep)
    prop = mq.dessiner("fret", projet, ecran="SCR-002", demande="mettre l'historique en avant", requete=requete)
    sp = vus["options"].system_prompt
    assert "#1D4E89" in sp and "mettre l'historique en avant" in sp and "Récapitulatif" in vus["prompt"]
    assert prop["support"] == "desktop" and prop["piste"] == "sobre" and mq.propositions("fret")[0]["id"] == prop["id"]
    assert "<script" not in mq.contenu(projet, prop["id"], "fret")["html"]
    m = mq.garder("fret", projet, prop["id"], "W")
    idx = mq.lire_index(projet)
    assert idx["maquettes"][0]["ecran"] == "SCR-002" and idx["donnees"].startswith("EXP-2481") and not mq.propositions("fret")
    assert "Lyon vers Montréal" in mq.contenu(projet, m["id"])["html"]
    v = mq.vue(projet, "fret")
    assert next(e for e in v["ecrans"] if e["id"] == "SCR-002")["maquettes"] == [m["id"]] and v["piste"]["id"] == "sobre"
    # Reprise : même repère, la version précédente et le jeu de données sont donnés à Claude.
    requete2, vus2 = faux_claude({**rep, "html": "<p>Version 2</p><p>EXP-2481 encore</p>"})
    p2 = mq.dessiner("fret", projet, reprendre=m["id"], demande="plus dense", requete=requete2)
    assert p2["id"] == m["id"] and p2["remplace"] and "Lyon vers Montréal" in vus2["options"].system_prompt
    mq.garder("fret", projet, m["id"], "W")
    assert len(mq.lire_index(projet)["maquettes"]) == 1 and "Version 2" in mq.contenu(projet, m["id"])["html"]


def test_importer_modifier_supprimer_et_brief(projet):
    html = base64.b64encode('<html><body><h1>Export Claude Design</h1><script>x</script></body></html>'.encode()).decode()
    m = mq.importer(projet, "Liste.html", html, ecran="SCR-011", origine="claude_design")
    assert m["origine"] == "claude_design" and "<script" not in (projet / "avant-projet" / "maquettes" / m["fichier"]).read_text()
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    i = mq.importer(projet, "capture.png", base64.b64encode(png).decode(), titre="Capture")
    assert mq.contenu(projet, i["id"])["image"].startswith("data:image/png")
    with pytest.raises(ap.ErreurAvantProjet):
        mq.importer(projet, "x.exe", html)
    mq.modifier(projet, i["id"], {"ecran": "SCR-001", "titre": "Saisie (capture)"})
    assert mq.lire_index(projet)["maquettes"][1]["ecran"] == "SCR-001"
    mq.supprimer(projet, i["id"])
    assert not (projet / "avant-projet" / "maquettes" / i["fichier"]).exists() and len(mq.lire_index(projet)["maquettes"]) == 1
    brief = mq.brief_claude_design(projet, ["SCR-002"])
    assert "Détail d'une expédition" in brief and "Récapitulatif" in brief and "\u2014" not in brief
