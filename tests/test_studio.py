"""Savoir-faire du studio : relecture et critique UX, fiche secteur, mail au client."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import ateliers as at
from referentiel import studio as st

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
REVUE = {"verdict": "Prêt après corrections mineures — deux retours.", "forces": ["Clair"],
         "points": [{"gravite": "mineur", "constat": "Titre long", "recommandation": "Raccourcir"},
                    {"gravite": "bloquant", "ou": "Objectifs", "constat": "Aucun objectif mesurable", "recommandation": "Chiffrer"}],
         "quick_wins": ["Chiffrer l'objectif 1"]}


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    return racine


def faux_claude(reponse):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        contenu = prompt
        if not isinstance(prompt, str):
            contenu = [m async for m in prompt][0]["message"]["content"]
        vus.append((options.system_prompt, contenu))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps(reponse))

    return requete, vus


def test_relecture_d_un_kit_d_atelier(projet):
    a = at.creer(projet, {"titre": "Cadrage", "type": "cadrage"})
    with pytest.raises(st.ErreurStudio):
        st.relire("fret", projet, {"type": "atelier", "id": a["id"]})
    at.modifier(projet, a["id"], {"kit": {"objectifs": ["Comprendre"], "trame": [], "themes": []}})
    requete, vus = faux_claude(REVUE)
    r = st.relire("fret", projet, {"type": "atelier", "id": a["id"]}, "Est-ce assez cadré ?", requete=requete)
    systeme, message = vus[0]
    assert "Est-ce assez cadré ?" in systeme and "Kit de l'atelier" in systeme and "Comprendre" in message
    assert not message.split("# Base du projet\n")[1].startswith("(")  # le contexte, pas un tuple
    assert [p["gravite"] for p in r["points"]] == ["bloquant", "mineur"] and "—" not in r["verdict"]
    assert st.lire_revue("fret", {"type": "atelier", "id": a["id"]})["verdict"] == r["verdict"]
    assert "Aucun objectif mesurable → Chiffrer" in st.consigne_correction(r, [0])
    with pytest.raises(st.ErreurStudio):
        st.relire("fret", projet, {"type": "regle", "id": "RG-001"})


def test_fiche_secteur_proposee_puis_gardee(projet):
    requete, vus = faux_claude({"domaine": "Fret", "texte": "# Le fret\n\nUn **transitaire** — organise.", "a_confirmer": ["Seuils ADR"]})
    v = st.proposer_secteur("fret", projet, complete=True, requete=requete)
    assert v["fiche"] is None and v["proposition"]["domaine"] == "Fret" and "complète" in vus[0][0]
    v = st.garder_secteur("fret", projet)
    assert v["proposition"] is None and "transitaire**, organise" in (projet / "avant-projet" / "secteur.md").read_text(encoding="utf-8")
    with pytest.raises(st.ErreurStudio):
        st.garder_secteur("fret", projet)
    requete, vus = faux_claude({"domaine": "Fret", "texte": "v2"})
    st.proposer_secteur("fret", projet, requete=requete)
    assert "Fiche actuelle" in vus[0][0] and "transitaire" in vus[0][0]


def test_mail_compte_rendu(projet):
    a = at.creer(projet, {"titre": "Cadrage", "type": "cadrage", "participants": [{"nom": "Claire", "role": "DG"}]})
    at.modifier(projet, a["id"], {"compte_rendu": {"texte": "Cinq jours ouvrés retenus."}})
    requete, vus = faux_claude({"objet": "Compte rendu", "corps": "Bonjour Claire", "a_verifier": ["[date]"]})
    m = st.ecrire_mail("fret", projet, "compte_rendu", "Remercier", {"type": "atelier", "id": a["id"]}, "Wanda Bardey", requete=requete)
    assert m["objet"] == "Compte rendu" and "Cinq jours ouvrés" in vus[0][1] and "Wanda Bardey" in vus[0][0]
    with pytest.raises(st.ErreurStudio):
        st.ecrire_mail("fret", projet, "spam", requete=requete)
