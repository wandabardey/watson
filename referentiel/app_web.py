"""Interface locale « Demander au référentiel » (prototype).

Un petit serveur web, sur le poste uniquement (127.0.0.1), sans dépendance :
- GET  /                 la page
- GET  /api/connexion    état de la connexion à Claude (jamais d'identifiant)
- POST /api/demander     {"question": "...", "portee": "travail"} -> réponse structurée avec sources

Les réponses sont produites par `assistant.demander`, avec le compte Claude de la personne.
"""

from __future__ import annotations

import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .assistant import ErreurAssistant, demander, etat_connexion
from .chargement import charger

ICONES = {
    "sparkles": '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path> <path d="M20 3v4"></path> <path d="M22 5h-4"></path> <path d="M4 17v2"></path> <path d="M5 18H3"></path>',
    "arrow-up": '<path d="m5 12 7-7 7 7"></path> <path d="M12 19V5"></path>',
    "scale": '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path> <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path> <path d="M7 21h10"></path> <path d="M12 3v18"></path> <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>',
    "circle-help": '<circle cx="12" cy="12" r="10"></circle> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path> <path d="M12 17h.01"></path>',
}


def _svg(nom, taille=16, couleur="currentColor"):
    return (f'<svg width="{taille}" height="{taille}" viewBox="0 0 24 24" fill="none" stroke="{couleur}" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONES[nom]}</svg>')


PAGE = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demander au référentiel</title>
<style>
:root{--fond:#F4F4F6;--carte:#fff;--texte:#18181B;--doux:#71717A;--bord:#E4E4E7;--indigo:#4F46E5}
*{box-sizing:border-box}body{margin:0;background:var(--fond);color:var(--texte);font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{max-width:860px;margin:24px auto;padding:24px;background:var(--carte);border-radius:16px;box-shadow:0 1px 2px rgba(24,24,27,.05);display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:20px;display:flex;align-items:center;gap:10px}.sous{color:var(--doux);font-size:13px}
.etat{font-size:12px;padding:3px 10px;border-radius:999px;background:#F4F4F5;color:#52525B}.etat.ok{background:#DCFCE7;color:#166534}
.ligne{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between}
.saisie{display:flex;gap:8px;padding:8px 8px 8px 16px;border-radius:16px;box-shadow:0 0 0 1px var(--bord),0 6px 16px rgba(24,24,27,.06)}
.saisie input{flex:1;border:0;outline:none;font:inherit;min-width:0}.saisie button{width:40px;height:40px;border:0;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
select{font:inherit;font-size:13px;padding:4px 8px;border-radius:8px;border:1px solid var(--bord);background:#fff}
.question{align-self:flex-end;max-width:80%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:#18181B;color:#fff}
.verdict{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-weight:700;font-size:13px;background:#EEF2FF;color:#4338CA}
.v-oui{background:#DCFCE7;color:#166534}.v-non{background:#FEE2E2;color:#B91C1C}.v-depend{background:#F3E8FF;color:#7E22CE}.v-partiel,.v-inconnu{background:#FEF3C7;color:#92400E}
.source{display:flex;gap:10px;padding:10px 12px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--bord);margin-top:8px}
.source small{color:var(--doux)}.badge{font-size:11px;padding:1px 7px;border-radius:999px;background:#F4F4F5;color:#52525B;margin-left:6px}
.alerte{background:#FEE2E2;color:#B91C1C}.trou{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:#FFF7ED;color:#9A3412}
.erreur{padding:12px 14px;border-radius:12px;background:#FEF2F2;color:#991B1B}.attente{color:var(--doux)}
.pied{font-size:12px;color:#A1A1AA}
</style></head><body><main>
<div class="ligne"><div><h1>__SPARKLES__ Demander au référentiel</h1><div class="sous">Projet : __PROJET__ · Claude répond à partir de la base et cite ses sources.</div></div><span id="etat" class="etat">Connexion…</span></div>
<div id="fil"></div>
<div class="ligne"><label class="sous">Portée <select id="portee"><option value="travail">Version de travail</option><option value="production">Production</option><option value="histoire">Toute l'histoire</option></select></label></div>
<form class="saisie" id="f"><input id="q" placeholder="Ex. : qui peut annuler une expédition ?" autocomplete="off" aria-label="Votre question"><button aria-label="Envoyer">__ARROW__</button></form>
<div class="pied">Claude ne lit que la base de ce projet, en lecture seule. Il tourne avec votre compte Claude, sur ce poste.</div>
</main>
<script>
const $=s=>document.querySelector(s), fil=$('#fil');
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
fetch('/api/connexion').then(r=>r.json()).then(e=>{const el=$('#etat');
  if(e.connecte){el.className='etat ok';el.textContent=e.mode==='cle'?'Clé de secours':'Compte Claude connecté'}
  else{el.textContent=e.claude_code?'Compte Claude non connecté':'Claude Code introuvable'}});
$('#f').addEventListener('submit',async ev=>{ev.preventDefault();const q=$('#q').value.trim();if(!q)return;$('#q').value='';
  const bloc=document.createElement('section');bloc.innerHTML=`<p class="question">${esc(q)}</p><p class="attente">Claude lit la base…</p>`;fil.prepend(bloc);
  try{const r=await fetch('/api/demander',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,portee:$('#portee').value})});
    const d=await r.json();if(!r.ok)throw new Error(d.erreur||'Erreur');
    bloc.querySelector('.attente').outerHTML=`<p><span class="verdict v-${esc(d.verdict)}">${esc(d.libelle_verdict)}</span></p>`+
      d.paragraphes.map(p=>`<p>${esc(p)}</p>`).join('')+
      (d.sources.length?`<strong>Sur quoi je m'appuie</strong>`+d.sources.map(s=>`<div class="source">__SCALE__<div><small>${esc(s.type)}</small> <b>${esc(s.nom)}</b>${s.statut?`<span class="badge">${esc(s.statut)}</span>`:''}${s.verifiee===false?'<span class="badge alerte">introuvable dans la base</span>':''}<br><small>${esc(s.trace)}</small></div></div>`).join(''):'')+
      (d.trou?`<p class="trou">__HELP__<span>${esc(d.trou)}</span></p>`:'')+
      `<p class="pied">Répondu en ${Math.round(d.duree_ms/1000)} s, via ${d.mode==='cle'?'la clé de secours':'votre compte Claude'}.</p>`;
  }catch(e){bloc.querySelector('.attente').outerHTML=`<p class="erreur">${esc(e.message)}</p>`}});
</script></body></html>"""


def page(nom_projet: str) -> str:
    return (PAGE.replace("__SPARKLES__", _svg("sparkles", 20, "#EA580C")).replace("__ARROW__", _svg("arrow-up", 18))
            .replace("__SCALE__", _svg("scale", 16, "#4338CA")).replace("__HELP__", _svg("circle-help", 18))
            .replace("__PROJET__", nom_projet.replace("<", "&lt;")))


def fabrique(projet: Path):
    nom = charger(projet).meta.get("nom", projet.name)

    class Gestionnaire(BaseHTTPRequestHandler):
        def _json(self, code, donnees):
            corps = json.dumps(donnees, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)

        def do_GET(self):
            if self.path == "/":
                corps = page(nom).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(corps)))
                self.end_headers()
                self.wfile.write(corps)
            elif self.path == "/api/connexion":
                self._json(200, etat_connexion())
            else:
                self._json(404, {"erreur": "Introuvable"})

        def do_POST(self):
            if self.path != "/api/demander":
                return self._json(404, {"erreur": "Introuvable"})
            # Refuse les appels venus d'une autre page web que la nôtre.
            origine = self.headers.get("Origin")
            if origine and not origine.startswith(("http://127.0.0.1", "http://localhost")):
                return self._json(403, {"erreur": "Origine refusée"})
            try:
                longueur = int(self.headers.get("Content-Length", "0"))
                demande = json.loads(self.rfile.read(min(longueur, 20000)) or "{}")
                r = demander(str(demande.get("question", ""))[:2000], projet, demande.get("portee", "travail"))
                self._json(200, r.en_dict())
            except ErreurAssistant as e:
                self._json(400, {"erreur": str(e)})
            except Exception:  # noqa: BLE001 - message générique, détail dans la console
                import traceback

                traceback.print_exc()
                self._json(500, {"erreur": "Erreur inattendue, voir la console."})

        def log_message(self, *a):
            pass

    return Gestionnaire


def servir(projet: Path, port: int = 8765, ouvrir: bool = True):
    serveur = ThreadingHTTPServer(("127.0.0.1", port), fabrique(projet))
    adresse = f"http://127.0.0.1:{port}/"
    print(f"Demander au référentiel : {adresse}  (Ctrl+C pour arrêter)")
    if ouvrir:
        threading.Timer(0.5, lambda: webbrowser.open(adresse)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        serveur.server_close()
