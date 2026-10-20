"""Construit dist/watson-<version>.plugin à partir du dépôt.

Le dépôt est lui-même le plugin (manifeste dans .claude-plugin, skills, .mcp.json, serveur/lancer.py, moteur
dans referentiel/). L'archive ne garde que ce qui sert à l'exécution.
"""

import json
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DIST = RACINE / "dist"
CONTENU = [".claude-plugin/plugin.json", ".mcp.json", "skills", "serveur", "referentiel", "docs/plugin.md", "LICENCE"]


def main():
    version = json.loads((RACINE / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"]
    DIST.mkdir(exist_ok=True)
    sortie = DIST / f"watson-{version}.plugin"
    with zipfile.ZipFile(sortie, "w", zipfile.ZIP_DEFLATED) as z:
        for entree in CONTENU:
            chemin = RACINE / entree
            fichiers = [chemin] if chemin.is_file() else sorted(chemin.rglob("*")) if chemin.exists() else []
            for f in fichiers:
                if f.is_file() and "__pycache__" not in f.parts and f.name != ".DS_Store":
                    z.write(f, f.relative_to(RACINE))
    print(f"Plugin construit : {sortie}")
    return sortie


if __name__ == "__main__":
    main()
