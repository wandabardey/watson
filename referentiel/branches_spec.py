"""La spec d'une évolution, travaillée à part : une branche `evo/<EVO-xxx>` du dépôt de connaissance.

Depuis une évolution du backlog, on ouvre une branche : les changements de la base que Watson propose pour cette
évolution (et que la personne trie, comme toujours) vont sur la branche, pas dans la version de travail. On voit à
tout moment ce que la branche change. Une fois la spec validée, la fusion reporte ces changements dans la version de
travail ; si un même fichier a bougé des deux côtés, rien n'est fusionné et les fichiers en conflit sont listés.

Tout passe par Dulwich (pas besoin du programme git sur le poste). La branche est extraite dans le dossier de données
de Watson pour y appliquer les changements, puis réenregistrée comme un commit de la branche.
"""

from __future__ import annotations

import io
import shutil
import stat
import tempfile
import time
from pathlib import Path

from . import depot
from .ecriture import aujourdhui

STATUTS = {"en_cours": "Spec en cours", "validee": "Spec validée", "integree": "Fusionnée dans la version de travail", "abandonnee": "Abandonnée"}


class ErreurBranche(Exception):
    pass


def nom(eid: str) -> str:
    return f"evo/{eid}"


def _ref(eid: str) -> bytes:
    return f"refs/heads/{nom(eid)}".encode()


def _repo(racine: Path):
    try:
        return depot._repo(racine)
    except depot.ErreurDepot as e:
        raise ErreurBranche("La base n'est pas dans un dépôt Git : impossible de travailler une évolution à part.") from e


def _tete(repo, eid: str) -> bytes:
    try:
        return repo.refs[_ref(eid)]
    except KeyError as e:
        raise ErreurBranche(f"Branche {nom(eid)} introuvable sur ce poste.") from e


def creer(racine: Path, eid: str) -> dict:
    repo = _repo(racine)
    if _ref(eid) in repo.refs:
        raise ErreurBranche(f"La branche {nom(eid)} existe déjà.")
    base = repo.head()
    repo.refs[_ref(eid)] = base
    return {"nom": nom(eid), "base": base.decode(), "statut": "en_cours", "creee_le": aujourdhui()}


def _fichiers(repo, sha: bytes, prefixe: str) -> dict[str, bytes]:
    """Les fichiers du commit sous le préfixe : chemin relatif au projet -> identifiant du contenu."""
    from dulwich.object_store import iter_tree_contents

    p = prefixe.encode()
    return {e.path[len(p):].decode("utf-8", "replace"): e.sha for e in iter_tree_contents(repo.object_store, repo[sha].tree)
            if e.path.startswith(p) and stat.S_ISREG(e.mode)}


def dossier(pid: str, racine: Path, eid: str) -> Path:
    """Le projet tel qu'il est sur la branche, extrait à neuf dans le dossier de données, prêt à recevoir des changements."""
    from .application import dossier_donnees

    repo = _repo(racine)
    tete = _tete(repo, eid)
    prefixe = depot.prefixe(racine)
    d = dossier_donnees() / "branches" / pid / eid
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    for rel, sha in _fichiers(repo, tete, prefixe).items():
        if rel.startswith("/") or ".." in Path(rel).parts:
            continue
        f = d / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(repo[sha].data)
    return d


def enregistrer(racine: Path, eid: str, projet: Path, message: str, auteur: str, email: str | None = None) -> str | None:
    """Fait du contenu de `projet` (extrait par `dossier`) un nouveau commit de la branche. None s'il n'a pas changé."""
    from dulwich.index import commit_tree
    from dulwich.object_store import iter_tree_contents
    from dulwich.objects import Blob, Commit

    repo = _repo(racine)
    tete = _tete(repo, eid)
    prefixe = depot.prefixe(racine).encode()
    entrees = [(e.path, e.sha, e.mode) for e in iter_tree_contents(repo.object_store, repo[tete].tree) if not e.path.startswith(prefixe)]
    for f in sorted(Path(projet).rglob("*")):
        if f.is_file() and ".git" not in f.relative_to(projet).parts:
            b = Blob.from_string(f.read_bytes())
            repo.object_store.add_object(b)
            entrees.append((prefixe + f.relative_to(projet).as_posix().encode(), b.id, 0o100644))
    arbre = commit_tree(repo.object_store, entrees)
    if arbre == repo[tete].tree:
        return None
    signature = f"{auteur} <{email or depot._email(auteur)}>".encode()
    c = Commit()
    c.tree, c.parents, c.author, c.committer = arbre, [tete], signature, signature
    c.commit_time = c.author_time = int(time.time())
    c.commit_timezone = c.author_timezone = 0
    c.encoding = b"UTF-8"
    c.message = message.encode()
    repo.object_store.add_object(c)
    repo.refs[_ref(eid)] = c.id
    return c.id.decode()


def envoyer(racine: Path, eid: str, jeton: str | None) -> bool:
    porcelain, _ = depot._dulwich()
    try:
        porcelain.push(_repo(racine), "origin", [_ref(eid)], **depot._auth(jeton), errstream=io.BytesIO())
        return True
    except Exception:  # noqa: BLE001
        return False


def _charger(repo, racine: Path, sha: bytes, libelle: str):
    from .chargement import charger

    d = Path(tempfile.mkdtemp(prefix="watson-branche-"))
    for rel, s in _fichiers(repo, sha, depot.prefixe(racine)).items():
        if rel.startswith("/") or ".." in Path(rel).parts:
            continue
        f = d / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(repo[s].data)
    p = charger(d)
    p.meta = {**p.meta, "version": libelle}
    return p, d


def changements(racine: Path, eid: str, base: str) -> list[dict]:
    """Ce que la branche change par rapport au point où elle a quitté la version de travail."""
    from .versions import comparer_projets

    repo = _repo(racine)
    a, da = _charger(repo, racine, base.encode(), "base")
    b, db = _charger(repo, racine, _tete(repo, eid), eid)
    try:
        return comparer_projets(a, b)
    finally:
        shutil.rmtree(da, ignore_errors=True)
        shutil.rmtree(db, ignore_errors=True)


def commits(racine: Path, eid: str, base: str) -> int:
    repo = _repo(racine)
    n, sha = 0, _tete(repo, eid)
    while sha and sha != base.encode() and n < 500:
        c = repo[sha]
        sha = c.parents[0] if c.parents else None
        n += 1
    return n


def integrer(racine: Path, eid: str, base: str) -> dict:
    """Fusion fichier par fichier dans la version de travail : un fichier changé sur la branche seulement prend la
    version de la branche ; changé des deux côtés de façon différente, c'est un conflit, et rien n'est écrit."""
    repo = _repo(racine)
    prefixe = depot.prefixe(racine)
    f_base = _fichiers(repo, base.encode(), prefixe)
    f_branche = _fichiers(repo, _tete(repo, eid), prefixe)
    racine = Path(racine)

    def courant(rel):
        p = racine / rel
        if not p.is_file():
            return None
        from dulwich.objects import Blob
        return Blob.from_string(p.read_bytes()).id

    ecrire, supprimer, conflits = {}, [], []
    for rel in sorted(set(f_base) | set(f_branche)):
        b, t = f_base.get(rel), f_branche.get(rel)
        if b == t:
            continue
        o = courant(rel)
        if o == t:
            continue
        if o != b:
            conflits.append(rel)
            continue
        if t is None:
            supprimer.append(rel)
        else:
            ecrire[rel] = repo[t].data
    if conflits:
        return {"fusionne": False, "conflits": conflits}
    for rel, data in ecrire.items():
        p = racine / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    for rel in supprimer:
        (racine / rel).unlink(missing_ok=True)
    return {"fusionne": True, "conflits": [], "fichiers": len(ecrire) + len(supprimer)}


def supprimer(racine: Path, eid: str):
    repo = _repo(racine)
    if _ref(eid) in repo.refs:
        del repo.refs[_ref(eid)]
