// Qui fait quoi : pour chaque objet métier, d'où viennent ses données, qui le crée, le consulte, le modifie, le
// supprime (le « CRUD »), et la matrice des droits par acteur. Le détail par objet est celui de la proposition écrite.
import { useEffect, useState } from 'preact/hooks';
import { Check, Sparkles, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';

const ORDRE = 'CRUD';
const trier = (s) => [...new Set(s)].sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b)).join('');

function Cellule({ droits = '', deduits = '', changer }) {
  return (
    <div class="crud-cellule">
      {[...ORDRE].map((l) => {
        const a = droits.includes(l);
        const d = !a && deduits.includes(l);
        return (
          <button key={l} class={`crud-l ${a ? 'on' : ''} ${d ? 'deduit' : ''}`} title={`${{ C: 'Créer', R: 'Consulter', U: 'Modifier', D: 'Supprimer' }[l]}${d ? ' (la base le laisse penser)' : ''}`}
            aria-pressed={a} onClick={() => changer(trier(a ? droits.replace(l, '') : droits + l))}>{l}</button>
        );
      })}
    </div>
  );
}

export function Crud({ projet, etat }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [entites, setEntites] = useState([]);
  const [modifie, setModifie] = useState(false);
  const [onglet, setOnglet] = useState('matrice');
  const [occupe, setOccupe] = useState(null);
  const [demande, setDemande] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/crud`;
  const recevoir = (v) => { setD(v); setEntites(v.entites); setModifie(false); };
  useEffect(() => { appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const faire = async (quoi, f) => { setOccupe(quoi); setMessage(null); try { recevoir(await f()); } catch (e) { setMessage(e.message); } finally { setOccupe(null); } };
  const changer = (id, k, v) => { setEntites(entites.map((e) => (e.id === id ? { ...e, [k]: v } : e))); setModifie(true); };
  const enregistrer = () => faire('enregistrer', () => appel(base, { corps: { entites: entites.map((e) => ({ id: e.id, origine: e.origine, crud: e.crud, droits: e.droits })) } }));
  const visibles = entites.filter((e) => e.a_ecran || e.cycle);
  const autres = entites.filter((e) => !(e.a_ecran || e.cycle));
  const att = d.en_attente;
  const entete = (
    <Entete titre="Qui fait quoi" description="Pour chaque objet métier : d'où viennent ses données, qui le crée, le consulte, le modifie et le supprime, et les droits de chaque acteur. C'est aussi le détail par objet de la proposition écrite.">
      {!att && !occupe && <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={15} /> Proposer avec Watson</button>}
    </Entete>
  );
  if (occupe === 'proposer') {
    return (<>{entete}<div class="carte pile" style="align-items:center;padding:40px;text-align:center"><Watson humeur="reflechit" hauteur={190} />
      <strong>Watson regarde qui fait quoi</strong><span class="doux">À partir des actions et de leurs acteurs, des écrans, des flux et des règles. Une à deux minutes.</span></div></>);
  }
  return (
    <>
      {entete}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La proposition des droits" />
      {message && <p class="encart e-rouge">{message}</p>}
      {demande !== null && (
        <div class="carte pile" style="gap:8px">
          <strong>Ce que Watson doit savoir</strong>
          <textarea class="saisie" style="min-height:60px;padding:10px 12px" placeholder="Facultatif : « les données viennent toutes du SI-SIAO », « on ne supprime jamais, on archive »…" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={() => { const dm = demande; setDemande(null); faire('proposer', () => appel(`${base}/proposer`, { corps: { demande: dm } })); }}><Sparkles size={15} /> Proposer</button>
            <button class="bouton" onClick={() => setDemande(null)}>Annuler</button><span class="doux petit">Watson complète ce qui est vide et garde ce qui est déjà dit.</span></div>
        </div>
      )}
      {att && (
        <div class="carte pile" style="gap:12px">
          <div class="ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={84} flotte={false} />
            <div class="pile espace" style="gap:4px"><strong>Watson propose qui fait quoi sur {att.entites.length} objet{att.entites.length > 1 ? 's' : ''}</strong>
              {att.a_confirmer?.length > 0 && <span class="petit">À confirmer : {att.a_confirmer.join(' · ')}</span>}</div>
            <div class="pile" style="gap:6px"><button class="bouton principal-b" disabled={!!occupe} onClick={() => faire('garder', () => appel(`${base}/garder`, { corps: {} }))}><Check size={15} /> Garder</button>
              <button class="bouton" disabled={!!occupe} onClick={() => faire('ecarter', () => appel(`${base}/ecarter`, { corps: {} }))}><X size={15} /> Écarter</button></div></div>
          <table class="tableau crud-detail"><thead><tr><th>Objet</th><th>Origine</th><th>Création, modification, suppression</th><th>Droits</th></tr></thead>
            <tbody>{att.entites.map((e) => (
              <tr key={e.id}><td><b>{e.nom}</b>{e.pourquoi && <div class="doux petit">{e.pourquoi}</div>}</td><td>{e.origine}</td>
                <td>{Object.entries(e.crud).map(([k, v]) => <div key={k}><b>{d.champs[k]}</b> : {v}</div>)}</td>
                <td>{Object.entries(e.droits).map(([a, l]) => <div key={a}>{d.acteurs.find((x) => x.id === a)?.nom || a} <b class="crud-lettres">{l}</b></div>)}</td></tr>))}</tbody></table>
        </div>
      )}
      {d.points.length > 0 && (
        <div class="pile" style="gap:6px">{d.points.map((t) => <p key={t.id} class="encart e-indigo"><b>À vérifier.</b> {t.question}</p>)}</div>
      )}
      <div class="onglets">
        <button class={`onglet ${onglet === 'matrice' ? 'actif' : ''}`} onClick={() => setOnglet('matrice')}>Matrice des droits</button>
        <button class={`onglet ${onglet === 'detail' ? 'actif' : ''}`} onClick={() => setOnglet('detail')}>Détail par objet</button>
      </div>
      {!entites.length && <div class="vide">La base ne contient encore aucun objet métier.</div>}
      {onglet === 'matrice' && entites.length > 0 && (
        <div class="carte" style="overflow:auto">
          <table class="tableau crud-matrice">
            <thead><tr><th>Objet</th><th>Origine des données</th>{d.acteurs.map((a) => <th key={a.id} class="centre">{a.nom}</th>)}</tr></thead>
            <tbody>
              {[...visibles, ...autres].map((e, i) => (
                <tr key={e.id} class={i === visibles.length && autres.length ? 'crud-separe' : ''}>
                  <td><b>{e.nom}</b>{!e.a_ecran && <div class="doux petit">sans écran</div>}</td>
                  <td><input class="saisie crud-origine" value={e.origine} placeholder="Import, saisie, administration…" onInput={(ev) => changer(e.id, 'origine', ev.target.value)} /></td>
                  {d.acteurs.map((a) => (
                    <td key={a.id} class="centre"><Cellule droits={e.droits[a.id] || ''} deduits={e.deduits[a.id] || ''}
                      changer={(v) => changer(e.id, 'droits', Object.fromEntries(Object.entries({ ...e.droits, [a.id]: v }).filter(([, x]) => x)))} /></td>))}
                </tr>))}
            </tbody>
          </table>
          <p class="doux petit" style="margin:10px 0 0">C créer, R consulter, U modifier, D supprimer. Une lettre en pointillé : la base laisse penser que l'acteur en a besoin (il fait une action sur l'objet, ou voit son écran).</p>
        </div>
      )}
      {onglet === 'detail' && entites.length > 0 && (
        <div class="pile" style="gap:12px">
          {d.detail.length > 0 && (
            <div class="carte" style="overflow:auto">
              <table class="tableau crud-detail">
                <thead><tr><th>Objet</th><th>Écrans</th><th>Cycle de vie</th><th>CRUD</th><th>Liens</th></tr></thead>
                <tbody>{d.detail.map((x) => (
                  <tr key={x.id}><td><b>{x.nom}</b>{x.origine && <div class="doux petit">{x.origine}</div>}</td><td>{x.ecrans.map((s) => s.nom).join(', ')}</td>
                    <td>{x.flow}</td><td>{x.crud || <span class="doux">à dire</span>}</td><td>{x.liens.join(', ')}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          {visibles.map((e) => (
            <div key={e.id} class="carte pile" style="gap:8px">
              <strong>{e.nom}</strong>
              <div class="crud-champs">
                {Object.entries(d.champs).map(([k, lib]) => (
                  <label key={k} class="champ">{lib}<input value={e.crud[k] || ''} placeholder={{ creer: 'qui, ou d\'où ça vient', lire: 'qui consulte', modifier: 'qui, et quoi', supprimer: '« non, archivage »…' }[k]}
                    onInput={(ev) => changer(e.id, 'crud', { ...e.crud, [k]: ev.target.value })} /></label>))}
              </div>
            </div>))}
        </div>
      )}
      {modifie && <div class="barre-action" style="position:sticky;bottom:0"><span class="espace doux petit">Modifications non enregistrées</span>
        <button class="bouton" onClick={() => recevoir(d)}>Annuler</button><button class="bouton principal-b" disabled={!!occupe} onClick={enregistrer}><Check size={15} /> Enregistrer</button></div>}
    </>
  );
}
