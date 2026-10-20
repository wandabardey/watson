"""Cas de test tirés de la base : proposition, enregistrement en brouillon, signalement quand une règle bouge."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from referentiel import recette as cas_test
from referentiel.chargement import charger
from referentiel.mcp_serveur import appeler_outil

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_seules_les_regles_validees_produisent_des_cas():
    r = cas_test.proposer(charger(FRET))
    ids = {c["id"] for c in r["cas"]}
    assert "CT-TR-SOUMETTRE-NOMINAL" in ids and "CT-TR-SOUMETTRE-DROITS" in ids
    assert not any("RG-005" in i or "TR-SIGNALER-LITIGE" in i for i in ids)  # règle encore proposée
    assert not any("RG-006" in c["id"] for c in r["cas"])  # règle obsolète
    attente = {e["element"]: e["raison"] for e in r["en_attente"]}
    assert "proposée" in attente["TR-SIGNALER-LITIGE"]


def test_table_de_decision_un_cas_par_ligne():
    r = cas_test.proposer(charger(FRET), "RG-002")
    lignes = [c for c in r["cas"] if c["type"] == "table"]
    assert len(lignes) == 3
    assert "Marchandise dangereuse : oui" in lignes[1]["etant_donne"] and "Contrôle sécurité" in lignes[1]["alors"]
    assert "reste à l'étape" in lignes[2]["alors"]


def test_remplacement_et_langage_metier():
    r = cas_test.proposer(charger(FRET), "RG-007")
    remp = next(c for c in r["cas"] if c["type"] == "remplacement")
    assert "plus en vigueur" in remp["alors"] and {s["id"] for s in remp["sources"]} == {"RG-007", "RG-006"}
    texte = cas_test.formater(cas_test.proposer(charger(FRET)))
    assert "—" not in texte and "–" not in texte and "uexpédition" not in texte
    droits = next(c for c in cas_test.proposer(charger(FRET))["cas"] if c["id"] == "CT-TR-LIVRER-DROITS")
    assert "le comptable" in droits["quand"] and "le transporteur" not in droits["quand"]


def test_enregistrer_sans_ecraser_puis_signaler(projet):
    p = charger(projet)
    r = cas_test.enregistrer(p, ["CT-TR-PRENDRE-EN-CHARGE-NOMINAL", "CT-RG-003-KO"], "Wanda Bardey")
    assert r["ecrits"] == ["CT-TR-PRENDRE-EN-CHARGE-NOMINAL", "CT-RG-003-KO"]
    fichier = projet / "recette" / "cas" / "CT-RG-003-KO.yaml"
    fichier.write_text(fichier.read_text(encoding="utf-8").replace("statut: brouillon", "statut: relu"), encoding="utf-8")
    assert cas_test.enregistrer(charger(projet), ["CT-RG-003-KO"], "X")["deja_presents"] == ["CT-RG-003-KO"]
    assert "statut: relu" in fichier.read_text(encoding="utf-8")
    assert cas_test.a_revoir(charger(projet)) == []
    rg3 = projet / "regles" / "RG-003.yaml"
    rg3.write_text(rg3.read_text(encoding="utf-8").replace("2 heures", "3 heures"), encoding="utf-8")
    signales = {c["id"]: c["raisons"] for c in cas_test.a_revoir(charger(projet))}
    assert set(signales) == {"CT-TR-PRENDRE-EN-CHARGE-NOMINAL", "CT-RG-003-KO"}
    assert "a changé" in signales["CT-RG-003-KO"][0]
    assert charger(projet).erreurs == []  # le dossier recette ne gêne pas le chargement


def test_outils_mcp(projet):
    r = appeler_outil("proposer_tests", {"projet": str(projet), "element": "TR-LIVRER"})
    assert not r["isError"] and "CT-TR-LIVRER-NOMINAL" in r["content"][0]["text"]
    r = appeler_outil("enregistrer_tests", {"projet": str(projet), "ids": ["CT-TR-LIVRER-NOMINAL"], "auteur": "W"})
    assert not r["isError"] and (projet / "recette" / "cas" / "CT-TR-LIVRER-NOMINAL.yaml").exists()
    r = appeler_outil("enregistrer_tests", {"projet": str(projet), "ids": ["CT-INCONNU"], "auteur": "W"})
    assert r["isError"]
    assert appeler_outil("cas_a_revoir", {"projet": str(projet)})["content"][0]["text"] == '{"a_revoir":[]}'
