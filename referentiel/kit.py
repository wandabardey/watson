"""Le kit de présentation 4SH : les visuels du modèle de présentation (photos en losanges, coin rouge, losanges
décoratifs, encoche, logos) et le bloc « Présentation de 4SH » réutilisable (piliers, engagements, équipe, références).

Le kit appartient à 4SH : il n'est jamais dans Watson ni dans ses dépôts. On l'importe une fois depuis un dossier du poste ;
Watson le range dans son dossier de données et s'en sert pour mettre le deck à la charte. Sans kit, le deck garde les
couleurs et la typographie de la charte, sans les visuels (on ne les redessine jamais).
"""

from __future__ import annotations

import base64
import shutil
from pathlib import Path

from ._vendor import yaml

IMAGES = [
    "couverture-photos-losanges.png", "intercalaire-fond-pictos.png", "intercalaire-photos-losanges.png", "fin-photos-losanges.png",
    "illustration-photo-rouge.png", "contenu-coin-rouge.png", "fond-rouge-coin-blanc.png", "losanges-decoratifs-rouges.png",
    "losanges-decoratifs-blancs.png", "colonne-rouge-encoche-blanche.png", "colonne-rouge-fleche-rouge.png", "logo-4sh-couleur.png",
    "logo-4sh-developpez-vos-idees.png", "logo-4sh-blanc.png",
]
PRESENTATION = "presentation-4sh.yaml"
EXTENSIONS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


class ErreurKit(Exception):
    pass


def dossier() -> Path:
    from .application import dossier_donnees

    return dossier_donnees() / "kit-presentation"


def etat() -> dict:
    d = dossier()
    presentes = sorted(f.name for f in d.iterdir() if f.suffix.lower() in EXTENSIONS) if d.is_dir() else []
    pres = lire_presentation()
    return {"present": "logo-4sh-couleur.png" in presentes, "images": presentes, "manquantes": [x for x in IMAGES if x not in presentes],
            "presentation": len(pres.get("slides") or []), "releve": pres.get("releve", ""), "chemin": str(d)}


def importer(source: str) -> dict:
    s = Path(source).expanduser()
    if not s.is_dir():
        raise ErreurKit("Ce dossier n'existe pas sur ce poste.")
    if not (s / "logo-4sh-couleur.png").exists():
        raise ErreurKit("Ce dossier ne ressemble pas au kit de présentation 4SH : il n'y a pas « logo-4sh-couleur.png ».")
    d = dossier()
    d.mkdir(parents=True, exist_ok=True)
    for f in s.iterdir():
        if f.is_file() and (f.suffix.lower() in EXTENSIONS or f.name == PRESENTATION) and f.stat().st_size < 8_000_000:
            shutil.copy2(f, d / f.name)
    return etat()


def oublier() -> dict:
    d = dossier()
    if d.is_dir():
        shutil.rmtree(d)
    return etat()


def images() -> dict[str, str]:
    """Les visuels du kit en adresses data:, prêts pour l'aperçu et l'export des slides."""
    d = dossier()
    r = {}
    if d.is_dir():
        for f in sorted(d.iterdir()):
            t = EXTENSIONS.get(f.suffix.lower())
            if t:
                r[f.name] = f"data:{t};base64," + base64.b64encode(f.read_bytes()).decode()
    return r


def lire_presentation() -> dict:
    f = dossier() / PRESENTATION
    if not f.exists():
        return {}
    try:
        return yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001
        return {}


def slides_presentation() -> list[dict]:
    """Le bloc « Présentation de 4SH » du kit, slides valides seulement, repères préfixés par « 4sh- »."""
    from .proposition import SCHEMA_SLIDE
    from .validation import erreurs

    r = []
    for i, s in enumerate(lire_presentation().get("slides") or []):
        if not isinstance(s, dict):
            continue
        s = {**s, "id": "4sh-" + str(s.get("id") or i).removeprefix("4sh-")}
        if not erreurs(s, SCHEMA_SLIDE):
            r.append(s)
    return r
