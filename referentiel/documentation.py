"""Documentation utilisateur, tirée de la base.

Un guide par projet, pour les utilisateurs du produit (pas pour l'équipe) : Watson propose le sommaire selon le
découpage choisi (par parcours, par écran, par rôle, par module), puis rédige chaque rubrique en mode d'emploi :
« vous », verbes d'action, libellés réels entre « », étapes numérotées, règles utiles traduites en phrases simples,
aucun code interne. Chaque rubrique garde l'empreinte des éléments de la base dont elle vient : quand la base bouge,
elle est signalée à mettre à jour.

Rangé dans `documentation/guide.yaml` (réglages, sommaire, état des rubriques) et `documentation/pages/<id>.md`.
L'export produit une page HTML autonome dans Téléchargements, avec les captures des maquettes.
"""

from __future__ import annotations

import asyncio
import base64
import html
import json
import re
import time
from pathlib import Path

from ._vendor import yaml
from .chargement import charger
from .ecriture import aujourdhui, dump
from .versions import _empreinte

DECOUPAGES = {"parcours": "Par tâche à accomplir", "role": "Par profil d'utilisateur", "ecran": "Par écran", "module": "Par grande fonction"}
AUDIENCES = {"utilisateur": "Utilisateurs finaux", "administrateur": "Administrateurs et utilisateurs avancés"}
STATUTS = {"a_rediger": "À rédiger", "brouillon": "Brouillon", "relue": "Relue"}


class ErreurDocumentation(Exception):
    """Erreur présentable telle quelle."""


def _propre(x):
    return json.loads(re.sub(" *\u2014 *", ", ", json.dumps(x, ensure_ascii=False, default=str)).replace("\u2013", "-"))


def _dossier(racine: Path) -> Path:
    return Path(racine) / "documentation"


def _f_page(racine: Path, rid: str) -> Path:
    if not re.match(r"^[a-z0-9-]{1,60}$", rid or ""):
        raise ErreurDocumentation("Rubrique inconnue.")
    return _dossier(racine) / "pages" / f"{rid}.md"


def lire_guide(racine: Path) -> dict | None:
    f = _dossier(racine) / "guide.yaml"
    return _propre(yaml.safe_load(f.read_text(encoding="utf-8"))) if f.exists() else None


def _ecrire_guide(racine: Path, g: dict):
    _dossier(racine).mkdir(exist_ok=True)
    (_dossier(racine) / "guide.yaml").write_text("# Guide utilisateur (tenu dans Watson).\n" + dump(_propre(g)), encoding="utf-8")


def _element(p, ident: str) -> dict | None:
    for col in (p.entites, p.listes, p.acteurs, p.regles, p.ecrans, p.scenarios, p.cas_usage):
        if ident in col:
            return col[ident]
    return None


def _nom(p, ident: str) -> str:
    e = _element(p, ident) or {}
    return e.get("titre") or e.get("nom") or ident


def vue(racine: Path) -> dict:
    p = charger(racine)
    g = lire_guide(racine)
    pages = []
    for r in (g or {}).get("rubriques") or []:
        f = _f_page(racine, r["id"])
        raisons = []
        for s in r.get("sources_lues") or []:
            el = _element(p, s["id"])
            if el is None:
                raisons.append(f"{s.get('nom', s['id'])} a disparu de la base")
            elif _empreinte(el) != s.get("empreinte"):
                raisons.append(f"« {_nom(p, s['id'])} » a changé depuis la rédaction")
        pages.append({**r, "texte": f.read_text(encoding="utf-8") if f.exists() else None, "a_mettre_a_jour": raisons,
                      "sources_noms": [{"id": i, "nom": _nom(p, i)} for i in r.get("sources") or [] if _element(p, i) is not None]})
    return {"guide": g, "rubriques": pages, "decoupages": DECOUPAGES, "audiences": AUDIENCES, "statuts": STATUTS,
            "compteurs": {"total": len(pages), "redigees": sum(1 for x in pages if x["texte"]),
                          "a_mettre_a_jour": sum(1 for x in pages if x["texte"] and x["a_mettre_a_jour"])}}


# ----------------------------------------------------------------- le sommaire

SCHEMA_SOMMAIRE = {"type": "object", "required": ["titre", "introduction", "rubriques"], "properties": {
    "titre": {"type": "string"}, "introduction": {"type": "string", "description": "À quoi sert le produit et pour qui, en deux ou trois phrases, au « vous »"},
    "rubriques": {"type": "array", "items": {"type": "object", "required": ["titre", "objectif", "sources"], "properties": {
        "titre": {"type": "string", "description": "Orienté tâche, à l'infinitif : « Signaler un litige »"},
        "partie": {"type": "string", "description": "La partie du guide qui la regroupe (un rôle, un module)"},
        "objectif": {"type": "string", "description": "Ce que l'utilisateur saura faire"},
        "sources": {"type": "array", "items": {"type": "string"}, "description": "Repères exacts des éléments de la base dont la rubrique vient"}}}}}}


def _slug(t: str) -> str:
    import unicodedata

    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()).strip("-")[:50] or "rubrique"


def _claude(systeme: str, message, requete=None) -> dict:
    from .alimentation import ErreurAlimentation, _lire_par_claude

    try:
        return _propre(asyncio.run(_lire_par_claude(systeme, message, requete)))
    except ErreurAlimentation as e:
        raise ErreurDocumentation(str(e)) from e


def proposer_sommaire(racine: Path, decoupage: str, audience: str, demande: str = "", requete=None) -> dict:
    from . import methode
    from .assistant import construire_contexte

    if decoupage not in DECOUPAGES or audience not in AUDIENCES:
        raise ErreurDocumentation("Découpage ou public inconnu.")
    contexte, _ = construire_contexte(racine)
    systeme = f"""Tu prépares le sommaire du guide utilisateur d'un produit, à partir de sa base de connaissance métier.
Public : {AUDIENCES[audience]}. Découpage : {DECOUPAGES[decoupage]}.

Règles :
1. Une rubrique par tâche que l'utilisateur accomplit vraiment (d'après les scénarios, les écrans et les actions du
   cycle de vie), avec un titre orienté tâche à l'infinitif, jamais un nom d'écran ou un code.
2. Pour chaque rubrique, les repères exacts des éléments de la base dont elle vient (scénarios, écrans, règles,
   objets). Rien qui n'existe pas dans la base.
3. {"Pour des utilisateurs finaux : pas de paramétrage, pas de droits détaillés, pas de règles internes." if audience == "utilisateur" else "Pour des administrateurs : paramétrage, droits et cas avancés compris."}
4. Le glossaire n'est pas une rubrique : Watson le fait à part.
{f"Demande de la personne : {demande}" if demande else ""}

{methode.consignes("documentation")}

FORMAT DE SORTIE : uniquement un objet JSON, sans texte autour ni bloc de code, conforme à ce schéma :
{json.dumps(SCHEMA_SOMMAIRE, ensure_ascii=False)}
"""
    r = _claude(systeme, f"# Base du produit\n{contexte}", requete)
    p = charger(racine)
    ancien = {x["id"]: x for x in (lire_guide(racine) or {}).get("rubriques") or []}
    rubriques, vus = [], set()
    for x in r.get("rubriques") or []:
        rid = _slug(x["titre"])
        while rid in vus:
            rid += "-2"
        vus.add(rid)
        garde = ancien.get(rid) or {}
        rubriques.append({"id": rid, "titre": x["titre"], "partie": x.get("partie") or "", "objectif": x.get("objectif") or "",
                          "sources": [s for s in x.get("sources") or [] if _element(p, s) is not None],
                          **{k: garde[k] for k in ("statut", "sources_lues", "redigee_le") if k in garde}})
        rubriques[-1].setdefault("statut", "a_rediger")
    g = {"titre": r["titre"], "introduction": r["introduction"], "decoupage": decoupage, "audience": audience,
         "rubriques": rubriques, "sommaire_le": aujourdhui()}
    _ecrire_guide(racine, g)
    return vue(racine)


def modifier_guide(racine: Path, champs: dict) -> dict:
    g = lire_guide(racine)
    if not g:
        raise ErreurDocumentation("Le guide n'a pas encore de sommaire.")
    for k in ("titre", "introduction"):
        if k in champs:
            g[k] = str(champs[k] or "").strip()
    if isinstance(champs.get("rubriques"), list):  # ordre, titres, retraits, ajouts à la main
        actuelles = {x["id"]: x for x in g["rubriques"]}
        nouvelles = []
        for x in champs["rubriques"]:
            titre = str(x.get("titre") or "").strip()
            if not titre:
                continue
            rid = x.get("id") if x.get("id") in actuelles else _slug(titre)
            base = actuelles.get(rid, {"id": rid, "sources": [], "statut": "a_rediger"})
            nouvelles.append({**base, "titre": titre, "partie": str(x.get("partie", base.get("partie", "")) or ""),
                              "objectif": str(x.get("objectif", base.get("objectif", "")) or "")})
        for rid in set(actuelles) - {x["id"] for x in nouvelles}:
            _f_page(racine, rid).unlink(missing_ok=True)
        g["rubriques"] = nouvelles
    _ecrire_guide(racine, g)
    return vue(racine)


# ----------------------------------------------------------------- les rubriques

SCHEMA_PAGE = {"type": "object", "required": ["texte"], "properties": {
    "texte": {"type": "string", "description": "La rubrique en Markdown : titre ##, une phrase de contexte, étapes numérotées, encadrés « > **Astuce** » ou « > **Attention** »"},
    "ecrans": {"type": "array", "items": {"type": "string"}, "description": "Repères des écrans à illustrer d'une capture, dans l'ordre"},
    "a_confirmer": {"type": "array", "items": {"type": "string"}, "description": "Ce qui manque pour qu'une étape soit utilisable"}}}


def _matiere(p, ids: list[str]) -> str:
    l = []
    for i in ids:
        el = _element(p, i)
        if el is not None:
            l.append(f"## {i} : {_nom(p, i)}\n{json.dumps(el, ensure_ascii=False, default=str)[:6000]}")
    return "\n\n".join(l)


def rediger_rubrique(racine: Path, rid: str, demande: str = "", requete=None) -> dict:
    from . import methode
    from .assistant import construire_contexte

    g = lire_guide(racine)
    r = next((x for x in (g or {}).get("rubriques") or [] if x["id"] == rid), None)
    if not r:
        raise ErreurDocumentation("Rubrique inconnue.")
    p = charger(racine)
    contexte, _ = construire_contexte(racine)
    autres = "\n".join(f"- {x['titre']} (lien : #{x['id']})" for x in g["rubriques"] if x["id"] != rid)
    systeme = f"""Tu rédiges une rubrique du guide utilisateur « {g['titre']} », pour {AUDIENCES[g['audience']].lower()}.
Rubrique : {r['titre']}. Objectif : {r.get('objectif', '')}.

Règles :
1. Au « vous », au présent, verbes d'action, phrases courtes. Une phrase de contexte (quand et pourquoi), puis les
   étapes numérotées : une étape, une action de l'utilisateur et ce qu'il voit ensuite.
2. Les libellés réels de l'interface (boutons, champs, menus, statuts) entre « », tels que la base les nomme.
3. Une règle qui change ce que l'utilisateur voit ou peut faire devient une phrase simple ; le reste est omis.
   Aucun code ni repère interne, aucune mention de spec, de version ou de lot.
4. Les droits en une phrase quand ils comptent (« Seul le transporteur peut… »). Une astuce ou un risque en encadré.
5. Fidèle à la base : rien d'inventé. Ce qui manque pour qu'une étape soit utilisable va dans « a_confirmer ».
6. Pour renvoyer à une autre rubrique : [son titre](#son-lien). Autres rubriques du guide :
{autres or "(aucune)"}
{f"Demande de la personne : {demande}" if demande else ""}

{methode.consignes("documentation")}

FORMAT DE SORTIE : uniquement un objet JSON, sans texte autour ni bloc de code, conforme à ce schéma :
{json.dumps(SCHEMA_PAGE, ensure_ascii=False)}
"""
    message = f"# Éléments de la base dont vient la rubrique\n{_matiere(p, r.get('sources') or []) or '(aucun : appuie-toi sur la base)'}\n\n# Base du produit\n{contexte}"
    debut = time.time()
    res = _claude(systeme, message, requete)
    texte = str(res.get("texte") or "").strip()
    if not texte:
        raise ErreurDocumentation("Watson n'a rien rédigé.")
    _f_page(racine, rid).parent.mkdir(parents=True, exist_ok=True)
    _f_page(racine, rid).write_text(texte + "\n", encoding="utf-8")
    r.update({"statut": "brouillon", "redigee_le": aujourdhui(), "duree_s": round(time.time() - debut),
              "ecrans": [e for e in res.get("ecrans") or [] if e in p.ecrans], "a_confirmer": res.get("a_confirmer") or [],
              "sources_lues": [{"id": i, "nom": _nom(p, i), "empreinte": _empreinte(_element(p, i))} for i in r.get("sources") or [] if _element(p, i) is not None]})
    _ecrire_guide(racine, g)
    return vue(racine)


def enregistrer_rubrique(racine: Path, rid: str, texte: str | None = None, statut: str | None = None) -> dict:
    g = lire_guide(racine)
    r = next((x for x in (g or {}).get("rubriques") or [] if x["id"] == rid), None)
    if not r:
        raise ErreurDocumentation("Rubrique inconnue.")
    if texte is not None:
        _f_page(racine, rid).parent.mkdir(parents=True, exist_ok=True)
        _f_page(racine, rid).write_text(_propre(str(texte)).strip() + "\n", encoding="utf-8")
        r.setdefault("redigee_le", aujourdhui())
        if r.get("statut") == "a_rediger":
            r["statut"] = "brouillon"
    if statut in STATUTS and statut != "a_rediger":
        r["statut"] = statut
        if statut == "relue":  # relue sur la base actuelle
            p = charger(racine)
            r["sources_lues"] = [{"id": i, "nom": _nom(p, i), "empreinte": _empreinte(_element(p, i))} for i in r.get("sources") or [] if _element(p, i) is not None]
    _ecrire_guide(racine, g)
    return vue(racine)


SCHEMA_GLOSSAIRE = {"type": "object", "required": ["termes"], "properties": {"termes": {"type": "array", "items": {
    "type": "object", "required": ["terme", "definition"], "properties": {"terme": {"type": "string"}, "definition": {"type": "string"}}}}}}


def rediger_glossaire(racine: Path, requete=None) -> dict:
    from . import methode
    from .assistant import construire_contexte
    from .studio import lire_secteur

    g = lire_guide(racine)
    if not g:
        raise ErreurDocumentation("Le guide n'a pas encore de sommaire.")
    contexte, _ = construire_contexte(racine)
    systeme = f"""Tu rédiges le glossaire du guide utilisateur « {g['titre']} » : les termes métier que l'utilisateur
rencontre à l'écran (objets, statuts, valeurs de listes), chacun expliqué en une phrase simple, de son point de vue,
sans liste de champs ni code. Par ordre alphabétique. Rien qui ne soit dans la base ou la fiche secteur.

{methode.consignes("documentation")}

FORMAT DE SORTIE : uniquement un objet JSON, sans texte autour ni bloc de code, conforme à ce schéma :
{json.dumps(SCHEMA_GLOSSAIRE, ensure_ascii=False)}
"""
    fiche = lire_secteur(racine)
    r = _claude(systeme, f"# Base du produit\n{contexte}" + (f"\n\n# Fiche secteur\n{fiche[:10_000]}" if fiche else ""), requete)
    g["glossaire"] = sorted(r.get("termes") or [], key=lambda t: t["terme"].lower())
    _ecrire_guide(racine, g)
    return vue(racine)


# ----------------------------------------------------------------- export

def _md_html(md: str) -> str:
    """Markdown simple (titres, listes, encadrés, gras, italique, liens internes) vers HTML."""
    def enligne(t: str) -> str:
        t = html.escape(t)
        t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
        t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", t)
        return re.sub(r"\[([^\]]+)\]\((#[a-z0-9-]+)\)", r'<a href="\2">\1</a>', t)

    out, liste, encadre = [], None, []

    def fermer():
        nonlocal liste
        if liste:
            out.append(f"</{liste}>")
            liste = None

    def vider_encadre():
        if encadre:
            classe = "attention" if re.search(r"attention|important", encadre[0], re.I) else "astuce"
            out.append(f'<aside class="{classe}">' + "<br>".join(enligne(x) for x in encadre) + "</aside>")
            encadre.clear()

    for ligne in md.splitlines():
        s = ligne.rstrip()
        if s.startswith(">"):
            fermer()
            encadre.append(s.lstrip("> ").strip())
            continue
        vider_encadre()
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            fermer()
            n = min(len(m.group(1)) + 1, 5)
            out.append(f"<h{n}>{enligne(m.group(2))}</h{n}>")
        elif re.match(r"^\d+[.)]\s+", s):
            if liste != "ol":
                fermer()
                out.append("<ol>")
                liste = "ol"
            item = re.sub(r"^\d+[.)]\s+", "", s)
            out.append(f"<li>{enligne(item)}</li>")
        elif re.match(r"^[-*]\s+", s):
            if liste != "ul":
                fermer()
                out.append("<ul>")
                liste = "ul"
            out.append(f"<li>{enligne(s[2:].strip())}</li>")
        elif not s.strip():
            fermer()
        else:
            fermer()
            out.append(f"<p>{enligne(s)}</p>")
    fermer()
    vider_encadre()
    return "\n".join(out)


def exporter(racine: Path, images: dict[str, str] | None = None) -> dict:
    """images : {repère d'écran: capture en data URL PNG}, envoyées par l'application."""
    from .proposition import _destination

    v = vue(racine)
    g = v["guide"]
    if not g:
        raise ErreurDocumentation("Le guide n'a pas encore de sommaire.")
    pages = [r for r in v["rubriques"] if r["texte"]]
    if not pages:
        raise ErreurDocumentation("Aucune rubrique rédigée.")
    images = images or {}
    imgs = {}
    for k, d in images.items():
        m = re.match(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$", str(d))
        if m and re.match(r"^[A-Za-z0-9_-]+$", k) and len(m.group(2)) < 8_000_000:
            base64.b64decode(m.group(2), validate=True)
            imgs[k] = str(d)
    p = charger(racine)
    sommaire, corps, partie = [], [], None
    ecrites = {r["id"] for r in pages}
    for r in pages:
        if r.get("partie") and r["partie"] != partie:
            partie = r["partie"]
            sommaire.append(f'<li class="partie">{html.escape(partie)}</li>')
        sommaire.append(f'<li><a href="#{r["id"]}">{html.escape(r["titre"])}</a></li>')
        captures = "".join(f'<figure><img src="{imgs[e]}" alt="{html.escape(_nom(p, e))}"><figcaption>{html.escape(_nom(p, e))}</figcaption></figure>'
                           for e in r.get("ecrans") or [] if e in imgs)
        texte = re.sub(r"^#{1,2}\s+.*\n", "", r["texte"], count=1) if r["texte"].lstrip().startswith("#") else r["texte"]
        rendu = re.sub(r'<a href="#([a-z0-9-]+)">([^<]*)</a>', lambda m: m.group(0) if m.group(1) in ecrites else m.group(2), _md_html(texte))
        corps.append(f'<section id="{r["id"]}"><h2>{html.escape(r["titre"])}</h2>{rendu}{captures}</section>')
    if g.get("glossaire"):
        sommaire.append('<li><a href="#glossaire">Glossaire</a></li>')
        corps.append('<section id="glossaire"><h2>Glossaire</h2><dl>' + "".join(
            f"<dt>{html.escape(t['terme'])}</dt><dd>{html.escape(t['definition'])}</dd>" for t in g["glossaire"]) + "</dl></section>")
    page = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(g['titre'])}</title><style>
body{{margin:0;font-family:Calibri,'Segoe UI',system-ui,sans-serif;color:#2B2F36;background:#F6F7F9;line-height:1.55}}
header{{background:#1F2A44;color:#fff;padding:56px 8vw 40px}}header h1{{margin:0 0 12px;font-size:36px}}header p{{margin:0;max-width:760px;color:#D5DAE5}}
.cadre{{display:grid;grid-template-columns:260px 1fr;gap:40px;padding:32px 8vw 80px}}
nav ol{{list-style:none;padding:0;margin:0;position:sticky;top:24px}}nav li{{margin:6px 0}}nav li.partie{{margin-top:16px;font-weight:700;color:#5B6475;font-size:13px;text-transform:uppercase;letter-spacing:.04em}}
nav a{{color:#1F2A44;text-decoration:none}}nav a:hover{{text-decoration:underline}}
section{{background:#fff;border-radius:14px;padding:28px 32px;margin-bottom:20px;box-shadow:0 1px 2px rgba(0,0,0,.05)}}
h2{{margin-top:0;color:#1F2A44}}h3,h4{{color:#1F2A44}}ol li{{margin:6px 0}}a{{color:#2547A6}}
aside{{border-radius:10px;padding:12px 16px;margin:14px 0}}aside.astuce{{background:#EEF3FF;border-left:4px solid #2547A6}}aside.attention{{background:#FFF4E5;border-left:4px solid #C2410C}}
figure{{margin:18px 0}}figure img{{max-width:100%;border-radius:10px;border:1px solid #E3E6EB}}figcaption{{font-size:13px;color:#5B6475}}
dt{{font-weight:700;margin-top:12px}}dd{{margin:2px 0 0}}footer{{text-align:center;color:#8A93A3;font-size:13px;padding-bottom:40px}}
@media (max-width:800px){{.cadre{{grid-template-columns:1fr}}nav ol{{position:static}}}}
@media print{{nav{{display:none}}.cadre{{display:block}}section{{box-shadow:none;break-inside:avoid-page}}}}
</style></head><body><header><h1>{html.escape(g['titre'])}</h1><p>{html.escape(g.get('introduction', ''))}</p></header>
<div class="cadre"><nav><ol>{''.join(sommaire)}</ol></nav><main>{''.join(corps)}</main></div>
<footer>Mis à jour le {aujourdhui().split('-')[2]}/{aujourdhui().split('-')[1]}/{aujourdhui().split('-')[0]}</footer></body></html>"""
    f = _destination(g["titre"], "html")
    f.write_text(page, encoding="utf-8")
    return {"chemin": str(f), "nom": f.name, "rubriques": len(pages), "captures": len(imgs)}
