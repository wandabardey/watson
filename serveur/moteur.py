"""Point d'entrée du moteur embarqué dans l'application de bureau (binaire construit avec PyInstaller).

    watson-moteur                    démarre l'API locale
    watson-moteur --verifier-reseau  vérifie qu'une connexion sécurisée à GitHub aboutit (contrôle de publication)
"""

import os
import sys
from pathlib import Path

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("REFERENTIEL_GIT", "dulwich")


def certificats():
    """Le Python embarqué ne connaît pas les certificats du système : sans cela, toute connexion HTTPS échoue.

    On s'appuie sur le magasin du système (Trousseau macOS, magasin Windows), qui contient aussi les certificats
    ajoutés par une entreprise pour son proxy ; à défaut, sur le paquet de certificats de certifi."""
    try:
        import truststore
        truststore.inject_into_ssl()
        return "systeme"
    except Exception:  # noqa: BLE001 - absent ou Python trop ancien
        pass
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        return "certifi"
    except ImportError:
        return "aucun"


source = certificats()

if "--verifier-reseau" in sys.argv:
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request("https://api.github.com/zen", headers={"User-Agent": "Watson"})
        with urllib.request.urlopen(req, timeout=30) as r:
            statut = r.status
    except urllib.error.HTTPError as e:  # le canal sécurisé est établi : c'est ce qu'on vérifie
        statut = e.code
    print(f"GitHub joignable en HTTPS (certificats : {source}, réponse {statut})")
    sys.exit(0)

from referentiel.api import main  # noqa: E402

main()
