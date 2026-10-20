"""Contexte compact du référentiel, pensé pour être lu par Claude en une fois.

Le but : qu'une question (ou une tâche de développement) se traite avec UNE lecture, au lieu
d'une dizaine d'allers-retours outil par outil. Le texte est dense (une ligne par élément, les
identifiants entre crochets, aucun YAML), stable d'une génération à l'autre pour profiter du cache
de prompt de Claude, et il garde la traçabilité : source, auteur, date, règle remplacée.

Usages :
- l'assistant « Demander au référentiel » le place dans ses consignes (pas d'appel d'outil) ;
- l'outil MCP `contexte` le renvoie en un seul appel, éventuellement réduit à quelques sections ;
- l'équipe de dev le génère dans un fichier (`python -m referentiel contexte`) et le référence
  depuis le CLAUDE.md du dépôt de code.
"""

from __future__ import annotations

from .chargement import Projet
from .controles import ALERTE, ERREUR, TROU, analyser

SECTIONS = ["glossaire", "acteurs", "entites", "regles", "parcours", "ecrans", "trous"]
STATUTS = {"validee": "validée", "proposee": "proposée, pas encore en vigueur", "obsolete": "obsolète, plus en vigueur"}
GRAVITES = {ERREUR: "incohérence", TROU: "manque", ALERTE: "à vérifier"}


def _nom(p: Projet, ident: str) -> str:
    for attr in ("acteurs", "entites", "regles", "cas_usage", "ecrans"):
        el = getattr(p, attr).get(ident)
        if el:
            return el.get("nom") or el.get("titre") or ident
    if ident in p.transitions:
        return p.transitions[ident][1].get("nom", ident)
    for ent in p.entites.values():
        for s in ent.get("statuts", []):
            if s["id"] == ident:
                return s.get("nom", ident)
    return ident


def _ref(p: Projet, ident: str) -> str:
    return f"{_nom(p, ident)} [{ident}]"


def _liste(p: Projet, ids) -> str:
    return ", ".join(_ref(p, i) for i in ids or []) or "personne"


def _trace(el: dict) -> str:
    morceaux = []
    if el.get("source"):
        morceaux.append(f"source : {el['source']}")
    hist = el.get("historique") or []
    if hist:
        morceaux.append("histoire : " + " ; ".join(
            f"{h.get('date', '?')} {h.get('auteur', '?')}, {h.get('changement', '')}".strip().rstrip(",")
            + (f" ({h['raison']})" if h.get("raison") else "")
            for h in hist))
    return " · ".join(morceaux)


def _valeur(v) -> str:
    if v is True:
        return "oui"
    if v is False:
        return "non"
    return str(v)


def generer_contexte(p: Projet, sections: list[str] | None = None, trous=None, index: bool = False) -> str:
    """`index=True` : règles réduites à leur titre et statut, pour les très grosses bases (le détail se lit à la demande)."""
    sections = [s for s in (sections or SECTIONS) if s in SECTIONS]
    m = p.meta
    # Première ligne : la version de spec appliquée, relue par l'outil dans les dépôts de code (voir livraisons.py).
    l = [f"<!-- referentiel: {m.get('id', '?')} spec {m.get('version', 'travail')} -->",
         f"# Référentiel métier : {m.get('nom', m.get('id', ''))}",
         f"Version : {m.get('version', 'travail')}. Identifiants entre crochets ; une règle n'est en vigueur que si elle est validée.",
         ""]
    if m.get("description"):
        l += [m["description"], ""]

    if "glossaire" in sections and m.get("glossaire"):
        l.append("## Glossaire")
        l += [f"- {g.get('terme')} : {g.get('definition', '')}" for g in m["glossaire"]]
        l.append("")

    if "acteurs" in sections and p.acteurs:
        l.append("## Acteurs")
        l += [f"- {_ref(p, i)} : {a.get('description', '')}".rstrip(" :") for i, a in p.acteurs.items()]
        l.append("")

    if "entites" in sections and p.entites:
        l.append("## Entités, étapes et actions")
        for i, e in p.entites.items():
            l.append(f"### {_ref(p, i)}")
            if e.get("description"):
                l.append(e["description"])
            if e.get("attributs"):
                attrs = []
                for a in e["attributs"]:
                    t = a.get("type", "")
                    if a.get("valeurs"):
                        t += " : " + "/".join(map(_valeur, a["valeurs"]))
                    attrs.append(f"{a.get('libelle') or a.get('nom')} ({t})")
                l.append("Informations : " + " ; ".join(attrs) + ".")
            etapes = []
            for s in e.get("statuts", []):
                drapeau = " (départ)" if s["id"] == e.get("statut_initial") else (" (finale)" if s.get("final") else "")
                etapes.append(f"{s.get('nom', s['id'])} [{s['id']}]{drapeau}" + (f" : {s['description'].rstrip('.')}" if s.get("description") else ""))
            if etapes:
                l.append("Étapes : " + " ; ".join(etapes) + ".")
            for tr in e.get("transitions", []):
                regles = f" · règles {_liste(p, tr.get('regles'))}" if tr.get("regles") else " · aucune règle"
                l.append(f"- Action {tr.get('nom', tr['id'])} [{tr['id']}] : {_nom(p, tr.get('de', '?'))} → {_nom(p, tr.get('vers', '?'))}"
                         f" · par {_liste(p, tr.get('acteurs'))}{regles}")
            l.append("")

    if "regles" in sections and p.regles:
        l.append("## Règles")
        ordre = {"validee": 0, "proposee": 1, "obsolete": 2}
        for i, r in sorted(p.regles.items(), key=lambda x: (ordre.get(x[1].get("statut"), 3), x[0])):
            entete = f"- {r.get('titre', i)} [{i}] ({STATUTS.get(r.get('statut'), r.get('statut'))}, {r.get('type', '').replace('_', ' ')})"
            if r.get("entite"):
                entete += f" sur {_nom(p, r['entite'])}"
            if index:
                l.append(entete)
                continue
            l.append(entete + f" : {r.get('enonce', '')}")
            if r.get("remplace"):
                l.append(f"  Remplace {_ref(p, r['remplace'])}.")
            if r.get("lignes"):
                for ligne in r["lignes"]:
                    si = ", ".join(f"{k} = {_valeur(v)}" for k, v in (ligne.get("si") or {}).items())
                    alors = ligne.get("alors")
                    alors = _ref(p, alors) if isinstance(alors, str) else _valeur(alors)
                    l.append(f"  Si {si} alors {alors}" + (f" ({ligne['note']})" if ligne.get("note") else ""))
            for k in ("formule", "resultat", "acteurs", "droit"):
                if r.get(k):
                    l.append(f"  {k.capitalize()} : {r[k] if not isinstance(r[k], list) else _liste(p, r[k])}")
            if _trace(r):
                l.append(f"  {_trace(r)}")
        l.append("")

    if "parcours" in sections and p.cas_usage:
        l.append("## Parcours")
        for i, uc in p.cas_usage.items():
            etapes = []
            for n, e in enumerate(uc.get("etapes", []), 1):
                morceau = f"{n}. {_nom(p, e.get('acteur', ''))} : {e.get('action', '')}"
                if e.get("transition"):
                    morceau += f" [{e['transition']}]"
                if e.get("ecran"):
                    morceau += f" sur {_nom(p, e['ecran'])}"
                etapes.append(morceau)
            l.append(f"- {_ref(p, i)}, acteur principal {_nom(p, uc.get('acteur_principal', ''))} : " + " ".join(etapes))
        l.append("")

    if "ecrans" in sections and p.ecrans:
        l.append("## Écrans")
        for i, s in p.ecrans.items():
            details = [f"pour {_liste(p, s.get('acteurs'))}"]
            if s.get("zones"):
                details.append("zones " + ", ".join(z.get("nom", "") if isinstance(z, dict) else str(z) for z in s["zones"]))
            if s.get("captures"):
                details.append("capture du " + max(c.get("date", "") for c in s["captures"]))
            l.append(f"- {_ref(p, i)} : " + " · ".join(details))
        l.append("")

    if "trous" in sections:
        ouverts = [t for t in (trous if trous is not None else analyser(p)) if t.statut == "ouvert"]
        if ouverts:
            l.append("## Ce que la base ne dit pas encore")
            l += [f"- ({GRAVITES.get(t.gravite, t.gravite)}) {t.message}" for t in ouverts]
            l.append("")
    return "\n".join(l).rstrip() + "\n"


def taille(texte: str) -> dict:
    """Taille du contexte ; ~4 caractères par jeton en français (estimation)."""
    return {"caracteres": len(texte), "jetons_estimes": round(len(texte) / 4)}


def resume_changements(comparaison: dict, limite: int = 60) -> str:
    """Les changements entre deux versions, en lignes courtes, pour l'ajouter au contexte."""
    ch = comparaison["changements"]
    if not ch:
        return f"Aucun changement entre la {comparaison['de']} et la {comparaison['a']}.\n"
    l = [f"## Changements de la {comparaison['de']} à la {comparaison['a']}"]
    for c in ch[:limite]:
        extra = ""
        if c.get("remplace_par"):
            extra = f", remplacé par [{c['remplace_par']}]"
        elif c.get("remplace"):
            extra = f", remplace [{c['remplace']}]"
        elif c.get("champs"):
            extra = f" ({', '.join(c['champs'])})"
        l.append(f"- {c['changement']} : {c['type']} {c['nom']} [{c['id']}]{extra}")
    if len(ch) > limite:
        l.append(f"- … et {len(ch) - limite} autres changements")
    return "\n".join(l) + "\n"
