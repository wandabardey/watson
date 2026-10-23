"""Schémas JSON des fichiers de la base de connaissance.

Chaque type d'élément vit dans son propre dossier, un fichier YAML par élément.
Les identifiants sont stables : ils servent de lien entre les règles, le code,
les tests et la documentation.
"""

from __future__ import annotations


ID = {"type": "string", "pattern": r"^[A-Z0-9][A-Z0-9_.-]*$"}  # point permis : SIMAR-04.1
DATE = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}
TEXTE = {"type": "string", "minLength": 1}
LISTE_ID = {"type": "array", "items": ID}
# Version produit (MVP, V2…) à laquelle un élément appartient ; déclarée dans projet.yaml (versions_produit).
VERSION = {"type": "string", "pattern": r"^[A-Za-z0-9][A-Za-z0-9._-]*$"}

HISTORIQUE = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["date", "auteur", "changement"],
        "properties": {
            "date": DATE,
            "auteur": TEXTE,
            "changement": TEXTE,
            "raison": TEXTE,
        },
        "additionalProperties": False,
    },
}

PROJET = {
    "type": "object",
    "required": ["id", "nom"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        # Versions produit, dans l'ordre de livraison : MVP, V2… Chaque élément peut en porter une (« version »).
        "versions_produit": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "nom"],
                "properties": {"id": VERSION, "nom": TEXTE, "description": TEXTE, "date": DATE},
                "additionalProperties": False,
            },
        },
        "glossaire": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["terme", "definition"],
                "properties": {"terme": TEXTE, "definition": TEXTE},
                "additionalProperties": False,
            },
        },
        # Applications du projet et leur dépôt de code, lu en lecture seule pour savoir quelle spec chaque
        # version livrée applique.
        "applications": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "nom"],
                "properties": {
                    "id": ID,
                    "nom": TEXTE,
                    "depot": TEXTE,  # chemin du dépôt de code, relatif au projet ou absolu
                    "etiquettes": TEXTE,  # motif des étiquettes de livraison, « v* » par défaut
                    "fichier": TEXTE,  # fichier de référence dans le dépôt, « REFERENTIEL.md » par défaut
                    "couleur": {"type": "string", "pattern": r"^#[0-9A-Fa-f]{6}$"},  # couleur dans les schémas
                    "support": {"enum": ["web", "mobile", "bureau", "api"]},
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

ACTEUR = {
    "type": "object",
    "required": ["id", "nom"],
    "properties": {"id": ID, "nom": TEXTE, "description": TEXTE},
    "additionalProperties": False,
}

ATTRIBUT = {
    "type": "object",
    "required": ["nom", "type"],
    "properties": {
        "nom": {"type": "string", "pattern": r"^[a-z][a-z0-9_]*$"},
        "libelle": TEXTE,  # nom lisible affiché à l'utilisateur, par exemple « Client grand compte »
        # « reference » : la donnée désigne une autre entité (cible) ; « liste » : une valeur prise dans une
        # liste de valeurs du projet (cible) ; « enum » : quelques valeurs écrites sur place (valeurs).
        "type": {"enum": ["enum", "booleen", "texte", "nombre", "date", "reference", "liste"]},
        "valeurs": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "cible": ID,
        "multiple": {"type": "boolean"},   # plusieurs valeurs possibles
        "optionnel": {"type": "boolean"},
        "version": VERSION,
        "description": TEXTE,
    },
    "additionalProperties": False,
}

ENTITE = {
    "type": "object",
    # Le cycle de vie (statut_initial, statuts, transitions) est facultatif : une entité de référentiel,
    # comme un lieu ou un véhicule, n'en a pas.
    "required": ["id", "nom"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "version": VERSION,
        "attributs": {"type": "array", "items": ATTRIBUT},
        "statut_initial": ID,
        "statuts": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["id", "nom"],
                "properties": {
                    "id": ID,
                    "nom": TEXTE,
                    "description": TEXTE,
                    "final": {"type": "boolean"},
                    "version": VERSION,
                },
                "additionalProperties": False,
            },
        },
        "transitions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "nom", "de", "vers"],
                "properties": {
                    "id": ID,
                    "nom": TEXTE,
                    "de": ID,
                    "vers": ID,
                    "acteurs": LISTE_ID,
                    "regles": LISTE_ID,
                    "condition": TEXTE,
                    "applications": LISTE_ID,
                    "version": VERSION,
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

LISTE = {
    "type": "object",
    "required": ["id", "nom", "valeurs"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "version": VERSION,
        "valeurs": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["nom"],
                "properties": {"nom": TEXTE, "note": TEXTE, "groupe": TEXTE, "version": VERSION},
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

REGLE = {
    "type": "object",
    "required": ["id", "titre", "statut", "type", "enonce"],
    "properties": {
        "id": ID,
        "titre": TEXTE,
        "statut": {"enum": ["proposee", "validee", "obsolete"]},
        "type": {"enum": ["contrainte", "calcul", "droit", "table_decision"]},
        "entite": ID,
        "enonce": TEXTE,
        "source": TEXTE,
        "remplace": ID,
        "applications": LISTE_ID,
        "version": VERSION,
        # Ce sur quoi la règle porte : une entité, une de ses données (ENT-SOCIETE.siret), une étape
        # (transition), un écran ou un parcours. « entite » reste le rattachement principal.
        "porte_sur": {"type": "array", "items": {"type": "string", "pattern": r"^[A-Z0-9][A-Z0-9_.-]*(\.[a-z][a-z0-9_]*)?$"}},
        # Table de décision : conditions croisées et résultat de chaque ligne.
        "conditions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["attribut"],
                "properties": {"attribut": TEXTE},
                "additionalProperties": False,
            },
        },
        "lignes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["si", "alors"],
                "properties": {
                    "si": {"type": "object"},
                    "alors": ID,
                    "note": TEXTE,
                },
                "additionalProperties": False,
            },
        },
        "historique": HISTORIQUE,
    },
    "additionalProperties": False,
}

CAS_USAGE = {
    "type": "object",
    "required": ["id", "nom", "acteur_principal", "etapes"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "acteur_principal": ID,
        "version": VERSION,
        "etapes": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["acteur", "action"],
                "properties": {
                    "acteur": ID,
                    "action": TEXTE,
                    "transition": ID,
                    "ecran": ID,
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

ECRAN = {
    "type": "object",
    "required": ["id", "nom"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "type": {"enum": ["page", "formulaire", "liste", "panneau", "modale", "tableau_de_bord"]},
        "acteurs": LISTE_ID,
        "applications": LISTE_ID,
        "version": VERSION,
        "a_trancher": {"type": "boolean"},  # écran pas encore décidé
        "parent": ID,  # sous-écran (panneau, modale) d'un autre écran
        "cas_usage": {"type": "array", "items": TEXTE},  # « UC 14 », ou identifiants de cas d'usage
        # Ce que l'écran contient : sections numérotées, variantes (◇), onglets d'une liste.
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["titre"],
                "properties": {
                    "titre": TEXTE,
                    "description": TEXTE,
                    "genre": {"enum": ["section", "variante", "onglet"]},
                    "version": VERSION,
                },
                "additionalProperties": False,
            },
        },
        # Où l'on va depuis l'écran : navigation simple, routage vers un autre formulaire, échange entre applications.
        "routages": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["vers"],
                "properties": {
                    "vers": ID,
                    "libelle": TEXTE,
                    "condition": TEXTE,
                    "genre": {"enum": ["navigation", "routage", "echange"]},
                    "version": VERSION,
                },
                "additionalProperties": False,
            },
        },
        "regles": LISTE_ID,  # règles que l'écran applique
        "captures": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["fichier", "date"],
                "properties": {
                    "fichier": TEXTE,
                    "date": DATE,
                    "acteur": ID,
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

ETAPE_ID = {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"}

# Scénario : un parcours dessiné en diagramme de processus. Étapes typées, reliées dans l'ordre par défaut,
# ou par des liens explicites (conditions, refus, retours).
SCENARIO = {
    "type": "object",
    "required": ["id", "nom", "etapes"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "version": VERSION,
        "a_trancher": {"type": "boolean"},
        "acteur": ID,  # acteur principal
        "entite": ID,  # objet métier dont le scénario fait avancer les statuts
        "cas_usage": {"type": "array", "items": TEXTE},
        "etapes": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["id", "libelle"],
                "properties": {
                    "id": ETAPE_ID,
                    "libelle": TEXTE,
                    "genre": {"enum": ["debut", "etape", "decision", "statut", "fin"]},
                    "description": TEXTE,
                    "application": ID,
                    "acteur": ID,
                    "ecran": ID,
                    "statut": ID,  # statut apposé (genre statut) ou atteint
                    "transition": ID,
                    "groupe": TEXTE,
                    "version": VERSION,
                    "a_trancher": {"type": "boolean"},
                },
                "additionalProperties": False,
            },
        },
        "liens": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["de", "vers"],
                "properties": {
                    "de": ETAPE_ID,
                    "vers": ETAPE_ID,
                    "libelle": TEXTE,
                    "genre": {"enum": ["suite", "refus", "retour"]},
                    "version": VERSION,
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": False,
}

# Flux externe : un échange entre une application du produit et un système du client ou d'un partenaire.
FLUX = {
    "type": "object",
    "required": ["id", "nom", "sens", "partenaire"],
    "properties": {
        "id": ID,
        "nom": TEXTE,
        "description": TEXTE,
        "version": VERSION,
        "a_trancher": {"type": "boolean"},
        "sens": {"enum": ["entrant", "sortant", "bidirectionnel"]},
        "partenaire": TEXTE,  # le système externe : « ERP du client (SAP) », « Douane (DELTA G) »
        "application": ID,  # l'application du produit concernée
        "declencheur": {
            "type": "object",
            "properties": {
                "genre": {"enum": ["evenement", "planifie", "a_la_demande"]},
                "transition": ID,  # l'action du cycle de vie qui déclenche l'échange
                "frequence": TEXTE,
                "description": TEXTE,
            },
            "additionalProperties": False,
        },
        "moyen": {"enum": ["api", "fichier", "mail", "edi", "autre"]},
        "format": TEXTE,
        "donnees": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["entite"],
                "properties": {"entite": ID, "attributs": {"type": "array", "items": TEXTE}, "note": TEXTE},
                "additionalProperties": False,
            },
        },
        "regles": LISTE_ID,
        "erreurs": TEXTE,  # que se passe-t-il si l'échange échoue
        "volumetrie": TEXTE,
        "responsable": TEXTE,
    },
    "additionalProperties": False,
}

DECISION_TROU = {
    "type": "object",
    "required": ["trou", "statut", "justification"],
    "properties": {
        "trou": TEXTE,
        "statut": {"enum": ["hors_perimetre", "impossible_metier", "a_traiter"]},
        "justification": TEXTE,
        "par": TEXTE,
        "date": DATE,
    },
    "additionalProperties": False,
}

# dossier -> (schéma, libellé)
TYPES = {
    "acteurs": (ACTEUR, "acteur"),
    "listes": (LISTE, "liste de valeurs"),
    "entites": (ENTITE, "entité"),
    "regles": (REGLE, "règle"),
    "cas-usage": (CAS_USAGE, "cas d'usage"),
    "ecrans": (ECRAN, "écran"),
    "scenarios": (SCENARIO, "scénario"),
    "flux": (FLUX, "flux"),
}


def cible_et_donnee(cible: str) -> tuple:
    """« ENT-SOCIETE.siret » donne (ENT-SOCIETE, siret) ; « SIMAR-04.1 » donne (SIMAR-04.1, "")."""
    import re

    m = re.match(r"^(.*)\.([a-z][a-z0-9_]*)$", cible)
    return (m.group(1), m.group(2)) if m else (cible, "")
