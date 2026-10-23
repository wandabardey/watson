"""Avancement par écran : maquette, validation, branche de travail, code fusionné, livraison dans une version."""

import shutil
import subprocess
from pathlib import Path

import pytest

from referentiel import avancement as av
from referentiel import maquettes as mq
from referentiel.chargement import charger
from referentiel.ecriture import dump

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def git(d, *a):
    subprocess.run(["git", "-C", str(d), *a], check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
                        "PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": str(d)})


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    code = tmp_path / "portail"
    (code / "src" / "app" / "expedition").mkdir(parents=True)
    (code / "src" / "app" / "expedition" / "saisie-expedition.component.ts").write_text("// saisie")
    (code / "src" / "app" / "factures").mkdir(parents=True)
    (code / "src" / "app" / "factures" / "factures.page.ts").write_text("// factures")
    git(code, "init", "-q", "-b", "main")
    git(code, "add", ".")
    git(code, "commit", "-qm", "init")
    git(code, "tag", "v1.0.0")
    y = (racine / "projet.yaml").read_text().replace("{id: APP-PORTAIL, nom: Portail fret, support: web,", f"{{id: APP-PORTAIL, nom: Portail fret, support: web, depot: '{code}',")
    (racine / "projet.yaml").write_text(y)
    return racine, code


def test_etats_du_code(projet):
    racine, code = projet
    assert not charger(racine).erreurs
    v = {e["id"]: e for e in av.vue(racine)["ecrans"]}
    assert v["SCR-001"]["etat"] == "a_maquetter" and v["SCR-001"]["depot"]
    av.lier(racine, "SCR-001", ["./src/app/expedition/saisie-expedition.component.ts", "../hors.ts"], "expeditions/nouvelle")
    assert av.liens(racine)["SCR-001"] == {"fichiers": ["src/app/expedition/saisie-expedition.component.ts"], "route": "/expeditions/nouvelle"}
    assert not charger(racine).erreurs
    e = {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]
    assert e["etat"] == "livre" and e["code"]["livre_dans"] == "v1.0.0" and e["code"]["derniere_livree"] == "v1.0.0"
    # Modifié depuis la livraison, et une évolution sur une branche.
    (code / "src" / "app" / "expedition" / "saisie-expedition.component.ts").write_text("// saisie v2")
    git(code, "commit", "-qam", "plusieurs colis")
    git(code, "checkout", "-qb", "watson/colis")
    (code / "src" / "app" / "expedition" / "saisie-expedition.component.ts").write_text("// saisie v3")
    git(code, "commit", "-qam", "colis multiples")
    git(code, "checkout", "-q", "main")
    e = {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]
    assert e["etat"] == "livre"
    assert any("depuis la dernière livraison" in a for a in e["alertes"]) and any("watson/colis" in a for a in e["alertes"])
    # Un écran tout neuf, seulement sur une branche : travail local.
    git(code, "checkout", "-qb", "watson/recap")
    (code / "src" / "app" / "recap.page.ts").write_text("// recap")
    git(code, "add", ".")
    git(code, "commit", "-qm", "recap")
    git(code, "checkout", "-q", "main")
    av.lier(racine, "SCR-002", ["src/app/recap.page.ts"])
    e = {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-002"]
    assert e["etat"] == "en_cours" and e["code"]["branches"][0]["nom"] == "watson/recap"
    assert e["code"]["manquants"] == ["src/app/recap.page.ts"]


def test_maquette_puis_validation(projet):
    racine, _ = projet
    idx = mq.lire_index(racine)
    idx["maquettes"].append({"id": "saisie", "titre": "Saisie", "ecran": "SCR-001", "fichier": "saisie.html", "date": "2026-10-01"})
    mq._ecrire_index(racine, idx)
    assert {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]["etat"] == "maquette"
    mq.modifier(racine, "saisie", {"validee": True, "par": "Wanda"})
    e = {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]
    assert e["etat"] == "maquette_validee" and e["validee"]["validee_par"] == "Wanda"
    mq.modifier(racine, "saisie", {"validee": False})
    assert {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]["etat"] == "maquette"


def test_suggestions(projet):
    racine, _ = projet
    s = av.suggestions(racine, "SCR-001")
    assert s and s[0]["fichier"].endswith("saisie-expedition.component.ts")
    with pytest.raises(av.ErreurAvancement):
        av.lier(racine, "SCR-999", [])
