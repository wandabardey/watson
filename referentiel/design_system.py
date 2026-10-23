"""Design system du projet : les fondations (couleurs en nuances, typographie, rayons, espacements, ombres, motion) et
le catalogue des composants, tenus dans Watson et rangés dans `design-system/systeme.yaml` du dépôt de connaissance.

Trois départs possibles :
- le starter 4SH (kit `@4sh/ui-kit`, Angular, ou `@4sh/ui-kit-react`) : Watson reprend la structure de ses jetons et la
  liste de ses composants, mais jamais son apparence, qui n'est qu'une base technique ;
- l'identité retenue au moodboard : Watson en tire les fondations (une couleur devient une gamme de dix nuances) ;
- un projet déjà codé : Watson lit son dépôt de code (Storybook, fichiers de jetons, variables CSS, kit utilisé) et
  en fait l'inventaire.

Les maquettes s'appuient sur ces fondations (variables CSS) dès qu'elles existent ; le passage en code les reporte
dans le dépôt de l'application, sur une branche.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from ._vendor import yaml
from .ecriture import aujourdhui, dump

NUANCES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]
KITS = {"@4sh/ui-kit": {"nom": "Kit 4SH Angular", "depot": "4sh/starter-angular", "techno": "Angular"},
        "@4sh/ui-kit-react": {"nom": "Kit 4SH React", "depot": "4sh/starter-react", "techno": "React"}}
FAMILLES = {"actions": "Actions", "forms": "Saisie", "informative": "Information", "layout": "Mise en page", "navigation": "Navigation",
            "table": "Données", "root": "Socle", "autre": "Autres"}
GAMMES = [("primaire", "Primaire", "Actions principales, liens, éléments actifs"), ("secondaire", "Secondaire", "Accents, mises en avant"),
          ("neutre", "Neutre", "Textes, fonds, bordures"), ("succes", "Succès", "Réussites, états validés"),
          ("alerte", "Alerte", "Avertissements, états à surveiller"), ("erreur", "Erreur", "Erreurs, refus, suppression")]
DEFAUT = {
    "couleurs": {"primaire": "#4F46E5", "secondaire": "#DB2777", "neutre": "#6B7280", "succes": "#10B981", "alerte": "#F97316", "erreur": "#EF4444"},
    "typo": {"titres": "Inter", "texte": "Inter", "taille": 16, "graisse_titres": 700},
    "rayons": {"petit": 4, "defaut": 8, "grand": 16, "pilule": 999},
    "espacements": [4, 8, 12, 16, 24, 32, 48],
    "ombres": {"legere": "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)", "forte": "0 12px 32px rgba(16,24,40,.16)"},
    "motion": {"rapide": 80, "defaut": 180, "lent": 280, "courbe": "cubic-bezier(.2,.8,.2,1)", "intensite": 5},
}
TXT = {"type": "string"}
SCHEMA = {
    "type": "object",
    "properties": {
        "nom": TXT, "mis_a_jour": TXT,
        "source": {"type": "object", "properties": {"genre": {"enum": ["starter", "moodboard", "existant", "libre"]}, "kit": TXT, "version": TXT,
                                                    "application": TXT, "piste": TXT, "detecte_le": TXT}, "additionalProperties": False},
        "fondations": {"type": "object"},
        "composants": {"type": "array", "items": {"type": "object", "required": ["id", "nom"], "properties": {
            "id": TXT, "nom": TXT, "famille": TXT, "description": TXT, "statut": {"enum": ["disponible", "utilise", "a_construire", "sur_mesure"]},
            "regles": {"type": "array", "items": TXT}}, "additionalProperties": False}},
        "detection": {"type": "object"},
    },
    "additionalProperties": False,
}


class ErreurDesignSystem(Exception):
    pass


# ---------------------------------------------------------------- couleurs

def _hex(c: str) -> tuple[float, float, float]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _vers_hex(r, g, b) -> str:
    return "#" + "".join(f"{max(0, min(255, round(x * 255))):02x}" for x in (r, g, b))


def gamme(base: str) -> dict[str, str]:
    """Dix nuances autour d'une couleur : la couleur donnée est la nuance 500, les plus claires (50 à 400) la mêlent
    au blanc, les plus sombres (600 à 900) au noir. C'est la convention des kits de composants, dont celui de 4SH."""
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", base or ""):
        raise ErreurDesignSystem(f"Couleur invalide : {base}")
    c = _hex(base)
    blanc = [0.95, 0.88, 0.74, 0.55, 0.28]
    noir = [0.16, 0.32, 0.47, 0.62]
    r = {n: _vers_hex(*(x + (1 - x) * k for x in c)) for n, k in zip(NUANCES[:5], blanc)}
    r["500"] = base.lower()
    r.update({n: _vers_hex(*(x * (1 - k) for x in c)) for n, k in zip(NUANCES[6:], noir)})
    return r


def contraste(a: str, b: str) -> float:
    def lum(c):
        def canal(x):
            return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
        r, g, bl = (canal(x) for x in _hex(c))
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


# ---------------------------------------------------------------- fondations

def fondations_vides() -> dict:
    return {"couleurs": [{"id": i, "nom": n, "role": r, "base": DEFAUT["couleurs"][i], "nuances": gamme(DEFAUT["couleurs"][i])} for i, n, r in GAMMES],
            "typo": dict(DEFAUT["typo"]), "rayons": dict(DEFAUT["rayons"]), "espacements": list(DEFAUT["espacements"]),
            "ombres": dict(DEFAUT["ombres"]), "motion": dict(DEFAUT["motion"])}


def depuis_piste(piste: dict, fond: dict | None = None) -> dict:
    """Les fondations tirées d'une piste de moodboard : rôles de couleur, polices, rayon, ombre, intensité du motion."""
    f = json.loads(json.dumps(fond or fondations_vides()))
    roles = {c["role"]: c["hex"] for c in piste.get("couleurs") or []}
    correspondances = {"primaire": roles.get("marque"), "secondaire": roles.get("accent"), "neutre": roles.get("texte_doux") or roles.get("texte"),
                       "succes": roles.get("succes"), "alerte": roles.get("alerte"), "erreur": roles.get("erreur")}
    for c in f["couleurs"]:
        if correspondances.get(c["id"]):
            c["base"] = correspondances[c["id"]].lower()
            c["nuances"] = gamme(c["base"])
    t = piste.get("typo") or {}
    f["typo"].update({k: v for k, v in {"titres": t.get("titres"), "texte": t.get("texte"), "graisse_titres": t.get("graisse_titres")}.items() if v})
    formes = piste.get("formes") or {}
    if formes.get("rayon") is not None:
        r = int(formes["rayon"])
        f["rayons"].update(petit=max(2, r // 2), defaut=r, grand=r * 2 if r else 0)
    if formes.get("ombre") == "aucune":
        f["ombres"] = {"legere": "none", "forte": "0 0 0 1px rgba(16,24,40,.12)"}
    elif formes.get("ombre") == "marquee":
        f["ombres"] = {"legere": "0 2px 6px rgba(16,24,40,.12)", "forte": "0 18px 40px rgba(16,24,40,.22)"}
    m = (piste.get("dials") or {}).get("motion")
    if m is not None:
        f["motion"]["intensite"] = int(m)
        f["motion"].update(rapide=60 + m * 4, defaut=120 + m * 12, lent=200 + m * 20)
    return f


def variables_css(f: dict) -> str:
    """Les fondations en variables CSS : ce que les maquettes et l'aperçu utilisent."""
    l = [":root {"]
    for c in f.get("couleurs") or []:
        for n, v in (c.get("nuances") or {}).items():
            l.append(f"  --couleur-{c['id']}-{n}: {v};")
    t = f.get("typo") or {}
    l += [f"  --police-titres: '{t.get('titres', 'Inter')}', system-ui, sans-serif;", f"  --police-texte: '{t.get('texte', 'Inter')}', system-ui, sans-serif;",
          f"  --taille-texte: {t.get('taille', 16)}px;", f"  --graisse-titres: {t.get('graisse_titres', 700)};"]
    for k, v in (f.get("rayons") or {}).items():
        l.append(f"  --rayon-{k}: {v}px;")
    for i, v in enumerate(f.get("espacements") or []):
        l.append(f"  --espace-{i + 1}: {v}px;")
    for k, v in (f.get("ombres") or {}).items():
        l.append(f"  --ombre-{k}: {v};")
    m = f.get("motion") or {}
    for k in ("rapide", "defaut", "lent"):
        if k in m:
            l.append(f"  --motion-{k}: {m[k]}ms;")
    l.append(f"  --motion-courbe: {m.get('courbe', 'ease')};")
    l.append("}")
    l.append("@media (prefers-reduced-motion: reduce) { :root { --motion-rapide: 0ms; --motion-defaut: 0ms; --motion-lent: 0ms; } }")
    return "\n".join(l)


# ---------------------------------------------------------------- lecture et écriture

def _fichier(racine: Path) -> Path:
    return Path(racine) / "design-system" / "systeme.yaml"


def lire(racine: Path) -> dict | None:
    f = _fichier(racine)
    return (yaml.safe_load(f.read_text(encoding="utf-8")) or None) if f.exists() else None


def enregistrer(racine: Path, ds: dict) -> dict:
    from .validation import erreurs

    ds = json.loads(json.dumps({k: v for k, v in ds.items() if k in SCHEMA["properties"]}, default=str).replace("\\u2014", ",").replace("\\u2013", "-"))
    for c in (ds.get("fondations") or {}).get("couleurs") or []:
        if c.get("base") and (not c.get("nuances") or c.get("regenerer")):
            c["nuances"] = gamme(c["base"])
        c.pop("regenerer", None)
    ds["mis_a_jour"] = aujourdhui()
    e = erreurs(ds, SCHEMA)
    if e:
        raise ErreurDesignSystem("Design system mal formé : " + "; ".join(f"{'/'.join(map(str, a))} {b}" for a, b in e[:3]))
    f = _fichier(racine)
    f.parent.mkdir(exist_ok=True)
    f.write_text("# Design system du projet, tenu dans Watson : fondations et composants.\n" + dump(ds), encoding="utf-8")
    return ds


def controles(ds: dict) -> list[str]:
    """Ce qu'il faut regarder : contrastes insuffisants pour du texte, motion trop long."""
    r = []
    for c in (ds.get("fondations") or {}).get("couleurs") or []:
        n = c.get("nuances") or {}
        if n.get("700") and contraste(n["700"], "#ffffff") < 4.5:
            r.append(f"« {c['nom']} 700 » sur fond blanc : contraste {contraste(n['700'], '#ffffff')} pour 1, sous les 4,5 pour 1 du RGAA pour un texte "
                     "(les textes colorés utilisent les nuances 700 à 900) : fonce la couleur de base.")
    m = (ds.get("fondations") or {}).get("motion") or {}
    if m.get("lent", 0) > 500:
        r.append("Les animations lentes dépassent une demi-seconde : l'interface paraîtra molle.")
    return r


def vue(racine: Path) -> dict:
    from .avant_projet import lire_moodboard
    from .chargement import charger

    ds = lire(racine)
    mb = lire_moodboard(racine) or {}
    piste = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    p = charger(racine)
    return {"existe": ds is not None, "systeme": ds or {"fondations": fondations_vides(), "composants": [], "source": {"genre": "libre"}},
            "css": variables_css((ds or {}).get("fondations") or fondations_vides()), "controles": controles(ds or {}),
            "piste": {"id": piste["id"], "nom": piste["nom"]} if piste else None, "kits": KITS, "familles": FAMILLES,
            "applications": [{"id": a["id"], "nom": a["nom"], "depot": a.get("depot", "")} for a in p.meta.get("applications") or []]}


# ---------------------------------------------------------------- départ depuis le starter

def _telecharger(url: str, lire_url=None) -> str:
    if lire_url:
        return lire_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "Watson"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def catalogue_starter(kit: str = "@4sh/ui-kit", lire_url=None) -> list[dict]:
    """La liste des composants du starter (index de sa documentation), lue sur GitHub. Le starter est public."""
    depot = KITS.get(kit, KITS["@4sh/ui-kit"])["depot"]
    try:
        md = _telecharger(f"https://raw.githubusercontent.com/{depot}/main/docs/components-index.md", lire_url)
    except Exception as e:  # noqa: BLE001
        raise ErreurDesignSystem(f"Impossible de lire le catalogue du starter sur GitHub ({e}).") from e
    r, famille = [], "autre"
    for ligne in md.splitlines():
        m = re.match(r"^##\s+(\w+)", ligne)
        if m:
            famille = m.group(1).lower()
            continue
        m = re.match(r"^- (✅|⬜) `(ui-[a-z0-9-]+)`\s*[\u2014\u2013-]\s*([^(;]+)", ligne)
        if m:
            nom = m.group(3).strip().rstrip(".").strip()
            r.append({"id": m.group(2), "nom": nom[:80], "famille": famille if famille in FAMILLES else "autre",
                      "statut": "disponible" if m.group(1) == "✅" else "a_construire"})
    if not r:
        raise ErreurDesignSystem("Le catalogue du starter est vide ou illisible.")
    return r


def partir_du_starter(racine: Path, kit: str = "@4sh/ui-kit", lire_url=None) -> dict:
    """Le catalogue de composants du starter, et les fondations de l'identité retenue (jamais l'apparence du starter)."""
    from .avant_projet import lire_moodboard

    actuel = lire(racine) or {}
    mb = lire_moodboard(racine) or {}
    piste = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    fond = actuel.get("fondations") or (depuis_piste(piste) if piste else fondations_vides())
    deja = {c["id"]: c for c in actuel.get("composants") or []}
    composants = [{**c, **{k: deja[c["id"]][k] for k in ("statut", "regles") if c["id"] in deja and deja[c["id"]].get(k)}} for c in catalogue_starter(kit, lire_url)]
    composants += [c for c in actuel.get("composants") or [] if c.get("statut") == "sur_mesure"]
    return enregistrer(racine, {**actuel, "nom": actuel.get("nom") or "Design system", "fondations": fond, "composants": composants,
                                "source": {"genre": "starter", "kit": kit, "piste": (piste or {}).get("id", "")}})


def appliquer_piste(racine: Path) -> dict:
    from .avant_projet import lire_moodboard

    mb = lire_moodboard(racine) or {}
    piste = next((x for x in mb.get("pistes") or [] if x["id"] == mb.get("retenue")), None)
    if not piste:
        raise ErreurDesignSystem("Pas de piste retenue dans le moodboard.")
    actuel = lire(racine) or {"composants": [], "source": {"genre": "moodboard"}}
    actuel["fondations"] = depuis_piste(piste, actuel.get("fondations"))
    actuel.setdefault("source", {})["piste"] = piste["id"]
    return enregistrer(racine, actuel)


# ---------------------------------------------------------------- projet déjà codé : détection

IGNORES = {"node_modules", ".git", "dist", "build", ".angular", ".next", "coverage", "target", ".idea", ".ui-kit-preview"}


def _fichiers(depot: Path, motifs: tuple[str, ...], limite: int = 4000):
    n = 0
    pile = [depot]
    while pile and n < limite:
        d = pile.pop()
        try:
            for e in sorted(d.iterdir()):
                if e.is_dir():
                    if e.name not in IGNORES and not e.name.startswith("."):
                        pile.append(e)
                    elif e.name in (".storybook",):
                        pile.append(e)
                elif e.suffix in motifs or e.name in motifs:
                    n += 1
                    yield e
        except OSError:
            continue


def detecter(depot: Path) -> dict:
    """L'inventaire du design system d'un dépôt de code : kit et librairie, Storybook, jetons, variables CSS, composants."""
    depot = Path(depot).expanduser()
    if not depot.is_dir():
        raise ErreurDesignSystem(f"Dépôt de code introuvable sur ce poste : {depot}")
    r = {"depot": str(depot), "kit": None, "librairies": [], "storybook": None, "jetons": [], "variables": {}, "composants": [], "indices": []}
    pkg = depot / "package.json"
    deps = {}
    if pkg.exists():
        try:
            j = json.loads(pkg.read_text(encoding="utf-8"))
            deps = {**(j.get("dependencies") or {}), **(j.get("devDependencies") or {})}
        except ValueError:
            pass
    for nom, lib in (("@4sh/ui-kit", "Kit 4SH Angular"), ("@4sh/ui-kit-react", "Kit 4SH React"), ("@4sh/ui-kit-schematics", "Kit 4SH (sources copiées)"),
                     ("primeng", "PrimeNG"), ("@angular/material", "Angular Material"), ("@mui/material", "MUI"), ("tailwindcss", "Tailwind"),
                     ("@radix-ui/react-dialog", "Radix UI"), ("bootstrap", "Bootstrap"), ("@storybook/angular", "Storybook"), ("@storybook/react", "Storybook")):
        if nom in deps:
            r["librairies"].append({"paquet": nom, "nom": lib, "version": deps[nom]})
            if nom.startswith("@4sh/ui-kit") and not r["kit"]:
                r["kit"] = nom if nom != "@4sh/ui-kit-schematics" else "@4sh/ui-kit"
    if (depot / "ui-kit.json").exists():
        r["kit"] = r["kit"] or "@4sh/ui-kit"
        r["indices"].append("ui-kit.json : composants du kit 4SH copiés dans le projet")
        try:
            uk = json.loads((depot / "ui-kit.json").read_text(encoding="utf-8"))
            for nom in (uk.get("components") or uk.get("composants") or {}):
                r["composants"].append({"id": nom, "nom": nom, "famille": "autre", "statut": "utilise"})
        except ValueError:
            pass
    sb = next((d for d in (depot / ".storybook", depot / "storybook") if (d / "main.js").exists() or (d / "main.ts").exists()), None)
    histoires = [f for f in _fichiers(depot, (".ts", ".tsx", ".js", ".mdx")) if ".stories." in f.name]
    if sb or histoires:
        r["storybook"] = {"dossier": str(sb.relative_to(depot)) if sb else None, "histoires": len(histoires)}
        for f in histoires[:400]:
            nom = f.name.split(".stories.")[0]
            if not any(c["id"] == nom for c in r["composants"]):
                r["composants"].append({"id": nom, "nom": nom, "famille": "autre", "statut": "utilise"})
    for f in _fichiers(depot, (".json",), 3000):
        if re.search(r"tokens?|design-tokens", str(f.relative_to(depot)), re.I) and f.stat().st_size < 2_000_000:
            r["jetons"].append(str(f.relative_to(depot)))
    variables = {}
    for f in _fichiers(depot, (".css", ".scss"), 3000):
        try:
            t = f.read_text(encoding="utf-8", errors="ignore")[:300_000]
        except OSError:
            continue
        for nom, val in re.findall(r"(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);", t):
            if len(variables) < 600 and nom not in variables:
                variables[nom] = val.strip()[:80]
    r["variables"] = variables
    for nom in ("tailwind.config.js", "tailwind.config.ts"):
        if (depot / nom).exists():
            r["indices"].append(f"{nom} : thème Tailwind")
    for f in _fichiers(depot, (".ts",), 3000):
        if f.stat().st_size < 300_000 and "definePreset" in f.read_text(encoding="utf-8", errors="ignore"):
            r["indices"].append(f"{f.relative_to(depot)} : preset PrimeNG")
            break
    return r


def fondations_depuis_variables(variables: dict, fond: dict | None = None) -> dict:
    """Reprend ce qui se reconnaît dans les variables CSS d'un projet : couleur principale, polices, rayon."""
    f = json.loads(json.dumps(fond or fondations_vides()))

    def chercher(*motifs):
        for nom, val in variables.items():
            if any(re.search(m, nom, re.I) for m in motifs) and re.fullmatch(r"#[0-9a-fA-F]{6}", val.strip()):
                return val.strip().lower()
        return None
    trouve = {"primaire": chercher(r"primary-?500$", r"primary$", r"brand"), "secondaire": chercher(r"secondary-?500$", r"accent"),
              "succes": chercher(r"success", r"green-?500"), "alerte": chercher(r"warning", r"orange-?500"), "erreur": chercher(r"error|danger", r"red-?500")}
    for c in f["couleurs"]:
        if trouve.get(c["id"]):
            c["base"] = trouve[c["id"]]
            c["nuances"] = gamme(c["base"])
    for nom, val in variables.items():
        if re.search(r"font-?family.*(title|heading)", nom, re.I):
            f["typo"]["titres"] = val.split(",")[0].strip("'\" ")
        elif re.search(r"font-?family.*(base|body|text)", nom, re.I):
            f["typo"]["texte"] = val.split(",")[0].strip("'\" ")
    return f


def importer_existant(racine: Path, application: str) -> dict:
    from .chargement import charger
    from .livraisons import _depot

    p = charger(racine)
    app = next((a for a in p.meta.get("applications") or [] if a["id"] == application), None)
    if not app:
        raise ErreurDesignSystem("Application inconnue.")
    depot = _depot(racine, app)
    if not depot:
        raise ErreurDesignSystem(f"L'application « {app['nom']} » n'a pas de dépôt de code sur ce poste : indique-le dans Administration du projet.")
    d = detecter(depot)
    actuel = lire(racine) or {}
    ds = {**actuel, "nom": actuel.get("nom") or "Design system",
          "fondations": fondations_depuis_variables(d["variables"], actuel.get("fondations")),
          "composants": d["composants"] or actuel.get("composants") or [],
          "source": {"genre": "existant", "application": application, "kit": d["kit"] or "", "detecte_le": aujourdhui()},
          "detection": {k: d[k] for k in ("kit", "librairies", "storybook", "jetons", "indices")} | {"variables": len(d["variables"])}}
    return enregistrer(racine, ds)
