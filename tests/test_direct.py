"""App en direct : vue par écran (adresse, spec, maquette, guide, écarts), relevé d'écarts en anomalie, évolution
ou question, ticket rédigé, critique de l'écran réel."""

import base64
import json
import shutil
from pathlib import Path

import pytest

from referentiel import avancement as av
from referentiel import backlog
from referentiel import direct as di
from referentiel.chargement import charger

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    y = (racine / "projet.yaml").read_text().replace("{id: APP-PORTAIL, nom: Portail fret, support: web,",
                                                     "{id: APP-PORTAIL, nom: Portail fret, support: web, adresses: [{nom: Recette, url: 'https://recette.fret.fr/'}],")
    (racine / "projet.yaml").write_text(y)
    return racine


def test_vue_par_ecran(projet):
    assert not charger(projet).erreurs
    av.lier(projet, "SCR-001", [], "/expeditions/nouvelle")
    e = {x["id"]: x for x in di.vue(projet)["ecrans"]}["SCR-001"]
    assert e["adresses"] == [{"nom": "Recette", "url": "https://recette.fret.fr/expeditions/nouvelle"}]
    assert "Saisie d'une expédition" in e["spec"] and e["regles"] and e["etat"] == "a_maquetter"


def test_relever(projet):
    r = di.relever(projet, {"ecran": "SCR-001", "constat": "Le bouton Soumettre reste actif sans poids\nmême vide", "attendu": "Bouton bloqué",
                            "etapes": ["Ouvrir la saisie", "Laisser le poids vide", ""], "environnement": "Recette", "capture": PNG}, "Wanda")
    e = r["ecart"]
    assert e["id"] == "ECA-001" and e["titre"] == "Le bouton Soumettre reste actif sans poids" and e["etapes"] == ["Ouvrir la saisie", "Laisser le poids vide"]
    assert (projet / e["capture"]).exists()
    assert "*Attendu*" in r["ticket"] and "RG-001" in r["ticket"] and "# Laisser le poids vide" in r["ticket"] and "\u2014" not in r["ticket"]
    assert not charger(projet).erreurs
    assert di.relever(projet, {"ecran": "SCR-001", "constat": "x"}, "W")["ecart"]["id"] == "ECA-002"
    di.changer(projet, "ECA-001", "transmis")
    assert di.ecarts(projet)[0]["statut"] == "transmis"
    r = di.relever(projet, {"ecran": "SCR-002", "genre": "evolution", "constat": "Il faudrait l'historique"}, "Wanda")
    evo = backlog.lire(projet, r["evolution"])
    assert evo["origine"] == "App en direct" and "Détail d'une expédition" in evo["besoin"]
    di.relever(projet, {"ecran": "SCR-002", "genre": "question", "constat": "Qui peut annuler ?"}, "Wanda")
    assert "Qui peut annuler ?" in (projet / "sujets.yaml").read_text()
    with pytest.raises(di.ErreurDirect):
        di.relever(projet, {"ecran": "SCR-002", "constat": " "}, "W")
    with pytest.raises(di.ErreurDirect):
        di.relever(projet, {"ecran": "SCR-002", "constat": "x", "capture": "data:text/html;base64,AA=="}, "W")


def test_critique_ecran_reel(projet, tmp_path):
    sdk = pytest.importorskip("claude_agent_sdk")
    from referentiel import studio

    vus = []

    async def requete(prompt, options):
        async for m in prompt:
            vus.append((options.system_prompt, m))
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps({"verdict": "À reprendre.", "points": [{"gravite": "majeur", "constat": "Pas de résumé", "recommandation": "Ajouter"}]}))

    r = studio.relire("p", projet, {"type": "ecran_reel", "id": "SCR-001"}, "", PNG, requete)
    assert r["avec_capture"] and r["cible"]["nom"].startswith("Écran « Saisie")
    systeme, m = vus[0]
    assert "telle qu'elle fonctionne" in systeme and "anomalie" in systeme
    contenu = m["message"]["content"]
    assert contenu[0]["type"] == "image" and "tel qu'il s'affiche dans l'application" in contenu[1]["text"]
