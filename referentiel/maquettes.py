"""Avant-projet : les maquettes. Des écrans d'exemple, sans code projet, rangés dans `avant-projet/maquettes/`.

Trois origines :
- Watson : Claude dessine l'écran en HTML et CSS statiques, avec la piste retenue du moodboard, la description de
  l'écran (onglet Écrans), les scénarios qui y passent et un jeu de données fictives commun à toutes les maquettes ;
- Claude Design : Watson prépare un brief à y coller, puis on importe l'export HTML ;
- import : une capture ou un HTML venus d'ailleurs.

Le HTML est nettoyé (aucun script, aucune ressource externe hors polices Google) et s'affiche dans un cadre isolé.
Une maquette dessinée par Watson attend sur ce poste qu'on la garde : rien n'entre dans le dépôt sans accord.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from pathlib import Path

from ._vendor import yaml
from .avant_projet import (DOSSIER, ErreurAvantProjet, IMAGES, lire_cahier, lire_moodboard, _dossier_propositions)
from .chargement import charger
from .ecriture import aujourdhui, dump

SUPPORTS = {"desktop": "Ordinateur", "mobile": "Mobile", "tablette": "Tablette"}
ORIGINES = {"watson": "Dessinée par Watson", "claude_design": "Claude Design", "import": "Importée"}
LIMITE_HTML = 400_000


def _index_f(racine: Path) -> Path:
    return Path(racine) / DOSSIER / "maquettes.yaml"


def lire_index(racine: Path) -> dict:
    f = _index_f(racine)
    d = (yaml.safe_load(f.read_text(encoding="utf-8")) or {}) if f.exists() else {}
    d.setdefault("maquettes", [])
    d.setdefault("donnees", "")
    return d


def _ecrire_index(racine: Path, d: dict):
    f = _index_f(racine)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text("# Maquettes de l'avant-projet. donnees : le jeu de données fictives commun.\n" + dump(d), encoding="utf-8")


# ----------------------------------------------------------------- nettoyage du HTML

_BALISES_INTERDITES = r"script|iframe|object|embed|frame|frameset|applet|base|form|portal"


def nettoyer(html: str) -> str:
    """Retire tout ce qui s'exécute ou va chercher ailleurs. Les polices Google restent permises."""
    h = html[:LIMITE_HTML]
    h = re.sub(rf"(?is)<({_BALISES_INTERDITES})\b.*?</\1\s*>", "", h)
    h = re.sub(rf"(?is)<\/?({_BALISES_INTERDITES})\b[^>]*>", "", h)
    h = re.sub(r"(?is)<meta[^>]+http-equiv[^>]*>", "", h)
    h = re.sub(r"(?is)\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", h)
    h = re.sub(r"(?is)(href|src|action|formaction|xlink:href)\s*=\s*([\"']?)\s*javascript:[^\"'>]*\2", r"\1=\2#\2", h)

    def lien(m):
        url = m.group(3)
        if url.startswith(("https://fonts.googleapis.com", "https://fonts.gstatic.com", "data:image/", "#")):
            return m.group(0)
        return f'{m.group(1)}={m.group(2)}#{m.group(2)}' if re.match(r"(?i)(https?:)?//", url) else m.group(0)
    h = re.sub(r"(?is)\b(src|href|srcset|poster)\s*=\s*([\"'])(.*?)\2", lien, h)
    h = re.sub(r"(?is)url\(\s*([\"']?)(https?:)?//(?!fonts\.g)[^)]*\)", "url()", h)
    h = re.sub(r"(?is)@import\s+(url\()?[\"']?(?!https://fonts\.googleapis\.com)[^;]*;", "", h)
    return h


def document(html: str) -> str:
    """Le HTML complet à montrer dans le cadre isolé."""
    if re.search(r"(?is)<html", html):
        return html
    return ("<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<style>*{box-sizing:border-box}body{margin:0}</style></head><body>" + html + "</body></html>")


# ----------------------------------------------------------------- vue

def vue(racine: Path, pid: str | None = None) -> dict:
    p = charger(racine)
    idx = lire_index(racine)
    mb = lire_moodboard(racine) or {}
    retenue = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    noms = {i: e["nom"] for i, e in p.ecrans.items()}
    apps = {a["id"]: a for a in p.meta.get("applications") or []}
    ecrans = []
    for i, e in p.ecrans.items():
        app = apps.get((e.get("applications") or [None])[0]) or {}
        ecrans.append({"id": i, "nom": e["nom"], "type": e.get("type"), "version": e.get("version"), "a_trancher": bool(e.get("a_trancher")),
                       "application": app.get("nom"), "support": "mobile" if app.get("support") == "mobile" else "desktop",
                       "maquettes": [m["id"] for m in idx["maquettes"] if m.get("ecran") == i]})
    return {"maquettes": [{**m, "ecran_nom": noms.get(m.get("ecran"), "")} for m in idx["maquettes"]], "donnees": idx["donnees"],
            "ecrans": ecrans, "piste": retenue, "supports": SUPPORTS, "origines": ORIGINES,
            "propositions": propositions(pid) if pid else [], "cahier": bool(lire_cahier(racine))}


def contenu(racine: Path, mid: str, proposition_de: str | None = None) -> dict:
    """Le HTML (ou l'image) d'une maquette, prêt à afficher."""
    if not re.match(r"^[a-z0-9-]+$", mid):
        raise ErreurAvantProjet("Maquette inconnue.")
    if proposition_de:
        f = _dossier_maquettes_local(proposition_de) / f"{mid}.json"
        if not f.exists():
            raise ErreurAvantProjet("Proposition introuvable.")
        m = json.loads(f.read_text(encoding="utf-8"))
        return {"html": document(m["html"])}
    m = next((x for x in lire_index(racine)["maquettes"] if x["id"] == mid), None)
    if not m:
        raise ErreurAvantProjet("Maquette inconnue.")
    f = Path(racine) / DOSSIER / "maquettes" / m["fichier"]
    if f.suffix.lower() in IMAGES:
        return {"image": f"data:{IMAGES[f.suffix.lower()]};base64," + base64.b64encode(f.read_bytes()).decode()}
    return {"html": document(nettoyer(f.read_text(encoding="utf-8")))}


# ----------------------------------------------------------------- propositions (sur ce poste)

def _dossier_maquettes_local(pid: str) -> Path:
    d = _dossier_propositions() / f"{pid}-maquettes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def propositions(pid: str) -> list[dict]:
    r = []
    for f in sorted(_dossier_maquettes_local(pid).glob("*.json"), key=lambda f: f.stat().st_mtime):
        m = json.loads(f.read_text(encoding="utf-8"))
        r.append({k: v for k, v in m.items() if k != "html"})
    return r


def ecarter(pid: str, mid: str):
    f = _dossier_maquettes_local(pid) / f"{mid}.json"
    if re.match(r"^[a-z0-9-]+$", mid) and f.exists():
        f.unlink()


def _nouvel_id(racine: Path, base: str, pid: str | None = None) -> str:
    pris = {m["id"] for m in lire_index(racine)["maquettes"]}
    if pid:
        pris |= {m["id"] for m in propositions(pid)}
    base = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:40] or "maquette"
    r, n = base, 2
    while r in pris:
        r, n = f"{base}-{n}", n + 1
    return r


SCHEMA_REPONSE = {
    "type": "object", "required": ["titre", "html", "notes", "donnees"],
    "properties": {
        "titre": {"type": "string"},
        "html": {"type": "string", "description": "Le contenu de <body> : balises et une balise <style>. Aucun script."},
        "notes": {"type": "string", "description": "Ce que montre l'écran, les hypothèses, les variantes, en quelques lignes."},
        "donnees": {"type": "string", "description": "Le jeu de données fictives commun, complété de ce que cette maquette ajoute."},
        "questions": {"type": "array", "items": {"type": "object", "required": ["question"], "properties": {"question": {"type": "string"}}}},
    },
}


def _description_ecran(p, eid: str) -> str:
    e = p.ecrans[eid]
    apps = {a["id"]: a for a in p.meta.get("applications") or []}
    app = apps.get((e.get("applications") or [None])[0]) or {}
    l = [f"Écran « {e['nom']} » ({e.get('type', 'page')}), application {app.get('nom', 'non précisée')} ({app.get('support', 'web')})."]
    if e.get("description"):
        l.append(e["description"])
    if e.get("acteurs"):
        l.append("Pour : " + ", ".join(p.acteurs.get(a, {}).get("nom", a) for a in e["acteurs"]))
    for s in e.get("sections") or []:
        l.append(f"- {s.get('genre', 'section')} : {s['titre']}" + (f" ({s['description']})" if s.get("description") else "")
                 + (f" [version {s['version']}]" if s.get("version") else ""))
    for r in e.get("routages") or []:
        l.append(f"- mène à « {p.ecrans.get(r['vers'], {}).get('nom', r['vers'])} »" + (f" par « {r['libelle']} »" if r.get("libelle") else ""))
    for rid in e.get("regles") or []:
        if rid in p.regles:
            l.append(f"- règle : {p.regles[rid]['titre']} : {p.regles[rid].get('enonce', '')}")
    for sc in p.scenarios.values():
        for et in sc["etapes"]:
            if et.get("ecran") == eid:
                l.append(f"- dans le scénario « {sc['nom']} », étape « {et['libelle']} »")
    if e.get("parent") and e["parent"] in p.ecrans:
        l.append(f"C'est un {e.get('type', 'panneau')} ouvert depuis « {p.ecrans[e['parent']]['nom']} ».")
    return "\n".join(l)


def _consignes(contexte: str, piste: dict | None, cahier_txt: str, donnees: str, support: str, demande: str | None, precedente: str | None) -> str:
    from . import methode

    direction = (f"Direction artistique retenue (à appliquer strictement : couleurs par rôle, polices Google Fonts, rayon, ombre, densité) :\n"
                 f"{json.dumps(piste, ensure_ascii=False)}" if piste else
                 "Aucune piste de moodboard retenue : style sobre et neutre d'application métier, une couleur de marque discrète.")
    return f"""Tu dessines la maquette d'un écran, pour une Product Owner de 4SH qui la montrera au client avant tout
développement. Maquette moyenne fidélité, statique, crédible : on doit croire à l'écran.

Règles de fabrication :
1. Réponds par le contenu de <body> : du HTML et une balise <style>. Aucun script, aucun gestionnaire d'événement,
   aucune image ni ressource externe (seules les polices Google Fonts sont permises, par @import en tête du style).
   Icônes : formes CSS simples ou caractères neutres, pas d'emojis.
2. Support : {SUPPORTS.get(support, support)}. {"Largeur 390 px, hauteur libre, zones tactiles de 44 px." if support == "mobile" else "Largeur 1280 px, hauteur 800 px environ, sans défilement horizontal."}
3. Données : utilise et complète le jeu de données fictives commun ci-dessous. Les mêmes noms, numéros, montants et
   statuts d'un écran à l'autre ; un compteur égale le nombre de lignes affichées. Renvoie le jeu complété dans
   « donnees » (texte court, une ligne par objet).
4. Contenu fidèle à la description de l'écran : ses sections dans l'ordre, ses onglets, ses boutons qui mènent
   ailleurs, ses règles rendues visibles (message, champ obligatoire, état bloqué). Ce qui est d'une version
   ultérieure n'apparaît pas. Libellés réels en français, jamais de « Lorem ».
5. Tu ne montres qu'un état : le plus parlant (souvent rempli). Les autres états vont dans « notes ».
6. Ce qui manque pour bien dessiner devient une question dans « questions ».
{f"Demande de la personne, à suivre en priorité : {demande}" if demande else ""}

{direction}

{methode.consignes("maquettes")}

FORMAT DE SORTIE : uniquement un objet JSON, sans texte autour ni bloc de code, conforme à ce schéma :
{json.dumps(SCHEMA_REPONSE, ensure_ascii=False)}

# Jeu de données fictives commun
{donnees or "(vide : c'est la première maquette, pose-le)"}
{f"# Version précédente de cette maquette, à reprendre{chr(10)}{precedente}" if precedente else ""}

# Cahier des charges
{cahier_txt or "(pas encore rédigé)"}

# Base du projet
{contexte}
"""


def dessiner(pid: str, racine: Path, ecran: str | None = None, description: str | None = None, support: str | None = None,
             demande: str | None = None, reprendre: str | None = None, requete=None) -> dict:
    """Claude dessine une maquette ; elle attend sur ce poste qu'on la garde."""
    from . import reglages
    from .alimentation import ErreurAlimentation, _lire_par_claude
    from .assistant import construire_contexte

    p = charger(racine)
    idx = lire_index(racine)
    mb = lire_moodboard(racine) or {}
    piste = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    precedente = None
    if reprendre:
        m = next((x for x in idx["maquettes"] if x["id"] == reprendre), None)
        if not m or not m["fichier"].endswith(".html"):
            raise ErreurAvantProjet("Seule une maquette HTML peut être reprise.")
        precedente = (Path(racine) / DOSSIER / "maquettes" / m["fichier"]).read_text(encoding="utf-8")[:60_000]
        ecran = ecran or m.get("ecran")
        support = support or m.get("support")
    if ecran and ecran not in p.ecrans:
        raise ErreurAvantProjet("Écran inconnu.")
    if not ecran and not (description or "").strip():
        raise ErreurAvantProjet("Choisis un écran ou décris celui à dessiner.")
    if not support and ecran:
        apps = {a["id"]: a for a in p.meta.get("applications") or []}
        app = apps.get((p.ecrans[ecran].get("applications") or [None])[0]) or {}
        support = "mobile" if app.get("support") == "mobile" else "desktop"
    support = support if support in SUPPORTS else "desktop"
    cahier = lire_cahier(racine)
    cahier_txt = "\n\n".join(f"## {s['titre']}\n{s.get('contenu', '')}" for s in (cahier or {}).get("sections") or [] if s.get("contenu"))[:20_000]
    contexte, _ = construire_contexte(racine)
    quoi = _description_ecran(p, ecran) if ecran else f"Écran à imaginer : {description}"
    debut = time.time()
    try:
        r = asyncio.run(_lire_par_claude(_consignes(contexte, piste, cahier_txt, idx["donnees"], support, demande, precedente),
                                         f"Dessine cet écran.\n\n{quoi}", requete))
    except ErreurAlimentation as e:
        raise ErreurAvantProjet(str(e)) from e
    html = nettoyer(str(r.get("html") or ""))
    if len(re.sub(r"<[^>]+>|\s", "", html)) < 20:
        raise ErreurAvantProjet("Claude n'a pas rendu de maquette exploitable. Réessaie, éventuellement avec une consigne.")
    titre = str(r.get("titre") or (p.ecrans[ecran]["nom"] if ecran else "Maquette")).strip()
    mid = reprendre or _nouvel_id(racine, titre, pid)
    prop = {"id": mid, "titre": titre, "ecran": ecran or "", "support": support, "origine": "watson", "piste": (piste or {}).get("id", ""),
            "notes": str(r.get("notes") or ""), "donnees": str(r.get("donnees") or idx["donnees"]), "date": aujourdhui(),
            "duree_s": round(time.time() - debut), "modele": reglages.nom_modele(reglages.modele()), "remplace": bool(reprendre),
            "demande": demande or "", "questions": [q for q in r.get("questions") or [] if isinstance(q, dict) and q.get("question")],
            "html": html}
    (_dossier_maquettes_local(pid) / f"{mid}.json").write_text(json.dumps(prop, ensure_ascii=False), encoding="utf-8")
    return {k: v for k, v in prop.items() if k != "html"}


def garder(pid: str, racine: Path, mid: str, auteur: str, questions: bool = True) -> dict:
    from .alimentation import noter_questions

    f = _dossier_maquettes_local(pid) / f"{mid}.json"
    if not re.match(r"^[a-z0-9-]+$", mid) or not f.exists():
        raise ErreurAvantProjet("Proposition introuvable.")
    prop = json.loads(f.read_text(encoding="utf-8"))
    dossier = Path(racine) / DOSSIER / "maquettes"
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / f"{mid}.html").write_text(prop["html"], encoding="utf-8")
    idx = lire_index(racine)
    entree = {k: prop[k] for k in ("id", "titre", "ecran", "support", "origine", "piste", "notes", "date") if prop.get(k)}
    entree["fichier"] = f"{mid}.html"
    idx["maquettes"] = [m for m in idx["maquettes"] if m["id"] != mid] + [entree]
    idx["donnees"] = prop.get("donnees") or idx["donnees"]
    _ecrire_index(racine, idx)
    if questions and prop.get("questions"):
        noter_questions(racine, [{**q, "source": f"Maquette {prop['titre']}"} for q in prop["questions"]], auteur, aujourdhui())
    f.unlink()
    return entree


def importer(racine: Path, nom: str, contenu_base64: str, titre: str = "", ecran: str = "", support: str = "desktop", origine: str = "import") -> dict:
    ext = Path(nom).suffix.lower()
    octets = base64.b64decode(contenu_base64)
    if ext not in IMAGES and ext not in (".html", ".htm"):
        raise ErreurAvantProjet("Format attendu : HTML (export de Claude Design par exemple), PNG, JPG ou WebP.")
    if len(octets) > 8_000_000:
        raise ErreurAvantProjet("Fichier de plus de 8 Mo.")
    p = charger(racine)
    if ecran and ecran not in p.ecrans:
        raise ErreurAvantProjet("Écran inconnu.")
    mid = _nouvel_id(racine, titre or Path(nom).stem)
    dossier = Path(racine) / DOSSIER / "maquettes"
    dossier.mkdir(parents=True, exist_ok=True)
    if ext in (".html", ".htm"):
        (dossier / f"{mid}.html").write_text(nettoyer(octets.decode("utf-8", "replace")), encoding="utf-8")
        fichier = f"{mid}.html"
    else:
        fichier = f"{mid}{ext}"
        (dossier / fichier).write_bytes(octets)
    idx = lire_index(racine)
    entree = {"id": mid, "titre": titre or Path(nom).stem, "support": support if support in SUPPORTS else "desktop",
              "origine": origine if origine in ORIGINES else "import", "date": aujourdhui(), "fichier": fichier}
    if ecran:
        entree["ecran"] = ecran
    idx["maquettes"].append(entree)
    _ecrire_index(racine, idx)
    return entree


def modifier(racine: Path, mid: str, champs: dict) -> dict:
    idx = lire_index(racine)
    m = next((x for x in idx["maquettes"] if x["id"] == mid), None)
    if not m:
        raise ErreurAvantProjet("Maquette inconnue.")
    p = charger(racine)
    for k in ("titre", "notes"):
        if k in champs:
            m[k] = str(champs[k]).strip()
    if "ecran" in champs:
        if champs["ecran"] and champs["ecran"] not in p.ecrans:
            raise ErreurAvantProjet("Écran inconnu.")
        m["ecran"] = champs["ecran"] or ""
    if champs.get("support") in SUPPORTS:
        m["support"] = champs["support"]
    for k in [k for k, v in m.items() if v == ""]:
        m.pop(k)
    _ecrire_index(racine, idx)
    return m


def supprimer(racine: Path, mid: str) -> None:
    idx = lire_index(racine)
    m = next((x for x in idx["maquettes"] if x["id"] == mid), None)
    if not m:
        raise ErreurAvantProjet("Maquette inconnue.")
    f = Path(racine) / DOSSIER / "maquettes" / m["fichier"]
    if f.exists():
        f.unlink()
    idx["maquettes"] = [x for x in idx["maquettes"] if x["id"] != mid]
    _ecrire_index(racine, idx)


def brief_claude_design(racine: Path, ecrans: list[str] | None = None) -> str:
    """Le brief à coller dans Claude Design : contexte, direction artistique, écrans, données. Markdown."""
    p = charger(racine)
    mb = lire_moodboard(racine) or {}
    piste = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    cahier = lire_cahier(racine) or {}
    secs = {s["id"]: s.get("contenu", "") for s in cahier.get("sections") or []}
    choisis = [e for e in (ecrans or list(p.ecrans)) if e in p.ecrans]
    l = [f"# Maquettes : {p.meta.get('nom', 'projet')}", "",
         "Maquettes moyenne fidélité d'une application, à montrer au client. Libellés réels en français, données fictives "
         "cohérentes d'un écran à l'autre, pas de Lorem ipsum.", ""]
    for cle, titre in (("contexte", "Contexte"), ("objectifs", "Objectifs"), ("utilisateurs", "Utilisateurs")):
        if secs.get(cle):
            l += [f"## {titre}", secs[cle], ""]
    if piste:
        l += ["## Direction artistique", f"**{piste['nom']}** : {piste['parti_pris']}", ""]
        l += [f"- {c['nom']} `{c['hex']}` : {c['role']}" + (f", {c['usage']}" if c.get("usage") else "") for c in piste["couleurs"]]
        l += ["", f"- Typographie : {piste['typo']['titres']} (titres), {piste['typo']['texte']} (texte)",
              f"- Rayon {piste.get('formes', {}).get('rayon', 8)} px, ombre {piste.get('formes', {}).get('ombre', 'legere')}",
              f"- Densité {piste['dials']['densite']}/10, animation {piste['dials']['motion']}/10, variance {piste['dials']['variance']}/10", ""]
        if piste.get("principes"):
            l += ["Principes :"] + [f"- {x}" for x in piste["principes"]] + [""]
        if piste.get("ergonomie"):
            l += ["Ergonomie :"] + [f"- {x}" for x in piste["ergonomie"]] + [""]
    if mb.get("charte_client"):
        l += ["## Charte du client", mb["charte_client"], ""]
    l += ["## Écrans", ""]
    for eid in choisis:
        l += [f"### {p.ecrans[eid]['nom']}", _description_ecran(p, eid).split("\n", 1)[-1] if "\n" in _description_ecran(p, eid) else "", ""]
    donnees = lire_index(racine)["donnees"]
    if donnees:
        l += ["## Jeu de données fictives", donnees, ""]
    l += ["Export attendu : HTML (un fichier par écran), à réimporter dans Watson."]
    return "\n".join(l).replace("—", ",").replace("–", "-")
