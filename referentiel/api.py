"""Moteur de l'application de bureau : une API locale, sur 127.0.0.1, appelée par l'interface.

L'application lance ce moteur au démarrage (`python -m referentiel.api` ou le binaire embarqué) ; il écrit sur
sa sortie une ligne `WATSON {"port": …, "jeton": …}` que l'application lit pour savoir où l'appeler. Chaque
appel doit porter l'en-tête `X-Watson-Jeton` : une autre page ou un autre programme du poste ne peut pas s'en
servir.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import __version__, alimentation, application, depot, github, reglages
from .chargement import charger
from .contexte import STATUTS
from .controles import ERREUR, analyser, couverture
from .ecriture import ErreurEcriture, enregistrer_element
from .versions import ErreurVersion, comparer, environnements, lister_versions

ORIGINES = ("tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420", "http://127.0.0.1:1420")


class Erreur(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------------------
# Vues de la base, pour l'interface
# ---------------------------------------------------------------------------

def _nom(p, ident):
    for coll in (p.acteurs, p.entites, p.regles, p.ecrans, p.cas_usage):
        if ident in coll:
            return coll[ident].get("nom") or coll[ident].get("titre") or ident
    if ident in p.transitions:
        return p.transitions[ident][1].get("nom", ident)
    for e in p.entites.values():
        for s in e.get("statuts", []):
            if s["id"] == ident:
                return s.get("nom", ident)
    return ident


def _trous(p):
    return [t for t in analyser(p) if t.statut == "ouvert"]


def vue_synthese(p) -> dict:
    trous = analyser(p)
    ouverts = [t for t in trous if t.statut == "ouvert"]
    historique = []
    for rid, r in p.regles.items():
        for h in r.get("historique") or []:
            historique.append({"date": str(h.get("date", "")), "auteur": h.get("auteur"), "changement": h.get("changement"),
                               "raison": h.get("raison"), "regle": r.get("titre", rid), "id": rid})
    historique.sort(key=lambda h: h["date"], reverse=True)
    return {
        "projet": {k: p.meta.get(k) for k in ("id", "nom", "description")},
        "applications": p.meta.get("applications") or [],
        "glossaire": p.meta.get("glossaire") or [],
        "compteurs": {"entites": len(p.entites), "acteurs": len(p.acteurs), "regles": len(p.regles),
                      "parcours": len(p.cas_usage), "ecrans": len(p.ecrans)},
        "regles": {s: sum(1 for r in p.regles.values() if r.get("statut") == s) for s in ("validee", "proposee", "obsolete")},
        "couverture": couverture(p, trous),
        "points": [{"gravite": t.gravite, "message": t.message, "question": t.question, "elements": t.elements} for t in ouverts],
        "historique": historique[:12],
    }


def vue_catalogue(p) -> dict:
    regles_par_attribut = {}
    for rid, r in p.regles.items():
        for c in r.get("conditions") or []:
            regles_par_attribut.setdefault(c.get("attribut"), []).append({"id": rid, "titre": r["titre"], "statut": r["statut"]})
    entites = []
    for eid, e in p.entites.items():
        entites.append({
            "id": eid, "nom": e["nom"], "description": e.get("description", ""),
            "attributs": [{**a, "regles": regles_par_attribut.get(a["nom"], [])} for a in e.get("attributs") or []],
            "etapes": [{"id": s["id"], "nom": s.get("nom", s["id"]), "description": s.get("description", ""), "finale": bool(s.get("final")),
                        "initiale": s["id"] == e.get("statut_initial")} for s in e.get("statuts", [])],
            "actions": len(e.get("transitions", [])),
            "regles": [{"id": rid, "titre": r["titre"], "statut": r["statut"]} for rid, r in p.regles.items() if r.get("entite") == eid],
        })
    acteurs = []
    for aid, a in p.acteurs.items():
        actions = [tr.get("nom", tid) for tid, (_, tr) in p.transitions.items() if aid in (tr.get("acteurs") or [])]
        acteurs.append({"id": aid, "nom": a["nom"], "description": a.get("description", ""), "actions": actions})
    return {"entites": entites, "acteurs": acteurs, "glossaire": p.meta.get("glossaire") or []}


def vue_workflow(p) -> dict:
    trous = _trous(p)
    par_element = {}
    for t in trous:
        for el in t.elements or []:
            par_element.setdefault(el, []).append({"gravite": t.gravite, "message": t.message, "question": t.question})
    entites = []
    for eid, e in p.entites.items():
        entites.append({
            "id": eid, "nom": e["nom"], "initiale": e.get("statut_initial"),
            "attributs": [{"nom": a["nom"], "libelle": a.get("libelle") or a["nom"], "type": a["type"], "valeurs": a.get("valeurs") or []}
                          for a in e.get("attributs") or []],
            "etapes": [{"id": s["id"], "nom": s.get("nom", s["id"]), "description": s.get("description", ""),
                        "finale": bool(s.get("final")), "points": par_element.get(s["id"], [])} for s in e.get("statuts", [])],
            "actions": [{
                "id": tr["id"], "nom": tr.get("nom", tr["id"]), "de": tr["de"], "vers": tr["vers"],
                "acteurs": [{"id": a, "nom": _nom(p, a)} for a in tr.get("acteurs") or []],
                "regles": [{"id": r, "titre": _nom(p, r), "statut": p.regles.get(r, {}).get("statut", "introuvable"),
                            "enonce": p.regles.get(r, {}).get("enonce", "")} for r in tr.get("regles") or []],
                "applications": tr.get("applications") or [],
                "points": par_element.get(tr["id"], []),
            } for tr in e.get("transitions", [])],
        })
    tables = []
    for rid, r in p.regles.items():
        if r.get("type") == "table_decision":
            tables.append({"id": rid, "titre": r["titre"], "statut": r["statut"],
                           "lignes": [{"si": l.get("si") or {}, "alors": l.get("alors"), "alors_nom": _nom(p, l.get("alors", "")), "note": l.get("note")}
                                      for l in r.get("lignes") or []]})
    return {"entites": entites, "tables": tables}


def vue_regles(p) -> dict:
    trous = _trous(p)
    liste = []
    for rid, r in sorted(p.regles.items()):
        actions = [{"id": tid, "nom": tr.get("nom", tid)} for tid, (_, tr) in p.transitions.items() if rid in (tr.get("regles") or [])]
        remplacee_par = next((x for x, y in p.regles.items() if y.get("remplace") == rid), None)
        liste.append({
            "id": rid, "titre": r["titre"], "statut": r["statut"], "libelle_statut": STATUTS.get(r["statut"], r["statut"]).split(",")[0],
            "type": r.get("type"), "enonce": r.get("enonce", ""), "source": r.get("source"),
            "entite": _nom(p, r["entite"]) if r.get("entite") else None,
            "remplace": {"id": r["remplace"], "titre": _nom(p, r["remplace"])} if r.get("remplace") else None,
            "remplacee_par": {"id": remplacee_par, "titre": _nom(p, remplacee_par)} if remplacee_par else None,
            "lignes": [{"si": l.get("si") or {}, "alors": _nom(p, l.get("alors", "")), "note": l.get("note")} for l in r.get("lignes") or []],
            "actions": actions,
            "historique": [{**h, "date": str(h.get("date", ""))} for h in r.get("historique") or []],
            "points": [{"gravite": t.gravite, "message": t.message, "question": t.question} for t in trous if rid in (t.elements or [])],
        })
    return {"regles": liste}


def vue_versions(racine: Path) -> dict:
    vs = lister_versions(racine)
    envs = environnements(racine)
    return {"versions": vs, "environnements": envs, "derniere": vs[-1]["version"] if vs else None}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

TAILLE_MAX = 56_000_000  # environ 40 Mo de documents, une fois encodés


def _p(pid):
    racine = application.chemin(pid)
    p = charger(racine)
    if p.erreurs:
        raise Erreur("La base de ce projet est invalide : " + " ; ".join(p.erreurs[:3]))
    return racine, p


def _alimenter(methode, pid, reste, corps):
    racine = application.chemin(pid)
    if methode == "GET" and not reste:
        return {"lots": alimentation.lots(pid)}
    if methode == "POST" and not reste:
        return alimentation.analyser(pid, racine, corps.get("documents") or [])
    if methode == "GET" and len(reste) == 1:
        return alimentation.lire_lot(pid, reste[0])
    if methode == "DELETE" and len(reste) == 1:
        alimentation.abandonner(pid, reste[0])
        return {"ok": True}
    if methode == "POST" and len(reste) == 2 and reste[1] == "appliquer":
        compte = github.compte()
        r = alimentation.appliquer(pid, racine, reste[0], corps.get("decisions") or [], compte["nom"])
        return {**r, **application.enregistrer_et_envoyer(pid, r["message"])}
    raise Erreur("Introuvable.", 404)


def route(methode: str, chemin: str, requete: dict, corps: dict):
    morceaux = [m for m in chemin.split("/") if m][1:]  # sans « api »
    if methode == "GET" and morceaux == ["etat"]:
        j = github.jeton()
        compte = None
        if j:
            try:
                compte = github.compte(j)
            except github.ErreurGitHub:
                compte = None
        from .assistant import etat_connexion
        try:
            claude = etat_connexion()
        except Exception:  # noqa: BLE001
            claude = {"connecte": False}
        return {"version": __version__, "github": {"connecte": bool(compte), "compte": compte}, "claude": claude,
                "modele": reglages.nom_modele(reglages.modele()), "donnees": str(application.dossier_donnees())}
    if morceaux[:1] == ["github"]:
        if methode == "POST" and morceaux[1:] == ["connexion"]:
            return github.demarrer_connexion()
        if methode == "POST" and morceaux[1:] == ["attente"]:
            return github.terminer_connexion(corps["attente"])
        if methode == "POST" and morceaux[1:] == ["deconnexion"]:
            github.deconnecter()
            return {"ok": True}
        if methode == "GET" and morceaux[1:] == ["proprietaires"]:
            return github.proprietaires()
        if methode == "GET" and morceaux[1:] == ["depots"]:
            return {"depots": github.depots(requete.get("q", [""])[0])}
    if morceaux == ["reglages"]:
        if methode == "POST":
            reglages.ecrire(corps)
        return reglages.vue()
    if morceaux == ["reglages", "tester"] and methode == "POST":
        from .assistant import tester
        return tester()
    if morceaux[:1] == ["claude"] and methode == "POST" and morceaux[1:] == ["connexion"]:
        from .assistant import lancer_connexion
        lancer_connexion()
        return {"ok": True}
    if morceaux == ["projets"]:
        if methode == "GET":
            return {"projets": application.lister()}
        if methode == "POST":
            if corps.get("creer"):
                return application.creer(corps["nom"], corps.get("depot"), corps.get("organisation"), bool(corps.get("demo")))
            return application.ajouter(corps["depot"])
    if morceaux[:1] == ["projets"] and len(morceaux) >= 2:
        pid, reste = morceaux[1], morceaux[2:]
        if methode == "DELETE" and not reste:
            application.oublier(pid)
            return {"ok": True}
        if methode == "POST" and reste == ["synchroniser"]:
            return application.synchroniser(pid)
        if reste[:1] == ["alimenter"]:
            return _alimenter(methode, pid, reste[1:], corps)
        racine, p = _p(pid)
        if methode == "GET":
            if reste == ["synthese"]:
                return {**vue_synthese(p), "depot": application.projet(pid)["depot"], "versions": vue_versions(racine)}
            if reste == ["catalogue"]:
                return vue_catalogue(p)
            if reste == ["workflow"]:
                return vue_workflow(p)
            if reste == ["regles"]:
                return vue_regles(p)
            if reste == ["versions"]:
                return vue_versions(racine)
            if reste == ["comparer"]:
                return comparer(racine, requete.get("de", ["travail"])[0], requete.get("a", [None])[0] or "travail")
            if reste == ["tests"]:
                from .recette import proposer
                return proposer(p, requete.get("element", [None])[0])
        if methode == "POST" and reste == ["demander"]:
            from .assistant import demander
            return demander(str(corps.get("question", ""))[:2000], racine, corps.get("portee", "travail")).en_dict()
        if methode == "POST" and len(reste) == 3 and reste[0] == "regles" and reste[2] == "valider":
            rid = reste[1]
            if rid not in p.regles:
                raise Erreur("Règle inconnue.", 404)
            compte = github.compte()
            regle = {**p.regles[rid], "statut": "validee"}
            if corps.get("source"):
                regle["source"] = corps["source"]
            bilan = enregistrer_element(racine, "regle", regle, compte["nom"], "Règle validée", corps.get("raison"))
            envoi = application.enregistrer_et_envoyer(pid, f"Règle validée : {regle['titre']}")
            return {"bilan": bilan, **envoi}
    raise Erreur("Introuvable.", 404)


# ---------------------------------------------------------------------------
# Serveur
# ---------------------------------------------------------------------------

def fabrique(jeton: str):
    class Gestionnaire(BaseHTTPRequestHandler):
        def _cors(self):
            origine = self.headers.get("Origin")
            if origine in ORIGINES:
                self.send_header("Access-Control-Allow-Origin", origine)
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Watson-Jeton")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

        def _repondre(self, code, donnees):
            corps = json.dumps(donnees, ensure_ascii=False, default=str).encode("utf-8")
            self.send_response(code)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)

        def do_OPTIONS(self):  # noqa: N802
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _traiter(self, methode):
            if not secrets.compare_digest(self.headers.get("X-Watson-Jeton", ""), jeton):
                return self._repondre(403, {"erreur": "Accès refusé."})
            url = urlparse(self.path)
            corps = {}
            if methode in ("POST", "DELETE"):
                longueur = int(self.headers.get("Content-Length") or 0)
                if longueur > TAILLE_MAX:
                    return self._repondre(413, {"erreur": "Documents trop lourds pour un seul envoi (40 Mo au plus) : les envoyer en plusieurs fois."})
                if longueur:
                    corps = json.loads(self.rfile.read(longueur) or b"{}")
            try:
                self._repondre(200, route(methode, url.path, parse_qs(url.query), corps))
            except Erreur as e:
                self._repondre(e.code, {"erreur": str(e)})
            except (application.ErreurApplication, alimentation.ErreurAlimentation, reglages.ErreurReglages, github.ErreurGitHub, depot.ErreurDepot, ErreurVersion, ErreurEcriture) as e:
                self._repondre(400, {"erreur": str(e)})
            except Exception as e:  # noqa: BLE001
                from .assistant import ErreurAssistant
                if isinstance(e, ErreurAssistant):
                    return self._repondre(400, {"erreur": str(e)})
                traceback.print_exc()
                self._repondre(500, {"erreur": "Erreur inattendue du moteur."})

        def do_GET(self):  # noqa: N802
            self._traiter("GET")

        def do_POST(self):  # noqa: N802
            self._traiter("POST")

        def do_DELETE(self):  # noqa: N802
            self._traiter("DELETE")

        def log_message(self, *a):
            pass

    return Gestionnaire


def main():
    os.environ.setdefault("REFERENTIEL_GIT", "dulwich")
    jeton = os.environ.get("WATSON_JETON") or secrets.token_urlsafe(24)
    port = int(os.environ.get("WATSON_PORT", "0"))
    serveur = ThreadingHTTPServer(("127.0.0.1", port), fabrique(jeton))
    print("WATSON " + json.dumps({"port": serveur.server_address[1], "jeton": jeton, "version": __version__}), flush=True)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
