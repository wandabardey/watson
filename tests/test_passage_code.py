"""Passage en code : chantier sur une branche watson/, Claude Code (simulé) dans un worktree, construction,
correction, enregistrement, jamais sur la branche principale, liens écran et code proposés."""

import shutil
import subprocess
from pathlib import Path

import pytest

from referentiel import avancement as av
from referentiel import passage_code as pc

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def git(d, *a):
    import os
    return subprocess.run(["git", "-C", str(d), *a], check=True, capture_output=True, env={**os.environ, **ENV}).stdout.decode()


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    code = tmp_path / "portail"
    (code / "src").mkdir(parents=True)
    (code / "src" / "main.ts").write_text("// app")
    (code / "CLAUDE.md").write_text("Conventions : tout en TypeScript.")
    git(code, "init", "-q", "-b", "main")
    git(code, "add", ".")
    git(code, "commit", "-qm", "init")
    y = (racine / "projet.yaml").read_text().replace("{id: APP-PORTAIL, nom: Portail fret, support: web,",
                                                     f"{{id: APP-PORTAIL, nom: Portail fret, support: web, depot: '{code}', build: 'test -f src/app/saisie.page.ts',")
    (racine / "projet.yaml").write_text(y)
    return racine, code


def faux_claude(etapes):
    """Chaque appel exécute la fonction suivante dans le dossier du chantier et répond par son texte."""
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []

    async def requete(prompt, options):
        async for m in prompt:
            vus.append((options, m["message"]["content"]))
        texte = etapes.pop(0)(Path(options.cwd))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s", result=texte)

    return requete, vus


def test_chantier_ecran_avec_correction(projet):
    racine, code = projet

    def premier(cwd):
        (cwd / "src" / "app").mkdir(parents=True, exist_ok=True)
        (cwd / "src" / "app" / "brouillon.ts").write_text("// oublié le bon nom")
        return "J'ai commencé."

    def correction(cwd):
        (cwd / "src" / "app" / "saisie.page.ts").write_text("// saisie")
        return "Écran codé.\nFICHIERS SCR-001 : src/app/saisie.page.ts, src/inexistant.ts"

    requete, vus = faux_claude([premier, correction])
    c = pc.lancer("p", racine, "APP-PORTAIL", "ecrans", ["SCR-001"], "Sobre", "Wanda", requete=requete, synchrone=True)
    c = pc.lister("p")[0]
    assert c["etat"] == "termine", c.get("erreur")
    assert c["construit"] is True and c["branche"].startswith("watson/")
    assert [j["etape"] for j in c["journal"]] == ["preparation", "codage", "construction", "correction", "construction", "enregistrement", "envoi", "termine"]
    assert "Saisie d'une expédition" in vus[0][1] and "Sobre" in vus[0][1] and "échoue" in vus[1][1]
    assert vus[0][0].cwd == c["chantier"] and vus[0][0].setting_sources == ["project"]
    # La branche principale et la copie de travail des développeurs n'ont pas bougé.
    assert git(code, "rev-parse", "--abbrev-ref", "HEAD").strip() == "main"
    assert not (code / "src" / "app").exists()
    assert "src/app/saisie.page.ts" in git(code, "show", "--name-only", "--format=", c["branche"])
    assert c["fichiers"] == ["src/app/brouillon.ts", "src/app/saisie.page.ts"]
    assert c["envoye"] is False
    assert c["liens_proposes"] == {"SCR-001": ["src/app/saisie.page.ts"]}
    pc.lier_ecrans("p", racine, c["id"])
    assert av.liens(racine)["SCR-001"]["fichiers"] == ["src/app/saisie.page.ts"]
    e = {x["id"]: x for x in av.vue(racine)["ecrans"]}["SCR-001"]
    assert e["etat"] == "en_cours" and e["code"]["branches"][0]["nom"] == c["branche"]
    pc.abandonner("p", c["id"])
    assert not Path(c["chantier"]).exists()
    assert c["branche"] in git(code, "branch")


def test_garde_fous(projet):
    racine, code = projet
    with pytest.raises(pc.ErreurCode):
        pc.lancer("p", racine, "APP-PORTAIL", "ecrans", [], "", "Wanda", synchrone=True)
    with pytest.raises(pc.ErreurCode):
        pc.lancer("p", racine, "APP-TRANSPORTEUR", "design_system", [], "", "Wanda", synchrone=True)
    assert pc.GIT_INTERDIT.search("cd x && git push origin main")
    assert pc.GIT_INTERDIT.search("git checkout main")
    assert not pc.GIT_INTERDIT.search("git log --oneline")
    requete, _ = faux_claude([lambda cwd: "Rien à faire."])
    pc.lancer("p", racine, "APP-PORTAIL", "design_system", [], "", "Wanda", requete=requete, synchrone=True)
    c = pc.lister("p")[0]
    assert c["etat"] == "erreur" and "rien changé" in c["erreur"]


def test_autorisations(tmp_path):
    import asyncio
    asyncio.run(_autorisations(tmp_path))


async def _autorisations(tmp_path):
    pytest.importorskip("claude_agent_sdk")
    from claude_agent_sdk import PermissionResultDeny

    vu = {}

    async def requete(prompt, options):
        vu["garde"] = options.can_use_tool
        async for _ in prompt:
            pass
        from claude_agent_sdk import ResultMessage
        yield ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s", result="ok")

    await pc._agent("x", tmp_path, None, requete)
    g = vu["garde"]
    assert isinstance(await g("Bash", {"command": "git push"}, None), PermissionResultDeny)
    assert isinstance(await g("Write", {"file_path": "/etc/passwd"}, None), PermissionResultDeny)
    assert not isinstance(await g("Write", {"file_path": str(tmp_path / "a.ts")}, None), PermissionResultDeny)
    assert not isinstance(await g("Bash", {"command": "npm run build"}, None), PermissionResultDeny)
