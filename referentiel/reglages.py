"""Réglages de l'application, propres à ce poste : modèle Claude et niveau de réflexion.

Rangés dans le dossier de données de Watson (reglages.json). Les variables REFERENTIEL_MODELE et
REFERENTIEL_EFFORT, si elles sont posées, l'emportent (usage en ligne de commande et tests).
"""

from __future__ import annotations

import json
import os

MODELES = [
    {"id": "claude-opus-5-5", "nom": "Opus 5.5", "description": "Le plus fin : lectures et réponses les plus justes, un peu plus lent."},
    {"id": "claude-sonnet-5-5", "nom": "Sonnet 5.5", "description": "Équilibré : très bon et plus rapide."},
    {"id": "claude-haiku-5-5", "nom": "Haiku 5.5", "description": "Le plus rapide et le plus léger, pour des questions simples."},
]
EFFORTS = [
    {"id": "low", "nom": "Faible", "description": "Répond vite, réfléchit peu."},
    {"id": "medium", "nom": "Moyen", "description": "Le bon compromis pour la plupart des usages."},
    {"id": "high", "nom": "Élevé", "description": "Réfléchit davantage : documents longs ou ambigus."},
    {"id": "max", "nom": "Maximum", "description": "Réflexion la plus poussée, nettement plus lent."},
]
DEFAUT = {"modele": "claude-opus-5-5", "effort": "medium"}


class ErreurReglages(Exception):
    """Erreur présentable telle quelle."""


def _fichier():
    from .application import dossier_donnees

    return dossier_donnees() / "reglages.json"


def lire() -> dict:
    r = dict(DEFAUT)
    try:
        f = _fichier()
        if f.exists():
            r.update({k: v for k, v in json.loads(f.read_text(encoding="utf-8")).items() if k in DEFAUT and v})
    except (OSError, ValueError):
        pass
    return r


def ecrire(changements: dict) -> dict:
    r = lire()
    modele = (changements.get("modele") or r["modele"]).strip()
    effort = changements.get("effort") or r["effort"]
    if not modele or len(modele) > 80 or " " in modele:
        raise ErreurReglages("Identifiant de modèle invalide.")
    if effort not in [e["id"] for e in EFFORTS]:
        raise ErreurReglages("Niveau de réflexion inconnu.")
    r.update(modele=modele, effort=effort)
    _fichier().write_text(json.dumps(r, indent=2), encoding="utf-8")
    return r


def modele() -> str:
    return os.environ.get("REFERENTIEL_MODELE") or lire()["modele"]


def effort() -> str:
    return os.environ.get("REFERENTIEL_EFFORT") or lire()["effort"]


def nom_modele(ident: str | None) -> str:
    """« Opus 5.5 » pour claude-opus-5-5 ; l'identifiant tel quel s'il est inconnu."""
    for m in MODELES:
        if ident and (ident == m["id"] or ident.startswith(m["id"])):
            return m["nom"]
    return ident or "modèle par défaut"


def vue() -> dict:
    r = lire()
    return {**r, "modeles": MODELES, "efforts": EFFORTS, "nom_modele": nom_modele(r["modele"]),
            "impose_par_variable": bool(os.environ.get("REFERENTIEL_MODELE") or os.environ.get("REFERENTIEL_EFFORT"))}
