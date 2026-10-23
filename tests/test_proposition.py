"""Proposition commerciale : deck rédigé par Claude, gardé, retouché slide par slide, exporté en PDF et PowerPoint."""

import base64
import io
import json
import shutil
from pathlib import Path

import pytest

from referentiel import maquettes as mq
from referentiel import proposition as pr

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "maison"))
    (tmp_path / "maison" / "Downloads").mkdir(parents=True)
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


DECK = {"titre": "Proposition fret", "client": "Fret international", "a_confirmer": ["Budget"], "slides": [
    {"id": "couverture", "type": "couverture", "titre": "Chaque expédition suivie \u2014 de bout en bout", "sous_titre": "Web et mobile"},
    {"id": "s1", "type": "section", "sur_titre": "01", "titre": "Votre besoin", "sous_titre": "Notre compréhension"},
    {"id": "besoin", "type": "besoin", "titre": "Des expéditions bloquées", "points": [{"titre": "Documents tardifs", "texte": "la veille du départ"}],
     "colonne": {"titre": "Vos objectifs", "points": ["Annoncer en 5 minutes"]}, "notes": "Ouverture."},
    {"id": "ecran", "type": "maquette", "titre": "Vérifier en un coup d'œil", "maquette": "inexistante", "points": [{"titre": "Le dossier"}]},
    {"id": "casse", "type": "lots", "titre": "Lots", "lots": [{"sous_titre": "sans nom"}]},
    {"id": "besoin", "type": "merci", "titre": "Merci !"}]}


def test_rediger_garder_retoucher(projet):
    mq.importer(projet, "d.html", base64.b64encode(b"<p>x</p>").decode(), titre="Détail", ecran="SCR-002")
    requete, vus = faux_claude(DECK)
    att = pr.rediger("fret", projet, demande="insister sur le mobile", requete=requete)
    sp = vus["options"].system_prompt
    assert "insister sur le mobile" in sp and "Maquettes disponibles" in sp and "detail" in sp and "Périmètre par version" in sp
    assert [s["id"] for s in att["slides"]] == ["couverture", "s1", "besoin", "ecran", "besoin-2"] and att["ecartees"] == 1
    assert "maquette" not in att["slides"][3] and "\u2014" not in att["slides"][0]["titre"]
    p = pr.garder("fret", projet)
    assert p["titre"] == "Proposition fret" and p["date"] and len(p["slides"]) == 5
    requete2, vus2 = faux_claude({"titre": "x", "client": "y", "slides": [{"id": "autre", "type": "besoin", "titre": "Trois blocages", "notes": "N"}]})
    pr.rediger("fret", projet, slide="besoin", requete=requete2)
    assert '"id": "besoin"' in vus2["options"].system_prompt
    p = pr.garder("fret", projet)
    assert p["slides"][2] == {"id": "besoin", "type": "besoin", "titre": "Trois blocages", "notes": "N"} and len(p["slides"]) == 5
    with pytest.raises(pr.ErreurAvantProjet):
        pr.enregistrer(projet, {"slides": [{"id": "a", "type": "inconnu", "titre": "x"}]})


def test_exports(projet):
    pytest.importorskip("PIL")
    from PIL import Image
    pr.enregistrer(projet, {"titre": "Proposition fret", "slides": [{"id": "a", "type": "couverture", "titre": "A", "notes": "Dire bonjour"},
                                                                    {"id": "b", "type": "merci", "titre": "Merci"}]})
    imgs = []
    for c in ("red", "black"):
        t = io.BytesIO()
        Image.new("RGB", (192, 108), c).save(t, "PNG")
        imgs.append("data:image/png;base64," + base64.b64encode(t.getvalue()).decode())
    r = pr.exporter(projet, "pdf", imgs)
    assert r["nom"] == "Proposition fret.pdf" and Path(r["chemin"]).read_bytes().startswith(b"%PDF")
    assert pr.exporter(projet, "pdf", imgs)["nom"] == "Proposition fret (2).pdf"
    pptx = pytest.importorskip("pptx")
    r = pr.exporter(projet, "pptx", imgs)
    pres = pptx.Presentation(r["chemin"])
    assert len(pres.slides) == 2 and pres.slides[0].notes_slide.notes_text_frame.text == "Dire bonjour"
