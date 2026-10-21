"""Connexion à GitHub et dépôts de connaissance, pour l'application de bureau.

Connexion par « device flow » : l'application affiche un code, la personne le saisit sur github.com et
autorise Watson. Aucun mot de passe ne passe par l'application ; le jeton obtenu est rangé dans le trousseau
du système (Trousseau macOS, Gestionnaire d'identification Windows), jamais dans un fichier du dépôt.

L'identifiant de l'application GitHub (client id) n'est pas un secret : il est inscrit ici, ou fourni par la
variable WATSON_GITHUB_CLIENT_ID.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

CLIENT_ID = os.environ.get("WATSON_GITHUB_CLIENT_ID", "Ov23liqDDgk0RR7ZdVpw")  # application OAuth « Watson », publique
PORTEE = "repo read:org"  # lire et écrire les dépôts de connaissance (privés compris) ; voir ses organisations
API = "https://api.github.com"
SERVICE = "watson"
_PORTEES = [None]  # portées accordées au jeton, relevées à chaque réponse de l'API


class ErreurGitHub(Exception):
    """Erreur présentable telle quelle."""


def _requete(url: str, donnees: dict | None = None, jeton: str | None = None, methode: str | None = None) -> dict:
    entetes = {"Accept": "application/json", "User-Agent": "Watson"}
    corps = None
    if jeton:
        entetes["Authorization"] = f"Bearer {jeton}"
        entetes["Accept"] = "application/vnd.github+json"
    if donnees is not None:
        corps = json.dumps(donnees).encode()
        entetes["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=corps, headers=entetes, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            texte = r.read().decode("utf-8")
            if r.headers.get("X-OAuth-Scopes") is not None:
                _PORTEES[0] = {x.strip() for x in r.headers["X-OAuth-Scopes"].split(",") if x.strip()}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        try:
            message = json.loads(detail).get("message", detail)
        except ValueError:
            message = detail
        if e.code == 401:
            raise ErreurGitHub("Connexion GitHub expirée ou retirée : se reconnecter.") from e
        if e.code == 404:
            raise ErreurGitHub("Dépôt introuvable, ou pas d'accès avec ce compte GitHub.") from e
        if e.code == 422 and "name already exists" in detail:
            raise ErreurGitHub("Un dépôt porte déjà ce nom à cet endroit : en choisir un autre.") from e
        if e.code == 403 and ("OAuth App access restrictions" in detail or "third-party" in detail.lower()):
            raise ErreurGitHub("Cette organisation n'a pas encore autorisé Watson. Un de ses propriétaires doit l'approuver "
                               "dans les réglages de l'organisation sur GitHub (accès des applications tierces).") from e
        raise ErreurGitHub(f"GitHub a répondu : {message}") from e
    except urllib.error.URLError as e:
        raison = str(getattr(e, "reason", e))
        if "CERTIFICATE" in raison.upper():
            raise ErreurGitHub(f"Connexion sécurisée à GitHub refusée (certificat non reconnu). Détail : {raison}") from e
        raise ErreurGitHub(f"GitHub injoignable : vérifier la connexion Internet. Détail : {raison}") from e
    return json.loads(texte) if texte else {}


# ---------------------------------------------------------------------------
# Connexion (device flow)
# ---------------------------------------------------------------------------

def demarrer_connexion() -> dict:
    """Premier temps : le code à saisir sur github.com/login/device."""
    if not CLIENT_ID:
        raise ErreurGitHub("Identifiant de l'application GitHub manquant (WATSON_GITHUB_CLIENT_ID).")
    r = _requete("https://github.com/login/device/code", {"client_id": CLIENT_ID, "scope": PORTEE})
    return {"code": r["user_code"], "adresse": r["verification_uri"], "attente": r["device_code"],
            "intervalle": r.get("interval", 5), "expire_dans": r.get("expires_in", 900)}


def terminer_connexion(attente: str) -> dict:
    """Second temps, appelé à intervalle régulier : « en_attente », « refusee », « expiree » ou « connecte »."""
    r = _requete("https://github.com/login/oauth/access_token",
                 {"client_id": CLIENT_ID, "device_code": attente, "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
    erreur = r.get("error")
    if erreur in ("authorization_pending", "slow_down"):
        return {"etat": "en_attente", "ralentir": erreur == "slow_down"}
    if erreur == "access_denied":
        return {"etat": "refusee"}
    if erreur == "expired_token":
        return {"etat": "expiree"}
    if erreur:
        raise ErreurGitHub(r.get("error_description") or erreur)
    jeton = r["access_token"]
    ranger_jeton(jeton)
    return {"etat": "connecte", "compte": compte(jeton)}


# ---------------------------------------------------------------------------
# Jeton dans le trousseau
# ---------------------------------------------------------------------------

def _trousseau():
    try:
        import keyring
    except ImportError:  # pragma: no cover
        return None
    return keyring


def ranger_jeton(jeton: str):
    k = _trousseau()
    if k is None:
        raise ErreurGitHub("Trousseau du système indisponible : impossible de garder la connexion.")
    k.set_password(SERVICE, "github", jeton)


def jeton() -> str | None:
    k = _trousseau()
    try:
        return k.get_password(SERVICE, "github") if k else None
    except Exception:  # noqa: BLE001 - trousseau verrouillé ou absent
        return None


def deconnecter():
    k = _trousseau()
    if k is None:
        return
    try:
        k.delete_password(SERVICE, "github")
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Compte et dépôts
# ---------------------------------------------------------------------------

def compte(j: str | None = None) -> dict:
    u = _requete(f"{API}/user", jeton=j or jeton())
    return {"login": u["login"], "nom": u.get("name") or u["login"], "email": u.get("email"), "avatar": u.get("avatar_url")}


def proprietaires() -> dict:
    """Où créer un dépôt : son propre compte, puis ses organisations.

    `reconnexion` signale un jeton obtenu avant l'ajout du droit de lecture des organisations : la liste peut alors
    manquer les organisations dont l'appartenance est privée."""
    c = compte()
    orgs = _requete(f"{API}/user/orgs?per_page=100", jeton=jeton())
    liste = [{"login": c["login"], "nom": c["nom"], "type": "compte", "avatar": c.get("avatar")}]
    liste += [{"login": o["login"], "nom": o["login"], "type": "organisation", "avatar": o.get("avatar_url")}
              for o in sorted(orgs, key=lambda o: o["login"].lower())]
    portees = _PORTEES[0]
    return {"proprietaires": liste, "reconnexion": portees is not None and "read:org" not in portees and "admin:org" not in portees}


def depots(recherche: str = "") -> list[dict]:
    """Dépôts accessibles, les plus récemment modifiés d'abord."""
    liste = _requete(f"{API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", jeton=jeton())
    r = [{"nom": d["full_name"], "prive": d["private"], "description": d.get("description") or "", "maj": d.get("pushed_at")}
         for d in liste]
    return [d for d in r if recherche.lower() in d["nom"].lower()] if recherche else r


def creer_depot(nom: str, description: str, organisation: str | None = None, prive: bool = True) -> dict:
    url = f"{API}/orgs/{organisation}/repos" if organisation else f"{API}/user/repos"
    d = _requete(url, {"name": nom, "description": description, "private": prive, "auto_init": False}, jeton=jeton())
    return {"nom": d["full_name"], "url": d["clone_url"], "prive": d["private"]}


def url_clone(nom_complet: str) -> str:
    return f"https://github.com/{nom_complet}.git"
