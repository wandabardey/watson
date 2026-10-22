"""Alimenter un projet à partir de documents : extraction, propositions vérifiées, tri appliqué."""

from __future__ import annotations

import base64
import io
import json
import shutil
import zipfile
from pathlib import Path

import pytest

from referentiel import alimentation
from referentiel._vendor import yaml
from referentiel.chargement import charger

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


def docx(*paragraphes):
    corps = "".join(f'<w:p><w:r><w:t xml:space="preserve">{p}</w:t></w:r></w:p>' for p in paragraphes)
    f = io.BytesIO()
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("word/document.xml", f'<?xml version="1.0"?><w:document xmlns:w="x"><w:body>{corps}</w:body></w:document>')
    return f.getvalue()


def test_extraction_des_formats():
    assert alimentation.extraire_texte("cr.docx", docx("Décision : délai &amp; relance", "Deuxième ligne")) == \
        "Décision : délai & relance\nDeuxième ligne"
    vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Wanda>On garde trois jours.\n"
    assert alimentation.extraire_texte("meet.vtt", vtt.encode()) == "Wanda : On garde trois jours."
    assert alimentation.extraire_texte("p.html", b"<p>Un</p><script>x</script><p>Deux</p>") == "Un\nDeux"
    with pytest.raises(alimentation.ErreurAlimentation, match="Format non pris en charge"):
        alimentation.extraire_texte("image.png", b"x")
    with pytest.raises(alimentation.ErreurAlimentation, match="Aucun texte"):
        alimentation.extraire_texte("vide.txt", b"  ")


def test_extraction_pdf():
    pypdf = pytest.importorskip("pypdf")
    w = pypdf.PdfWriter()
    w.add_blank_page(100, 100)
    f = io.BytesIO()
    w.write(f)
    with pytest.raises(alimentation.ErreurAlimentation, match="Aucun texte"):
        alimentation.extraire_texte("scan.pdf", f.getvalue())


REPONSE = {
    "resume": "Le comité fixe un délai de litige et soulève une question sur les transporteurs.",
    "propositions": [
        {"type": "acteur", "action": "creer", "titre": "Douanier", "pourquoi": "Il contrôle les documents.",
         "citation": {"document": "DOC-1", "extrait": "le douanier contrôle"}, "conflit": "",
         "contenu": {"id": "ACT-DOUANIER", "nom": "Douanier"}},
        # RG-001 existe déjà : renuméroté, et la référence de la question suit.
        {"type": "regle", "action": "creer", "titre": "Délai de litige", "pourquoi": "Décidé en comité.",
         "citation": {"document": "DOC-1", "extrait": "trois jours"}, "conflit": "",
         "contenu": {"id": "RG-001", "titre": "Délai de litige de trois jours", "statut": "validee", "type": "contrainte",
                     "entite": "ENT-EXPEDITION", "enonce": "Un litige se signale sous trois jours."}},
        {"type": "regle", "action": "creer", "titre": "Mal formée", "pourquoi": "x",
         "citation": {"document": "DOC-1", "extrait": "x"}, "conflit": "", "contenu": {"id": "RG-050", "titre": "Sans énoncé"}},
        {"type": "question", "action": "creer", "titre": "Transporteurs étrangers", "pourquoi": "Non tranché.",
         "citation": {"document": "DOC-2", "extrait": "à voir pour l'étranger"}, "conflit": "",
         "contenu": {"question": "Le délai vaut-il pour les transporteurs étrangers ?", "contexte": "Comité"}},
    ],
}


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie"))
    return racine


def faux_claude(reponse):
    sdk = pytest.importorskip("claude_agent_sdk")
    vus = {}

    async def requete(prompt, options):
        vus["prompt"], vus["options"] = prompt, options
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1,
                                session_id="s", result=json.dumps(reponse))

    return requete, vus


def test_analyser_puis_appliquer(projet):
    requete, vus = faux_claude(REPONSE)
    lot = alimentation.analyser("fret", projet, [
        {"nom": "CR comité.docx", "contenu_base64": base64.b64encode(docx("Le douanier contrôle.", "Trois jours.")).decode()},
        {"titre": "Mail de Paul", "texte": "À voir pour l'étranger."},
    ], requete=requete)
    # Claude n'a aucun outil, la base et les documents lui sont donnés.
    assert vus["options"].tools == [] and vus["options"].max_turns == 1
    assert "Douanier" not in vus["options"].system_prompt and "<document id=\"DOC-1\"" in vus["prompt"]
    assert "Expédition" in vus["options"].system_prompt
    props = lot["propositions"]
    assert props[1]["contenu"]["id"] == "RG-002" or props[1]["contenu"]["id"] not in charger(projet).fichiers
    assert "invalide" in props[2] and "invalide" not in props[0]
    assert alimentation.lots("fret")[0]["propositions"] == 4

    r = alimentation.appliquer("fret", projet, lot["id"], [
        {"index": 0, "accepte": True}, {"index": 1, "accepte": True, "contenu": {**props[1]["contenu"], "statut": "proposee"}},
        {"index": 2, "accepte": True}, {"index": 3, "accepte": True},
    ], "Wanda Bardey")
    assert [e["id"] for e in r["ecrits"]][0] == "ACT-DOUANIER" and len(r["ecrits"]) == 2 and r["questions"] == 1
    p = charger(projet)
    assert not p.erreurs and "ACT-DOUANIER" in p.acteurs
    nouvelle = p.regles[props[1]["contenu"]["id"]]
    assert nouvelle["statut"] == "proposee" and "SRC-001" in nouvelle["source"] and nouvelle["historique"][-1]["auteur"] == "Wanda Bardey"
    index = yaml.safe_load((projet / "sources" / "index.yaml").read_text(encoding="utf-8"))
    assert [s["id"] for s in index] == ["SRC-001", "SRC-002"] and index[0]["fichier"].endswith(".docx")
    assert (projet / "sources" / index[0]["fichier"]).exists() and "Trois jours" in (projet / "sources" / index[0]["texte"]).read_text()
    assert set(index[0]["elements"]) == {"ACT-DOUANIER", nouvelle["id"]}
    sujets = yaml.safe_load((projet / "sujets.yaml").read_text(encoding="utf-8"))
    assert sujets[0]["id"] == "Q-001" and sujets[0]["source"].startswith("Mail de Paul")
    assert "Alimentation : CR comité, Mail de Paul (2 éléments, 1 question)" == r["message"]
    assert alimentation.lots("fret") == []


def test_reference_absente_refusee_sans_bloquer(projet):
    reponse = {"resume": "", "propositions": [
        {"type": "regle", "action": "creer", "titre": "Orpheline", "pourquoi": "x", "citation": {"document": "DOC-1", "extrait": "x"},
         "conflit": "", "contenu": {"id": "RG-100", "titre": "Orpheline", "statut": "proposee", "type": "contrainte",
                                    "entite": "ENT-INCONNUE", "enonce": "Vise une entité écartée."}},
        {"type": "acteur", "action": "creer", "titre": "Pilote", "pourquoi": "x", "citation": {"document": "DOC-1", "extrait": "x"},
         "conflit": "", "contenu": {"id": "ACT-PILOTE", "nom": "Pilote"}},
    ]}
    requete, _ = faux_claude(reponse)
    lot = alimentation.analyser("fret", projet, [{"titre": "Notes", "texte": "Notes."}], requete=requete)
    r = alimentation.appliquer("fret", projet, lot["id"], [{"index": 0, "accepte": True}, {"index": 1, "accepte": True}], "W")
    assert [e["id"] for e in r["ecrits"]] == ["ACT-PILOTE"] and r["refus"][0]["titre"] == "Orpheline"
    assert not charger(projet).erreurs


def test_regle_qui_en_remplace_une_autre(projet):
    reponse = {"resume": "", "propositions": [
        {"type": "regle", "action": "creer", "titre": "Cinq jours", "pourquoi": "x", "conflit": "Remplace l'ancien délai.",
         "citation": {"document": "DOC-1", "extrait": "passe à 5 jours"},
         "contenu": {"id": "RG-008", "titre": "Litige sous cinq jours ouvrés", "statut": "validee", "type": "contrainte",
                     "entite": "ENT-EXPEDITION", "enonce": "Un litige se signale sous cinq jours ouvrés.", "remplace": "RG-005"}}]}
    requete, _ = faux_claude(reponse)
    lot = alimentation.analyser("fret", projet, [{"titre": "Comité", "texte": "Le délai passe à 5 jours."}], requete=requete)
    assert lot["propositions"][0]["remplace"]["id"] == "RG-005"
    r = alimentation.appliquer("fret", projet, lot["id"], [{"index": 0, "accepte": True}], "W")
    p = charger(projet)
    assert r["ecrits"][0]["action"] == "créé, remplace RG-005"
    assert p.regles["RG-005"]["statut"] == "obsolete" and p.regles["RG-008"]["remplace"] == "RG-005"


def test_liste_de_valeurs_et_liens(projet):
    reponse = {"resume": "", "propositions": [
        {"type": "liste", "action": "creer", "titre": "Type de véhicule", "pourquoi": "x", "conflit": "",
         "citation": {"document": "DOC-1", "extrait": "camion ou fourgon"},
         "contenu": {"id": "LST-TYPE-VEHICULE", "nom": "Type de véhicule", "valeurs": [{"nom": "Camion"}, {"nom": "Fourgon"}]}},
        {"type": "entite", "action": "creer", "titre": "Véhicule", "pourquoi": "x", "conflit": "",
         "citation": {"document": "DOC-1", "extrait": "véhicule de la société"},
         "contenu": {"id": "ENT-VEHICULE", "nom": "Véhicule", "attributs": [
             {"nom": "immatriculation", "libelle": "Immatriculation", "type": "texte"},
             {"nom": "type_vehicule", "libelle": "Type", "type": "liste", "cible": "LST-TYPE-VEHICULE"},
             {"nom": "societe", "libelle": "Société", "type": "reference", "cible": "ENT-SOCIETE"},
             {"nom": "chauffeur", "libelle": "Chauffeur", "type": "reference", "cible": "ENT-CHAUFFEUR", "optionnel": True}]}},
        {"type": "entite", "action": "creer", "titre": "Chauffeur", "pourquoi": "x", "conflit": "",
         "citation": {"document": "DOC-1", "extrait": "chauffeur"}, "contenu": {"id": "ENT-CHAUFFEUR", "nom": "Chauffeur"}},
    ]}
    requete, vus = faux_claude(reponse)
    lot = alimentation.analyser("fret", projet, [{"titre": "Notes", "texte": "Véhicules."}], requete=requete)
    assert '"liste"' in vus["options"].system_prompt and not any("invalide" in p for p in lot["propositions"])
    # Le chauffeur est écarté : le lien devient du texte, le reste s'enregistre.
    r = alimentation.appliquer("fret", projet, lot["id"], [{"index": 0, "accepte": True}, {"index": 1, "accepte": True}], "W")
    p = charger(projet)
    assert not p.erreurs and "LST-TYPE-VEHICULE" in p.listes
    attrs = {a["nom"]: a for a in p.entites["ENT-VEHICULE"]["attributs"]}
    assert attrs["societe"]["cible"] == "ENT-SOCIETE" and attrs["chauffeur"]["type"] == "texte" and "cible" not in attrs["chauffeur"]
    assert any("Chauffeur" in t for t in r["retouches"])
