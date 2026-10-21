"""Tests de « Demander au référentiel » : le kit d'agents est remplacé par un faux, aucun appel à Claude."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path
from unittest import mock

import pytest

pytest.importorskip("claude_agent_sdk")  # facultatif, et réservé à Python 3.10 ou plus

from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny, ResultMessage  # noqa: E402
from referentiel import assistant
from referentiel.assistant import ErreurAssistant

FRET = Path(__file__).resolve().parent.parent / "exemples" / "fret"

BONNE_REPONSE = {
    "verdict": "oui",
    "paragraphes": ["Oui : la soumission exige la destination, le poids et la nature de la marchandise."],
    "sources": [
        {"type": "règle", "nom": "Champs obligatoires à la soumission", "identifiant": "RG-001", "statut": "validée",
         "trace": "Atelier de cadrage du 12/09/2026, créée par Wanda Bardey."},
        {"type": "règle", "nom": "Règle inventée", "identifiant": "RG-999", "statut": "validée", "trace": "?"},
    ],
    "trou": "",
}


def resultat(structured=None, is_error=False, statut=None, subtype="success"):
    return ResultMessage(subtype=subtype, duration_ms=4200, duration_api_ms=3000, is_error=is_error, num_turns=3,
                         session_id="s", structured_output=structured, api_error_status=statut)


def faux_kit(*messages):
    vus = {}

    async def requete(prompt, options):
        vus["prompt"], vus["options"] = prompt, options
        for m in messages:
            yield m

    return requete, vus


@pytest.fixture(autouse=True)
def sans_cle(monkeypatch):
    monkeypatch.delenv("REFERENTIEL_CLE_API", raising=False)


def test_petite_base_une_seule_passe_sans_outil():
    o = assistant.options(FRET)
    assert o.tools == [] and o.allowed_tools == [] and o.mcp_servers == {} and o.max_turns == 1
    assert "FORMAT DE SORTIE" in o.system_prompt and "[RG-007]" in o.system_prompt


def test_options_en_lecture_seule(monkeypatch):
    monkeypatch.setattr(assistant, "SEUIL_INDEX", 10)  # force le mode « grosse base », avec outils
    o = assistant.options(FRET)
    assert o.tools == []  # aucun outil intégré : ni fichiers, ni terminal, ni web
    assert o.strict_mcp_config and o.setting_sources == []
    assert all(t.startswith("mcp__referentiel__") for t in o.allowed_tools)
    assert {t.split("__")[-1] for t in o.allowed_tools} == set(assistant.OUTILS_LECTURE)
    assert "mcp__referentiel__enregistrer_element" in o.disallowed_tools
    serveur = o.mcp_servers["referentiel"]
    assert serveur["env"]["REFERENTIEL_PROJET"] == str(FRET.resolve())
    assert o.output_format["schema"] == assistant.SCHEMA


def test_reponse_texte_json_lue():
    texte = "```json\n" + json.dumps(BONNE_REPONSE, ensure_ascii=False) + "\n```"
    assert assistant.valider(texte)["verdict"] == "oui"


def test_garde_refuse_les_ecritures():
    garde = assistant.options(FRET).can_use_tool
    assert isinstance(asyncio.run(garde("mcp__referentiel__lire_element", {}, None)), PermissionResultAllow)
    assert isinstance(asyncio.run(garde("mcp__referentiel__remplacer_regle", {}, None)), PermissionResultDeny)
    assert isinstance(asyncio.run(garde("Bash", {"command": "ls"}, None)), PermissionResultDeny)


def test_abonnement_par_defaut_et_cle_de_secours(monkeypatch):
    assert assistant.mode_auth() == "abonnement"
    assert assistant.options(FRET).env["ANTHROPIC_API_KEY"] == ""  # force le compte Claude
    monkeypatch.setenv("REFERENTIEL_CLE_API", "cle-de-test")
    assert assistant.mode_auth() == "cle"
    assert assistant.options(FRET).env["ANTHROPIC_API_KEY"] == "cle-de-test"


def test_reponse_avec_sources_verifiees():
    requete, vus = faux_kit(resultat(BONNE_REPONSE))
    r = assistant.demander("Peut-on soumettre sans poids ?", FRET, requete=requete)
    assert vus["prompt"] == "Peut-on soumettre sans poids ?"
    assert r.libelle_verdict == "Oui" and r.mode == "abonnement" and r.duree_ms == 4200
    verif = {s["identifiant"]: s["verifiee"] for s in r.sources}
    assert verif == {"RG-001": True, "RG-999": False}
    texte = assistant.formater(r)
    assert "introuvable dans la base" in texte and "votre compte Claude" in texte


def test_limite_atteinte():
    requete, _ = faux_kit(resultat(is_error=True, statut=429))
    with pytest.raises(ErreurAssistant, match="Limite d'usage"):
        assistant.demander("Question ?", FRET, requete=requete)


def test_compte_non_connecte():
    requete, _ = faux_kit(resultat(is_error=True, statut=401))
    with pytest.raises(ErreurAssistant, match="connexion --login"):
        assistant.demander("Question ?", FRET, requete=requete)


def test_reponse_sans_source_refusee():
    requete, _ = faux_kit(resultat({**BONNE_REPONSE, "sources": []}))
    with pytest.raises(ErreurAssistant, match="sans source"):
        assistant.demander("Question ?", FRET, requete=requete)


def test_inconnu_sans_source_accepte():
    rep = {"verdict": "inconnu", "paragraphes": ["La base ne le dit pas."], "sources": [], "trou": "Aucune règle sur ce point."}
    requete, _ = faux_kit(resultat(rep))
    assert assistant.demander("Question ?", FRET, requete=requete).trou


def test_contexte_dans_les_consignes():
    o = assistant.options(FRET)
    assert "## Règles" in o.system_prompt and "[RG-007]" in o.system_prompt
    assert o.max_turns == 1
    prod = assistant.options(FRET, "production")
    assert "Aucun environnement de production" in prod.system_prompt


def test_etat_connexion_sans_jeton(monkeypatch):
    sortie = json.dumps({"loggedIn": True, "authMethod": "claude.ai", "email": "a@4sh.fr", "accessToken": "SECRET"})
    monkeypatch.setattr(assistant, "chemin_claude_code", lambda: "/bin/claude")
    with mock.patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout=sortie)):
        e = assistant.etat_connexion()
    assert e["connecte"] and e["compte"] == {"email": "a@4sh.fr"}
    assert "SECRET" not in json.dumps(e)


def test_le_serveur_mcp_declare_demarre(monkeypatch):
    """La commande déclarée au kit d'agents lance bien le serveur et expose les outils de lecture."""
    monkeypatch.setattr(assistant, "SEUIL_INDEX", 10)
    serveur = assistant.options(FRET).mcp_servers["referentiel"]
    env = {**os.environ, **serveur["env"]}
    entree = "\n".join(json.dumps(m) for m in [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "lire_element", "arguments": {"id": "RG-001"}}},
    ]) + "\n"
    p = subprocess.run([serveur["command"], *serveur["args"]], input=entree, capture_output=True, text=True,
                       env=env, cwd="/", timeout=30)
    reponses = {r["id"]: r for r in map(json.loads, p.stdout.splitlines())}
    noms = {o["name"] for o in reponses[2]["result"]["tools"]}
    assert set(assistant.OUTILS_LECTURE) <= noms
    assert "Champs obligatoires" in reponses[3]["result"]["content"][0]["text"]


def test_interface_web(monkeypatch):
    from http.server import ThreadingHTTPServer
    from referentiel import app_web

    monkeypatch.setattr(app_web, "demander", lambda q, projet, portee: assistant.Reponse("oui", ["Oui."], [], "", duree_ms=1000))
    monkeypatch.setattr(app_web, "etat_connexion", lambda: {"connecte": True, "mode": "abonnement", "claude_code": True})
    serveur = ThreadingHTTPServer(("127.0.0.1", 0), app_web.fabrique(FRET))
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{serveur.server_address[1]}"
    try:
        assert "Demander au référentiel" in urllib.request.urlopen(base + "/").read().decode()
        req = urllib.request.Request(base + "/api/demander", data=json.dumps({"question": "Q ?"}).encode(),
                                     headers={"Content-Type": "application/json"})
        assert json.loads(urllib.request.urlopen(req).read())["verdict"] == "oui"
        hostile = urllib.request.Request(base + "/api/demander", data=b"{}", headers={"Origin": "https://exemple.test"})
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(hostile)
        assert e.value.code == 403
    finally:
        serveur.shutdown()


def test_reglages_modele_et_effort(monkeypatch):
    from referentiel import reglages
    monkeypatch.delenv("REFERENTIEL_MODELE", raising=False)
    monkeypatch.delenv("REFERENTIEL_EFFORT", raising=False)
    assert reglages.lire() == {"modele": "claude-opus-5-5", "effort": "medium"}
    o = assistant.options(FRET)
    assert o.model == "claude-opus-5-5" and o.effort == "medium"
    reglages.ecrire({"modele": "claude-sonnet-5-5", "effort": "high"})
    o = assistant.options(FRET)
    assert o.model == "claude-sonnet-5-5" and o.effort == "high"
    with pytest.raises(reglages.ErreurReglages):
        reglages.ecrire({"effort": "extreme"})
    monkeypatch.setenv("REFERENTIEL_MODELE", "haiku")
    assert assistant.options(FRET).model == "haiku" and reglages.vue()["impose_par_variable"]
    assert reglages.nom_modele("claude-opus-5-5-20261001") == "Opus 5.5"


def test_modele_indisponible():
    requete, _ = faux_kit(resultat(is_error=True, statut=404))
    with pytest.raises(ErreurAssistant, match="pas disponible avec ce compte"):
        assistant.demander("Question ?", FRET, requete=requete)
