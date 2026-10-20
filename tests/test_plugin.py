"""Le dépôt est le plugin : manifestes cohérents, lanceur fonctionnel, archive complète."""

import json
import subprocess
import sys
import zipfile
from pathlib import Path

from referentiel import __version__

RACINE = Path(__file__).resolve().parent.parent


def test_versions_alignees():
    plugin = json.loads((RACINE / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    catalogue = json.loads((RACINE / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    assert plugin["version"] == __version__ == catalogue["plugins"][0]["version"]
    assert catalogue["plugins"][0]["name"] == plugin["name"] and catalogue["plugins"][0]["source"] == "./"
    assert f"## {__version__}" in (RACINE / "CHANGELOG.md").read_text(encoding="utf-8")


def _lancer(lanceur: Path):
    entree = "\n".join(json.dumps(m) for m in [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]) + "\n"
    p = subprocess.run([sys.executable, str(lanceur)], input=entree, capture_output=True, text=True, cwd="/", timeout=30)
    reponses = {r["id"]: r for r in map(json.loads, p.stdout.splitlines())}
    assert reponses[1]["result"]["serverInfo"]["version"] == __version__
    return {o["name"] for o in reponses[2]["result"]["tools"]}


def test_lanceur_du_depot():
    assert "contexte" in _lancer(RACINE / "serveur" / "lancer.py")


def test_archive_autonome(tmp_path):
    sys.path.insert(0, str(RACINE / "scripts"))
    import construire_plugin

    archive = construire_plugin.main()
    with zipfile.ZipFile(archive) as z:
        z.extractall(tmp_path)
    assert (tmp_path / "skills" / "modifier-regle" / "SKILL.md").exists()
    assert "correspondance" in _lancer(tmp_path / "serveur" / "lancer.py")
