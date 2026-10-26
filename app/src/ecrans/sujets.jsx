// Sujets en attente : les questions ouvertes du projet, à trancher. Une réponse peut ensuite mettre la base à jour
// par une demande à Watson, validée comme toujours.
import { useEffect, useState } from 'preact/hooks';
import { Check, CircleHelp, Plus, Quote, RotateCcw, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { LotEnCours } from './edition.jsx';

const date = (d) => (d ? d.split('-').reverse().join('/') : '');

function Sujet({ q, faire, reporter, occupe, claude, projet }) {
  const [rep, setRep] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const ouvert = (q.statut || 'ouvert') === 'ouvert';
  const base = (corps) => faire(`/sujets/${q.id}`, corps);
  return (
    <article class={`carte pile sujet ${ouvert ? '' : 'tranche'}`} style="gap:8px">
      <div class="ligne" style="align-items:flex-start;flex-wrap:nowrap;gap:10px">
        <CircleHelp size={18} color={ouvert ? '#B45309' : '#16A34A'} style="flex:0 0 auto;margin-top:2px" />
        <div class="pile espace" style="gap:3px">
          <strong>{q.question}</strong>
          {q.contexte && <span class="doux">{q.contexte}</span>}
          <span class="petit doux">{q.source || 'Source inconnue'}{q.date ? ` · ${date(q.date)}` : ''}{q.par ? ` · ${q.par}` : ''}</span>
        </div>
        {!ouvert && <span class="badge b-vert">Tranchée</span>}
      </div>
      {q.extrait && <div class="citation"><Quote size={14} /><em>{q.extrait}</em></div>}
      {q.reponse && rep === null && (
        <div class="reponse-sujet"><b>Réponse</b> {q.reponse}{q.tranche_le && <span class="petit doux"> · tranchée le {date(q.tranche_le)}{q.tranche_par ? ` par ${q.tranche_par}` : ''}</span>}</div>
      )}
      {rep !== null && (
        <div class="pile" style="gap:6px">
          <textarea class="saisie" style="min-height:70px;padding:10px 12px" autoFocus placeholder="La réponse décidée, telle qu'elle doit être retenue" value={rep} onInput={(e) => setRep(e.target.value)} />
          <div class="ligne">
            <button class="bouton principal-b" disabled={occupe || !rep.trim()} onClick={async () => { if (await base({ reponse: rep, statut: 'tranche' })) setRep(null); }}><Check size={14} /> Trancher</button>
            <button class="bouton" disabled={occupe} onClick={async () => { if (await base({ reponse: rep })) setRep(null); }}>Enregistrer sans trancher</button>
            <button class="bouton" onClick={() => setRep(null)}>Annuler</button>
          </div>
        </div>
      )}
      {rep === null && (
        <div class="ligne" style="gap:6px">
          {ouvert && <button class="bouton" disabled={occupe} onClick={() => setRep(q.reponse || '')}><Check size={14} /> {q.reponse ? 'Reprendre la réponse' : 'Répondre'}</button>}
          {ouvert && <BoutonComite projet={projet} cible={{ type: 'sujet', id: q.id }} libelle="Demander au comité" desactive={occupe} />}
          {!ouvert && <button class="bouton bouton-watson" disabled={occupe || !claude?.connecte} title="Watson propose les changements de la base qui découlent de la réponse" onClick={() => reporter(q)}><Sparkles size={14} /> Mettre la base à jour</button>}
          {!ouvert && <button class="bouton" disabled={occupe} onClick={() => base({ statut: 'ouvert' })}><RotateCcw size={14} /> Rouvrir</button>}
          {q.mise_a_jour && <span class="petit doux">Base mise à jour</span>}
          <span class="espace" />
          {confirmer ? <button class="bouton danger" disabled={occupe} onClick={() => faire(`/sujets/${q.id}`, {}, 'DELETE')}>Retirer la question</button>
            : <button class="bouton icone" title="Retirer" onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
        </div>
      )}
    </article>
  );
}

export function Sujets({ projet, etat, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [filtre, setFiltre] = useState('ouverts');
  const [source, setSource] = useState('');
  const [nouvelle, setNouvelle] = useState(null);
  const [lot, setLot] = useState(null);
  const [attente, setAttente] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  useEffect(() => { appel(`/projets/${projet.id}/sujets`).then(setD).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const faire = async (chemin, corps, methode) => {
    setOccupe(true); setMessage(null);
    try { setD(await appel(`/projets/${projet.id}${chemin}`, { corps, methode })); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); }
  };
  const reporter = async (q) => {
    setAttente(q); setMessage(null);
    try { setLot({ ...(await appel(`/projets/${projet.id}/sujets/${q.id}/reporter`, { corps: {} })), question: q }); } catch (e) { setMessage(e.message); }
    setAttente(null);
  };
  const liste = d.sujets.filter((q) => (filtre === 'tous' || (filtre === 'ouverts') === ((q.statut || 'ouvert') === 'ouvert')) && (!source || (q.source || '').startsWith(source)));
  const tranches = d.sujets.length - d.ouverts;
  return (
    <>
      <Entete titre="Sujets en attente" description="Les questions ouvertes du projet, relevées dans les documents, le cahier des charges, le moodboard, les maquettes, ou notées à la main. Une fois tranchée, une réponse peut mettre la base à jour.">
        <div class="ligne">
          <div class="segments">
            {[['ouverts', `Ouvertes (${d.ouverts})`], ['tranches', `Tranchées (${tranches})`], ['tous', 'Toutes']].map(([k, v]) => <button key={k} class={`segment ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>)}
          </div>
          {d.sources.length > 1 && <select class="saisie" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Toutes les sources</option>{d.sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
          <button class="bouton" onClick={() => setNouvelle(nouvelle ? null : { question: '', contexte: '' })}><Plus size={15} /> Question</button>
        </div>
      </Entete>
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La mise à jour de la base" />
      {message && <p class="encart e-rouge">{message}</p>}
      {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="reflechit" hauteur={80} flotte={false} /><span><strong>Watson prépare les changements</strong><br /><span class="doux">qui découlent de la réponse à « {attente.question} ».</span></span></div>}
      {lot && (
        <div class="carte">
          <LotEnCours projet={projet} lot={lot}
            fini={async (r) => { await faire(`/sujets/${lot.question.id}`, { lot: lot.id }); setLot(null); setMessage(null); }}
            abandonner={async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); }} />
        </div>
      )}
      {nouvelle && (
        <div class="carte pile" style="gap:8px">
          <label class="champ">Question<input autoFocus value={nouvelle.question} onInput={(e) => setNouvelle({ ...nouvelle, question: e.target.value })} /></label>
          <label class="champ">Contexte, facultatif<textarea rows={2} value={nouvelle.contexte} onInput={(e) => setNouvelle({ ...nouvelle, contexte: e.target.value })} /></label>
          <div class="ligne"><button class="bouton principal-b" disabled={occupe || !nouvelle.question.trim()} onClick={async () => { if (await faire('/sujets', nouvelle)) setNouvelle(null); }}><Check size={14} /> Ajouter</button>
            <button class="bouton" onClick={() => setNouvelle(null)}><X size={14} /> Annuler</button></div>
        </div>
      )}
      {liste.length === 0 && (
        <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur={d.ouverts ? 'question' : 'coeur'} hauteur={150} />
          <span>{filtre === 'ouverts' ? 'Aucune question ouverte. Elles arrivent d\'Alimenter et des onglets de l\'avant-projet.' : 'Rien ici pour l\'instant.'}</span></div>
      )}
      <div class="pile" style="gap:10px">{liste.map((q) => <Sujet key={q.id} projet={projet} q={q} faire={faire} reporter={reporter} occupe={occupe || !!attente || !!lot} claude={claude} />)}</div>
      {d.a_trancher.length > 0 && (
        <section class="pile" style="gap:8px;margin-top:8px">
          <h2>Aussi en suspens dans la base</h2>
          <span class="doux petit">Ce que les onglets marquent eux-mêmes comme pas encore décidé.</span>
          <div class="ligne" style="gap:8px">{d.a_trancher.map((x) => (
            <button key={x.id} class="bouton" onClick={() => aller(x.onglet)}><span class="badge b-orange">{x.genre}</span> {x.nom}</button>
          ))}</div>
        </section>
      )}
    </>
  );
}
