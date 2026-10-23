"""Construit le moteur de l'application de bureau : un exécutable autonome (PyInstaller), placé là où Tauri
l'attend, app/src-tauri/binaries/watson-moteur-<cible>[.exe].

    pip install pyinstaller dulwich keyring platformdirs claude-agent-sdk truststore certifi pypdf pillow python-pptx python-docx
    python scripts/construire_moteur.py
"""

import os
import platform
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def cible() -> str:
    if os.environ.get("WATSON_CIBLE"):
        return os.environ["WATSON_CIBLE"]
    try:
        r = subprocess.run(["rustc", "-vV"], capture_output=True, text=True)
        for ligne in r.stdout.splitlines():
            if ligne.startswith("host:"):
                return ligne.split(":", 1)[1].strip()
    except OSError:
        pass
    machine = platform.machine().lower()
    if sys.platform == "darwin":
        return f"{'aarch64' if machine in ('arm64', 'aarch64') else 'x86_64'}-apple-darwin"
    if sys.platform == "win32":
        return "x86_64-pc-windows-msvc"
    return f"{machine}-unknown-linux-gnu"


def main():
    sep = ";" if sys.platform == "win32" else ":"
    nom = f"watson-moteur-{cible()}"
    dist = RACINE / "app" / "src-tauri" / "binaries"
    commande = [
        sys.executable, "-m", "PyInstaller", "--onefile", "--noconfirm", "--clean", "--name", nom,
        "--distpath", str(dist), "--workpath", str(RACINE / "build" / "pyinstaller"), "--specpath", str(RACINE / "build"),
        "--add-data", f"{RACINE / 'exemples' / 'fret'}{sep}exemples/fret",
        "--collect-all", "claude_agent_sdk", "--collect-submodules", "keyring", "--collect-submodules", "dulwich",
        "--hidden-import", "platformdirs", "--hidden-import", "truststore", "--collect-submodules", "pypdf", "--collect-submodules", "pptx", "--collect-data", "pptx", "--collect-submodules", "docx", "--collect-data", "docx", "--collect-data", "certifi",
        # macOS : tout ce qui est embarqué (Python compris) est re-signé avec l'identité de l'application (celle de
        # Watson en publication, sans éditeur sinon) ; sinon macOS refuse de charger le Python signé par python.org.
        *(["--codesign-identity", os.environ.get("WATSON_IDENTITE_SIGNATURE") or "-", "--osx-entitlements-file", str(RACINE / "app" / "src-tauri" / "Entitlements.plist")]
          if sys.platform == "darwin" else []),
        str(RACINE / "serveur" / "moteur.py"),
    ]
    subprocess.run(commande, check=True)
    print(f"Moteur construit : {dist / nom}")


if __name__ == "__main__":
    main()
