"""« Demander au référentiel » : Claude répond à partir de la base du projet et cite ses sources.

Claude est piloté par le kit d'agents d'Anthropic (Claude Agent SDK), qui lance Claude Code,
l'outil officiel, sans le modifier. Deux façons de s'authentifier :

- par défaut, le compte Claude de la personne, connecté une fois à Claude Code
  (`python -m referentiel connexion --login`, qui ouvre la page de connexion d'Anthropic) ;
- en secours, une clé API de l'organisation, lue dans la variable REFERENTIEL_CLE_API
  (alimentée par les crédits API inclus dans la licence Team).

Le moteur ne lit, ne copie et ne stocke jamais les identifiants Claude : il ne fait que lancer
Claude Code, qui gère sa propre connexion. Claude n'a accès qu'aux outils de LECTURE du serveur
MCP du référentiel : aucun outil d'écriture, aucun outil intégré (fichiers, terminal, web).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

MOTEUR = Path(__file__).resolve().parent.parent  # dossier qui contient le paquet `referentiel`
SERVEUR = "referentiel"
OUTILS_LECTURE = [
    "contexte", "lister_versions", "comparer_versions", "historique_versions",
    "etat_projet", "lister_elements", "lire_element", "rechercher", "lister_trous", "analyser_impact",
    "proposer_tests", "cas_a_revoir", "lister_evolutions", "correspondance",
]
OUTILS_ECRITURE = ["enregistrer_element", "remplacer_regle", "decider_trou", "creer_projet", "generer_spec", "figer_version", "enregistrer_tests",
                    "creer_evolution", "cibler_evolution", "valider_evolution"]
SEUIL_INDEX = 60_000  # jetons : au-delà, le contexte ne garde que le titre des règles
MODELE = os.environ.get("REFERENTIEL_MODELE")  # facultatif, par exemple « sonnet » ou « haiku »
EFFORT = os.environ.get("REFERENTIEL_EFFORT", "low")
VERDICTS = ["oui", "non", "depend", "partiel", "inconnu", "resume"]
LIBELLES_VERDICT = {
    "oui": "Oui", "non": "Non", "depend": "Ça dépend", "partiel": "Oui, mais pas formalisé",
    "inconnu": "Pas défini dans le référentiel", "resume": "Résumé",
}
PORTEES = {
    "travail": "la version de travail",
    "production": "la version en production",
    "histoire": "toute l'histoire du projet, versions passées comprises",
}

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["verdict", "paragraphes", "sources", "trou"],
    "properties": {
        "verdict": {"type": "string", "enum": VERDICTS},
        "paragraphes": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 4},
        "sources": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["type", "nom", "identifiant", "trace"],
                "properties": {
                    "type": {"type": "string"},
                    "nom": {"type": "string"},
                    "identifiant": {"type": "string"},
                    "statut": {"type": "string"},
                    "trace": {"type": "string"},
                },
            },
        },
        "trou": {"type": "string"},
    },
}

CONSIGNES = """Tu réponds aux questions de l'équipe sur un projet suivi dans le référentiel métier.

Règles absolues :
1. Tu ne réponds qu'à partir de la base du projet. Elle est fournie ci-dessous en entier, sous forme compacte :
   réponds directement à partir de ce texte. N'utilise les outils du serveur « referentiel » que si un détail
   manque vraiment (par exemple le contenu complet d'un élément), jamais pour relire ce que tu as déjà.
2. Tu n'inventes jamais une règle, un droit, une date ou un nom. Ce que la base ne dit pas est un trou :
   dis-le dans « trou » et, si rien ne répond à la question, mets le verdict « inconnu ».
3. Chaque affirmation s'appuie sur une source citée dans « sources » : son type (règle, action, étape,
   acteur, écran, entité, parcours), son nom métier, son identifiant tel qu'il est dans la base, son statut
   (proposée, validée, obsolète…) et sa trace : qui l'a décidée, quand, où (atelier, comité, compte rendu)
   et ce qu'elle remplace, telles que la base les indique (source, historique). Si la base n'indique pas
   qui ou quand, écris-le dans la trace au lieu de deviner.
4. Tu parles avec les noms métier, en français, sans identifiants dans les paragraphes. Phrases courtes,
   deux paragraphes courts le plus souvent (quatre au plus), l'essentiel d'abord. Pas de tiret cadratin ni
   demi-cadratin. Trois sources au plus, les plus directes, avec une trace d'une phrase.
   Dans les sources, le type est un mot français accentué (« règle », « action », « étape », « écran »,
   « entité », « acteur », « parcours ») et le statut reste vide si l'élément n'en a pas.
5. Verdict : « oui », « non », « depend » (la réponse change selon la situation ou la version),
   « partiel » (c'est le cas en pratique mais aucune règle validée ne le décide), « inconnu », ou « resume »
   pour une question qui appelle une synthèse plutôt qu'un oui ou non.
6. Une règle proposée n'est pas encore en vigueur, une règle obsolète ne l'est plus : dis-le.
7. « trou » : une phrase sur ce que la base ne dit pas et qui compte pour la question, sinon une chaîne vide.
"""


class ErreurAssistant(Exception):
    """Erreur présentable telle quelle à l'utilisateur."""


@dataclass
class Reponse:
    verdict: str
    paragraphes: list[str]
    sources: list[dict]
    trou: str
    mode: str = "abonnement"
    duree_ms: int = 0
    tours: int = 0
    usage: dict = field(default_factory=dict)
    cout_usd: float | None = None
    brut: dict = field(default_factory=dict)

    @property
    def libelle_verdict(self) -> str:
        return LIBELLES_VERDICT.get(self.verdict, self.verdict)

    def en_dict(self) -> dict:
        return {
            "verdict": self.verdict, "libelle_verdict": self.libelle_verdict, "paragraphes": self.paragraphes,
            "sources": self.sources, "trou": self.trou, "mode": self.mode, "duree_ms": self.duree_ms,
        }


# ---------------------------------------------------------------------------
# Connexion
# ---------------------------------------------------------------------------

def chemin_claude_code() -> str | None:
    """Claude Code embarqué par le kit d'agents, sinon celui installé sur le poste."""
    try:
        import claude_agent_sdk

        embarque = Path(claude_agent_sdk.__file__).parent / "_bundled" / ("claude.exe" if os.name == "nt" else "claude")
        if embarque.is_file():
            return str(embarque)
    except ImportError:
        pass
    return shutil.which("claude")


def mode_auth() -> str:
    """« cle » si une clé API de secours est configurée, sinon « abonnement »."""
    return "cle" if os.environ.get("REFERENTIEL_CLE_API") else "abonnement"


def etat_connexion() -> dict:
    """Où en est la connexion à Claude, sans jamais exposer d'identifiant."""
    try:
        import claude_agent_sdk  # noqa: F401
        sdk = True
    except ImportError:
        sdk = False
    cli = chemin_claude_code()
    etat = {"kit_agents": sdk, "claude_code": bool(cli), "mode": mode_auth(), "connecte": False, "compte": None, "methode": None}
    if etat["mode"] == "cle":
        etat["connecte"] = True
        etat["methode"] = "clé API de l'organisation (secours)"
        return etat
    if not cli:
        return etat
    try:
        sortie = subprocess.run([cli, "auth", "status", "--json"], capture_output=True, text=True, timeout=20)
        info = json.loads(sortie.stdout or "{}")
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return etat
    etat["connecte"] = bool(info.get("loggedIn"))
    etat["methode"] = info.get("authMethod")
    # Seuls des renseignements d'affichage sont gardés : jamais de jeton.
    etat["compte"] = {k: info.get(k) for k in ("email", "orgName", "subscriptionType") if info.get(k)}
    return etat


def lancer_connexion() -> int:
    """Lance la connexion de Claude Code (page d'Anthropic, dans le navigateur)."""
    cli = chemin_claude_code()
    if not cli:
        raise ErreurAssistant("Claude Code est introuvable : installer le kit d'agents (pip install claude-agent-sdk).")
    return subprocess.call([cli, "auth", "login", "--claudeai"])


# ---------------------------------------------------------------------------
# Question
# ---------------------------------------------------------------------------

def options(projet: Path, portee: str = "travail"):
    """Options du kit d'agents : lecture seule sur la base, aucun outil intégré."""
    import warnings

    from claude_agent_sdk import ClaudeAgentOptions

    # Les outils de lecture sont autorisés d'office ; la garde ne sert qu'à refuser tout le reste.
    warnings.filterwarnings("ignore", message="can_use_tool will not be invoked")

    mode = mode_auth()
    env = {"ANTHROPIC_API_KEY": os.environ["REFERENTIEL_CLE_API"]} if mode == "cle" else {"ANTHROPIC_API_KEY": ""}
    serveur = {
        "type": "stdio",
        "command": sys.executable,
        "args": ["-m", "referentiel.mcp_serveur"],
        "env": {"REFERENTIEL_PROJET": str(Path(projet).resolve()), "PYTHONPATH": str(MOTEUR)},
    }
    autorises = [f"mcp__{SERVEUR}__{o}" for o in OUTILS_LECTURE]
    interdits = [f"mcp__{SERVEUR}__{o}" for o in OUTILS_ECRITURE]

    async def garde(nom_outil, entree, contexte):
        from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

        if nom_outil in autorises:
            return PermissionResultAllow()
        return PermissionResultDeny(message="Lecture seule : seuls les outils de lecture du référentiel sont permis.")

    contexte, complet = construire_contexte(Path(projet), portee)
    consignes = CONSIGNES + "\n\n" + contexte
    if complet:
        # Toute la base est dans les consignes : une seule passe, sans outil ni aller-retour (le plus rapide
        # et le moins cher ; les consignes, identiques d'une question à l'autre, sont servies par le cache).
        consignes += ("\n\nFORMAT DE SORTIE : réponds uniquement par un objet JSON, sans texte autour ni bloc de code, "
                      "conforme à ce schéma : " + json.dumps(SCHEMA, ensure_ascii=False))
        outils = {"allowed_tools": [], "mcp_servers": {}, "max_turns": 1, "output_format": None}
    else:
        # Très grosse base : le contexte ne garde que les titres, Claude lit le détail avec les outils de lecture.
        outils = {"allowed_tools": autorises, "mcp_servers": {SERVEUR: serveur}, "max_turns": 6,
                  "output_format": {"type": "json_schema", "schema": SCHEMA}}
    return ClaudeAgentOptions(
        tools=[],
        disallowed_tools=interdits,
        can_use_tool=garde,
        strict_mcp_config=True,
        setting_sources=[],
        system_prompt=consignes,
        **outils,
        effort=EFFORT or None,
        model=MODELE,
        env=env,
        cli_path=chemin_claude_code(),
    )


def construire_contexte(projet: Path, portee: str = "travail") -> str:
    """Ce que Claude lit avant de répondre : la base de la portée demandée, et ce qui la distingue des autres versions."""
    from .contexte import generer_contexte, resume_changements, taille
    from .versions import TRAVAIL, ErreurVersion, charger_version, comparer, environnements, lister_versions

    versions = lister_versions(projet)
    envs = environnements(projet)
    lignes = [f"# Portée demandée : {PORTEES.get(portee, PORTEES['travail'])}"]
    if versions:
        lignes.append("Versions figées : " + ", ".join(
            f"{v['version']} ({v['date']}{', ' + v['message'] if v.get('message') else ''})" for v in versions) + ".")
    if envs:
        lignes.append("Environnements : " + ", ".join(
            f"{nom} = spec {e['spec']}" + (" (" + ", ".join(f"{a} {n}" for a, n in (e.get("applications") or {}).items()) + ")"
                                            if e.get("applications") else "") for nom, e in envs.items()) + ".")
    lu = TRAVAIL
    extra = ""
    if portee == "production":
        if "production" in envs:
            lu = envs["production"]["spec"]
            if lu != TRAVAIL:
                extra = ("\nCe qui changera quand la version de travail passera en production :\n"
                         + resume_changements(comparer(projet, lu, TRAVAIL)))
        else:
            lignes.append("Aucun environnement de production n'est déclaré (versions.yaml) : réponse sur la version de travail, à signaler dans « trou ».")
    elif portee == "histoire" and versions:
        etapes = [v["version"] for v in versions] + [TRAVAIL]
        extra = "\n" + "".join(resume_changements(comparer(projet, a, b)) for a, b in zip(etapes, etapes[1:]))
    elif portee == "travail" and "production" in envs and envs["production"]["spec"] != TRAVAIL:
        extra = ("\nÉcarts avec la production (spec " + envs["production"]["spec"] + ") : si un élément cité a changé, "
                 "donne les deux réponses et mets le verdict « depend ».\n"
                 + resume_changements(comparer(projet, envs["production"]["spec"], TRAVAIL)))
    try:
        p = charger_version(projet, lu)
    except ErreurVersion as e:
        raise ErreurAssistant(str(e)) from e
    texte = generer_contexte(p)
    complet = taille(texte)["jetons_estimes"] <= SEUIL_INDEX
    if not complet:
        texte = generer_contexte(p, index=True) + "\n(Base volumineuse : règles en titre seul, lire le détail avec lire_element.)\n"
    return "\n".join(lignes) + "\n\n" + texte + extra, complet


def _message_erreur(resultat) -> str:
    statut = getattr(resultat, "api_error_status", None)
    if statut == 429:
        return "Limite d'usage Claude atteinte pour votre compte. Réessayez plus tard, ou passez par la clé de secours."
    if statut in (401, 403):
        return "Compte Claude non connecté ou sans accès à Claude Code. Lancer : python -m referentiel connexion --login"
    if getattr(resultat, "subtype", "") == "error_max_turns":
        return "La recherche dans la base a été trop longue. Reformulez la question plus précisément."
    erreurs = getattr(resultat, "errors", None) or []
    return "Claude n'a pas pu répondre" + (f" : {erreurs[0]}" if erreurs else ".")


def valider_json(donnees) -> dict:
    """Objet JSON de la réponse de Claude, qu'il soit déjà décodé, nu ou dans un bloc de code."""
    if isinstance(donnees, str):
        texte = donnees.strip()
        if texte.startswith("```"):
            texte = texte.split("\n", 1)[-1].rsplit("```", 1)[0]
        debut, fin = texte.find("{"), texte.rfind("}")
        try:
            donnees = json.loads(texte[debut:fin + 1] if debut >= 0 else texte)
        except json.JSONDecodeError as e:
            raise ErreurAssistant("Réponse de Claude illisible.") from e
    if not isinstance(donnees, dict):
        raise ErreurAssistant("Réponse de Claude illisible.")
    return donnees


def valider(donnees) -> dict:
    """Vérifie la forme de la réponse : on n'affiche jamais une réponse mal formée."""
    donnees = valider_json(donnees)
    if not isinstance(donnees, dict):
        raise ErreurAssistant("Réponse de Claude illisible.")
    manquants = [c for c in SCHEMA["required"] if c not in donnees]
    if manquants:
        raise ErreurAssistant(f"Réponse incomplète (manque : {', '.join(manquants)}).")
    if donnees["verdict"] not in VERDICTS:
        raise ErreurAssistant(f"Verdict inconnu : {donnees['verdict']}.")
    if not donnees["paragraphes"]:
        raise ErreurAssistant("Réponse vide.")
    if donnees["verdict"] not in ("inconnu",) and not donnees["sources"]:
        raise ErreurAssistant("Réponse sans source : elle n'est pas affichée, faute de pouvoir être vérifiée.")
    for s in donnees["sources"]:
        for c in ("type", "nom", "identifiant", "trace"):
            if c not in s:
                raise ErreurAssistant("Une source est incomplète.")
    return donnees


def sources_verifiees(projet: Path, sources: list[dict]) -> list[dict]:
    """Marque chaque source selon qu'elle existe bien dans la base (garde-fou contre l'invention)."""
    from .chargement import charger

    p = charger(Path(projet))
    connus = set()
    for collection in (p.acteurs, p.entites, p.regles, p.cas_usage, p.ecrans):
        connus.update(collection.keys())
    connus.update(p.transitions.keys())
    for ent in p.entites.values():
        for st in ent.get("statuts") or []:
            if isinstance(st, dict) and st.get("id"):
                connus.add(st["id"])
    for s in sources:
        s["verifiee"] = s.get("identifiant") in connus if connus else None
    return sources


async def demander_async(question: str, projet: Path, portee: str = "travail", requete=None) -> Reponse:
    """Pose la question. `requete` permet de remplacer le kit d'agents dans les tests."""
    if not question.strip():
        raise ErreurAssistant("Question vide.")
    if requete is None:
        try:
            from claude_agent_sdk import query as requete
        except ImportError as e:
            raise ErreurAssistant("Le kit d'agents n'est pas installé : pip install claude-agent-sdk") from e
    from claude_agent_sdk import ResultMessage

    resultat = None
    async for message in requete(prompt=question, options=options(projet, portee)):
        if isinstance(message, ResultMessage):
            resultat = message
    if resultat is None:
        raise ErreurAssistant("Claude n'a renvoyé aucun résultat.")
    if resultat.is_error:
        raise ErreurAssistant(_message_erreur(resultat))
    donnees = valider(resultat.structured_output if resultat.structured_output is not None else resultat.result)
    return Reponse(
        verdict=donnees["verdict"], paragraphes=donnees["paragraphes"],
        sources=sources_verifiees(projet, donnees["sources"]), trou=donnees.get("trou", ""),
        mode=mode_auth(), duree_ms=resultat.duration_ms, tours=resultat.num_turns, brut=donnees,
        usage=resultat.usage or {}, cout_usd=resultat.total_cost_usd,
    )


def demander(question: str, projet: Path, portee: str = "travail", requete=None) -> Reponse:
    return asyncio.run(demander_async(question, projet, portee, requete))


def formater(r: Reponse) -> str:
    lignes = [f"{r.libelle_verdict}", ""]
    lignes += [p + "\n" for p in r.paragraphes]
    if r.sources:
        lignes.append("Sur quoi je m'appuie :")
        for s in r.sources:
            alerte = "" if s.get("verifiee") is not False else "  [introuvable dans la base, à vérifier]"
            statut = f" ({s['statut']})" if s.get("statut") else ""
            lignes.append(f"  - {s['type']} « {s['nom']} »{statut} : {s['trace']}{alerte}")
    if r.trou:
        lignes += ["", f"Pas défini dans le référentiel : {r.trou}"]
    lignes += ["", f"Réponse via {'la clé API de secours' if r.mode == 'cle' else 'votre compte Claude'}, en {r.duree_ms / 1000:.0f} s."]
    return "\n".join(lignes)
