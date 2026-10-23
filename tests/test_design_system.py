"""Design system : gammes de nuances, fondations depuis le moodboard, catalogue du starter, détection d'un projet codé,
variables CSS, injection dans les maquettes."""

import json
import shutil
from pathlib import Path

import pytest

from referentiel import design_system as dsm
from referentiel.chargement import charger

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
INDEX = """# Index des composants

## actions
- ✅ `ui-button` \u2014 Bouton (variantes, tailles)
- ⬜ `ui-button-group` \u2014 Groupe de boutons

## forms
- ✅ `ui-input` \u2014 Champ texte
"""


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_gamme_garde_la_couleur_et_va_du_clair_au_sombre():
    g = dsm.gamme("#685EAE")
    assert list(g) == dsm.NUANCES
    assert "#685eae" in g.values()
    lum = [sum(int(v[i:i + 2], 16) for i in (1, 3, 5)) for v in g.values()]
    assert lum == sorted(lum, reverse=True)
    with pytest.raises(dsm.ErreurDesignSystem):
        dsm.gamme("violet")


def test_depuis_piste_et_variables():
    piste = {"couleurs": [{"nom": "Encre", "hex": "#123456", "role": "marque"}, {"nom": "Corail", "hex": "#ff7755", "role": "accent"}],
             "typo": {"titres": "Asap", "texte": "Inter"}, "formes": {"rayon": 6, "ombre": "aucune"}, "dials": {"motion": 2}}
    f = dsm.depuis_piste(piste)
    prim = next(c for c in f["couleurs"] if c["id"] == "primaire")
    assert prim["base"] == "#123456" and "#123456" in prim["nuances"].values()
    assert f["typo"]["titres"] == "Asap" and f["rayons"]["defaut"] == 6 and f["ombres"]["legere"] == "none"
    css = dsm.variables_css(f)
    assert "--couleur-primaire-500" in css and "--police-titres: 'Asap'" in css and "prefers-reduced-motion" in css
    assert "\u2014" not in css


def test_catalogue_starter_et_enregistrement(projet):
    ds = dsm.partir_du_starter(projet, lire_url=lambda url: INDEX)
    assert [c["id"] for c in ds["composants"]] == ["ui-button", "ui-button-group", "ui-input"]
    assert ds["composants"][1]["statut"] == "a_construire" and ds["composants"][2]["famille"] == "forms"
    assert ds["source"]["genre"] == "starter"
    assert (projet / "design-system" / "systeme.yaml").exists()
    assert not charger(projet).erreurs
    # Un composant sur mesure et un statut modifié survivent à une nouvelle lecture du catalogue.
    ds["composants"][0]["statut"] = "utilise"
    ds["composants"].append({"id": "carte-expedition", "nom": "Carte d'expédition", "statut": "sur_mesure"})
    dsm.enregistrer(projet, ds)
    ds2 = dsm.partir_du_starter(projet, lire_url=lambda url: INDEX)
    assert ds2["composants"][0]["statut"] == "utilise"
    assert any(c["id"] == "carte-expedition" for c in ds2["composants"])
    v = dsm.vue(projet)
    assert v["existe"] and "--couleur-primaire-50" in v["css"]


def test_enregistrer_refuse_un_statut_inconnu(projet):
    with pytest.raises(dsm.ErreurDesignSystem):
        dsm.enregistrer(projet, {"composants": [{"id": "x", "nom": "X", "statut": "peut-etre"}]})


def test_detecter_un_projet_code(tmp_path):
    d = tmp_path / "app"
    (d / "src" / "app" / "bouton").mkdir(parents=True)
    (d / ".storybook").mkdir()
    (d / ".storybook" / "main.ts").write_text("export default {}")
    (d / "package.json").write_text(json.dumps({"dependencies": {"@4sh/ui-kit": "0.14.0", "primeng": "19"}}))
    (d / "src" / "app" / "bouton" / "bouton.stories.ts").write_text("")
    (d / "src" / "styles.scss").write_text(":root { --color-primary-500: #0a7cff; --fontFamily-title: 'Asap', sans-serif; }")
    (d / "node_modules" / "x").mkdir(parents=True)
    (d / "node_modules" / "x" / "y.css").write_text(":root{--ignore: #000000;}")
    r = dsm.detecter(d)
    assert r["kit"] == "@4sh/ui-kit" and {x["nom"] for x in r["librairies"]} >= {"Kit 4SH Angular", "PrimeNG"}
    assert r["storybook"]["histoires"] == 1 and r["composants"][0]["id"] == "bouton"
    assert "--color-primary-500" in r["variables"] and "--ignore" not in r["variables"]
    f = dsm.fondations_depuis_variables(r["variables"])
    assert next(c for c in f["couleurs"] if c["id"] == "primaire")["base"] == "#0a7cff"
    assert f["typo"]["titres"] == "Asap"


def test_les_maquettes_utilisent_le_design_system(projet):
    from referentiel.maquettes import _consignes

    ds = dsm.partir_du_starter(projet, lire_url=lambda url: INDEX)
    c = _consignes("ctx", {"nom": "Piste A"}, "", "", "desktop", None, None, ds)
    assert "var(--" in c and "--couleur-primaire-500" in c and "data-composant" in c and "ui-button (Bouton" in c
    assert "ui-button-group" not in c


def test_controles_contraste():
    f = dsm.fondations_vides()
    f["couleurs"][0]["base"] = "#ffee88"
    f["couleurs"][0]["nuances"] = {n: "#ffee88" for n in dsm.NUANCES}
    assert any("contraste" in x for x in dsm.controles({"fondations": f}))
