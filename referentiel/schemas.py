"""Schémas JSON des fichiers de la base de connaissance.

Chaque type d'élément vit dans son propre dossier, un fichier YAML par élément.
Les identifiants sont stables : ils servent de lien entre les règles, le code,
les tests et la documentation.
"""

from __future__ import annotations


ID = {"type": "string", "pattern": r"^[A-Z0-9][A-Z0-9_-]*$"}
DATE = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}
TEXTE = {"type": "string", "minLength": 1}
LISTE_ID = {"type": "array", "items": ID}

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
        "valeurs": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["nom"],
                "properties": {"nom": TEXTE, "note": TEXTE, "groupe": TEXTE},
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
        "acteurs": LISTE_ID,
        "applications": LISTE_ID,
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
}
