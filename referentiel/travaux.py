"""Ce que Watson est en train de faire : chaque appel à Claude est suivi (projet, usage, phase, texte déjà écrit),
pour qu'on voie l'avancée depuis n'importe quel écran, et qu'on retrouve le résultat après être parti ailleurs.

Le travail continue dans le moteur même si on quitte l'écran : le résultat est rangé (lot à trier, proposition en
attente…) et l'écran le montre au retour. Gardé en mémoire seulement : un travail en cours au moment où Watson se
ferme est perdu, et les travaux finis sont oubliés au bout d'une heure.
"""

from __future__ import annotations

import threading
import time
import uuid

PHASES = {"prepare": "Watson prépare la demande", "lit": "Watson lit", "reflechit": "Watson réfléchit", "ecrit": "Watson écrit",
          "verifie": "Watson vérifie et range le résultat"}
# Où se trouve le résultat de chaque usage (écran de l'application).
ECRANS = {"alimenter": "alimenter", "demander": "demander", "modifier": "projet", "elements": "projet", "sujets": "sujets",
          "cahier": "cahier", "moodboard": "moodboard", "maquettes": "maquettes", "proposition": "proposition", "chiffrage": "proposition",
          "ecrite": "proposition", "comite": "comite", "ateliers": "ateliers", "relire": "projet", "secteur": "secteur", "mail": "projet",
          "evolutions": "evolutions", "documentation": "documentation", "recette": "recette", "crud": "crud", "specifications": "specifications", "code": "code", "watson": "watson"}
_verrou = threading.Lock()
_travaux: dict[str, dict] = {}
GARDE = 3600


def debut(pid: str | None, usage: str | None) -> str:
    from .conso import USAGES

    tid = uuid.uuid4().hex[:10]
    with _verrou:
        _purger()
        _travaux[tid] = {"id": tid, "projet": pid, "usage": usage or "", "libelle": USAGES.get(usage or "", "Travail de Watson"),
                         "ecran": ECRANS.get(usage or "", "projet"), "debut": time.time(), "fin": None, "etat": "en_cours",
                         "phase": "lit", "caracteres": 0, "reflexion": 0, "erreur": ""}
    return tid


def avancer(tid: str | None, phase: str | None = None, caracteres: int = 0, reflexion: int = 0):
    if not tid:
        return
    with _verrou:
        t = _travaux.get(tid)
        if not t:
            return
        if phase:
            t["phase"] = phase
        t["caracteres"] += caracteres
        t["reflexion"] += reflexion


def finir(tid: str | None, erreur: str = ""):
    if not tid:
        return
    with _verrou:
        t = _travaux.get(tid)
        if t:
            t.update(etat="erreur" if erreur else "fini", fin=time.time(), erreur=erreur[:300], phase="verifie" if not erreur else t["phase"])


def _purger():
    maintenant = time.time()
    for k in [k for k, t in _travaux.items() if t["fin"] and maintenant - t["fin"] > GARDE]:
        del _travaux[k]


def vue(pid: str | None = None) -> dict:
    maintenant = time.time()
    with _verrou:
        _purger()
        liste = [dict(t) for t in _travaux.values() if pid is None or t["projet"] == pid]
    for t in liste:
        t["duree_s"] = round((t["fin"] or maintenant) - t["debut"])
        t["phase_libelle"] = PHASES.get(t["phase"], "")
    liste.sort(key=lambda t: -t["debut"])
    return {"en_cours": [t for t in liste if t["etat"] == "en_cours"], "finis": [t for t in liste if t["etat"] != "en_cours"][:10]}


def observer(tid: str | None, m) -> None:
    """Suit le flux de Claude : réflexion, puis texte écrit, caractère après caractère."""
    if not tid:
        return
    ev = getattr(m, "event", None)
    if not isinstance(ev, dict):
        return
    if ev.get("type") == "content_block_delta":
        d = ev.get("delta") or {}
        if d.get("type") == "thinking_delta":
            avancer(tid, "reflechit", reflexion=len(d.get("thinking") or ""))
        elif d.get("type") == "text_delta":
            avancer(tid, "ecrit", caracteres=len(d.get("text") or ""))
    elif ev.get("type") == "content_block_start" and (ev.get("content_block") or {}).get("type") == "thinking":
        avancer(tid, "reflechit")
