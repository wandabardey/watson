"""Point d'entrée du moteur embarqué dans l'application de bureau (binaire construit avec PyInstaller)."""

import os
import sys
from pathlib import Path

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("REFERENTIEL_GIT", "dulwich")

from referentiel.api import main  # noqa: E402

main()
