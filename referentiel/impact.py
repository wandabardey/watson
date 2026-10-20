"""Analyse d'impact : tout ce qui dépend d'un élément de la base."""

from __future__ import annotations


from .chargement import Projet
from .controles import regles_d_un_ecran


def analyser_impact(p: Projet, ident: str) -> dict:
    transitions = p.transitions
    impact = {
        "element": ident,
        "regles": set(),
        "transitions": set(),
        "statuts": set(),
        "cas_usage": set(),
        "ecrans": set(),
        "captures": set(),
    }

    # Point de départ
    if ident in p.regles:
        impact["regles"].add(ident)
        rg = p.regles[ident]
        if "remplace" in rg:
            impact["regles"].add(rg["remplace"])
        impact["regles"].update(r["id"] for r in p.regles.values() if r.get("remplace") == ident)
    elif ident in transitions:
        impact["transitions"].add(ident)
    elif ident in p.acteurs:
        impact["transitions"].update(t for t, (_, tr) in transitions.items() if ident in tr.get("acteurs", []))
        impact["ecrans"].update(sid for sid, scr in p.ecrans.items() if ident in scr.get("acteurs", []))
        impact["cas_usage"].update(
            u["id"] for u in p.cas_usage.values()
            if u["acteur_principal"] == ident or any(e["acteur"] == ident for e in u["etapes"])
        )
    elif ident in p.ecrans:
        impact["ecrans"].add(ident)
        impact["regles"].update(regles_d_un_ecran(p, ident))
    else:
        for ent in p.entites.values():
            if ident == ent["id"]:
                impact["transitions"].update(t["id"] for t in ent["transitions"])
            elif ident in {s["id"] for s in ent["statuts"]}:
                impact["statuts"].add(f"{ent['id']}:{ident}")
                impact["transitions"].update(
                    t["id"] for t in ent["transitions"] if ident in (t["de"], t["vers"])
                )
        if not impact["transitions"] and not impact["statuts"]:
            raise KeyError(ident)

    # Règles -> transitions qui les portent ou qu'elles déclenchent
    for rid in list(impact["regles"]):
        rg = p.regles.get(rid, {})
        impact["transitions"].update(
            t for t, (_, tr) in transitions.items() if rid in tr.get("regles", [])
        )
        impact["transitions"].update(l["alors"] for l in rg.get("lignes", []) if l["alors"] in transitions)

    # Transitions -> statuts, règles liées, cas d'usage, écrans
    for tid in impact["transitions"]:
        ent, tr = transitions[tid]
        impact["statuts"].update({f"{ent['id']}:{tr['de']}", f"{ent['id']}:{tr['vers']}"})
        impact["regles"].update(tr.get("regles", []))
    ecrans_depart = set(impact["ecrans"])
    for uc in p.cas_usage.values():
        for et in uc["etapes"]:
            if et.get("transition") in impact["transitions"] or et.get("ecran") in ecrans_depart:
                impact["cas_usage"].add(uc["id"])
                if "ecran" in et:
                    impact["ecrans"].add(et["ecran"])

    for sid in impact["ecrans"]:
        for cap in p.ecrans[sid].get("captures", []):
            impact["captures"].add(f"{sid}:{cap['fichier']}")

    return {k: sorted(v) if isinstance(v, set) else v for k, v in impact.items()}
