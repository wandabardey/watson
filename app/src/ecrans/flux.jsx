// Flux externes : les échanges entre les applications du produit et les systèmes du client ou des partenaires.
// Une carte (qui échange avec qui, dans quel sens), puis chaque flux : déclencheur, moyen, données, règles, et ce qui
// se passe s'il échoue. On les crée à la main ou en les décrivant à Watson, et Alimenter les tire des documents.
import { useEffect, useState } from 'preact/hooks';
import { ArrowLeftRight, Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Entete, GRAVITE, Watson } from './commun.jsx';
import { BoutonComite } from './comite.jsx';
import { DemandeWatson, LotEnCours } from './edition.jsx';

const SENS = { entrant: 'Entrant', sortant: 'Sortant', bidirectionnel: 'Dans les deux sens' };
const MOYENS = { api: 'Service web (API)', fichier: 'Fichier', mail: 'Mail', edi: 'EDI', autre: 'Autre' };
const GENRES_DEC = { evenement: 'Une action du cycle de vie', planifie: 'À heure fixe', a_la_demande: 'À la demande' };

function Carte({ d, choisir, choisi }) {
  const L = 1240;
  const apps = d.applications.filter((a) => d.flux.some((f) => f.application === a.id));
  const gauche = d.partenaires.filter((p) => d.flux.some((f) => f.partenaire === p && f.sens === 'entrant'));
  const droite = d.partenaires.filter((p) => !gauche.includes(p));
  const H = Math.max(160, 70 * Math.max(apps.length, gauche.length, droite.length) + 40);
  const y = (i, n) => (H / (n + 1)) * (i + 1);
  const pos = {};
  apps.forEach((a, i) => { pos[a.id] = { x: L / 2, y: y(i, apps.length) }; });
  gauche.forEach((p, i) => { pos[`p:${p}`] = { x: 120, y: y(i, gauche.length) }; });
  droite.forEach((p, i) => { pos[`p:${p}`] = { x: L - 120, y: y(i, droite.length) }; });
  const sansApp = d.flux.some((f) => !f.application);
  if (sansApp && !apps.length) pos[''] = { x: L / 2, y: H / 2 };
  return (
    <svg viewBox={`0 0 ${L} ${H}`} class="carte-flux" role="img" aria-label="Carte des flux externes">
      <defs><marker id="pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6366F1" /></marker></defs>
      {d.flux.map((f, i) => {
        const a = pos[f.application || ''] || { x: L / 2, y: H / 2 };
        const p = pos[`p:${f.partenaire}`];
        if (!p) return null;
        const dx = p.x < a.x ? -1 : 1;
        const x1 = a.x + dx * 112, x2 = p.x - dx * 112;
        const decal = (d.flux.filter((g) => g.partenaire === f.partenaire && (g.application || '') === (f.application || '')).indexOf(f)) * 14;
        const ya = a.y + decal - 7, yp = p.y + decal - 7;
        const versP = f.sens !== 'entrant';
        return (
          <g key={f.id} class={`lien-flux ${choisi === f.id ? 'actif' : ''}`} onClick={() => choisir(f.id)}>
            <path d={`M${x1},${ya} C${(x1 + x2) / 2},${ya} ${(x1 + x2) / 2},${yp} ${x2},${yp}`} fill="none"
              marker-end={versP ? 'url(#pointe)' : undefined} marker-start={!versP || f.sens === 'bidirectionnel' ? 'url(#pointe)' : undefined} />
            <text x={(x1 + x2) / 2} y={(ya + yp) / 2 - 6} text-anchor="middle">{f.nom.length > 40 ? `${f.nom.slice(0, 38)}…` : f.nom}</text>
          </g>
        );
      })}
      {apps.map((a) => <g key={a.id} class="noeud-app"><rect x={pos[a.id].x - 110} y={pos[a.id].y - 24} width="220" height="48" rx="14" style={`stroke:${a.couleur || '#4F46E5'}`} /><text x={pos[a.id].x} y={pos[a.id].y + 5} text-anchor="middle">{a.nom}</text></g>)}
      {[...gauche, ...droite].map((p) => <g key={p} class="noeud-partenaire"><rect x={pos[`p:${p}`].x - 110} y={pos[`p:${p}`].y - 24} width="220" height="48" rx="8" /><text x={pos[`p:${p}`].x} y={pos[`p:${p}`].y + 5} text-anchor="middle">{p.length > 26 ? `${p.slice(0, 24)}…` : p}</text></g>)}
    </svg>
  );
}

function Formulaire({ d, initial, enregistrer, annuler, occupe }) {
  const vide = { id: '', nom: '', description: '', sens: 'sortant', partenaire: '', application: d.applications[0]?.id || '', declencheur: { genre: 'evenement' }, moyen: 'api', format: '', donnees: [], regles: [], erreurs: '', volumetrie: '', responsable: '', version: '' };
  const [f, setF] = useState(() => ({ ...vide, ...JSON.parse(JSON.stringify(initial || {})), declencheur: { genre: 'evenement', ...(initial?.declencheur || {}) } }));
  const maj = (k, v) => setF({ ...f, [k]: v });
  const majD = (k, v) => setF({ ...f, declencheur: { ...f.declencheur, [k]: v } });
  const prochain = () => `FLX-${String(Math.max(0, ...d.flux.map((x) => parseInt(x.id.replace(/\D/g, ''), 10) || 0)) + 1).padStart(3, '0')}`;
  const valider = () => {
    const c = { ...f, id: f.id || prochain() };
    for (const k of ['application_nom', 'declencheur_texte', 'donnees_noms', 'regles_noms', 'points']) delete c[k];
    for (const k of ['description', 'format', 'erreurs', 'volumetrie', 'responsable', 'version', 'application']) if (!c[k]) delete c[k];
    const dec = { genre: c.declencheur.genre };
    if (dec.genre === 'evenement' && c.declencheur.transition) dec.transition = c.declencheur.transition;
    if (dec.genre === 'planifie' && c.declencheur.frequence) dec.frequence = c.declencheur.frequence;
    if (c.declencheur.description) dec.description = c.declencheur.description;
    c.declencheur = dec;
    c.donnees = c.donnees.filter((x) => x.entite).map((x) => ({ entite: x.entite, ...(x.attributs?.length ? { attributs: x.attributs } : {}) }));
    if (!c.donnees.length) delete c.donnees;
    if (!c.regles.length) delete c.regles;
    enregistrer(c);
  };
  return (
    <div class="carte pile" style="gap:12px">
      <div class="ligne" style="gap:12px">
        <label class="champ" style="flex:2 1 280px">Nom<input autoFocus value={f.nom} placeholder="Par exemple : Déclaration en douane" onInput={(e) => maj('nom', e.target.value)} /></label>
        <label class="champ" style="flex:2 1 240px">Système partenaire<input value={f.partenaire} list="partenaires" placeholder="ERP du client, Douane…" onInput={(e) => maj('partenaire', e.target.value)} />
          <datalist id="partenaires">{d.partenaires.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label class="champ" style="flex:1 1 160px">Sens<select value={f.sens} onChange={(e) => maj('sens', e.target.value)}>{Object.entries(SENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {d.applications.length > 0 && <label class="champ" style="flex:1 1 180px">Application<select value={f.application || ''} onChange={(e) => maj('application', e.target.value)}><option value="">Aucune</option>{d.applications.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>}
      </div>
      <label class="champ">Description, facultative<textarea rows={2} value={f.description} onInput={(e) => maj('description', e.target.value)} /></label>
      <div class="ligne" style="gap:12px;align-items:flex-start">
        <label class="champ" style="flex:1 1 200px">Déclencheur<select value={f.declencheur.genre} onChange={(e) => majD('genre', e.target.value)}>{Object.entries(GENRES_DEC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {f.declencheur.genre === 'evenement' && <label class="champ" style="flex:2 1 280px">Quelle action<select value={f.declencheur.transition || ''} onChange={(e) => majD('transition', e.target.value)}><option value="">À préciser</option>{d.transitions.map((t) => <option key={t.id} value={t.id}>{t.nom} ({t.entite})</option>)}</select></label>}
        {f.declencheur.genre === 'planifie' && <label class="champ" style="flex:2 1 280px">Quand<input value={f.declencheur.frequence || ''} placeholder="Chaque nuit à 2 h" onInput={(e) => majD('frequence', e.target.value)} /></label>}
        <label class="champ" style="flex:1 1 180px">Moyen<select value={f.moyen} onChange={(e) => maj('moyen', e.target.value)}>{Object.entries(MOYENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label class="champ" style="flex:1 1 200px">Format<input value={f.format} placeholder="CSV, XML, JSON…" onInput={(e) => maj('format', e.target.value)} /></label>
      </div>
      <div class="pile" style="gap:6px">
        <span class="petit doux">Données transmises</span>
        {f.donnees.map((x, i) => {
          const ent = d.entites.find((e) => e.id === x.entite);
          return (
            <div key={i} class="pile donnee-flux" style="gap:6px">
              <div class="ligne" style="gap:6px;flex-wrap:nowrap">
                <select class="saisie espace" value={x.entite} onChange={(e) => maj('donnees', f.donnees.map((y, j) => (i === j ? { entite: e.target.value, attributs: [] } : y)))}>
                  <option value="">Objet métier…</option>{d.entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>
                <button class="bouton icone" onClick={() => maj('donnees', f.donnees.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
              {ent && <div class="ligne" style="gap:6px">{ent.attributs.map((a) => {
                const pris = (x.attributs || []).includes(a.nom);
                return <button key={a.nom} class={`puce-option ${pris ? 'choisie' : ''}`} onClick={() => maj('donnees', f.donnees.map((y, j) => (i === j ? { ...y, attributs: pris ? y.attributs.filter((z) => z !== a.nom) : [...(y.attributs || []), a.nom] } : y)))}>{a.libelle}</button>;
              })}</div>}
            </div>
          );
        })}
        <button class="lien petit" style="align-self:flex-start" onClick={() => maj('donnees', [...f.donnees, { entite: '', attributs: [] }])}><Plus size={13} /> Objet transmis</button>
      </div>
      <label class="champ">Si l'échange échoue<textarea rows={2} value={f.erreurs} placeholder="Qui est prévenu, que devient l'opération en cours, faut-il relancer" onInput={(e) => maj('erreurs', e.target.value)} /></label>
      <div class="ligne" style="gap:12px">
        <label class="champ" style="flex:1 1 220px">Volumétrie<input value={f.volumetrie} placeholder="300 par jour" onInput={(e) => maj('volumetrie', e.target.value)} /></label>
        <label class="champ" style="flex:1 1 220px">Responsable côté partenaire<input value={f.responsable} onInput={(e) => maj('responsable', e.target.value)} /></label>
        {d.versions_produit.length > 0 && <label class="champ" style="flex:0 1 160px">Version<select value={f.version || ''} onChange={(e) => maj('version', e.target.value)}><option value="">Toutes</option>{d.versions_produit.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></label>}
      </div>
      {d.regles.length > 0 && <div class="pile" style="gap:6px"><span class="petit doux">Règles qui s'appliquent</span>
        <div class="ligne" style="gap:6px">{d.regles.map((r) => { const pris = (f.regles || []).includes(r.id); return <button key={r.id} class={`puce-option ${pris ? 'choisie' : ''}`} onClick={() => maj('regles', pris ? f.regles.filter((x) => x !== r.id) : [...(f.regles || []), r.id])}>{r.titre}</button>; })}</div></div>}
      <div class="ligne"><button class="bouton principal-b" disabled={occupe || !f.nom.trim() || !f.partenaire.trim()} onClick={valider}><Check size={14} /> Enregistrer</button><button class="bouton" onClick={annuler}>Annuler</button></div>
    </div>
  );
}

function Fiche({ f, d, modifier, supprimer, demander, projet, occupe }) {
  const [confirmer, setConfirmer] = useState(false);
  return (
    <article class="carte pile fiche-flux" style="gap:10px" id={`flux-${f.id}`}>
      <div class="ligne" style="gap:10px;flex-wrap:nowrap;align-items:flex-start">
        <ArrowLeftRight size={18} color="#4F46E5" style="flex:0 0 auto;margin-top:3px" />
        <div class="pile espace" style="gap:3px"><strong>{f.nom}</strong>
          <span class="petit doux">{f.application_nom ? `${f.application_nom} ${f.sens === 'entrant' ? '←' : f.sens === 'sortant' ? '→' : '↔'} ` : ''}{f.partenaire}</span></div>
        {f.version && <span class="badge b-gris">{(d.versions_produit.find((v) => v.id === f.version) || {}).nom || f.version}</span>}
        <span class="badge b-indigo">{SENS[f.sens]}</span>
      </div>
      {f.description && <span>{f.description}</span>}
      <div class="grille-flux">
        <span class="petit doux">Déclencheur</span><span>{f.declencheur_texte || <i class="doux">à préciser</i>}</span>
        <span class="petit doux">Moyen</span><span>{MOYENS[f.moyen] || <i class="doux">à préciser</i>}{f.format ? ` · ${f.format}` : ''}</span>
        <span class="petit doux">Données</span><span>{f.donnees_noms.length ? f.donnees_noms.map((x) => `${x.nom}${x.attributs.length ? ` (${x.attributs.join(', ')})` : ''}`).join(' ; ') : <i class="doux">à préciser</i>}</span>
        <span class="petit doux">Si ça échoue</span><span>{f.erreurs || <i class="doux">à préciser</i>}</span>
        {f.volumetrie && <><span class="petit doux">Volumétrie</span><span>{f.volumetrie}</span></>}
        {f.responsable && <><span class="petit doux">Responsable</span><span>{f.responsable}</span></>}
        {f.regles_noms.length > 0 && <><span class="petit doux">Règles</span><span>{f.regles_noms.map((r) => r.titre).join(' ; ')}</span></>}
      </div>
      {f.points.map((t, i) => { const [titre, cl] = GRAVITE[t.gravite] || ['Point', 'e-indigo']; return <div key={i} class={`encart ${cl}`}><span><strong>{titre}.</strong> {t.question || t.message}</span></div>; })}
      <div class="ligne" style="gap:6px">
        <button class="bouton" disabled={occupe} onClick={() => modifier(f)}><Pencil size={14} /> Modifier</button>
        <button class="bouton bouton-watson" disabled={occupe} onClick={() => demander(f)}><Sparkles size={14} /> Demander à Watson</button>
        <BoutonComite projet={projet} cible={{ type: 'flux', id: f.id }} libelle="Comité" />
        <span class="espace" />
        {confirmer ? <button class="bouton danger" onClick={() => supprimer(f)}>Supprimer le flux</button> : <button class="bouton icone" title="Supprimer" onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
      </div>
    </article>
  );
}

export function Flux({ projet, etat }) {
  const [d, setD] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [edition, setEdition] = useState(null);
  const [demande, setDemande] = useState(null);
  const [lot, setLot] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const charger = () => appel(`/projets/${projet.id}/flux`).then(setD).catch((e) => setMessage(e.message));
  useEffect(() => { charger(); }, []);
  if (!d) return <Attente erreur={message} />;
  const enregistrer = async (contenu) => {
    setOccupe(true); setMessage(null);
    try { await appel(`/projets/${projet.id}/elements`, { corps: { type: 'flux', contenu } }); setEdition(null); await charger(); } catch (e) { setMessage(e.message); }
    setOccupe(false);
  };
  const supprimer = async (f) => {
    setOccupe(true); setMessage(null);
    try { await appel(`/projets/${projet.id}/elements/${f.id}`, { methode: 'DELETE' }); await charger(); } catch (e) { setMessage(e.message); }
    setOccupe(false);
  };
  const choisir = (id) => { setChoisi(id); document.getElementById(`flux-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  return (
    <>
      <Entete titre="Flux externes" description="Les échanges entre les applications du produit et les systèmes du client ou des partenaires : ce qui part, ce qui arrive, quand, par quel moyen, avec quelles données, et ce qui se passe si l'échange échoue.">
        <div class="ligne">
          <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => { setEdition(null); setDemande({}); }}><Sparkles size={15} /> Décrire à Watson</button>
          <button class="bouton principal-b" onClick={() => { setDemande(null); setEdition({}); }}><Plus size={15} /> Nouveau flux</button>
        </div>
      </Entete>
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="Les demandes à Watson" />
      {message && <p class="encart e-rouge">{message}</p>}
      {lot && <div class="carte"><LotEnCours projet={projet} lot={lot} fini={async () => { setLot(null); await charger(); }}
        abandonner={async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); }} /></div>}
      {demande && !lot && <div class="carte"><DemandeWatson projet={projet} element={demande.id} nomElement={demande.nom} lance={(l) => { setDemande(null); setLot(l); }} fermer={() => setDemande(null)}
        exemple={demande.id ? 'si la douane ne répond pas, relancer trois fois puis prévenir l\'agent' : 'chaque nuit, le portail envoie à l\'ERP du client les expéditions livrées la veille, en CSV'} /></div>}
      {edition && <Formulaire d={d} initial={edition.id ? edition : null} enregistrer={enregistrer} annuler={() => setEdition(null)} occupe={occupe} />}
      {d.flux.length === 0 && !edition && !demande && !lot && (
        <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={150} /><span>Aucun flux pour l'instant. Décris-les à Watson, ou donne-lui une spécification d'interface dans Alimenter.</span></div>
      )}
      {d.flux.length > 0 && <section class="carte"><Carte d={d} choisir={choisir} choisi={choisi} /></section>}
      <div class="pile" style="gap:10px">
        {d.flux.map((f) => <Fiche key={f.id} f={f} d={d} projet={projet} occupe={occupe} modifier={(x) => { setDemande(null); setEdition(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          supprimer={supprimer} demander={(x) => { setEdition(null); setDemande(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
      </div>
    </>
  );
}
