"""Avancement par écran : de la maquette au code livré.

Chaque écran de la base est d'abord imaginé (une maquette), puis validé, puis codé sur une branche, fusionné dans le
code, et enfin livré dans une version de l'application. C'est ce qui sépare ce qui existe vraiment de ce qu'une
évolution de spec imagine.

Le lien entre un écran et son code (fichiers du dépôt de l'application, et l'adresse de l'écran dans l'application
pour l'app en direct) est rangé dans `code/ecrans.yaml` du dépôt de connaissance. Watson lit le dépôt de code de
l'application sur ce poste, en lecture seule, avec git : branche principale, autres branches, étiquettes de
livraison, modifications non enregistrées.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from ._vendor import yaml
from .chargement import charger
from .ecriture import dump
from .livraisons import _depot, _git

ETATS = {"a_maquetter": "Pas encore maquetté", "maquette": "Maquetté", "maquette_validee": "Maquette validée",
         "en_cours": "Travail local en cours", "en_code": "Dans le code, pas encore livré", "livre": "Livré"}
ORDRE = list(ETATS)
EXTENSIONS = (".ts", ".tsx", ".jsx", ".js", ".vue", ".html", ".svelte", ".kt", ".swift", ".dart")
VIDES = {"de", "du", "des", "la", "le", "les", "un", "une", "d", "l", "et", "a", "en", "par", "pour", "sur", "au", "aux", "ecran"}


class ErreurAvancement(Exception):
    pass


def _fichier(racine: Path) -> Path:
    return Path(racine) / "code" / "ecrans.yaml"


def liens(racine: Path) -> dict:
    f = _fichier(racine)
    d = (yaml.safe_load(f.read_text(encoding="utf-8")) or {}) if f.exists() else {}
    return d.get("ecrans") or {}


def lier(racine: Path, ecran: str, fichiers: list[str] | None = None, route: str | None = None) -> dict:
    p = charger(racine)
    if ecran not in p.ecrans:
        raise ErreurAvancement("Écran inconnu.")
    tous = liens(racine)
    e = dict(tous.get(ecran) or {})
    if fichiers is not None:
        propres = []
        for x in fichiers:
            x = str(x).strip().replace("\\", "/")
            while x.startswith("./"):
                x = x[2:]
            if x and not x.startswith("/") and ".." not in x.split("/") and x not in propres:
                propres.append(x)
        e["fichiers"] = propres
    if route is not None:
        r = str(route).strip()
        if r and not r.startswith("/"):
            r = "/" + r
        e["route"] = r
    e = {k: v for k, v in e.items() if v}
    if e:
        tous[ecran] = e
    else:
        tous.pop(ecran, None)
    f = _fichier(racine)
    f.parent.mkdir(exist_ok=True)
    f.write_text("# Lien entre les écrans de la base et le code de l'application : fichiers, adresse dans l'application.\n"
                 + dump({"ecrans": dict(sorted(tous.items()))}), encoding="utf-8")
    return e


# ---------------------------------------------------------------- lecture du dépôt de code

class Depot:
    """Ce qu'il faut savoir d'un dépôt de code, lu une fois par vue."""

    def __init__(self, chemin: Path):
        self.chemin = chemin
        self.ok = chemin is not None and _git(chemin, "rev-parse", "--git-dir") is not None
        self.principale = self._principale() if self.ok else None
        self.branches = [b for b in (_git(chemin, "for-each-ref", "refs/heads", "--format=%(refname:short)") or "").split() if b != self.principale] if self.ok else []
        self._etiquettes: dict[str, list[str]] = {}

    def _principale(self) -> str | None:
        ref = (_git(self.chemin, "symbolic-ref", "--short", "refs/remotes/origin/HEAD") or "").strip()
        if ref:
            nom = ref.split("/", 1)[-1]
            if _git(self.chemin, "rev-parse", "--verify", "--quiet", nom) is not None:
                return nom
        for b in ("main", "master", "develop"):
            if _git(self.chemin, "rev-parse", "--verify", "--quiet", b) is not None:
                return b
        return (_git(self.chemin, "rev-parse", "--abbrev-ref", "HEAD") or "").strip() or None

    def etiquette(self, commit: str) -> str | None:
        """La première étiquette de livraison qui contient ce commit."""
        if commit not in self._etiquettes:
            self._etiquettes[commit] = (_git(self.chemin, "tag", "--contains", commit, "--sort=creatordate") or "").split()
        t = self._etiquettes[commit]
        return t[0] if t else None

    def fichiers(self) -> list[str]:
        return (_git(self.chemin, "ls-files") or "").splitlines() if self.ok else []

    def code(self, fichiers: list[str]) -> dict:
        r = {"existe": [], "manquants": [], "derniere": None, "introduit": None, "livre_dans": None, "derniere_livree": None,
             "branches": [], "non_enregistre": False}
        if not self.ok or not fichiers:
            return r
        for f in fichiers:
            (r["existe"] if _git(self.chemin, "cat-file", "-e", f"{self.principale}:{f}") is not None else r["manquants"]).append(f)
        if r["existe"]:
            der = (_git(self.chemin, "log", "-1", "--format=%H%x09%cs%x09%s", self.principale, "--", *r["existe"]) or "").strip()
            if der:
                h, d, s = (der.split("\t") + ["", ""])[:3]
                r["derniere"] = {"commit": h[:10], "date": d, "message": s[:120]}
                r["derniere_livree"] = self.etiquette(h)
            intro = (_git(self.chemin, "log", "--diff-filter=A", "--format=%H", self.principale, "--", *r["existe"]) or "").split()
            if intro:
                r["introduit"] = intro[-1][:10]
                r["livre_dans"] = self.etiquette(intro[-1])
        for b in self.branches:
            l = (_git(self.chemin, "log", f"{self.principale}..{b}", "--format=%cs%x09%s", "--", *fichiers) or "").splitlines()
            if l:
                d, s = (l[0].split("\t") + [""])[:2]
                r["branches"].append({"nom": b, "commits": len(l), "date": d, "message": s[:120]})
        r["non_enregistre"] = bool((_git(self.chemin, "status", "--porcelain", "--", *fichiers) or "").strip())
        return r


def _mots(texte: str) -> list[str]:
    s = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode().lower()
    return [m for m in re.split(r"[^a-z0-9]+", s) if len(m) > 2 and m not in VIDES]


def suggestions(racine: Path, ecran: str, limite: int = 8) -> list[dict]:
    """Les fichiers du dépôt qui ressemblent le plus à l'écran : mots de son nom et de son adresse dans les chemins."""
    p = charger(racine)
    e = p.ecrans.get(ecran)
    if not e:
        raise ErreurAvancement("Écran inconnu.")
    app = _application(p, e)
    depot = _depot(racine, app) if app else None
    if not depot:
        raise ErreurAvancement("L'application de cet écran n'a pas de dépôt de code sur ce poste : indique-le dans Passage en code, Réglages de l'application.")
    d = Depot(depot)
    if not d.ok:
        raise ErreurAvancement(f"Pas de dépôt git lisible dans {depot}.")
    mots = set(_mots(e.get("nom", "")) + _mots((liens(racine).get(ecran) or {}).get("route", "")))
    if not mots:
        return []
    notes = []
    for f in d.fichiers():
        if not f.endswith(EXTENSIONS) or re.search(r"(^|/)(node_modules|dist|e2e)/|\.(spec|test|stories)\.", f):
            continue
        mf = set(_mots(f.replace("/", " ")))
        commun = mots & {m for x in mf for m in mots if x.startswith(m[:5]) or m.startswith(x[:5])}
        if commun:
            notes.append((len(commun) + (0.5 if re.search(r"(page|screen|ecran|view|component)", f) else 0), f))
    notes.sort(key=lambda x: (-x[0], len(x[1])))
    return [{"fichier": f, "score": round(s, 1)} for s, f in notes[:limite]]


def _application(p, e) -> dict | None:
    apps = {a["id"]: a for a in p.meta.get("applications") or []}
    ids = e.get("applications") or []
    return apps.get(ids[0]) if ids else (next(iter(apps.values())) if len(apps) == 1 else None)


# ---------------------------------------------------------------- vue

def vue(racine: Path) -> dict:
    from .design_system import lire as lire_systeme
    from .maquettes import lire_index

    p = charger(racine)
    idx = lire_index(racine)
    tous = liens(racine)
    depots: dict[str, Depot] = {}
    ds = lire_systeme(racine)
    lignes = []
    for eid, e in sorted(p.ecrans.items()):
        app = _application(p, e)
        maqs = sorted([m for m in idx["maquettes"] if m.get("ecran") == eid], key=lambda m: str(m.get("date", "")))
        validee = next((m for m in reversed(maqs) if m.get("validee")), None)
        derniere = maqs[-1] if maqs else None
        lien = tous.get(eid) or {}
        code = None
        if app and _depot(racine, app):
            if app["id"] not in depots:
                depots[app["id"]] = Depot(_depot(racine, app))
            code = depots[app["id"]].code(lien.get("fichiers") or [])
        etat = "a_maquetter"
        if derniere:
            etat = "maquette"
        if validee:
            etat = "maquette_validee"
        if code and (code["branches"] or code["non_enregistre"]):
            etat = "en_cours"
        if code and code["existe"]:
            etat = "livre" if code["livre_dans"] else "en_code"
        alertes = []
        if code and code["existe"] and code["livre_dans"] and not code["derniere_livree"]:
            alertes.append("Modifié dans le code depuis la dernière livraison")
        if code and code["manquants"] and not code["branches"]:
            alertes.append(f"{len(code['manquants'])} fichier(s) introuvable(s) sur la branche principale")
        if code and code["existe"] and derniere and code["derniere"] and str(derniere.get("date", "")) > code["derniere"]["date"]:
            alertes.append("Maquette plus récente que le code : évolution à reporter")
        if code and code["branches"] and etat in ("livre", "en_code"):
            alertes.append("Évolution en cours sur " + ", ".join(b["nom"] for b in code["branches"]))
        if ds and derniere and not derniere.get("systeme") and etat in ("maquette", "maquette_validee"):
            alertes.append("Maquette dessinée avant le design system")
        lignes.append({"id": eid, "nom": e.get("nom", eid), "version": e.get("version", ""), "application": (app or {}).get("id", ""),
                       "application_nom": (app or {}).get("nom", ""), "etat": etat, "etat_libelle": ETATS[etat],
                       "maquettes": len(maqs), "maquette": {k: derniere.get(k) for k in ("id", "titre", "date", "validee")} if derniere else None,
                       "validee": {k: validee.get(k) for k in ("id", "titre", "validee", "validee_par")} if validee else None,
                       "fichiers": lien.get("fichiers") or [], "route": lien.get("route", ""), "code": code,
                       "depot": bool(app and _depot(racine, app)), "alertes": alertes})
    compte = {k: sum(1 for x in lignes if x["etat"] == k) for k in ETATS}
    return {"ecrans": lignes, "compte": compte, "etats": ETATS,
            "applications": [{"id": a["id"], "nom": a["nom"], "depot": bool(_depot(racine, a)),
                              "principale": depots[a["id"]].principale if a["id"] in depots else None} for a in p.meta.get("applications") or []],
            "versions": [v["id"] for v in p.meta.get("versions_produit") or []]}
