"""La méthode commune : quand le studio 4ward (4SH) est installé sur ce poste, Watson en lit les compétences au
moment de chaque appel à Claude et les lui donne selon la tâche (cahier des charges, moodboard, maquettes,
proposition commerciale…). Ainsi Watson et 4ward suivent les mêmes logiques, et une mise à jour de 4ward profite
directement à Watson.

Rien de 4ward n'est copié dans Watson ni dans ses dépôts : le texte est lu sur le poste, à la volée. Sans 4ward,
Watson applique ses consignes de base (ci-dessous), qui ne doivent rien à 4SH.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

# Consignes de base de Watson, toujours données à Claude.
BASE = """Consignes communes de Watson :
- Rien d'inventé : chaque information vient de la base, des sources du projet ou de la demande. Une donnée
  plausible mais non confirmée (chiffre, date, nom, budget, engagement) s'écrit avec la mention [À CONFIRMER] ;
  un manque se dit plutôt que de se combler.
- Langage métier, phrases courtes, pas de jargon technique ni d'identifiant interne dans le texte destiné aux gens.
- Pas de tiret cadratin ni demi-cadratin : virgule, deux-points ou parenthèses à la place.
- Sobriété : pas de formules creuses, pas d'emojis, pas de superlatifs ; une idée par paragraphe."""

# Tâche -> fichiers de 4ward utiles, relatifs au dossier skills/ du plugin.
TACHES = {
    "commun": ["4SH-accueil/references/hypotheses-et-incertitudes.md", "4SH-accueil/references/anti-slop-redactionnel.md"],
    "cahier": ["4SH-cadrage-projet/SKILL.md", "4SH-expert-metier/SKILL.md"],
    "moodboard": ["4SH-direction-artistique/SKILL.md", "4SH-direction-artistique/references/dials-et-craft.md",
                  "4SH-direction-artistique/references/anti-slop.md", "4SH-conception-specs/references/regles-ux-applications-metier.md"],
    "maquettes": ["4SH-direction-artistique/references/dials-et-craft.md", "4SH-direction-artistique/references/anti-slop.md",
                  "4SH-conception-specs/references/maquettes-figma-visualizer.md",
                  "4SH-conception-specs/references/regles-ux-applications-metier.md",
                  "4SH-conception-specs/references/droits-et-etats-d-erreur.md"],
    "comite_casting": ["4SH-comite-boost/SKILL.md", "4SH-comite-boost/references/roster.md", "4SH-comite-boost/references/fiche-de-poste.md",
                       "4SH-comite-boost/references/comite-du-projet.md"],
    "comite_expert": ["4SH-agent-expert/SKILL.md", "4SH-agent-expert/references/portrait-expert.md", "4SH-agent-expert/references/compte-rendu.md"],
    "comite_synthese": ["4SH-comite-boost/SKILL.md", "4SH-comite-boost/references/protocole.md", "4SH-accueil/references/arbitrer-une-decision.md"],
    "proposition": ["4SH-deck-commercial/SKILL.md", "4SH-deck-commercial/references/modele-et-deck-de-reference.md",
                    "4SH-accueil/references/charte-presentations-4sh.md"],
    "atelier": ["4SH-preparation-atelier/SKILL.md", "4SH-preparation-atelier/references/kit-atelier.md",
                "4SH-accueil/references/arbitrer-une-decision.md"],
    "compte_rendu": ["4SH-compte-rendu/SKILL.md", "4SH-compte-rendu/references/gabarit-compte-rendu.md"],
    "critique": ["4SH-critique-ux/SKILL.md", "4SH-conception-specs/references/regles-ux-applications-metier.md",
                 "4SH-direction-artistique/references/anti-slop.md"],
    "relecture": ["4SH-relecture-livrable/SKILL.md", "4SH-relecture-livrable/references/grilles-relecture.md"],
    "secteur": ["4SH-expert-metier/SKILL.md"],
    "mail": ["4SH-communication-client/SKILL.md", "4SH-communication-client/references/gabarits-communication.md"],
}
LIBELLES = {"cahier": "cadrage de projet et expertise métier", "moodboard": "direction artistique",
            "maquettes": "maquettes et prototypes", "proposition": "deck commercial", "comite_casting": "comité d'experts"}
REPERE = "skills/4SH-deck-commercial/SKILL.md"
LIMITE = 60_000  # caractères de méthode par appel
_IGNORES = {".trash", "node_modules", ".git", "Cache", "Code Cache", "GPUCache", "vm_bundles", "logs", "IndexedDB",
            "Local Storage", "Session Storage", "blob_storage", "Crashpad", "sessions"}
_cache: dict = {}


def _racines() -> list[Path]:
    h = Path.home()
    r = [h / ".claude" / "plugins", h / "Library" / "Application Support" / "Claude", h / ".config" / "Claude"]
    if os.environ.get("APPDATA"):
        r.append(Path(os.environ["APPDATA"]) / "Claude")
    if os.environ.get("WATSON_4WARD_RACINES"):  # tests, ou emplacement particulier
        r = [Path(x) for x in os.environ["WATSON_4WARD_RACINES"].split(os.pathsep)]
    return r


def _version(dossier: Path) -> str:
    try:
        return json.loads((dossier / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")).get("version", "")
    except (OSError, ValueError):
        return ""


def _cle(v: str):
    return tuple(int(x) for x in re.findall(r"\d+", v or "0"))


def _chercher(racine: Path, profondeur: int = 7) -> list[Path]:
    trouves = []
    if not racine.is_dir():
        return trouves
    pile = [(racine, 0)]
    while pile:
        d, n = pile.pop()
        if (d / REPERE).is_file():
            trouves.append(d)
            continue
        if n >= profondeur:
            continue
        try:
            for e in os.scandir(d):
                if e.is_dir(follow_symlinks=False) and e.name not in _IGNORES:
                    pile.append((Path(e.path), n + 1))
        except OSError:
            pass
    return trouves


def valide(chemin) -> bool:
    return bool(chemin) and (Path(chemin) / REPERE).is_file()


def detecter() -> list[dict]:
    """Toutes les installations de 4ward trouvées sur ce poste, la plus récente d'abord."""
    vus = {}
    for r in _racines():
        for d in _chercher(r):
            vus[str(d)] = {"chemin": str(d), "version": _version(d)}
    return sorted(vus.values(), key=lambda x: _cle(x["version"]), reverse=True)


def dossier() -> Path | None:
    """Le dossier de 4ward à utiliser : celui choisi dans Paramètres, sinon le plus récent trouvé."""
    from . import reglages

    choisi = reglages.lire().get("dossier_4ward")
    if choisi:
        return Path(choisi) if valide(choisi) else None
    if "auto" not in _cache or (_cache["auto"] and not valide(_cache["auto"])):
        t = detecter()
        _cache["auto"] = t[0]["chemin"] if t else None
    return Path(_cache["auto"]) if _cache["auto"] else None


def oublier_cache():
    _cache.clear()


def etat() -> dict:
    from . import reglages

    d = dossier()
    choisi = reglages.lire().get("dossier_4ward") or ""
    return {"trouve": bool(d), "chemin": str(d) if d else "", "version": _version(d) if d else "", "choisi": choisi,
            "choisi_introuvable": bool(choisi) and not valide(choisi), "taches": LIBELLES}


def _nettoyer(texte: str) -> str:
    """Retire l'en-tête technique et la section d'équipe (outils, connecteurs) qui ne s'appliquent pas ici."""
    texte = re.sub(r"\A---\n.*?\n---\n", "", texte, flags=re.S)
    texte = re.split(r"\n## Travailler en équipe", texte)[0]
    return texte.strip()


def consignes(tache: str) -> str:
    """Le texte de méthode à donner à Claude pour une tâche : consignes de base, puis 4ward s'il est là."""
    d = dossier()
    if not d:
        return BASE
    morceaux, total = [], 0
    for rel in TACHES["commun"] + TACHES.get(tache, []):
        f = d / "skills" / rel
        try:
            t = _nettoyer(f.read_text(encoding="utf-8"))
        except OSError:
            continue
        if total + len(t) > LIMITE:
            break
        morceaux.append(f'<methode fichier="{rel}">\n{t}\n</methode>')
        total += len(t)
    if not morceaux:
        return BASE
    return (BASE + f"""

Méthode du studio 4ward (4SH, version {_version(d) or "inconnue"}), à appliquer pour le fond et la forme.
Dans Watson, tu réponds en une fois et sans outil : ignore ce qui parle de poser des questions avant d'agir,
d'outils, de connecteurs (Confluence, Figma, Jira, Google), de fichiers à lire ou de sous-agents. Ce qui
manque devient une question ou un [À CONFIRMER] dans ta réponse.

""" + "\n\n".join(morceaux))
