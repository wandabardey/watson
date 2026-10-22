"""Évolutions rattachées à une version cible, et correspondance entre versions de code et versions de spec."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from referentiel import evolutions, livraisons, versions
from referentiel.chargement import charger
from referentiel.mcp_serveur import appeler_outil
from referentiel.versions import ErreurVersion

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def git(depot, *args):
    subprocess.run(["git", "-C", str(depot), "-c", "user.name=Test", "-c", "user.email=t@t", *args], check=True, capture_output=True)


@pytest.fixture()
def projet(tmp_path):
    depot = tmp_path / "depot"
    racine = depot / "referentiel" / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    git(depot, "init", "-q", "-b", "main")
    git(depot, "config", "user.email", "t@t")
    git(depot, "add", "-A")
    git(depot, "commit", "-qm", "base")
    git(depot, "tag", "-a", "spec-1.0", "-m", "Première version")
    versions._cache.clear()
    return racine


def appel(projet, outil, **args):
    r = appeler_outil(outil, {"projet": str(projet), **args})
    assert not r["isError"], r["content"][0]["text"]
    t = r["content"][0]["text"]
    return json.loads(t) if t[:1] in "{[" else t


def test_evolution_ciblee_integree_au_bon_moment(projet):
    a = appel(projet, "creer_evolution", nom="Tolérance de créneau", cible="1.1", auteur="Wanda Bardey")
    b = appel(projet, "creer_evolution", nom="Litiges", cible="plus tard", auteur="Wanda Bardey")
    assert a["id"] == "tolerance-de-creneau" and b["cible"] == "plus tard"

    # Écrire dans l'évolution ne touche pas la version de travail.
    rg3 = (projet / "regles" / "RG-003.yaml").read_text(encoding="utf-8").replace("2 heures", "3 heures")
    appel(projet, "enregistrer_element", type="regle", contenu=rg3, auteur="Wanda Bardey",
          changement="Tolérance portée à 3 heures", evolution=a["id"])
    assert "2 heures" in charger(projet).regles["RG-003"]["enonce"]
    lu = appel(projet, "lire_element", id="RG-003", evolution=a["id"])
    assert "3 heures" in lu["element"]["enonce"]
    evs = {e["id"]: e for e in appel(projet, "lister_evolutions")["evolutions"]}
    assert [(c["id"], c["changement"]) for c in evs[a["id"]]["changements"]] == [("RG-003", "modifié")]

    # Une évolution ciblée mais pas validée bloque la version.
    r = appeler_outil("figer_version", {"projet": str(projet), "version": "1.1", "message": "x", "auteur": "W"})
    assert r["isError"] and "sans être validées" in r["content"][0]["text"]

    appel(projet, "valider_evolution", id=a["id"], auteur="Wanda Bardey")
    v = appel(projet, "figer_version", version="1.1", message="Tolérance de 3 heures", auteur="Wanda Bardey")
    assert v["evolutions_integrees"] == ["Tolérance de créneau"] and v["evolutions_en_attente"] == ["Litiges (plus tard)"]
    assert "3 heures" in charger(projet).regles["RG-003"]["enonce"]
    assert "3 heures" in versions.charger_version(projet, "1.1").regles["RG-003"]["enonce"]
    statuts = {e["id"]: e["statut"] for e in evolutions.lister(projet)}
    assert statuts == {a["id"]: "integree", b["id"]: "en_cours"}
    with pytest.raises(ErreurVersion, match="déjà intégrée"):
        evolutions.chemin(projet, a["id"])


def test_decaler_une_evolution(projet):
    e = evolutions.creer(projet, "Relance des grands comptes", "1.1", "W")
    evolutions.cibler(projet, e["id"], "plus tard", "W")
    v = evolutions.figer(projet, "1.1", "Sans la relance", "W")
    assert v["evolutions_integrees"] == [] and v["evolutions_en_attente"] == ["Relance des grands comptes (plus tard)"]
    with pytest.raises(ErreurVersion, match="numéro"):
        evolutions.cibler(projet, e["id"], "bientôt", "W")


def _depot_code(chemin: Path, livraisons_: list[tuple[str, str | None, str]]):
    chemin.mkdir(parents=True)
    git(chemin, "init", "-q")
    for tag, fichier, message in livraisons_:
        (chemin / "app.txt").write_text(tag, encoding="utf-8")
        if fichier:
            (chemin / "REFERENTIEL.md").write_text(fichier, encoding="utf-8")
        git(chemin, "add", "-A")
        git(chemin, "commit", "-qm", tag)
        git(chemin, "tag", "-a", tag, "-m", message)


def test_correspondance_code_et_spec(projet, tmp_path):
    # Spec 1.1 : nouvelle règle d'annulation, qui ne concerne que le Portail.
    rg7 = projet / "regles" / "RG-007.yaml"
    rg7.write_text(rg7.read_text(encoding="utf-8") + "applications: [PORTAIL]\n", encoding="utf-8")
    ent = projet / "entites" / "ENT-EXPEDITION.yaml"
    ent.write_text(ent.read_text(encoding="utf-8").replace("    regles: [RG-006]", "    regles: [RG-006]\n    applications: [PORTAIL]"), encoding="utf-8")
    (projet / "projet.yaml").write_text((projet / "projet.yaml").read_text(encoding="utf-8") + (
        "applications:\n"
        "  - {id: PORTAIL, nom: Portail Fret, depot: ../../../portail}\n"
        "  - {id: APP, nom: App Transporteur, depot: ../../../app}\n"), encoding="utf-8")
    (projet / "versions.yaml").write_text(
        "environnements:\n"
        "  production: {spec: '1.1', applications: {Portail Fret: 2.3.0, App Transporteur: 1.7.0}}\n"
        "  recette: {spec: '1.1', applications: {Portail Fret: 2.2.0}}\n", encoding="utf-8")
    git(projet, "add", "-A")
    git(projet, "commit", "-qm", "1.1")
    git(projet, "tag", "-a", "spec-1.1", "-m", "Annulation au brouillon")
    versions._cache.clear()

    marque = lambda v: f"<!-- referentiel: FRET-DEMO spec {v} -->\n# Référentiel métier\n"
    _depot_code(tmp_path / "portail", [("v2.2.0", marque("1.0"), "Livraison"), ("v2.3.0", marque("1.1"), "Livraison")])
    _depot_code(tmp_path / "app", [("v1.7.0", None, "Livraison conforme à la spec 1.0")])

    c = livraisons.correspondance(projet)
    assert [(l["version"], l["spec"], l["source"]) for l in c["livraisons"]["Portail Fret"]] == [("2.2.0", "1.0", "fichier"), ("2.3.0", "1.1", "fichier")]
    assert c["livraisons"]["App Transporteur"][0]["spec"] == "1.0"
    prod = {l["application"]: l for l in c["environnements"]["production"]["applications"]}
    assert prod["Portail Fret"]["etat"] == "à jour"
    assert prod["App Transporteur"]["etat"] == "conforme"  # la 1.1 ne change rien côté App
    assert c["environnements"]["production"]["complet"]
    rec = c["environnements"]["recette"]["applications"][0]
    assert rec["etat"] == "en retard" and "RG-007" in {x["id"] for x in rec["changements"]}
    assert appel(projet, "correspondance")["environnements"]["recette"]["complet"] is False


def test_le_fichier_de_reference_porte_la_marque():
    from referentiel.contexte import generer_contexte

    p = charger(FRET)
    p.meta = {**p.meta, "version": "1.5"}
    assert generer_contexte(p).splitlines()[0] == "<!-- referentiel: FRET-DEMO spec 1.5 -->"
