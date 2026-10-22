"""Évolutions : création, rédaction par Watson, analyse d'impact par la traçabilité à l'envers."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import backlog as ev
from referentiel.chargement import charger
from referentiel.controles import analyser

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
REDACTION = {"titre": "Délai de litige en jours ouvrés",
             "constat": "Un litige livré le vendredi soir est perdu — le délai court le week-end.",
             "attendu": ["Compter le délai en jours ouvrés", "Afficher la date limite sur la livraison"],
             "regles": ["Le délai est de cinq jours ouvrés"],
             "criteres": [{"etant_donne": "une livraison le vendredi", "lorsque": "le transporteur signale le mardi", "alors": "le litige est accepté", "cas": "nominal"},
                          {"etant_donne": "une livraison le lundi", "lorsque": "il signale le mardi suivant", "alors": "le litige est refusé", "cas": "limite"}],
             "touches": [{"id": "RG-005", "changement": "cinq jours ouvrés"}, {"id": "RG-999", "changement": "inventé"}],
             "oublis": ["Le mail de refus cite le délai"], "consigne_base": "Passe RG-005 à cinq jours ouvrés.", "questions": ["Quels jours fériés ?"]}


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    return racine


def faux_claude(reponse):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        vus.append((options.system_prompt, prompt))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps(reponse))

    return requete, vus


def test_creer_rediger_et_impact(projet):
    e = ev.creer(projet, {"titre": "Litiges du week-end", "besoin": "Les transporteurs perdent les litiges du vendredi.", "priorite": "haute"}, "Wanda")
    assert e["id"] == "EVO-001" and e["statut"] == "a_qualifier"
    assert ev.creer(projet, {"titre": "Autre"}, "Wanda")["id"] == "EVO-002"
    requete, vus = faux_claude(REDACTION)
    e = ev.rediger("fret", projet, "EVO-001", "Insister sur les fériés", requete=requete)
    systeme, message = vus[0]
    assert "Insister sur les fériés" in systeme and "perdent les litiges" in message and not message.split("# Base du projet\n")[1].startswith("(")
    assert e["statut"] == "prete" and e["titre"] == "Délai de litige en jours ouvrés"
    assert e["redaction"]["inconnus"] == ["RG-999"] and "—" not in e["redaction"]["constat"]
    el = {x["id"]: x for x in e["impact"]["elements"]}
    assert el["RG-005"]["niveau"] == "direct" and el["SCR-014"]["niveau"] == "cite" and el["ENT-EXPEDITION"]["onglet"] == "referentiels"
    assert any(x["genre"] == "Scénario" for x in e["impact"]["a_rejouer"]) or any(x["id"] == "RG-005" for x in e["impact"]["a_rejouer"])
    # Les évolutions ne gênent pas la lecture de la base.
    assert len(analyser(charger(projet))) == len(analyser(charger(FRET)))
    v = ev.vue(projet)
    assert [x["id"] for x in v["evolutions"]] == ["EVO-001", "EVO-002"] and v["evolutions"][0]["redigee"]


def test_modifier_statut_base_et_erreurs(projet):
    e = ev.creer(projet, {"titre": "X"}, "W")
    e = ev.modifier(projet, e["id"], {"statut": "en_cours", "priorite": "basse", "lot": "lot-1"})
    assert e["statut"] == "en_cours" and e["base"] == {"lot": "lot-1", "etat": "proposee"}
    assert ev.modifier(projet, e["id"], {"base_appliquee": True, "statut": "inconnu"})["base"]["etat"] == "appliquee"
    with pytest.raises(ev.ErreurEvolution):
        ev.creer(projet, {"titre": " "}, "W")
    with pytest.raises(ev.ErreurEvolution):
        ev.lire(projet, "../x")
    ev.supprimer(projet, e["id"])
    assert ev.vue(projet)["evolutions"] == []
