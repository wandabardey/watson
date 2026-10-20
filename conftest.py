"""Rend le paquet `referentiel` importable depuis la racine du dépôt.

Sans ce fichier, pytest n'ajoute que `tests/` au chemin d'import : les tests
échouent à la collecte avec `ModuleNotFoundError: No module named 'referentiel'`.
"""

import sys
from pathlib import Path

RACINE = str(Path(__file__).resolve().parent)
if RACINE not in sys.path:
    sys.path.insert(0, RACINE)
