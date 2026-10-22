"""Cahier de recette et campagnes : relecture des cas, cas d'une évolution, campagne, résultats et rapport."""

import shutil
from pathlib import Path

import pytest

from referentiel import backlog
from referentiel import campagnes as ca

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"


@pytest.fixture()
def projet(tmp_path):
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_cahier_relu_et_cas_d_evolution(projet):
    v = ca.vue_cahier(projet)
    assert v["compteurs"]["total"] == 0 and v["a_proposer"] > 0
    props = ca.propositions(projet)["cas"]
    ids = [c["id"] for c in props[:3]]
    ca.garder_propositions(projet, ids, "Wanda")
    assert ca.propositions(projet)["cas"][0]["id"] not in ids
    c = ca.modifier_cas(projet, ids[0], {"alors": "Ça marche — vraiment.", "statut": "valide", "a_preciser": [""]}, "Wanda")
    assert c["statut"] == "valide" and c["valide_par"] == "Wanda" and "a_preciser" not in c and "—" not in c["alors"]
    with pytest.raises(ca.ErreurRecette):
        ca.modifier_cas(projet, "../x", {}, "W")
    # Cas d'une évolution : un par critère, sources = règles touchées.
    e = backlog.creer(projet, {"titre": "Litiges"}, "W")
    backlog.modifier(projet, e["id"], {"redaction": {"criteres": [{"etant_donne": "a", "lorsque": "b", "alors": "c", "cas": "erreur"},
                                                                 {"etant_donne": "d", "lorsque": "e", "alors": "f"}],
                                                    "touches": [{"id": "RG-003", "changement": "x"}]}})
    r = ca.cas_depuis_evolution(projet, e["id"], "W")
    assert r["ecrits"] == [f"CT-{e['id']}-1", f"CT-{e['id']}-2"]
    assert ca.cas_depuis_evolution(projet, e["id"], "W")["deja_presents"] == r["ecrits"]
    cas = {c["id"]: c for c in ca.vue_cahier(projet)["cas"]}
    assert cas[f"CT-{e['id']}-1"]["sources"][0]["id"] == "RG-003" and cas[f"CT-{e['id']}-1"]["cas_critere"] == "erreur"
    ca.supprimer_cas(projet, ids[2])
    assert ids[2] not in {c["id"] for c in ca.vue_cahier(projet)["cas"]}


def test_campagne_resultats_et_rapport(projet):
    props = ca.propositions(projet)["cas"]
    ids = [c["id"] for c in props[:3]]
    ca.garder_propositions(projet, ids, "W")
    with pytest.raises(ca.ErreurRecette):
        ca.creer_campagne(projet, {"nom": "TNR 1.1"}, "W")  # aucun cas validé
    c = ca.creer_campagne(projet, {"nom": "TNR 1.1", "brouillons": True, "version": "1.1"}, "W")
    assert c["id"] == "CAMP-001" and c["cas"] == sorted(ids) or set(c["cas"]) == set(ids)
    v = ca.lire_campagne("fret", projet, c["id"])
    assert v["rapport"]["verdict"] == "incomplet" and len(v["details"]) == 3
    ca.noter("fret", projet, c["id"], ids[0], {"resultat": "ok"})
    ca.noter("fret", projet, c["id"], ids[1], {"resultat": "ko", "gravite": "mineure", "anomalie": "Libellé faux"})
    v = ca.noter("fret", projet, c["id"], ids[2], {"resultat": "ok"})
    assert v["rapport"]["verdict"] == "go_reserves" and v["non_enregistres"] == 3
    # Rien dans le dépôt tant qu'on n'enregistre pas.
    assert "Libellé" not in (projet / "recette" / "campagnes" / "CAMP-001.yaml").read_text(encoding="utf-8")
    v = ca.enregistrer_campagne("fret", projet, c["id"], cloturer=True)
    assert v["statut"] == "close" and v["non_enregistres"] == 0 and "Libellé" in (projet / "recette" / "campagnes" / "CAMP-001.yaml").read_text(encoding="utf-8")
    with pytest.raises(ca.ErreurRecette):
        ca.noter("fret", projet, c["id"], ids[0], {"resultat": "ko"})
    l = ca.liste_campagnes(projet)
    assert l[0]["joues"] == 3 and l[0]["ko"] == 1
    assert ca.rapport({"cas": ["a"], "resultats": {"a": {"resultat": "ko", "gravite": "bloquante"}}})["verdict"] == "no_go"
    assert ca.rapport({"cas": ["a"], "resultats": {"a": {"resultat": "ok"}}})["verdict"] == "go"


def test_campagne_d_une_evolution(projet):
    ca.garder_propositions(projet, [c["id"] for c in ca.propositions(projet)["cas"]], "W")
    e = backlog.creer(projet, {"titre": "Créneau"}, "W")
    backlog.modifier(projet, e["id"], {"redaction": {"criteres": [{"etant_donne": "a", "lorsque": "b", "alors": "c"}], "touches": [{"id": "RG-003", "changement": "x"}]}})
    backlog.recalculer(projet, e["id"])
    ca.cas_depuis_evolution(projet, e["id"], "W")
    touches = ca.cas_touches(projet, e["id"])
    assert f"CT-{e['id']}-1" in touches and any("RG-003" in i or "PRENDRE" in i for i in touches)
    c = ca.creer_campagne(projet, {"nom": "TNR créneau", "evolution": e["id"]}, "W")
    assert set(c["cas"]) == set(touches)
