"""Les projets ouverts dans l'application de bureau.

Chaque projet est un dépôt de connaissance sur GitHub. L'application en garde une copie de travail dans son
dossier de données (invisible pour la personne), la met à jour à l'ouverture et envoie chaque changement validé.
La référence reste le dépôt GitHub : la copie peut être supprimée sans rien perdre d'enregistré.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import unicodedata
from pathlib import Path

from . import depot, github
from .chargement import charger

EXEMPLE = Path(__file__).resolve().parent.parent / "exemples" / "fret"  # embarqué aussi dans l'application


class ErreurApplication(Exception):
    """Erreur présentable telle quelle."""


def dossier_donnees() -> Path:
    if os.environ.get("WATSON_DONNEES"):
        d = Path(os.environ["WATSON_DONNEES"])
    else:
        try:
            from platformdirs import user_data_dir
            d = Path(user_data_dir("Watson", appauthor=False))
        except ImportError:  # pragma: no cover
            d = Path.home() / ".watson"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fichier() -> Path:
    return dossier_donnees() / "projets.json"


def _lire() -> list[dict]:
    f = _fichier()
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def _ecrire(projets: list[dict]):
    _fichier().write_text(json.dumps(projets, ensure_ascii=False, indent=2), encoding="utf-8")


def _slug(texte: str) -> str:
    s = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "projet"


def _trouver_projet(copie: Path) -> Path | None:
    """Dossier contenant projet.yaml : la racine du dépôt, ou un sous-dossier (le premier trouvé)."""
    if (copie / "projet.yaml").exists():
        return copie
    for f in sorted(copie.rglob("projet.yaml")):
        if ".git" not in f.parts:
            return f.parent
    return None


def projet(pid: str) -> dict:
    for p in _lire():
        if p["id"] == pid:
            return p
    raise ErreurApplication("Projet inconnu sur ce poste.")


def chemin(pid: str) -> Path:
    p = projet(pid)
    return Path(p["copie"]) / p.get("sous_dossier", "")


def lister() -> list[dict]:
    resultat = []
    for p in _lire():
        info = {"id": p["id"], "depot": p["depot"], "nom": p.get("nom", p["depot"])}
        racine = Path(p["copie"]) / p.get("sous_dossier", "")
        if (racine / "projet.yaml").exists():
            pr = charger(racine)
            info.update(nom=pr.meta.get("nom", info["nom"]), description=pr.meta.get("description", ""),
                        applications=[a.get("nom") for a in pr.meta.get("applications") or []],
                        regles=len(pr.regles), entites=len(pr.entites))
        else:
            info["absent"] = True
        resultat.append(info)
    return resultat


def ajouter(nom_depot: str) -> dict:
    """Ouvre un dépôt de connaissance existant : le récupère et l'ajoute à la liste."""
    nom_depot = nom_depot.strip()
    if nom_depot.endswith(".git"):
        nom_depot = nom_depot[:-4]
    nom_depot = re.sub(r"^https://github\.com/", "", nom_depot).strip("/")
    projets = _lire()
    for p in projets:
        if p["depot"].lower() == nom_depot.lower():
            return p
    copie = dossier_donnees() / "depots" / _slug(nom_depot)
    if copie.exists():
        shutil.rmtree(copie)
    depot.cloner(github.url_clone(nom_depot), copie, github.jeton())
    racine = _trouver_projet(copie)
    if racine is None:
        shutil.rmtree(copie, ignore_errors=True)
        raise ErreurApplication("Ce dépôt ne contient pas de projet Watson (aucun fichier projet.yaml).")
    p = {"id": _slug(nom_depot), "depot": nom_depot, "copie": str(copie),
         "sous_dossier": racine.relative_to(copie).as_posix() if racine != copie else "", "nom": charger(racine).meta.get("nom", nom_depot)}
    _ecrire(projets + [p])
    return p


def creer(nom: str, nom_depot: str | None = None, organisation: str | None = None, demo: bool = False) -> dict:
    """Crée un dépôt de connaissance privé sur GitHub, avec un projet vide ou le projet de démonstration Fret."""
    from .ecriture import creer_projet

    compte = github.compte()
    nom_depot = _nom_depot(nom_depot or (_slug(nom) + "-knowledge"))
    if organisation and organisation.lower() == compte["login"].lower():
        organisation = None  # son propre compte
    cree = github.creer_depot(nom_depot, f"Connaissance métier : {nom} (Watson)", organisation)
    copie = dossier_donnees() / "depots" / _slug(cree["nom"])
    if copie.exists():
        shutil.rmtree(copie)
    copie.mkdir(parents=True)
    if demo:
        _copier(EXEMPLE, copie)
    else:
        creer_projet(copie, _slug(nom).upper()[:30], nom)
    (copie / "README.md").write_text(
        f"# {nom}\n\nConnaissance métier du projet, tenue avec Watson (https://github.com/wandabardey/watson).\n"
        "Ne pas modifier ces fichiers à la main : passer par l'application ou le plugin Claude watson.\n", encoding="utf-8")
    depot.initialiser(copie, github.url_clone(cree["nom"]))
    depot.enregistrer(copie, f"Création du projet {nom}", compte["nom"], compte.get("email"))
    depot.envoyer(copie, github.jeton())
    p = {"id": _slug(cree["nom"]), "depot": cree["nom"], "copie": str(copie), "sous_dossier": "", "nom": nom}
    _ecrire(_lire() + [p])
    return p


def _nom_depot(nom: str) -> str:
    """Nom accepté par GitHub : lettres, chiffres, tirets, points et soulignés."""
    n = re.sub(r"[^A-Za-z0-9._-]+", "-", unicodedata.normalize("NFKD", nom.strip()).encode("ascii", "ignore").decode()).strip("-.")
    if not n:
        raise ErreurApplication("Nom de dépôt invalide.")
    return n[:100]


def _copier(source: Path, cible: Path):
    for f in source.rglob("*"):
        if f.is_file() and "sortie" not in f.relative_to(source).parts:
            d = cible / f.relative_to(source)
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, d)


def oublier(pid: str):
    """Retire le projet de ce poste (le dépôt GitHub n'est pas touché)."""
    p = projet(pid)
    depot_local = Path(p["copie"])
    reste = depot.modifications(chemin(pid)) if depot_local.exists() else []
    if reste:
        raise ErreurApplication("Des changements de ce poste ne sont pas encore partis sur GitHub : synchroniser d'abord.")
    shutil.rmtree(depot_local, ignore_errors=True)
    _ecrire([x for x in _lire() if x["id"] != pid])


def _visites() -> dict:
    f = dossier_donnees() / "visites.json"
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    except ValueError:
        return {}


def noter_visite(pid: str):
    import time

    v = _visites()
    v[pid] = int(time.time())
    (dossier_donnees() / "visites.json").write_text(json.dumps(v), encoding="utf-8")


def _questions(racine: Path) -> list[dict]:
    f = racine / "sujets.yaml"
    if not f.exists():
        return []
    from ._vendor import yaml

    try:
        sujets = yaml.safe_load(f.read_text(encoding="utf-8")) or []
    except Exception:  # noqa: BLE001 - fichier abîmé : on n'empêche pas l'accueil
        return []
    return [{"id": q.get("id"), "question": q.get("question")} for q in sujets if q.get("statut", "ouvert") == "ouvert"]


def accueil(moi: str | None = None) -> dict:
    """Pour l'accueil : chaque projet avec ses chiffres, ses questions ouvertes et ce qui a changé
    depuis la dernière visite sur ce poste (enregistrements des autres personnes surtout)."""
    visites = _visites()
    resultat = []
    for info in lister():
        p = projet(info["id"])
        racine = Path(p["copie"]) / p.get("sous_dossier", "")
        info = dict(info)
        if not info.get("absent"):
            try:
                j = depot.journal(racine)
            except Exception:  # noqa: BLE001
                j = []
            info["derniere"] = j[0] if j else None
            vu = visites.get(info["id"])
            nouveaux = [c for c in j if vu and c["date"] > vu and c["auteur"] != moi]  # ses propres changements, on les connaît
            info["nouveautes"] = {"total": len(nouveaux),
                                  "auteurs": sorted({c["auteur"] for c in nouveaux if c["auteur"] != moi}),
                                  "messages": [c["message"] for c in nouveaux[:5]]}
            info["questions"] = _questions(racine)
            info["visite"] = vu
        resultat.append(info)
    resultat.sort(key=lambda x: -((x.get("derniere") or {}).get("date") or 0))
    return {"projets": resultat}


def synchroniser(pid: str) -> dict:
    """Récupère les changements faits ailleurs, et envoie ceux de ce poste qui attendaient."""
    racine = chemin(pid)
    etat = depot.recuperer(racine, github.jeton())
    if etat == "en_avance":
        depot.envoyer(racine, github.jeton())
        etat = "envoye"
    return {"etat": etat}


def enregistrer_et_envoyer(pid: str, message: str) -> dict:
    """Après une écriture du moteur : un commit signé par la personne connectée, puis l'envoi sur GitHub."""
    racine = chemin(pid)
    compte = github.compte()
    sha = depot.enregistrer(racine, message, compte["nom"], compte.get("email") or f"{compte['login']}@users.noreply.github.com")
    envoye = True
    try:
        depot.envoyer(racine, github.jeton())
    except depot.ErreurDepot:
        envoye = False  # repartira à la prochaine synchronisation
    return {"commit": sha, "envoye": envoye}


def dossier_temporaire() -> Path:
    return Path(tempfile.mkdtemp(prefix="watson-"))
