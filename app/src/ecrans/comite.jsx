// Comité d'experts : n'importe quel élément du projet peut être soumis à un panel d'experts fictifs, qui donnent
// leur avis chacun dans sa voix, débattent, puis Watson en tire une recommandation. Le comité du projet garde ses
// membres et le journal de ses décisions.
import { useEffect, useState } from 'preact/hooks';
import { Check, MessagesSquare, Sparkles, Trash2, Users, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, Entete, Watson } from './commun.jsx';
import { LotEnCours } from './edition.jsx';

const ETAPES = { prepare: 'Préparation', casting: 'Composition du comité', avis: 'Les experts planchent', debat: 'Tour contradictoire', synthese: 'Synthèse', fini: 'Terminé', erreur: 'Interrompu' };
const COULEURS = ['#4F46E5', '#0D9488', '#B45309', '#BE185D', '#2563EB'];
const initiales = (m) => ((m.nom || m.role || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2)).toUpperCase();
const GRAVITE = { forte: 'b-rouge', moyenne: 'b-ambre', faible: 'b-gris' };
const POSITION = { confirme: 'confirme', nuance: 'nuance', change: 'change d\'avis' };

export function BoutonComite({ projet, cible, libelle = 'Comité', petit = false, desactive = false }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button class={`bouton ${petit ? 'petit-b' : ''}`} disabled={desactive} title="Faire évaluer par un comité d'experts" onClick={(e) => { e.stopPropagation(); setOuvert(true); }}><Users size={petit ? 13 : 15} /> {libelle}</button>
      {ouvert && <ComiteModal projet={projet} cible={cible} fermer={() => setOuvert(false)} />}
    </>
  );
}

function Membre({ m, i, avis, debat }) {
  const c = COULEURS[i % COULEURS.length];
  return (
    <div class="membre-comite">
      <div class="ligne" style="gap:10px;flex-wrap:nowrap;align-items:flex-start">
        <span class="avatar-comite" style={`background:${c}1A;color:${c}`}>{initiales(m)}</span>
        <div class="pile espace" style="gap:1px;min-width:0"><strong>{m.nom || m.role}</strong><span class="petit doux">{m.nom ? m.role : m.mandat}</span></div>
        {avis && <span class={`badge ${avis.confiance === 'haute' ? 'b-vert' : avis.confiance === 'basse' ? 'b-gris' : 'b-ambre'}`}>confiance {avis.confiance}</span>}
        {!avis && <span class="petit doux">réfléchit…</span>}
      </div>
      {avis && (
        <div class="pile" style="gap:6px;margin-top:8px">
          <p class="avis-texte">« {avis.avis} »</p>
          {avis.points_forts?.length > 0 && <div class="petit"><b>Points forts</b> {avis.points_forts.join(' · ')}</div>}
          {avis.risques?.length > 0 && <div class="ligne" style="gap:4px">{avis.risques.map((r, j) => <span key={j} class={`badge ${GRAVITE[r.gravite] || 'b-gris'}`} style="font-weight:500">{r.risque}</span>)}</div>}
          {avis.recommandations?.length > 0 && <ul class="liste-planche">{avis.recommandations.map((r, j) => <li key={j}>{r}</li>)}</ul>}
          {avis.questions?.length > 0 && <div class="petit doux">Questions : {avis.questions.join(' · ')}</div>}
          {debat && <div class="debat-comite"><b>Au débat, {POSITION[debat.position] || debat.position}</b> {debat.reponse}</div>}
        </div>
      )}
    </div>
  );
}

function Seance({ projet, s, recharger, fermer, decisions }) {
  const [decision, setDecision] = useState(s.decision || '');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [lot, setLot] = useState(null);
  const [fait, setFait] = useState({});
  const base = `/projets/${projet.id}/comite/seances/${s.id}`;
  const action = async (quoi, corps = {}) => {
    setOccupe(true); setMessage(null);
    try { const r = await appel(`${base}/${quoi}`, { corps }); if (quoi === 'appliquer') setLot(r); else { setFait({ ...fait, [quoi]: true }); recharger?.(); } } catch (e) { setMessage(e.message); }
    setOccupe(false);
  };
  const sy = s.synthese;
  const enCours = !['fini', 'erreur'].includes(s.etat);
  return (
    <div class="pile" style="gap:14px">
      <div class="ligne" style="gap:8px">
        <span class="badge b-indigo">{s.cible?.nom}</span><span class="doux petit espace">{s.question}</span>
        <span class={`badge ${s.etat === 'fini' ? 'b-vert' : s.etat === 'erreur' ? 'b-rouge' : 'b-ambre'}`}>{ETAPES[s.etat] || s.etat}{s.duree_s ? ` · ${Math.round(s.duree_s / 60) || 1} min` : ''}</span>
      </div>
      {enCours && (
        <div class="etapes-comite">{['casting', 'avis', s.intensite !== 'express' && 'debat', 'synthese'].filter(Boolean).map((e) => {
          const ordre = ['prepare', 'casting', 'avis', 'debat', 'synthese', 'fini'];
          const etat = ordre.indexOf(s.etat) > ordre.indexOf(e) ? 'fait' : s.etat === e ? 'encours' : '';
          return <span key={e} class={`etape-comite ${etat}`}>{etat === 'fait' ? <Check size={12} /> : <i />}{ETAPES[e]}</span>;
        })}</div>
      )}
      {s.etat === 'erreur' && <p class="encart e-rouge">{s.erreur}</p>}
      {sy && (
        <div class="synthese-comite pile" style="gap:10px">
          <div class="ligne" style="gap:12px;flex-wrap:nowrap;align-items:flex-start"><Watson humeur="ecrit" hauteur={74} flotte={false} />
            <div class="pile espace" style="gap:4px"><span class="petit doux">Recommandation du comité</span><strong class="reco">{sy.recommandation}</strong></div></div>
          {sy.consensus?.length > 0 && <div><b class="petit">Consensus</b><ul class="liste-planche">{sy.consensus.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {sy.desaccords?.length > 0 && <div><b class="petit">Désaccords</b>{sy.desaccords.map((x, i) => <div key={i} class="petit" style="margin:4px 0"><b>{x.sujet}</b>{x.positions ? ` : ${x.positions}` : ''}{x.arbitrage && <span class="doux"> · arbitrage : {x.arbitrage}</span>}</div>)}</div>}
          {sy.a_bouge?.length > 0 && <div class="petit"><b>Ce qui a bougé au débat</b> {sy.a_bouge.join(' · ')}</div>}
          {sy.faisabilite && <div class="petit"><b>Faisabilité</b> {sy.faisabilite}</div>}
          {sy.actions?.length > 0 && <div><b class="petit">Actions</b>{sy.actions.map((a, i) => <div key={i} class="ligne petit" style="gap:6px;margin:4px 0"><Check size={13} color="#16A34A" /><span class="espace">{a.texte}</span>{a.source && <span class="doux">{a.source}</span>}{a.confiance && <span class="badge b-gris" style="font-weight:500">{a.confiance}</span>}</div>)}</div>}
        </div>
      )}
      {s.membres?.length > 0 && <div class="membres-comite">{s.membres.map((m, i) => <Membre key={m.id} m={m} i={i} avis={s.avis?.[m.id]} debat={s.debat?.[m.id]} />)}</div>}
      {lot && <div class="carte"><LotEnCours projet={projet} lot={lot} fini={() => { setLot(null); setFait({ ...fait, applique: true }); }} abandonner={async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); }} /></div>}
      {message && <p class="encart e-rouge">{message}</p>}
      {s.etat === 'fini' && !lot && (
        <div class="carte pile" style="gap:10px">
          <strong>Ta décision</strong>
          <div class="segments" style="align-self:flex-start">{Object.entries(decisions).map(([k, v]) => <button key={k} class={`segment ${decision === k ? 'actif' : ''}`} onClick={() => setDecision(k)}>{v}</button>)}</div>
          <input class="saisie" placeholder="Note, facultative : pourquoi, ce qu'on garde" value={note} onInput={(e) => setNote(e.target.value)} />
          <div class="ligne">
            <button class="bouton principal-b" disabled={occupe || !decision || fait.noter || s.decision} onClick={() => action('noter', { decision, note })}><Check size={15} /> {fait.noter || s.decision ? 'Noté au journal' : 'Noter au journal du comité'}</button>
            {sy?.consigne_watson && <button class="bouton bouton-watson" disabled={occupe || fait.applique} onClick={() => action('appliquer')}><Sparkles size={15} /> {fait.applique ? 'Base mise à jour' : 'Appliquer à la base'}</button>}
            <button class="bouton" disabled={occupe || fait.panel} onClick={() => action('panel')}><Users size={15} /> {fait.panel ? 'Panel gardé' : 'Garder ce panel comme comité du projet'}</button>
          </div>
          {sy?.consigne_watson && !fait.applique && <span class="petit doux">Appliquer : Watson prépare les changements de la base (« {sy.consigne_watson.slice(0, 140)}{sy.consigne_watson.length > 140 ? '…' : ''} »), tu valides.</span>}
        </div>
      )}
    </div>
  );
}

export function ComiteModal({ projet, cible, seance, fermer, recharger }) {
  const [v, setV] = useState(null);
  const [choix, setChoix] = useState(cible ? `${cible.type}|${cible.id}` : '');
  const [question, setQuestion] = useState('');
  const [intensite, setIntensite] = useState('standard');
  const [comite, setComite] = useState(true);
  const [sid, setSid] = useState(seance || null);
  const [s, setS] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => { appel(`/projets/${projet.id}/comite`).then(setV).catch((e) => setMessage(e.message)); }, []);
  useEffect(() => {
    if (!sid) return undefined;
    let vivant = true;
    const suivre = async () => {
      try { const r = await appel(`/projets/${projet.id}/comite/seances/${sid}`); if (!vivant) return; setS(r); if (!['fini', 'erreur'].includes(r.etat)) setTimeout(suivre, 2500); else recharger?.(); } catch (e) { setMessage(e.message); }
    };
    suivre();
    return () => { vivant = false; };
  }, [sid]);
  const lancer = async () => {
    const [type, id] = choix ? choix.split('|') : ['libre', ''];
    setMessage(null);
    try { setSid((await appel(`/projets/${projet.id}/comite/evaluer`, { corps: { cible: { type, id }, question, intensite, utiliser_comite: comite && v?.membres?.length > 0 } })).id); } catch (e) { setMessage(e.message); }
  };
  const groupes = v ? [...new Set(v.cibles.map((c) => c.groupe))] : [];
  return (
    <div class="visionneuse" onClick={fermer}>
      <div class="modale-comite" onClick={(e) => e.stopPropagation()}>
        <div class="ligne"><Users size={18} color="#4F46E5" /><strong class="espace">Comité d'experts</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
        {message && <p class="encart e-rouge">{message}</p>}
        {!sid && !v && <Attente />}
        {!sid && v && (
          <div class="pile" style="gap:12px">
            <label class="champ">Ce qu'on soumet au comité
              <select value={choix} onChange={(e) => setChoix(e.target.value)}>
                <option value="">Une question libre, sans élément</option>
                {groupes.map((g) => <optgroup key={g} label={g}>{v.cibles.filter((c) => c.groupe === g).map((c) => <option key={`${c.type}|${c.id}`} value={`${c.type}|${c.id}`}>{c.nom}</option>)}</optgroup>)}
              </select></label>
            <label class="champ">La question posée<textarea rows={3} placeholder={choix ? 'Facultatif : qu\'en pensez-vous ? Risques, angles morts, ce que vous recommandez.' : 'La question à trancher, avec son contexte'} value={question} onInput={(e) => setQuestion(e.target.value)} /></label>
            <div class="pile" style="gap:6px"><span class="petit doux">Intensité</span>
              <div class="choix-intensites">{Object.entries(v.intensites).map(([k, lib]) => (
                <button key={k} class={`choix ${intensite === k ? 'actif' : ''}`} onClick={() => setIntensite(k)}><span class="pastille">{intensite === k && <Check size={13} />}</span><span class="pile" style="gap:1px;text-align:left"><strong>{lib.split(',')[0]}</strong><span class="petit doux">{lib.split(',').slice(1).join(',').trim()}</span></span></button>
              ))}</div></div>
            {v.membres.length > 0 && <label class="ligne petit" style="gap:6px"><input type="checkbox" checked={comite} onChange={(e) => setComite(e.target.checked)} /> Réunir le comité du projet ({v.membres.map((m) => m.nom || m.role).join(', ')})</label>}
            <span class="petit doux">Chaque expert est un appel à Claude, plus le débat et la synthèse : compte deux à six minutes. Tu peux fermer, la séance continue et se retrouve dans l'onglet Comité.</span>
            <div class="ligne"><button class="bouton principal-b" disabled={!choix && !question.trim()} onClick={lancer}><MessagesSquare size={15} /> Réunir le comité</button></div>
          </div>
        )}
        {sid && !s && <Attente />}
        {sid && s && v && <Seance projet={projet} s={s} decisions={v.decisions} recharger={recharger} fermer={fermer} />}
      </div>
    </div>
  );
}

export function Comite({ projet }) {
  const [v, setV] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [modale, setModale] = useState(null);
  const charger = () => appel(`/projets/${projet.id}/comite`).then(setV).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  if (!v) return <Attente erreur={erreur} />;
  const nomDecision = (d) => v.decisions[d] || '';
  return (
    <>
      <Entete titre="Comité d'experts" description="Faire évaluer un élément du projet par un panel d'experts fictifs mais crédibles : chacun donne son avis dans sa voix, ils débattent, Watson en tire une recommandation. Le comité du projet garde ses membres et ses décisions.">
        <button class="bouton principal-b" onClick={() => setModale({})}><MessagesSquare size={15} /> Nouvelle séance</button>
      </Entete>
      <section class="carte pile" style="gap:10px">
        <div class="ligne"><strong class="espace">Comité du projet</strong>
          {v.membres.length > 0 && <button class="bouton" onClick={async () => setV(await appel(`/projets/${projet.id}/comite/membres`, { methode: 'DELETE', corps: {} }))}><Trash2 size={14} /> Retirer le panel</button>}</div>
        {v.membres.length === 0 ? <span class="doux petit">Pas encore de comité attitré. Après une séance, « Garder ce panel » le fixe : il se souviendra de ses décisions d'une fois sur l'autre.</span>
          : <div class="membres-comite">{v.membres.map((m, i) => (
            <div key={m.id} class="membre-comite"><div class="ligne" style="gap:10px;flex-wrap:nowrap;align-items:flex-start">
              <span class="avatar-comite" style={`background:${COULEURS[i % 5]}1A;color:${COULEURS[i % 5]}`}>{initiales(m)}</span>
              <div class="pile" style="gap:2px"><strong>{m.nom || m.role}</strong><span class="petit doux">{m.role}</span><span class="petit">{m.portrait}</span></div></div></div>))}</div>}
      </section>
      {v.seances.length > 0 && (
        <section class="pile" style="gap:8px">
          <h2>Séances récentes</h2>
          {v.seances.map((s) => (
            <button key={s.id} class="carte ligne seance-ligne" onClick={() => setModale({ seance: s.id })}>
              <span class="pile espace" style="gap:2px;text-align:left"><strong>{s.cible?.nom}</strong><span class="petit doux">{s.recommandation || s.question}</span></span>
              <span class="petit doux">{s.date?.split('-').reverse().join('/')}</span>
              <span class={`badge ${s.etat === 'fini' ? (s.decision ? 'b-vert' : 'b-indigo') : s.etat === 'erreur' ? 'b-rouge' : 'b-ambre'}`}>{s.decision ? nomDecision(s.decision) : ETAPES[s.etat]}</span>
            </button>
          ))}
        </section>
      )}
      {v.journal.length > 0 && (
        <section class="pile" style="gap:8px">
          <h2>Journal des décisions</h2>
          <div class="cadre-tableau"><table class="tableau"><thead><tr><th>Date</th><th>Sujet</th><th>Recommandation</th><th>Décision</th></tr></thead><tbody>
            {v.journal.map((j, i) => <tr key={i}><td class="doux">{j.date?.split('-').reverse().join('/')}</td><td><strong>{j.sujet}</strong><div class="petit doux">{(j.membres || []).join(', ')}</div></td><td>{j.recommandation}{j.note && <div class="petit doux">{j.note}</div>}</td><td><span class={`badge ${j.decision === 'retenue' ? 'b-vert' : j.decision === 'ecartee' ? 'b-gris' : 'b-ambre'}`}>{nomDecision(j.decision)}</span><div class="petit doux">{j.par}</div></td></tr>)}
          </tbody></table></div>
        </section>
      )}
      {v.seances.length === 0 && v.journal.length === 0 && (
        <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="reflechit" hauteur={160} />
          <span>Aucune séance pour l'instant. Le bouton « Comité » est aussi présent sur les fiches (règles, scénarios, écrans, objets métier), les questions ouvertes et l'avant-projet.</span></div>
      )}
      {modale && <ComiteModal projet={projet} seance={modale.seance} fermer={() => { setModale(null); charger(); }} recharger={charger} />}
    </>
  );
}
