"""Ligne de commande du référentiel métier.

    python -m referentiel valider  <projet>          structure + erreurs de cohérence (code retour 1 si erreur)
    python -m referentiel trous    <projet> [--json] trous, questions et couverture
    python -m referentiel impact   <projet> <ID>     tout ce qui dépend d'un élément
    python -m referentiel generer  <projet> [-o dir] spec HTML + diagrammes Mermaid
    python -m referentiel nouveau  <dossier> <ID> <nom>   crée un projet vide
    python -m referentiel connexion [--login]        état de la connexion à Claude (ou connexion)
    python -m referentiel demander <projet> "<question>" [--portee travail|production|histoire] [--json]
    python -m referentiel app      <projet> [--port 8765]   ouvre « Demander au référentiel » dans le navigateur
    python -m referentiel contexte <projet> [--version X] [-o REFERENTIEL.md] [--sections regles,entites] [--index]
                                                     la base en un texte compact, à lire par Claude en une fois
    python -m referentiel versions <projet>          versions figées et environnements
    python -m referentiel comparer <projet> <de> [<a>]  ce qui change entre deux versions (défaut : la version de travail)
    python -m referentiel figer    <projet> <X.Y> "<message>" [--auteur nom]   fige la version de travail
    python -m referentiel evolution <projet> lister | creer "<nom>" --cible 1.6 | cibler <id> <1.6|plus-tard> | valider <id>  [--auteur nom]
    python -m referentiel livraisons <projet> [--json]   quelle version de code applique quelle spec, environnement par environnement
    python -m referentiel tests    <projet> [--element ID] [--json]   cas de test proposés à partir des règles validées
    python -m referentiel tests    <projet> --enregistrer --auteur nom [--element ID]   les écrit en brouillon (recette/cas)
    python -m referentiel tests    <projet> --a-revoir   cas enregistrés dont la règle a bougé
"""

from __future__ import annotations


import argparse
import json
import sys
from pathlib import Path

from .chargement import charger
from .controles import ALERTE, ERREUR, TROU, analyser, couverture, decisions_orphelines
from .generation import ecrire_mermaid, generer_html
from .impact import analyser_impact

COULEURS = {ERREUR: "\033[31m", TROU: "\033[33m", ALERTE: "\033[36m"}
RAZ = "\033[0m"
LIBELLES = {ERREUR: "ERREUR", TROU: "TROU", ALERTE: "À VÉRIFIER"}


def _couleur(texte, gravite):
    if not sys.stdout.isatty():
        return texte
    return f"{COULEURS[gravite]}{texte}{RAZ}"


def _charger_ou_quitter(dossier):
    p = charger(dossier)
    if p.erreurs:
        print("Structure invalide :")
        for e in p.erreurs:
            print(f"  - {e}")
        sys.exit(2)
    return p


def cmd_valider(args):
    p = _charger_ou_quitter(args.projet)
    erreurs = [t for t in analyser(p) if t.gravite == ERREUR and t.statut == "ouvert"]
    nb = sum(len(getattr(p, a)) for a in ("acteurs", "entites", "regles", "cas_usage", "ecrans"))
    if erreurs:
        print(f"{len(erreurs)} erreur(s) de cohérence :")
        for t in erreurs:
            print(f"  - {t.message}")
        sys.exit(1)
    print(f"Base valide : {nb} éléments, aucune erreur de cohérence.")


def cmd_trous(args):
    p = _charger_ou_quitter(args.projet)
    trous = analyser(p)
    cov = couverture(p, trous)
    orphelines = decisions_orphelines(p, trous)
    if args.json:
        print(json.dumps(
            {"trous": [t.vers_dict() for t in trous], "couverture": cov, "decisions_orphelines": orphelines},
            ensure_ascii=False, indent=2,
        ))
        return
    ouverts = [t for t in trous if t.statut == "ouvert"]
    for t in ouverts:
        print(_couleur(f"[{LIBELLES[t.gravite]}]", t.gravite), t.message)
        print(f"    Question : {t.question}")
        print(f"    Id : {t.id}\n")
    traites = [t for t in trous if t.statut != "ouvert"]
    if traites:
        print(f"{len(traites)} trou(s) traité(s) dans trous.yaml :")
        for t in traites:
            print(f"  - {t.statut} : {t.message}")
        print()
    for o in orphelines:
        print(f"Décision sans objet dans trous.yaml (trou résolu ou renommé) : {o}")
    print("Couverture :")
    for c in cov.values():
        print(f"  {c['nom']} : {c['taux']} % ({c['complets']}/{c['elements']} statuts et transitions sans trou)")
    resume = {g: sum(1 for t in ouverts if t.gravite == g) for g in (ERREUR, TROU, ALERTE)}
    print(f"\n{resume[ERREUR]} erreur(s), {resume[TROU]} trou(s), {resume[ALERTE]} point(s) à vérifier.")


def cmd_impact(args):
    p = _charger_ou_quitter(args.projet)
    try:
        imp = analyser_impact(p, args.id)
    except KeyError:
        print(f"Identifiant inconnu : {args.id}")
        sys.exit(2)
    if args.json:
        print(json.dumps(imp, ensure_ascii=False, indent=2))
        return
    if not any(v for k, v in imp.items() if k != "element"):
        print(f"Rien ne dépend de {args.id} pour l'instant.")
        return
    print(f"Impact d'une modification de {args.id} :")
    for cle, libelle in [("regles", "Règles"), ("transitions", "Transitions"), ("statuts", "Statuts"),
                         ("cas_usage", "Cas d'usage"), ("ecrans", "Écrans"), ("captures", "Captures à revoir")]:
        if imp[cle]:
            print(f"  {libelle} : {', '.join(imp[cle])}")


def cmd_generer(args):
    p = _charger_ou_quitter(args.projet)
    trous = analyser(p)
    sortie = Path(args.sortie or Path(args.projet) / "sortie")
    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / "spec.html").write_text(generer_html(p, trous), encoding="utf-8")
    fichiers = ecrire_mermaid(p, trous, sortie / "diagrammes")
    print(f"Spec générée : {sortie / 'spec.html'}")
    for f in fichiers:
        print(f"Diagramme : {f}")


def cmd_nouveau(args):
    racine = Path(args.dossier)
    if (racine / "projet.yaml").exists():
        print("Un projet existe déjà dans ce dossier.")
        sys.exit(2)
    for d in ("acteurs", "entites", "regles", "cas-usage", "ecrans"):
        (racine / d).mkdir(parents=True, exist_ok=True)
    (racine / "projet.yaml").write_text(
        f"id: {args.id}\nnom: {args.nom}\ndescription: À compléter\nglossaire: []\n", encoding="utf-8"
    )
    (racine / "trous.yaml").write_text("[]\n", encoding="utf-8")
    print(f"Projet {args.nom} créé dans {racine}")


def cmd_connexion(args):
    from .assistant import ErreurAssistant, etat_connexion, lancer_connexion

    if args.login:
        try:
            sys.exit(lancer_connexion())
        except ErreurAssistant as e:
            print(e)
            sys.exit(2)
    e = etat_connexion()
    if args.json:
        print(json.dumps(e, ensure_ascii=False, indent=2))
        return
    print(f"Kit d'agents installé : {'oui' if e['kit_agents'] else 'non (pip install claude-agent-sdk)'}")
    print(f"Claude Code disponible : {'oui' if e['claude_code'] else 'non'}")
    if e["mode"] == "cle":
        print("Mode : clé API de l'organisation (secours, variable REFERENTIEL_CLE_API)")
    elif e["connecte"]:
        compte = e.get("compte") or {}
        detail = " · ".join(v for v in (compte.get("email"), compte.get("orgName"), compte.get("subscriptionType")) if v)
        print(f"Compte Claude connecté{' : ' + detail if detail else ''}")
    else:
        print("Compte Claude non connecté. Lancer : python -m referentiel connexion --login")


def cmd_demander(args):
    from .assistant import ErreurAssistant, demander, formater

    _charger_ou_quitter(args.projet)
    try:
        r = demander(args.question, Path(args.projet), args.portee)
    except ErreurAssistant as e:
        print(e)
        sys.exit(2)
    print(json.dumps(r.en_dict(), ensure_ascii=False, indent=2) if args.json else formater(r))


def cmd_app(args):
    from .app_web import servir

    _charger_ou_quitter(args.projet)
    servir(Path(args.projet), args.port)


def cmd_contexte(args):
    from .contexte import generer_contexte, taille
    from .versions import ErreurVersion, charger_version

    _charger_ou_quitter(args.projet)
    try:
        p = charger_version(Path(args.projet), args.version)
    except ErreurVersion as e:
        print(e)
        sys.exit(2)
    sections = args.sections.split(",") if args.sections else None
    texte = generer_contexte(p, sections, index=args.index)
    if args.sortie:
        Path(args.sortie).write_text(texte, encoding="utf-8")
        t = taille(texte)
        print(f"{args.sortie} écrit : {t['caracteres']} caractères, environ {t['jetons_estimes']} jetons.")
    else:
        print(texte, end="")


def cmd_versions(args):
    from .versions import environnements, lister_versions

    vs = lister_versions(Path(args.projet))
    envs = environnements(Path(args.projet))
    if args.json:
        print(json.dumps({"versions": vs, "environnements": envs}, ensure_ascii=False, indent=2))
        return
    if not vs:
        print("Aucune version figée. La version de travail est la seule.")
    for v in vs:
        print(f"{v['version']:<8} {(v.get('date') or '')[:10]}  {v.get('auteur') or ''}  {v.get('message') or ''}")
    for nom, e in envs.items():
        print(f"{nom} : spec {e.get('spec', '?')}")


def cmd_comparer(args):
    from .versions import ErreurVersion, comparer

    try:
        c = comparer(Path(args.projet), args.de, args.a)
    except ErreurVersion as e:
        print(e)
        sys.exit(2)
    if args.json:
        print(json.dumps(c, ensure_ascii=False, indent=2))
        return
    from .contexte import resume_changements

    print(resume_changements(c, limite=10_000), end="")


def cmd_figer(args):
    from .evolutions import figer
    from .versions import ErreurVersion

    try:
        v = figer(Path(args.projet), args.version, args.message, args.auteur)
    except ErreurVersion as e:
        print(e)
        sys.exit(2)
    print(f"Version {v['version']} figée.")
    if v["evolutions_integrees"]:
        print("Évolutions intégrées : " + ", ".join(v["evolutions_integrees"]))
    if v["evolutions_en_attente"]:
        print("Toujours en attente : " + ", ".join(v["evolutions_en_attente"]))


def cmd_evolution(args):
    from . import evolutions
    from .versions import ErreurVersion

    racine = Path(args.projet)
    try:
        if args.action == "lister":
            evs = evolutions.lister(racine)
            if args.json:
                print(json.dumps(evs, ensure_ascii=False, indent=2, default=str))
                return
            if not evs:
                print("Aucune évolution.")
            for e in evs:
                nb = len(e.get("changements") or [])
                detail = f", {nb} changement{'s' if nb > 1 else ''}" if e.get("statut") != "integree" else f", dans la spec {e.get('version')}"
                print(f"- {e['nom']} [{e['id']}] : cible {e['cible']}, {e['libelle_statut']}{detail}")
            return
        if not args.auteur:
            print("Indiquer --auteur.")
            sys.exit(2)
        if args.action == "creer":
            e = evolutions.creer(racine, args.valeur, args.cible, args.auteur)
            print(f"Évolution « {e['nom']} » ouverte, cible {e['cible']} (identifiant {e['id']}).")
        elif args.action == "cibler":
            e = evolutions.cibler(racine, args.valeur, args.cible_pos, args.auteur)
            print(f"« {e['nom']} » cible maintenant {e['cible']}.")
        elif args.action == "valider":
            e = evolutions.valider(racine, args.valeur, args.auteur)
            print(f"« {e['nom']} » validée : elle entrera dans la spec {e['cible']} quand on la figera.")
    except ErreurVersion as e:
        print(e)
        sys.exit(2)


def cmd_livraisons(args):
    from .livraisons import correspondance

    c = correspondance(Path(args.projet))
    if args.json:
        print(json.dumps(c, ensure_ascii=False, indent=2))
        return
    for nom, env in c["environnements"].items():
        print(f"{nom} : spec visée {env['spec_visee']}")
        for l in env["applications"]:
            spec = f"spec {l['spec_declaree']}" if l["spec_declaree"] else "spec non déclarée"
            extra = f" ({len(l['changements'])} changements manquants)" if l["etat"] == "en retard" else ""
            print(f"  {l['application']} {l['version']} : {spec}, {l['etat']}{extra}")
    for app, ls in c["livraisons"].items():
        print(f"{app} : " + (", ".join(f"{l['version']} → spec {l['spec'] or '?'}" for l in ls) or "aucune livraison lue"))
    if c["sans_depot"]:
        print("Sans dépôt déclaré : " + ", ".join(c["sans_depot"]))


def cmd_tests(args):
    from . import recette as cas_test

    p = _charger_ou_quitter(args.projet)
    if args.a_revoir:
        signales = cas_test.a_revoir(p)
        if args.json:
            print(json.dumps(signales, ensure_ascii=False, indent=2))
            return
        if not signales:
            print("Aucun cas à revoir.")
        for c in signales:
            print(f"- {c['titre']} : " + " ; ".join(c["raisons"]))
        return
    if args.enregistrer:
        if not args.auteur:
            print("Indiquer --auteur pour enregistrer.")
            sys.exit(2)
        r = cas_test.enregistrer(p, None, args.auteur, args.element)
        print(f"{len(r['ecrits'])} cas écrits en brouillon dans {r['dossier']}, {len(r['deja_presents'])} déjà présents (non modifiés).")
        return
    proposition = cas_test.proposer(p, args.element)
    print(json.dumps(proposition, ensure_ascii=False, indent=2) if args.json else cas_test.formater(proposition))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="referentiel", description="Référentiel métier vivant")
    sous = parser.add_subparsers(dest="commande", required=True)

    s = sous.add_parser("valider", help="vérifie la structure et la cohérence")
    s.add_argument("projet")
    s.set_defaults(func=cmd_valider)

    s = sous.add_parser("trous", help="liste les trous, les questions à poser et la couverture")
    s.add_argument("projet")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_trous)

    s = sous.add_parser("impact", help="ce qui dépend d'un élément")
    s.add_argument("projet")
    s.add_argument("id")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_impact)

    s = sous.add_parser("generer", help="génère la spec HTML et les diagrammes")
    s.add_argument("projet")
    s.add_argument("-o", "--sortie")
    s.set_defaults(func=cmd_generer)

    s = sous.add_parser("nouveau", help="crée un projet vide")
    s.add_argument("dossier")
    s.add_argument("id")
    s.add_argument("nom")
    s.set_defaults(func=cmd_nouveau)

    s = sous.add_parser("connexion", help="état de la connexion à Claude, ou connexion avec --login")
    s.add_argument("--login", action="store_true")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_connexion)

    s = sous.add_parser("demander", help="pose une question à Claude sur la base du projet")
    s.add_argument("projet")
    s.add_argument("question")
    s.add_argument("--portee", choices=["travail", "production", "histoire"], default="travail")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_demander)

    s = sous.add_parser("app", help="interface locale « Demander au référentiel »")
    s.add_argument("projet")
    s.add_argument("--port", type=int, default=8765)
    s.set_defaults(func=cmd_app)

    s = sous.add_parser("contexte", help="la base en un texte compact pour Claude (assistant, équipe de dev)")
    s.add_argument("projet")
    s.add_argument("--version", help="numéro, environnement (production, recette) ou travail")
    s.add_argument("-o", "--sortie", help="fichier à écrire, par exemple REFERENTIEL.md")
    s.add_argument("--sections", help="glossaire,acteurs,entites,regles,parcours,ecrans,trous")
    s.add_argument("--index", action="store_true", help="règles en titre seul (très grosses bases)")
    s.set_defaults(func=cmd_contexte)

    s = sous.add_parser("versions", help="versions figées et environnements")
    s.add_argument("projet")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_versions)

    s = sous.add_parser("comparer", help="ce qui change entre deux versions")
    s.add_argument("projet")
    s.add_argument("de")
    s.add_argument("a", nargs="?")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_comparer)

    s = sous.add_parser("figer", help="fige la version de travail sous un numéro")
    s.add_argument("projet")
    s.add_argument("version")
    s.add_argument("message")
    s.add_argument("--auteur")
    s.set_defaults(func=cmd_figer)

    s = sous.add_parser("evolution", help="évolutions et version cible")
    s.add_argument("projet")
    s.add_argument("action", choices=["lister", "creer", "cibler", "valider"])
    s.add_argument("valeur", nargs="?", help="nom (creer) ou identifiant (cibler, valider)")
    s.add_argument("cible_pos", nargs="?", help="nouvelle cible (cibler)")
    s.add_argument("--cible", help="version cible à la création : 1.6 ou plus-tard")
    s.add_argument("--auteur")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_evolution)

    s = sous.add_parser("livraisons", help="quelle version de code applique quelle spec")
    s.add_argument("projet")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_livraisons)

    s = sous.add_parser("tests", help="cas de test proposés à partir des règles validées")
    s.add_argument("projet")
    s.add_argument("--element", help="une règle ou une action")
    s.add_argument("--json", action="store_true")
    s.add_argument("--enregistrer", action="store_true", help="écrit les cas en brouillon dans recette/cas")
    s.add_argument("--auteur")
    s.add_argument("--a-revoir", action="store_true", help="cas enregistrés dont une source a changé")
    s.set_defaults(func=cmd_tests)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
