"""Travaux de Watson : chaque appel à Claude est suivi (phase, texte écrit), visible depuis tous les écrans."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from referentiel import conso, travaux


def test_cycle_d_un_travail():
    t = travaux.debut("p1", "alimenter")
    v = travaux.vue("p1")["en_cours"][0]
    assert v["libelle"] == "Lecture de documents" and v["ecran"] == "alimenter" and v["phase_libelle"] == "Watson lit"
    travaux.observer(t, SimpleNamespace(event={"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "abc"}}))
    travaux.observer(t, SimpleNamespace(event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "{\"a\": 1}"}}))
    v = travaux.vue("p1")["en_cours"][0]
    assert v["phase"] == "ecrit" and v["caracteres"] == 8 and v["reflexion"] == 3
    travaux.finir(t)
    assert not travaux.vue("p1")["en_cours"] and travaux.vue("p1")["finis"][0]["etat"] == "fini"
    t = travaux.debut("p2", "inconnu")
    travaux.finir(t, "Claude indisponible")
    assert travaux.vue("p2")["finis"][0]["erreur"] == "Claude indisponible" and travaux.vue("p2")["finis"][0]["libelle"] == "Travail de Watson"


def test_un_appel_a_claude_est_suivi(tmp_path, monkeypatch):
    sdk = pytest.importorskip("claude_agent_sdk")
    monkeypatch.setenv("WATSON_DONNEES", str(tmp_path))
    from referentiel.alimentation import _lire_par_claude

    async def requete(prompt, options):
        assert options.include_partial_messages
        yield SimpleNamespace(event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "{}"}})
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s", result=json.dumps({"ok": 1}))
    conso.projet_courant.set("p3")
    conso.usage_courant.set("cahier")
    assert asyncio.run(_lire_par_claude("s", "m", requete)) == {"ok": 1}
    f = travaux.vue("p3")["finis"][0]
    assert f["usage"] == "cahier" and f["caracteres"] == 2 and f["etat"] == "fini"
