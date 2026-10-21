"""Prépare une nouvelle version : numéro mis à jour partout, entrée du journal, commit et étiquette.

    python3 scripts/publier_version.py 0.6.0 "Ce qui change, en une phrase"

Ensuite : git push && git push --tags. GitHub construit alors l'application (Mac, Windows), le plugin, et publie la
version : les applications installées proposent la mise à jour, le plugin se met à jour depuis le catalogue watson.
"""

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def ecrire_json(chemin: Path, modifier):
    donnees = json.loads(chemin.read_text(encoding="utf-8"))
    modifier(donnees)
    chemin.write_text(json.dumps(donnees, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) < 3 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
        sys.exit('Usage : publier_version.py X.Y.Z "Ce qui change"')
    version, resume = sys.argv[1], sys.argv[2]
    if subprocess.run(["git", "status", "--porcelain"], cwd=RACINE, capture_output=True, text=True).stdout.strip():
        sys.exit("Des changements ne sont pas enregistrés : les valider (commit) avant de publier une version.")
    tests = subprocess.run([sys.executable, "-m", "pytest", "-q"], cwd=RACINE)
    if tests.returncode:
        sys.exit("Les tests échouent : version non publiée.")
    ecrire_json(RACINE / ".claude-plugin" / "plugin.json", lambda d: d.update(version=version))
    ecrire_json(RACINE / ".claude-plugin" / "marketplace.json", lambda d: [p.update(version=version) for p in d["plugins"]])
    ecrire_json(RACINE / "app" / "package.json", lambda d: d.update(version=version))
    ecrire_json(RACINE / "app" / "src-tauri" / "tauri.conf.json", lambda d: d.update(version=version))
    cargo = RACINE / "app" / "src-tauri" / "Cargo.toml"
    cargo.write_text(re.sub(r'^version = "[^"]+"', f'version = "{version}"', cargo.read_text(encoding="utf-8"), count=1, flags=re.M), encoding="utf-8")
    init = RACINE / "referentiel" / "__init__.py"
    init.write_text(re.sub(r'__version__ = "[^"]+"', f'__version__ = "{version}"', init.read_text(encoding="utf-8")), encoding="utf-8")
    journal = RACINE / "CHANGELOG.md"
    texte = journal.read_text(encoding="utf-8")
    entete, _, reste = texte.partition("\n## ")
    journal.write_text(f"{entete}\n## {version} ({date.today().isoformat()})\n\n- {resume}\n\n## {reste}", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=RACINE, check=True)
    subprocess.run(["git", "commit", "-qm", f"Version {version} : {resume}"], cwd=RACINE, check=True)
    subprocess.run(["git", "tag", "-a", f"v{version}", "-m", resume], cwd=RACINE, check=True)
    print(f"Version {version} prête. Publier avec : git push && git push --tags")


if __name__ == "__main__":
    main()
