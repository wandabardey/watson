"""Passage en code : Watson code des écrans à partir des maquettes validées et de tout le référentiel, reporte le
design system dans le code, ou crée l'application à partir du starter 4SH.

Garde-fous, toujours :
- uniquement dans le dépôt de code d'une application du projet, choisi dans Passage en code (Réglages de l'application) ;
- jamais sur la branche principale : chaque chantier a sa branche `watson/...`, travaillée dans un dossier à part
  (un « worktree » git rangé dans le dossier de données de Watson), si bien que la copie de travail des développeurs
  ne bouge pas ;
- l'application est construite (commande de build du projet) avant toute proposition ; en cas d'échec, Watson
  corrige, deux fois au plus, puis s'arrête et le dit ;
- la branche est envoyée et une demande de fusion est ouverte sur GitHub : rien n'est jamais fusionné par Watson.

Claude Code travaille dans le dossier du chantier avec les outils de lecture, d'écriture et de commande ; il lit les
conventions du dépôt (CLAUDE.md, AGENTS.md, .claude/) et le serveur MCP du kit 4SH s'il y est déclaré. Les commandes
git qui touchent aux branches ou au dépôt distant lui sont refusées : c'est Watson qui enregistre et envoie.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import uuid
from pathlib import Path

from .ecriture import aujourdhui

GENRES = {"ecrans": "Coder des écrans", "design_system": "Reporter le design system", "creation": "Créer l'application"}
ETAPES = {"preparation": "Préparation du chantier", "codage": "Claude code", "construction": "Construction de l'application",
          "correction": "Claude corrige la construction", "enregistrement": "Enregistrement sur la branche", "envoi": "Envoi et demande de fusion",
          "termine": "Terminé", "erreur": "Arrêté"}
GIT_INTERDIT = re.compile(r"\bgit\s+(push|merge|rebase|reset|checkout|switch|branch|worktree|remote|tag|commit|stash|clean|pull|fetch)\b")
ESSAIS_BUILD = 2
_verrou = threading.Lock()


class ErreurCode(Exception):
    pass


# ---------------------------------------------------------------- outils

def _slug(texte: str) -> str:
    s = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "chantier"


def _git(depot: Path, *args, ok=True, env=None) -> str:
    r = subprocess.run(["git", "-C", str(depot), *args], capture_output=True, timeout=180, env=env)
    if ok and r.returncode != 0:
        raise ErreurCode((r.stderr or r.stdout).decode("utf-8", "replace").strip()[:600] or f"git {args[0]} en échec")
    return r.stdout.decode("utf-8", "replace")


def _shell(commande: str, cwd: Path, timeout: int = 900) -> tuple[bool, str]:
    """Une commande lancée comme dans un terminal (shell de connexion, pour retrouver node, npm, pnpm du poste)."""
    shell = os.environ.get("SHELL") or "/bin/bash"
    try:
        r = subprocess.run([shell, "-lc", commande], cwd=str(cwd), capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, f"La commande « {commande} » a dépassé {timeout // 60} minutes."
    sortie = (r.stdout + r.stderr).decode("utf-8", "replace")
    return r.returncode == 0, sortie[-6000:]


def _dossier(pid: str) -> Path:
    from .application import dossier_donnees

    d = dossier_donnees() / "code" / pid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fichier(pid: str) -> Path:
    return _dossier(pid) / "chantiers.json"


def lister(pid: str) -> list[dict]:
    f = _fichier(pid)
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
    except ValueError:
        return []


def _maj(pid: str, cid: str, **champs) -> dict:
    with _verrou:
        l = lister(pid)
        c = next((x for x in l if x["id"] == cid), None)
        if c is None:
            raise ErreurCode("Chantier inconnu.")
        c.update(champs)
        if "etape" in champs:
            c.setdefault("journal", []).append({"t": time.strftime("%H:%M:%S"), "etape": champs["etape"], "texte": ETAPES.get(champs["etape"], "")})
        _fichier(pid).write_text(json.dumps(l, ensure_ascii=False, indent=1), encoding="utf-8")
        return c


def _ajouter(pid: str, c: dict):
    with _verrou:
        l = lister(pid)
        l.insert(0, c)
        _fichier(pid).write_text(json.dumps(l[:60], ensure_ascii=False, indent=1), encoding="utf-8")


def gestionnaire(depot: Path) -> str:
    if (depot / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (depot / "yarn.lock").exists():
        return "yarn"
    return "npm"


def commande_build(depot: Path, app: dict) -> str | None:
    if app.get("build"):
        return str(app["build"])
    pkg = depot / "package.json"
    if pkg.exists():
        try:
            if "build" in (json.loads(pkg.read_text(encoding="utf-8")).get("scripts") or {}):
                return f"{gestionnaire(depot)} run build"
        except ValueError:
            return None
    return None


def depot_github(depot: Path) -> str | None:
    url = _git(depot, "remote", "get-url", "origin", ok=False).strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$", url)
    return m.group(1) if m else None


# ---------------------------------------------------------------- consignes

def _brief_ecran(racine: Path, p, eid: str, liens: dict) -> str:
    from .maquettes import DOSSIER, _description_ecran, lire_index

    l = [f"## {p.ecrans[eid]['nom']} ({eid})", _description_ecran(p, eid)]
    lien = liens.get(eid) or {}
    if lien.get("route"):
        l.append(f"Adresse attendue dans l'application : {lien['route']}")
    if lien.get("fichiers"):
        l.append("Fichiers déjà reliés à cet écran (à faire évoluer plutôt que dupliquer) : " + ", ".join(lien["fichiers"]))
    maqs = sorted([m for m in lire_index(racine)["maquettes"] if m.get("ecran") == eid], key=lambda m: (bool(m.get("validee")), str(m.get("date", ""))))
    if maqs:
        m = maqs[-1]
        f = Path(racine) / DOSSIER / "maquettes" / m.get("fichier", "")
        etat = "validée, c'est la référence" if m.get("validee") else "non validée, à prendre comme intention"
        if f.suffix == ".html" and f.exists():
            l.append(f"Maquette « {m['titre']} » ({etat}), en HTML statique ; les attributs data-composant désignent les composants du kit :\n"
                     f"```html\n{f.read_text(encoding='utf-8')[:40_000]}\n```")
        elif f.exists():
            l.append(f"Maquette « {m['titre']} » ({etat}) : image {f.as_posix()} (tu peux la lire avec l'outil Read).")
    else:
        l.append("Pas de maquette pour cet écran : construis-le avec les composants du kit et le design system, en suivant la description.")
    return "\n\n".join(l)


def consignes(racine: Path, genre: str, ecrans: list[str], demande: str, app: dict, worktree: Path) -> str:
    from .assistant import construire_contexte
    from .avancement import liens as liens_ecrans
    from .chargement import charger
    from .design_system import lire as lire_ds
    from .design_system import variables_css

    p = charger(racine)
    contexte, _ = construire_contexte(racine)
    ds = lire_ds(racine)
    bloc_ds = ""
    if ds and ds.get("fondations"):
        comps = "\n".join(f"- {c['id']} : {c['nom']} ({c.get('statut')})" for c in ds.get("composants") or [])[:6000]
        bloc_ds = (f"\n# Design system validé du projet\nFondations, en variables CSS de référence :\n```css\n{variables_css(ds['fondations'])}\n```\n"
                   f"Composants :\n{comps}\n")
    commun = f"""Tu travailles dans le dépôt de code de l'application « {app.get('nom')} », dans un dossier de chantier
({worktree}) sur une branche dédiée. La Product Owner relira tout dans une demande de fusion : rien n'est fusionné sans elle.

Règles :
1. Lis d'abord les conventions du dépôt (CLAUDE.md, AGENTS.md, README, docs/) et suis-les : architecture, nommage,
   style, tests. Réutilise les composants existants et ceux du kit 4SH (préfixe ui-) avant d'en créer.
2. N'utilise pas git pour les branches, les commits ou l'envoi : Watson s'en charge. Tu peux lire l'historique.
3. Ne touche qu'à ce que demande le chantier. Pas de dépendance nouvelle sans nécessité ; si tu en ajoutes une, dis pourquoi.
4. Textes de l'interface en français, ceux de la base de connaissance. Accessibilité RGAA : libellés, focus, contrastes.
5. Aucun tiret cadratin ni demi-cadratin dans les textes que tu écris.
6. Termine par un compte rendu court, en français et sans jargon, pour une PO : ce que tu as fait, les fichiers par
   écran (une ligne « FICHIERS SCR-xxx : chemin, chemin » par écran), ce qui reste à faire, les questions.
{bloc_ds}
# Base de connaissance métier du projet
{contexte[:60_000]}
"""
    if genre == "ecrans":
        liens = liens_ecrans(racine)
        briefs = "\n\n".join(_brief_ecran(racine, p, e, liens) for e in ecrans if e in p.ecrans)
        tache = f"""# Chantier : coder ces écrans
Pour chaque écran : la page ou le composant, sa route, ses états (vide, chargement, erreur, rempli), les règles
métier rendues visibles, les données en dur si l'API n'existe pas encore (isolées dans un service facile à brancher).
Fidélité à la maquette validée, avec les composants du kit et les jetons du design system (jamais de valeurs en dur).

{briefs}"""
    elif genre == "design_system":
        tache = """# Chantier : reporter le design system dans le code
Mets les jetons de l'application (fichiers de tokens du kit, variables CSS, thème) en accord avec les fondations du
design system validé ci-dessus : couleurs et leurs nuances, polices, rayons, espacements, ombres, durées et courbes
d'animation. Garde la structure et les noms de jetons du dépôt : seules les valeurs changent. Si le dépôt génère ses
styles depuis les jetons (script tokens:build ou équivalent), relance la génération. L'apparence d'origine du starter
4SH ne doit plus apparaître nulle part."""
    else:
        tache = """# Chantier : créer l'application
Le dossier est vide et déjà initialisé pour git. Crée l'application avec le starter 4SH, directement à la racine du
dossier : `npx @angular/cli@latest new <nom-court> --directory . --skip-git --style scss --routing --ssr false --defaults`,
puis `npx ng add @4sh/ui-kit-schematics --skip-confirmation`.
Ajoute ensuite une coquille : la mise en page, la navigation avec un lien par écran de la base, et une page vide
nommée pour chaque écran. Puis reporte le design system validé dans les jetons."""
    return commun + "\n" + tache + (f"\n\n# Demande de la Product Owner, prioritaire\n{demande}" if demande else "")


# ---------------------------------------------------------------- Claude Code dans le chantier

async def _agent(prompt: str, cwd: Path, tid: str | None, requete=None, garde=None) -> str:
    from claude_agent_sdk import ClaudeAgentOptions, PermissionResultAllow, PermissionResultDeny, ResultMessage

    from . import conso, reglages, travaux
    from .assistant import chemin_claude_code, mode_auth

    if requete is None:
        from claude_agent_sdk import query as requete

    racine = cwd.resolve()

    async def autoriser(outil, entree, _ctx):
        if outil == "Bash":
            cmd = str(entree.get("command", ""))
            if GIT_INTERDIT.search(cmd):
                return PermissionResultDeny(message="Les commandes git sur les branches et le dépôt distant sont réservées à Watson.")
            if re.search(r"\bsudo\b|rm\s+-rf\s+(/|~)", cmd):
                return PermissionResultDeny(message="Commande refusée par Watson.")
        if outil in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
            chemin = Path(str(entree.get("file_path") or entree.get("notebook_path") or "")).expanduser()
            chemin = (racine / chemin) if not chemin.is_absolute() else chemin
            try:
                chemin.resolve().relative_to(racine)
            except ValueError:
                return PermissionResultDeny(message="Écriture hors du dossier du chantier refusée.")
        return PermissionResultAllow()

    env = {"ANTHROPIC_API_KEY": os.environ["REFERENTIEL_CLE_API"]} if mode_auth() == "cle" else {"ANTHROPIC_API_KEY": ""}
    options = ClaudeAgentOptions(
        tools=["Read", "Write", "Edit", "Glob", "Grep", "Bash", "TodoWrite"], allowed_tools=["Read", "Glob", "Grep", "TodoWrite"],
        can_use_tool=garde or autoriser, cwd=str(racine), setting_sources=["project"], max_turns=200, env=env,
        cli_path=chemin_claude_code(), model=reglages.modele(), effort=reglages.effort(), include_partial_messages=True,
        system_prompt={"type": "preset", "preset": "claude_code", "append": "Tu travailles pour Watson, l'outil de Product Owner de 4SH."})

    async def flux():
        yield {"type": "user", "message": {"role": "user", "content": prompt}}

    resultat, depart = None, conso.debut()
    async for m in requete(prompt=flux(), options=options):
        conso.observer(m)
        travaux.observer(tid, m)
        if isinstance(m, ResultMessage):
            resultat = m
    conso.noter(depart, resultat, reglages.modele())
    if resultat is None:
        raise ErreurCode("Claude n'a renvoyé aucun résultat.")
    if resultat.is_error:
        from .assistant import _message_erreur
        raise ErreurCode(_message_erreur(resultat))
    return str(resultat.result or "")


# ---------------------------------------------------------------- chantier

def lancer(pid: str, racine: Path, application: str, genre: str, ecrans: list[str] | None = None, demande: str = "",
           auteur: str = "", dossier_creation: str | None = None, requete=None, synchrone: bool = False) -> dict:
    from .chargement import charger
    from .livraisons import _depot

    if genre not in GENRES:
        raise ErreurCode("Chantier inconnu.")
    p = charger(racine)
    app = next((a for a in p.meta.get("applications") or [] if a["id"] == application), None)
    if not app:
        raise ErreurCode("Application inconnue.")
    ecrans = [e for e in ecrans or [] if e in p.ecrans]
    if genre == "ecrans" and not ecrans:
        raise ErreurCode("Choisis au moins un écran à coder.")
    if genre == "creation":
        if _depot(racine, app):
            raise ErreurCode("Cette application a déjà un dépôt de code.")
        if not dossier_creation:
            raise ErreurCode("Indique le dossier où créer l'application sur ce poste.")
        depot = Path(dossier_creation).expanduser()
        if depot.exists() and any(depot.iterdir()):
            raise ErreurCode(f"Le dossier {depot} n'est pas vide.")
    else:
        depot = _depot(racine, app)
        if not depot or _git(depot, "rev-parse", "--git-dir", ok=False).strip() == "":
            raise ErreurCode(f"L'application « {app['nom']} » n'a pas de dépôt git sur ce poste : indique-le dans Passage en code, Réglages de l'application.")
    if any(c["etat"] == "en_cours" and c["application"] == application for c in lister(pid)):
        raise ErreurCode("Un chantier est déjà en cours sur cette application : attends qu'il se termine.")
    titre = {"ecrans": "Écrans " + ", ".join(p.ecrans[e]["nom"] for e in ecrans)[:80], "design_system": "Design system",
             "creation": f"Création de {app['nom']}"}[genre]
    cid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]
    c = {"id": cid, "genre": genre, "libelle": GENRES[genre], "titre": titre, "application": application, "application_nom": app["nom"],
         "ecrans": ecrans, "demande": demande, "par": auteur, "date": aujourdhui(), "debut": time.time(), "etat": "en_cours",
         "etape": "preparation", "branche": "main" if genre == "creation" else f"watson/{_slug(titre)}-{cid[-4:]}", "depot": str(depot),
         "journal": [{"t": time.strftime("%H:%M:%S"), "etape": "preparation", "texte": ETAPES["preparation"]}]}
    _ajouter(pid, c)

    def travail():
        from . import conso, travaux
        conso.projet_courant.set(pid)
        conso.usage_courant.set("code")
        tid = travaux.debut(pid, "code")
        try:
            _derouler(pid, racine, c, app, Path(depot), requete, tid)
            travaux.finir(tid)
        except Exception as e:  # noqa: BLE001
            _maj(pid, cid, etat="erreur", etape="erreur", erreur=str(e)[:800], fin=time.time())
            travaux.finir(tid, str(e) or "Erreur")

    if synchrone:
        travail()
    else:
        threading.Thread(target=travail, daemon=True).start()
    return next(x for x in lister(pid) if x["id"] == cid)


def _derouler(pid: str, racine: Path, c: dict, app: dict, depot: Path, requete, tid):
    from . import travaux

    cid = c["id"]
    if c["genre"] == "creation":
        depot.mkdir(parents=True, exist_ok=True)
        _git(depot, "init", "-q", "-b", "main")
        chantier = depot
        principale = None
    else:
        from .avancement import Depot
        principale = Depot(depot).principale or "main"
        chantier = _dossier(pid) / "chantiers" / cid
        chantier.parent.mkdir(parents=True, exist_ok=True)
        _git(depot, "worktree", "add", "-q", "-b", c["branche"], str(chantier), principale)
        _maj(pid, cid, chantier=str(chantier), base=principale)
        if (depot / "node_modules").is_dir() and not (chantier / "node_modules").exists():
            (chantier / "node_modules").symlink_to(depot / "node_modules", target_is_directory=True)
    prompt = consignes(racine, c["genre"], c["ecrans"], c["demande"], app, chantier)
    _maj(pid, cid, etape="codage")
    travaux.avancer(tid, "lit")
    compte_rendu = asyncio.run(_agent(prompt, chantier, tid, requete))
    if not [l for l in _git(chantier, "status", "--porcelain").splitlines() if not l[3:].startswith("node_modules")]:
        _maj(pid, cid, etat="erreur", etape="erreur", erreur="Claude n'a rien changé dans le code.", compte_rendu=compte_rendu[:12_000], fin=time.time())
        return
    build = commande_build(chantier, app)
    construit, sortie = (None, "")
    if build:
        for essai in range(ESSAIS_BUILD + 1):
            _maj(pid, cid, etape="construction")
            construit, sortie = _shell(build, chantier)
            if construit or essai == ESSAIS_BUILD:
                break
            _maj(pid, cid, etape="correction")
            compte_rendu = asyncio.run(_agent(
                f"La construction de l'application (« {build} ») échoue :\n```\n{sortie[-5000:]}\n```\nCorrige le code pour qu'elle passe, "
                f"sans retirer de fonctionnalité. Termine par le même compte rendu que la première fois, mis à jour.\n\n"
                f"Compte rendu précédent :\n{compte_rendu[:6000]}", chantier, tid, requete))
    _maj(pid, cid, etape="enregistrement", construit=construit, commande_build=build or "", sortie_build=sortie[-3000:] if not construit else "",
         compte_rendu=compte_rendu[:12_000])
    lien_nm = chantier / "node_modules"
    _git(chantier, "add", "-A", "--", ".", ":(exclude)node_modules")
    if lien_nm.is_symlink():
        _git(chantier, "reset", "-q", "--", "node_modules", ok=False)
    if not _git(chantier, "status", "--porcelain").strip():
        _maj(pid, cid, etat="erreur", etape="erreur", erreur="Claude n'a rien changé dans le code.", fin=time.time())
        return
    auteur = c.get("par") or "Watson"
    _git(chantier, "-c", f"user.name={auteur}", "-c", "user.email=watson@4sh.local", "commit", "-q", "-m",
         f"{c['titre']} (Watson)\n\n{compte_rendu[:3000]}")
    fichiers = [l for l in (_git(chantier, "diff", "--name-only", f"{principale}..HEAD") if principale else _git(chantier, "ls-files")).splitlines() if l]
    _maj(pid, cid, fichiers=fichiers[:300], commit=_git(chantier, "rev-parse", "--short", "HEAD").strip())
    _maj(pid, cid, liens_proposes=_liens_proposes(compte_rendu, fichiers))
    if c["genre"] == "creation":
        _maj(pid, cid, etat="termine", etape="termine", fin=time.time(), a_declarer=str(depot))
        return
    _maj(pid, cid, etape="envoi")
    envoi = _envoyer(depot, {**c, "base": principale}, construit, compte_rendu)
    _maj(pid, cid, etat="termine", etape="termine", fin=time.time(), **envoi)


def _liens_proposes(compte_rendu: str, fichiers: list[str]) -> dict:
    """Les lignes « FICHIERS SCR-xxx : … » du compte rendu relient chaque écran à ses fichiers (gardés en attente :
    le lien n'est posé dans la base que si la personne le confirme)."""
    liens = {}
    for m in re.finditer(r"FICHIERS\s+(SCR-[\w-]+)\s*:\s*(.+)", compte_rendu):
        fs = [x.strip().strip("`") for x in m.group(2).split(",") if x.strip().strip("`") in fichiers]
        if fs:
            liens[m.group(1)] = fs
    return liens


def _envoyer(depot: Path, c: dict, construit, compte_rendu: str) -> dict:
    from . import github

    nom = depot_github(depot)
    jeton = github.jeton()
    if not nom or not jeton:
        return {"envoye": False, "message_envoi": "Branche gardée sur ce poste : dépôt GitHub ou connexion introuvable."}
    url = f"https://x-access-token:{jeton}@github.com/{nom}.git"
    r = subprocess.run(["git", "-C", str(depot), "push", url, f"refs/heads/{c['branche']}:refs/heads/{c['branche']}"], capture_output=True, timeout=180)
    if r.returncode != 0:
        return {"envoye": False, "message_envoi": "Envoi refusé par GitHub : la branche reste sur ce poste. "
                + r.stderr.decode("utf-8", "replace").replace(jeton, "***")[-300:]}
    corps = (f"Chantier préparé par Watson pour {c.get('par') or 'la PO'}.\n\n"
             f"Construction : {'réussie' if construit else ('en échec, à reprendre' if construit is False else 'pas de commande de build')}.\n\n"
             f"{compte_rendu[:50_000]}\n\nÀ relire avant toute fusion : Watson ne fusionne jamais.")
    try:
        pr = github._requete(f"{github.API}/repos/{nom}/pulls", {"title": f"[Watson] {c['titre']}", "head": c["branche"], "base": c.get("base") or "main",
                                                               "body": corps, "draft": not construit}, jeton)
        return {"envoye": True, "demande_fusion": pr.get("html_url"), "numero": pr.get("number")}
    except Exception as e:  # noqa: BLE001
        return {"envoye": True, "message_envoi": f"Branche envoyée, mais la demande de fusion n'a pas pu être ouverte ({e})."}


def lier_ecrans(pid: str, racine: Path, cid: str) -> dict:
    from .avancement import lier

    c = next((x for x in lister(pid) if x["id"] == cid), None)
    if not c:
        raise ErreurCode("Chantier inconnu.")
    for eid, fs in (c.get("liens_proposes") or {}).items():
        lier(racine, eid, fs)
    return _maj(pid, cid, liens_poses=True)


def abandonner(pid: str, cid: str) -> list[dict]:
    """Retire le dossier du chantier sur ce poste. La branche reste (et la demande de fusion, si elle a été ouverte)."""
    c = next((x for x in lister(pid) if x["id"] == cid), None)
    if not c:
        raise ErreurCode("Chantier inconnu.")
    if c["etat"] == "en_cours":
        raise ErreurCode("Le chantier est en cours.")
    if c.get("chantier") and Path(c["chantier"]).exists():
        _git(Path(c["depot"]), "worktree", "remove", "--force", c["chantier"], ok=False)
        shutil.rmtree(c["chantier"], ignore_errors=True)
    _maj(pid, cid, retire=True)
    return lister(pid)


def declarer_depot(racine: Path, application: str, chemin: str) -> None:
    """Après une création : le dossier devient le dépôt de code de l'application sur ce poste."""
    from .livraisons import definir_depot_local
    from .versions import ErreurVersion

    try:
        definir_depot_local(racine, application, chemin)
    except ErreurVersion as e:
        raise ErreurCode(str(e)) from e


def vue(pid: str, racine: Path) -> dict:
    from .avancement import vue as avancement
    from .chargement import charger
    from .livraisons import _depot

    p = charger(racine)
    av = avancement(racine)
    apps = []
    for a in p.meta.get("applications") or []:
        d = _depot(racine, a)
        ok = bool(d and d.is_dir() and _git(d, "rev-parse", "--git-dir", ok=False).strip())
        apps.append({"id": a["id"], "nom": a["nom"], "depot": str(d) if d else "", "git": ok, "build_declare": a.get("build", ""),
                     "adresses": a.get("adresses") or [], "support": a.get("support", ""),
                     "github": depot_github(d) if ok else None, "build": commande_build(d, a) if ok else None})
    return {"applications": apps, "chantiers": lister(pid), "genres": GENRES, "etapes": ETAPES,
            "ecrans": [{k: e[k] for k in ("id", "nom", "application", "etat", "etat_libelle", "validee")} for e in av["ecrans"]],
            "node": _shell("node --version", Path.home(), 30)[0]}
