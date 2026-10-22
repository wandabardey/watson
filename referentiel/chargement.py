"""Chargement d'un projet : lit les fichiers YAML, valide leur structure, construit l'index."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from . import schemas
from ._vendor import yaml
from .validation import erreurs as erreurs_schema


@dataclass
class Projet:
    racine: Path
    meta: dict = field(default_factory=dict)
    acteurs: dict = field(default_factory=dict)
    entites: dict = field(default_factory=dict)
    listes: dict = field(default_factory=dict)
    regles: dict = field(default_factory=dict)
    cas_usage: dict = field(default_factory=dict)
    ecrans: dict = field(default_factory=dict)
    decisions_trous: dict = field(default_factory=dict)
    fichiers: dict = field(default_factory=dict)  # id -> chemin relatif
    erreurs: list = field(default_factory=list)  # erreurs de structure

    # Index dérivés
    @property
    def transitions(self) -> dict:
        """id de transition -> (entité, transition)."""
        index = {}
        for ent in self.entites.values():
            for tr in ent.get("transitions", []):
                index[tr["id"]] = (ent, tr)
        return index


ATTRIBUTS_PAR_DOSSIER = {
    "acteurs": "acteurs",
    "listes": "listes",
    "entites": "entites",
    "regles": "regles",
    "cas-usage": "cas_usage",
    "ecrans": "ecrans",
}


class _Chargeur(yaml.SafeLoader):
    """Chargeur YAML qui garde les dates comme texte (AAAA-MM-JJ), plus simple à comparer et à réécrire."""


_Chargeur.yaml_implicit_resolvers = {
    cle: [(tag, regex) for tag, regex in valeurs if tag != "tag:yaml.org,2002:timestamp"]
    for cle, valeurs in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def _lire_yaml(chemin: Path, projet: Projet):
    try:
        with chemin.open(encoding="utf-8") as f:
            return yaml.load(f, Loader=_Chargeur)
    except yaml.YAMLError as e:
        projet.erreurs.append(f"{chemin.relative_to(projet.racine)} : YAML illisible ({e})")
        return None


def _valider(donnees, schema, chemin: Path, projet: Projet) -> bool:
    erreurs = erreurs_schema(donnees, schema)
    for lieu, message in erreurs:
        lieu = "/".join(str(p) for p in lieu) or "(racine)"
        projet.erreurs.append(f"{chemin.relative_to(projet.racine)} [{lieu}] : {message}")
    return not erreurs


def charger(racine: str | Path) -> Projet:
    racine = Path(racine).resolve()
    projet = Projet(racine=racine)

    fichier_projet = racine / "projet.yaml"
    if not fichier_projet.exists():
        projet.erreurs.append("projet.yaml introuvable : ce dossier n'est pas un projet")
        return projet
    meta = _lire_yaml(fichier_projet, projet)
    if meta is not None and _valider(meta, schemas.PROJET, fichier_projet, projet):
        projet.meta = meta

    for dossier, (schema, libelle) in schemas.TYPES.items():
        cible = getattr(projet, ATTRIBUTS_PAR_DOSSIER[dossier])
        for chemin in sorted((racine / dossier).glob("*.y*ml")):
            donnees = _lire_yaml(chemin, projet)
            if donnees is None or not _valider(donnees, schema, chemin, projet):
                continue
            ident = donnees["id"]
            if ident in projet.fichiers:
                projet.erreurs.append(
                    f"{chemin.relative_to(racine)} : identifiant {ident} déjà utilisé "
                    f"dans {projet.fichiers[ident]}"
                )
                continue
            cible[ident] = donnees
            projet.fichiers[ident] = str(chemin.relative_to(racine))

    for ent in projet.entites.values():  # entité sans cycle de vie : listes vides, pour simplifier la lecture
        ent.setdefault("statuts", [])
        ent.setdefault("transitions", [])

    fichier_trous = racine / "trous.yaml"
    if fichier_trous.exists():
        liste = _lire_yaml(fichier_trous, projet) or []
        for i, dec in enumerate(liste):
            if _valider(dec, schemas.DECISION_TROU, fichier_trous, projet):
                projet.decisions_trous[dec["trou"]] = dec

    return projet
