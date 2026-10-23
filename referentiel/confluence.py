"""Accès à Confluence (Atlassian Cloud) pour publier les spécifications.

Connexion par adresse du site, e-mail et jeton d'API Atlassian (créé par la personne sur id.atlassian.com). Le jeton
est rangé dans le trousseau du système, jamais dans un fichier ni dans un dépôt. Watson lit les pages au format
« storage » (le HTML de Confluence, macros comprises) et écrit dans le même format : c'est ce qui permet de
reproduire fidèlement une page modèle du projet. Watson n'écrit jamais sans une confirmation explicite dans l'écran.
"""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.parse
import urllib.request

SERVICE = "watson"


class ErreurConfluence(Exception):
    """Erreur présentable telle quelle."""


# ---------------------------------------------------------------- connexion

def _trousseau():
    try:
        import keyring
    except ImportError:  # pragma: no cover
        return None
    return keyring


def _fichier():
    from .application import dossier_donnees

    return dossier_donnees() / "confluence.json"


def site_normalise(site: str) -> str:
    s = (site or "").strip().rstrip("/")
    s = re.sub(r"^https?://", "", s)
    s = s.split("/")[0]
    if not s:
        raise ErreurConfluence("Adresse du site Confluence manquante (par exemple 4sh.atlassian.net).")
    if "." not in s:
        s += ".atlassian.net"
    return s


def connexion() -> dict | None:
    """{site, email} si une connexion est enregistrée sur ce poste (le jeton reste dans le trousseau)."""
    f = _fichier()
    try:
        d = json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    except ValueError:
        d = None
    return d if d and d.get("site") and d.get("email") else None


def _jeton(site: str, email: str) -> str | None:
    k = _trousseau()
    try:
        return k.get_password(SERVICE, f"confluence:{site}:{email}") if k else None
    except Exception:  # noqa: BLE001
        return None


def connecter(site: str, email: str, jeton: str, requete=None) -> dict:
    site = site_normalise(site)
    email = (email or "").strip()
    if not email or not jeton:
        raise ErreurConfluence("E-mail et jeton d'API Atlassian obligatoires.")
    moi = _appel(site, email, jeton.strip(), "GET", "/wiki/rest/api/user/current", requete=requete)
    k = _trousseau()
    if k is None:
        raise ErreurConfluence("Trousseau du système indisponible : impossible de garder la connexion.")
    k.set_password(SERVICE, f"confluence:{site}:{email}", jeton.strip())
    _fichier().write_text(json.dumps({"site": site, "email": email, "nom": moi.get("displayName", "")}, ensure_ascii=False), encoding="utf-8")
    return etat()


def deconnecter() -> dict:
    c = connexion()
    if c:
        k = _trousseau()
        try:
            if k:
                k.delete_password(SERVICE, f"confluence:{c['site']}:{c['email']}")
        except Exception:  # noqa: BLE001
            pass
        _fichier().unlink(missing_ok=True)
    return etat()


def etat() -> dict:
    c = connexion()
    return {"connecte": bool(c and _jeton(c["site"], c["email"])), **(c or {})}


# ---------------------------------------------------------------- requêtes

def _appel(site, email, jeton, methode, chemin, donnees=None, requete=None):
    """Une requête REST. `requete` remplace l'accès réseau dans les tests : requete(methode, url, donnees) -> dict."""
    url = f"https://{site}{chemin}"
    if requete is not None:
        return requete(methode, url, donnees)
    entetes = {"Accept": "application/json", "User-Agent": "Watson",
               "Authorization": "Basic " + base64.b64encode(f"{email}:{jeton}".encode()).decode()}
    corps = None
    if donnees is not None:
        corps = json.dumps(donnees).encode()
        entetes["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=corps, headers=entetes, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            texte = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        if e.code == 401:
            raise ErreurConfluence("Connexion Confluence refusée : vérifier l'e-mail et le jeton d'API.") from e
        if e.code == 403:
            raise ErreurConfluence("Ce compte n'a pas le droit de faire ça dans cet espace Confluence.") from e
        if e.code == 404:
            raise ErreurConfluence("Page ou espace Confluence introuvable.") from e
        if e.code == 409:
            raise ErreurConfluence("La page a été modifiée dans Confluence entre-temps : relance l'analyse de l'espace, puis republie.") from e
        raise ErreurConfluence(f"Confluence a répondu {e.code} : {detail}") from e
    except urllib.error.URLError as e:
        raise ErreurConfluence(f"Confluence injoignable ({getattr(e, 'reason', e)}).") from e
    return json.loads(texte) if texte else {}


class Client:
    def __init__(self, requete=None):
        c = connexion()
        if requete is None and not (c and _jeton(c["site"], c["email"])):
            raise ErreurConfluence("Watson n'est pas connecté à Confluence sur ce poste.")
        self.site = c["site"] if c else "exemple.atlassian.net"
        self.email = c["email"] if c else ""
        self.jeton = _jeton(self.site, self.email) if c else ""
        self.requete = requete

    def appel(self, methode, chemin, donnees=None):
        return _appel(self.site, self.email, self.jeton, methode, chemin, donnees, self.requete)

    def url(self, page_id: str) -> str:
        return f"https://{self.site}/wiki/pages/viewpage.action?pageId={page_id}"

    def espaces(self) -> list[dict]:
        r = self.appel("GET", "/wiki/api/v2/spaces?limit=250&sort=name")
        return [{"id": s["id"], "cle": s["key"], "nom": s["name"]} for s in r.get("results", []) if s.get("type") != "personal"]

    def espace(self, cle: str) -> dict:
        r = self.appel("GET", f"/wiki/api/v2/spaces?keys={urllib.parse.quote(cle)}")
        if not r.get("results"):
            raise ErreurConfluence(f"Espace Confluence « {cle} » introuvable.")
        s = r["results"][0]
        return {"id": s["id"], "cle": s["key"], "nom": s["name"], "accueil": s.get("homepageId")}

    def chercher(self, cle: str, titre: str) -> list[dict]:
        cql = f'space = "{cle}" AND type = page AND title = "{titre.replace(chr(34), " ")}"'
        r = self.appel("GET", "/wiki/rest/api/content/search?limit=50&expand=ancestors&cql=" + urllib.parse.quote(cql))
        return [{"id": p["id"], "titre": p["title"], "parent": (p.get("ancestors") or [{}])[-1].get("id")} for p in r.get("results", [])]

    def arbre(self, racine_id: str) -> list[dict]:
        """Toutes les pages sous la racine : identifiant, titre, parent, libellés."""
        pages, debut = [], 0
        while True:
            cql = f"ancestor = {racine_id} AND type = page"
            r = self.appel("GET", f"/wiki/rest/api/content/search?limit=100&start={debut}&expand=ancestors,metadata.labels&cql=" + urllib.parse.quote(cql))
            for p in r.get("results", []):
                pages.append({"id": p["id"], "titre": p["title"], "parent": (p.get("ancestors") or [{}])[-1].get("id"),
                              "labels": [x["name"] for x in ((p.get("metadata") or {}).get("labels") or {}).get("results", [])]})
            if len(r.get("results", [])) < 100 or debut > 2000:
                return pages
            debut += 100

    def page(self, page_id: str) -> dict:
        r = self.appel("GET", f"/wiki/api/v2/pages/{page_id}?body-format=storage")
        return {"id": r["id"], "titre": r["title"], "version": (r.get("version") or {}).get("number", 1),
                "parent": r.get("parentId"), "storage": ((r.get("body") or {}).get("storage") or {}).get("value", "")}

    def creer(self, espace_id: str, parent_id: str, titre: str, storage: str) -> dict:
        r = self.appel("POST", "/wiki/api/v2/pages", {"spaceId": espace_id, "status": "current", "title": titre, "parentId": parent_id,
                                                       "body": {"representation": "storage", "value": storage}})
        return {"id": r["id"], "version": (r.get("version") or {}).get("number", 1)}

    def modifier(self, page_id: str, titre: str, storage: str, message: str = "Mis à jour par Watson") -> dict:
        actuelle = self.page(page_id)
        r = self.appel("PUT", f"/wiki/api/v2/pages/{page_id}", {"id": page_id, "status": "current", "title": titre,
                                                                "body": {"representation": "storage", "value": storage},
                                                                "version": {"number": actuelle["version"] + 1, "message": message}})
        return {"id": r.get("id", page_id), "version": (r.get("version") or {}).get("number", actuelle["version"] + 1)}

    def etiqueter(self, page_id: str, labels: list[str]):
        if labels:
            self.appel("POST", f"/wiki/rest/api/content/{page_id}/label", [{"prefix": "global", "name": x} for x in labels])
