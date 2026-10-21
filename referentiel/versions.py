"""Versions de la spécification.

Une version de la spec est un état figé du référentiel : une étiquette Git `spec-X.Y` posée sur le dépôt
du référentiel. La version de travail est l'état courant des fichiers. Le fichier facultatif
`versions.yaml`, à la racine du projet, dit quelle version tourne sur chaque environnement :

    environnements:
      production:
        spec: "1.4"
        applications: {Portail Fret: "2.2.0", App Transporteur: "1.7.0"}
      recette:
        spec: travail
        applications: {Portail Fret: "2.3.0"}

Lire une version passée ne touche jamais aux fichiers de travail : la version est extraite de Git
dans un dossier temporaire, gardé en cache le temps du processus.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import subprocess
import tarfile
import tempfile
from pathlib import Path

from ._vendor import yaml
from . import depot
from .chargement import Projet, charger

PREFIXE = "spec-"
TRAVAIL = "travail"
COLLECTIONS = {"acteurs": "acteur", "entites": "entité", "regles": "règle", "cas_usage": "parcours", "ecrans": "écran"}

_cache: dict[tuple[str, str], Projet] = {}
_dossiers: list[tempfile.TemporaryDirectory] = []


class ErreurVersion(Exception):
    """Erreur présentable telle quelle."""


# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------

def _git(racine: Path, *args, binaire=False):
    r = subprocess.run(["git", "-C", str(racine), *args], capture_output=True, timeout=60)
    if r.returncode != 0:
        raise ErreurVersion((r.stderr or b"").decode("utf-8", "replace").strip() or "Commande Git en échec.")
    return r.stdout if binaire else r.stdout.decode("utf-8", "replace")


def est_versionne(racine: Path) -> bool:
    if depot.actif():
        return depot.racine(racine) is not None
    try:
        return _git(racine, "rev-parse", "--is-inside-work-tree").strip() == "true"
    except (ErreurVersion, OSError):
        return False


def _prefixe_projet(racine: Path) -> str:
    """Chemin du projet dans le dépôt (vide si le projet est à la racine du dépôt)."""
    if depot.actif():
        return depot.prefixe(racine)
    return _git(racine, "rev-parse", "--show-prefix").strip()


def _cle_version(v: str):
    return tuple(int(x) if x.isdigit() else x for x in re.split(r"[.\-]", v))


def normaliser(version: str | None) -> str:
    """« 1.4 », « spec-1.4 » ou « v1.4 » donnent « 1.4 » ; vide ou « travail » donne « travail »."""
    if not version or str(version).strip().lower() in (TRAVAIL, "courante", "work"):
        return TRAVAIL
    v = str(version).strip()
    for p in (PREFIXE, "v"):
        if v.startswith(p):
            v = v[len(p):]
    return v


# ---------------------------------------------------------------------------
# Lister et résoudre
# ---------------------------------------------------------------------------

def lister_versions(racine: Path) -> list[dict]:
    """Versions figées, de la plus ancienne à la plus récente."""
    if not est_versionne(racine):
        return []
    if depot.actif():
        return sorted(({"version": e["nom"][len(PREFIXE):], "etiquette": e["nom"], "commit": e["commit"], "date": e["date"],
                        "auteur": e["auteur"], "message": e["message"]} for e in depot.etiquettes(racine, PREFIXE)),
                      key=lambda v: _cle_version(v["version"]))
    sortie = _git(
        racine, "for-each-ref", f"refs/tags/{PREFIXE}*",
        "--format=%(refname:short)%09%(objectname)%09%(*objectname)%09%(creatordate:short)%09%(taggername)%09%(contents:subject)",
    )
    versions = []
    for ligne in sortie.splitlines():
        tag, obj, commit_annote, date, auteur, message = (ligne.split("\t") + [""] * 6)[:6]
        versions.append({
            "version": tag[len(PREFIXE):], "etiquette": tag, "commit": commit_annote or obj,
            "date": date, "auteur": auteur or None, "message": message or None,
        })
    return sorted(versions, key=lambda v: _cle_version(v["version"]))


def environnements(racine: Path) -> dict:
    f = Path(racine) / "versions.yaml"
    if not f.exists():
        return {}
    donnees = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    envs = donnees.get("environnements") or {}
    return {nom: {**(e or {}), "spec": normaliser(str((e or {}).get("spec", TRAVAIL)))} for nom, e in envs.items()}


def resoudre(racine: Path, reference: str | None) -> str:
    """Une version (« 1.4 »), un environnement (« production ») ou « travail » → numéro de version ou « travail »."""
    if reference and str(reference).lower() in environnements(racine):
        return environnements(racine)[str(reference).lower()]["spec"]
    v = normaliser(reference)
    if v != TRAVAIL and v not in {x["version"] for x in lister_versions(racine)}:
        connues = ", ".join(x["version"] for x in lister_versions(racine)) or "aucune"
        raise ErreurVersion(f"Version inconnue : {reference}. Versions figées : {connues}.")
    return v


# ---------------------------------------------------------------------------
# Charger une version
# ---------------------------------------------------------------------------

def charger_version(racine: Path, reference: str | None = None) -> Projet:
    racine = Path(racine)
    v = resoudre(racine, reference)
    if v == TRAVAIL:
        p = charger(racine)
        p.meta = {**p.meta, "version": TRAVAIL}
        return p
    commit = next(x["commit"] for x in lister_versions(racine) if x["version"] == v)
    return charger_commit(racine, commit, v)


def charger_commit(racine: Path, commit: str, libelle: str) -> Projet:
    """Le projet tel qu'il est dans un commit (étiquette, branche ou empreinte), sans toucher aux fichiers."""
    racine = Path(racine)
    commit = depot.commit(racine, commit) if depot.actif() else _git(racine, "rev-parse", f"{commit}^{{commit}}").strip()
    cle = (str(racine.resolve()), commit)
    if cle in _cache:
        return _cache[cle]
    prefixe = _prefixe_projet(racine)
    if depot.actif():
        dossier = tempfile.TemporaryDirectory(prefix="referentiel-")
        _dossiers.append(dossier)
        depot.extraire(racine, commit, prefixe, Path(dossier.name))
        p = charger(Path(dossier.name) / prefixe)
        p.meta = {**p.meta, "version": libelle}
        _cache[cle] = p
        return p
    # Lancé depuis la racine du dépôt, avec un chemin simple : le pathspec « :(top) » n'est pas honoré par
    # git archive depuis un sous-dossier sur les Git anciens (2.33, par exemple).
    racine_depot = Path(_git(racine, "rev-parse", "--show-toplevel").strip())
    archive = _git(racine_depot, "archive", "--format=tar", commit, *(["--", prefixe] if prefixe else []), binaire=True)
    dossier = tempfile.TemporaryDirectory(prefix="referentiel-")
    _dossiers.append(dossier)
    with tarfile.open(fileobj=io.BytesIO(archive)) as t:
        membres = [m for m in t.getmembers() if not (m.name.startswith("/") or ".." in Path(m.name).parts)]
        try:
            t.extractall(dossier.name, members=membres, filter="data")
        except TypeError:  # Python sans le filtre d'extraction
            t.extractall(dossier.name, members=[m for m in membres if m.isfile() or m.isdir()])
    # Les chemins de l'archive partent de la racine du dépôt : le projet est sous son préfixe.
    p = charger(Path(dossier.name) / prefixe)
    p.meta = {**p.meta, "version": libelle}
    _cache[cle] = p
    return p


# ---------------------------------------------------------------------------
# Comparer
# ---------------------------------------------------------------------------

def _elements(p: Projet) -> dict[str, tuple[str, dict]]:
    """id → (type, contenu) pour tous les éléments, étapes et actions comprises."""
    res = {}
    for attr, type_ in COLLECTIONS.items():
        for i, el in getattr(p, attr).items():
            if attr == "entites":
                el = {k: v for k, v in el.items() if k not in ("statuts", "transitions")}
            res[i] = (type_, el)
    for ent in p.entites.values():
        for s in ent.get("statuts", []):
            res[s["id"]] = ("étape", {**s, "entite": ent["id"]})
        for tr in ent.get("transitions", []):
            res[tr["id"]] = ("action", {**tr, "entite": ent["id"]})
    return res


def _empreinte(el: dict) -> str:
    sans_historique = {k: v for k, v in el.items() if k != "historique"}
    return hashlib.sha1(json.dumps(sans_historique, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def _nom(el: dict) -> str:
    return el.get("nom") or el.get("titre") or el.get("libelle") or ""


def comparer_projets(avant: Projet, apres: Projet) -> list[dict]:
    a, b = _elements(avant), _elements(apres)
    changements = []
    remplacees = {}
    for i, (t, el) in b.items():
        for ancien in (el.get("remplace") or []) if isinstance(el.get("remplace"), list) else ([el["remplace"]] if el.get("remplace") else []):
            remplacees[ancien] = i
    for i, (t, el) in b.items():
        if i not in a:
            changements.append({"id": i, "type": t, "nom": _nom(el), "changement": "ajouté",
                                **({"remplace": el["remplace"]} if el.get("remplace") else {})})
        elif _empreinte(a[i][1]) != _empreinte(el):
            champs = sorted(k for k in set(a[i][1]) | set(el)
                            if k != "historique" and a[i][1].get(k) != el.get(k))
            ch = {"id": i, "type": t, "nom": _nom(el), "changement": "modifié", "champs": champs}
            if a[i][1].get("statut") != el.get("statut") and el.get("statut"):
                ch["statut"] = {"avant": a[i][1].get("statut"), "apres": el.get("statut")}
                if el.get("statut") == "obsolete":
                    ch["changement"] = "remplacé" if i in remplacees else "rendu obsolète"
                    if i in remplacees:
                        ch["remplace_par"] = remplacees[i]
            changements.append(ch)
    for i, (t, el) in a.items():
        if i not in b:
            changements.append({"id": i, "type": t, "nom": _nom(el), "changement": "supprimé"})
    ordre = {"ajouté": 0, "remplacé": 1, "rendu obsolète": 2, "modifié": 3, "supprimé": 4}
    return sorted(changements, key=lambda c: (ordre[c["changement"]], c["type"], c["id"]))


def comparer(racine: Path, de: str, a: str = TRAVAIL) -> dict:
    p1, p2 = charger_version(racine, de), charger_version(racine, a)
    ch = comparer_projets(p1, p2)
    resume = {}
    for c in ch:
        resume[c["changement"]] = resume.get(c["changement"], 0) + 1
    return {"de": p1.meta["version"], "a": p2.meta["version"], "resume": resume, "changements": ch}


# ---------------------------------------------------------------------------
# Histoire d'un élément
# ---------------------------------------------------------------------------

def historique_element(racine: Path, ident: str) -> dict:
    """Dans quelles versions l'élément existe, quand il change, et où il en est sur chaque environnement."""
    etats = []
    precedent = None
    for v in [x["version"] for x in lister_versions(racine)] + [TRAVAIL]:
        el = _elements(charger_version(racine, v)).get(ident)
        empreinte = _empreinte(el[1]) if el else None
        if el and precedent is None:
            evenement = "apparu"
        elif el and empreinte != precedent:
            evenement = "modifié"
        elif not el and precedent is not None:
            evenement = "supprimé"
        else:
            evenement = None
        etats.append({"version": v, "present": bool(el), "statut": el[1].get("statut") if el else None,
                      **({"evenement": evenement} if evenement else {})})
        precedent = empreinte
    par_version = {e["version"]: e for e in etats}
    envs = {}
    for nom, env in environnements(racine).items():
        e = par_version.get(env["spec"])
        envs[nom] = {"spec": env["spec"], "present": bool(e and e["present"]),
                     "identique_au_travail": bool(e and e["present"]) and _identique(racine, ident, env["spec"])}
    return {"id": ident, "versions": etats, "environnements": envs}


def _identique(racine: Path, ident: str, version: str) -> bool:
    a = _elements(charger_version(racine, version)).get(ident)
    b = _elements(charger_version(racine, TRAVAIL)).get(ident)
    return bool(a and b) and _empreinte(a[1]) == _empreinte(b[1])


# ---------------------------------------------------------------------------
# Figer une version (écriture : uniquement après accord explicite)
# ---------------------------------------------------------------------------

def figer_version(racine: Path, version: str, message: str, auteur: str | None = None) -> dict:
    racine = Path(racine)
    if not est_versionne(racine):
        raise ErreurVersion("Le projet n'est pas dans un dépôt Git : impossible de figer une version.")
    v = normaliser(version)
    if v == TRAVAIL or not re.fullmatch(r"\d+(\.\d+){1,2}", v):
        raise ErreurVersion("Numéro de version attendu, par exemple 1.5.")
    existantes = lister_versions(racine)
    if any(x["version"] == v for x in existantes):
        raise ErreurVersion(f"La version {v} existe déjà.")
    if existantes and _cle_version(v) <= _cle_version(existantes[-1]["version"]):
        raise ErreurVersion(f"La version doit être postérieure à la {existantes[-1]['version']}.")
    if depot.actif():
        if depot.modifications(racine):
            raise ErreurVersion("Des changements ne sont pas encore enregistrés dans le dépôt : les valider avant de figer.")
        depot.etiqueter(racine, f"{PREFIXE}{v}", message, auteur)
        return next(x for x in lister_versions(racine) if x["version"] == v)
    if _git(racine, "status", "--porcelain", "--", ".").strip():
        raise ErreurVersion("Des changements ne sont pas encore enregistrés dans le dépôt : les valider avant de figer.")
    args = ["-c", f"user.name={auteur}"] if auteur else []
    if not subprocess.run(["git", "-C", str(racine), "config", "user.email"], capture_output=True, timeout=30).stdout.strip():
        args += ["-c", "user.email=referentiel@local"]
    r = subprocess.run(["git", "-C", str(racine), *args, "tag", "-a", f"{PREFIXE}{v}", "-m", message],
                       capture_output=True, timeout=30)
    if r.returncode != 0:
        raise ErreurVersion(r.stderr.decode("utf-8", "replace").strip())
    return next(x for x in lister_versions(racine) if x["version"] == v)
