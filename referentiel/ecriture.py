"""Écriture dans la base : création, correction, remplacement de règle, décision sur un trou.

Principes :
- rien n'est écrit si la structure est invalide ;
- chaque écriture renvoie les trous apparus et résolus, pour que le PO voie l'effet de sa décision ;
- une règle n'est jamais supprimée : on la remplace et l'ancienne devient obsolète, avec son historique.
"""

from __future__ import annotations

import copy
from datetime import date
from pathlib import Path

from . import schemas
from ._vendor import yaml
from .chargement import Projet, charger
from .controles import analyser
from .validation import erreurs as erreurs_schema
from .schemas import cible_et_donnee

# type d'élément -> (dossier, schéma)
TYPES = {
    "acteur": ("acteurs", schemas.ACTEUR),
    "liste": ("listes", schemas.LISTE),
    "entite": ("entites", schemas.ENTITE),
    "regle": ("regles", schemas.REGLE),
    "cas_usage": ("cas-usage", schemas.CAS_USAGE),
    "ecran": ("ecrans", schemas.ECRAN),
    "scenario": ("scenarios", schemas.SCENARIO),
    "flux": ("flux", schemas.FLUX),
}


class ErreurEcriture(Exception):
    pass


def aujourdhui() -> str:
    return date.today().isoformat()


class _Ecrivain(yaml.SafeDumper):
    """Écrit un YAML lisible : blocs pour les objets, listes courtes de valeurs sur une ligne, dates sans guillemets."""

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


_Ecrivain.yaml_implicit_resolvers = {
    cle: [(tag, regex) for tag, regex in valeurs if tag != "tag:yaml.org,2002:timestamp"]
    for cle, valeurs in yaml.SafeDumper.yaml_implicit_resolvers.items()
}


def _liste(dumper, valeurs):
    simple = all(isinstance(v, (str, int, float, bool)) and len(str(v)) < 40 for v in valeurs)
    return dumper.represent_sequence("tag:yaml.org,2002:seq", valeurs, flow_style=simple and bool(valeurs))


_Ecrivain.add_representer(list, _liste)


def _preparer(donnees):
    """Marque les dictionnaires « si » des tables de décision pour les écrire sur une ligne."""
    if isinstance(donnees, dict):
        return {k: (_EnLigne(v) if k == "si" and isinstance(v, dict) else _preparer(v)) for k, v in donnees.items()}
    if isinstance(donnees, list):
        return [_preparer(v) for v in donnees]
    return donnees


class _EnLigne(dict):
    pass


_Ecrivain.add_representer(_EnLigne, lambda d, v: d.represent_mapping("tag:yaml.org,2002:map", v, flow_style=True))


def dump(donnees) -> str:
    return yaml.dump(_preparer(donnees), Dumper=_Ecrivain, allow_unicode=True, sort_keys=False, width=110)


def lire_contenu(contenu) -> dict:
    """Accepte un dict, ou un texte YAML / JSON."""
    if isinstance(contenu, dict):
        return contenu
    if not isinstance(contenu, str) or not contenu.strip():
        raise ErreurEcriture("Contenu vide.")
    from .chargement import _Chargeur

    try:
        donnees = yaml.load(contenu, Loader=_Chargeur)
    except yaml.YAMLError as e:
        raise ErreurEcriture(f"Contenu illisible (YAML ou JSON attendu) : {e}")
    if not isinstance(donnees, dict):
        raise ErreurEcriture("Le contenu doit décrire un seul élément (un objet avec un champ id).")
    return donnees


def _verifier_schema(donnees: dict, type_element: str):
    _, schema = TYPES[type_element]
    errs = erreurs_schema(donnees, schema)
    if errs:
        lignes = [f"- {'/'.join(map(str, c)) or '(racine)'} : {m}" for c, m in errs]
        raise ErreurEcriture("Structure invalide, rien n'a été écrit :\n" + "\n".join(lignes))


def _chemin_element(p: Projet, type_element: str, ident: str) -> Path:
    if ident in p.fichiers:
        existant = p.racine / p.fichiers[ident]
        dossier_attendu = TYPES[type_element][0]
        if existant.parent.name != dossier_attendu:
            raise ErreurEcriture(f"L'identifiant {ident} est déjà utilisé par {p.fichiers[ident]}.")
        return existant
    return p.racine / TYPES[type_element][0] / f"{ident}.yaml"


def _photo_trous(p: Projet) -> dict:
    return {t.id: t for t in analyser(p) if t.statut == "ouvert"}


def _ecrire_transaction(racine: Path, fichiers: dict[Path, str]) -> Projet:
    """Écrit plusieurs fichiers ; annule tout si la base ne se recharge pas proprement."""
    sauvegardes = {f: (f.read_text(encoding="utf-8") if f.exists() else None) for f in fichiers}
    for f, texte in fichiers.items():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(texte, encoding="utf-8")
    p = charger(racine)
    if p.erreurs:
        for f, ancien in sauvegardes.items():
            if ancien is None:
                if f.exists():
                    f.unlink()
            else:
                f.write_text(ancien, encoding="utf-8")
        raise ErreurEcriture("La base serait devenue invalide, rien n'a été écrit :\n" + "\n".join(f"- {e}" for e in p.erreurs))
    return p


def _bilan(avant: dict, p_apres: Projet, ecrits: list[Path]) -> dict:
    apres = _photo_trous(p_apres)
    return {
        "fichiers_ecrits": [str(f.relative_to(p_apres.racine)) for f in ecrits],
        "trous_resolus": [{"id": i, "message": avant[i].message} for i in avant if i not in apres],
        "trous_apparus": [
            {"id": i, "gravite": t.gravite, "message": t.message, "question": t.question}
            for i, t in apres.items() if i not in avant
        ],
        "trous_ouverts_total": len(apres),
    }


def _ajouter_historique(donnees: dict, auteur: str, changement: str, raison: str | None):
    entree = {"date": aujourdhui(), "auteur": auteur, "changement": changement}
    if raison:
        entree["raison"] = raison
    donnees.setdefault("historique", []).append(entree)


def enregistrer_element(racine, type_element: str, contenu, auteur: str, changement: str, raison: str | None = None) -> dict:
    """Crée ou remplace un élément. Pour une règle, ajoute une entrée d'historique."""
    if type_element not in TYPES:
        raise ErreurEcriture(f"Type inconnu : {type_element}. Types permis : {', '.join(TYPES)}.")
    p = charger(racine)
    if p.erreurs:
        raise ErreurEcriture("La base contient déjà des erreurs de structure, à corriger d'abord :\n" + "\n".join(p.erreurs))
    donnees = lire_contenu(contenu)
    ident = donnees.get("id")
    if not ident:
        raise ErreurEcriture("Le champ id est obligatoire.")

    if type_element == "regle":
        ancienne = p.regles.get(ident)
        if ancienne and "historique" not in donnees:
            donnees["historique"] = list(ancienne.get("historique", []))
        if ancienne and ancienne.get("statut") != "obsolete" and donnees.get("statut") == "obsolete" and not raison:
            raise ErreurEcriture("Rendre une règle obsolète demande une raison (ou utiliser remplacer_regle si une autre règle la remplace).")
        _ajouter_historique(donnees, auteur, changement, raison)

    _verifier_schema(donnees, type_element)
    avant = _photo_trous(p)
    chemin = _chemin_element(p, type_element, ident)
    p_apres = _ecrire_transaction(p.racine, {chemin: dump(donnees)})
    bilan = _bilan(avant, p_apres, [chemin])
    bilan["action"] = "modifié" if ident in p.fichiers else "créé"
    bilan["id"] = ident
    return bilan


def remplacer_regle(racine, ancienne_id: str, nouvelle, auteur: str, raison: str, rattacher_transitions: bool = True) -> dict:
    """Remplace une règle : la nouvelle porte `remplace`, l'ancienne devient obsolète.

    Si rattacher_transitions, les transitions qui citaient l'ancienne règle citent la nouvelle,
    et les tables de décision restent intactes (elles vivent dans les règles).
    """
    p = charger(racine)
    if p.erreurs:
        raise ErreurEcriture("La base contient déjà des erreurs de structure :\n" + "\n".join(p.erreurs))
    if ancienne_id not in p.regles:
        raise ErreurEcriture(f"Règle inconnue : {ancienne_id}")
    avant = _photo_trous(p)
    nv = lire_contenu(nouvelle)
    nid = nv.get("id")
    if not nid or nid == ancienne_id:
        raise ErreurEcriture("La nouvelle règle doit avoir son propre identifiant, différent de l'ancienne.")
    if nid in p.fichiers:
        raise ErreurEcriture(f"L'identifiant {nid} existe déjà.")

    nv["remplace"] = ancienne_id
    nv.setdefault("statut", "validee")
    nv.setdefault("entite", p.regles[ancienne_id].get("entite"))
    if nv.get("entite") is None:
        nv.pop("entite")
    _ajouter_historique(nv, auteur, f"Création, remplace {ancienne_id}", raison)
    _verifier_schema(nv, "regle")

    ancienne = copy.deepcopy(p.regles[ancienne_id])
    ancienne["statut"] = "obsolete"
    _ajouter_historique(ancienne, auteur, f"Rendue obsolète, remplacée par {nid}", raison)

    fichiers = {
        p.racine / "regles" / f"{nid}.yaml": dump(nv),
        p.racine / p.fichiers[ancienne_id]: dump(ancienne),
    }
    rattachees = []
    if rattacher_transitions:
        for ent in copy.deepcopy(list(p.entites.values())):
            modifie = False
            for tr in ent["transitions"]:
                if ancienne_id in tr.get("regles", []):
                    tr["regles"] = [nid if r == ancienne_id else r for r in tr["regles"]]
                    rattachees.append(tr["id"])
                    modifie = True
            if modifie:
                fichiers[p.racine / p.fichiers[ent["id"]]] = dump(ent)

    p_apres = _ecrire_transaction(p.racine, fichiers)
    bilan = _bilan(avant, p_apres, list(fichiers))
    bilan["transitions_rattachees"] = rattachees
    return bilan


def decider_trou(racine, trou: str, statut: str, justification: str, par: str) -> dict:
    """Enregistre la décision du PO sur un trou (hors périmètre, impossible métier, ou à traiter pour le rouvrir)."""
    if statut not in ("hors_perimetre", "impossible_metier", "a_traiter"):
        raise ErreurEcriture("statut doit être hors_perimetre, impossible_metier ou a_traiter.")
    p = charger(racine)
    if p.erreurs:
        raise ErreurEcriture("La base contient des erreurs de structure :\n" + "\n".join(p.erreurs))
    connus = {t.id for t in analyser(p)}
    if trou not in connus:
        raise ErreurEcriture(f"Aucun trou ne porte l'identifiant {trou}. Utiliser lister_trous pour obtenir les identifiants exacts.")

    fichier = p.racine / "trous.yaml"
    decisions = [d for d in p.decisions_trous.values() if d["trou"] != trou]
    decisions.append({"trou": trou, "statut": statut, "justification": justification, "par": par, "date": aujourdhui()})
    entete = "# Décisions du responsable produit sur les trous détectés.\n# statut : hors_perimetre | impossible_metier | a_traiter\n"
    avant = _photo_trous(p)
    p_apres = _ecrire_transaction(p.racine, {fichier: entete + dump(decisions)})
    return _bilan(avant, p_apres, [fichier])


def creer_projet(dossier, ident: str, nom: str, description: str = "À compléter") -> dict:
    racine = Path(dossier).expanduser()
    if (racine / "projet.yaml").exists():
        raise ErreurEcriture(f"Un projet existe déjà dans {racine}.")
    meta = {"id": ident, "nom": nom, "description": description, "glossaire": []}
    errs = erreurs_schema(meta, schemas.PROJET)
    if errs:
        raise ErreurEcriture("Identifiant ou nom invalide : " + "; ".join(m for _, m in errs))
    for d in ("acteurs", "entites", "regles", "cas-usage", "ecrans"):
        (racine / d).mkdir(parents=True, exist_ok=True)
    (racine / "projet.yaml").write_text(dump(meta), encoding="utf-8")
    (racine / "trous.yaml").write_text("[]\n", encoding="utf-8")
    (racine / ".gitignore").write_text("sortie/\n", encoding="utf-8")
    return {"projet": str(racine.resolve()), "id": ident, "nom": nom}


def references(p: Projet, ident: str) -> list[dict]:
    """Ce qui, dans la base, fait référence à cet élément (avant de le supprimer, par exemple)."""
    trouves = []

    def ajout(el, comment):
        trouves.append({"id": el["id"], "nom": el.get("titre") or el.get("nom") or el["id"], "comment": comment})

    for e in p.entites.values():
        for a in e.get("attributs") or []:
            if a.get("cible") == ident and e["id"] != ident:
                ajout(e, f"sa donnée « {a.get('libelle') or a['nom']} »")
        for tr in e.get("transitions") or []:
            if ident in (tr.get("regles") or []) or ident in (tr.get("acteurs") or []):
                ajout(e, f"l'étape « {tr.get('nom', tr['id'])} »")
    for r in p.regles.values():
        if r["id"] != ident and (r.get("entite") == ident or any(cible_et_donnee(c)[0] == ident for c in r.get("porte_sur") or [])):
            ajout(r, "porte sur lui")
    for uc in p.cas_usage.values():
        if uc.get("acteur_principal") == ident or any(ident in (et.get("acteur"), et.get("ecran"), et.get("transition")) for et in uc.get("etapes") or []):
            ajout(uc, "une de ses étapes")
    for sc in p.scenarios.values():
        if sc["id"] != ident and (ident in (sc.get("acteur"), sc.get("entite")) or any(
                ident in (et.get("acteur"), et.get("ecran"), et.get("transition"), et.get("application"), et.get("statut"))
                for et in sc.get("etapes") or [])):
            ajout(sc, "une de ses étapes")
    for fl in p.flux.values():
        dec = fl.get("declencheur") or {}
        if fl["id"] != ident and (ident in (fl.get("application"), dec.get("transition")) or ident in (fl.get("regles") or [])
                                  or any(d.get("entite") == ident for d in fl.get("donnees") or [])):
            ajout(fl, "l'échange le concerne")
    for ec in p.ecrans.values():
        if ec["id"] != ident and (ident in (ec.get("acteurs") or []) or ident in str(ec.get("routages") or "") or ident in (ec.get("regles") or [])):
            ajout(ec, "le cite")
    return trouves


def supprimer_element(racine, ident: str) -> dict:
    """Supprime un élément s'il n'est plus cité nulle part ; sinon dit qui le cite."""
    p = charger(racine)
    if ident not in p.fichiers:
        raise ErreurEcriture("Élément inconnu.")
    refs = references(p, ident)
    if refs:
        raise ErreurEcriture("Encore utilisé par : " + " ; ".join(f"{r['nom']} ({r['comment']})" for r in refs[:6])
                             + ". Retirer ces liens d'abord.")
    chemin = p.racine / p.fichiers[ident]
    ancien = chemin.read_text(encoding="utf-8")
    chemin.unlink()
    apres = charger(racine)
    if apres.erreurs:
        chemin.write_text(ancien, encoding="utf-8")
        raise ErreurEcriture("La base serait devenue invalide, rien n'a été supprimé.")
    return {"supprime": ident}


def lire_element(racine, ident: str) -> dict:
    """L'élément tel qu'il est écrit (sans son historique), et son type."""
    p = charger(racine)
    if ident not in p.fichiers:
        raise ErreurEcriture("Élément inconnu.")
    dossier = p.fichiers[ident].split("/")[0]
    type_element = next(t for t, (d, _) in TYPES.items() if d == dossier)
    with (p.racine / p.fichiers[ident]).open(encoding="utf-8") as f:
        from .chargement import _Chargeur
        contenu = yaml.load(f, Loader=_Chargeur)
    contenu.pop("historique", None)
    return {"type": type_element, "contenu": contenu}


def enregistrer_versions_produit(racine, versions: list[dict]) -> dict:
    """Déclare les versions produit (MVP, V2…) dans projet.yaml, dans l'ordre de livraison. Une version encore
    portée par un élément ne peut pas être retirée."""
    p = charger(racine)
    ids = [v.get("id") for v in versions]
    if len(set(ids)) != len(ids):
        raise ErreurEcriture("Deux versions portent le même identifiant.")
    retirees = {v["id"] for v in p.meta.get("versions_produit") or []} - set(ids)
    for col in (p.entites, p.listes, p.regles, p.ecrans, p.cas_usage):
        for el in col.values():
            utilisees = {el.get("version")} | {a.get("version") for a in el.get("attributs") or []} | \
                {v.get("version") for v in (el.get("valeurs") or []) if isinstance(v, dict)}
            if utilisees & retirees:
                raise ErreurEcriture(f"La version « {', '.join(utilisees & retirees)} » est encore portée par « {el.get('nom') or el.get('titre')} ».")
    meta = dict(p.meta)
    meta["versions_produit"] = [{k: v[k] for k in ("id", "nom", "description", "date") if v.get(k)} for v in versions]
    if not meta["versions_produit"]:
        meta.pop("versions_produit")
    errs = erreurs_schema(meta, schemas.PROJET)
    if errs:
        raise ErreurEcriture("Versions invalides : " + "; ".join(m for _, m in errs))
    _ecrire_transaction(p.racine, {p.racine / "projet.yaml": dump(meta)})
    return {"versions_produit": meta.get("versions_produit", [])}
