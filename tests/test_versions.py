"""Versions de la spec (étiquettes Git spec-X.Y), contexte compact, et leur usage par le serveur MCP et l'assistant."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from referentiel import assistant, versions
from referentiel.contexte import generer_contexte, taille
from referentiel.mcp_serveur import appeler_outil
from referentiel.versions import ErreurVersion

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def git(depot, *args):
    subprocess.run(["git", "-C", str(depot), "-c", "user.name=Test", "-c", "user.email=t@t", *args],
                   check=True, capture_output=True)


@pytest.fixture(autouse=True, params=["git", "dulwich"])
def acces_git(request, monkeypatch):
    """Chaque test tourne avec le programme git (plugin, ligne de commande) et avec Dulwich (application)."""
    if request.param == "dulwich":
        pytest.importorskip("dulwich")
        monkeypatch.setenv("REFERENTIEL_GIT", "dulwich")
    else:
        monkeypatch.delenv("REFERENTIEL_GIT", raising=False)
    versions._cache.clear()
    return request.param


@pytest.fixture()
def projet(tmp_path):
    """Dépôt avec le projet dans un sous-dossier : spec 1.0 (ancienne annulation), 1.1 (nouvelle), puis un changement en cours."""
    depot = tmp_path / "depot"
    racine = depot / "referentiel" / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    git(depot, "init", "-q")
    # Spec 1.0 : avant la décision du comité produit.
    (racine / "regles" / "RG-007.yaml").unlink()
    rg6 = (racine / "regles" / "RG-006.yaml").read_text(encoding="utf-8")
    (racine / "regles" / "RG-006.yaml").write_text(
        rg6.replace("statut: obsolete", "statut: validee").split("  - date: 2026-10-01")[0], encoding="utf-8")
    git(depot, "add", "-A")
    git(depot, "commit", "-qm", "1.0")
    git(depot, "tag", "-a", "spec-1.0", "-m", "Première version")
    # Spec 1.1 : la base de l'exemple telle quelle.
    shutil.rmtree(racine)
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    git(depot, "add", "-A")
    git(depot, "commit", "-qm", "1.1")
    git(depot, "tag", "-a", "spec-1.1", "-m", "Annulation au brouillon")
    # Version de travail : un changement pas encore figé, et les environnements.
    rg3 = racine / "regles" / "RG-003.yaml"
    rg3.write_text(rg3.read_text(encoding="utf-8").replace("2 heures", "3 heures"), encoding="utf-8")
    (racine / "versions.yaml").write_text(
        "environnements:\n  production:\n    spec: '1.0'\n    applications: {Portail Fret: 2.2.0}\n"
        "  recette:\n    spec: '1.1'\n", encoding="utf-8")
    versions._cache.clear()
    return racine


def test_lister_et_resoudre(projet):
    vs = versions.lister_versions(projet)
    assert [v["version"] for v in vs] == ["1.0", "1.1"]
    assert vs[1]["message"] == "Annulation au brouillon" and vs[0]["date"]
    assert versions.resoudre(projet, "production") == "1.0"
    assert versions.resoudre(projet, "spec-1.1") == "1.1"
    assert versions.resoudre(projet, None) == "travail"
    with pytest.raises(ErreurVersion, match="Versions figées : 1.0, 1.1"):
        versions.resoudre(projet, "2.0")


def test_charger_une_version_sans_toucher_aux_fichiers(projet):
    v10 = versions.charger_version(projet, "1.0")
    assert "RG-007" not in v10.regles and v10.regles["RG-006"]["statut"] == "validee"
    travail = versions.charger_version(projet)
    assert travail.regles["RG-006"]["statut"] == "obsolete" and "3 heures" in travail.regles["RG-003"]["enonce"]
    assert "2 heures" in versions.charger_version(projet, "1.1").regles["RG-003"]["enonce"]


def test_comparer(projet):
    c = versions.comparer(projet, "1.0", "1.1")
    par_id = {x["id"]: x for x in c["changements"]}
    assert par_id["RG-007"]["changement"] == "ajouté" and par_id["RG-007"]["remplace"] == "RG-006"
    assert par_id["RG-006"]["changement"] == "remplacé" and par_id["RG-006"]["remplace_par"] == "RG-007"
    assert "TR-ANNULER" not in par_id or par_id["TR-ANNULER"]["changement"] == "modifié"
    c2 = versions.comparer(projet, "1.1")
    assert [(x["id"], x["champs"]) for x in c2["changements"]] == [("RG-003", ["enonce"])]


def test_historique_element(projet):
    h = versions.historique_element(projet, "RG-007")
    assert [e.get("evenement") for e in h["versions"]] == [None, "apparu", None]
    assert h["environnements"]["production"]["present"] is False
    assert h["environnements"]["recette"]["identique_au_travail"] is True
    h3 = versions.historique_element(projet, "RG-003")
    assert h3["versions"][-1]["evenement"] == "modifié"


def test_figer(projet):
    with pytest.raises(ErreurVersion, match="pas encore enregistrés"):
        versions.figer_version(projet, "1.2", "Tolérance de 3 heures", "Wanda Bardey")
    git(projet, "add", "-A")
    git(projet, "commit", "-qm", "travail")
    with pytest.raises(ErreurVersion, match="existe déjà"):
        versions.figer_version(projet, "1.1", "x")
    with pytest.raises(ErreurVersion, match="postérieure"):
        versions.figer_version(projet, "1.0.5", "x")
    v = versions.figer_version(projet, "1.2", "Tolérance de 3 heures", "Wanda Bardey")
    assert v["version"] == "1.2" and v["auteur"] == "Wanda Bardey"


def test_outils_mcp_versionnes(projet):
    def appel(nom, **args):
        r = appeler_outil(nom, {"projet": str(projet), **args})
        assert not r["isError"], r["content"][0]["text"]
        texte = r["content"][0]["text"]
        return texte if nom == "contexte" else json.loads(texte)

    assert "Annulation possible avant prise en charge [RG-006] (validée" in appel("contexte", version="production")
    assert "[RG-007]" in appel("contexte")
    assert appel("lire_element", id="RG-003", version="1.1")["element"]["enonce"].endswith("2 heures.")
    assert appel("lister_versions")["environnements"]["production"]["spec"] == "1.0"
    assert appel("comparer_versions", de="production", a="recette")["resume"]["ajouté"] >= 1
    erreur = appeler_outil("lire_element", {"projet": str(projet), "id": "RG-001", "version": "9.9"})
    assert erreur["isError"] and "Version inconnue" in erreur["content"][0]["text"]


def test_contexte_compact():
    from referentiel.chargement import charger

    p = charger(FRET)
    texte = generer_contexte(p)
    assert taille(texte)["jetons_estimes"] < 4000  # base d'exemple complète : entités, listes, écrans, scénarios
    for attendu in ("[RG-007]", "Remplace Annulation possible avant prise en charge [RG-006]", "Comité produit du 2026-10-01",
                    "Si document_douanier = valide, marchandise_dangereuse = oui alors Envoyer en contrôle sécurité",
                    "## Ce que la base ne dit pas encore"):
        assert attendu in texte
    assert "—" not in texte and "–" not in texte
    index = generer_contexte(p, index=True)
    assert len(index) < len(texte) and "Comité produit" not in index


def test_assistant_selon_la_portee(projet):
    prod, complet = assistant.construire_contexte(projet, "production")
    assert complet
    assert "Version : 1.0" in prod and "Ce qui changera" in prod and "RG-007" in prod
    travail, _ = assistant.construire_contexte(projet, "travail")
    assert "Écarts avec la production (spec 1.0)" in travail and "Version : travail" in travail
    histoire, _ = assistant.construire_contexte(projet, "histoire")
    assert "Changements de la 1.0 à la 1.1" in histoire and "Changements de la 1.1 à la travail" in histoire


def test_ligne_de_commande(projet, tmp_path, capsys):
    from referentiel.__main__ import main

    main(["versions", str(projet)])
    sortie = capsys.readouterr().out
    assert "1.1" in sortie and "production : spec 1.0" in sortie
    main(["comparer", str(projet), "1.1"])
    assert "modifié : règle" in capsys.readouterr().out
    fichier = tmp_path / "REFERENTIEL.md"
    main(["contexte", str(projet), "--version", "production", "-o", str(fichier)])
    assert "Version : 1.0" in fichier.read_text(encoding="utf-8")


def test_archive_lancee_depuis_la_racine_du_depot(projet, monkeypatch, acces_git):
    """Non-régression : sur Git 2.33, « git -C sous-dossier archive -- ':(top)chemin' » échoue.
    L'archive se lance donc depuis la racine du dépôt, avec un chemin simple."""
    if acces_git == "dulwich":
        pytest.skip("propre au programme git")
    appels = []
    vrai_git = versions._git

    def espion(racine, *args, **kw):
        appels.append((Path(racine), args))
        return vrai_git(racine, *args, **kw)

    monkeypatch.setattr(versions, "_git", espion)
    versions._cache.clear()
    assert "RG-007" not in versions.charger_version(projet, "1.0").regles
    racine_depot, args = next((r, a) for r, a in appels if a and a[0] == "archive")
    assert racine_depot == projet.parent.parent
    assert args[-2:] == ("--", "referentiel/fret/") and not any(":(top)" in a for a in args)
