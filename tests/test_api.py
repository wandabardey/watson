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
    assert liste[0]["nom"].startswith("Fret") and liste[0]["regles"] == 8

    pid = p["id"]
    s = appel(base, f"/api/projets/{pid}/synthese")
    assert s["compteurs"]["regles"] == 8 and s["versions"]["derniere"] == "1.0" and s["points"]
    c = appel(base, f"/api/projets/{pid}/catalogue")
    exp = next(e for e in c["entites"] if e["id"] == "ENT-EXPEDITION")
    assert exp["nom"] == "Expédition" and any(a["nom"] == "marchandise_dangereuse" and a["regles"] for a in exp["attributs"])
    w = appel(base, f"/api/projets/{pid}/workflow")
    actions = {a["id"]: a for e in w["entites"] for a in e["actions"]}
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


def test_alimenter_par_l_api(serveur, monkeypatch):
    base, nu = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]

    async def lire(systeme, message, requete=None):
        assert "Comité du 20/10" in message
        return {"resume": "Un acteur.", "propositions": [
            {"type": "acteur", "action": "creer", "titre": "Douanier", "pourquoi": "x", "conflit": "",
             "citation": {"document": "DOC-1", "extrait": "douanier"}, "contenu": {"id": "ACT-DOUANIER", "nom": "Douanier"}}]}

    monkeypatch.setattr("referentiel.alimentation._lire_par_claude", lire)
    lot = appel(base, f"/api/projets/{pid}/alimenter", {"documents": [{"titre": "Comité du 20/10", "texte": "Le douanier contrôle."}]})
    assert appel(base, f"/api/projets/{pid}/alimenter")["lots"][0]["id"] == lot["id"]
    r = appel(base, f"/api/projets/{pid}/alimenter/{lot['id']}/appliquer", {"decisions": [{"index": 0, "accepte": True}]})
    assert r["envoye"] and r["ecrits"][0]["id"] == "ACT-DOUANIER"
    fichiers = subprocess.run(["git", "-C", str(nu), "show", "--name-only", "--format=%s", "HEAD"], capture_output=True, text=True).stdout
    assert "Alimentation : Comité du 20/10" in fichiers and "sources/index.yaml" in fichiers and "acteurs/ACT-DOUANIER.yaml" in fichiers


def test_accueil_nouveautes_depuis_la_visite(serveur, tmp_path):
    import time
    base, nu = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    a = appel(base, "/api/accueil")["projets"][0]
    assert a["regles"] == 8 and a["derniere"]["message"] == "Projet fret" and a["nouveautes"]["total"] == 0
    appel(base, f"/api/projets/{pid}/visite", {})
    time.sleep(1.1)
    # Paul enregistre ailleurs une question ouverte, puis on synchronise
    autre = tmp_path / "autre"
    subprocess.run(["git", "clone", "-q", str(nu), str(autre)], check=True)
    (autre / "sujets.yaml").write_text("- id: Q-001\n  question: Assurance au-delà de 50 000 euros ?\n  statut: ouvert\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(autre), "-c", "user.name=Paul", "-c", "user.email=p@p", "commit", "-qam", "x"], check=False)
    subprocess.run(["git", "-C", str(autre), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(autre), "-c", "user.name=Paul", "-c", "user.email=p@p", "commit", "-qm", "Question sur l'assurance"], check=True)
    subprocess.run(["git", "-C", str(autre), "push", "-q", "origin", "HEAD"], check=True)
    appel(base, f"/api/projets/{pid}/synchroniser", {})
    a = appel(base, "/api/accueil")["projets"][0]
    assert a["nouveautes"]["total"] == 1 and a["nouveautes"]["auteurs"] == ["Paul"]
    assert a["questions"] == [{"id": "Q-001", "question": "Assurance au-delà de 50 000 euros ?"}]


def test_vue_referentiels(serveur):
    base, _ = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    r = appel(base, f"/api/projets/{pid}/referentiels")
    ent = {e["id"]: e for e in r["entites"]}
    soc = ent["ENT-SOCIETE"]
    lieux = next(d for d in soc["donnees"] if d["nom"] == "lieux")
    assert lieux["cible_nom"] == "Lieu" and lieux["cible_genre"] == "entite" and lieux["multiple"]
    assert next(d for d in soc["donnees"] if d["nom"] == "type")["cible_genre"] == "liste"
    assert {u["id"] for u in soc["utilisee_par"]} == {"ENT-EXPEDITION", "ENT-LIEU", "ENT-PERSONNE"}
    assert ent["ENT-LIEU"]["cycle"] == [] and len(ent["ENT-EXPEDITION"]["cycle"]) == 9
    paiement = next(l for l in r["listes"] if l["id"] == "LST-MODE-PAIEMENT")
    assert paiement["valeurs"][0]["groupe"] == "Traçable" and paiement["utilisee_par"][0]["id"] == "ENT-EXPEDITEUR"
    # Le workflow ne garde que les entités qui ont un cycle de vie
    assert [e["id"] for e in appel(base, f"/api/projets/{pid}/workflow")["entites"]] == ["ENT-EXPEDITION"]


def test_editer_un_element(serveur):
    base, nu = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    lieu = appel(base, f"/api/projets/{pid}/elements/ENT-LIEU")
    assert lieu["type"] == "entite" and lieu["contenu"]["nom"] == "Lieu"
    c = lieu["contenu"]
    c["attributs"].append({"nom": "code_iata", "libelle": "Code IATA", "type": "texte", "optionnel": True})
    r = appel(base, f"/api/projets/{pid}/elements", {"type": "entite", "contenu": c})
    assert r["envoye"]
    log = subprocess.run(["git", "-C", str(nu), "log", "-1", "--format=%an|%s"], capture_output=True, text=True).stdout.strip()
    assert log == "Wanda Bardey|Modification : Lieu"
    v = appel(base, f"/api/projets/{pid}/referentiels")
    assert any(d["nom"] == "code_iata" and d["optionnel"] for d in next(e for e in v["entites"] if e["id"] == "ENT-LIEU")["donnees"])
    # Création, puis suppression refusée tant qu'elle est citée
    appel(base, f"/api/projets/{pid}/elements", {"type": "entite", "contenu": {"id": "ENT-VEHICULE", "nom": "Véhicule",
          "attributs": [{"nom": "societe", "libelle": "Société", "type": "reference", "cible": "ENT-SOCIETE"}]}})
    with pytest.raises(urllib.error.HTTPError) as e:
        appel(base, f"/api/projets/{pid}/elements/ENT-SOCIETE", {}, methode="DELETE")
    assert "Encore utilisé par" in json.loads(e.value.read())["erreur"]
    appel(base, f"/api/projets/{pid}/elements/ENT-VEHICULE", {}, methode="DELETE")
    assert "ENT-VEHICULE" not in {e["id"] for e in appel(base, f"/api/projets/{pid}/referentiels")["entites"]}


def test_demande_de_modification_et_apercu(serveur, monkeypatch):
    base, nu = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    vus = {}

    async def lire(systeme, message, requete=None):
        vus["systeme"], vus["message"] = systeme, message
        return {"resume": "Ajout du véhicule.", "propositions": [
            {"type": "entite", "action": "creer", "titre": "Véhicule", "pourquoi": "Demandé.", "conflit": "",
             "citation": {"document": "DOC-1", "extrait": "ajoute un véhicule"},
             "contenu": {"id": "ENT-VEHICULE", "nom": "Véhicule", "attributs": [
                 {"nom": "immatriculation", "libelle": "Immatriculation", "type": "texte"},
                 {"nom": "societe", "libelle": "Société", "type": "reference", "cible": "ENT-SOCIETE"}]}}]}

    monkeypatch.setattr("referentiel.alimentation._lire_par_claude", lire)
    lot = appel(base, f"/api/projets/{pid}/modifier", {"consigne": "Ajoute un véhicule rattaché à la société", "element": "ENT-SOCIETE"})
    assert "MODE MODIFICATION" in vus["systeme"] and "[ENT-SOCIETE]" in vus["systeme"] and lot["mode"] == "consigne"
    ap = appel(base, f"/api/projets/{pid}/alimenter/{lot['id']}/apercu")
    assert ap["nouveaux"] == ["ENT-VEHICULE"] and "ENT-VEHICULE" in {e["id"] for e in ap["referentiels"]["entites"]}
    soc = next(e for e in ap["referentiels"]["entites"] if e["id"] == "ENT-SOCIETE")
    assert "ENT-VEHICULE" in {u["id"] for u in soc["utilisee_par"]}
    r = appel(base, f"/api/projets/{pid}/alimenter/{lot['id']}/appliquer", {"decisions": [{"index": 0, "accepte": True}]})
    assert r["envoye"] and r["message"].startswith("Modification : Ajoute un véhicule") and r["sources"] == []
    fichiers = subprocess.run(["git", "-C", str(nu), "show", "--name-only", "--format=%s", "HEAD"], capture_output=True, text=True).stdout
    assert "entites/ENT-VEHICULE.yaml" in fichiers and "sources/" not in fichiers


def test_regle_qui_porte_sur_une_donnee(tmp_path):
    from referentiel.chargement import charger
    from referentiel.controles import analyser
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    (racine / "regles" / "RG-050.yaml").write_text(
        "id: RG-050\ntitre: SIRET sur 14 chiffres\nstatut: validee\ntype: contrainte\nenonce: Le SIRET compte 14 chiffres.\n"
        "porte_sur: [ENT-SOCIETE.siret, ENT-EXPEDITEUR.siret, ENT-SOCIETE.inexistant]\n", encoding="utf-8")
    p = charger(racine)
    assert not p.erreurs
    assert any("inexistant" in t.message for t in analyser(p))
    _, par_donnee = api.regles_par_cible(p)
    assert "RG-050" in {r["id"] for r in par_donnee[("ENT-SOCIETE", "siret")]} and ("ENT-EXPEDITEUR", "siret") in par_donnee


def test_versions_produit(serveur):
    base, _ = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    v = appel(base, f"/api/projets/{pid}/referentiels")
    assert [x["id"] for x in v["versions_produit"]] == ["MVP", "V2"]
    pers = next(e for e in v["entites"] if e["id"] == "ENT-PERSONNE")
    assert pers["version"] == "V2" and all(d["version"] == "V2" for d in pers["donnees"])  # les données héritent
    exp = next(e for e in v["entites"] if e["id"] == "ENT-EXPEDITEUR")
    assert next(d for d in exp["donnees"] if d["nom"] == "telephone")["version"] == "V2"
    # Ajouter une V3 ; retirer V2 est refusé tant qu'elle est portée
    appel(base, f"/api/projets/{pid}/versions-produit", {"versions": v["versions_produit"] + [{"id": "V3", "nom": "V3"}]})
    with pytest.raises(urllib.error.HTTPError) as e:
        appel(base, f"/api/projets/{pid}/versions-produit", {"versions": [{"id": "MVP", "nom": "MVP"}]})
    assert "encore portée" in json.loads(e.value.read())["erreur"]
    assert [x["id"] for x in appel(base, f"/api/projets/{pid}/referentiels")["versions_produit"]] == ["MVP", "V2", "V3"]


def test_vue_ecrans_et_edition(serveur):
    base, _ = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    v = appel(base, f"/api/projets/{pid}/ecrans")
    ec = {e["id"]: e for e in v["ecrans"]}
    assert ec["SCR-002"]["applications"][0]["couleur"] == "#4F46E5" and ec["SCR-002"]["parcours"][0]["id"] == "UC-001"
    echange = next(r for r in ec["SCR-002"]["routages"] if r["genre"] == "echange")
    assert echange["vers_nom"] == "Tableau de bord transporteur"
    assert ec["SCR-013"]["sous_ecrans"] == ["SCR-014"] and ec["SCR-014"]["a_trancher"] and ec["SCR-004"]["version"] == "V2"
    assert ec["SCR-011"]["sections"][-1]["version"] == "V2" and ec["SCR-001"]["sections"][0]["version"] is None
    # Un écran au format du client (identifiant à point), créé depuis l'application
    appel(base, f"/api/projets/{pid}/elements", {"type": "ecran", "contenu": {
        "id": "SIMAR-04.1", "nom": "Journal des actions", "type": "panneau", "parent": "SCR-011",
        "routages": [{"vers": "SCR-002", "genre": "navigation"}]}})
    assert "SIMAR-04.1" in {e["id"] for e in appel(base, f"/api/projets/{pid}/ecrans")["ecrans"]}


def test_vue_scenarios_et_edition(serveur):
    base, _ = serveur
    pid = appel(base, "/api/projets", {"depot": "wandabardey/fret"})["id"]
    v = appel(base, f"/api/projets/{pid}/scenarios")
    sc = {s["id"]: s for s in v["scenarios"]}
    et = {e["id"]: e for e in sc["SCN-001"]["etapes"]}
    assert et["dangereuse"]["genre"] == "decision" and et["dangereuse"]["regles"][0]["id"] == "RG-002"
    assert et["controle"]["ecran_nom"] == "Contrôle sécurité" and et["prete"]["statut_nom"] == "Prête à expédier"
    assert et["relance"]["version"] == "V2" and et["saisie"]["couleur"] == "#4F46E5"
    assert any(li["genre"] == "refus" for li in sc["SCN-001"]["liens"]) and v["entites"][0]["statuts"]
    # Les écrans savent dans quels scénarios ils servent.
    ec = {e["id"]: e for e in appel(base, f"/api/projets/{pid}/ecrans")["ecrans"]}
    assert "SCN-001" in {x["id"] for x in ec["SCR-012"]["parcours"]}
    # Sans liens écrits, les étapes s'enchaînent dans l'ordre.
    appel(base, f"/api/projets/{pid}/elements", {"type": "scenario", "contenu": {
        "id": "SCN-010", "nom": "Facturer", "etapes": [{"id": "a", "libelle": "Préparer"}, {"id": "b", "libelle": "Envoyer"}]}})
    nouveau = next(s for s in appel(base, f"/api/projets/{pid}/scenarios")["scenarios"] if s["id"] == "SCN-010")
    assert nouveau["liens"] == [{"de": "a", "vers": "b", "genre": "suite"}]
    # Un identifiant d'étape hors format est refusé, rien n'est écrit.
    with pytest.raises(Exception):
        appel(base, f"/api/projets/{pid}/elements", {"type": "scenario", "contenu": {
            "id": "SCN-011", "nom": "Cassé", "etapes": [{"id": "A", "libelle": "Majuscule interdite"}]}})
