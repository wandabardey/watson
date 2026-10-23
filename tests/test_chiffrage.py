"""Chiffrage : hypothèses, calcul des phases, fourchette, enveloppe annoncée, éléments de justification, proposition."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import chiffrage as ch
from referentiel.avant_projet import ErreurAvantProjet

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
PHASES = [
    {"id": "cadrage", "nom": "Phase 0, cadrage", "modalite": "forfait", "jours_profils": [{"nom": "PO/UX", "jours": 15}, {"nom": "Tech lead", "jours": 7.5}], "semaines": 3},
    {"id": "mvp", "nom": "MVP", "modalite": "sprints", "sprints": 4},
    {"id": "socle", "nom": "Socle complet", "modalite": "estimation", "sprints": 5},
    {"id": "mep", "nom": "Mise en production", "modalite": "fourchette", "jours": 37.5, "jours_max": 62.5, "semaines": 3, "semaines_max": 5, "debut": 12},
]


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_calcul_du_dossier_de_reference():
    c = {"tjm": 640, "duree_sprint": 1, "profils": [{"nom": "PO/UX", "jours_par_sprint": 5}, {"nom": "Développeurs", "jours_par_sprint": 10},
                                                     {"nom": "Tech lead", "jours_par_sprint": 2.5}], "phases": PHASES, "annonce": ["cadrage", "mvp"]}
    r = ch.calculer(c)
    ph = {x["id"]: x for x in r["phases"]}
    assert r["jours_sprint"] == 17.5 and r["montant_sprint"] == 11200
    assert ph["cadrage"]["montant"] == 14400 and ph["cadrage"]["jours_texte"] == "22,5"
    assert ph["mvp"]["montant"] == 44800 and ph["socle"]["montant"] == 56000
    assert ph["mep"]["montant_texte"] == "24 000 à 40 000 € HT"
    assert r["total_min"] == 139200 and r["total_max"] == 155200 and r["annonce"] == 59200
    assert (ph["mvp"]["debut"], ph["mvp"]["fin"]) == (4, 7) and ph["mep"]["debut"] == 12
    assert "17,5 jours" in r["base_calcul"] and "11 200 € HT" in r["base_calcul"]
    sans = ch.calculer({**c, "tjm": None})
    assert sans["manque_tjm"] and sans["total_texte"] == "à renseigner" and sans["phases"][1]["montant"] is None


def test_enregistrer_hypotheses_et_elements(projet):
    v = ch.vue(projet)
    assert not v["existe"] and v["chiffrage"]["tjm"] is None
    assert v["elements"][0]["ecrans"] > 0 and sum(x["flux"] for x in v["elements"]) == 2
    c = ch.enregistrer(projet, {"tjm": "620", "duree_sprint": 1, "profils": [{"nom": "PO", "jours_par_sprint": 5}],
                                "phases": [{"nom": "MVP \u2014 premier lot", "modalite": "sprints", "sprints": 2}, {"id": "mvp", "nom": "Bis", "modalite": "forfait", "jours": 3}],
                                "annonce": ["mvp", "inconnue"]})
    assert c["tjm"] == 620 and c["phases"][0]["id"] == "mvp-premier-lot" and c["phases"][1]["id"] == "mvp" and c["annonce"] == ["mvp"]
    assert "\u2014" not in c["phases"][0]["nom"]
    ch.enregistrer(projet, ch.lire(projet))  # relu depuis le fichier : la date de mise à jour repasse
    ch.garder_defaut(projet)
    assert ch.defaut()["tjm"] == 620
    with pytest.raises(ErreurAvantProjet):
        ch.enregistrer(projet, {"phases": [{"nom": "x", "modalite": "gratuit"}]})


def test_proposition(projet):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        vus.append(options.system_prompt)
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps({"phases": PHASES[:2] + [{"nom": "x", "modalite": "inconnue"}], "annonce": ["cadrage", "mvp"],
                                                   "profils": [{"nom": "PO/UX", "jours_par_sprint": 5}], "a_confirmer": ["Équipe type"], "resume": "Deux phases."}))
    v = ch.proposer("p1", projet, requete=requete)
    assert "Taux journalier : non renseigné" in vus[0] and "flux externes" in vus[0]
    att = v["en_attente"]
    assert [p["id"] for p in att["chiffrage"]["phases"]] == ["cadrage", "mvp"] and att["chiffrage"]["profils"][0]["nom"] == "PO/UX"
    v = ch.garder("p1", projet)
    assert v["existe"] and v["en_attente"] is None and v["chiffrage"]["annonce"] == ["cadrage", "mvp"]
