"""Serveur MCP (stdio) du référentiel métier.

Aucune dépendance : protocole JSON-RPC 2.0, un message JSON par ligne sur stdin/stdout.
Lancement : python3 -m referentiel.mcp_serveur   (ou le script serveur.py du plugin)

Le dossier du projet est passé à chaque outil (paramètre `projet`), ou fixé une fois
par la variable d'environnement REFERENTIEL_PROJET.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path

from . import __version__, schemas
from .chargement import charger
from .controles import ALERTE, ERREUR, TROU, analyser, couverture, decisions_orphelines, libelle
from .ecriture import TYPES, ErreurEcriture, creer_projet, decider_trou, enregistrer_element, remplacer_regle
from .generation import ecrire_mermaid, generer_html
from .impact import analyser_impact
from .contexte import SECTIONS, generer_contexte, resume_changements, taille
from . import evolutions, livraisons
from . import recette as cas_test
from .versions import ErreurVersion, charger_version, comparer, environnements, figer_version, historique_element, lister_versions

VERSIONS_PROTOCOLE = ["2025-06-18", "2025-03-26", "2024-11-05"]

INSTRUCTIONS = (
    "Référentiel métier vivant : la source de vérité des règles métier d'un projet "
    "(entités, étapes, actions, règles, acteurs, parcours, écrans). "
    "Toujours lire la base avant de répondre à une question métier et ne jamais inventer une règle : "
    "ce qui n'est pas dans la base est un trou à signaler. "
    "Parler à l'utilisateur avec les noms métier (« la règle sur la preuve de livraison », « l'action Livrer ») : "
    "les identifiants (RG-004, TR-LIVRER) servent aux outils, pas à la conversation, sauf si l'utilisateur les demande. "
    "Toute écriture se fait après accord explicite de l'utilisateur. "
    "Pour lire vite et à moindre coût : appeler d'abord l'outil contexte, qui renvoie toute la base en un texte compact ; "
    "n'utiliser lire_element ou rechercher que pour un détail absent du contexte. "
    "Les versions de la spec (1.4, 1.5…) et les environnements (production, recette) se passent dans le paramètre version. "
    "Un changement destiné à une version précise se fait dans une évolution (paramètre evolution des outils d'écriture), "
    "rattachée à sa version cible : demander pour quelle version avant d'écrire."
)

P_PROJET = {
    "type": "string",
    "description": "Chemin du dossier du projet (celui qui contient projet.yaml). Facultatif si REFERENTIEL_PROJET est défini.",
}
P_AUTEUR = {"type": "string", "description": "Nom de la personne qui prend la décision."}
P_EVOLUTION = {
    "type": "string",
    "description": "Identifiant d'une évolution (lister_evolutions) : l'écriture ou la lecture se fait sur sa branche, "
                   "sans toucher à la version de travail. Sans ce paramètre : la version de travail.",
}
P_VERSION = {
    "type": "string",
    "description": "Version de la spec à lire : un numéro (1.4), un environnement (production, recette) ou travail (par défaut).",
}


def _outil(nom, description, proprietes=None, requis=None):
    proprietes = {"projet": P_PROJET, **(proprietes or {})}
    return {
        "name": nom,
        "description": description,
        "inputSchema": {"type": "object", "properties": proprietes, "required": requis or []},
    }


OUTILS = [
    {
        "name": "localiser_projets",
        "description": "Cherche les projets (dossiers contenant projet.yaml) sous un dossier, ou à défaut dans les "
        "emplacements habituels (dossier personnel, dossiers connectés). Renvoie aussi l'environnement du serveur, "
        "utile pour trouver le bon chemin quand un dossier n'est pas reconnu.",
        "inputSchema": {"type": "object", "properties": {"dossier": {"type": "string"}}, "required": []},
    },
    _outil(
        "etat_projet",
        "Vue d'ensemble d'un projet : nom, nombre d'éléments par type, entités et leur couverture, "
        "nombre d'erreurs, de trous et de points à vérifier. À appeler en premier.",
    ),
    _outil(
        "lister_elements",
        "Liste les éléments de la base (id, nom ou titre, statut pour les règles), éventuellement d'un seul type.",
        {"type": {"type": "string", "enum": list(TYPES), "description": "Filtrer sur un type."}},
    ),
    _outil(
        "lire_element",
        "Contenu complet d'un élément (acteur, entité, règle, cas d'usage, écran) et ce qui en dépend. "
        "Accepte aussi un id de transition ou de statut.",
        {"id": {"type": "string", "description": "Identifiant, par exemple RG-002, ENT-EXPEDITION, TR-LIVRER."}},
        ["id"],
    ),
    _outil(
        "rechercher",
        "Recherche plein texte (sans tenir compte des accents ni de la casse) dans tous les éléments de la base.",
        {"texte": {"type": "string"}},
        ["texte"],
    ),
    _outil(
        "lister_trous",
        "Trous, erreurs et points à vérifier, chacun avec son identifiant stable, son message et la question à poser. "
        "Les trous déjà assumés (hors périmètre, impossible métier) sont exclus sauf si inclure_traites.",
        {
            "gravite": {"type": "string", "enum": [ERREUR, TROU, ALERTE]},
            "entite": {"type": "string", "description": "Limiter à une entité (id)."},
            "inclure_traites": {"type": "boolean"},
        },
    ),
    _outil(
        "analyser_impact",
        "Tout ce qui dépend d'un élément : règles, transitions, statuts, cas d'usage, écrans, captures de doc. "
        "À appeler avant toute modification de règle pour montrer l'impact à l'utilisateur.",
        {"id": {"type": "string"}},
        ["id"],
    ),
    _outil(
        "decrire_format",
        "Format attendu pour un type d'élément (schéma et exemple), à consulter avant d'écrire un élément.",
        {"type": {"type": "string", "enum": list(TYPES)}},
        ["type"],
    ),
    _outil(
        "contexte",
        "Toute la base en un texte compact (glossaire, acteurs, entités, étapes et actions, règles avec leur trace, "
        "parcours, écrans, trous ouverts). Une seule lecture suffit pour répondre ou pour coder : à appeler en premier. "
        "Pour une très grosse base, limiter avec sections.",
        {"version": P_VERSION, "sections": {"type": "array", "items": {"type": "string", "enum": SECTIONS}}},
    ),
    _outil(
        "lister_versions",
        "Versions figées de la spec (numéro, date, auteur, message) et version tournant sur chaque environnement.",
    ),
    _outil(
        "comparer_versions",
        "Ce qui a changé entre deux versions : éléments ajoutés, modifiés (avec les champs), remplacés, rendus obsolètes, supprimés.",
        {"de": P_VERSION, "a": P_VERSION},
        ["de"],
    ),
    _outil(
        "historique_versions",
        "Histoire d'un élément à travers les versions : quand il apparaît, quand il change, et s'il est identique "
        "en production, en recette et dans la version de travail.",
        {"id": {"type": "string"}},
        ["id"],
    ),
    _outil(
        "figer_version",
        "Fige une version de la spec (étiquette Git spec-X.Y) : intègre d'abord les évolutions validées qui ciblent ce "
        "numéro, et elles seules. Refusé si une évolution ciblée n'est pas validée, en cas de conflit, ou s'il reste des "
        "changements non enregistrés. N'appeler qu'après accord explicite de l'utilisateur sur le numéro et le message.",
        {"version": {"type": "string", "description": "Par exemple 1.5."}, "message": {"type": "string"}, "auteur": P_AUTEUR},
        ["version", "message", "auteur"],
    ),
    _outil(
        "lister_evolutions",
        "Évolutions en cours, validées ou intégrées : nom, version cible (1.6 ou plus tard), statut, applications, "
        "et ce que chacune change par rapport à la version de travail.",
    ),
    _outil(
        "creer_evolution",
        "Ouvre une évolution (une branche du référentiel) rattachée à une version cible. Les changements s'y font "
        "ensuite avec le paramètre evolution. N'appeler qu'après accord sur le nom et la version cible.",
        {"nom": {"type": "string"}, "cible": {"type": "string", "description": "Numéro (1.6) ou « plus tard »."},
         "applications": {"type": "array", "items": {"type": "string"}}, "auteur": P_AUTEUR},
        ["nom", "cible", "auteur"],
    ),
    _outil(
        "cibler_evolution",
        "Change la version cible d'une évolution (par exemple pour la décaler à plus tard). Après accord explicite.",
        {"id": {"type": "string"}, "cible": {"type": "string"}, "auteur": P_AUTEUR},
        ["id", "cible", "auteur"],
    ),
    _outil(
        "valider_evolution",
        "Marque une évolution comme validée : elle sera intégrée quand on figera sa version cible. Après accord explicite.",
        {"id": {"type": "string"}, "auteur": P_AUTEUR},
        ["id", "auteur"],
    ),
    _outil(
        "correspondance",
        "Quelle version de code applique quelle version de spec : pour chaque environnement, la spec visée et, pour "
        "chaque application, la version livrée, la spec qu'elle déclare et son état (à jour, conforme, en retard avec "
        "les changements manquants, en avance, inconnue). Lit les dépôts de code en lecture seule.",
    ),
    _outil(
        "proposer_tests",
        "Cas de test tirés de la base, en langage métier (étant donné, quand, alors) : chemin normal et droits de chaque "
        "action, règle non respectée, chaque ligne d'une table de décision, non-régression d'une règle remplacée. "
        "Seules les règles validées en produisent ; le reste est listé dans en_attente. Avec element, seulement ce qui "
        "vient de cette règle ou de cette action. Lecture seule : rien n'est écrit.",
        {"element": {"type": "string", "description": "Identifiant d'une règle ou d'une action (facultatif)."}, "version": P_VERSION},
    ),
    _outil(
        "cas_a_revoir",
        "Cas de test enregistrés dont une source (règle, action) a changé, est devenue obsolète ou a disparu depuis leur rédaction.",
    ),
    _outil(
        "enregistrer_tests",
        "Enregistre des cas proposés en brouillon dans recette/cas/ (tous ceux de proposer_tests si ids est vide). "
        "Ne remplace jamais un cas existant. N'appeler qu'après accord explicite de l'utilisateur sur la liste.",
        {"ids": {"type": "array", "items": {"type": "string"}}, "element": {"type": "string"}, "auteur": P_AUTEUR},
        ["auteur"],
    ),
    _outil(
        "enregistrer_element",
        "Crée ou remplace entièrement un élément (contenu complet en YAML ou JSON). Pour une règle, une entrée "
        "d'historique est ajoutée automatiquement. Rien n'est écrit si la structure est invalide. Renvoie les trous "
        "résolus et apparus. N'appeler qu'après accord explicite de l'utilisateur sur le contenu.",
        {
            "type": {"type": "string", "enum": list(TYPES)},
            "contenu": {"type": "string", "description": "L'élément complet, en YAML ou JSON."},
            "auteur": P_AUTEUR,
            "changement": {"type": "string", "description": "Ce qui change, en une phrase (va dans l'historique)."},
            "raison": {"type": "string", "description": "Pourquoi (décision, atelier, compte rendu)."},
        },
        ["type", "contenu", "auteur", "changement"],
    ),
    _outil(
        "remplacer_regle",
        "Corrige une décision : crée une nouvelle règle qui remplace l'ancienne, rend l'ancienne obsolète "
        "(historique conservé) et, par défaut, rattache à la nouvelle les transitions qui citaient l'ancienne. "
        "N'appeler qu'après accord explicite de l'utilisateur.",
        {
            "ancienne_id": {"type": "string"},
            "nouvelle": {"type": "string", "description": "La nouvelle règle complète (YAML ou JSON), avec son propre id."},
            "auteur": P_AUTEUR,
            "raison": {"type": "string"},
            "rattacher_transitions": {"type": "boolean", "default": True},
        },
        ["ancienne_id", "nouvelle", "auteur", "raison"],
    ),
    _outil(
        "decider_trou",
        "Enregistre la décision du responsable produit sur un trou : hors_perimetre, impossible_metier, "
        "ou a_traiter pour le rouvrir. Toujours avec une justification.",
        {
            "trou": {"type": "string", "description": "Identifiant exact donné par lister_trous."},
            "statut": {"type": "string", "enum": ["hors_perimetre", "impossible_metier", "a_traiter"]},
            "justification": {"type": "string"},
            "par": P_AUTEUR,
        },
        ["trou", "statut", "justification", "par"],
    ),
    _outil(
        "generer_spec",
        "Génère la spécification HTML consultable et les diagrammes Mermaid dans le dossier sortie/ du projet. "
        "Renvoie aussi le code Mermaid de chaque entité, utilisable pour afficher un diagramme.",
    ),
    _outil(
        "creer_projet",
        "Crée un projet vide (dossiers et projet.yaml) dans un dossier.",
        {
            "dossier": {"type": "string", "description": "Dossier à créer ou à initialiser."},
            "id": {"type": "string", "description": "Identifiant en majuscules, par exemple FRET-EDF."},
            "nom": {"type": "string"},
            "description": {"type": "string"},
        },
        ["dossier", "id", "nom"],
    ),
]


ECRITURES_EVOLUTION = ("enregistrer_element", "remplacer_regle", "decider_trou", "enregistrer_tests")
for _o in OUTILS:
    if _o["name"] in ("etat_projet", "lister_elements", "lire_element", "rechercher", "lister_trous", "analyser_impact"):
        _o["inputSchema"]["properties"]["version"] = P_VERSION
    if _o["name"] in ECRITURES_EVOLUTION + ("contexte", "etat_projet", "lister_elements", "lire_element", "rechercher",
                                            "lister_trous", "analyser_impact", "proposer_tests"):
        _o["inputSchema"]["properties"]["evolution"] = P_EVOLUTION

# ---------------------------------------------------------------- implémentation des outils


class ErreurOutil(Exception):
    pass


def _racine(args) -> Path:
    chemin = args.get("projet") or os.environ.get("REFERENTIEL_PROJET")
    if not chemin:
        raise ErreurOutil("Indiquer le dossier du projet (paramètre projet), ou définir REFERENTIEL_PROJET.")
    racine = Path(chemin).expanduser()
    if not (racine / "projet.yaml").exists():
        raise ErreurOutil(f"Aucun projet.yaml dans {racine}. Utiliser creer_projet pour démarrer un projet.")
    if args.get("evolution"):
        if args.get("version"):
            raise ErreurOutil("Choisir une version ou une évolution, pas les deux.")
        try:
            return evolutions.chemin(racine, args["evolution"])
        except ErreurVersion as e:
            raise ErreurOutil(str(e)) from e
    return racine


def _racine_principale(args) -> Path:
    return _racine({k: v for k, v in args.items() if k != "evolution"})


def _projet(args):
    try:
        p = charger_version(_racine(args), args.get("version"))
    except ErreurVersion as e:
        raise ErreurOutil(str(e)) from e
    if p.erreurs:
        raise ErreurOutil("Structure invalide, à corriger avant de continuer :\n" + "\n".join(f"- {e}" for e in p.erreurs))
    return p


def _nom(el: dict) -> str:
    return el.get("nom") or el.get("titre") or ""


def outil_localiser_projets(args):
    import platform

    ignores = {".git", "node_modules", "Library", ".Trash", "sortie", "__pycache__", ".cache"}
    if args.get("dossier"):
        bases = [Path(args["dossier"]).expanduser()]
    else:
        home = Path.home()
        bases = [home / "mnt", home / "Documents", home / "Desktop", home / "Projets", home / "projets", home, Path.cwd()]
    trouves, vus = [], set()
    for base in bases:
        if not base.is_dir():
            continue
        pile = [(base, 0)]
        while pile and len(trouves) < 50:
            dossier, prof = pile.pop()
            try:
                reel = dossier.resolve()
                if reel in vus:
                    continue
                vus.add(reel)
                if (dossier / "projet.yaml").is_file():
                    p = charger(dossier)
                    trouves.append({"dossier": str(dossier), "id": p.meta.get("id"), "nom": p.meta.get("nom")})
                    continue
                if prof < 4:
                    for enfant in dossier.iterdir():
                        if enfant.is_dir() and enfant.name not in ignores and not enfant.name.startswith("."):
                            pile.append((enfant, prof + 1))
            except (PermissionError, OSError):
                continue
    return {
        "projets": trouves,
        "environnement": {
            "systeme": platform.system(), "python": platform.python_version(),
            "dossier_personnel": str(Path.home()), "dossier_courant": str(Path.cwd()),
            "REFERENTIEL_PROJET": os.environ.get("REFERENTIEL_PROJET"),
        },
    }


def outil_etat_projet(args):
    p = _projet(args)
    trous = analyser(p)
    ouverts = [t for t in trous if t.statut == "ouvert"]
    return {
        "projet": p.meta,
        "dossier": str(p.racine),
        "elements": {
            "acteurs": len(p.acteurs), "entites": len(p.entites), "regles": len(p.regles),
            "cas_usage": len(p.cas_usage), "ecrans": len(p.ecrans),
        },
        "regles_par_statut": {s: sum(1 for r in p.regles.values() if r["statut"] == s) for s in ("validee", "proposee", "obsolete")},
        "couverture": couverture(p, trous),
        "ouverts": {g: sum(1 for t in ouverts if t.gravite == g) for g in (ERREUR, TROU, ALERTE)},
        "trous_assumes": sum(1 for t in trous if t.statut != "ouvert"),
    }


def outil_lister_elements(args):
    p = _projet(args)
    attrs = {"acteur": "acteurs", "entite": "entites", "regle": "regles", "cas_usage": "cas_usage", "ecran": "ecrans"}
    types = [args["type"]] if args.get("type") else list(attrs)
    res = {}
    for t in types:
        res[t] = [
            {"id": i, "nom": _nom(el), **({"statut": el["statut"]} if t == "regle" else {})}
            for i, el in getattr(p, attrs[t]).items()
        ]
    return res


def outil_lire_element(args):
    p = _projet(args)
    ident = args["id"]
    for attr in ("acteurs", "entites", "regles", "cas_usage", "ecrans"):
        el = getattr(p, attr).get(ident)
        if el:
            res = {"fichier": p.fichiers[ident], "element": el}
            try:
                res["dependances"] = _avec_noms(p, analyser_impact(p, ident))
            except KeyError:
                pass
            return res
    if ident in p.transitions:
        ent, tr = p.transitions[ident]
        return {"entite": ent["id"], "transition": tr, "dependances": _avec_noms(p, analyser_impact(p, ident))}
    for ent in p.entites.values():
        for s in ent["statuts"]:
            if s["id"] == ident:
                return {"entite": ent["id"], "statut": s, "dependances": _avec_noms(p, analyser_impact(p, ident))}
    raise ErreurOutil(f"Identifiant inconnu : {ident}. Utiliser rechercher ou lister_elements.")


def _sans_accents(texte: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn")


def outil_rechercher(args):
    p = _projet(args)
    # Chaque mot doit apparaître, à la terminaison près (« douane » trouve « douanier »).
    racines = [m[: max(4, len(m) - 2)] for m in _sans_accents(args["texte"]).split() if m]
    if not racines:
        raise ErreurOutil("Texte de recherche vide.")

    def trouve(texte: str) -> bool:
        t = _sans_accents(texte)
        return all(r in t for r in racines)

    res = []
    for attr in ("acteurs", "entites", "regles", "cas_usage", "ecrans"):
        for ident, el in getattr(p, attr).items():
            if trouve(json.dumps(el, ensure_ascii=False)):
                res.append({"id": ident, "type": attr, "nom": _nom(el)})
    for g in p.meta.get("glossaire", []):
        if trouve(g["terme"] + " " + g["definition"]):
            res.append({"glossaire": g})
    return {"resultats": res, "nombre": len(res)}


def outil_lister_trous(args):
    p = _projet(args)
    trous = analyser(p)
    if not args.get("inclure_traites"):
        trous = [t for t in trous if t.statut == "ouvert"]
    if args.get("gravite"):
        trous = [t for t in trous if t.gravite == args["gravite"]]
    if args.get("entite"):
        trous = [t for t in trous if t.entite == args["entite"]]
    return {
        "trous": [t.vers_dict() for t in trous],
        "nombre": len(trous),
        "decisions_sans_objet": decisions_orphelines(p, analyser(p)),
    }


def _avec_noms(p, impact: dict) -> dict:
    """Ajoute le nom lisible de chaque élément : l'utilisateur parle en noms, pas en codes."""
    def nom(ident: str) -> str:
        if ":" in ident and ident.split(":", 1)[0] in p.entites:  # statut ENT:STATUT ou capture SCR:fichier
            ent_id, sid = ident.split(":", 1)
            ent = p.entites[ent_id]
            return next((f"{ent['nom']} : {s['nom']}" for s in ent["statuts"] if s["id"] == sid), ident)
        if ":" in ident and ident.split(":", 1)[0] in p.ecrans:
            sid, fichier = ident.split(":", 1)
            return f"Capture de l'écran « {p.ecrans[sid]['nom']} » ({fichier})"
        return libelle(p, ident)

    return {
        k: ([{"id": i, "nom": nom(i)} for i in v] if isinstance(v, list) else v)
        for k, v in impact.items()
    } | {"element_nom": nom(impact["element"])}


def outil_analyser_impact(args):
    p = _projet(args)
    try:
        return _avec_noms(p, analyser_impact(p, args["id"]))
    except KeyError:
        raise ErreurOutil(f"Identifiant inconnu : {args['id']}")


EXEMPLES = {
    "regle": (
        "id: RG-010\ntitre: Orientation après vérification des documents\nstatut: proposee   # proposee | validee | obsolete\n"
        "type: table_decision   # contrainte | calcul | droit | table_decision\nentite: ENT-EXPEDITION\n"
        "enonce: Phrase complète, compréhensible par le métier.\nsource: Atelier du 2026-09-12\n"
        "conditions:\n  - attribut: document_douanier\n  - attribut: marchandise_dangereuse\n"
        "lignes:   # attribut absent d'une ligne = indifférent\n"
        "  - si: {document_douanier: valide, marchandise_dangereuse: false}\n    alors: TR-VALIDER-DOCS\n"
        "    note: facultatif\n# historique : ajouté automatiquement à l'enregistrement\n"
    ),
    "entite": (
        "id: ENT-EXPEDITION\nnom: Expédition\ndescription: ...\nattributs:\n  - nom: document_douanier\n    type: enum   # enum | booleen | texte | nombre | date\n"
        "    valeurs: [valide, manquant, refuse]\nstatut_initial: BROUILLON\nstatuts:\n  - id: BROUILLON\n    nom: Brouillon\n"
        "  - id: LIVREE\n    nom: Livrée\n    final: true\ntransitions:\n  - id: TR-SOUMETTRE\n    nom: Soumettre l'expédition\n"
        "    de: BROUILLON\n    vers: LIVREE\n    acteurs: [ACT-EXPEDITEUR]\n    regles: [RG-001]\n"
    ),
    "acteur": "id: ACT-EXPEDITEUR\nnom: Expéditeur\ndescription: Client qui crée et suit ses expéditions.\n",
    "cas_usage": (
        "id: UC-001\nnom: Expédier une marchandise\nacteur_principal: ACT-EXPEDITEUR\ndescription: ...\netapes:\n"
        "  - acteur: ACT-EXPEDITEUR\n    action: Saisit l'expédition et la soumet\n    transition: TR-SOUMETTRE   # facultatif\n"
        "    ecran: SCR-001   # facultatif\n"
    ),
    "ecran": (
        "id: SCR-001\nnom: Saisie d'une expédition\ndescription: ...\nacteurs: [ACT-EXPEDITEUR]\ncaptures:\n"
        "  - fichier: captures/SCR-001-expediteur.png\n    date: 2026-09-20\n    acteur: ACT-EXPEDITEUR\n"
    ),
}


def outil_decrire_format(args):
    t = args["type"]
    if t not in TYPES:
        raise ErreurOutil(f"Type inconnu : {t}")
    return {
        "type": t,
        "dossier": TYPES[t][0],
        "exemple_yaml": EXEMPLES[t],
        "schema": TYPES[t][1],
        "conventions": [
            "Identifiants en majuscules, stables, jamais renumérotés (RG-001, TR-LIVRER, ENT-EXPEDITION).",
            "Dates au format AAAA-MM-JJ.",
            "Une règle qui n'est pas encore confirmée par le métier a le statut proposee.",
        ],
    }


def outil_enregistrer_element(args):
    racine = _racine(args)
    return enregistrer_element(racine, args["type"], args["contenu"], args["auteur"], args["changement"], args.get("raison"))


def outil_remplacer_regle(args):
    racine = _racine(args)
    return remplacer_regle(
        racine, args["ancienne_id"], args["nouvelle"], args["auteur"], args["raison"],
        args.get("rattacher_transitions", True),
    )


def outil_decider_trou(args):
    return decider_trou(_racine(args), args["trou"], args["statut"], args["justification"], args["par"])


def outil_generer_spec(args):
    p = _projet(args)
    trous = analyser(p)
    sortie = p.racine / "sortie"
    sortie.mkdir(exist_ok=True)
    (sortie / "spec.html").write_text(generer_html(p, trous), encoding="utf-8")
    fichiers = ecrire_mermaid(p, trous, sortie / "diagrammes")
    return {
        "spec": str(sortie / "spec.html"),
        "diagrammes": {f.stem: f.read_text(encoding="utf-8") for f in fichiers},
    }


def outil_creer_projet(args):
    return creer_projet(args["dossier"], args["id"], args["nom"], args.get("description") or "À compléter")


def outil_contexte(args):
    p = _projet(args)
    texte = generer_contexte(p, args.get("sections"))
    return texte + f"\n({taille(texte)['jetons_estimes']} jetons environ)\n"


def outil_lister_versions(args):
    racine = _racine(args)
    return {"versions": lister_versions(racine), "environnements": environnements(racine)}


def outil_comparer_versions(args):
    try:
        return comparer(_racine(args), args["de"], args.get("a"))
    except ErreurVersion as e:
        raise ErreurOutil(str(e)) from e


def outil_historique_versions(args):
    return historique_element(_racine(args), args["id"])


def _ev(fonction, *a):
    try:
        return fonction(*a)
    except ErreurVersion as e:
        raise ErreurOutil(str(e)) from e


def outil_lister_evolutions(args):
    return {"evolutions": _ev(evolutions.lister, _racine_principale(args))}


def outil_creer_evolution(args):
    return _ev(evolutions.creer, _racine_principale(args), args["nom"], args.get("cible"), args["auteur"], args.get("applications"))


def outil_cibler_evolution(args):
    return _ev(evolutions.cibler, _racine_principale(args), args["id"], args.get("cible"), args["auteur"])


def outil_valider_evolution(args):
    return _ev(evolutions.valider, _racine_principale(args), args["id"], args["auteur"])


def outil_correspondance(args):
    return livraisons.correspondance(_racine_principale(args))


def outil_proposer_tests(args):
    return cas_test.proposer(_projet(args), args.get("element"))


def outil_cas_a_revoir(args):
    return {"a_revoir": cas_test.a_revoir(_projet({k: v for k, v in args.items() if k != "version"}))}


def outil_enregistrer_tests(args):
    try:
        return cas_test.enregistrer(_projet({k: v for k, v in args.items() if k != "version"}), args.get("ids"), args["auteur"], args.get("element"))
    except ValueError as e:
        raise ErreurOutil(str(e)) from e


def outil_figer_version(args):
    try:
        return evolutions.figer(_racine_principale(args), args["version"], args["message"], args.get("auteur"))
    except ErreurVersion as e:
        raise ErreurOutil(str(e)) from e


IMPLEMENTATIONS = {
    "contexte": outil_contexte,
    "lister_versions": outil_lister_versions,
    "comparer_versions": outil_comparer_versions,
    "historique_versions": outil_historique_versions,
    "figer_version": outil_figer_version,
    "proposer_tests": outil_proposer_tests,
    "lister_evolutions": outil_lister_evolutions,
    "creer_evolution": outil_creer_evolution,
    "cibler_evolution": outil_cibler_evolution,
    "valider_evolution": outil_valider_evolution,
    "correspondance": outil_correspondance,
    "cas_a_revoir": outil_cas_a_revoir,
    "enregistrer_tests": outil_enregistrer_tests,
    "localiser_projets": outil_localiser_projets,
    "etat_projet": outil_etat_projet,
    "lister_elements": outil_lister_elements,
    "lire_element": outil_lire_element,
    "rechercher": outil_rechercher,
    "lister_trous": outil_lister_trous,
    "analyser_impact": outil_analyser_impact,
    "decrire_format": outil_decrire_format,
    "enregistrer_element": outil_enregistrer_element,
    "remplacer_regle": outil_remplacer_regle,
    "decider_trou": outil_decider_trou,
    "generer_spec": outil_generer_spec,
    "creer_projet": outil_creer_projet,
}


# ---------------------------------------------------------------- protocole


def appeler_outil(nom: str, args: dict) -> dict:
    if nom not in IMPLEMENTATIONS:
        return {"content": [{"type": "text", "text": f"Outil inconnu : {nom}"}], "isError": True}
    try:
        args = args or {}
        resultat = IMPLEMENTATIONS[nom](args)
        if nom in ECRITURES_EVOLUTION and args.get("evolution"):
            # Dans une évolution, chaque écriture est enregistrée sur sa branche, signée par son auteur.
            auteur = args.get("auteur") or args.get("par") or "referentiel"
            evolutions.enregistrer(_racine_principale(args), args["evolution"], auteur,
                                   args.get("changement") or args.get("raison") or args.get("justification") or nom)
        # Texte tel quel, sinon JSON compact : chaque caractère renvoyé est lu (et payé) par Claude.
        texte = resultat if isinstance(resultat, str) else json.dumps(resultat, ensure_ascii=False, separators=(",", ":"), default=str)
        return {"content": [{"type": "text", "text": texte}], "isError": False}
    except (ErreurOutil, ErreurEcriture, ErreurVersion) as e:
        return {"content": [{"type": "text", "text": str(e)}], "isError": True}
    except KeyError as e:
        return {"content": [{"type": "text", "text": f"Paramètre manquant : {e}"}], "isError": True}
    except Exception as e:  # dernier filet : on ne fait jamais tomber le serveur
        traceback.print_exc(file=sys.stderr)
        return {"content": [{"type": "text", "text": f"Erreur interne : {e}"}], "isError": True}


def traiter(message: dict):
    """Traite un message JSON-RPC ; renvoie la réponse, ou None pour une notification."""
    methode = message.get("method")
    ident = message.get("id")
    params = message.get("params") or {}

    if ident is None:  # notification (initialized, cancelled...)
        return None

    if methode == "initialize":
        demande = params.get("protocolVersion")
        version = demande if demande in VERSIONS_PROTOCOLE else VERSIONS_PROTOCOLE[0]
        resultat = {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "watson", "version": __version__},
            "instructions": INSTRUCTIONS,
        }
    elif methode == "ping":
        resultat = {}
    elif methode == "tools/list":
        resultat = {"tools": OUTILS}
    elif methode == "tools/call":
        resultat = appeler_outil(params.get("name"), params.get("arguments") or {})
    elif methode in ("resources/list", "prompts/list"):
        resultat = {methode.split("/")[0]: []}
    else:
        return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": f"Méthode inconnue : {methode}"}}
    return {"jsonrpc": "2.0", "id": ident, "result": resultat}


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    print(f"watson {__version__} prêt (Python {sys.version.split()[0]})", file=sys.stderr, flush=True)
    for ligne in sys.stdin:
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            message = json.loads(ligne)
        except json.JSONDecodeError:
            reponse = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON invalide"}}
        else:
            if isinstance(message, list):  # lot JSON-RPC
                reponse = [r for r in (traiter(m) for m in message) if r is not None] or None
            else:
                reponse = traiter(message)
        if reponse is not None:
            sys.stdout.write(json.dumps(reponse, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
