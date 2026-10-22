"""Documentation utilisateur : sommaire, rubriques, glossaire, signalement quand la base bouge, export HTML."""

import base64
import io
import json
import shutil
from pathlib import Path

import pytest

from referentiel import documentation as do

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
SOMMAIRE = {"titre": "Guide du transporteur", "introduction": "Vous suivez vos expéditions — simplement.",
            "rubriques": [{"titre": "Signaler un litige", "partie": "Transporteur", "objectif": "Déclarer un dommage", "sources": ["RG-005", "SCR-014", "SCR-999"]},
                          {"titre": "Prendre en charge une expédition", "partie": "Transporteur", "objectif": "x", "sources": ["RG-003"]}]}
PAGE = {"texte": "## Signaler un litige\n\nQuand une marchandise arrive abîmée.\n\n1. Ouvrez « Livraison ».\n2. Cliquez sur « Signaler un litige ».\n\n> **Attention** passé le délai, c'est refusé.\n\nVoir [Prendre en charge une expédition](#prendre-en-charge-une-expedition).",
        "ecrans": ["SCR-014", "SCR-999"], "a_confirmer": ["Le libellé exact du bouton"]}


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "maison"))
    (tmp_path / "maison" / "Downloads").mkdir(parents=True)
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def faux_claude(reponse):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        vus.append((options.system_prompt, prompt))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps(reponse))

    return requete, vus


def test_du_sommaire_a_l_export(projet):
    requete, vus = faux_claude(SOMMAIRE)
    v = do.proposer_sommaire(projet, "role", "utilisateur", requete=requete)
    assert "Par profil d'utilisateur" in vus[0][0] and not vus[0][1].split("# Base du produit\n")[1].startswith("(")
    r = v["rubriques"]
    assert [x["id"] for x in r] == ["signaler-un-litige", "prendre-en-charge-une-expedition"]
    assert r[0]["sources"] == ["RG-005", "SCR-014"] and r[0]["statut"] == "a_rediger" and "—" not in v["guide"]["introduction"]
    requete, vus = faux_claude(PAGE)
    v = do.rediger_rubrique(projet, "signaler-un-litige", requete=requete)
    assert "Délai de signalement" in vus[0][1] and "#prendre-en-charge-une-expedition" in vus[0][0]
    r = v["rubriques"][0]
    assert r["statut"] == "brouillon" and r["ecrans"] == ["SCR-014"] and r["texte"].startswith("## Signaler") and not r["a_mettre_a_jour"]
    # La base bouge : la rubrique est signalée, puis relue.
    f = projet / "regles" / "RG-005.yaml"
    f.write_text(f.read_text(encoding="utf-8").replace("Délai de signalement", "Délai de déclaration"), encoding="utf-8")
    assert do.vue(projet)["rubriques"][0]["a_mettre_a_jour"]
    assert not do.enregistrer_rubrique(projet, "signaler-un-litige", statut="relue")["rubriques"][0]["a_mettre_a_jour"]
    requete, _ = faux_claude({"termes": [{"terme": "Litige", "definition": "Un dommage déclaré."}, {"terme": "Expédition", "definition": "Un envoi."}]})
    g = do.rediger_glossaire(projet, requete=requete)["guide"]
    assert [t["terme"] for t in g["glossaire"]] == ["Expédition", "Litige"]
    from PIL import Image
    tampon = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(tampon, "PNG")
    e = do.exporter(projet, {"SCR-014": "data:image/png;base64," + base64.b64encode(tampon.getvalue()).decode(), "../x": "data:image/png;base64,AA=="})
    page = Path(e["chemin"]).read_text(encoding="utf-8")
    assert e["rubriques"] == 1 and e["captures"] == 1 and "<ol>" in page and 'class="attention"' in page
    assert '<a href="#prendre-en-charge-une-expedition">' not in page and "Voir Prendre en charge" in page and "Glossaire" in page and "« Livraison »" in page


def test_modifier_le_sommaire_et_erreurs(projet):
    with pytest.raises(do.ErreurDocumentation):
        do.modifier_guide(projet, {})
    requete, _ = faux_claude(SOMMAIRE)
    do.proposer_sommaire(projet, "parcours", "utilisateur", requete=requete)
    do.enregistrer_rubrique(projet, "prendre-en-charge-une-expedition", texte="## X\n\nTexte")
    v = do.modifier_guide(projet, {"titre": "Guide", "rubriques": [{"id": "signaler-un-litige", "titre": "Déclarer un litige"}, {"titre": "Nouvelle rubrique"}]})
    assert [x["titre"] for x in v["rubriques"]] == ["Déclarer un litige", "Nouvelle rubrique"]
    assert not (projet / "documentation" / "pages" / "prendre-en-charge-une-expedition.md").exists()
    with pytest.raises(do.ErreurDocumentation):
        do.rediger_rubrique(projet, "../x")
    with pytest.raises(do.ErreurDocumentation):
        do.exporter(projet)  # aucune rubrique rédigée
    with pytest.raises(do.ErreurDocumentation):
        do.proposer_sommaire(projet, "n'importe", "utilisateur")
