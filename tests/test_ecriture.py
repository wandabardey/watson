from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from referentiel.chargement import charger
from referentiel.ecriture import ErreurEcriture, decider_trou, enregistrer_element, remplacer_regle
from referentiel.mcp_serveur import traiter

EXEMPLE = Path(__file__).parent.parent / "exemples" / "fret"


@pytest.fixture
def projet(tmp_path):
    cible = tmp_path / "fret"
    shutil.copytree(EXEMPLE, cible, ignore=shutil.ignore_patterns("sortie"))
    return cible


def test_enregistrer_regle_ajoute_historique_et_resout_un_trou(projet):
    rg = charger(projet).regles["RG-003"]
    rg["source"] = "Atelier transport du 2026-10-05"
    bilan = enregistrer_element(projet, "regle", json.dumps(rg), "Wanda Bardey", "Ajout de la source")
    assert "REGLE_SANS_SOURCE:RG-003" in [t["id"] for t in bilan["trous_resolus"]]
    hist = charger(projet).regles["RG-003"]["historique"]
    assert hist[-1]["changement"] == "Ajout de la source" and len(hist) == 2


def test_rien_n_est_ecrit_si_invalide(projet):
    avant = (projet / "regles" / "RG-001.yaml").read_text(encoding="utf-8")
    with pytest.raises(ErreurEcriture):
        enregistrer_element(projet, "regle", "id: RG-001\ntitre: x\nstatut: validee\ntype: inconnu\nenonce: y", "W", "c")
    assert (projet / "regles" / "RG-001.yaml").read_text(encoding="utf-8") == avant


def test_reference_cassee_acceptee_mais_signalee(projet):
    # Une transition qui cite une règle inexistante n'empêche pas l'écriture, elle crée une erreur visible
    ent = charger(projet).entites["ENT-EXPEDITION"]
    ent["transitions"][0]["regles"].append("RG-999")
    bilan = enregistrer_element(projet, "entite", json.dumps(ent), "W", "test")
    assert any(t["id"].startswith("REFERENCE_INCONNUE") for t in bilan["trous_apparus"])


def test_remplacer_regle(projet):
    bilan = remplacer_regle(projet, "RG-006", "id: RG-020\ntitre: Annulation au brouillon\ntype: contrainte\nenonce: Annulation possible au brouillon uniquement.\nsource: Comité", "Wanda Bardey", "Frais d'annulation tardive")
    p = charger(projet)
    assert p.regles["RG-006"]["statut"] == "obsolete" and p.regles["RG-020"]["remplace"] == "RG-006"
    assert bilan["transitions_rattachees"] == ["TR-ANNULER"]
    assert "REGLE_OBSOLETE_UTILISEE:RG-006" in [t["id"] for t in bilan["trous_resolus"]]


def test_decider_trou(projet):
    bilan = decider_trou(projet, "ACTEUR_SANS_ACTION:ACT-COMPTABLE", "hors_perimetre", "Lot 3", "Wanda Bardey")
    assert bilan["trous_resolus"][0]["id"] == "ACTEUR_SANS_ACTION:ACT-COMPTABLE"
    with pytest.raises(ErreurEcriture):
        decider_trou(projet, "TROU:INEXISTANT", "hors_perimetre", "x", "y")


def test_protocole_mcp(projet):
    init = traiter({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
    assert init["result"]["protocolVersion"] == "2025-06-18"
    assert traiter({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None
    outils = traiter({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]
    assert {"etat_projet", "lister_trous", "enregistrer_element"} <= {o["name"] for o in outils}
    rep = traiter({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                   "params": {"name": "rechercher", "arguments": {"projet": str(projet), "texte": "douane"}}})
    resultats = json.loads(rep["result"]["content"][0]["text"])["resultats"]
    assert "RG-002" in [r.get("id") for r in resultats]
