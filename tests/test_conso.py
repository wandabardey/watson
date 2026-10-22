"""Consommation de Claude par projet : journal des appels, jauge de session, part estimée du projet."""

import asyncio
import json
import time
from types import SimpleNamespace as N

import pytest

from referentiel import conso


def evenement(utilisation, fin, genre="five_hour"):
    return N(rate_limit_info=N(status="allowed", utilization=utilisation, resets_at=fin, rate_limit_type=genre))


def resultat(entree=1000, sortie=200):
    return N(usage={"input_tokens": entree, "output_tokens": sortie, "cache_read_input_tokens": 50}, total_cost_usd=0.02,
             duration_ms=1500, is_error=False)


def appel(pid, usage, jauge, fin):
    conso.projet_courant.set(pid)
    conso.usage_courant.set(usage)
    d = conso.debut()
    conso.observer(evenement(jauge, fin))
    conso.noter(d, resultat(), "claude-opus")


def test_journal_et_part_du_projet():
    fin = int(time.time()) + 3600
    appel("fret", "alimenter", 0.10, fin)      # première mesure : pas de point de départ connu
    appel("fret", "cahier", 0.14, fin)         # +4 points
    appel("autre", "demander", 0.15, fin)      # +1 point, autre projet
    appel("fret", "comite", 0.20, fin)         # +5 points
    v = conso.vue("fret")
    s = v["session"]
    assert s["utilisation"] == 0.20 and s["projet"]["appels"] == 3 and s["watson"]["appels"] == 4
    assert s["part_projet_max"] == pytest.approx(0.09) and s["appels_mesures"] == 2
    assert v["periodes"][0]["appels"] == 3 and v["periodes"][0]["jetons"] == 3 * 1250
    assert {u["usage"] for u in v["usages"]} == {"Lecture de documents", "Cahier des charges", "Comité d'experts"}
    assert v["derniers"][0]["usage"] == "Comité d'experts"


def test_sans_jauge_et_session_finie():
    conso.projet_courant.set("fret")
    conso.usage_courant.set("demander")
    conso.noter(conso.debut(), resultat(), None)  # clé d'API : aucune jauge signalée
    v = conso.vue("fret")
    assert v["session"] is None and v["total"]["appels"] == 1 and v["total"]["valeur_usd"] == 0.02
    conso.observer(evenement(0.5, int(time.time()) - 10))
    assert conso.vue("fret")["session"] is None  # session expirée


def test_branche_sur_les_appels_a_claude():
    sdk = pytest.importorskip("claude_agent_sdk")
    from referentiel.alimentation import _lire_par_claude

    async def requete(prompt, options):
        yield sdk.RateLimitEvent(rate_limit_info=sdk.RateLimitInfo(status="allowed", resets_at=int(time.time()) + 600,
                                                                   rate_limit_type="five_hour", utilization=0.3), uuid="u", session_id="s")
        yield sdk.ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=1, session_id="s",
                                result=json.dumps({"ok": True}), usage={"input_tokens": 10, "output_tokens": 5}, total_cost_usd=0.001)

    conso.projet_courant.set("fret")
    conso.usage_courant.set("maquettes")
    assert asyncio.run(_lire_par_claude("s", "m", requete)) == {"ok": True}
    v = conso.vue("fret")
    assert v["session"]["utilisation"] == 0.3 and v["usages"][0]["usage"] == "Maquettes" and v["total"]["jetons"] == 15
