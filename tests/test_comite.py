"""Comité d'experts : casting, avis en parallèle, débat, synthèse, journal et comité du projet."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import comite as co

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    return racine


def faux_claude():
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        sp = options.system_prompt
        vus.append(sp)
        if "montes le comité" in sp:
            r = {"membres": [{"id": "Métier", "nom": "Claire Morel", "role": "Experte fret", "portrait": "20 ans de transit.", "mandat": "règles du secteur"},
                             {"id": "dev", "nom": "Hugo Lenoir", "role": "Développeur senior", "portrait": "x", "mandat": "faisabilité"},
                             {"id": "ux", "nom": "Inès Garnier", "role": "Product Owner UX", "portrait": "x", "mandat": "parcours"}]}
        elif "Tour contradictoire" in sp:
            r = {"position": "nuance", "reponse": "D'accord avec B, sauf sur le délai."}
        elif "facilitateur" in sp:
            r = {"recommandation": "Passer le délai à cinq jours ouvrés \u2014 et le dire au transporteur.", "consensus": ["Délai trop court"],
                 "desaccords": [{"sujet": "Jours ouvrés", "positions": "A pour, B contre", "arbitrage": "ouvrés"}],
                 "actions": [{"texte": "Modifier la règle", "source": "métier, dev", "confiance": "haute"}],
                 "consigne_watson": "Remplace la règle du délai de litige : cinq jours ouvrés."}
        else:
            r = {"avis": "Le délai de trois jours est irréaliste.", "risques": [{"risque": "Litiges perdus", "gravite": "forte"}],
                 "recommandations": ["Cinq jours ouvrés"], "confiance": "haute"}
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s", result=json.dumps(r))

    return requete, vus


def test_seance_standard_puis_journal_et_panel(projet):
    requete, vus = faux_claude()
    s = co.evaluer("fret", projet, {"type": "regle", "id": "RG-005"}, "Ce délai tient-il ?", "standard", requete=requete, attendre=True)
    s = co.lire_seance("fret", s["id"])
    assert s["etat"] == "fini" and [m["id"] for m in s["membres"]] == ["m_tier", "dev", "ux"]
    assert set(s["avis"]) == {"m_tier", "dev", "ux"} and set(s["debat"]) == set(s["avis"])
    assert "\u2014" not in s["synthese"]["recommandation"] and s["cible"]["nom"] == "Délai de signalement d'un litige"
    assert sum("Tu es Claire Morel" in v for v in vus) == 2  # son avis, puis son tour de débat
    assert len(vus) == 1 + 3 + 3 + 1
    co.noter("fret", projet, s["id"], "retenue", "On le fait", "Wanda")
    d = co.garder_panel("fret", projet, s["id"])
    assert d["journal"][0]["decision"] == "retenue" and d["membres"][0]["nom"] == "Claire Morel"
    # Séance suivante avec le comité du projet : pas de casting, les décisions passées sont données aux experts.
    requete2, vus2 = faux_claude()
    co.evaluer("fret", projet, {"type": "scenario", "id": "SCN-001"}, "", "standard", utiliser_comite=True, requete=requete2, attendre=True)
    assert not any("montes le comité" in v for v in vus2) and any("Délai de signalement" in v and "Recommandation retenue" in v for v in vus2)


def test_express_et_erreurs(projet):
    requete, vus = faux_claude()
    s = co.evaluer("fret", projet, {"type": "ecran", "id": "SCR-002"}, "Lisible ?", "express", requete=requete, attendre=True)
    s = co.lire_seance("fret", s["id"])
    assert [m["id"] for m in s["membres"]] == ["designer", "metier"] and "debat" not in s and len(vus) == 3
    with pytest.raises(co.ErreurComite):
        co.evaluer("fret", projet, {"type": "regle", "id": "RG-999"}, "", "standard", requete=requete, attendre=True)
    with pytest.raises(co.ErreurComite):
        co.noter("fret", projet, s["id"], "peut-etre", "", "W")
    assert any(c["type"] == "regle" for c in co.cibles(projet))
