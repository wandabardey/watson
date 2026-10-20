"""Validateur minimal de schémas (sous-ensemble de JSON Schema utilisé par schemas.py).

Évite toute dépendance externe : le moteur doit tourner avec un Python nu
(y compris celui livré avec macOS), car il est lancé par le plugin Claude.
"""

from __future__ import annotations

import re

_TYPES = {
    "string": str,
    "object": dict,
    "array": list,
    "boolean": bool,
}


def _type_ok(valeur, attendu: str) -> bool:
    if attendu == "boolean":
        return isinstance(valeur, bool)
    if attendu in ("integer", "number"):
        return isinstance(valeur, (int, float)) and not isinstance(valeur, bool)
    return isinstance(valeur, _TYPES[attendu])


def erreurs(valeur, schema: dict, chemin: tuple = ()) -> list[tuple[tuple, str]]:
    """Renvoie la liste des (chemin, message) ; vide si la valeur respecte le schéma."""
    res: list[tuple[tuple, str]] = []

    if "enum" in schema and valeur not in schema["enum"]:
        res.append((chemin, f"{valeur!r} n'est pas une valeur permise ({', '.join(map(str, schema['enum']))})"))
        return res

    attendu = schema.get("type")
    if attendu and not _type_ok(valeur, attendu):
        noms = {"string": "un texte", "object": "un objet", "array": "une liste", "boolean": "vrai ou faux"}
        res.append((chemin, f"{valeur!r} devrait être {noms.get(attendu, attendu)}"))
        return res

    if isinstance(valeur, str):
        if "minLength" in schema and len(valeur) < schema["minLength"]:
            res.append((chemin, "texte vide"))
        if "pattern" in schema and not re.search(schema["pattern"], valeur):
            res.append((chemin, f"« {valeur} » ne respecte pas le format attendu ({schema['pattern']})"))

    if isinstance(valeur, list):
        if "minItems" in schema and len(valeur) < schema["minItems"]:
            res.append((chemin, f"au moins {schema['minItems']} élément(s) attendu(s)"))
        if "items" in schema:
            for i, item in enumerate(valeur):
                res.extend(erreurs(item, schema["items"], chemin + (i,)))

    if isinstance(valeur, dict):
        for champ in schema.get("required", []):
            if champ not in valeur:
                res.append((chemin, f"champ obligatoire manquant : {champ}"))
        proprietes = schema.get("properties", {})
        for cle, sous in valeur.items():
            if cle in proprietes:
                res.extend(erreurs(sous, proprietes[cle], chemin + (cle,)))
            elif schema.get("additionalProperties") is False:
                res.append((chemin, f"champ inconnu : {cle} (champs permis : {', '.join(proprietes)})"))

    return res
