"""Sujets en attente : les questions ouvertes du projet (sujets.yaml), relevées par Alimenter, le cahier des charges,
le moodboard, les maquettes, ou ajoutées à la main. On les tranche ici ; une réponse peut ensuite mettre la base à
jour (via une demande à Watson, à valider comme toujours).

À côté, ce que la base marque elle-même comme pas encore décidé : écrans et scénarios « à trancher », règles
proposées.
"""

from __future__ import annotations

from pathlib import Path

from ._vendor import yaml
from .chargement import charger
from .ecriture import ErreurEcriture, aujourdhui, dump

ENTETE = "# Questions ouvertes relevées dans les documents. statut : ouvert | tranche\n"


def _fichier(racine: Path) -> Path:
    return Path(racine) / "sujets.yaml"


def lire(racine: Path) -> list[dict]:
    f = _fichier(racine)
    return (yaml.safe_load(f.read_text(encoding="utf-8")) or []) if f.exists() else []


def _ecrire(racine: Path, sujets: list[dict]):
    _fichier(racine).write_text(ENTETE + dump(sujets), encoding="utf-8")


def vue(racine: Path) -> dict:
    p = charger(racine)
    sujets = lire(racine)
    a_trancher = []
    for i, e in p.ecrans.items():
        if e.get("a_trancher"):
            a_trancher.append({"id": i, "nom": e["nom"], "genre": "Écran", "onglet": "ecrans"})
    for i, s in p.scenarios.items():
        if s.get("a_trancher"):
            a_trancher.append({"id": i, "nom": s["nom"], "genre": "Scénario", "onglet": "scenarios"})
        for et in s["etapes"]:
            if et.get("a_trancher"):
                a_trancher.append({"id": f"{i}.{et['id']}", "nom": f"{et['libelle']} ({s['nom']})", "genre": "Étape", "onglet": "scenarios"})
    for i, r in p.regles.items():
        if r.get("statut") == "proposee":
            a_trancher.append({"id": i, "nom": r["titre"], "genre": "Règle proposée", "onglet": "regles"})
    sources = sorted({(s.get("source") or "").split(" (")[0] for s in sujets if s.get("source")})
    return {"sujets": sujets, "a_trancher": a_trancher, "sources": sources,
            "ouverts": sum(1 for s in sujets if s.get("statut", "ouvert") == "ouvert")}


def ajouter(racine: Path, question: str, contexte: str, auteur: str) -> dict:
    from .alimentation import noter_questions

    question = (question or "").strip()
    if not question:
        raise ErreurEcriture("Question vide.")
    noter_questions(Path(racine), [{"question": question, "contexte": (contexte or "").strip(), "source": "Ajoutée à la main"}], auteur, aujourdhui())
    return lire(racine)[-1]


def mettre_a_jour(racine: Path, qid: str, champs: dict, auteur: str) -> dict:
    sujets = lire(racine)
    q = next((s for s in sujets if s.get("id") == qid), None)
    if not q:
        raise ErreurEcriture("Question inconnue.")
    for k in ("question", "contexte"):
        if k in champs and str(champs[k]).strip():
            q[k] = str(champs[k]).strip()
    if "reponse" in champs:
        q["reponse"] = str(champs["reponse"] or "").strip()
        if not q["reponse"]:
            q.pop("reponse")
    if champs.get("statut") == "tranche":
        if not q.get("reponse"):
            raise ErreurEcriture("Écris la réponse avant de trancher.")
        q.update(statut="tranche", tranche_le=aujourdhui(), tranche_par=auteur)
    elif champs.get("statut") == "ouvert":
        q["statut"] = "ouvert"
        q.pop("tranche_le", None)
        q.pop("tranche_par", None)
    if champs.get("lot"):
        q["mise_a_jour"] = str(champs["lot"])
    _ecrire(racine, sujets)
    return q


def supprimer(racine: Path, qid: str) -> None:
    sujets = lire(racine)
    if not any(s.get("id") == qid for s in sujets):
        raise ErreurEcriture("Question inconnue.")
    _ecrire(racine, [s for s in sujets if s.get("id") != qid])


def consigne(q: dict) -> str:
    """La demande à Watson qui reporte une réponse dans la base."""
    return (f"Une question ouverte du projet vient d'être tranchée. Mets la base à jour en conséquence (règles, données, "
            f"étapes, écrans), sans rien ajouter d'autre.\nQuestion : {q['question']}\n"
            + (f"Contexte : {q['contexte']}\n" if q.get("contexte") else "") + f"Réponse décidée : {q.get('reponse', '')}")
