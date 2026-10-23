"""Flux externes : chargement, contrôles, références, contexte, vue et écriture."""

import shutil
from pathlib import Path

import pytest

from referentiel.api import vue_flux
from referentiel.backlog import impact
from referentiel.chargement import charger
from referentiel.contexte import generer_contexte
from referentiel.controles import analyser
from referentiel.ecriture import ErreurEcriture, enregistrer_element, references, supprimer_element

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_flux_de_l_exemple():
    p = charger(FRET)
    assert not p.erreurs and set(p.flux) == {"FLX-001", "FLX-002"}
    trous = {t.id for t in analyser(p)}
    assert "FLUX_SANS_ERREUR:FLX-002" in trous and "FLUX_SANS_ERREUR:FLX-001" not in trous
    assert not any(t.startswith("REFERENCE_INCONNUE:FLX") for t in trous)
    assert any(r["id"] == "FLX-001" for r in references(p, "TR-VALIDER-DOCS"))
    ctx = generer_contexte(p)
    assert "## Flux externes" in ctx and "Douane (DELTA G)" in ctx and "Valider les documents" in ctx
    v = vue_flux(p)
    f1 = next(f for f in v["flux"] if f["id"] == "FLX-001")
    assert f1["application_nom"] == "Portail fret" and f1["declencheur_texte"].startswith("Quand « Valider les documents »")
    assert v["partenaires"] == ["Douane (DELTA G)", "ERP comptable du client"]
    # L'analyse d'impact d'une évolution qui touche l'objet remonte ses flux.
    el = {x["id"]: x for x in impact(FRET, [{"id": "ENT-EXPEDITION", "changement": "x"}])["elements"]}
    assert el["FLX-001"]["onglet"] == "flux" and el["FLX-001"]["genre_libelle"] == "Flux externe"


def test_ecrire_et_controler(projet):
    contenu = {"id": "FLX-003", "nom": "Suivi GPS", "sens": "entrant", "partenaire": "Boîtier télématique",
               "application": "APP-INCONNUE", "declencheur": {"genre": "planifie", "frequence": "toutes les 5 minutes"},
               "donnees": [{"entite": "ENT-EXPEDITION", "attributs": ["position"]}], "erreurs": "On garde la dernière position."}
    enregistrer_element(projet, "flux", contenu, "Wanda", "Création")
    trous = {t.id for t in analyser(charger(projet))}
    assert "REFERENCE_INCONNUE:FLX-003:application:APP-INCONNUE" in trous
    assert "REFERENCE_INCONNUE:FLX-003:donnees.attributs:ENT-EXPEDITION.position" in trous
    with pytest.raises(Exception):
        enregistrer_element(projet, "flux", {"id": "FLX-004", "nom": "x", "sens": "partout", "partenaire": "y"}, "W", "Création")
    # Une règle citée par un flux ne se supprime pas tant qu'il la cite.
    contenu = {**contenu, "application": "APP-PORTAIL", "regles": ["RG-001"], "donnees": [{"entite": "ENT-EXPEDITION"}]}
    enregistrer_element(projet, "flux", contenu, "Wanda", "Mise à jour")
    with pytest.raises(ErreurEcriture, match="Suivi GPS"):
        supprimer_element(projet, "RG-001")
    supprimer_element(projet, "FLX-003")
    assert "FLX-003" not in charger(projet).flux
