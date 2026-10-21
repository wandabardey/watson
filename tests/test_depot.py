"""Synchronisation du dépôt de connaissance sans le programme git (application de bureau)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

pytest.importorskip("dulwich")

from referentiel import depot, versions  # noqa: E402
from referentiel.chargement import charger  # noqa: E402

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def git(d, *a):
    subprocess.run(["git", "-C", str(d), "-c", "user.name=T", "-c", "user.email=t@t", *a], check=True, capture_output=True)


@pytest.fixture()
def distant(tmp_path):
    """Un dépôt « GitHub » simulé par un dépôt nu local, contenant le projet fret à la racine."""
    source = tmp_path / "source"
    shutil.copytree(FRET, source, ignore=shutil.ignore_patterns("sortie", "recette"))
    git(source, "init", "-q", "-b", "main")
    git(source, "add", "-A")
    git(source, "commit", "-qm", "Projet fret")
    nu = tmp_path / "distant.git"
    subprocess.run(["git", "clone", "-q", "--bare", str(source), str(nu)], check=True)
    return nu


def test_cloner_modifier_envoyer_recuperer(distant, tmp_path, monkeypatch):
    monkeypatch.setenv("REFERENTIEL_GIT", "dulwich")
    a, b = tmp_path / "poste-a", tmp_path / "poste-b"
    depot.cloner(str(distant), a)
    depot.cloner(str(distant), b)
    assert charger(a).regles["RG-003"]["statut"] == "validee"

    rg3 = a / "regles" / "RG-003.yaml"
    rg3.write_text(rg3.read_text(encoding="utf-8").replace("2 heures", "3 heures"), encoding="utf-8")
    (a / "regles" / "RG-005.yaml").unlink()
    assert sorted(depot.modifications(a)) == ["regles/RG-003.yaml", "regles/RG-005.yaml"]
    assert depot.enregistrer(a, "Tolérance de 3 heures", "Wanda Bardey", "wanda@4sh.fr")
    assert depot.modifications(a) == [] and depot.enregistrer(a, "rien", "W") is None
    depot.envoyer(a)

    assert depot.recuperer(b) == "mis_a_jour"
    assert "3 heures" in charger(b).regles["RG-003"]["enonce"] and "RG-005" not in charger(b).regles
    assert depot.recuperer(b) == "inchange"
    log = subprocess.run(["git", "-C", str(distant), "log", "-1", "--format=%an %ae %s"], capture_output=True, text=True).stdout
    assert log.strip() == "Wanda Bardey wanda@4sh.fr Tolérance de 3 heures"


def test_version_figee_et_envoyee(distant, tmp_path, monkeypatch):
    monkeypatch.setenv("REFERENTIEL_GIT", "dulwich")
    a = tmp_path / "poste-a"
    depot.cloner(str(distant), a)
    versions._cache.clear()
    v = versions.figer_version(a, "1.0", "Première version", "Wanda Bardey")
    assert v["version"] == "1.0" and v["auteur"] == "Wanda Bardey" and v["message"] == "Première version"
    depot.envoyer(a)
    tags = subprocess.run(["git", "-C", str(distant), "tag", "-n1"], capture_output=True, text=True).stdout
    assert "spec-1.0" in tags and "Première version" in tags
    assert versions.charger_version(a, "1.0").regles


def test_sans_depot():
    with pytest.raises(depot.ErreurDepot):
        depot.prefixe(Path("/"))
