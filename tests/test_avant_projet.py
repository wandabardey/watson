"""Avant-projet : le cahier des charges, rédigé avec Claude et gardé section par section."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import avant_projet as ap
from referentiel._vendor import yaml

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


def test_cahier_vide_et_perimetre_vivant(projet):
    v = ap.vue_cahier(projet)
    assert not v["existe"] and [s["id"] for s in v["cahier"]["sections"]][:2] == ["contexte", "objectifs"]
    per = {x["version"]: x for x in v["perimetre"]}
    assert "Détail d'une expédition" not in [e["nom"] for e in per["V2"]["ecrans"]]
    assert "Facturation" in [e["nom"] for e in per["V2"]["ecrans"]] and per["MVP"]["scenarios"]  # sans version : dès le MVP


def test_rediger_puis_garder(projet):
    reponse = {"resume": "Premier jet.", "sections": [
        {"id": "contexte", "titre": "Contexte", "contenu": "Le fret international — suivi des expéditions.", "pourquoi": "Écrit."},
        {"id": "perimetre", "titre": "Périmètre", "contenu": "Ne doit pas passer : section vivante."},
        {"id": "objectifs", "titre": "Objectifs", "contenu": "1. Réduire les litiges [À CONFIRMER]"}],
        "questions": [{"question": "Quel budget ?", "contexte": "Absent des sources."}, {"question": "Quelle date ?"}]}
    requete, vus = faux_claude(reponse)
    prop = ap.rediger_cahier("fret", projet, demande="Insiste sur les litiges", requete=requete)
    assert "Insiste sur les litiges" in vus["options"].system_prompt and "Rien d'inventé" in vus["options"].system_prompt
    assert [s["id"] for s in prop["sections"]] == ["contexte", "objectifs"] and "—" not in prop["sections"][0]["contenu"]
    assert ap.vue_cahier(projet, "fret")["proposition"]["resume"] == "Premier jet."
    r = ap.garder_proposition("fret", projet, ["objectifs"], [0], "Wanda")
    assert r == {"sections": ["Objectifs"], "questions": 1}
    c = ap.lire_cahier(projet)
    secs = {s["id"]: s["contenu"] for s in c["sections"]}
    assert secs["objectifs"].startswith("1. Réduire") and secs["contexte"] == "" and c["statut"] == "brouillon"
    sujets = yaml.safe_load((projet / "sujets.yaml").read_text(encoding="utf-8"))
    assert sujets[-1]["question"] == "Quel budget ?" and ap.lire_proposition("fret") is None


def test_enregistrer_controle(projet):
    with pytest.raises(ap.ErreurAvantProjet):
        ap.enregistrer_cahier(projet, {"sections": [{"id": "a", "titre": "A"}, {"id": "a", "titre": "B"}]})
    with pytest.raises(ap.ErreurAvantProjet):
        ap.enregistrer_cahier(projet, {"statut": "fini", "sections": []})
    c = ap.enregistrer_cahier(projet, {"titre": "CDC", "statut": "partage", "sections": [{"id": "libre", "titre": "Annexe", "contenu": " x "}]})
    assert c["sections"][0]["contenu"] == "x" and ap.vue_cahier(projet)["existe"]
