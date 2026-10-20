"""Quelle version de code applique quelle version de spec.

Deux horloges : la spec (ce que le métier a décidé, versions 1.4, 1.5…) et le code (ce qui est livré, application
par application : Portail 2.2.1, App 1.7.0…). Le lien est déclaré par le code lui-même, à chaque livraison :

- soit le fichier de référence généré par `python -m referentiel contexte -o REFERENTIEL.md` et rangé dans le dépôt
  de code ; sa première ligne dit `<!-- referentiel: FRET-DEMO spec 1.5 -->` ;
- soit le message de l'étiquette de livraison, s'il contient « spec 1.5 ».

L'outil lit les dépôts de code déclarés dans projet.yaml (applications) en lecture seule, étiquette par étiquette.
Avec versions.yaml, qui dit quelle version de chaque application tourne sur chaque environnement, il en déduit
où en est chaque application par rapport à la spec visée :

- « à jour » : elle applique la spec visée ;
- « conforme » : elle applique une spec plus ancienne, mais rien de ce qui a changé depuis ne la concerne ;
- « en retard » : des changements la concernant ne sont pas encore livrés (ils sont listés) ;
- « en avance » : elle applique une spec plus récente que celle visée par l'environnement ;
- « inconnue » : la version livrée ne déclare pas de spec.

Un élément concerne une application s'il le dit (champ applications) ; une règle sans ce champ concerne les
applications des actions qui la citent ; sans indication, un élément concerne toutes les applications.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .chargement import Projet, charger
from .versions import TRAVAIL, ErreurVersion, _cle_version, charger_version, comparer_projets, environnements, normaliser

MARQUE = re.compile(r"referentiel:\s*(\S+)\s+spec\s+(\d+(?:\.\d+)+|travail)", re.I)
DANS_ETIQUETTE = re.compile(r"\bspec[\s-]*(\d+(?:\.\d+)+)", re.I)
ETATS = ["à jour", "conforme", "en retard", "en avance", "inconnue"]


def marque(p: Projet) -> str:
    """Première ligne du fichier de référence : c'est elle que l'outil relit dans les dépôts de code."""
    return f"<!-- referentiel: {p.meta.get('id', '?')} spec {p.meta.get('version', TRAVAIL)} -->"


def _git(depot: Path, *args) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(depot), *args], capture_output=True, timeout=30)
    except OSError:
        return None
    return r.stdout.decode("utf-8", "replace") if r.returncode == 0 else None


def applications(p: Projet) -> list[dict]:
    return list(p.meta.get("applications") or [])


def _depot(racine: Path, app: dict) -> Path | None:
    if not app.get("depot"):
        return None
    d = Path(app["depot"]).expanduser()
    return d if d.is_absolute() else (Path(racine) / d).resolve()


def livraisons(racine: Path, app: dict, projet_id: str | None = None) -> list[dict]:
    """Les versions livrées d'une application (étiquettes de son dépôt) et la spec que chacune déclare."""
    depot = _depot(racine, app)
    if not depot or _git(depot, "rev-parse", "--git-dir") is None:
        return []
    motif = app.get("etiquettes", "v*")
    fichier = app.get("fichier", "REFERENTIEL.md")
    sortie = _git(depot, "for-each-ref", f"refs/tags/{motif}", "--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)") or ""
    resultat = []
    for ligne in sortie.splitlines():
        tag, date, message = (ligne.split("\t") + ["", ""])[:3]
        spec, source = None, None
        contenu = _git(depot, "show", f"{tag}:{fichier}")
        if contenu:
            m = MARQUE.search(contenu[:500])
            if m and (not projet_id or m.group(1) == projet_id):
                spec, source = normaliser(m.group(2)), "fichier"
        if spec is None:
            m = DANS_ETIQUETTE.search(message or "")
            if m:
                spec, source = m.group(1), "etiquette"
        resultat.append({"version": tag[1:] if tag[:1] == "v" and tag[1:2].isdigit() else tag, "etiquette": tag,
                         "date": date, "spec": spec, "source": source})
    return sorted(resultat, key=lambda x: _cle_version(x["version"]) if re.match(r"\d", x["version"]) else (0,))


# ---------------------------------------------------------------------------
# Ce qui concerne une application
# ---------------------------------------------------------------------------

def _apps_element(p: Projet, ident: str, toutes: set[str]) -> set[str]:
    """Applications concernées par un élément (toutes, faute d'indication)."""
    el = None
    for coll in (p.regles, p.ecrans, p.acteurs, p.cas_usage, p.entites):
        if ident in coll:
            el = coll[ident]
    if el is None and ident in p.transitions:
        el = p.transitions[ident][1]
    if el is None:
        return toutes
    if el.get("applications"):
        return set(el["applications"])
    if ident in p.regles:
        apps = set()
        for _, (_, tr) in p.transitions.items():
            if ident in (tr.get("regles") or []):
                apps |= set(tr.get("applications") or toutes)
        return apps or toutes
    return toutes


def changements_pour(racine: Path, de: str, a: str, app_id: str) -> list[dict]:
    """Changements entre deux versions de spec qui concernent une application."""
    p_de, p_a = charger_version(racine, de), charger_version(racine, a)
    toutes = {x["id"] for x in applications(p_a)} or {app_id}
    resultat = []
    for c in comparer_projets(p_de, p_a):
        # L'attribution la plus récente fait foi ; celle d'avant seulement pour un élément supprimé.
        apps = _apps_element(p_de if c["changement"] == "supprimé" else p_a, c["id"], toutes)
        if app_id in apps:
            resultat.append(c)
    return resultat


def etat(racine: Path, app_id: str, declaree: str | None, visee: str) -> dict:
    if not declaree:
        return {"etat": "inconnue", "changements": []}
    if declaree == visee:
        return {"etat": "à jour", "changements": []}
    if visee != TRAVAIL and declaree != TRAVAIL and _cle_version(declaree) > _cle_version(visee):
        return {"etat": "en avance", "changements": []}
    try:
        manque = changements_pour(racine, declaree, visee, app_id)
    except ErreurVersion as e:
        return {"etat": "inconnue", "changements": [], "erreur": str(e)}
    return {"etat": "en retard" if manque else "conforme", "changements": manque}


def correspondance(racine: Path) -> dict:
    """Pour chaque environnement : la spec visée, et pour chaque application la version livrée, la spec qu'elle
    déclare et son état. Plus la liste des livraisons de chaque application."""
    racine = Path(racine)
    p = charger(racine)
    apps = applications(p)
    par_nom = {a["nom"].lower(): a for a in apps} | {a["id"].lower(): a for a in apps}
    livrees = {a["id"]: livraisons(racine, a, p.meta.get("id")) for a in apps}
    envs = {}
    for nom, env in environnements(racine).items():
        visee = env.get("spec", TRAVAIL)
        lignes = []
        for nom_app, version in (env.get("applications") or {}).items():
            app = par_nom.get(str(nom_app).lower())
            version = str(version)
            declaree = None
            if app:
                declaree = next((l["spec"] for l in livrees[app["id"]] if l["version"] == version or l["etiquette"] == version), None)
            e = etat(racine, app["id"], declaree, visee) if app else {"etat": "inconnue", "changements": []}
            lignes.append({"application": app["nom"] if app else nom_app, "id": app["id"] if app else None,
                           "version": version, "spec_declaree": declaree, **e})
        envs[nom] = {"spec_visee": visee, "applications": lignes,
                     "complet": all(l["etat"] in ("à jour", "conforme") for l in lignes)}
    return {"environnements": envs,
            "livraisons": {a["nom"]: livrees[a["id"]] for a in apps},
            "sans_depot": [a["nom"] for a in apps if not _depot(racine, a)]}
