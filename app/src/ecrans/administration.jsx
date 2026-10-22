// Administration du projet : pour l'instant, la consommation de Claude par ce projet (session de 5 heures, périodes,
// usages, derniers appels). Les chiffres sont tenus sur ce poste : ils ne comptent que ce que Watson a fait ici.
import { useEffect, useState } from 'preact/hooks';
import { Gauge, RefreshCw } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, Entete } from './commun.jsx';

const jetons = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : `${n}`);
const dollars = (v) => `${(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const pct = (x) => { const v = (x || 0) * 100; return `${v > 0 && v < 10 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.round(v)} %`; };
const heure = (t) => new Date(t * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const quand = (t) => new Date(t * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function reste(t) {
  const m = Math.max(0, Math.round((t * 1000 - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

function Session({ s, mode, semaine }) {
  if (mode === 'cle') {
    return <p class="doux">Watson utilise une clé d'API : il n'y a pas de session de 5 heures, chaque appel est facturé à l'usage. Les montants ci-dessous sont ceux facturés.</p>;
  }
  if (!s) {
    return <p class="doux">Aucune session en cours connue. La jauge s'affiche dès le prochain appel de Watson à Claude, quel que soit le projet.</p>;
  }
  const part = Math.min(s.part_projet_max || 0, s.utilisation || 0);
  const partWatson = s.watson.jetons ? s.projet.jetons / s.watson.jetons : 0;
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne" style="align-items:baseline;gap:10px">
        <strong class="chiffre-session">{pct(s.utilisation)}</strong>
        <span class="doux espace">de la session utilisés, sur tout ton compte Claude</span>
        <span class="petit doux">se termine à {heure(s.fin)} (dans {reste(s.fin)})</span>
      </div>
      <div class={`jauge-session ${s.utilisation >= 0.8 ? 'haute' : ''}`} role="img" aria-label={`Session utilisée à ${pct(s.utilisation)}, dont jusqu'à ${pct(part)} par ce projet`}>
        <span class="jauge-compte" style={`width:${Math.min(100, (s.utilisation || 0) * 100)}%`} />
        <span class="jauge-projet" style={`width:${Math.min(100, part * 100)}%`} />
      </div>
      <div class="ligne petit" style="gap:16px">
        <span class="legende-jauge"><i class="pastille-projet" /> Ce projet : {s.appels_mesures ? <>jusqu'à <b>{pct(part)}</b> de la session</> : 'part pas encore mesurée'}</span>
        <span class="legende-jauge"><i class="pastille-compte" /> Le reste du compte (autres projets, Claude Code, claude.ai)</span>
      </div>
      <div class="tuiles-conso">
        <div><span class="petit doux">Appels de ce projet</span><strong>{s.projet.appels}</strong><span class="petit doux">sur {s.watson.appels} pour Watson</span></div>
        <div><span class="petit doux">Jetons de ce projet</span><strong>{jetons(s.projet.jetons)}</strong><span class="petit doux">{pct(partWatson)} de ceux de Watson</span></div>
        <div><span class="petit doux">Valeur au tarif de l'API</span><strong>{dollars(s.projet.valeur_usd)}</strong><span class="petit doux">non facturée avec l'abonnement</span></div>
      </div>
      {semaine && <p class="petit doux">Limite de la semaine : {pct(semaine.utilisation)} utilisés, jusqu'au {quand(semaine.fin)}.</p>}
      <p class="petit doux">La part du projet est estimée par la hausse de la jauge pendant ses appels : c'est un maximum, car ce qui est fait ailleurs avec ton compte entre deux appels de Watson la fait aussi monter.</p>
    </div>
  );
}

export function Administration({ projet }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => appel(`/projets/${projet.id}/consommation`).then(setD).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); const t = setInterval(charger, 30000); return () => clearInterval(t); }, [projet.id]);
  if (!d) return <Attente erreur={erreur} />;
  const max = Math.max(1, ...d.usages.map((u) => u.jetons));
  return (
    <>
      <Entete titre="Administration du projet" description="Ce que ce projet consomme de Claude. Les chiffres sont tenus sur ce poste : ils comptent ce que Watson a fait ici, pas ce que d'autres membres de l'équipe font sur leur poste.">
        <button class="bouton" onClick={charger}><RefreshCw size={14} /> Actualiser</button>
      </Entete>
      <section class="carte pile" style="gap:12px">
        <h2 class="ligne" style="gap:8px"><Gauge size={18} /> Session en cours (5 heures)</h2>
        <Session s={d.session} mode={d.mode} semaine={d.semaine} />
      </section>
      <section class="pile" style="gap:10px">
        <h2>Ce projet dans le temps</h2>
        <div class="tuiles-conso">
          {d.periodes.map((p) => (
            <div key={p.cle}><span class="petit doux">{p.libelle}</span><strong>{jetons(p.jetons)}</strong>
              <span class="petit doux">{p.appels} appel{p.appels > 1 ? 's' : ''} · {dollars(p.valeur_usd)}</span></div>
          ))}
        </div>
      </section>
      <div class="ligne" style="align-items:flex-start;gap:16px">
        <section class="carte pile" style="flex:1 1 360px;gap:10px">
          <h2>Par usage, sur 30 jours</h2>
          {d.usages.length === 0 && <p class="doux">Aucun appel à Claude pour ce projet ces 30 derniers jours.</p>}
          {d.usages.map((u) => (
            <div key={u.usage} class="pile" style="gap:4px">
              <div class="ligne"><span class="espace">{u.usage}</span><span class="petit doux">{u.appels} appel{u.appels > 1 ? 's' : ''} · {jetons(u.jetons)} · {dollars(u.valeur_usd)}</span></div>
              <div class="barre-usage"><span style={`width:${(u.jetons / max) * 100}%`} /></div>
            </div>
          ))}
        </section>
        <section class="carte pile" style="flex:1 1 360px;gap:8px">
          <h2>Derniers appels</h2>
          {d.derniers.length === 0 && <p class="doux">Aucun appel enregistré pour ce projet.</p>}
          {d.derniers.map((x, i) => (
            <div key={i} class="ligne appel-conso">
              <span class="pile espace" style="gap:1px"><span>{x.usage}{x.erreur ? <span class="badge b-rouge" style="margin-left:6px">échec</span> : ''}</span>
                <span class="petit doux">{quand(x.t)}{x.duree_ms ? ` · ${Math.round(x.duree_ms / 1000)} s` : ''}</span></span>
              <span class="petit doux" style="text-align:right">{jetons(x.entree + x.sortie + x.cache_lu + x.cache_ecrit)}{x.hausse_jauge != null ? <><br />+{pct(x.hausse_jauge)} de session</> : ''}</span>
            </div>
          ))}
          {d.depuis && <span class="petit doux">Suivi depuis le {quand(d.depuis)}.</span>}
        </section>
      </div>
    </>
  );
}
