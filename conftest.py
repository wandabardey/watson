"""Rend le paquet `referentiel` importable depuis la racine du dépôt.

Sans ce fichier, pytest n'ajoute que `tests/` au chemin d'import : les tests
échouent à la collecte avec `ModuleNotFoundError: No module named 'referentiel'`.
"""

import sys
from pathlib import Path

RACINE = str(Path(__file__).resolve().parent)
if RACINE not in sys.path:
    sys.path.insert(0, RACINE)


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _donnees_isolees(tmp_path, monkeypatch):
    """Chaque test a son propre dossier de données Watson (réglages, lots), jamais celui du poste."""
    if "WATSON_DONNEES" not in __import__("os").environ:
        monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees-watson"))
