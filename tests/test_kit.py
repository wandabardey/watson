"""Kit de présentation 4SH : import depuis un dossier du poste, visuels, bloc « Présentation de 4SH », insertion dans le
deck, et planning et budget du deck remplis par le chiffrage."""

import shutil
from pathlib import Path

import pytest

from referentiel import chiffrage as ch
from referentiel import kit
from referentiel import proposition as pr

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_import_et_presentation(tmp_path, projet):
    src = tmp_path / "kit"
    src.mkdir()
    with pytest.raises(kit.ErreurKit):
        kit.importer(str(src))
    (src / "logo-4sh-couleur.png").write_bytes(PNG)
    (src / "references-clients.png").write_bytes(PNG)
    (src / "secret.txt").write_text("x")
    (src / "presentation-4sh.yaml").write_text("""releve: Octobre 2026
slides:
  - {id: section, type: section, titre: "4SH, votre partenaire"}
  - {id: offre, type: cartes, titre: Sur mesure, points: [{icone: fusee, titre: Du build au run}]}
  - {id: casse, type: inconnu, titre: x}
""", encoding="utf-8")
    e = kit.importer(str(src))
    assert e["present"] and e["presentation"] == 3 and e["releve"] == "Octobre 2026" and "contenu-coin-rouge.png" in e["manquantes"]
    assert not (kit.dossier() / "secret.txt").exists() and kit.images()["logo-4sh-couleur.png"].startswith("data:image/png;base64,")
    bloc = kit.slides_presentation()
    assert [s["id"] for s in bloc] == ["4sh-section", "4sh-offre"]
    slides = [{"id": "couverture", "type": "couverture", "titre": "Fret"}, {"id": "besoin", "type": "texte", "titre": "Besoin"}]
    r = pr.avec_presentation(slides)
    assert [s["id"] for s in r] == ["couverture", "4sh-section", "4sh-offre", "besoin"] and pr.avec_presentation(r) == r
    assert "insérée par Watson depuis le kit" in pr._consignes("", "", None, None)
    assert kit.oublier()["present"] is False and "[À CONFIRMER]" in pr._consignes("", "", None, None)


def test_planning_et_budget_depuis_le_chiffrage(projet):
    ch.enregistrer(projet, {"tjm": 620, "profils": [{"nom": "PO", "jours_par_sprint": 13.5}],
                            "phases": [{"id": "cadrage", "nom": "Cadrage", "modalite": "forfait", "jours": 15, "semaines": 3, "livrables": "dossier de conception"},
                                       {"id": "mvp", "nom": "MVP", "modalite": "sprints", "sprints": 4}, {"id": "socle", "nom": "Socle complet", "modalite": "estimation", "sprints": 7}],
                            "annonce": ["cadrage", "mvp"], "options": ["x"], "recurrent": ["hébergement, MCO"], "jalons": [{"semaine": 3, "libelle": "Conception validée"}]})
    slides = pr.depuis_chiffrage(projet, [{"id": "planning", "type": "planning", "titre": "Une démarche"}, {"id": "budget", "type": "budget", "titre": "Un engagement clair", "notes": "n"}])
    pl, bu = slides
    assert [p["nom"] for p in pl["phases"]] == ["Cadrage", "MVP", "Socle complet"] and pl["phases"][1]["debut"] == 4 and pl["jalons"][0]["semaine"] == 3
    assert bu["sur_titre"] == "Pour démarrer : cadrage" and bu["chiffres"][0]["valeur"] == "9 300 € HT" and bu["notes"] == "n"
    assert bu["lignes"][1] == {"libelle": "MVP", "detail": "4 sprints", "valeur": "33 480 € HT"}
    assert bu["colonne"]["lignes"][0]["valeur"] == "58 590 € HT" and bu["colonne"]["valeur"].startswith("~ ")
    assert "13,5 jours" in bu["texte"]
    pr.enregistrer(projet, {"slides": slides + [{"id": "x", "type": "cartes", "titre": "x", "points": [{"titre": "a", "icone": "inexistant"}]}]})
    assert "icone" not in pr.lire(projet)["slides"][2]["points"][0]
