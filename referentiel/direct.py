"""App en direct : l'application qui tourne (local, recette, production), écran par écran, à côté de ce que la base
en dit : la spec de l'écran, sa maquette de référence, la rubrique du guide utilisateur qui l'explique, son
avancement dans le code. C'est ce qui fait de la documentation une documentation vivante : on la lit en face de
l'écran réel, et chaque écart se relève sur place.

Un écart relevé devient au choix :
- une anomalie (le code ne fait pas ce que dit la spec) : rangée dans `direct/ecarts.yaml`, avec sa capture, et
  rédigée au format d'un ticket pour Jira (Watson ne crée rien dans Jira sans accord) ;
- une évolution (la spec elle-même est à revoir) : une évolution du backlog, avec le constat comme besoin ;
- une question pour le client : dans les questions ouvertes.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

from ._vendor import yaml
from .ecriture import aujourdhui, dump

GENRES = {"anomalie": "Anomalie", "evolution": "Évolution", "question": "Question"}
STATUTS = {"ouvert": "Ouvert", "transmis": "Transmis à l'équipe", "corrige": "Corrigé", "ecarte": "Écarté"}


class ErreurDirect(Exception):
    pass


def _fichier(racine: Path) -> Path:
    return Path(racine) / "direct" / "ecarts.yaml"


def ecarts(racine: Path) -> list[dict]:
    f = _fichier(racine)
    return list(((yaml.safe_load(f.read_text(encoding="utf-8")) or {}) if f.exists() else {}).get("ecarts") or [])


def _ecrire(racine: Path, liste: list[dict]):
    f = _fichier(racine)
    f.parent.mkdir(exist_ok=True)
    f.write_text("# Écarts relevés dans l'application en fonctionnement (app en direct).\n" + dump({"ecarts": liste}), encoding="utf-8")


def _url(base: str, route: str) -> str:
    return base.rstrip("/") + ("/" + route.lstrip("/") if route else "")


def ticket(p, e: dict) -> str:
    """L'anomalie au format d'un ticket : titre, contexte, étapes, constaté, attendu, référence à la spec."""
    ecran = p.ecrans.get(e["ecran"], {})
    l = [f"[{ecran.get('nom', e['ecran'])}] {e['titre']}", "", "*Contexte*",
         f"Écran « {ecran.get('nom', e['ecran'])} » ({e['ecran']})" + (f", environnement {e['environnement']}" if e.get("environnement") else "")
         + (f", {e['url']}" if e.get("url") else "") + ".", ""]
    if e.get("etapes"):
        l += ["*Étapes pour reproduire*"] + [f"# {x}" for x in e["etapes"]] + [""]
    l += ["*Constaté*", e["constat"], "", "*Attendu*", e.get("attendu") or "Conforme à la spec de l'écran.", ""]
    regles = [p.regles[r] for r in ecran.get("regles") or [] if r in p.regles]
    if regles:
        l += ["*Règles de la spec concernées*"] + [f"- {r['id']} {r['titre']}" for r in regles] + [""]
    if e.get("capture"):
        l.append(f"Capture : {e['capture']}")
    return "\n".join(l).replace("\u2014", ",").replace("\u2013", "-")


def relever(racine: Path, champs: dict, auteur: str) -> dict:
    from .chargement import charger

    p = charger(racine)
    ecran = str(champs.get("ecran") or "")
    if ecran not in p.ecrans:
        raise ErreurDirect("Écran inconnu.")
    genre = champs.get("genre") if champs.get("genre") in GENRES else "anomalie"
    constat = str(champs.get("constat") or "").strip()
    if not constat:
        raise ErreurDirect("Décris ce que tu constates.")
    titre = str(champs.get("titre") or constat.split("\n")[0])[:120].strip()
    if genre == "evolution":
        from .backlog import creer
        evo = creer(racine, {"titre": titre, "besoin": f"Constaté dans l'application, écran « {p.ecrans[ecran]['nom']} » : {constat}"
                             + (f"\nAttendu : {champs['attendu']}" if champs.get("attendu") else ""), "origine": "App en direct"}, auteur)
        return {"genre": "evolution", "evolution": evo["id"]}
    if genre == "question":
        from .alimentation import noter_questions
        noter_questions(racine, [{"question": constat, "source": f"App en direct, écran {p.ecrans[ecran]['nom']}"}], auteur, aujourdhui())
        return {"genre": "question"}
    liste = ecarts(racine)
    n = max([int(re.sub(r"\D", "", x["id"]) or 0) for x in liste] + [0]) + 1
    eid = f"ECA-{n:03d}"
    e = {"id": eid, "ecran": ecran, "titre": titre, "constat": constat, "attendu": str(champs.get("attendu") or "").strip(),
         "etapes": [str(x).strip() for x in champs.get("etapes") or [] if str(x).strip()], "environnement": str(champs.get("environnement") or ""),
         "url": str(champs.get("url") or ""), "statut": "ouvert", "date": aujourdhui(), "par": auteur}
    if champs.get("capture"):
        m = re.match(r"^data:image/(png|jpeg);base64,(.*)$", str(champs["capture"]), re.S)
        if not m:
            raise ErreurDirect("Capture illisible.")
        donnees = base64.b64decode(m.group(2))
        if len(donnees) > 4 * 1024 * 1024:
            raise ErreurDirect("Capture trop lourde (4 Mo au plus).")
        f = Path(racine) / "direct" / "captures" / f"{eid}.{'png' if m.group(1) == 'png' else 'jpg'}"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(donnees)
        e["capture"] = f.relative_to(racine).as_posix()
    e = {k: v for k, v in e.items() if v not in ("", [])}
    _ecrire(racine, liste + [e])
    return {"genre": "anomalie", "ecart": e, "ticket": ticket(p, e)}


def changer(racine: Path, eid: str, statut: str) -> dict:
    if statut not in STATUTS:
        raise ErreurDirect("Statut inconnu.")
    liste = ecarts(racine)
    e = next((x for x in liste if x["id"] == eid), None)
    if not e:
        raise ErreurDirect("Écart inconnu.")
    e["statut"] = statut
    _ecrire(racine, liste)
    return e


def vue(racine: Path) -> dict:
    from .avancement import liens, vue as avancement
    from .chargement import charger
    from .documentation import vue as doc
    from .maquettes import _description_ecran, lire_index

    p = charger(racine)
    av = {e["id"]: e for e in avancement(racine)["ecrans"]}
    tous = liens(racine)
    idx = lire_index(racine)
    try:
        rubriques = doc(racine)["rubriques"]
    except Exception:  # noqa: BLE001
        rubriques = []
    les_ecarts = ecarts(racine)
    apps = {a["id"]: a for a in p.meta.get("applications") or []}
    ecrans = []
    for eid, e in sorted(p.ecrans.items()):
        a = av.get(eid) or {}
        maqs = [m for m in idx["maquettes"] if m.get("ecran") == eid]
        ref = next((m for m in reversed(maqs) if m.get("validee")), maqs[-1] if maqs else None)
        route = (tous.get(eid) or {}).get("route", "")
        app = apps.get(a.get("application")) or {}
        ecrans.append({
            "id": eid, "nom": e.get("nom", eid), "application": a.get("application", ""), "route": route,
            "adresses": [{"nom": x["nom"], "url": _url(x["url"], route)} for x in app.get("adresses") or []],
            "etat": a.get("etat"), "etat_libelle": a.get("etat_libelle"), "livre_dans": ((a.get("code") or {}).get("livre_dans")),
            "spec": _description_ecran(p, eid),
            "regles": [{"id": r, "titre": p.regles[r]["titre"], "enonce": p.regles[r].get("enonce", "")} for r in e.get("regles") or [] if r in p.regles],
            "maquette": {"id": ref["id"], "titre": ref["titre"], "validee": bool(ref.get("validee"))} if ref else None,
            "rubriques": [{"id": r["id"], "titre": r["titre"], "texte": r.get("texte"), "a_mettre_a_jour": r.get("a_mettre_a_jour") or []}
                          for r in rubriques if eid in (r.get("sources") or []) or eid in (r.get("ecrans") or [])],
            "ecarts": [x for x in les_ecarts if x["ecran"] == eid],
        })
    return {"ecrans": ecrans, "genres": GENRES, "statuts": STATUTS,
            "applications": [{"id": a["id"], "nom": a["nom"], "adresses": a.get("adresses") or []} for a in apps.values()],
            "ecarts_ouverts": sum(1 for x in les_ecarts if x.get("statut") == "ouvert")}
