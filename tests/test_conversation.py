"""Conversation avec Watson : réponse sourcée, question de précision, changement en lot, documents et liens en lot,
contexte de l'écran, conversation gardée par projet."""

import base64
import json
import shutil
from pathlib import Path

import pytest

from referentiel import conversation as cv

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def faux_claude(*reponses):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = []
    file = list(reponses)

    async def requete(prompt, options):
        texte = prompt
        if not isinstance(prompt, str):
            texte = ""
            async for m in prompt:
                c = m["message"]["content"]
                texte += c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
        vus.append((options.system_prompt, texte))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps(file.pop(0)))

    return requete, vus


def dernier(pid="p"):
    return cv.lire(pid)["messages"][-1]


def test_reponse_sourcee_avec_contexte(projet):
    requete, vus = faux_claude({"action": "repondre", "message": "Oui \u2014 trois champs sont obligatoires.",
                                "sources": [{"type": "règle", "nom": "Champs obligatoires", "identifiant": "RG-001"}],
                                "ecrans": ["regles", "inconnu"], "suggestions": ["Et le poids ?"]})
    cv.envoyer("p", projet, "Qu'est-ce qui est obligatoire ici ?", [], {"zone": "ecrans", "element": {"type": "écran", "id": "SCR-001", "nom": "Saisie"}},
               "Wanda", requete=requete, synchrone=True)
    m = dernier()
    assert m["etat"] == "fini" and m["action"] == "repondre" and m["texte"] == "Oui, trois champs sont obligatoires."
    assert m["sources"][0]["identifiant"] == "RG-001" and m["ecrans"] == ["regles"] and m["suggestions"] == ["Et le poids ?"]
    systeme, message = vus[0]
    assert "« Écrans »" in systeme and "SCR-001" in systeme and "Champs obligatoires" in systeme
    assert cv.lire("p")["messages"][0]["ecran"]["zone"] == "ecrans"
    # Le message suivant voit l'historique.
    requete, vus = faux_claude({"action": "preciser", "message": "Tu parles de quel acteur ?",
                                "question": {"texte": "Pour quel acteur ?", "options": ["Expéditeur", "Transporteur"]}})
    cv.envoyer("p", projet, "Et pour lui ?", [], {}, "Wanda", requete=requete, synchrone=True)
    assert "Wanda : Qu'est-ce qui est obligatoire ici ?" in vus[0][0]
    assert dernier()["question"] == {"texte": "Pour quel acteur ?", "options": ["Expéditeur", "Transporteur"]}


def test_modifier_devient_un_lot(projet):
    requete, vus = faux_claude(
        {"action": "modifier", "message": "Je prépare l'ajout.", "consigne": "Ajouter une règle : le poids est limité à 30 tonnes."},
        {"resume": "Une règle", "propositions": []})
    cv.envoyer("p", projet, "Ajoute une limite de 30 tonnes", [], {}, "Wanda", requete=requete, synchrone=True)
    m = dernier()
    assert m["action"] == "modifier" and m["lot"]["propositions"] == 0 and m["lot"]["id"]
    assert "30 tonnes" in vus[1][1]


def test_documents_et_liens(projet):
    def telecharger(url):
        return b"<html><title>Compte rendu atelier</title><body><p>Le transporteur signale un litige sous 48 heures.</p></body></html>", "text/html"
    l = cv.lire_lien("https://exemple.fr/cr", telecharger)
    assert l["titre"] == "Compte rendu atelier" and "48 heures" in l["texte"]
    with pytest.raises(cv.ErreurConversation):
        cv.lire_lien("https://www.figma.com/design/abc")

    requete, vus = faux_claude(
        {"action": "alimenter", "message": "Un compte rendu d'atelier sur les litiges.", "consigne": "Les délais de litige"},
        {"resume": "Délais", "propositions": []})
    cv.envoyer("p", projet, "Voilà le CR", [{"nom": "cr.txt", "contenu_base64": base64.b64encode("Délai de litige : 48 heures.".encode()).decode()}],
               {}, "Wanda", requete=requete, synchrone=True)
    m = dernier()
    assert m["action"] == "alimenter" and "lot" in m
    assert "48 heures" in vus[0][1] and "Les délais de litige" in vus[1][1]
    assert cv.lire("p")["messages"][-2]["pieces"] == [{"nom": "cr.txt"}]


def test_garde_fous(projet):
    with pytest.raises(cv.ErreurConversation):
        cv.envoyer("p", projet, "  ", [], {}, "W", synchrone=True)
    requete, _ = faux_claude({"action": "alimenter", "message": "Rien à lire"})
    cv.envoyer("p", projet, "Bonjour", [], {}, "W", requete=requete, synchrone=True)
    assert dernier()["action"] == "repondre"
    cv.effacer("p")
    assert cv.lire("p")["messages"] == []
