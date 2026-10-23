"""Qui fait quoi : origine, CRUD, matrice des droits, contrôles, détail par objet, proposition de Watson."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import crud
from referentiel.chargement import charger
from referentiel.controles import analyser

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
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


def test_detail_et_controles():
    p = charger(FRET)
    assert not p.erreurs
    d = {x["id"]: x for x in crud.detail(p)}
    exp = d["ENT-EXPEDITION"]
    assert exp["origine"] == "Saisie dans l'application" and exp["flow"].startswith("Brouillon → ")
    assert exp["crud"].startswith("C : l'expéditeur") and "Échange Douane (DELTA G)" in exp["liens"]
    assert "Saisie d'une expédition" in [e["nom"] for e in exp["ecrans"]]
    trous = {t.id: t for t in analyser(p)}
    t = trous["DROITS_INCOHERENTS:ENT-EXPEDITION:ACT-TRANSPORTEUR"]
    assert "« Livrer »" in t.message and "ENTITE_SANS_CRUD:ENT-SOCIETE" in trous
    assert "ENTITE_SANS_CRUD:ENT-EXPEDITION" not in trous


def test_matrice_enregistree(projet):
    v = crud.vue(projet)
    exp = next(e for e in v["entites"] if e["id"] == "ENT-EXPEDITION")
    assert exp["deduits"]["ACT-TRANSPORTEUR"] == "RU" and exp["droits"]["ACT-TRANSPORTEUR"] == "R"
    v = crud.enregistrer(projet, [{"id": "ENT-EXPEDITION", "droits": {**exp["droits"], "ACT-TRANSPORTEUR": "UR", "ACT-INCONNU": "C"}},
                                  {"id": "ENT-SOCIETE", "origine": " Administration ", "crud": {"creer": "l'administrateur", "supprimer": "", "autre": "x"}}])
    p = charger(projet)
    assert {"acteur": "ACT-TRANSPORTEUR", "droits": "RU"} in p.entites["ENT-EXPEDITION"]["droits"]
    assert not any(d["acteur"] == "ACT-INCONNU" for d in p.entites["ENT-EXPEDITION"]["droits"])
    assert p.entites["ENT-SOCIETE"]["origine"] == "Administration" and p.entites["ENT-SOCIETE"]["crud"] == {"creer": "l'administrateur"}
    assert not [t for t in analyser(p) if t.type in ("DROITS_INCOHERENTS", "ENTITE_SANS_CRUD")]
    # Vider les droits les retire du fichier.
    crud.enregistrer(projet, [{"id": "ENT-EXPEDITION", "droits": {}}])
    assert "droits" not in charger(projet).entites["ENT-EXPEDITION"]


def test_proposition_de_watson(projet):
    requete, vus = faux_claude({"entites": [
        {"id": "ENT-SOCIETE", "origine": "Administration \u2014 référentiel", "crud": {"creer": "l'agent de transit", "supprimer": "non, désactivation"},
         "droits": [{"acteur": "ACT-AGENT-TRANSIT", "droits": "urc"}, {"acteur": "ACT-PERSONNE", "droits": "R"}], "pourquoi": "Référentiel."},
        {"id": "ENT-INCONNUE", "origine": "x"}], "a_confirmer": ["Qui crée une société ?"]})
    v = crud.proposer("p1", projet, requete=requete)
    assert "Transporteur" in vus[0][0] and "ENT-SOCIETE" in vus[0][0]
    att = v["en_attente"]
    assert [e["id"] for e in att["entites"]] == ["ENT-SOCIETE"] and att["entites"][0]["droits"] == {"ACT-AGENT-TRANSIT": "CRU"}
    assert "\u2014" not in att["entites"][0]["origine"]
    v = crud.garder("p1", projet)
    assert v["en_attente"] is None
    s = charger(projet).entites["ENT-SOCIETE"]
    assert s["droits"] == [{"acteur": "ACT-AGENT-TRANSIT", "droits": "CRU"}] and s["crud"]["supprimer"] == "non, désactivation"
    with pytest.raises(crud.ErreurCrud):
        crud.garder("p1", projet)
