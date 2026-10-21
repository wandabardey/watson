"""API locale de l'application de bureau : vues de la base et première écriture synchronisée."""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

pytest.importorskip("dulwich")

from referentiel import api, application, depot, github  # noqa: E402

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def git(d, *a):
    subprocess.run(["git", "-C", str(d), "-c", "user.name=T", "-c", "user.email=t@t", *a], check=True, capture_output=True)


@pytest.fixture()
def serveur(tmp_path, monkeypatch):
    monkeypatch.setenv("REFERENTIEL_GIT", "dulwich")
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    monkeypatch.setattr(github, "jeton", lambda: None)
    monkeypatch.setattr(github, "compte", lambda j=None: {"login": "wanda", "nom": "Wanda Bardey", "email": "wanda@4sh.fr"})
    # « GitHub » simulé : un dépôt nu local, ouvert comme le ferait l'application.
    source = tmp_path / "source"
    shutil.copytree(FRET, source, ignore=shutil.ignore_patterns("sortie", "recette"))
    git(source, "init", "-q", "-b", "main")
    git(source, "add", "-A")
    git(source, "commit", "-qm", "Projet fret")
    git(source, "tag", "-a", "spec-1.0", "-m", "Première version")
    nu = tmp_path / "fret.git"
    subprocess.run(["git", "clone", "-q", "--bare", str(source), str(nu)], check=True)
    monkeypatch.setattr(github, "url_clone", lambda nom: str(nu))
    s = ThreadingHTTPServer(("127.0.0.1", 0), api.fabrique("secret"))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{s.server_address[1]}", nu
    s.shutdown()


def appel(base, chemin, corps=None, methode=None, jeton="secret"):
    req = urllib.request.Request(base + chemin, data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={"X-Watson-Jeton": jeton, "Content-Type": "application/json"}, method=methode)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def test_parcours_complet(serveur):
    base, nu = serveur
    with pytest.raises(urllib.error.HTTPError) as e:
        appel(base, "/api/projets", jeton="faux")
    assert e.value.code == 403

    p = appel(base, "/api/projets", {"depot": "wandabardey/fret-connaissance"})
    assert p["id"] == "wandabardey-fret-connaissance"
    liste = appel(base, "/api/projets")["projets"]
    assert liste[0]["nom"].startswith("Fret") and liste[0]["regles"] == 7

    pid = p["id"]
    s = appel(base, f"/api/projets/{pid}/synthese")
    assert s["compteurs"]["regles"] == 7 and s["versions"]["derniere"] == "1.0" and s["points"]
    c = appel(base, f"/api/projets/{pid}/catalogue")
    exp = c["entites"][0]
    assert exp["nom"] == "Expédition" and any(a["nom"] == "marchandise_dangereuse" and a["regles"] for a in exp["attributs"])
    w = appel(base, f"/api/projets/{pid}/workflow")
    actions = {a["id"]: a for a in w["entites"][0]["actions"]}
    assert actions["TR-RELANCER"]["points"] and w["tables"][0]["lignes"]
    r = {x["id"]: x for x in appel(base, f"/api/projets/{pid}/regles")["regles"]}
    assert r["RG-006"]["remplacee_par"]["id"] == "RG-007" and r["RG-005"]["statut"] == "proposee"
    assert appel(base, f"/api/projets/{pid}/tests?element=RG-002")["cas"]

    # Valider une règle : écrit, signé, envoyé sur le dépôt distant.
    res = appel(base, f"/api/projets/{pid}/regles/RG-005/valider", {"source": "Comité produit du 2026-10-21"})
    assert res["envoye"] and res["commit"]
    log = subprocess.run(["git", "-C", str(nu), "log", "-1", "--format=%an|%s"], capture_output=True, text=True).stdout.strip()
    assert log == "Wanda Bardey|Règle validée : Délai de signalement d'un litige"
    assert appel(base, f"/api/projets/{pid}/synchroniser", {})["etat"] == "inchange"
    assert {x["id"]: x for x in appel(base, f"/api/projets/{pid}/regles")["regles"]}["RG-005"]["statut"] == "validee"

    appel(base, f"/api/projets/{pid}", {}, methode="DELETE")
    assert appel(base, "/api/projets")["projets"] == []


def test_depot_sans_projet(serveur, tmp_path, monkeypatch):
    base, _ = serveur
    vide = tmp_path / "vide"
    vide.mkdir()
    (vide / "README.md").write_text("x")
    git(vide, "init", "-q", "-b", "main")
    git(vide, "add", "-A")
    git(vide, "commit", "-qm", "x")
    monkeypatch.setattr(github, "url_clone", lambda nom: str(vide))
    with pytest.raises(urllib.error.HTTPError) as e:
        appel(base, "/api/projets", {"depot": "autre/vide"})
    assert "projet.yaml" in json.loads(e.value.read())["erreur"]


def test_creer_dans_une_organisation(serveur, tmp_path, monkeypatch):
    base, _ = serveur
    demandes = []

    def creer_depot(nom, description, organisation=None, prive=True):
        demandes.append((nom, organisation))
        nu = tmp_path / f"cree-{len(demandes)}.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(nu)], check=True)
        return {"nom": f"{organisation or 'wanda'}/{nom}", "url": str(nu), "prive": True}

    monkeypatch.setattr(github, "creer_depot", creer_depot)
    monkeypatch.setattr(github, "url_clone", lambda nom: str(tmp_path / f"cree-{len(demandes)}.git"))
    p = appel(base, "/api/projets", {"creer": True, "nom": "Fret international", "organisation": "4sh", "demo": True})
    assert demandes == [("fret-international-knowledge", "4sh")] and p["depot"] == "4sh/fret-international-knowledge"
    # Son propre compte, et un nom choisi (nettoyé pour GitHub)
    appel(base, "/api/projets", {"creer": True, "nom": "Autre", "depot": "Mon dépôt à moi", "organisation": "wanda"})
    assert demandes[-1] == ("Mon-depot-a-moi", None)


def test_proprietaires(monkeypatch):
    monkeypatch.setattr(github, "jeton", lambda: "j")
    monkeypatch.setattr(github, "compte", lambda j=None: {"login": "wanda", "nom": "Wanda Bardey"})

    def requete(url, donnees=None, jeton=None, methode=None):
        github._PORTEES[0] = {"repo"}
        return [{"login": "zeta"}, {"login": "4sh"}]

    monkeypatch.setattr(github, "_requete", requete)
    r = github.proprietaires()
    assert [x["login"] for x in r["proprietaires"]] == ["wanda", "4sh", "zeta"] and r["reconnexion"] is True
