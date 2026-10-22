"""Ateliers client : créer, préparer le kit, noter la séance, rédiger le compte rendu, l'envoyer dans Alimenter."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import ateliers as at
from referentiel import sujets
from referentiel.chargement import charger
from referentiel.controles import analyser

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"

KIT = {"objectifs": ["Trancher le délai de litige", "Connaître les volumes"],
       "trame": [{"sequence": "Tour de table", "duree": 10}, {"sequence": "Arbitrage du délai", "duree": 30, "support": "SCN-001"}],
       "themes": [{"theme": "Litiges", "questions": [{"texte": "Quel délai pour signaler un litige ?", "prioritaire": True, "source": "Q-001"},
                                                      {"texte": "Qui valide un litige ?", "source": "base"}]},
                  {"theme": "Volumes", "questions": [{"texte": "Combien d'expéditions par jour ?", "source": "grille"}]}],
       "hypotheses": [{"texte": "Le transporteur signale le litige", "consequence": "Sinon un écran de plus"}],
       "decisions": [{"sujet": "Délai de litige", "qui": "Directrice des opérations", "options": [{"option": "3 jours"}, {"option": "5 jours ouvrés"}, {"option": "Sans délai"}]}],
       "supports": [{"nom": "Parcours d'expédition", "type": "scenario", "ref": "SCN-001"}],
       "vigilance": ["Ne pas promettre la date de livraison"], "preparation_client": [{"quoi": "Volumes 2025", "qui": "Client"}]}
CR = {"resume": "Délai tranché.", "objectifs": [{"objectif": "Trancher le délai de litige", "atteint": "oui"}],
      "decisions": [{"decision": "Cinq jours ouvrés", "par": "Directrice"}], "actions": [{"action": "Envoyer les volumes", "porteur": "Client"}],
      "reponses": [{"question": "Quel délai ?", "reponse": "Cinq jours ouvrés", "sujet": "Q-001"}], "texte": "# Compte rendu\nCinq jours ouvrés."}


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


def test_du_kit_au_compte_rendu(projet):
    sujets.ajouter(projet, "Quel délai pour signaler un litige ?", "", "Wanda")
    a = at.creer(projet, {"titre": "Atelier de cadrage — litiges", "type": "cadrage", "duree_min": 90,
                          "participants": [{"nom": "Claire", "role": "Directrice des opérations", "decideur": True}, {"role": "sans nom"}]})
    assert a["id"] == "atelier-de-cadrage-litiges" and len(a["participants"]) == 1
    assert at.creer(projet, {"titre": "Atelier de cadrage — litiges", "type": "cadrage"})["id"] == "atelier-de-cadrage-litiges-2"
    requete, vus = faux_claude(KIT)
    a = at.preparer("fret", projet, a["id"], "Insister sur les litiges", requete=requete)
    systeme, message = vus[0]
    assert "Insister sur les litiges" in systeme and "Claire" in systeme and "Q-001" in message and "SCN-001" in message
    assert [q["id"] for th in a["kit"]["themes"] for q in th["questions"]] == ["q1", "q2", "q3"]
    assert "—" not in (projet / "ateliers" / f"{a['id']}.yaml").read_text(encoding="utf-8")
    # La séance : les notes restent sur ce poste jusqu'à la fin.
    at.noter("fret", a["id"], {"cochees": ["q1"], "notes": {"q1": "Cinq jours ouvrés"}, "decisions": {"0": "Cinq jours ouvrés"}, "libres": "RAS"})
    assert at.vue("fret", projet, a["id"])["notes"]["notes"]["q1"] == "Cinq jours ouvrés"
    a = at.terminer("fret", projet, a["id"])
    assert a["statut"] == "tenu" and a["seance"]["cochees"] == ["q1"]
    requete, vus = faux_claude(CR)
    a = at.rediger_cr("fret", projet, a["id"], "Transcription : on part sur cinq jours.", requete=requete)
    assert a["statut"] == "restitue" and a["compte_rendu"]["reponses"][0]["sujet"] == "Q-001"
    assert "Quel délai pour signaler un litige ? [Q-001] : Cinq jours ouvrés" in vus[0][1] and "Délai de litige : Cinq jours ouvrés" in vus[0][1]
    # Le dépôt reste lisible, et les ateliers ne créent pas de faux manques.
    assert len(analyser(charger(projet))) == len(analyser(charger(FRET)))
    liste = at.vue("fret", projet)["ateliers"]
    assert {x["id"] for x in liste} == {"atelier-de-cadrage-litiges", "atelier-de-cadrage-litiges-2"}


def test_erreurs(projet):
    with pytest.raises(at.ErreurAtelier):
        at.creer(projet, {"titre": "", "type": "cadrage"})
    with pytest.raises(at.ErreurAtelier):
        at.creer(projet, {"titre": "x", "type": "fete"})
    with pytest.raises(at.ErreurAtelier):
        at.lire(projet, "../secret")
    a = at.creer(projet, {"titre": "Revue", "type": "maquettes"})
    with pytest.raises(at.ErreurAtelier):
        at.rediger_cr("fret", projet, a["id"], "")
    with pytest.raises(at.ErreurAtelier):
        at.vers_alimenter("fret", projet, a["id"])
    at.supprimer(projet, a["id"])
    assert at.vue("fret", projet)["ateliers"] == []
