// Avant-projet : la proposition écrite, le document de travail qui accompagne le deck. Watson rédige le récap du besoin,
// le socle, le moodboard, les décisions, le dispositif et les points ouverts ; les tableaux (objets métier, cycle de vie,
// détail par objet avec écrans, états et CRUD, maquettes, enveloppe, rétroplanning) viennent de la base et du chiffrage.
import { useEffect, useState } from 'preact/hooks';
import { Check, FileDown, FileText, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Watson } from './commun.jsx';
import { Markdown } from './markdown.jsx';

const PARTIES = [['besoin', '1'], ['socle', '2'], ['transverse', '2.1'], ['cycle', '2.3'], ['moodboard', '3'], ['decisions', '4'], ['dispositif', '5.1']];

export function Ecrite({ projet, etat }) {
  const [d, setD] = useState(null);
  const [doc, setDoc] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [occupe, setOccupe] = useState(null);
  const [demande, setDemande] = useState(null);
  const [edition, setEdition] = useState(false);
  const [fini, setFini] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/avant-projet/ecrite`;
  const recevoir = (v) => { setD(v); setDoc(v.dossier); setModifie(false); };
  useEffect(() => { appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  if (!d || !doc) return <Attente erreur={erreur} />;
  const faire = async (quoi, f) => { setOccupe(quoi); setMessage(null); try { const r = await f(); if (r?.dossier) recevoir(r); return r; } catch (e) { setMessage(e.message); return null; } finally { setOccupe(null); } };
  const changer = (n) => { setDoc(n); setModifie(true); };
  const enregistrer = () => faire('enregistrer', () => appel(base, { corps: { dossier: doc } }));
  const exporter = async (format) => { setFini(null); const r = await faire('exporter', async () => { if (modifie) await appel(base, { corps: { dossier: doc } }); return appel(`${base}/exporter`, { corps: { format } }); }); if (r?.nom) { setFini(r); setModifie(false); } };
  const att = d.en_attente;
  if (occupe === 'rediger') {
    return <div class="carte pile" style="align-items:center;padding:40px;text-align:center"><Watson humeur="ecrit" hauteur={200} />
      <strong>Watson rédige la proposition écrite</strong><span class="doux">À partir du cahier des charges, de la base, du moodboard, des maquettes et du chiffrage. Deux à quatre minutes.</span></div>;
  }
  const fs = doc.fonctionnalites || [];
  const pts = doc.points || [];
  return (
    <div class="pile" style="gap:14px">
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La rédaction de la proposition écrite" />
      {message && <p class="encart e-rouge">{message}</p>}
      {fini && <div class="encart e-indigo ligne"><span class="espace">Enregistré dans Téléchargements : <strong>{fini.nom}</strong>. Un fichier Word s'importe tel quel dans Google Docs.</span><button class="bouton icone" onClick={() => setFini(null)}><X size={14} /></button></div>}
      <div class="ligne">
        <span class="doux espace">Le document de travail qui accompagne le deck. Les tableaux viennent de la base, de « Qui fait quoi », des maquettes et du chiffrage.</span>
        {d.existe && <select class="saisie" value={doc.statut || 'brouillon'} onChange={(e) => changer({ ...doc, statut: e.target.value })}>{Object.entries(d.statuts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        {!att && <button class="bouton" onClick={() => setEdition(!edition)}><Pencil size={15} /> {edition ? 'Voir le document' : 'Modifier'}</button>}
        <button class="bouton" disabled={!!occupe} onClick={() => exporter('docx')}><FileText size={15} /> Word</button>
        <button class="bouton" disabled={!!occupe} onClick={() => exporter('html')}><FileDown size={15} /> HTML</button>
        {!att && <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={15} /> {d.existe ? 'Réécrire avec Watson' : 'Rédiger avec Watson'}</button>}
      </div>
      {demande !== null && (
        <div class="carte pile" style="gap:8px"><strong>Ce que Watson doit savoir</strong>
          <textarea class="saisie" style="min-height:60px;padding:10px 12px" placeholder="Facultatif : ce que le client attend dans les offres, ce qui est hors socle, le ton…" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={() => { const dm = demande; setDemande(null); faire('rediger', () => appel(`${base}/rediger`, { corps: { demande: dm } })); }}><Sparkles size={15} /> Rédiger</button>
            <button class="bouton" onClick={() => setDemande(null)}>Annuler</button><span class="doux petit">Mieux vaut avoir le cahier des charges, « Qui fait quoi » et le chiffrage avant.</span></div></div>
      )}
      {att && (
        <div class="carte ligne" style="gap:16px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={90} flotte={false} />
          <div class="pile espace" style="gap:4px"><strong>Watson propose une rédaction</strong>{att.resume && <span class="doux">{att.resume}</span>}
            {att.a_confirmer?.length > 0 && <span class="petit">À confirmer : {att.a_confirmer.join(' · ')}</span>}<span class="doux petit">L'aperçu ci-dessous montre le document tel qu'il serait gardé.</span></div>
          <div class="pile" style="gap:6px"><button class="bouton principal-b" disabled={!!occupe} onClick={() => faire('garder', () => appel(`${base}/garder`, { corps: {} }))}><Check size={15} /> Garder</button>
            <button class="bouton" disabled={!!occupe} onClick={() => faire('ecarter', () => appel(`${base}/ecarter`, { corps: {} }))}><X size={15} /> Écarter</button></div>
        </div>
      )}
      {edition && !att ? (
        <div class="pile" style="gap:12px">
          <div class="carte ligne" style="gap:10px">
            <label class="champ espace">Titre<input value={doc.titre || ''} placeholder={`Proposition : ${projet.nom || ''}`} onInput={(e) => changer({ ...doc, titre: e.target.value })} /></label>
            <label class="champ" style="width:200px">Date<input value={doc.date || ''} onInput={(e) => changer({ ...doc, date: e.target.value })} /></label>
            <label class="champ" style="width:200px">Auteur<input value={doc.auteur || ''} onInput={(e) => changer({ ...doc, auteur: e.target.value })} /></label>
          </div>
          {PARTIES.map(([k, n]) => (
            <label key={k} class="champ carte">{n}. {d.rediges[k].titre}<span class="doux petit">{d.rediges[k].aide}</span>
              <textarea rows={k === 'besoin' || k === 'moodboard' ? 10 : 5} value={(doc.redige || {})[k] || ''} onInput={(e) => changer({ ...doc, redige: { ...(doc.redige || {}), [k]: e.target.value } })} /></label>))}
          <div class="carte pile" style="gap:8px">
            <div class="ligne"><strong class="espace">2.1 Fonctionnalités</strong><button class="bouton" onClick={() => changer({ ...doc, fonctionnalites: [...fs, { id: `F${fs.length + 1}`, nom: '' }] })}><Plus size={14} /> Fonctionnalité</button></div>
            {fs.map((f, i) => {
              const ch = (k, v) => changer({ ...doc, fonctionnalites: fs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
              return (
                <div key={i} class="ligne" style="gap:6px;flex-wrap:nowrap;align-items:flex-start">
                  <input class="saisie" style="width:56px" value={f.id} onInput={(e) => ch('id', e.target.value)} />
                  <input class="saisie" style="width:200px" value={f.nom} placeholder="Fonctionnalité" onInput={(e) => ch('nom', e.target.value)} />
                  <input class="saisie" style="width:150px" value={f.utilisateurs || ''} placeholder="Utilisateurs" onInput={(e) => ch('utilisateurs', e.target.value)} />
                  <textarea class="saisie espace" rows={2} style="padding:8px 10px" value={f.description || ''} placeholder="Ce que ça fait" onInput={(e) => ch('description', e.target.value)} />
                  <select class="saisie" value={f.lot || ''} onChange={(e) => ch('lot', e.target.value)}><option value="">Lot</option>{d.versions.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select>
                  <button class="bouton icone" title="Retirer" onClick={() => changer({ ...doc, fonctionnalites: fs.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>);
            })}
          </div>
          <label class="champ carte">6. Points ouverts (« thème : question », un par ligne)
            <textarea rows={6} value={pts.map((x) => (x.theme ? `${x.theme} : ${x.question}` : x.question)).join('\n')}
              onInput={(e) => changer({ ...doc, points: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const [a, ...b] = x.split(' : '); return b.length ? { theme: a.trim(), question: b.join(' : ').trim() } : { question: a.trim() }; }) })} /></label>
        </div>
      ) : (
        <article class="carte dossier-doc"><Markdown document texte={att ? d.apercu_attente : d.markdown} /></article>
      )}
      {modifie && <div class="barre-action" style="position:sticky;bottom:0"><span class="espace doux petit">Modifications non enregistrées</span>
        <button class="bouton" onClick={() => recevoir(d)}>Annuler</button><button class="bouton principal-b" disabled={!!occupe} onClick={enregistrer}><Check size={15} /> Enregistrer</button></div>}
    </div>
  );
}
