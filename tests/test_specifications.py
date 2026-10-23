"""Spécifications Confluence : configuration, analyse de l'espace (convention de titre, modèles, style), rédaction au
format storage sur le modèle, publication sans doublon, libellés, signalement quand la base bouge. Confluence simulé."""

import json
import re
import shutil
import urllib.parse
from pathlib import Path

import pytest

from referentiel import specifications as sp
from referentiel.chargement import charger

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"
MODELE = ('<ac:structured-macro ac:name="details"><ac:rich-text-body><table><tbody><tr><th>Summary</th><td>x</td></tr></tbody></table>'
          '</ac:rich-text-body></ac:structured-macro><h2>Liste des règles métiers</h2><table><tbody><tr><th>Code</th><th>Règle</th></tr></tbody></table>'
          '<ac:structured-macro ac:name="incoming-links" />')


class FauxConfluence:
    def __init__(self):
        self.pages = {"1": {"title": "DESIGN", "parent": None, "storage": "", "version": 1, "labels": []},
                      "2": {"title": "Écrans", "parent": "1", "storage": "", "version": 1, "labels": []},
                      "3": {"title": "SCR - Tableau de bord", "parent": "2", "storage": MODELE, "version": 4, "labels": []}}
        self.ecritures = []

    def ancetres(self, i):
        r, p = [], self.pages[i]["parent"]
        while p:
            r.insert(0, {"id": p})
            p = self.pages[p]["parent"]
        return r

    def __call__(self, methode, url, donnees):
        u = urllib.parse.urlparse(url)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/wiki/api/v2/spaces":
            return {"results": [{"id": "99", "key": "PRJ", "name": "Projet", "homepageId": "1"}]}
        if u.path == "/wiki/rest/api/content/search":
            cql = q["cql"][0]
            if "ancestor" in cql:
                rac = re.search(r"ancestor = (\w+)", cql).group(1)
                ids = [i for i in self.pages if any(a["id"] == rac for a in self.ancetres(i))]
            else:
                t = re.search(r'title = "([^"]*)"', cql).group(1)
                ids = [i for i, p in self.pages.items() if p["title"] == t]
            return {"results": [{"id": i, "title": self.pages[i]["title"], "ancestors": self.ancetres(i),
                                 "metadata": {"labels": {"results": [{"name": x} for x in self.pages[i]["labels"]]}}} for i in ids]}
        m = re.match(r"/wiki/api/v2/pages/(\w+)$", u.path)
        if m and methode == "GET":
            p = self.pages[m.group(1)]
            return {"id": m.group(1), "title": p["title"], "parentId": p["parent"], "version": {"number": p["version"]}, "body": {"storage": {"value": p["storage"]}}}
        if m and methode == "PUT":
            p = self.pages[m.group(1)]
            assert donnees["version"]["number"] == p["version"] + 1
            p.update(storage=donnees["body"]["value"], version=donnees["version"]["number"])
            self.ecritures.append(("modifier", p["title"]))
            return {"id": m.group(1), "version": {"number": p["version"]}}
        if u.path == "/wiki/api/v2/pages" and methode == "POST":
            i = str(len(self.pages) + 1)
            self.pages[i] = {"title": donnees["title"], "parent": donnees["parentId"], "storage": donnees["body"]["value"], "version": 1, "labels": []}
            self.ecritures.append(("creer", donnees["title"]))
            return {"id": i, "version": {"number": 1}}
        m = re.match(r"/wiki/rest/api/content/(\w+)/label", u.path)
        if m:
            self.pages[m.group(1)]["labels"] += [x["name"] for x in donnees]
            return {}
        raise AssertionError(url)


@pytest.fixture()
def projet(tmp_path, monkeypatch):
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path / "donnees"))
    racine = tmp_path / "fret"
    shutil.copytree(FRET, racine, ignore=shutil.ignore_patterns("sortie", "recette"))
    return racine


def test_du_plan_a_la_publication(projet):
    sdk = pytest.importorskip("claude_agent_sdk")
    cf = FauxConfluence()
    vus = []

    async def claude(prompt, options):
        vus.append(options.system_prompt)
        titre = re.search(r"Titre de la page : « (.*?) »", options.system_prompt).group(1)
        corps = MODELE.replace(">x<", f">{titre} \u2014 résumé<") if "<modele>" in options.system_prompt else f"<p>{titre}</p>"
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps({"storage": corps, "labels": ["usecase", "Pas Bon"], "hypotheses": ["Volume à définir"]}))

    with pytest.raises(sp.ErreurSpecifications):
        sp.analyser(projet, "p1", requete=cf)
    sp.configurer(projet, "PRJ", racine_titre="DESIGN", requete=cf)
    v = sp.analyser(projet, "p1", requete=cf)
    c = sp.lire_config(projet)
    assert c["separateurs"] == {"SCR": " - "} and c["modeles"] == {"ecran": "3"} and c["style"] == "regles" and c["sections"] == {"Écrans": "2"}
    lignes = {x["cle"]: x for x in v["plan"]}
    assert lignes["ecran:SCR-001"]["titre"] == "SCR - Saisie d'une expédition" and lignes["entite:ENT-EXPEDITION"]["titre"] == "ENT-Expédition"
    assert lignes["export:FLX-002"]["type"] in ("export", "integration") and all(x["etat"] == "nouvelle" for x in v["plan"])
    cles = ["ecran:SCR-001", "entite:ENT-EXPEDITION"]
    sp.rediger("p1", projet, cles, requete=claude, requete_confluence=cf, attendre=True)
    assert "<modele>" in vus[0] and "Liste des règles métiers" in vus[0] and "ENT-Expédition" in vus[0]
    b = sp.lire_brouillon("p1", "ecran:SCR-001")
    assert b["valide"] and not b["alertes"] and "\u2014" not in b["storage"] and b["labels"] == ["screen", "usecase"]
    b2 = sp.lire_brouillon("p1", "entite:ENT-EXPEDITION")
    assert b2["valide"] and not b2["modele"]
    assert "Macro « details »" in sp.apercu(b["storage"]) and "ac:" not in sp.apercu(b["storage"])
    with pytest.raises(sp.ErreurSpecifications):
        sp.publier(projet, "p1", cles, confirme=False, requete=cf)
    r = sp.publier(projet, "p1", cles, confirme=True, requete=cf)
    assert ("creer", "Entités") in cf.ecritures and ("creer", "SCR - Saisie d'une expédition") in cf.ecritures
    nouvelle = next(i for i, p in cf.pages.items() if p["title"] == "SCR - Saisie d'une expédition")
    assert cf.pages[nouvelle]["parent"] == "2" and "screen" in cf.pages[nouvelle]["labels"]
    assert {x["etat"] for x in r["plan"] if x["cle"] in cles} == {"a_jour"}
    # Republier met à jour, sans doublon.
    sp.publier(projet, "p1", ["ecran:SCR-001"], confirme=True, requete=cf)
    assert cf.ecritures[-1] == ("modifier", "SCR - Saisie d'une expédition") and cf.pages[nouvelle]["version"] == 2
    # La base bouge : la page est à mettre à jour.
    f = projet / "ecrans" / "SCR-001.yaml"
    f.write_text(f.read_text(encoding="utf-8").replace("nom: Saisie d'une expédition", "nom: Saisie d'une expédition\ndescription: Nouvelle description."), encoding="utf-8")
    assert not charger(projet).erreurs
    etat = {x["cle"]: x["etat"] for x in sp.vue(projet, "p1")["plan"]}
    assert etat["ecran:SCR-001"] == "a_mettre_a_jour" and etat["entite:ENT-EXPEDITION"] == "a_jour"


def test_storage_et_apercu():
    assert sp.valider_storage("<p>Un &nbsp;texte</p><ac:structured-macro ac:name=\"toc\" />") is None
    assert sp.valider_storage("<p>non fermé") is not None
    assert sp.macros(MODELE) == ["details", "incoming-links"]
    a = sp.apercu('<p>Voir <ac:link><ri:page ri:content-title="ENT-Borne" /></ac:link></p><script>x</script>')
    assert '<a class="lien-page">ENT-Borne</a>' in a and "script" not in a
