"""Évolutions : des changements groupés, rattachés à une version cible.

Une évolution est une branche Git `evo/<identifiant>` du dépôt du référentiel. On y travaille dans un dossier
à part (un « worktree » Git rangé dans le dossier .git), si bien que la version de travail et les autres
évolutions ne bougent pas. Le fichier `evolutions.yaml`, à la racine du projet, garde pour chacune son nom,
sa version cible (« 1.6 » ou « plus tard ») et son statut :

    evolutions:
      - id: blocage-douane
        nom: Blocage en douane
        cible: "1.6"
        statut: en_cours        # en_cours, validee, integree
        applications: [PORTAIL, APP]
        creee_le: 2026-10-20
        par: Wanda Bardey

Figer la version 1.6 intègre à la version de travail les évolutions validées qui la ciblent, et seulement
elles ; celles qui ciblent une autre version, ou « plus tard », attendent sur leur branche. Une évolution
ciblée mais pas encore validée bloque la version : on la valide, ou on la décale.

L'outil n'écrit que dans le dépôt du référentiel, jamais dans les dépôts de code.
"""

from __future__ import annotations

import re
import subprocess
import unicodedata
from pathlib import Path

from ._vendor import yaml
from .chargement import charger
from .ecriture import aujourdhui, dump
from .versions import (
    ErreurVersion, _cle_version, _git, _prefixe_projet, charger_commit, comparer_projets, est_versionne,
    figer_version as _figer, lister_versions, normaliser,
)

FICHIER = "evolutions.yaml"
PLUS_TARD = "plus tard"
STATUTS = {"en_cours": "en cours", "validee": "validée", "integree": "intégrée"}


def _slug(nom: str) -> str:
    s = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "evolution"


def _cible(cible: str | None) -> str:
    if not cible or str(cible).strip().lower() in ("plus tard", "plus_tard", "later", "aucune"):
        return PLUS_TARD
    v = normaliser(str(cible))
    if not re.fullmatch(r"\d+(\.\d+){1,2}", v):
        raise ErreurVersion("Version cible attendue : un numéro (1.6) ou « plus tard ».")
    return v


def _verifier(racine: Path):
    if not est_versionne(racine):
        raise ErreurVersion("Le projet n'est pas dans un dépôt Git : les évolutions ont besoin de branches.")


def _lire(racine: Path) -> list[dict]:
    f = Path(racine) / FICHIER
    if not f.exists():
        return []
    return list((yaml.safe_load(f.read_text(encoding="utf-8")) or {}).get("evolutions") or [])


def _ecrire(racine: Path, evolutions: list[dict], message: str, auteur: str | None):
    """Écrit evolutions.yaml et ne valide que ce fichier : les autres changements en cours ne sont pas touchés."""
    f = Path(racine) / FICHIER
    f.write_text(dump({"evolutions": evolutions}), encoding="utf-8")
    _git(racine, "add", "--", FICHIER)
    r = subprocess.run(["git", "-C", str(racine), *_identite(racine, auteur), "commit", "-q", "-m", message, "--", FICHIER], capture_output=True, timeout=60)
    if r.returncode != 0 and b"nothing" not in r.stdout + r.stderr:
        raise ErreurVersion(r.stderr.decode("utf-8", "replace").strip())


def _identite(racine: Path, auteur: str | None) -> list[str]:
    """Options Git pour signer un commit au nom de la personne, avec une adresse de repli si Git n'en a pas."""
    args = ["-c", f"user.name={auteur}"] if auteur else []
    r = subprocess.run(["git", "-C", str(racine), "config", "user.email"], capture_output=True, timeout=30)
    if not r.stdout.strip():
        args += ["-c", "user.email=referentiel@local"]
        if not auteur:
            args += ["-c", "user.name=referentiel"]
    return args


def _trouver(evolutions: list[dict], ident: str) -> dict:
    for e in evolutions:
        if e["id"] == ident:
            return e
    raise ErreurVersion(f"Évolution inconnue : {ident}. Connues : {', '.join(e['id'] for e in evolutions) or 'aucune'}.")


def _branche(ident: str) -> str:
    return f"evo/{ident}"


def _dossier_travail(racine: Path, ident: str) -> Path:
    commun = Path(_git(racine, "rev-parse", "--git-common-dir").strip())
    if not commun.is_absolute():
        commun = (Path(racine) / commun).resolve()
    return commun / "referentiel-evolutions" / ident


def chemin(racine: Path, ident: str) -> Path:
    """Dossier du projet dans l'évolution, prêt à être lu ou modifié (créé au besoin)."""
    racine = Path(racine)
    _verifier(racine)
    e = _trouver(_lire(racine), ident)
    if e.get("statut") == "integree":
        raise ErreurVersion(f"L'évolution « {e['nom']} » est déjà intégrée à la spec {e.get('version')} : plus de modification possible.")
    dossier = _dossier_travail(racine, ident)
    if not (dossier / ".git").exists():
        dossier.parent.mkdir(parents=True, exist_ok=True)
        _git(racine, "worktree", "add", "-q", str(dossier), _branche(ident))
    return dossier / _prefixe_projet(racine)


def enregistrer(racine: Path, ident: str, auteur: str, message: str) -> bool:
    """Valide sur la branche de l'évolution ce qui vient d'y être écrit. Renvoie False s'il n'y avait rien."""
    projet = chemin(racine, ident)
    _git(projet, "add", "-A", "--", ".")
    if not _git(projet, "status", "--porcelain", "--", ".").strip():
        return False
    _git(projet, *_identite(projet, auteur), "commit", "-q", "-m", message)
    return True


def creer(racine: Path, nom: str, cible: str | None, auteur: str, applications: list[str] | None = None) -> dict:
    racine = Path(racine)
    _verifier(racine)
    evolutions = _lire(racine)
    ident = base = _slug(nom)
    n = 2
    while any(e["id"] == ident for e in evolutions):
        ident, n = f"{base}-{n}", n + 1
    e = {"id": ident, "nom": nom, "cible": _cible(cible), "statut": "en_cours", "creee_le": aujourdhui(), "par": auteur}
    if applications:
        e["applications"] = applications
    _git(racine, "branch", _branche(ident), "HEAD")
    _ecrire(racine, evolutions + [e], f"Évolution créée : {nom}", auteur)
    return {**e, "branche": _branche(ident)}


def cibler(racine: Path, ident: str, cible: str | None, auteur: str) -> dict:
    evolutions = _lire(racine)
    e = _trouver(evolutions, ident)
    if e.get("statut") == "integree":
        raise ErreurVersion("Une évolution intégrée ne change plus de version.")
    e["cible"] = _cible(cible)
    _ecrire(racine, evolutions, f"Évolution {e['nom']} : cible {e['cible']}", auteur)
    return e


def valider(racine: Path, ident: str, auteur: str) -> dict:
    evolutions = _lire(racine)
    e = _trouver(evolutions, ident)
    if e.get("statut") == "integree":
        raise ErreurVersion("Évolution déjà intégrée.")
    e.update({"statut": "validee", "validee_le": aujourdhui(), "validee_par": auteur})
    _ecrire(racine, evolutions, f"Évolution validée : {e['nom']}", auteur)
    return e


def changements(racine: Path, ident: str) -> list[dict]:
    """Ce que l'évolution change, depuis le point où elle a quitté la version de travail."""
    racine = Path(racine)
    branche = _branche(ident)
    base = _git(racine, "merge-base", "HEAD", branche).strip()
    return comparer_projets(charger_commit(racine, base, "base"), charger_commit(racine, branche, ident))


def lister(racine: Path) -> list[dict]:
    racine = Path(racine)
    if not est_versionne(racine):
        return []
    resultat = []
    for e in _lire(racine):
        ligne = {**e, "branche": _branche(e["id"]), "libelle_statut": STATUTS.get(e.get("statut"), e.get("statut"))}
        if e.get("statut") != "integree":
            try:
                ligne["changements"] = changements(racine, e["id"])
            except ErreurVersion:
                ligne["changements"] = []
        resultat.append(ligne)
    return resultat


def figer(racine: Path, version: str, message: str, auteur: str | None = None) -> dict:
    """Intègre les évolutions validées qui ciblent cette version, puis fige. Rien n'est fait si l'une bloque."""
    racine = Path(racine)
    v = normaliser(version)
    evolutions = _lire(racine)
    ciblees = [e for e in evolutions if e.get("cible") == v and e.get("statut") != "integree"]
    bloquantes = [e for e in ciblees if e.get("statut") != "validee"]
    if bloquantes:
        raise ErreurVersion(
            f"Ces évolutions ciblent la {v} sans être validées : " + ", ".join(f"« {e['nom']} »" for e in bloquantes)
            + ". Les valider, ou les décaler vers une autre version.")
    existantes = lister_versions(racine)
    if any(x["version"] == v for x in existantes):
        raise ErreurVersion(f"La version {v} existe déjà.")
    if existantes and _cle_version(v) <= _cle_version(existantes[-1]["version"]):
        raise ErreurVersion(f"La version doit être postérieure à la {existantes[-1]['version']}.")
    if _git(racine, "status", "--porcelain", "--", ".").strip():
        raise ErreurVersion("Des changements ne sont pas encore enregistrés dans le dépôt : les valider avant de figer.")
    integrees = []
    for e in ciblees:
        dossier = _dossier_travail(racine, e["id"])
        if (dossier / ".git").exists():
            _git(racine, "worktree", "remove", "--force", str(dossier))
        r = subprocess.run(["git", "-C", str(racine), *_identite(racine, auteur), "merge", "--no-ff", "-q",
                            "-m", f"Évolution « {e['nom']} » intégrée à la spec {v}", _branche(e["id"])],
                           capture_output=True, timeout=60)
        if r.returncode != 0:
            subprocess.run(["git", "-C", str(racine), "merge", "--abort"], capture_output=True, timeout=60)
            if integrees:
                _git(racine, "reset", "-q", "--hard", "HEAD~" + str(len(integrees)))
            raise ErreurVersion(f"« {e['nom']} » entre en conflit avec la version de travail : à reprendre avant de figer. "
                                "Rien n'a été intégré.")
        integrees.append(e)
    for e in integrees:
        e.update({"statut": "integree", "version": v})
    if integrees:
        _ecrire(racine, evolutions, f"Spec {v} : évolutions intégrées", auteur)
    resultat = _figer(racine, v, message, auteur)
    return {**resultat, "evolutions_integrees": [e["nom"] for e in integrees],
            "evolutions_en_attente": [f"{e['nom']} ({e.get('cible')})" for e in evolutions if e.get("statut") != "integree"]}
