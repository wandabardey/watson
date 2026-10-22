"""Consommation de Claude, par projet.

Chaque appel à Claude fait par Watson est noté sur ce poste (projet, usage, jetons, valeur au tarif de l'API, durée),
dans `conso.jsonl` du dossier de données. Avec un abonnement Claude, Claude Code signale aussi la jauge de la session de
5 heures (et de la semaine) : elle vaut pour tout le compte, Watson compris. La part d'un projet dans la session est
estimée par la hausse de la jauge pendant ses appels : c'est un maximum, car un autre usage du compte entre deux appels
de Watson (Claude Code, claude.ai) fait aussi monter la jauge.
"""

from __future__ import annotations

import contextvars
import json
import threading
import time
from pathlib import Path

projet_courant: contextvars.ContextVar = contextvars.ContextVar("watson_projet", default=None)
usage_courant: contextvars.ContextVar = contextvars.ContextVar("watson_usage", default=None)
_verrou = threading.Lock()
CINQ_HEURES = 5 * 3600

USAGES = {"alimenter": "Lecture de documents", "demander": "Questions à Watson", "modifier": "Demandes de changement",
          "sujets": "Mise à jour depuis une question", "cahier": "Cahier des charges", "moodboard": "Moodboard",
          "maquettes": "Maquettes", "proposition": "Proposition commerciale", "comite": "Comité d'experts",
          "ateliers": "Ateliers", "relire": "Relectures et critiques UX", "secteur": "Fiche secteur", "mail": "Mails au client", "evolutions": "Évolutions", "documentation": "Documentation", "recette": "Recette", "elements": "Demandes de changement", "test": "Test des réglages"}


def _dossier() -> Path:
    from .application import dossier_donnees

    return dossier_donnees()


def _journal() -> Path:
    return _dossier() / "conso.jsonl"


def _limites_f() -> Path:
    return _dossier() / "conso-limites.json"


def limites() -> dict:
    try:
        return json.loads(_limites_f().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _jauge(lim: dict | None = None) -> dict:
    return (lim if lim is not None else limites()).get("five_hour") or {}


def debut() -> dict:
    """À appeler avant un appel à Claude : l'état de la jauge de 5 heures à ce moment."""
    j = _jauge()
    return {"t": time.time(), "utilisation": j.get("utilisation"), "fin": j.get("fin")}


def observer(m) -> None:
    """À appeler sur chaque message reçu de Claude : retient la jauge de session quand elle est signalée."""
    info = getattr(m, "rate_limit_info", None)
    if info is None:
        return
    genre = getattr(info, "rate_limit_type", None) or "five_hour"
    entree = {"statut": info.status, "utilisation": info.utilization, "fin": info.resets_at, "vu": time.time()}
    with _verrou:
        lim = limites()
        ancien = lim.get(genre) or {}
        if entree["utilisation"] is None and ancien.get("fin") == entree["fin"]:
            entree["utilisation"] = ancien.get("utilisation")
        lim[genre] = entree
        try:
            _limites_f().write_text(json.dumps(lim), encoding="utf-8")
        except OSError:
            pass


def noter(depart: dict, resultat, modele: str | None = None) -> None:
    """À appeler avec le résultat d'un appel : l'appel rejoint le journal du projet courant."""
    if resultat is None:
        return
    u = getattr(resultat, "usage", None) or {}
    j = _jauge()
    hausse = None
    if j.get("utilisation") is not None and (j.get("vu") or 0) >= depart["t"]:
        if depart.get("fin") == j.get("fin") and depart.get("utilisation") is not None:
            hausse = max(0.0, j["utilisation"] - depart["utilisation"])
        elif depart.get("fin") and depart["fin"] <= depart["t"] and j.get("fin") != depart["fin"]:
            hausse = j["utilisation"]  # la session précédente était finie : cet appel a ouvert la nouvelle
    ligne = {"t": round(time.time()), "projet": projet_courant.get(), "usage": usage_courant.get() or "autre",
             "modele": modele, "entree": int(u.get("input_tokens") or 0), "sortie": int(u.get("output_tokens") or 0),
             "cache_lu": int(u.get("cache_read_input_tokens") or 0), "cache_ecrit": int(u.get("cache_creation_input_tokens") or 0),
             "valeur_usd": getattr(resultat, "total_cost_usd", None), "duree_ms": getattr(resultat, "duration_ms", None),
             "erreur": bool(getattr(resultat, "is_error", False)), "hausse_jauge": hausse}
    with _verrou:
        try:
            with _journal().open("a", encoding="utf-8") as f:
                f.write(json.dumps(ligne) + "\n")
        except OSError:
            pass


def _lignes() -> list[dict]:
    try:
        texte = _journal().read_text(encoding="utf-8")
    except OSError:
        return []
    r = []
    for l in texte.splitlines():
        try:
            r.append(json.loads(l))
        except ValueError:
            continue
    return r


def _cumul(lignes: list[dict]) -> dict:
    return {"appels": len(lignes),
            "jetons": sum(x["entree"] + x["sortie"] + x["cache_lu"] + x["cache_ecrit"] for x in lignes),
            "jetons_sortie": sum(x["sortie"] for x in lignes),
            "valeur_usd": round(sum(x.get("valeur_usd") or 0 for x in lignes), 4)}


def vue(pid: str, maintenant: float | None = None) -> dict:
    from .assistant import mode_auth

    maintenant = maintenant or time.time()
    lignes = _lignes()
    du_projet = [x for x in lignes if x.get("projet") == pid]
    lim = limites()
    j = _jauge(lim)
    session = None
    if j.get("fin") and j["fin"] > maintenant:
        debut_s = j["fin"] - CINQ_HEURES
        dans = [x for x in lignes if x["t"] >= debut_s]
        projet_s = [x for x in dans if x.get("projet") == pid]
        hausses = [x["hausse_jauge"] for x in projet_s if x.get("hausse_jauge") is not None]
        session = {"utilisation": j.get("utilisation"), "statut": j.get("statut"), "fin": j["fin"], "debut": debut_s,
                   "projet": _cumul(projet_s), "watson": _cumul(dans),
                   "part_projet_max": round(sum(hausses), 4) if hausses else None,
                   "appels_mesures": len(hausses)}
    semaine = lim.get("seven_day") if (lim.get("seven_day") or {}).get("fin", 0) > maintenant else None
    periodes = []
    for cle, libelle, duree in (("jour", "Dernières 24 heures", 86400), ("semaine", "7 derniers jours", 7 * 86400),
                                ("mois", "30 derniers jours", 30 * 86400)):
        periodes.append({"cle": cle, "libelle": libelle, **_cumul([x for x in du_projet if x["t"] >= maintenant - duree])})
    mois = [x for x in du_projet if x["t"] >= maintenant - 30 * 86400]
    par_usage = {}
    for x in mois:
        par_usage.setdefault(x["usage"], []).append(x)
    usages = sorted(({"usage": USAGES.get(k, "Autre"), **_cumul(v)} for k, v in par_usage.items()), key=lambda d: -d["jetons"])
    return {"mode": mode_auth(), "session": session, "semaine": semaine, "periodes": periodes, "usages": usages,
            "total": _cumul(du_projet), "derniers": [{**x, "usage": USAGES.get(x["usage"], "Autre")} for x in du_projet[-12:][::-1]],
            "depuis": du_projet[0]["t"] if du_projet else None}
