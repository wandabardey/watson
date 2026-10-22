"""Cahier de recette et campagnes de test, dans l'application.

S'appuie sur `recette.py` (cas tirés de la base, rangés dans `recette/cas/`) et ajoute :
- la relecture des cas : modifier, valider, retirer, et la liste de ceux à revoir quand la base a bougé ;
- les cas tirés des critères d'acceptation d'une évolution (un critère, un cas, en brouillon) ;
- les campagnes (`recette/campagnes/<id>.yaml`) : un ensemble de cas à jouer pour une version, en non-régression
  (TNR) ou sur les nouveautés (TNF). Pendant la campagne, les résultats sont notés sur ce poste ; « Enregistrer »
  les range dans le dépôt. Un cas en échec porte son anomalie, rédigée pour devenir un ticket ;
- le rapport : avancement, échecs par gravité, et un avis go / no-go argumenté. Rien n'est envoyé dans Jira.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ._vendor import yaml
from .chargement import charger
from .ecriture import aujourdhui, dump, lire_contenu
from .recette import DOSSIER, TYPES, a_revoir, enregistrer, enregistres, proposer

DOSSIER_CAMPAGNES = Path("recette") / "campagnes"
STATUTS_CAS = {"brouillon": "Brouillon", "valide": "Validé"}
RESULTATS = {"ok": "Réussi", "ko": "En échec", "bloque": "Bloqué", "non_joue": "Pas joué"}
GRAVITES = {"bloquante": "Bloquante", "majeure": "Majeure", "mineure": "Mineure"}
GENRES_CAMPAGNE = {"tnr": "Non-régression", "tnf": "Nouveautés"}
TYPES_CAS = {**TYPES, "evolution": "critère d'évolution"}


class ErreurRecette(Exception):
    """Erreur présentable telle quelle."""


def _propre(x):
    return json.loads(re.sub(" *\u2014 *", ", ", json.dumps(x, ensure_ascii=False, default=str)).replace("\u2013", "-"))


def _f_cas(racine: Path, cid: str) -> Path:
    if not re.match(r"^[A-Za-z0-9_-]{1,120}$", cid or ""):
        raise ErreurRecette("Cas inconnu.")
    return Path(racine) / DOSSIER / f"{cid}.yaml"


# ----------------------------------------------------------------- le cahier

def vue_cahier(racine: Path) -> dict:
    p = charger(racine)
    cas = [_propre(c) for c in enregistres(racine).values()]
    revoir = {x["id"]: x["raisons"] for x in a_revoir(p)}
    for c in cas:
        c["a_revoir"] = revoir.get(c["id"], [])
        c["statut"] = c.get("statut") if c.get("statut") in STATUTS_CAS else "brouillon"
    deja = {c["id"] for c in cas}
    prop = proposer(p)
    nouveaux = [c for c in prop["cas"] if c["id"] not in deja]
    return {"cas": cas, "a_proposer": len(nouveaux), "en_attente": prop["en_attente"], "types": TYPES_CAS,
            "statuts": STATUTS_CAS, "compteurs": {"total": len(cas), "valides": sum(c["statut"] == "valide" for c in cas),
                                                    "a_revoir": sum(bool(c["a_revoir"]) for c in cas)}}


def propositions(racine: Path) -> dict:
    p = charger(racine)
    deja = set(enregistres(racine))
    prop = proposer(p)
    return {"cas": [c for c in prop["cas"] if c["id"] not in deja], "en_attente": prop["en_attente"], "types": TYPES_CAS}


def garder_propositions(racine: Path, ids: list[str], auteur: str) -> dict:
    if not ids:
        raise ErreurRecette("Choisis au moins un cas.")
    try:
        return enregistrer(charger(racine), ids, auteur)
    except ValueError as e:
        raise ErreurRecette(str(e)) from e


def modifier_cas(racine: Path, cid: str, champs: dict, auteur: str) -> dict:
    f = _f_cas(racine, cid)
    if not f.exists():
        raise ErreurRecette("Cas inconnu.")
    c = lire_contenu(f.read_text(encoding="utf-8"))
    for k in ("titre", "etant_donne", "quand", "alors"):
        if k in champs:
            c[k] = str(champs[k] or "").strip()
    if "a_preciser" in champs:
        c["a_preciser"] = [str(x).strip() for x in champs["a_preciser"] or [] if str(x).strip()]
        if not c["a_preciser"]:
            c.pop("a_preciser")
    if champs.get("statut") in STATUTS_CAS:
        c["statut"] = champs["statut"]
        if champs["statut"] == "valide":
            c["valide_le"], c["valide_par"] = aujourdhui(), auteur
    if champs.get("revu"):  # la base a bougé, le cas a été relu : on reprend les empreintes actuelles
        from .recette import _element, _etat

        p = charger(racine)
        c["sources"] = [_etat(p, s["id"], _element(p, s["id"])) for s in c.get("sources") or []]
        c["revu_le"] = aujourdhui()
    c = _propre(c)
    f.write_text(dump(c), encoding="utf-8")
    return c


def supprimer_cas(racine: Path, cid: str):
    _f_cas(racine, cid).unlink(missing_ok=True)


def cas_depuis_evolution(racine: Path, eid: str, auteur: str) -> dict:
    """Un cas par critère d'acceptation de l'évolution, en brouillon ; ses sources sont les règles qu'elle touche."""
    from .backlog import lire as lire_evo
    from .recette import _element, _etat

    e = lire_evo(racine, eid)
    criteres = (e.get("redaction") or {}).get("criteres") or []
    if not criteres:
        raise ErreurRecette("L'évolution n'a pas encore de critères d'acceptation.")
    p = charger(racine)
    sources = [t["id"] for t in (e.get("redaction") or {}).get("touches") or [] if _element(p, t["id"]) is not None]
    existants = enregistres(racine)
    (Path(racine) / DOSSIER).mkdir(parents=True, exist_ok=True)
    ecrits, deja = [], []
    for n, cr in enumerate(criteres, 1):
        cid = f"CT-{eid}-{n}"
        if cid in existants:
            deja.append(cid)
            continue
        c = {"id": cid, "titre": f"{e['titre']} : {cr.get('alors', '')[:80]}", "type": "evolution", "statut": "brouillon",
             "evolution": eid, "cas_critere": cr.get("cas") or "nominal",
             "sources": [_etat(p, s, _element(p, s)) for s in sources],
             "etant_donne": cr["etant_donne"], "quand": cr["lorsque"], "alors": cr["alors"], "propose_le": aujourdhui(), "par": auteur}
        _f_cas(racine, cid).write_text(dump(_propre(c)), encoding="utf-8")
        ecrits.append(cid)
    return {"ecrits": ecrits, "deja_presents": deja}


# ----------------------------------------------------------------- campagnes

def _f_camp(racine: Path, cid: str) -> Path:
    if not re.match(r"^CAMP-\d{3,}$", cid or ""):
        raise ErreurRecette("Campagne inconnue.")
    return Path(racine) / DOSSIER_CAMPAGNES / f"{cid}.yaml"


def _lire_camp(racine: Path, cid: str) -> dict:
    f = _f_camp(racine, cid)
    if not f.exists():
        raise ErreurRecette("Campagne inconnue.")
    return _propre(yaml.safe_load(f.read_text(encoding="utf-8")))


def _ecrire_camp(racine: Path, c: dict):
    (Path(racine) / DOSSIER_CAMPAGNES).mkdir(parents=True, exist_ok=True)
    _f_camp(racine, c["id"]).write_text("# Campagne de test (tenue dans Watson).\n" + dump(_propre(c)), encoding="utf-8")


def _local(pid: str, cid: str) -> Path:
    from .application import dossier_donnees

    if not re.match(r"^[A-Za-z0-9_.-]+$", pid or ""):
        raise ErreurRecette("Projet inconnu.")
    d = dossier_donnees() / "recette" / pid
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{cid}.json"


def cas_touches(racine: Path, eid: str) -> list[str]:
    """Les cas enregistrés concernés par une évolution : les siens, et ceux dont une source est dans son impact."""
    from .backlog import lire as lire_evo

    e = lire_evo(racine, eid)
    p = charger(racine)
    touches = {x["id"] for x in (e.get("impact") or {}).get("elements") or []}
    regles = {i for i in touches if i in p.regles}
    transitions = {tid for tid, (_, tr) in p.transitions.items() if regles & set(tr.get("regles") or [])}
    zone = touches | transitions
    return sorted(i for i, c in enregistres(racine).items()
                  if c.get("evolution") == eid or zone & {s.get("id") for s in c.get("sources") or []})


def creer_campagne(racine: Path, champs: dict, auteur: str) -> dict:
    nom = str(champs.get("nom") or "").strip()
    if not nom:
        raise ErreurRecette("Donne un nom à la campagne.")
    tous = enregistres(racine)
    if champs.get("evolution"):
        ids = cas_touches(racine, str(champs["evolution"]))
    elif champs.get("cas"):
        ids = [i for i in champs["cas"] if i in tous]
    else:
        ids = [i for i, c in tous.items() if (c.get("statut") == "valide") or champs.get("brouillons")]
    if not ids:
        raise ErreurRecette("Aucun cas à jouer : enregistre ou valide des cas d'abord.")
    d = Path(racine) / DOSSIER_CAMPAGNES
    n = max([int(f.stem[5:]) for f in d.glob("CAMP-*.yaml") if f.stem[5:].isdigit()], default=0) + 1 if d.exists() else 1
    c = {"id": f"CAMP-{n:03d}", "nom": nom, "genre": champs.get("genre") if champs.get("genre") in GENRES_CAMPAGNE else "tnr",
         "version": str(champs.get("version") or "").strip(), "environnement": str(champs.get("environnement") or "").strip(),
         "evolution": str(champs.get("evolution") or ""), "cas": ids, "statut": "en_cours", "date": aujourdhui(), "par": auteur,
         "resultats": {}}
    _ecrire_camp(racine, c)
    return c


def liste_campagnes(racine: Path) -> list[dict]:
    d = Path(racine) / DOSSIER_CAMPAGNES
    r = []
    for f in sorted(d.glob("CAMP-*.yaml")) if d.exists() else []:
        c = _propre(yaml.safe_load(f.read_text(encoding="utf-8")) or {})
        res = c.get("resultats") or {}
        r.append({k: c.get(k) for k in ("id", "nom", "genre", "version", "statut", "date")}
                 | {"cas": len(c.get("cas") or []), "joues": sum(1 for x in res.values() if x.get("resultat") not in (None, "non_joue")),
                    "ko": sum(1 for x in res.values() if x.get("resultat") == "ko")})
    return sorted(r, key=lambda x: x["id"], reverse=True)


def lire_campagne(pid: str, racine: Path, cid: str) -> dict:
    c = _lire_camp(racine, cid)
    f = _local(pid, cid)
    local = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    c["resultats"] = {**(c.get("resultats") or {}), **local}
    c["non_enregistres"] = len(local)
    tous = enregistres(racine)
    c["details"] = [_propre({**tous[i], "id": i}) if i in tous else {"id": i, "titre": "(cas retiré du cahier)", "absent": True} for i in c["cas"]]
    c["rapport"] = rapport(c)
    return c


def noter(pid: str, racine: Path, cid: str, cas_id: str, champs: dict) -> dict:
    c = _lire_camp(racine, cid)
    if c.get("statut") == "close":
        raise ErreurRecette("La campagne est close.")
    if cas_id not in c["cas"]:
        raise ErreurRecette("Ce cas n'est pas dans la campagne.")
    if champs.get("resultat") not in RESULTATS:
        raise ErreurRecette("Résultat inconnu.")
    f = _local(pid, cid)
    local = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    r = {"resultat": champs["resultat"], "commentaire": str(champs.get("commentaire") or "").strip()[:2000], "le": aujourdhui()}
    if champs["resultat"] == "ko":
        r["gravite"] = champs.get("gravite") if champs.get("gravite") in GRAVITES else "majeure"
        r["anomalie"] = str(champs.get("anomalie") or "").strip()[:4000]
    local[cas_id] = r
    f.write_text(json.dumps(local, ensure_ascii=False), encoding="utf-8")
    return lire_campagne(pid, racine, cid)


def enregistrer_campagne(pid: str, racine: Path, cid: str, cloturer: bool = False) -> dict:
    c = _lire_camp(racine, cid)
    f = _local(pid, cid)
    local = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    c["resultats"] = {**(c.get("resultats") or {}), **local}
    if cloturer:
        c["statut"], c["close_le"] = "close", aujourdhui()
        c["verdict"] = rapport(c)["verdict"]
    _ecrire_camp(racine, c)
    f.unlink(missing_ok=True)
    return lire_campagne(pid, racine, cid)


def supprimer_campagne(pid: str, racine: Path, cid: str):
    _f_camp(racine, cid).unlink(missing_ok=True)
    _local(pid, cid).unlink(missing_ok=True)


def rapport(c: dict) -> dict:
    res = c.get("resultats") or {}
    n = len(c.get("cas") or [])
    compte = {k: 0 for k in RESULTATS}
    for i in c.get("cas") or []:
        compte[(res.get(i) or {}).get("resultat") or "non_joue"] += 1
    ko = [(i, res[i]) for i in c.get("cas") or [] if (res.get(i) or {}).get("resultat") == "ko"]
    par_gravite = {g: sum(1 for _, r in ko if r.get("gravite") == g) for g in GRAVITES}
    joues = n - compte["non_joue"]
    def nb(k, sing, plur):
        return f"{k} {sing if k == 1 else plur}"

    if par_gravite["bloquante"] or compte["bloque"]:
        motifs = [x for x in (par_gravite["bloquante"] and nb(par_gravite["bloquante"], "échec bloquant", "échecs bloquants"),
                              compte["bloque"] and nb(compte["bloque"], "cas qu'on n'a pas pu jouer", "cas qu'on n'a pas pu jouer")) if x]
        verdict, raison = "no_go", " et ".join(motifs) + "."
    elif compte["non_joue"]:
        verdict, raison = "incomplet", f"{nb(compte['non_joue'], 'cas reste', 'cas restent')} à jouer sur {n}."
    elif par_gravite["majeure"]:
        verdict, raison = "reserves", f"{nb(par_gravite['majeure'], 'échec majeur', 'échecs majeurs')} : livrer seulement avec un contournement accepté par le client."
    elif par_gravite["mineure"]:
        verdict, raison = "go_reserves", f"{nb(par_gravite['mineure'], 'échec mineur', 'échecs mineurs')}, à corriger dans une prochaine version."
    else:
        verdict, raison = "go", "Tous les cas sont réussis."
    return {"total": n, "joues": joues, "compte": compte, "par_gravite": par_gravite, "verdict": verdict, "raison": raison,
            "avancement": round(100 * joues / n) if n else 0}


def vue_campagnes(racine: Path) -> dict:
    p = charger(racine)
    return {"campagnes": liste_campagnes(racine), "genres": GENRES_CAMPAGNE, "resultats": RESULTATS, "gravites": GRAVITES,
            "versions_produit": p.meta.get("versions_produit") or []}
