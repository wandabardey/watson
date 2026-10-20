"""Génération des sorties : diagrammes Mermaid et spécification HTML consultable."""

from __future__ import annotations


import html
import re
from datetime import date
from pathlib import Path

from .chargement import Projet
from .controles import ALERTE, ERREUR, TROU, Trou, couverture, derniere_modification


def _e(texte) -> str:
    return html.escape(str(texte))


def _mid(ident: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", ident)


def mermaid_entite(p: Projet, ent: dict, trous: list[Trou]) -> str:
    ouverts = {
        e for t in trous if t.statut == "ouvert" and t.gravite != ALERTE and t.entite == ent["id"] for e in t.elements
    }
    lignes = ["stateDiagram-v2"]
    for s in ent["statuts"]:
        lignes.append(f'    state "{s["nom"]}" as {_mid(s["id"])}')
    lignes.append(f"    [*] --> {_mid(ent['statut_initial'])}")
    for tr in ent["transitions"]:
        regles = ", ".join(tr.get("regles", [])) or "aucune règle"
        lignes.append(f"    {_mid(tr['de'])} --> {_mid(tr['vers'])} : {tr['nom']} ({regles})")
    for s in ent["statuts"]:
        if s.get("final"):
            lignes.append(f"    {_mid(s['id'])} --> [*]")
    lignes.append("    classDef trou fill:#fff1e6,stroke:#d9480f,stroke-width:2px,color:#000")
    for s in ent["statuts"]:
        if s["id"] in ouverts:
            lignes.append(f"    class {_mid(s['id'])} trou")
    return "\n".join(lignes)


def ecrire_mermaid(p: Projet, trous: list[Trou], sortie: Path) -> list[Path]:
    sortie.mkdir(parents=True, exist_ok=True)
    fichiers = []
    for ent in p.entites.values():
        f = sortie / f"{ent['id']}.mmd"
        f.write_text(mermaid_entite(p, ent, trous) + "\n", encoding="utf-8")
        fichiers.append(f)
    return fichiers


# ---------------------------------------------------------------- HTML

CSS = """
:root { --fond:#fafaf9; --carte:#ffffff; --texte:#1c1917; --doux:#57534e; --bord:#e7e5e4;
  --accent:#1d4ed8; --erreur:#b91c1c; --trou:#c2410c; --alerte:#a16207; --ok:#15803d; --code:#f5f5f4; }
@media (prefers-color-scheme: dark) { :root { --fond:#1c1917; --carte:#262220; --texte:#f5f5f4;
  --doux:#a8a29e; --bord:#3f3a36; --accent:#93b4ff; --erreur:#f87171; --trou:#fb923c; --alerte:#facc15;
  --ok:#4ade80; --code:#33302d; } }
* { box-sizing:border-box; }
body { margin:0; font:15px/1.55 -apple-system, "Segoe UI", Inter, sans-serif; background:var(--fond); color:var(--texte); }
.page { display:grid; grid-template-columns:240px 1fr; min-height:100vh; }
nav { position:sticky; top:0; height:100vh; overflow:auto; padding:24px 16px; border-right:1px solid var(--bord); }
nav a { display:block; color:var(--doux); text-decoration:none; padding:3px 8px; border-radius:6px; font-size:14px; }
nav a:hover { background:var(--code); color:var(--texte); }
nav .groupe { margin:16px 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--doux); }
main { padding:32px 40px 80px; max-width:1100px; }
h1 { font-size:26px; margin:0 0 4px; } h2 { font-size:20px; margin:48px 0 12px; padding-top:8px; border-top:1px solid var(--bord); }
h3 { font-size:16px; margin:24px 0 8px; } .sous { color:var(--doux); margin:0 0 24px; }
.tuiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:16px 0; }
.tuile { background:var(--carte); border:1px solid var(--bord); border-radius:10px; padding:12px 14px; }
.tuile b { display:block; font-size:24px; } .tuile span { color:var(--doux); font-size:13px; }
table { width:100%; border-collapse:collapse; background:var(--carte); border:1px solid var(--bord); border-radius:10px; overflow:hidden; margin:8px 0 16px; font-size:14px; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--bord); vertical-align:top; }
th { font-weight:600; background:var(--code); }
a.id { color:var(--accent); text-decoration:none; } a.id:hover { text-decoration:underline; }
code, .id { font-family:ui-monospace, Menlo, monospace; font-size:12.5px; background:var(--code); padding:1px 5px; border-radius:4px; white-space:nowrap; }
.carte { background:var(--carte); border:1px solid var(--bord); border-radius:10px; padding:16px 18px; margin:12px 0; }
.badge { display:inline-block; font-size:12px; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid currentColor; }
.erreur { color:var(--erreur); } .trou { color:var(--trou); } .alerte { color:var(--alerte); } .ok { color:var(--ok); } .doux { color:var(--doux); }
.question { margin-top:4px; color:var(--doux); font-size:13.5px; } .question::before { content:"Question : "; font-weight:600; }
.justif { margin-top:4px; color:var(--doux); font-size:13.5px; font-style:italic; }
.diagramme { background:#fff; border:1px solid var(--bord); border-radius:10px; padding:12px; overflow-x:auto; }
.jauge { height:6px; background:var(--bord); border-radius:3px; margin-top:6px; } .jauge i { display:block; height:100%; border-radius:3px; background:var(--ok); }
@media (max-width: 800px) { .page { grid-template-columns:1fr; } nav { position:static; height:auto; border-right:0; border-bottom:1px solid var(--bord); } main { padding:20px 16px; } }
"""

LIBELLES_GRAVITE = {ERREUR: "Erreur", TROU: "Trou", ALERTE: "À vérifier"}
LIBELLES_STATUT_TROU = {"hors_perimetre": "Hors périmètre (assumé)", "impossible_metier": "Impossible métier"}
LIBELLES_STATUT_REGLE = {"validee": ("Validée", "ok"), "proposee": ("Proposée", "alerte"), "obsolete": ("Obsolète", "doux")}


def _lien(p: Projet, ident: str) -> str:
    return f'<a class="id" href="#{_e(ident)}">{_e(ident)}</a>'


def _nom_acteur(p: Projet, aid: str) -> str:
    return _e(p.acteurs.get(aid, {}).get("nom", aid))


def _valeur(v) -> str:
    return "oui" if v is True else "non" if v is False else _e(v)


def html_trous(trous: list[Trou]) -> str:
    ouverts = [t for t in trous if t.statut == "ouvert"]
    traites = [t for t in trous if t.statut != "ouvert"]
    morceaux = []
    if ouverts:
        lignes = "".join(
            f'<tr><td><span class="badge {t.gravite}">{LIBELLES_GRAVITE[t.gravite]}</span></td>'
            f"<td>{_e(t.message)}<div class=\"question\">{_e(t.question)}</div>"
            f'<div class="doux" style="font-size:12px;margin-top:4px"><code>{_e(t.id)}</code></div></td></tr>'
            for t in ouverts
        )
        morceaux.append(f"<table><tr><th style=\"width:110px\">Gravité</th><th>Constat et question à poser</th></tr>{lignes}</table>")
    else:
        morceaux.append('<p class="ok">Aucun trou ouvert.</p>')
    if traites:
        lignes = "".join(
            f"<tr><td>{_e(LIBELLES_STATUT_TROU.get(t.statut, t.statut))}</td><td>{_e(t.message)}"
            f'<div class="justif">{_e(t.justification or "")}</div></td></tr>'
            for t in traites
        )
        morceaux.append(f"<h3>Trous traités</h3><table><tr><th style=\"width:190px\">Décision</th><th>Constat et justification</th></tr>{lignes}</table>")
    return "".join(morceaux)


def html_regle(p: Projet, rg: dict) -> str:
    libelle, classe = LIBELLES_STATUT_REGLE[rg["statut"]]
    morceaux = [
        f'<div class="carte" id="{_e(rg["id"])}"><div><code>{_e(rg["id"])}</code> '
        f'<b>{_e(rg["titre"])}</b> <span class="badge {classe}">{libelle}</span> '
        f'<span class="doux" style="font-size:13px">{_e(rg["type"].replace("_", " "))}</span></div>',
        f"<p>{_e(rg['enonce'])}</p>",
    ]
    if rg.get("lignes"):
        conds = [c["attribut"] for c in rg.get("conditions", [])]
        tete = "".join(f"<th>{_e(c)}</th>" for c in conds) + "<th>Résultat</th>"
        corps = ""
        for l in rg["lignes"]:
            cellules = "".join(f"<td>{_valeur(l['si'][c]) if c in l['si'] else '<span class=doux>indifférent</span>'}</td>" for c in conds)
            tr = p.transitions.get(l["alors"])
            res = f"{_e(tr[1]['nom'])} {_lien(p, l['alors'])}" if tr else _e(l["alors"])
            if l.get("note"):
                res += f'<div class="doux" style="font-size:13px">{_e(l["note"])}</div>'
            corps += f"<tr>{cellules}<td>{res}</td></tr>"
        morceaux.append(f"<table><tr>{tete}</tr>{corps}</table>")
    infos = []
    if rg.get("source"):
        infos.append(f"Source : {_e(rg['source'])}")
    if rg.get("remplace"):
        infos.append(f"Remplace {_lien(p, rg['remplace'])}")
    remplacee = [r["id"] for r in p.regles.values() if r.get("remplace") == rg["id"]]
    if remplacee:
        infos.append("Remplacée par " + ", ".join(_lien(p, r) for r in remplacee))
    if infos:
        morceaux.append(f'<p class="doux" style="font-size:13px">{" · ".join(infos)}</p>')
    if rg.get("historique"):
        lignes = "".join(
            f"<tr><td>{_e(h['date'])}</td><td>{_e(h['auteur'])}</td><td>{_e(h['changement'])}"
            + (f'<div class="doux">{_e(h["raison"])}</div>' if h.get("raison") else "")
            + "</td></tr>"
            for h in sorted(rg["historique"], key=lambda h: h["date"], reverse=True)
        )
        morceaux.append(f"<details><summary class=\"doux\">Historique ({len(rg['historique'])})</summary><table><tr><th>Date</th><th>Auteur</th><th>Changement</th></tr>{lignes}</table></details>")
    morceaux.append("</div>")
    return "".join(morceaux)


def generer_html(p: Projet, trous: list[Trou]) -> str:
    cov = couverture(p, trous)
    meta = p.meta
    ouverts = [t for t in trous if t.statut == "ouvert"]
    nb = {g: sum(1 for t in ouverts if t.gravite == g) for g in (ERREUR, TROU, ALERTE)}

    nav = ['<div class="groupe">Projet</div><a href="#synthese">Synthèse</a><a href="#trous">Trous et questions</a><a href="#glossaire">Glossaire</a><a href="#acteurs">Acteurs</a>']
    nav.append('<div class="groupe">Entités</div>' + "".join(f'<a href="#{_e(e)}">{_e(d["nom"])}</a>' for e, d in p.entites.items()))
    nav.append('<div class="groupe">Cas d\'usage</div>' + "".join(f'<a href="#{_e(u)}">{_e(d["nom"])}</a>' for u, d in p.cas_usage.items()))
    nav.append('<div class="groupe">Référentiel</div><a href="#regles">Règles</a><a href="#ecrans">Écrans</a>')

    corps = [f'<h1>{_e(meta.get("nom", "Projet"))}</h1><p class="sous">{_e(meta.get("description", ""))} · Généré le {date.today().isoformat()}</p>']

    tuiles = [
        f'<div class="tuile"><b class="erreur">{nb[ERREUR]}</b><span>erreurs de cohérence</span></div>',
        f'<div class="tuile"><b class="trou">{nb[TROU]}</b><span>trous à combler</span></div>',
        f'<div class="tuile"><b class="alerte">{nb[ALERTE]}</b><span>points à vérifier</span></div>',
    ]
    for c in cov.values():
        tuiles.append(
            f'<div class="tuile"><b>{c["taux"]} %</b><span>{_e(c["nom"])} : {c["complets"]}/{c["elements"]} statuts et transitions sans trou</span>'
            f'<div class="jauge"><i style="width:{c["taux"]}%"></i></div></div>'
        )
    corps.append(f'<h2 id="synthese">Synthèse</h2><div class="tuiles">{"".join(tuiles)}</div>')
    corps.append(f'<h2 id="trous">Trous et questions</h2>{html_trous(trous)}')

    gloss = "".join(f"<tr><td><b>{_e(g['terme'])}</b></td><td>{_e(g['definition'])}</td></tr>" for g in meta.get("glossaire", []))
    corps.append(f'<h2 id="glossaire">Glossaire</h2><table><tr><th style="width:200px">Terme</th><th>Définition</th></tr>{gloss}</table>')

    act = "".join(f'<tr id="{_e(a)}"><td><code>{_e(a)}</code></td><td><b>{_e(d["nom"])}</b></td><td>{_e(d.get("description", ""))}</td></tr>' for a, d in p.acteurs.items())
    corps.append(f'<h2 id="acteurs">Acteurs</h2><table><tr><th>Id</th><th>Nom</th><th>Rôle</th></tr>{act}</table>')

    for eid, ent in p.entites.items():
        corps.append(f'<h2 id="{_e(eid)}">{_e(ent["nom"])} <code>{_e(eid)}</code></h2><p>{_e(ent.get("description", ""))}</p>')
        corps.append(f'<div class="diagramme"><pre class="mermaid">{_e(mermaid_entite(p, ent, trous))}</pre></div>')
        corps.append('<p class="doux" style="font-size:13px">Les statuts encadrés en orange portent un trou ouvert.</p>')
        if ent.get("attributs"):
            attrs = "".join(
                f"<tr><td><code>{_e(a['nom'])}</code></td><td>{_e(a['type'])}</td><td>{_e(', '.join(a.get('valeurs', [])))}</td><td>{_e(a.get('description', ''))}</td></tr>"
                for a in ent["attributs"]
            )
            corps.append(f"<h3>Attributs</h3><table><tr><th>Nom</th><th>Type</th><th>Valeurs</th><th>Description</th></tr>{attrs}</table>")
        stat = "".join(
            f'<tr><td><code>{_e(s["id"])}</code></td><td>{_e(s["nom"])}{" <span class=doux>(initial)</span>" if s["id"] == ent["statut_initial"] else ""}{" <span class=doux>(final)</span>" if s.get("final") else ""}</td><td>{_e(s.get("description", ""))}</td></tr>'
            for s in ent["statuts"]
        )
        corps.append(f"<h3>Statuts</h3><table><tr><th>Id</th><th>Nom</th><th>Description</th></tr>{stat}</table>")
        noms_statuts = {s["id"]: s["nom"] for s in ent["statuts"]}
        trs = "".join(
            f'<tr id="{_e(t["id"])}"><td><b>{_e(t["nom"])}</b><br><code>{_e(t["id"])}</code></td>'
            f'<td>{_e(noms_statuts.get(t["de"], t["de"]))} → {_e(noms_statuts.get(t["vers"], t["vers"]))}</td>'
            f'<td>{", ".join(_nom_acteur(p, a) for a in t.get("acteurs", [])) or "<span class=trou>personne</span>"}</td>'
            f'<td>{" ".join(_lien(p, r) for r in t.get("regles", [])) or "<span class=trou>aucune</span>"}</td></tr>'
            for t in ent["transitions"]
        )
        corps.append(f"<h3>Transitions</h3><table><tr><th>Transition</th><th>De → vers</th><th>Acteurs</th><th>Règles</th></tr>{trs}</table>")

    corps.append('<h2 id="cas-usage">Cas d\'usage</h2>')
    for uid, uc in p.cas_usage.items():
        etapes = "".join(
            f"<tr><td>{i}</td><td>{_nom_acteur(p, et['acteur'])}</td><td>{_e(et['action'])}"
            + (f" {_lien(p, et['transition'])}" if et.get("transition") else "")
            + f"</td><td>{_lien(p, et['ecran']) if et.get('ecran') else ''}</td></tr>"
            for i, et in enumerate(uc["etapes"], 1)
        )
        corps.append(
            f'<div class="carte" id="{_e(uid)}"><div><code>{_e(uid)}</code> <b>{_e(uc["nom"])}</b> '
            f'<span class="doux">· {_nom_acteur(p, uc["acteur_principal"])}</span></div><p>{_e(uc.get("description", ""))}</p>'
            f"<table><tr><th>#</th><th>Acteur</th><th>Action</th><th>Écran</th></tr>{etapes}</table></div>"
        )

    corps.append('<h2 id="regles">Règles métier</h2>')
    for statut in ("validee", "proposee", "obsolete"):
        for rg in p.regles.values():
            if rg["statut"] == statut:
                corps.append(html_regle(p, rg))

    from .controles import regles_d_un_ecran

    corps.append('<h2 id="ecrans">Écrans</h2>')
    for sid, scr in p.ecrans.items():
        caps = ""
        regles = regles_d_un_ecran(p, sid)
        for cap in scr.get("captures", []):
            dates = [derniere_modification(p.regles[r]) for r in regles if r in p.regles]
            perimee = any(d and d > cap["date"] for d in dates)
            etat = '<span class="badge alerte">À vérifier</span>' if perimee else '<span class="badge ok">À jour</span>'
            caps += f"<tr><td><code>{_e(cap['fichier'])}</code></td><td>{_e(cap['date'])}</td><td>{_nom_acteur(p, cap['acteur']) if cap.get('acteur') else ''}</td><td>{etat}</td></tr>"
        corps.append(
            f'<div class="carte" id="{_e(sid)}"><div><code>{_e(sid)}</code> <b>{_e(scr["nom"])}</b></div>'
            f'<p>{_e(scr.get("description", ""))}</p>'
            f'<p class="doux" style="font-size:13px">Acteurs : {", ".join(_nom_acteur(p, a) for a in scr.get("acteurs", [])) or "non précisés"}'
            f' · Règles appliquées : {" ".join(_lien(p, r) for r in sorted(regles)) or "aucune"}</p>'
            + (f"<table><tr><th>Capture</th><th>Prise le</th><th>Profil</th><th>État</th></tr>{caps}</table>" if caps else "")
            + "</div>"
        )

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(meta.get("nom", "Projet"))} · Spécification</title><style>{CSS}</style></head>
<body><div class="page"><nav>{"".join(nav)}</nav><main>{"".join(corps)}</main></div>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs";
mermaid.initialize({{ startOnLoad: true, theme: "neutral", securityLevel: "strict" }});
</script></body></html>
"""
