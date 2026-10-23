"""Spec d'une évolution travaillée sur une branche : création, changements, validation, fusion, conflit."""

import shutil
from pathlib import Path

import pytest

from referentiel import backlog
from referentiel import branches_spec as bs
from referentiel.chargement import charger

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    from dulwich import porcelain

    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "base"
    shutil.copytree(FRET, racine / "fret", ignore=shutil.ignore_patterns("sortie", "recette"))
    repo = porcelain.init(str(racine))
    porcelain.add(repo, [str(p) for p in (racine / "fret").rglob("*") if p.is_file()])
    porcelain.commit(repo, b"init", author=b"t <t@t>", committer=b"t <t@t>")
    projet = racine / "fret"
    e = backlog.creer(projet, {"titre": "Plusieurs colis", "besoin": "Saisir plusieurs colis"}, "Wanda")
    return projet, e["id"], repo


def commit(repo, racine, msg=b"m"):
    from dulwich import porcelain
    from referentiel import depot

    depot.enregistrer(racine, msg.decode(), "t", "t@t")


def test_branche_changements_validation_fusion(projet):
    racine, eid, repo = projet
    commit(repo, racine)
    e = backlog.brancher(racine, eid)
    assert e["branche"]["nom"] == f"evo/{eid}" and e["statut"] == "en_cours"
    commit(repo, racine)
    with pytest.raises(backlog.ErreurEvolution):
        backlog.brancher(racine, eid)
    # Un changement sur la branche, sans toucher à la version de travail.
    d = bs.dossier("p", racine, eid)
    f = d / "ecrans" / "SCR-001.yaml"
    f.write_text(f.read_text().replace("nom: Saisie d'une expédition", "nom: Saisie d'une expédition multi-colis"))
    assert bs.enregistrer(racine, eid, d, "multi-colis", "Wanda") is not None
    assert bs.enregistrer(racine, eid, bs.dossier("p", racine, eid), "rien", "Wanda") is None
    assert "multi-colis" not in (racine / "ecrans" / "SCR-001.yaml").read_text()
    v = backlog.vue(racine, eid)["branche"]
    assert v["commits"] == 1 and [c["id"] for c in v["changements"]] == ["SCR-001"]
    # Pendant ce temps, la version de travail bouge ailleurs.
    g = racine / "ecrans" / "SCR-002.yaml"
    g.write_text(g.read_text() + "\n# note\n")
    commit(repo, racine)
    with pytest.raises(backlog.ErreurEvolution):
        backlog.fusionner_branche(racine, eid)
    backlog.valider_branche(racine, eid, "Wanda")
    commit(repo, racine)
    e = backlog.fusionner_branche(racine, eid)
    assert e["fichiers"] == 1 and e["branche"]["statut"] == "integree" and e["base"]["etat"] == "appliquee"
    assert "multi-colis" in (racine / "ecrans" / "SCR-001.yaml").read_text()
    assert "# note" in g.read_text()
    assert not charger(racine).erreurs


def test_conflit(projet):
    racine, eid, repo = projet
    backlog.brancher(racine, eid)
    commit(repo, racine)
    d = bs.dossier("p", racine, eid)
    (d / "ecrans" / "SCR-001.yaml").write_text((d / "ecrans" / "SCR-001.yaml").read_text() + "\n# branche\n")
    bs.enregistrer(racine, eid, d, "b", "Wanda")
    f = racine / "ecrans" / "SCR-001.yaml"
    f.write_text(f.read_text() + "\n# travail\n")
    commit(repo, racine)
    backlog.valider_branche(racine, eid, "Wanda")
    with pytest.raises(backlog.ErreurEvolution, match="SCR-001"):
        backlog.fusionner_branche(racine, eid)
    assert "# branche" not in f.read_text()
    backlog.abandonner_branche(racine, eid)
    assert backlog.lire(racine, eid)["branche"]["statut"] == "abandonnee"
    backlog.brancher(racine, eid)
