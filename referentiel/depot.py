"""Accès Git sans le programme git : lecture des versions et synchronisation du dépôt de connaissance.

L'application de bureau ne peut pas compter sur un git installé (Windows n'en a pas, macOS propose de
l'installer au premier appel). Elle passe donc par Dulwich, une implémentation de Git en Python, embarquée.
Le plugin et la ligne de commande gardent le programme git (aucune dépendance) : le choix se fait avec la
variable d'environnement REFERENTIEL_GIT=dulwich, posée par l'application.

Synchronisation : un dépôt de connaissance vit sur GitHub ; l'application en garde une copie de travail,
récupère les changements à l'ouverture (avance rapide seulement) et envoie chaque changement validé.
"""

from __future__ import annotations

import io
import os
import time
from pathlib import Path

DULWICH = "dulwich"


def actif() -> bool:
    return os.environ.get("REFERENTIEL_GIT", "").lower() == DULWICH


class ErreurDepot(Exception):
    """Erreur présentable telle quelle."""


def _dulwich():
    try:
        from dulwich import porcelain
        from dulwich.repo import Repo
    except ImportError as e:  # pragma: no cover - l'application l'embarque toujours
        raise ErreurDepot("Dulwich est requis pour accéder au dépôt sans le programme git.") from e
    return porcelain, Repo


# ---------------------------------------------------------------------------
# Repérage
# ---------------------------------------------------------------------------

def racine(chemin: Path) -> Path | None:
    """Racine du dépôt contenant ce chemin, ou None."""
    c = Path(chemin).resolve()
    for d in [c, *c.parents]:
        if (d / ".git").exists():
            return d
    return None


def prefixe(chemin: Path) -> str:
    r = racine(chemin)
    if r is None:
        raise ErreurDepot("Pas de dépôt Git.")
    rel = Path(chemin).resolve().relative_to(r).as_posix()
    return "" if rel == "." else rel.rstrip("/") + "/"


def _repo(chemin: Path):
    _, Repo = _dulwich()
    r = racine(chemin)
    if r is None:
        raise ErreurDepot("Pas de dépôt Git.")
    return Repo(str(r))


def _texte(b) -> str:
    return b.decode("utf-8", "replace") if isinstance(b, bytes) else (b or "")


# ---------------------------------------------------------------------------
# Lecture
# ---------------------------------------------------------------------------

def etiquettes(chemin: Path, debut: str) -> list[dict]:
    """Étiquettes dont le nom commence par `debut`, avec le commit visé et, pour une étiquette annotée,
    la date, l'auteur et le message."""
    from dulwich.objects import Tag

    repo = _repo(chemin)
    resultat = []
    for nom, sha in repo.refs.as_dict(b"refs/tags").items():
        n = _texte(nom)
        if not n.startswith(debut):
            continue
        obj = repo[sha]
        info = {"nom": n, "commit": None, "date": "", "auteur": None, "message": None}
        if isinstance(obj, Tag):
            cible = obj
            while isinstance(cible, Tag):
                cible = repo[cible.object[1]]
            info.update(commit=_texte(cible.id), date=time.strftime("%Y-%m-%d", time.gmtime(obj.tag_time)),
                        auteur=_texte(obj.tagger).split(" <")[0] or None, message=_texte(obj.message).strip().splitlines()[0] if obj.message else None)
        else:
            info.update(commit=_texte(obj.id), date=time.strftime("%Y-%m-%d", time.gmtime(obj.commit_time)))
        resultat.append(info)
    return resultat


def commit(chemin: Path, reference: str) -> str:
    """Empreinte du commit désigné par une étiquette, une branche ou une empreinte."""
    from dulwich.objects import Tag

    repo = _repo(chemin)
    candidats = [reference.encode(), b"refs/tags/" + reference.encode(), b"refs/heads/" + reference.encode()]
    for ref in candidats:
        try:
            obj = repo[repo.refs[ref]] if ref.startswith(b"refs/") else repo[ref]
        except KeyError:
            continue
        except ValueError:
            continue
        while isinstance(obj, Tag):
            obj = repo[obj.object[1]]
        return _texte(obj.id)
    if reference == "HEAD":
        return _texte(repo.head())
    raise ErreurDepot(f"Référence inconnue : {reference}")


def extraire(chemin: Path, reference: str, pref: str, destination: Path):
    """Écrit dans `destination` les fichiers du commit situés sous `pref` (chemins complets depuis la racine)."""
    from dulwich.object_store import iter_tree_contents

    repo = _repo(chemin)
    arbre = repo[commit(chemin, reference).encode()].tree
    p = pref.encode()
    for entree in iter_tree_contents(repo.object_store, arbre):
        if not entree.path.startswith(p):
            continue
        rel = Path(_texte(entree.path))
        if rel.is_absolute() or ".." in rel.parts:
            continue
        cible = Path(destination) / rel
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_bytes(repo[entree.sha].data)


def journal(chemin: Path, nombre: int = 30) -> list[dict]:
    """Derniers enregistrements de la branche courante : auteur, date (horodatage), message."""
    repo = _repo(chemin)
    try:
        tete = repo.head()
    except KeyError:
        return []
    resultat = []
    for entree in repo.get_walker(include=[tete], max_entries=nombre):
        c = entree.commit
        resultat.append({"auteur": _texte(c.author).split(" <")[0], "date": c.commit_time,
                         "message": _texte(c.message).strip().splitlines()[0] if c.message else ""})
    return resultat


def modifications(chemin: Path) -> list[str]:
    """Fichiers modifiés, ajoutés ou non suivis sous le dossier du projet."""
    porcelain, _ = _dulwich()
    repo = _repo(chemin)
    pref = prefixe(chemin)
    st = porcelain.status(repo, untracked_files="all")
    fichiers = [_texte(f) for liste in st.staged.values() for f in liste] + [_texte(f) for f in st.unstaged] + [_texte(f) for f in st.untracked]
    return sorted({f for f in fichiers if f.startswith(pref)})


def etiqueter(chemin: Path, nom: str, message: str, auteur: str | None):
    porcelain, _ = _dulwich()
    signature = f"{auteur or 'Watson'} <{_email(auteur)}>"
    porcelain.tag_create(_repo(chemin), nom.encode(), author=signature.encode(), message=message.encode(),
                         annotated=True, objectish=b"HEAD", tag_time=int(time.time()))


def _email(auteur: str | None) -> str:
    return os.environ.get("REFERENTIEL_EMAIL") or "watson@local"


# ---------------------------------------------------------------------------
# Synchronisation avec GitHub
# ---------------------------------------------------------------------------

def _auth(jeton: str | None) -> dict:
    """Identifiants HTTPS pour GitHub ; rien pour un dépôt local (tests)."""
    return {"username": "x-access-token", "password": jeton} if jeton else {}


def cloner(url: str, destination: Path, jeton: str | None = None):
    porcelain, _ = _dulwich()
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        porcelain.clone(url, str(destination), **_auth(jeton),
                        errstream=io.BytesIO())
    except Exception as e:  # noqa: BLE001 - message lisible
        raise ErreurDepot(f"Impossible de récupérer le dépôt : {e}") from e


def _fichiers(repo, sha) -> set[str]:
    from dulwich.object_store import iter_tree_contents

    return {_texte(e.path) for e in iter_tree_contents(repo.object_store, repo[sha].tree)}


def recuperer(chemin: Path, jeton: str | None = None) -> str:
    """Récupère les changements du dépôt distant, en avance rapide seulement.

    Renvoie « inchange », « mis_a_jour » ou « en_avance » (des changements faits sur ce poste ne sont pas encore
    partis). Si les deux côtés ont divergé, rien n'est écrasé et l'erreur le dit."""
    porcelain, _ = _dulwich()
    from dulwich.graph import can_fast_forward

    repo = _repo(chemin)
    branche = repo.refs.follow(b"HEAD")[0][-1]
    try:
        resultat = porcelain.fetch(repo, "origin", **_auth(jeton), errstream=io.BytesIO())
    except Exception as e:  # noqa: BLE001
        raise ErreurDepot(f"Récupération impossible : {e}. Les changements locaux sont conservés.") from e
    distant = resultat.refs.get(branche)
    local = repo.head()
    if distant is None or distant == local:
        return "inchange"
    if can_fast_forward(repo, local, distant):
        if modifications(chemin):
            raise ErreurDepot("Des changements non enregistrés sur ce poste empêchent la récupération : les enregistrer d'abord.")
        avant = _fichiers(repo, local)
        repo.refs[branche] = distant
        porcelain.reset(repo, "hard", distant)
        # La remise à niveau de Dulwich laisse en place les fichiers supprimés ailleurs : on les retire.
        r = racine(chemin)
        for f in avant - _fichiers(repo, distant):
            cible = r / f
            if cible.is_file():
                cible.unlink()
        return "mis_a_jour"
    if can_fast_forward(repo, distant, local):
        return "en_avance"
    raise ErreurDepot("Le dépôt a changé ailleurs pendant que des changements attendaient sur ce poste : "
                      "les deux versions sont conservées, à réconcilier.")


def enregistrer(chemin: Path, message: str, auteur: str, email: str | None = None) -> str | None:
    """Valide tous les changements du dossier du projet. Renvoie l'empreinte du commit, ou None s'il n'y avait rien."""
    porcelain, _ = _dulwich()
    repo = _repo(chemin)
    changes = modifications(chemin)
    if not changes:
        return None
    r = racine(chemin)
    presents = [f for f in changes if (r / f).exists()]
    if presents:
        porcelain.add(repo, [str(r / f) for f in presents])
    absents = [f for f in changes if not (r / f).exists()]
    if absents:
        porcelain.remove(repo, [str(r / f) for f in absents], cached=True)
    signature = f"{auteur} <{email or _email(auteur)}>".encode()
    return _texte(porcelain.commit(repo, message.encode(), author=signature, committer=signature))


def envoyer(chemin: Path, jeton: str | None = None):
    """Envoie la branche courante et les étiquettes vers le dépôt distant."""
    porcelain, _ = _dulwich()
    repo = _repo(chemin)
    branche = repo.refs.follow(b"HEAD")[0][-1]
    refs = [branche] + [k for k in repo.refs.keys() if k.startswith(b"refs/tags/")]
    try:
        porcelain.push(repo, "origin", refs, **_auth(jeton),
                       errstream=io.BytesIO())
    except Exception as e:  # noqa: BLE001
        raise ErreurDepot(f"Envoi impossible : {e}. Le changement est gardé sur ce poste et repartira au prochain envoi.") from e


def initialiser(dossier: Path, url: str | None = None):
    porcelain, _ = _dulwich()
    repo = porcelain.init(str(dossier))
    if url:
        config = repo.get_config()
        config.set((b"remote", b"origin"), b"url", url.encode())
        config.set((b"remote", b"origin"), b"fetch", b"+refs/heads/*:refs/remotes/origin/*")
        config.write_to_path()
    return repo
