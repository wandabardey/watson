"""Point d'entrée du serveur MCP du plugin : rend le moteur importable puis le démarre.

Le plugin est le dépôt lui-même : le moteur est dans ../referentiel. Le fichier .plugin construit par
scripts/construire_plugin.py garde la même organisation.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from referentiel.mcp_serveur import main  # noqa: E402

main()
