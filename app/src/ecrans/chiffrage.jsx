// Avant-projet : le chiffrage. Hypothèses (taux, équipe type, sprint), phases et leur modalité, montants recalculés,
// rétroplanning, et ce qui, dans la base, justifie chaque durée. Watson peut proposer un découpage argumenté.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Watson } from './commun.jsx';

const nb = (v) => (v === '' || v === null || v === undefined ? undefined : Number(String(v).replace(',', '.')));
const lignes = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);

export function Planning({ calcul, jalons = [] }) {
  const max = Math.max(4, Math.ceil(calcul.semaines || 0), ...jalons.map((j) => j.semaine || 0));
  const L = 900, G = 190, l = (L - G - 10) / max;
  const H = 40 + calcul.phases.length * 34 + (jalons.length ? 46 : 8);
  const opac = [1, 1, 0.6, 0.35];
  return (
    <svg viewBox={`0 0 ${L} ${H}`} class="chiffrage-planning" role="img" aria-label="Rétroplanning">
      {Array.from({ length: max }, (_, i) => <text key={i} x={G + i * l + l / 2} y={14} text-anchor="middle" class="pl-s">S{i + 1}</text>)}
      {calcul.phases.map((p, i) => (
        <g key={p.id}>
          <text x={0} y={42 + i * 34} class="pl-nom">{p.nom.length > 26 ? `${p.nom.slice(0, 25)}…` : p.nom}</text>
          <rect x={G + (p.debut - 1) * l} y={28 + i * 34} width={Math.max(l * 0.8, (p.fin - p.debut + 1) * l)} height={18} rx={9} fill="#E62D36" opacity={opac[Math.min(3, i)]} />
        </g>
      ))}
      {jalons.map((j, i) => {
        const x = G + (j.semaine) * l - 1;
        const y = 34 + calcul.phases.length * 34;
        return (<g key={i}><line x1={x} x2={x} y1={22} y2={y} stroke="#4B4949" stroke-dasharray="3 3" /><rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} fill="#4B4949" />
          <text x={x} y={y + 22} text-anchor={x > L - 140 ? 'end' : 'middle'} class="pl-j">{`Semaine ${j.semaine} · ${j.libelle}`}</text></g>);
      })}
    </svg>
  );
}

export function Chiffrage({ projet, etat }) {
  const [d, setD] = useState(null);
  const [c, setC] = useState(null);
  const [calcul, setCalcul] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [occupe, setOccupe] = useState(null);
  const [demande, setDemande] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const minuterie = useRef(null);
  const base = `/projets/${projet.id}/avant-projet/chiffrage`;
  const recevoir = (v) => { setD(v); setC(v.chiffrage); setCalcul(v.calcul); setModifie(false); };
  useEffect(() => { appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  if (!d || !c) return <Attente erreur={erreur} />;
  const changer = (n) => {
    setC(n); setModifie(true);
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => appel(`${base}/calculer`, { corps: { chiffrage: n } }).then(setCalcul).catch(() => {}), 350);
  };
  const faire = async (quoi, f) => { setOccupe(quoi); setMessage(null); try { recevoir(await f()); } catch (e) { setMessage(e.message); } finally { setOccupe(null); } };
  const ph = (i, k, v) => changer({ ...c, phases: c.phases.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const calc = Object.fromEntries((calcul?.phases || []).map((p) => [p.id, p]));
  const att = d.en_attente;
  if (occupe === 'proposer') {
    return <div class="carte pile" style="align-items:center;padding:40px;text-align:center"><Watson humeur="reflechit" hauteur={190} />
      <strong>Watson prépare le découpage</strong><span class="doux">À partir de ce que contient chaque lot, du cahier des charges et des hypothèses. Une à deux minutes.</span></div>;
  }
  return (
    <div class="pile" style="gap:14px">
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La proposition du découpage" />
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne">
        <span class="doux espace">Le commerce fixe les prix. Ici, les hypothèses, les montants recalculés et ce qui justifie chaque durée.</span>
        {!att && <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={15} /> Proposer le découpage</button>}
      </div>
      {demande !== null && (
        <div class="carte pile" style="gap:8px"><strong>Ce que Watson doit savoir</strong>
          <textarea class="saisie" style="min-height:60px;padding:10px 12px" placeholder="Facultatif : mise en production visée, budget annoncé par le client, équipe disponible…" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={() => { const dm = demande; setDemande(null); faire('proposer', () => appel(`${base}/proposer`, { corps: { demande: dm } })); }}><Sparkles size={15} /> Proposer</button>
            <button class="bouton" onClick={() => setDemande(null)}>Annuler</button></div></div>
      )}
      {att && (
        <div class="carte pile" style="gap:12px">
          <div class="ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={84} flotte={false} />
            <div class="pile espace" style="gap:4px"><strong>Watson propose {att.chiffrage.phases.length} phases</strong>{att.resume && <span class="doux">{att.resume}</span>}
              {att.chiffrage.a_confirmer?.length > 0 && <span class="petit">À confirmer : {att.chiffrage.a_confirmer.join(' · ')}</span>}</div>
            <div class="pile" style="gap:6px"><button class="bouton principal-b" disabled={!!occupe} onClick={() => faire('garder', () => appel(`${base}/garder`, { corps: {} }))}><Check size={15} /> Garder</button>
              <button class="bouton" disabled={!!occupe} onClick={() => faire('ecarter', () => appel(`${base}/ecarter`, { corps: {} }))}><X size={15} /> Écarter</button></div></div>
          <table class="tableau"><thead><tr><th>Phase</th><th>Modalité</th><th>Durée</th><th>Montant</th><th>Pourquoi</th></tr></thead>
            <tbody>{att.calcul.phases.map((p) => <tr key={p.id}><td><b>{p.nom}</b><div class="doux petit">{p.contenu}</div></td><td>{p.modalite}</td><td>{p.duree_texte || `${p.jours_texte} j`}</td><td>{p.montant_texte}</td>
              <td><ul class="chiffrage-pourquoi">{p.pourquoi.map((x, i) => <li key={i}>{x}</li>)}</ul></td></tr>)}</tbody></table>
        </div>
      )}

      <div class="chiffrage-haut">
        <section class="carte pile" style="gap:10px">
          <strong>Hypothèses</strong>
          <div class="ligne" style="gap:10px">
            <label class="champ" style="width:170px">Taux journalier (€ HT)<input inputMode="decimal" value={c.tjm ?? ''} placeholder="à renseigner" onInput={(e) => changer({ ...c, tjm: nb(e.target.value) ?? null })} /></label>
            <label class="champ" style="width:150px">Sprint (semaines)<input inputMode="decimal" value={c.duree_sprint ?? 1} onInput={(e) => changer({ ...c, duree_sprint: nb(e.target.value) || 1 })} /></label>
          </div>
          <div class="pile" style="gap:6px"><span class="petit doux">Équipe type : jours de chaque profil dans un sprint</span>
            {c.profils.map((p, i) => (
              <div key={i} class="ligne" style="gap:6px;flex-wrap:nowrap">
                <input class="saisie espace" value={p.nom} placeholder="Profil" onInput={(e) => changer({ ...c, profils: c.profils.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })} />
                <input class="saisie" style="width:80px" inputMode="decimal" value={p.jours_par_sprint} onInput={(e) => changer({ ...c, profils: c.profils.map((x, j) => (j === i ? { ...x, jours_par_sprint: nb(e.target.value) || 0 } : x)) })} /><span class="doux petit">j</span>
                <button class="bouton icone" title="Retirer" onClick={() => changer({ ...c, profils: c.profils.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>))}
            <div class="ligne" style="gap:6px"><button class="bouton" onClick={() => changer({ ...c, profils: [...c.profils, { nom: '', jours_par_sprint: 5 }] })}><Plus size={14} /> Profil</button>
              {(d.defaut.tjm != null || d.defaut.profils.length > 0) && <button class="bouton" onClick={() => changer({ ...c, tjm: d.defaut.tjm, duree_sprint: d.defaut.duree_sprint, profils: d.defaut.profils })}>Reprendre les hypothèses habituelles</button>}
              <button class="bouton" disabled={modifie || !!occupe} title={modifie ? 'Enregistre d\'abord' : ''} onClick={() => faire('defaut', () => appel(`${base}/hypotheses`, { corps: {} }))}>En faire les hypothèses habituelles</button></div>
          </div>
          {calcul?.base_calcul && <p class="petit doux" style="margin:0">{calcul.base_calcul}</p>}
        </section>
        <section class="carte chiffrage-totaux">
          <div><span class="doux petit">Total des phases</span><b>{calcul?.total_texte}</b></div>
          <div><span class="doux petit">Première enveloppe à annoncer</span><b>{calcul?.annonce_texte || 'à choisir'}</b>{calcul?.annonce_phases?.length > 0 && <span class="petit doux">{calcul.annonce_phases.join(' + ')}</span>}</div>
          <div><span class="doux petit">Durée</span><b>{calcul ? `${Math.ceil(calcul.semaines)} semaines` : ''}</b></div>
          {calcul?.manque_tjm && <p class="encart e-orange petit" style="margin:0">Sans taux journalier, les montants restent à renseigner : Watson n'en invente aucun.</p>}
        </section>
      </div>

      <section class="carte pile" style="gap:10px">
        <div class="ligne"><strong class="espace">Phases</strong>
          <button class="bouton" onClick={() => changer({ ...c, phases: [...c.phases, { id: `phase-${c.phases.length + 1}`, nom: 'Nouvelle phase', modalite: 'sprints', sprints: 1 }] })}><Plus size={14} /> Phase</button></div>
        {c.phases.length === 0 && <p class="doux" style="margin:0">Aucune phase. Ajoute-les, ou demande à Watson de proposer le découpage.</p>}
        {c.phases.map((p, i) => {
          const k = calc[p.id];
          const sprints = ['sprints', 'estimation'].includes(p.modalite);
          return (
            <div key={i} class="chiffrage-phase">
              <div class="ligne" style="gap:8px;flex-wrap:nowrap">
                <input class="saisie espace" value={p.nom} onInput={(e) => ph(i, 'nom', e.target.value)} />
                <select class="saisie" value={p.modalite} onChange={(e) => ph(i, 'modalite', e.target.value)}>{Object.entries(d.modalites).map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
                <label class="chiffrage-annonce" title="Dans la première enveloppe annoncée"><input type="checkbox" checked={c.annonce.includes(p.id)} onChange={(e) => changer({ ...c, annonce: e.target.checked ? [...c.annonce, p.id] : c.annonce.filter((x) => x !== p.id) })} /> annoncée</label>
                <button class="bouton icone" title="Retirer" onClick={() => changer({ ...c, phases: c.phases.filter((_, j) => j !== i), annonce: c.annonce.filter((x) => x !== p.id) })}><Trash2 size={14} /></button>
              </div>
              <div class="ligne" style="gap:8px">
                {sprints ? <label class="champ mini">Sprints<input inputMode="decimal" value={p.sprints ?? ''} onInput={(e) => ph(i, 'sprints', nb(e.target.value))} /></label>
                  : <><label class="champ mini">Jours{p.modalite === 'fourchette' ? ' (min)' : ''}<input inputMode="decimal" value={p.jours ?? ''} placeholder={p.jours_profils?.length ? 'par profil' : ''} onInput={(e) => ph(i, 'jours', nb(e.target.value))} /></label>
                    {p.modalite === 'fourchette' && <label class="champ mini">Jours (max)<input inputMode="decimal" value={p.jours_max ?? ''} onInput={(e) => ph(i, 'jours_max', nb(e.target.value))} /></label>}
                    <label class="champ mini">Semaines<input inputMode="decimal" value={p.semaines ?? ''} onInput={(e) => ph(i, 'semaines', nb(e.target.value))} /></label>
                    {p.modalite === 'fourchette' && <label class="champ mini">Semaines (max)<input inputMode="decimal" value={p.semaines_max ?? ''} onInput={(e) => ph(i, 'semaines_max', nb(e.target.value))} /></label>}</>}
                <label class="champ mini" title="Laisser vide : la phase suit la précédente">Début (semaine)<input inputMode="decimal" value={p.debut ?? ''} placeholder="à la suite" onInput={(e) => ph(i, 'debut', nb(e.target.value))} /></label>
                {d.versions.length > 1 && <div class="champ">Lots couverts<div class="ligne" style="gap:4px;min-height:40px">{d.versions.map((v) => {
                  const on = (p.versions || []).includes(v.id);
                  return <button key={v.id} type="button" class={`puce-lot ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => ph(i, 'versions', on ? p.versions.filter((x) => x !== v.id) : [...(p.versions || []), v.id])}>{v.nom}</button>;
                })}</div></div>}
                {k && <div class="chiffrage-resultat"><b>{k.montant_texte}</b><span class="doux petit">{k.jours_texte} j · S{k.debut} à S{k.fin}</span></div>}
              </div>
              <div class="ligne" style="gap:8px">
                <label class="champ espace">Contenu<input value={p.contenu || ''} onInput={(e) => ph(i, 'contenu', e.target.value)} /></label>
                <label class="champ espace">Livrables<input value={p.livrables || ''} onInput={(e) => ph(i, 'livrables', e.target.value)} /></label>
              </div>
              <label class="champ">Pourquoi cette durée (une raison par ligne)<textarea rows={2} value={(p.pourquoi || []).join('\n')} onInput={(e) => ph(i, 'pourquoi', lignes(e.target.value))} /></label>
            </div>
          );
        })}
      </section>

      {calcul?.phases.length > 0 && (
        <section class="carte pile" style="gap:10px"><strong>Rétroplanning</strong>
          <Planning calcul={calcul} jalons={c.jalons} />
          <label class="champ">Jalons (« semaine | libellé », un par ligne)<textarea rows={3} value={c.jalons.map((j) => `${j.semaine} | ${j.libelle}`).join('\n')}
            onInput={(e) => changer({ ...c, jalons: lignes(e.target.value).map((x) => { const [s, ...l] = x.split('|'); return { semaine: nb(s.trim()) || 1, libelle: l.join('|').trim() }; }).filter((j) => j.libelle) })} /></label>
        </section>
      )}

      <div class="chiffrage-haut">
        <label class="champ carte">Options chiffrées à part (une par ligne)<textarea rows={4} value={c.options.join('\n')} onInput={(e) => changer({ ...c, options: lignes(e.target.value) })} /></label>
        <label class="champ carte">Récurrent (une ligne par poste)<textarea rows={4} value={c.recurrent.join('\n')} onInput={(e) => changer({ ...c, recurrent: lignes(e.target.value) })} /></label>
      </div>

      <section class="carte pile" style="gap:8px">
        <strong>Ce qui pèse dans chaque lot</strong><span class="doux petit">Tiré de la base : de quoi justifier une durée devant le client ou le commerce.</span>
        <table class="tableau"><thead><tr><th>Lot</th><th>Scénarios</th><th>Écrans</th><th>Objets</th><th>Dont cycle de vie</th><th>Actions</th><th>Règles</th><th>Flux externes</th><th>À trancher</th></tr></thead>
          <tbody>{d.elements.map((x) => <tr key={x.version || 'tout'}><td><b>{x.nom}</b></td><td>{x.scenarios}</td><td>{x.ecrans}</td><td>{x.entites}</td><td>{x.cycles}</td><td>{x.actions}</td><td>{x.regles}</td>
            <td>{x.flux}{x.flux_noms.length > 0 && <div class="doux petit">{x.flux_noms.join(', ')}</div>}</td><td>{x.a_trancher}</td></tr>)}</tbody></table>
      </section>

      {modifie && <div class="barre-action" style="position:sticky;bottom:0"><span class="espace doux petit">Modifications non enregistrées</span>
        <button class="bouton" onClick={() => recevoir(d)}>Annuler</button>
        <button class="bouton principal-b" disabled={!!occupe} onClick={() => faire('enregistrer', () => appel(base, { corps: { chiffrage: c } }))}><Check size={15} /> Enregistrer</button></div>}
    </div>
  );
}
