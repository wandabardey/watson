"""La méthode 4ward lue sur le poste, jamais copiée : détection, choix dans Paramètres, consignes par tâche."""

import json

import pytest

from referentiel import methode, reglages


def installer(racine, version, avec_equipe=True):
    d = racine / "cache" / "4sh" / "4ward" / version
    (d / ".claude-plugin").mkdir(parents=True)
    (d / ".claude-plugin" / "plugin.json").write_text(json.dumps({"version": version}))
    for rel, texte in {
        "skills/4SH-deck-commercial/SKILL.md": "---\nname: x\n---\n# Deck\nTrame en neuf temps." + ("\n## Travailler en équipe\nOutils Confluence." if avec_equipe else ""),
        "skills/4SH-accueil/references/hypotheses-et-incertitudes.md": "Marquer [À CONFIRMER].",
        "skills/4SH-direction-artistique/SKILL.md": "Trois dials.",
    }.items():
        (d / rel).parent.mkdir(parents=True, exist_ok=True)
        (d / rel).write_text(texte, encoding="utf-8")
    return d


def test_sans_4ward_consignes_de_base(tmp_path):
    assert methode.consignes("proposition") == methode.BASE and not methode.etat()["trouve"]


def test_detection_de_la_plus_recente(tmp_path, monkeypatch):
    racine = tmp_path / "plugins"
    installer(racine, "0.9.0")
    recent = installer(racine, "0.60.0")
    (racine / ".trash" / "x" / "skills" / "4SH-deck-commercial").mkdir(parents=True)
    monkeypatch.setenv("WATSON_4WARD_RACINES", str(racine))
    methode.oublier_cache()
    e = methode.etat()
    assert e["trouve"] and e["version"] == "0.60.0" and e["chemin"] == str(recent)
    texte = methode.consignes("proposition")
    assert "Trame en neuf temps" in texte and "Outils Confluence" not in texte  # la section d'équipe est retirée
    assert "name: x" not in texte and "[À CONFIRMER]" in texte and "Trois dials" not in texte
    assert "Trois dials" in methode.consignes("moodboard")


def test_dossier_choisi_dans_parametres(tmp_path):
    d = installer(tmp_path / "ailleurs", "0.42.0")
    with pytest.raises(reglages.ErreurReglages, match="ne contient pas 4ward"):
        reglages.ecrire({"dossier_4ward": str(tmp_path)})
    reglages.ecrire({"dossier_4ward": str(d)})
    assert methode.etat()["version"] == "0.42.0" and reglages.vue()["methode"]["choisi"] == str(d)
    reglages.ecrire({"dossier_4ward": ""})
    assert not methode.etat()["trouve"]
