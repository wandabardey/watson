"""Contrôles de complétude et de cohérence.

Chaque contrôle produit des « trous ». Un trou a un identifiant lisible et stable
(TYPE:cible[:détail]) pour que le responsable produit puisse le marquer
« hors périmètre » ou « impossible métier » dans trous.yaml, et une question
formulée pour être posée telle quelle (par Claude ou par l'outil).
"""

from __future__ import annotations


from collections import deque
from dataclasses import dataclass, field
from itertools import product

from .schemas import cible_et_donnee
from .chargement import Projet

ERREUR = "erreur"  # la base est incohérente, à corriger
TROU = "trou"  # une information métier manque
ALERTE = "alerte"  # à vérifier, pas forcément un problème


@dataclass
class Trou:
    id: str
    type: str
    gravite: str
    message: str
    question: str
    entite: str | None = None
    elements: list = field(default_factory=list)  # ids concernés
    statut: str = "ouvert"  # ouvert | hors_perimetre | impossible_metier
    justification: str | None = None

    def vers_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v not in (None, [])}


def _ajouter(trous, **kw):
    trous.append(Trou(**kw))



def libelle(p, ident: str) -> str:
    """Nom lisible d'un élément à partir de son identifiant."""
    for attr, gabarit in (("listes", "La liste « {} »"), ("regles", "La règle « {} »"), ("cas_usage", "Le parcours « {} »"), ("ecrans", "L'écran « {} »"),
                          ("acteurs", "L'acteur « {} »"), ("entites", "{}")):
        el = getattr(p, attr).get(ident)
        if el:
            return gabarit.format(el.get("titre") or el.get("nom"))
    if ident in p.transitions:
        return f"L'action « {p.transitions[ident][1]['nom']} »"
    return ident


def _date_fr(d: str) -> str:
    a, m, j = d.split("-")
    return f"{j}/{m}/{a}"


def _decrire(combo: dict, attributs: dict) -> str:
    """« le document douanier est manquant et le client n'est pas grand compte » plutôt que document_douanier = manquant."""
    morceaux = []
    for k, v in combo.items():
        nom = (attributs.get(k, {}).get("libelle") or k.replace("_", " ")).lower()
        if v is True:
            morceaux.append(f"{nom} : oui")
        elif v is False:
            morceaux.append(f"{nom} : non")
        else:
            morceaux.append(f"{nom} est « {v} »")
    return " et ".join(morceaux)

# ---------------------------------------------------------------- références


def controler_references(p: Projet, trous: list):
    def inconnu(source, champ, ident, attendu):
        _ajouter(
            trous,
            id=f"REFERENCE_INCONNUE:{source}:{champ}:{ident}",
            type="REFERENCE_INCONNUE",
            gravite=ERREUR,
            message=f"{libelle(p, source)} fait référence à {attendu} « {ident} », qui n'existe pas dans la base.",
            question=f"S'agit-il d'une faute de frappe, ou faut-il créer {attendu} « {ident} » ?",
            elements=[source, ident],
        )

    transitions = p.transitions
    versions = {v["id"] for v in p.meta.get("versions_produit") or []}

    def verifier_version(source, valeur, ou):
        if valeur and valeur not in versions:
            inconnu(source, "version", valeur, "la version produit")

    for col in (p.entites, p.listes, p.regles, p.ecrans, p.cas_usage):
        for el in col.values():
            verifier_version(el["id"], el.get("version"), "")
            for a in el.get("attributs") or []:
                verifier_version(el["id"], a.get("version"), a["nom"])
            for v in (el.get("valeurs") or []) if col is p.listes else []:
                verifier_version(el["id"], v.get("version"), v["nom"])
            for x in (el.get("statuts") or []) + (el.get("transitions") or []):
                verifier_version(x["id"], x.get("version"), "")
    apps = {a["id"] for a in p.meta.get("applications") or []}
    for ec in p.ecrans.values():
        for ro in ec.get("routages") or []:
            verifier_version(ec["id"], ro.get("version"), "")
            if ro["vers"] not in p.ecrans:
                inconnu(ec["id"], "routages", ro["vers"], "l'écran")
        for sec in ec.get("sections") or []:
            verifier_version(ec["id"], sec.get("version"), "")
        if ec.get("parent") and ec["parent"] not in p.ecrans:
            inconnu(ec["id"], "parent", ec["parent"], "l'écran")
        for r in ec.get("regles") or []:
            if r not in p.regles:
                inconnu(ec["id"], "regles", r, "la règle")
        for a in ec.get("applications") or []:
            if apps and a not in apps:
                inconnu(ec["id"], "applications", a, "l'application")
    for r in p.regles.values():
        for cible in r.get("porte_sur") or []:
            ident, donnee = cible_et_donnee(cible)
            connu = ident in p.fichiers or ident in transitions
            if not connu:
                inconnu(r["id"], "porte_sur", ident, "l'élément")
            elif donnee and donnee not in {a["nom"] for a in (p.entites.get(ident) or {}).get("attributs") or []}:
                inconnu(r["id"], "porte_sur", cible, "la donnée")
    for ent in p.entites.values():
        statuts = {s["id"] for s in ent["statuts"]}
        if statuts and ent.get("statut_initial") not in statuts:
            inconnu(ent["id"], "statut_initial", ent.get("statut_initial") or "(aucun)", "le statut")
        for a in ent.get("attributs") or []:
            if a["type"] == "reference" and a.get("cible") not in p.entites:
                inconnu(ent["id"], a["nom"], a.get("cible") or "(aucune)", "l'entité")
            if a["type"] == "liste" and a.get("cible") not in p.listes:
                inconnu(ent["id"], a["nom"], a.get("cible") or "(aucune)", "la liste de valeurs")
        for tr in ent["transitions"]:
            for champ in ("de", "vers"):
                if tr[champ] not in statuts:
                    inconnu(tr["id"], champ, tr[champ], "le statut")
            for a in tr.get("acteurs", []):
                if a not in p.acteurs:
                    inconnu(tr["id"], "acteurs", a, "l'acteur")
            for r in tr.get("regles", []):
                if r not in p.regles:
                    inconnu(tr["id"], "regles", r, "la règle")

    for rg in p.regles.values():
        if "entite" in rg and rg["entite"] not in p.entites:
            inconnu(rg["id"], "entite", rg["entite"], "l'entité")
        if "remplace" in rg and rg["remplace"] not in p.regles:
            inconnu(rg["id"], "remplace", rg["remplace"], "la règle")
        for ligne in rg.get("lignes", []):
            if ligne["alors"] not in transitions:
                inconnu(rg["id"], "lignes.alors", ligne["alors"], "la transition")

    for uc in p.cas_usage.values():
        if uc["acteur_principal"] not in p.acteurs:
            inconnu(uc["id"], "acteur_principal", uc["acteur_principal"], "l'acteur")
        for et in uc["etapes"]:
            if et["acteur"] not in p.acteurs:
                inconnu(uc["id"], "etapes.acteur", et["acteur"], "l'acteur")
            if "transition" in et and et["transition"] not in transitions:
                inconnu(uc["id"], "etapes.transition", et["transition"], "la transition")
            if "ecran" in et and et["ecran"] not in p.ecrans:
                inconnu(uc["id"], "etapes.ecran", et["ecran"], "l'écran")

    for scr in p.ecrans.values():
        for a in scr.get("acteurs", []):
            if a not in p.acteurs:
                inconnu(scr["id"], "acteurs", a, "l'acteur")


# ---------------------------------------------------------------- cycle de vie


def controler_cycle_de_vie(p: Projet, trous: list):
    for ent in p.entites.values():
        if not ent["statuts"]:
            continue  # entité de référentiel, sans cycle de vie
        eid = ent["id"]
        statuts = {s["id"]: s for s in ent["statuts"]}
        sorties = {s: [] for s in statuts}
        for tr in ent["transitions"]:
            if tr["de"] in sorties:
                sorties[tr["de"]].append(tr["vers"])

        # Statuts inatteignables depuis le statut initial
        vus, file = {ent["statut_initial"]}, deque([ent["statut_initial"]])
        while file:
            for suivant in sorties.get(file.popleft(), []):
                if suivant not in vus:
                    vus.add(suivant)
                    file.append(suivant)
        for sid, s in statuts.items():
            if sid not in vus:
                _ajouter(
                    trous,
                    id=f"STATUT_INATTEIGNABLE:{eid}:{sid}",
                    type="STATUT_INATTEIGNABLE",
                    gravite=TROU,
                    entite=eid,
                    elements=[sid],
                    message=f"{ent['nom']} : aucun chemin ne mène à l'étape « {s['nom']} ».",
                    question=(
                        f"{ent['nom']} : depuis quelle étape arrive-t-on à « {s['nom']} », "
                        f"qui déclenche ce passage, et à quelle condition ?"
                    ),
                )

        # Statuts sans sortie qui ne sont pas finaux
        for sid, s in statuts.items():
            if not s.get("final") and not sorties[sid]:
                _ajouter(
                    trous,
                    id=f"STATUT_SANS_SORTIE:{eid}:{sid}",
                    type="STATUT_SANS_SORTIE",
                    gravite=TROU,
                    entite=eid,
                    elements=[sid],
                    message=f"{ent['nom']} : une fois à l'étape « {s['nom']} », on ne peut plus rien faire, alors que ce n'est pas une étape finale.",
                    question=(
                        f"{ent['nom']} : que se passe-t-il après l'étape « {s['nom']} » ? "
                        f"S'il ne se passe plus rien, est-ce une étape finale ?"
                    ),
                )

        for tr in ent["transitions"]:
            if not tr.get("regles"):
                _ajouter(
                    trous,
                    id=f"TRANSITION_SANS_REGLE:{tr['id']}",
                    type="TRANSITION_SANS_REGLE",
                    gravite=TROU,
                    entite=eid,
                    elements=[tr["id"]],
                    message=f"{ent['nom']} : l'action « {tr['nom']} » n'est encadrée par aucune règle.",
                    question=(
                        f"À quelles conditions peut-on « {tr['nom'].lower()} » ? "
                        f"Y a-t-il des contrôles, des données obligatoires, des cas de refus ?"
                    ),
                )
            if not tr.get("acteurs"):
                _ajouter(
                    trous,
                    id=f"TRANSITION_SANS_ACTEUR:{tr['id']}",
                    type="TRANSITION_SANS_ACTEUR",
                    gravite=TROU,
                    entite=eid,
                    elements=[tr["id"]],
                    message=f"{ent['nom']} : personne n'est autorisé à faire l'action « {tr['nom']} ».",
                    question=(
                        f"Qui déclenche « {tr['nom'].lower()} » : un utilisateur (lequel) "
                        f"ou le système automatiquement ?"
                    ),
                )


# ---------------------------------------------------------------- tables de décision


def _domaine(attribut: dict):
    if attribut["type"] == "booleen":
        return [True, False]
    if attribut["type"] == "enum":
        return list(attribut.get("valeurs", []))
    return None  # non énumérable


def _correspond(si: dict, combo: dict) -> bool:
    return all(combo.get(k) == v for k, v in si.items())


def _format_valeur(v):
    if v is True:
        return "oui"
    if v is False:
        return "non"
    return str(v)


def _compresser(manquants: list[dict], domaines: dict) -> list[dict]:
    """Regroupe les combinaisons manquantes en motifs avec jokers ('*').

    Un attribut devient joker si toutes les combinaisons couvertes par le motif
    obtenu sont manquantes. Approche gloutonne, suffisante pour des tables de taille métier.
    """
    restants = [dict(c) for c in manquants]
    ensemble = {tuple(sorted(c.items(), key=lambda kv: kv[0])) for c in manquants}
    motifs = []
    while restants:
        motif = dict(restants[0])
        for attr in reversed(list(domaines)):
            essai = dict(motif)
            essai[attr] = "*"
            fixes = {k: v for k, v in essai.items() if v != "*"}
            jokers = [k for k, v in essai.items() if v == "*"]
            couverts = [
                {**fixes, **dict(zip(jokers, vals))}
                for vals in product(*(domaines[j] for j in jokers))
            ]
            if all(tuple(sorted(c.items(), key=lambda kv: kv[0])) in ensemble for c in couverts):
                motif = essai
        motifs.append(motif)
        restants = [c for c in restants if not all(motif[k] in ("*", c[k]) for k in c)]
    return motifs


def controler_tables(p: Projet, trous: list):
    transitions = p.transitions
    for rg in p.regles.values():
        if rg["type"] != "table_decision" or rg["statut"] == "obsolete":
            continue
        ent = p.entites.get(rg.get("entite"))
        if not ent:
            continue
        attributs = {a["nom"]: a for a in ent.get("attributs", [])}
        domaines = {}
        for cond in rg.get("conditions", []):
            nom = cond["attribut"]
            if nom not in attributs:
                _ajouter(
                    trous,
                    id=f"REFERENCE_INCONNUE:{rg['id']}:conditions:{nom}",
                    type="REFERENCE_INCONNUE",
                    gravite=ERREUR,
                    entite=ent["id"],
                    elements=[rg["id"]],
                    message=f"La règle « {rg['titre']} » s'appuie sur l'information « {nom.replace('_', ' ')} », qui n'est pas décrite pour {ent['nom']}.",
                    question=f"Faut-il ajouter l'information « {nom.replace('_', ' ')} » à {ent['nom']} ? Quelles valeurs peut-elle prendre ?",
                )
                continue
            dom = _domaine(attributs[nom])
            if dom is None:
                continue
            domaines[nom] = dom
        if not domaines:
            continue

        noms = list(domaines)
        manquants = []
        for vals in product(*(domaines[n] for n in noms)):
            combo = dict(zip(noms, vals))
            lignes = [l for l in rg.get("lignes", []) if _correspond(l["si"], combo)]
            resultats = {l["alors"] for l in lignes}
            if not lignes:
                manquants.append(combo)
            elif len(resultats) > 1:
                desc = _decrire(combo, attributs)
                noms_tr = " / ".join(
                    f"« {transitions[r][1]['nom']} »" if r in transitions else r for r in sorted(resultats)
                )
                _ajouter(
                    trous,
                    id=f"TABLE_CONTRADICTOIRE:{rg['id']}:" + ",".join(f"{k}={_format_valeur(v)}" for k, v in combo.items()),
                    type="TABLE_CONTRADICTOIRE",
                    gravite=ERREUR,
                    entite=ent["id"],
                    elements=[rg["id"]],
                    message=f"La règle « {rg['titre']} » donne deux réponses différentes quand {desc} : {noms_tr}.",
                    question=f"Quand {desc}, que doit-il se passer : {noms_tr} ?",
                )

        for motif in _compresser(manquants, domaines):
            fixes = {k: v for k, v in motif.items() if v != "*"}
            desc = _decrire(fixes, attributs) or "dans tous les cas"
            _ajouter(
                trous,
                id=f"TABLE_INCOMPLETE:{rg['id']}:" + ",".join(f"{k}={_format_valeur(v)}" for k, v in fixes.items()),
                type="TABLE_INCOMPLETE",
                gravite=TROU,
                entite=ent["id"],
                elements=[rg["id"]],
                message=f"La règle « {rg['titre']} » ne dit pas ce qui se passe quand {desc}.",
                question=(
                    f"{ent['nom']} : que doit-il se passer quand {desc} ? "
                    f"(passage à une autre étape, blocage, relance, autre)"
                ),
            )


# ---------------------------------------------------------------- règles


def controler_regles(p: Projet, trous: list):
    utilisees = {}
    for _, tr in p.transitions.values():
        for r in tr.get("regles", []):
            utilisees.setdefault(r, []).append(tr)

    for rg in p.regles.values():
        rid, ent = rg["id"], rg.get("entite")
        if rg["statut"] == "validee" and not rg.get("source"):
            _ajouter(
                trous,
                id=f"REGLE_SANS_SOURCE:{rid}",
                type="REGLE_SANS_SOURCE",
                gravite=TROU,
                entite=ent,
                elements=[rid],
                message=f"La règle « {rg['titre']} » est validée, mais on ne sait pas qui l'a décidée ni où.",
                question=f"Qui a validé « {rg['titre']} », et dans quel document ou atelier ?",
            )
        if rg["statut"] == "proposee":
            _ajouter(
                trous,
                id=f"REGLE_A_VALIDER:{rid}",
                type="REGLE_A_VALIDER",
                gravite=ALERTE,
                entite=ent,
                elements=[rid],
                message=f"La règle « {rg['titre']} » est proposée, pas encore validée.",
                question=f"Peut-on valider la règle « {rg['titre']} » telle qu'elle est rédigée ?",
            )
        if rg["statut"] == "obsolete" and rid in utilisees:
            noms = ", ".join(f"« {t['nom']} »" for t in utilisees[rid])
            remplacante = next((r["id"] for r in p.regles.values() if r.get("remplace") == rid), None)
            _ajouter(
                trous,
                id=f"REGLE_OBSOLETE_UTILISEE:{rid}",
                type="REGLE_OBSOLETE_UTILISEE",
                gravite=ERREUR,
                entite=ent,
                elements=[rid] + [t["id"] for t in utilisees[rid]],
                message=f"La règle « {rg['titre']} » n'est plus en vigueur, mais elle s'applique encore à l'action {noms}.",
                question=(
                    f"Faut-il appliquer à l'action {noms} la nouvelle règle « {p.regles[remplacante]['titre']} » ?"
                    if remplacante
                    else f"Quelle règle s'applique désormais à l'action {noms} ?"
                ),
            )
        if rg["statut"] != "obsolete" and rid not in utilisees:
            _ajouter(
                trous,
                id=f"REGLE_NON_RATTACHEE:{rid}",
                type="REGLE_NON_RATTACHEE",
                gravite=ALERTE,
                entite=ent,
                elements=[rid],
                message=f"La règle « {rg['titre']} » n'est rattachée à aucune action du cycle de vie.",
                question=f"À quel moment du cycle de vie s'applique « {rg['titre']} » ?",
            )


# ---------------------------------------------------------------- acteurs, cas d'usage, écrans


def controler_usages(p: Projet, trous: list):
    transitions = p.transitions
    acteurs_actifs = set()
    for _, tr in transitions.values():
        acteurs_actifs.update(tr.get("acteurs", []))
    statuts_couverts = {}
    ecrans_utilises = set()

    for uc in p.cas_usage.values():
        acteurs_actifs.add(uc["acteur_principal"])
        for et in uc["etapes"]:
            acteurs_actifs.add(et["acteur"])
            if "ecran" in et:
                ecrans_utilises.add(et["ecran"])
            if et.get("transition") in transitions:
                ent, tr = transitions[et["transition"]]
                statuts_couverts.setdefault(ent["id"], set()).update({tr["de"], tr["vers"]})
                autorises = tr.get("acteurs", [])
                if autorises and et["acteur"] not in autorises:
                    nom_acteur = p.acteurs.get(et["acteur"], {}).get("nom", et["acteur"])
                    _ajouter(
                        trous,
                        id=f"ACTEUR_NON_AUTORISE:{uc['id']}:{tr['id']}:{et['acteur']}",
                        type="ACTEUR_NON_AUTORISE",
                        gravite=ERREUR,
                        entite=ent["id"],
                        elements=[uc["id"], tr["id"], et["acteur"]],
                        message=(
                            f"Dans le parcours « {uc['nom']} », l'acteur « {nom_acteur} » fait l'action « {tr['nom']} », "
                            f"alors qu'il n'y est pas autorisé."
                        ),
                        question=f"L'acteur « {nom_acteur} » a-t-il le droit de « {tr['nom'].lower()} » ? Si oui, on l'autorise ; sinon, on corrige le parcours.",
                    )

    for aid, a in p.acteurs.items():
        if aid not in acteurs_actifs:
            _ajouter(
                trous,
                id=f"ACTEUR_SANS_ACTION:{aid}",
                type="ACTEUR_SANS_ACTION",
                gravite=TROU,
                elements=[aid],
                message=f"L'acteur « {a['nom']} » n'intervient nulle part.",
                question=f"Que fait l'acteur « {a['nom']} » dans ce projet : quelles actions, sur quels écrans ?",
            )

    for ent in p.entites.values():
        couverts = statuts_couverts.get(ent["id"], set())
        for s in ent["statuts"]:
            if s["id"] not in couverts:
                _ajouter(
                    trous,
                    id=f"STATUT_HORS_CAS_USAGE:{ent['id']}:{s['id']}",
                    type="STATUT_HORS_CAS_USAGE",
                    gravite=ALERTE,
                    entite=ent["id"],
                    elements=[s["id"]],
                    message=f"{ent['nom']} : aucun parcours décrit ne passe par l'étape « {s['nom']} ».",
                    question=f"{ent['nom']} : dans quelle situation concrète passe-t-on par l'étape « {s['nom']} » ? Faut-il décrire ce parcours ?",
                )

    for sid, scr in p.ecrans.items():
        if sid not in ecrans_utilises:
            _ajouter(
                trous,
                id=f"ECRAN_HORS_CAS_USAGE:{sid}",
                type="ECRAN_HORS_CAS_USAGE",
                gravite=ALERTE,
                elements=[sid],
                message=f"L'écran « {scr['nom']} » n'apparaît dans aucun parcours.",
                question=f"Dans quel parcours utilise-t-on l'écran « {scr['nom']} » ?",
            )


def regles_d_un_ecran(p: Projet, ecran_id: str) -> set:
    """Règles qui s'appliquent sur un écran (via les étapes de cas d'usage)."""
    transitions = p.transitions
    regles = set()
    for uc in p.cas_usage.values():
        for et in uc["etapes"]:
            if et.get("ecran") == ecran_id and et.get("transition") in transitions:
                regles.update(transitions[et["transition"]][1].get("regles", []))
    return regles


def derniere_modification(regle: dict) -> str | None:
    dates = [h["date"] for h in regle.get("historique", [])]
    return max(dates) if dates else None


def controler_captures(p: Projet, trous: list):
    for sid, scr in p.ecrans.items():
        regles = regles_d_un_ecran(p, sid)
        for cap in scr.get("captures", []):
            modifiees = []
            for rid in sorted(regles):
                rg = p.regles.get(rid)
                date = derniere_modification(rg) if rg else None
                if date and date > cap["date"]:
                    modifiees.append((rid, date))
            if modifiees:
                liste = ", ".join(f"« {p.regles[r]['titre']} » (le {_date_fr(d)})" for r, d in modifiees)
                _ajouter(
                    trous,
                    id=f"CAPTURE_A_VERIFIER:{sid}:{cap['fichier']}",
                    type="CAPTURE_A_VERIFIER",
                    gravite=ALERTE,
                    elements=[sid] + [r for r, _ in modifiees],
                    message=f"La capture de l'écran « {scr['nom']} » date du {_date_fr(cap['date'])}, avant la modification de la règle {liste}.",
                    question=f"La capture de « {scr['nom']} » est-elle toujours fidèle ? Sinon, il faut la reprendre.",
                )


# ---------------------------------------------------------------- orchestration

CONTROLES = [
    controler_references,
    controler_cycle_de_vie,
    controler_tables,
    controler_regles,
    controler_usages,
    controler_captures,
]


def analyser(p: Projet) -> list[Trou]:
    trous: list[Trou] = []
    for controle in CONTROLES:
        controle(p, trous)
    for t in trous:
        dec = p.decisions_trous.get(t.id)
        if dec and dec["statut"] != "a_traiter":
            t.statut = dec["statut"]
            t.justification = dec.get("justification")
    ordre = {ERREUR: 0, TROU: 1, ALERTE: 2}
    trous.sort(key=lambda t: (t.statut != "ouvert", ordre[t.gravite], t.entite or "", t.id))
    return trous


def couverture(p: Projet, trous: list[Trou]) -> dict:
    """Part des statuts et transitions de chaque entité sans trou ouvert."""
    resultat = {}
    for ent in p.entites.values():
        elements = [s["id"] for s in ent["statuts"]] + [t["id"] for t in ent["transitions"]]
        regles = {r for t in ent["transitions"] for r in t.get("regles", [])}
        touches = set()
        for t in trous:
            if t.statut != "ouvert" or t.gravite == ALERTE:
                continue
            for e in t.elements:
                if e in elements:
                    touches.add(e)
                if e in regles:  # une règle incomplète fragilise ses transitions
                    touches.update(tr["id"] for tr in ent["transitions"] if e in tr.get("regles", []))
        total = len(elements)
        resultat[ent["id"]] = {
            "nom": ent["nom"],
            "elements": total,
            "complets": total - len(touches),
            "taux": round(100 * (total - len(touches)) / total) if total else 100,
        }
    return resultat


def decisions_orphelines(p: Projet, trous: list[Trou]) -> list[str]:
    """Décisions de trous.yaml qui ne correspondent plus à aucun trou (trou résolu ou renommé)."""
    ids = {t.id for t in trous}
    return [d for d in p.decisions_trous if d not in ids]
