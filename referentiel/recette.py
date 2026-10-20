"""Cas de test tirés de la base : proposés après validation, enregistrés après relecture, signalés quand la base bouge.

Principe :
- seules les règles validées produisent des cas ; une action n'en produit que si toutes ses règles sont validées.
  Ce qui attend une validation est listé à part, avec la raison ;
- chaque cas est rédigé en langage métier (étant donné, quand, alors) et garde ses sources : la règle et l'action
  d'où il vient, avec l'empreinte de chacune au moment de la proposition ;
- rien n'est écrit sans demande : `enregistrer` crée les fichiers recette/cas/<id>.yaml au statut brouillon et ne
  remplace jamais un cas existant (il a pu être relu et ajusté) ;
- `a_revoir` compare les empreintes enregistrées à la base actuelle : un cas dont la règle a changé, est devenue
  obsolète ou a disparu est signalé, avec ce qui a bougé.

Ce que la base ne dit pas (valeurs précises, jeux de données) est indiqué dans « a_preciser », jamais inventé.
"""

from __future__ import annotations

from pathlib import Path

from .chargement import Projet
from .ecriture import aujourdhui, dump, lire_contenu
from .versions import _empreinte

DOSSIER = Path("recette") / "cas"
TYPES = {
    "nominal": "chemin normal",
    "droit": "droits",
    "regle_ok": "règle respectée",
    "regle_ko": "règle non respectée",
    "table": "table de décision",
    "remplacement": "non-régression",
    "non_regression": "non-régression",
}


def _nom_etape(p: Projet, ident: str) -> str:
    for e in p.entites.values():
        for s in e.get("statuts", []):
            if s["id"] == ident:
                return s.get("nom", ident)
    return ident


def _nom_entite(p: Projet, ident) -> str:
    e = ident if isinstance(ident, dict) else p.entites.get(ident or "")
    return (e.get("nom") if e else None) or "l'élément"


def _article(nom: str) -> str:
    """« une expédition » : article indéfini simple (féminin si le nom finit par -ion, -ée, -té, -ure, -e muet courant)."""
    n = nom.lower()
    feminin = n.endswith(("ion", "ée", "té", "ure", "ance", "ence", "ade", "ette", "elle", "ise", "ie"))
    return ("une " if feminin else "un ") + n


def _defini(nom: str) -> str:
    """« l'expédition », « la facture », « le transporteur »."""
    n = nom.lower()
    if n[:1] in "aeéèêiouyh":
        return "l'" + n
    feminin = n.endswith(("ion", "ée", "té", "ure", "ance", "ence", "ade", "ette", "elle", "ise", "ie", "ure"))
    return ("la " if feminin else "le ") + n


STATUTS = {"validee": "validée", "proposee": "proposée", "obsolete": "obsolète"}


def _acteurs(p: Projet, ids) -> str:
    noms = [_defini(p.acteurs.get(i, {}).get("nom", i)) for i in ids or []]
    if not noms:
        return ""
    return noms[0] if len(noms) == 1 else ", ".join(noms[:-1]) + " ou " + noms[-1]


def _etat(p: Projet, ident: str, el: dict | None) -> dict:
    return {"id": ident, "empreinte": _empreinte(el) if el is not None else None}


def _element(p: Projet, ident: str):
    if ident in p.regles:
        return p.regles[ident]
    if ident in p.transitions:
        return p.transitions[ident][1]
    return None


def _cas(p, ident, titre, type_cas, sources, etant_donne, quand, alors, a_preciser=None):
    return {
        "id": ident,
        "titre": titre,
        "type": type_cas,
        "statut": "brouillon",
        "sources": [_etat(p, s, _element(p, s)) for s in sources],
        "etant_donne": etant_donne,
        "quand": quand,
        "alors": alors,
        **({"a_preciser": a_preciser} if a_preciser else {}),
    }


def _quand(p: Projet, tr: dict) -> str:
    qui = _acteurs(p, tr.get("acteurs"))
    return f"{qui} fait « {tr.get('nom', tr['id'])} »" if qui else f"l'action « {tr.get('nom', tr['id'])} » se déclenche"


def proposer(p: Projet, element: str | None = None) -> dict:
    """Cas proposés pour toute la base, ou pour un seul élément (règle ou action) et ce qui en dépend."""
    cas, en_attente = [], []
    transitions = p.transitions

    def concerne(*ids):
        return element is None or element in ids

    # 1. Actions : chemin normal, et droits (les autres acteurs ne peuvent pas la faire).
    for tid, (eid, tr) in transitions.items():
        regles = tr.get("regles") or []
        if not concerne(tid, *regles):
            continue
        non_validees = [r for r in regles if p.regles.get(r, {}).get("statut") != "validee"]
        if non_validees:
            en_attente.append({"element": tid, "nom": tr.get("nom", tid), "raison": "règles pas encore validées : "
                               + ", ".join(f"{p.regles.get(r, {}).get('titre', r)} ({STATUTS.get(p.regles.get(r, {}).get('statut'), 'introuvable')})" for r in non_validees)})
            continue
        objet, ce = _article(_nom_entite(p, eid)), _defini(_nom_entite(p, eid))
        de, vers = _nom_etape(p, tr.get("de", "")), _nom_etape(p, tr.get("vers", ""))
        sources = [tid, *regles]
        regles_txt = "" if not regles else " et respectant " + ", ".join(f"« {p.regles[r]['titre']} »" for r in regles)
        alors = f"{ce[0].upper()}{ce[1:]} passe à l'étape {vers}." if de != vers else f"L'action est enregistrée ; {ce} reste à l'étape {de}."
        cas.append(_cas(p, f"CT-{tid}-NOMINAL", f"{tr.get('nom', tid)} : chemin normal", "nominal", sources,
                        f"{objet} à l'étape {de}{regles_txt}", _quand(p, tr), alors))
        autorises = set(tr.get("acteurs") or [])
        autres = [a for a in p.acteurs if a not in autorises]
        if autorises and autres:
            cas.append(_cas(p, f"CT-{tid}-DROITS", f"{tr.get('nom', tid)} : réservée à {_acteurs(p, autorises)}", "droit", [tid],
                            f"{objet} à l'étape {de}",
                            f"un autre acteur ({_acteurs(p, autres).replace(' ou ', ', ')}) tente « {tr.get('nom', tid)} »",
                            f"L'action est refusée ou n'est pas proposée ; {ce} reste à l'étape {de}."))
        if de != vers:
            cas.append(_cas(p, f"CT-{tid}-NR", f"{tr.get('nom', tid)} : impossible hors de l'étape {de}", "non_regression", [tid],
                            f"{objet} à l'étape {vers}", f"{_quand(p, tr)}",
                            f"L'action n'est pas proposée : elle n'existe que depuis l'étape {de}."))

    # 2. Règles validées : respectée, non respectée, lignes de table, remplacement.
    for rid, r in p.regles.items():
        if not concerne(rid):
            continue
        if r.get("statut") != "validee":
            if element == rid:
                en_attente.append({"element": rid, "nom": r.get("titre", rid), "raison": f"règle {STATUTS.get(r.get('statut'), '?')}, pas encore validée"})
            continue
        liees = [(tid, eid, tr) for tid, (eid, tr) in transitions.items() if rid in (tr.get("regles") or [])]
        objet, ce = _article(_nom_entite(p, r.get("entite"))), _defini(_nom_entite(p, r.get("entite")))
        if r.get("type") == "table_decision":
            for n, ligne in enumerate(r.get("lignes") or [], 1):
                cible = ligne.get("alors")
                tr = transitions.get(cible, (None, None))[1] if isinstance(cible, str) else None
                attributs = {a["nom"]: a for e in p.entites.values() for a in e.get("attributs", [])}
                situation = ", ".join(f"{attributs.get(k, {}).get('libelle', k)} : {_valeur(v)}" for k, v in (ligne.get("si") or {}).items())
                if tr:
                    va = "reste à" if tr.get("de") == tr.get("vers") else "va à"
                    alors = f"L'action « {tr.get('nom', cible)} » s'applique : {ce} {va} l'étape {_nom_etape(p, tr.get('vers', ''))}."
                    de = _nom_etape(p, tr.get("de", ""))
                else:
                    alors, de = f"Résultat attendu : {_valeur(cible)}.", None
                cas.append(_cas(p, f"CT-{rid}-L{n}", f"{r['titre']} : {situation}", "table", [rid] + ([cible] if tr else []),
                                f"{objet}" + (f" à l'étape {de}" if de else "") + f", avec {situation}",
                                "la situation est évaluée" + (f" ({ligne['note']})" if ligne.get("note") else ""), alors))
        else:
            for tid, eid, tr in liees or [(None, None, None)]:
                suffixe = f"-{tid}" if tid and len(liees) > 1 else ""
                quand = _quand(p, tr) if tr else "la situation décrite par la règle se présente"
                de = _nom_etape(p, tr.get("de", "")) if tr else None
                base = f"{objet}" + (f" à l'étape {de}" if de else "")
                if tid is None:  # avec une action, son chemin normal couvre déjà la règle respectée
                    cas.append(_cas(p, f"CT-{rid}{suffixe}-OK", f"{r['titre']} : règle respectée", "regle_ok", [rid],
                                    f"{base}, dans une situation qui respecte la règle", quand,
                                    f"L'action aboutit. Règle : {r.get('enonce', '')}",
                                    ["Données d'une situation conforme"]))
                cas.append(_cas(p, f"CT-{rid}{suffixe}-KO", f"{r['titre']} : règle non respectée", "regle_ko", [rid] + ([tid] if tid else []),
                                f"{base}, dans une situation qui ne respecte pas la règle", quand,
                                f"L'action est refusée avec un message explicite" + (f" ; {ce} reste à l'étape {de}." if de else ".") + f" Règle : {r.get('enonce', '')}",
                                ["Données d'une situation non conforme", "Message affiché (à faire valider)"]))
        ancienne = p.regles.get(r.get("remplace") or "")
        if ancienne:
            cas.append(_cas(p, f"CT-{rid}-REMPLACE", f"{r['titre']} : l'ancienne règle ne s'applique plus", "remplacement",
                            [rid, r["remplace"]], f"{objet} dans une situation que seule l'ancienne règle autorisait",
                            "on tente l'ancien comportement",
                            f"Il est refusé. Ancienne règle, plus en vigueur : {ancienne.get('enonce', '')}"))
    vus, uniques = set(), []
    for c in cas:
        if c["id"] not in vus:
            vus.add(c["id"])
            uniques.append(c)
    return {"cas": uniques, "en_attente": en_attente}


def _valeur(v) -> str:
    return "oui" if v is True else "non" if v is False else str(v)


def enregistres(racine: Path) -> dict[str, dict]:
    dossier = Path(racine) / DOSSIER
    resultat = {}
    for f in sorted(dossier.glob("*.yaml")):
        donnees = lire_contenu(f.read_text(encoding="utf-8"))
        if isinstance(donnees, dict) and donnees.get("id"):
            resultat[donnees["id"]] = donnees
    return resultat


def enregistrer(p: Projet, ids: list[str] | None, auteur: str, element: str | None = None) -> dict:
    """Écrit les cas proposés choisis (tous si ids est vide) en brouillon. Ne remplace jamais un cas existant."""
    proposes = {c["id"]: c for c in proposer(p, element)["cas"]}
    inconnus = [i for i in ids or [] if i not in proposes]
    if inconnus:
        raise ValueError("Cas inconnus : " + ", ".join(inconnus))
    existants = enregistres(p.racine)
    dossier = p.racine / DOSSIER
    dossier.mkdir(parents=True, exist_ok=True)
    ecrits, ignores = [], []
    for i in ids or list(proposes):
        if i in existants:
            ignores.append(i)
            continue
        c = {**proposes[i], "propose_le": aujourdhui(), "par": auteur}
        (dossier / f"{i}.yaml").write_text(dump(c), encoding="utf-8")
        ecrits.append(i)
    return {"ecrits": ecrits, "deja_presents": ignores, "dossier": str(DOSSIER)}


def a_revoir(p: Projet) -> list[dict]:
    """Cas enregistrés dont une source a changé, est devenue obsolète ou a disparu depuis leur rédaction."""
    signales = []
    for i, c in enregistres(p.racine).items():
        raisons = []
        for s in c.get("sources") or []:
            el = _element(p, s.get("id", ""))
            if el is None:
                raisons.append(f"{s.get('id')} a disparu de la base")
            elif el.get("statut") == "obsolete":
                remplace_par = next((rid for rid, r in p.regles.items() if r.get("remplace") == s["id"]), None)
                raisons.append(f"« {el.get('titre', s['id'])} » est obsolète" + (f", remplacée par « {p.regles[remplace_par]['titre']} »" if remplace_par else ""))
            elif s.get("empreinte") and _empreinte(el) != s["empreinte"]:
                raisons.append(f"« {el.get('titre') or el.get('nom') or s['id']} » a changé depuis la rédaction du cas")
        if raisons:
            signales.append({"id": i, "titre": c.get("titre", i), "statut": c.get("statut"), "raisons": raisons})
    return signales


def formater(proposition: dict) -> str:
    l = []
    for c in proposition["cas"]:
        l.append(f"[{TYPES.get(c['type'], c['type'])}] {c['titre']}")
        l.append(f"  Étant donné {c['etant_donne']}")
        l.append(f"  Quand {c['quand']}")
        l.append(f"  Alors {c['alors'][0].lower()}{c['alors'][1:]}")
        if c.get("a_preciser"):
            l.append("  À préciser : " + " ; ".join(c["a_preciser"]))
    if proposition["en_attente"]:
        l.append("")
        l.append("En attente de validation (aucun cas proposé) :")
        l += [f"  - {e['nom']} : {e['raison']}" for e in proposition["en_attente"]]
    l.append("")
    l.append(f"{len(proposition['cas'])} cas proposés.")
    return "\n".join(l)
