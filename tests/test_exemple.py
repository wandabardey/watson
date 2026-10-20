from __future__ import annotations

import shutil
from pathlib import Path

from referentiel._vendor import yaml

from referentiel.chargement import charger
from referentiel.controles import analyser
from referentiel.impact import analyser_impact

EXEMPLE = Path(__file__).parent.parent / "exemples" / "fret"


def ids_ouverts(p):
    return {t.id for t in analyser(p) if t.statut == "ouvert"}


def test_structure_valide():
    assert charger(EXEMPLE).erreurs == []


def test_trous_attendus():
    ids = ids_ouverts(charger(EXEMPLE))
    attendus = {
        "STATUT_SANS_SORTIE:ENT-EXPEDITION:LITIGE",
        "TRANSITION_SANS_REGLE:TR-VALIDER-CONTROLE",
        "TRANSITION_SANS_ACTEUR:TR-RELANCER",
        "TABLE_INCOMPLETE:RG-002:document_douanier=refuse",
        "TABLE_INCOMPLETE:RG-002:document_douanier=manquant,client_grand_compte=non",
        "REGLE_OBSOLETE_UTILISEE:RG-006",
        "ACTEUR_NON_AUTORISE:UC-001:TR-LIVRER:ACT-EXPEDITEUR",
        "REGLE_SANS_SOURCE:RG-003",
        "ACTEUR_SANS_ACTION:ACT-COMPTABLE",
        "CAPTURE_A_VERIFIER:SCR-002:captures/SCR-002-expediteur.png",
    }
    assert attendus <= ids


def test_trou_assume_n_est_plus_ouvert():
    trous = {t.id: t for t in analyser(charger(EXEMPLE))}
    assert trous["STATUT_INATTEIGNABLE:ENT-EXPEDITION:ARCHIVEE"].statut == "hors_perimetre"


def test_table_contradictoire_et_correction(tmp_path):
    projet = tmp_path / "fret"
    shutil.copytree(EXEMPLE, projet)
    rg = yaml.safe_load((projet / "regles" / "RG-002.yaml").read_text(encoding="utf-8"))
    # Contradiction : valide + dangereuse donne deux résultats
    rg["lignes"].append({"si": {"document_douanier": "valide"}, "alors": "TR-VALIDER-DOCS"})
    (projet / "regles" / "RG-002.yaml").write_text(yaml.safe_dump(rg, allow_unicode=True), encoding="utf-8")
    ids = ids_ouverts(charger(projet))
    assert any(i.startswith("TABLE_CONTRADICTOIRE:RG-002:document_douanier=valide,marchandise_dangereuse=oui") for i in ids)

    # Correction de la règle obsolète : on rattache TR-ANNULER à RG-007
    ent_f = projet / "entites" / "ENT-EXPEDITION.yaml"
    ent_f.write_text(ent_f.read_text(encoding="utf-8").replace("regles: [RG-006]", "regles: [RG-007]"), encoding="utf-8")
    ids = ids_ouverts(charger(projet))
    assert "REGLE_OBSOLETE_UTILISEE:RG-006" not in ids
    assert "REGLE_NON_RATTACHEE:RG-007" not in ids


def test_impact_regle():
    imp = analyser_impact(charger(EXEMPLE), "RG-002")
    assert imp["transitions"] == ["TR-ENVOYER-CONTROLE", "TR-RELANCER", "TR-VALIDER-DOCS"]
    assert imp["cas_usage"] == ["UC-001"]
    assert imp["captures"] == ["SCR-002:captures/SCR-002-expediteur.png"]
