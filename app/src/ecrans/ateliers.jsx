// Ateliers client, en trois temps : préparer le kit, tenir la séance, restituer le compte rendu. Le kit part de ce que
// la base ne sait pas encore ; en séance on coche et on note ; le compte rendu repart dans la base, après validation.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ArrowLeft, Check, CircleHelp, ClipboardCopy, Clock, FileText, Flag, Frame, MessagesSquare, Pencil, Play, Plus, Route, Sparkles,
  Star, Trash2, Upload, Users, X
} from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { LotEnCours } from './edition.jsx';
import { Rendu } from './maquettes.jsx';
import { Markdown } from './markdown.jsx';

const ETAPES = [['kit', 'Préparer'], ['seance', 'Animer'], ['cr', 'Restituer']];
const COULEUR_STATUT = { prepare: 'b-gris', tenu: 'b-ambre', restitue: 'b-vert' };
const date = (d) => (d ? String(d).split('-').reverse().join('/') : '');
const minutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);

function Source({ s }) {
  if (!s) return null;
  if (/^Q-\d+/.test(s)) return <span class="badge b-ambre">Question ouverte</span>;
  const [l, c] = { base: ['Manque de la base', 'b-orange'], grille: ['Grille de recueil', 'b-indigo'], projet: ['Propre au projet', 'b-gris'] }[s] || [s, 'b-gris'];
  return <span class={`badge ${c}`}>{l}</span>;
}

// La version du kit qu'on peut envoyer au client : ni hypothèses, ni points de vigilance.
function versionClient(a) {
  const k = a.kit;
  const l = [`# ${a.titre}`, `${date(a.date)} · ${minutes(a.duree_min)} · ${a.format || ''}`, '', '## Objectifs', ...k.objectifs.map((o) => `- ${o}`), '', '## Déroulé'];
  l.push(...k.trame.map((t) => `- ${t.sequence} (${t.duree} min)${t.but ? ` : ${t.but}` : ''}`));
  l.push('', '## Les sujets que nous aborderons');
  for (const th of k.themes) l.push(`### ${th.theme}`, ...th.questions.map((q) => `- ${q.texte}`));
  if (k.decisions?.length) l.push('', '## Ce que nous aimerions décider ensemble', ...k.decisions.map((d) => `- ${d.sujet}`));
  if (k.preparation_client?.length) l.push('', '## Pour préparer la séance', ...k.preparation_client.map((p) => `- ${p.quoi}${p.qui ? ` (${p.qui})` : ''}${p.quand ? `, ${p.quand}` : ''}`));
  return l.join('\n');
}

function Formulaire({ initial, types, valider, annuler, occupe }) {
  const [f, setF] = useState(initial || { titre: '', type: 'cadrage', date: new Date().toISOString().slice(0, 10), duree_min: 120, format: 'sur place', participants: [{ nom: '', role: '', decideur: false }], attentes: '' });
  const maj = (k, v) => setF({ ...f, [k]: v });
  const majP = (i, k, v) => maj('participants', f.participants.map((p, j) => (i === j ? { ...p, [k]: v } : p)));
  return (
    <div class="carte pile" style="gap:12px">
      <div class="ligne" style="gap:12px;align-items:flex-start">
        <label class="champ" style="flex:2 1 280px">Titre<input autoFocus value={f.titre} placeholder="Par exemple : cadrage du suivi des litiges" onInput={(e) => maj('titre', e.target.value)} /></label>
        <label class="champ" style="flex:1 1 180px">Type<select value={f.type} onChange={(e) => maj('type', e.target.value)}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div class="ligne" style="gap:12px">
        <label class="champ" style="flex:1 1 150px">Date<input type="date" value={f.date} onInput={(e) => maj('date', e.target.value)} /></label>
        <label class="champ" style="flex:1 1 120px">Durée (minutes)<input type="number" min="30" step="15" value={f.duree_min} onInput={(e) => maj('duree_min', +e.target.value)} /></label>
        <label class="champ" style="flex:1 1 150px">Format<select value={f.format} onChange={(e) => maj('format', e.target.value)}><option>sur place</option><option>à distance</option><option>hybride</option></select></label>
      </div>
      <div class="pile" style="gap:6px">
        <span class="petit doux">Participants côté client</span>
        {f.participants.map((p, i) => (
          <div key={i} class="ligne" style="gap:8px;flex-wrap:nowrap">
            <input class="saisie" style="flex:1" placeholder="Nom" value={p.nom} onInput={(e) => majP(i, 'nom', e.target.value)} />
            <input class="saisie" style="flex:1.4" placeholder="Rôle" value={p.role} onInput={(e) => majP(i, 'role', e.target.value)} />
            <label class="ligne petit" style="gap:4px;flex-wrap:nowrap;white-space:nowrap"><input type="checkbox" checked={!!p.decideur} onChange={(e) => majP(i, 'decideur', e.target.checked)} /> peut décider</label>
            <button class="bouton icone" title="Retirer" onClick={() => maj('participants', f.participants.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        <button class="lien petit" style="align-self:flex-start" onClick={() => maj('participants', [...f.participants, { nom: '', role: '', decideur: false }])}><Plus size={13} /> Participant</button>
      </div>
      <label class="champ">Ce que tu attends de la séance, facultatif<textarea rows={2} value={f.attentes} onInput={(e) => maj('attentes', e.target.value)} /></label>
      <div class="ligne">
        <button class="bouton principal-b" disabled={occupe || !f.titre.trim()} onClick={() => valider({ ...f, participants: f.participants.filter((p) => p.nom.trim()) })}><Check size={14} /> {initial ? 'Enregistrer' : 'Créer l\'atelier'}</button>
        <button class="bouton" onClick={annuler}>Annuler</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- 1. le kit

function Kit({ projet, a, faire, occupe, claude, aller, voirSupport, noms }) {
  const k = a.kit;
  const [demande, setDemande] = useState(null);
  const [edition, setEdition] = useState(null);
  const [copie, setCopie] = useState(false);
  const preparer = () => faire(`/ateliers/${a.id}/preparer`, { demande: demande || '' }, 'POST', true).then((ok) => ok && setDemande(null));
  if (!k) {
    return (
      <div class="carte ligne" style="gap:18px;flex-wrap:nowrap;align-items:center">
        <Watson humeur="note" hauteur={120} flotte={false} />
        <div class="pile espace" style="gap:8px">
          <strong>Watson prépare le kit de l'atelier</strong>
          <span class="doux">Objectifs, trame minutée, questions par thème (les questions ouvertes du projet et ce que la base ne dit pas encore d'abord), hypothèses à faire valider, décisions attendues et supports à montrer.</span>
          <textarea class="saisie" rows={2} style="padding:10px 12px" placeholder="Une consigne en plus, facultative : par exemple « insister sur les exceptions de facturation »" value={demande || ''} onInput={(e) => setDemande(e.target.value)} />
          <button class="bouton bouton-watson" style="align-self:flex-start" disabled={occupe || !claude?.connecte} onClick={preparer}><Sparkles size={14} /> Préparer le kit</button>
        </div>
      </div>
    );
  }
  const total = k.trame.reduce((s, t) => s + (t.duree || 0), 0);
  const enregistrer = async () => { if (await faire(`/ateliers/${a.id}`, { kit: edition })) setEdition(null); };
  const kk = edition || k;
  const majTheme = (i, th) => setEdition({ ...kk, themes: kk.themes.map((x, j) => (i === j ? th : x)) });
  return (
    <div class="pile" style="gap:14px">
      <div class="ligne" style="gap:8px">
        <span class="petit doux espace">Préparé le {date(k.prepare_le)}</span>
        {edition ? <>
          <button class="bouton principal-b" disabled={occupe} onClick={enregistrer}><Check size={14} /> Enregistrer le kit</button>
          <button class="bouton" onClick={() => setEdition(null)}>Annuler</button>
        </> : <>
          <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(versionClient(a)); setCopie(true); setTimeout(() => setCopie(false), 2000); }}>
            <ClipboardCopy size={14} /> {copie ? 'Copiée' : 'Copier la version client'}</button>
          <button class="bouton" onClick={() => setEdition(JSON.parse(JSON.stringify(k)))}><Pencil size={14} /> Modifier</button>
          <button class="bouton" disabled={occupe || !claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={14} /> Refaire</button>
        </>}
      </div>
      {demande !== null && (
        <div class="carte pile" style="gap:8px">
          <span class="doux">Watson refait tout le kit. Tes modifications seront remplacées.</span>
          <textarea class="saisie" rows={2} style="padding:10px 12px" autoFocus placeholder="Ce qu'il faut changer" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton bouton-watson" disabled={occupe} onClick={preparer}><Sparkles size={14} /> Refaire le kit</button><button class="bouton" onClick={() => setDemande(null)}>Annuler</button></div>
        </div>
      )}
      <div class="ligne" style="align-items:flex-start;gap:14px">
        <section class="carte pile" style="flex:1 1 320px;gap:8px">
          <h2>Objectifs</h2>
          {kk.objectifs.map((o, i) => edition
            ? <div key={i} class="ligne" style="flex-wrap:nowrap;gap:6px"><input class="saisie espace" value={o} onInput={(e) => setEdition({ ...kk, objectifs: kk.objectifs.map((x, j) => (i === j ? e.target.value : x)) })} />
              <button class="bouton icone" onClick={() => setEdition({ ...kk, objectifs: kk.objectifs.filter((_, j) => j !== i) })}><X size={14} /></button></div>
            : <div key={i} class="ligne" style="flex-wrap:nowrap;gap:8px;align-items:flex-start"><Flag size={15} color="#4F46E5" style="flex:0 0 auto;margin-top:3px" /><span>{o}</span></div>)}
          {edition && <button class="lien petit" style="align-self:flex-start" onClick={() => setEdition({ ...kk, objectifs: [...kk.objectifs, ''] })}><Plus size={13} /> Objectif</button>}
        </section>
        <section class="carte pile" style="flex:1 1 360px;gap:8px">
          <div class="ligne"><h2 class="espace">Trame</h2><span class={`badge ${total > a.duree_min ? 'b-rouge' : 'b-gris'}`}><Clock size={12} /> {minutes(total)} sur {minutes(a.duree_min)}</span></div>
          {k.trame.map((t, i) => (
            <div key={i} class="sequence-trame">
              <span class="duree-trame">{t.duree} min</span>
              <span class="pile espace" style="gap:1px"><strong>{t.sequence}</strong>{t.but && <span class="petit doux">{t.but}</span>}</span>
              {t.support && <button class="lien petit" onClick={() => voirSupport(t.support)}>{noms[t.support] || t.support}</button>}
            </div>
          ))}
        </section>
      </div>
      <section class="carte pile" style="gap:12px">
        <h2>Questions</h2>
        {kk.themes.map((th, i) => (
          <div key={i} class="pile" style="gap:6px">
            <strong class="theme-kit">{th.theme}</strong>
            {th.questions.map((q, j) => edition ? (
              <div key={j} class="ligne" style="flex-wrap:nowrap;gap:6px">
                <button class={`bouton icone ${q.prioritaire ? 'prioritaire' : ''}`} title="Prioritaire" onClick={() => majTheme(i, { ...th, questions: th.questions.map((x, n) => (n === j ? { ...x, prioritaire: !x.prioritaire } : x)) })}><Star size={14} /></button>
                <input class="saisie espace" value={q.texte} onInput={(e) => majTheme(i, { ...th, questions: th.questions.map((x, n) => (n === j ? { ...x, texte: e.target.value } : x)) })} />
                <button class="bouton icone" onClick={() => majTheme(i, { ...th, questions: th.questions.filter((_, n) => n !== j) })}><X size={14} /></button>
              </div>
            ) : (
              <div key={j} class="question-kit">
                {q.prioritaire ? <Star size={14} class="etoile" /> : <span style="width:14px" />}
                <span class="espace">{q.texte}</span><Source s={q.source} />
              </div>
            ))}
            {edition && <button class="lien petit" style="align-self:flex-start" onClick={() => majTheme(i, { ...th, questions: [...th.questions, { id: `q${Date.now()}`, texte: '', source: 'projet' }] })}><Plus size={13} /> Question</button>}
          </div>
        ))}
      </section>
      <div class="ligne" style="align-items:flex-start;gap:14px">
        {k.decisions?.length > 0 && (
          <section class="carte pile" style="flex:2 1 460px;gap:10px">
            <h2>Décisions attendues</h2>
            {k.decisions.map((d, i) => (
              <div key={i} class="pile" style="gap:6px">
                <div class="ligne"><strong class="espace">{d.sujet}</strong>{d.qui && <span class="petit doux">tranché par {d.qui}</span>}</div>
                <div class="options-decision">
                  {(d.options || []).map((o, j) => (
                    <div key={j} class="option-decision"><strong>{o.option}</strong>
                      {o.cout && <span class="petit"><b>Coût</b> {o.cout}</span>}{o.valeur && <span class="petit"><b>Valeur</b> {o.valeur}</span>}
                      {o.risques && <span class="petit"><b>Risques</b> {o.risques}</span>}{o.reversible && <span class="petit"><b>Retour arrière</b> {o.reversible}</span>}</div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
        <section class="carte pile" style="flex:1 1 300px;gap:10px">
          {k.supports?.length > 0 && <><h2>Supports à montrer</h2>
            {k.supports.map((s, i) => (
              <button key={i} class="support-kit" onClick={() => voirSupport(s.ref, s.type)}>
                {s.type === 'maquette' ? <Frame size={15} /> : s.type === 'scenario' ? <Route size={15} /> : <FileText size={15} />}
                <span class="pile espace" style="gap:1px;text-align:left"><span>{noms[s.ref] || s.nom}</span>{s.but && <span class="petit doux">{s.but}</span>}</span>
              </button>
            ))}</>}
          {k.hypotheses?.length > 0 && <><h2>Hypothèses à faire valider</h2>
            {k.hypotheses.map((h, i) => <div key={i} class="pile" style="gap:1px"><span>{h.texte}</span>{h.consequence && <span class="petit doux">Sinon : {h.consequence}</span>}</div>)}</>}
          {k.preparation_client?.length > 0 && <><h2>À demander au client avant</h2>
            {k.preparation_client.map((p, i) => <span key={i}>{p.quoi}{p.qui ? <span class="doux"> · {p.qui}</span> : ''}</span>)}</>}
          {k.vigilance?.length > 0 && <div class="encart e-orange pile" style="gap:4px"><strong>Points de vigilance (interne)</strong>{k.vigilance.map((v, i) => <span key={i}>{v}</span>)}</div>}
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- 2. la séance

function Seance({ projet, a, notesInit, fermer, terminer, voirSupport, noms }) {
  const k = a.kit || { trame: [], themes: [], decisions: [] };
  const [n, setN] = useState(() => ({ ...notesInit, debut: notesInit.debut || Date.now() }));
  const [etat, setEtat] = useState('');
  const [maintenant, setMaintenant] = useState(Date.now());
  const minuterie = useRef(null);
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 15000); return () => clearInterval(t); }, []);
  const maj = (m) => {
    setN(m); setEtat('…');
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => appel(`/projets/${projet.id}/ateliers/${a.id}/notes`, { corps: m }).then(() => setEtat('Notes gardées sur ce poste')).catch((e) => setEtat(e.message)), 700);
  };
  useEffect(() => { if (!notesInit.debut) maj(n); }, []);
  const ecoule = Math.round((maintenant - n.debut) / 60000);
  let cumul = 0;
  const courante = k.trame.findIndex((t) => (cumul += t.duree || 0) > ecoule);
  const cochees = new Set(n.cochees);
  const basculer = (id) => maj({ ...n, cochees: cochees.has(id) ? n.cochees.filter((x) => x !== id) : [...n.cochees, id] });
  const nbQ = k.themes.reduce((s, th) => s + th.questions.length, 0);
  return (
    <div class="seance">
      <header class="seance-haut">
        <MessagesSquare size={18} />
        <strong class="tronque">{a.titre}</strong>
        <span class="badge b-indigo"><Clock size={12} /> {minutes(ecoule)} sur {minutes(a.duree_min)}</span>
        <span class="petit doux">{n.cochees.length} / {nbQ} questions traitées</span>
        <span class="espace" />
        <span class="petit doux">{etat}</span>
        <button class="bouton" onClick={fermer}>Réduire</button>
        <button class="bouton principal-b" onClick={() => terminer(n)}><Check size={14} /> Terminer la séance</button>
      </header>
      <div class="seance-corps">
        <aside class="seance-trame">
          <span class="petit doux">Déroulé</span>
          {k.trame.map((t, i) => (
            <div key={i} class={`etape-seance ${i === courante ? 'en-cours' : i < courante || courante === -1 ? 'passee' : ''}`}>
              <span class="petit">{t.duree} min</span><strong>{t.sequence}</strong>
              {t.support && <button class="lien petit" onClick={() => voirSupport(t.support)}>{noms[t.support] || t.support}</button>}
            </div>
          ))}
          {k.supports?.length > 0 && <><span class="petit doux" style="margin-top:12px">Supports</span>
            {k.supports.map((s, i) => <button key={i} class="lien petit" style="text-align:left" onClick={() => voirSupport(s.ref, s.type)}>{noms[s.ref] || s.nom}</button>)}</>}
        </aside>
        <main class="seance-notes">
          {k.themes.map((th, i) => (
            <section key={i} class="pile" style="gap:8px">
              <h2>{th.theme}</h2>
              {th.questions.map((q) => (
                <div key={q.id} class={`question-seance ${cochees.has(q.id) ? 'traitee' : ''}`}>
                  <label class="ligne" style="flex-wrap:nowrap;gap:10px;align-items:flex-start;cursor:pointer">
                    <input type="checkbox" checked={cochees.has(q.id)} onChange={() => basculer(q.id)} style="margin-top:4px" />
                    <span class="espace">{q.prioritaire && <Star size={13} class="etoile" />} {q.texte}</span><Source s={q.source} />
                  </label>
                  <textarea class="saisie" rows={2} placeholder="Ce qui a été dit" value={n.notes[q.id] || ''}
                    onInput={(e) => maj({ ...n, notes: { ...n.notes, [q.id]: e.target.value }, cochees: e.target.value && !cochees.has(q.id) ? [...n.cochees, q.id] : n.cochees })} />
                </div>
              ))}
            </section>
          ))}
          {k.decisions?.length > 0 && (
            <section class="pile" style="gap:8px">
              <h2>Décisions</h2>
              {k.decisions.map((d, i) => (
                <div key={i} class="question-seance">
                  <strong>{d.sujet}</strong>
                  <div class="ligne" style="gap:6px">{(d.options || []).map((o, j) => (
                    <button key={j} class={`puce-option ${n.decisions[i] === o.option ? 'choisie' : ''}`} onClick={() => maj({ ...n, decisions: { ...n.decisions, [i]: o.option } })}>{o.option}</button>
                  ))}</div>
                  <textarea class="saisie" rows={2} placeholder="La décision prise, et par qui" value={n.decisions[i] || ''} onInput={(e) => maj({ ...n, decisions: { ...n.decisions, [i]: e.target.value } })} />
                </div>
              ))}
            </section>
          )}
          <section class="pile" style="gap:8px">
            <h2>Notes libres</h2>
            <textarea class="saisie" rows={6} placeholder="Tout le reste : remarques, sujets nouveaux, actions promises" value={n.libres} onInput={(e) => maj({ ...n, libres: e.target.value })} />
          </section>
        </main>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- 3. le compte rendu

function CompteRendu({ projet, a, faire, occupe, claude, aller }) {
  const cr = a.compte_rendu;
  const [transcription, setTranscription] = useState('');
  const [copie, setCopie] = useState(false);
  const [lot, setLot] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const [tranchees, setTranchees] = useState({});
  const lire = (f) => { if (f) f.text().then((t) => setTranscription(t)); };
  if (!cr) {
    return (
      <div class="carte pile" style="gap:10px">
        <div class="ligne" style="gap:16px;flex-wrap:nowrap;align-items:center">
          <Watson humeur="ecrit" hauteur={110} flotte={false} />
          <span class="doux">Watson rédige le compte rendu à partir de tes notes de séance. Si tu as une transcription (Meet, Teams, Gemini), ajoute-la : il s'en sert pour compléter, sans rien inventer.</span>
        </div>
        <textarea class="saisie" rows={5} style="padding:10px 12px" placeholder="Transcription, facultative" value={transcription} onInput={(e) => setTranscription(e.target.value)} />
        <div class="ligne">
          <label class="bouton"><Upload size={14} /> Fichier texte (.txt, .vtt, .srt, .md)<input type="file" accept=".txt,.vtt,.srt,.md" hidden onChange={(e) => lire(e.target.files[0])} /></label>
          <button class="bouton bouton-watson" disabled={occupe || !claude?.connecte} onClick={() => faire(`/ateliers/${a.id}/compte-rendu`, { transcription }, 'POST', true)}><Sparkles size={14} /> Rédiger le compte rendu</button>
        </div>
      </div>
    );
  }
  const trancher = async (r) => {
    try { await appel(`/projets/${projet.id}/sujets/${r.sujet}`, { corps: { reponse: r.reponse, statut: 'tranche' } }); setTranchees({ ...tranchees, [r.sujet]: true }); } catch (e) { setEnvoi(e.message); }
  };
  const versAlimenter = async () => {
    setEnvoi('…');
    try { setLot(await appel(`/projets/${projet.id}/ateliers/${a.id}/alimenter`, { corps: {} })); setEnvoi(null); } catch (e) { setEnvoi(e.message); }
  };
  const ATTEINT = { oui: 'b-vert', 'en partie': 'b-ambre', non: 'b-rouge' };
  return (
    <div class="pile" style="gap:14px">
      <div class="ligne" style="gap:8px">
        <span class="petit doux espace">Rédigé le {date(cr.redige_le)}{cr.lot ? ' · envoyé à Watson' : ''}</span>
        <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(cr.texte || ''); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copié' : 'Copier le compte rendu'}</button>
        <button class="bouton bouton-watson" disabled={!!lot || envoi === '…' || !claude?.connecte} onClick={versAlimenter}><Sparkles size={14} /> Mettre la base à jour</button>
      </div>
      {envoi === '…' && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="lit" hauteur={70} flotte={false} /><span>Watson lit le compte rendu et prépare les changements de la base, que tu valideras.</span></div>}
      {envoi && envoi !== '…' && <p class="encart e-rouge">{envoi}</p>}
      {lot && <div class="carte"><LotEnCours projet={projet} lot={lot} fini={() => { setLot(null); aller('projet'); }}
        abandonner={async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); }} /></div>}
      <div class="ligne" style="align-items:flex-start;gap:14px">
        <section class="carte pile" style="flex:1 1 340px;gap:10px">
          <h2>Objectifs</h2>
          {cr.objectifs.map((o, i) => <div key={i} class="pile" style="gap:2px"><div class="ligne" style="flex-wrap:nowrap;gap:8px"><span class="espace">{o.objectif}</span><span class={`badge ${ATTEINT[o.atteint] || 'b-gris'}`}>{o.atteint}</span></div>{o.commentaire && <span class="petit doux">{o.commentaire}</span>}</div>)}
          <h2 style="margin-top:6px">Décisions</h2>
          {cr.decisions.length === 0 && <span class="doux">Aucune.</span>}
          {cr.decisions.map((d, i) => <span key={i}><Check size={14} color="#16A34A" /> {d.decision}{d.par ? <span class="doux"> · {d.par}</span> : ''}</span>)}
          <h2 style="margin-top:6px">Actions</h2>
          {cr.actions.length === 0 && <span class="doux">Aucune.</span>}
          {cr.actions.map((x, i) => <span key={i}>{x.action}<span class="doux">{x.porteur ? ` · ${x.porteur}` : ''}{x.echeance ? ` · ${x.echeance}` : ''}</span></span>)}
          {cr.points_ouverts?.length > 0 && <><h2 style="margin-top:6px">Points ouverts</h2>{cr.points_ouverts.map((p, i) => <span key={i}><CircleHelp size={14} color="#B45309" /> {p}</span>)}</>}
        </section>
        {cr.reponses?.length > 0 && (
          <section class="carte pile" style="flex:1 1 340px;gap:10px">
            <h2>Réponses obtenues</h2>
            {cr.reponses.map((r, i) => (
              <div key={i} class="pile" style="gap:4px;padding-bottom:8px;border-bottom:1px solid #F4F4F5">
                <span class="doux petit">{r.question}</span><span>{r.reponse}</span>
                {r.sujet && (tranchees[r.sujet] ? <span class="badge b-vert" style="align-self:flex-start">Question ouverte tranchée</span>
                  : <button class="bouton" style="align-self:flex-start" onClick={() => trancher(r)}><Check size={14} /> Trancher la question ouverte</button>)}
              </div>
            ))}
          </section>
        )}
      </div>
      <section class="carte"><Markdown texte={cr.texte || ''} /></section>
      <button class="lien petit" style="align-self:flex-start" disabled={occupe} onClick={() => faire(`/ateliers/${a.id}/compte-rendu`, {}, 'POST', true)}>
        Refaire le compte rendu depuis les notes</button>
    </div>
  );
}

// ----------------------------------------------------------------- la page

function Support({ projet, ref_, type, fermer, aller }) {
  const [l, setL] = useState(Math.min(1200, window.innerWidth - 120));
  useEffect(() => { const f = () => setL(Math.min(1200, window.innerWidth - 120)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const maquette = type === 'maquette';
  return (
    <div class="visionneuse" style="z-index:70" onClick={fermer}>
      <div class="pile" style="gap:10px;align-items:flex-end" onClick={(e) => e.stopPropagation()}>
        <button class="bouton" onClick={fermer}><X size={14} /> Fermer</button>
        {maquette ? <Rendu projet={projet} m={{ id: ref_, titre: ref_, support: 'desktop' }} largeurCadre={l} hauteurMax={window.innerHeight - 120} />
          : <div class="carte pile" style="gap:10px;width:420px"><span>Ce support s'ouvre dans son onglet.</span>
            <button class="bouton principal-b" style="align-self:flex-start" onClick={() => { fermer(); aller(type === 'scenario' ? 'scenarios' : type === 'moodboard' ? 'moodboard' : 'maquettes'); }}>Ouvrir</button></div>}
      </div>
    </div>
  );
}

export function Ateliers({ projet, etat, aller }) {
  const [liste, setListe] = useState(null);
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [onglet, setOnglet] = useState('kit');
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState(false);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [attente, setAttente] = useState(false);
  const [seance, setSeance] = useState(false);
  const [support, setSupport] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/ateliers`;
  const charger = () => appel(base).then(setListe).catch((e) => setMessage(e.message));
  useEffect(() => { charger(); }, []);
  const ouvrir = async (id) => {
    setMessage(null);
    try { const v = await appel(`${base}/${id}`); setD(v); setOuvert(id); setOnglet(v.atelier.statut === 'restitue' ? 'cr' : v.atelier.statut === 'tenu' ? 'cr' : 'kit'); } catch (e) { setMessage(e.message); }
  };
  const faire = async (chemin, corps, methode = 'POST', claudeAppel = false) => {
    setOccupe(true); setMessage(null); if (claudeAppel) setAttente(true);
    try { const r = await appel(`/projets/${projet.id}${chemin}`, { corps, methode }); if (r.atelier) setD(r); return r; } catch (e) { setMessage(e.message); return null; } finally { setOccupe(false); setAttente(false); }
  };
  if (!liste) return <Attente erreur={message} />;

  if (ouvert && d) {
    const a = d.atelier;
    const voirSupport = (ref, type) => setSupport({ ref, type: d.genres_supports[ref] || type });
    return (
      <>
        <div class="ligne" style="gap:10px">
          <button class="bouton" onClick={() => { setOuvert(null); setD(null); setEdition(false); charger(); }}><ArrowLeft size={14} /> Ateliers</button>
          <span class="espace" />
          <button class="bouton" onClick={() => setEdition(!edition)}><Pencil size={14} /> Infos</button>
          {confirmer ? <button class="bouton danger" onClick={async () => { await faire(`/ateliers/${a.id}`, {}, 'DELETE'); setOuvert(null); setD(null); setConfirmer(false); charger(); }}>Supprimer l'atelier</button>
            : <button class="bouton icone" title="Supprimer" onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
        </div>
        <Entete titre={a.titre} description={`${d.types[a.type]} · ${date(a.date)} · ${minutes(a.duree_min)} · ${a.format || ''}${a.participants?.length ? ` · ${a.participants.map((p) => p.nom).join(', ')}` : ''}`} />
        <ConnexionClaude claude={claude} setClaude={setClaude} usage="La préparation et le compte rendu" />
        {edition && <Formulaire initial={a} types={d.types} occupe={occupe} annuler={() => setEdition(false)} valider={async (f) => { if (await faire(`/ateliers/${a.id}`, f)) setEdition(false); }} />}
        <div class="etapes-atelier">
          {ETAPES.map(([cle, libelle], i) => {
            const fait = cle === 'kit' ? !!a.kit : cle === 'seance' ? a.statut !== 'prepare' : !!a.compte_rendu;
            return (
              <button key={cle} class={`etape-atelier ${onglet === cle ? 'actif' : ''} ${fait ? 'faite' : ''}`} onClick={() => setOnglet(cle)}>
                <span class="num-etape">{fait ? <Check size={13} /> : i + 1}</span>{libelle}
              </button>
            );
          })}
        </div>
        {message && <p class="encart e-rouge">{message}</p>}
        {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="reflechit" hauteur={80} flotte={false} />
          <span><strong>{onglet === 'cr' ? 'Watson rédige le compte rendu' : 'Watson prépare le kit'}</strong><br /><span class="doux">Une à deux minutes. Tu peux changer d'écran, mais garde Watson ouvert.</span></span></div>}
        {!attente && onglet === 'kit' && <Kit projet={projet} a={a} faire={faire} occupe={occupe} claude={claude} aller={aller} voirSupport={voirSupport} noms={d.noms_supports} />}
        {onglet === 'seance' && (
          <div class="carte ligne" style="gap:18px;flex-wrap:nowrap;align-items:center">
            <Watson humeur="salue" hauteur={110} flotte={false} />
            <div class="pile espace" style="gap:8px">
              <strong>{a.statut === 'prepare' ? 'Le mode séance' : 'Séance tenue'}</strong>
              <span class="doux">{a.kit ? 'En plein écran : le déroulé et le temps passé, les questions à cocher et à noter, les décisions, les supports à montrer. Les notes restent sur ce poste et se gardent au fil de l\'eau.' : 'Prépare d\'abord le kit : la séance s\'appuie sur ses questions.'}</span>
              {a.seance && <span class="petit doux">{a.seance.cochees.length} question{a.seance.cochees.length > 1 ? 's' : ''} traitée{a.seance.cochees.length > 1 ? 's' : ''}.</span>}
              <button class="bouton principal-b" style="align-self:flex-start" disabled={!a.kit} onClick={() => setSeance(true)}><Play size={14} /> {a.statut === 'prepare' ? (d.notes.debut ? 'Reprendre la séance' : 'Démarrer la séance') : 'Revoir les notes'}</button>
            </div>
          </div>
        )}
        {!attente && onglet === 'cr' && <CompteRendu projet={projet} a={a} faire={faire} occupe={occupe} claude={claude} aller={aller} />}
        {seance && <Seance projet={projet} a={a} notesInit={d.notes} fermer={async () => { setSeance(false); setD(await appel(`${base}/${a.id}`)); }}
          terminer={async (n) => { await appel(`${base}/${a.id}/notes`, { corps: n }); setSeance(false); if (await faire(`/ateliers/${a.id}/terminer`, {})) setOnglet('cr'); }} voirSupport={voirSupport} noms={d.noms_supports} />}
        {support && <Support projet={projet} ref_={support.ref} type={support.type} fermer={() => setSupport(null)} aller={aller} />}
      </>
    );
  }

  return (
    <>
      <Entete titre="Ateliers" description="Les ateliers avec le client, en trois temps : Watson prépare le kit à partir de ce que la base ne sait pas encore, tu animes la séance en notant au fil de l'eau, puis le compte rendu met la base à jour, après ta validation.">
        <button class="bouton principal-b" onClick={() => setCreation(!creation)}><Plus size={15} /> Nouvel atelier</button>
      </Entete>
      {message && <p class="encart e-rouge">{message}</p>}
      {creation && <Formulaire types={liste.types} occupe={occupe} annuler={() => setCreation(false)}
        valider={async (f) => { const r = await faire('/ateliers', f); if (r?.atelier) { setCreation(false); setOuvert(r.atelier.id); setOnglet('kit'); } }} />}
      {liste.ateliers.length === 0 && !creation && (
        <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={150} /><span>Aucun atelier pour l'instant.</span></div>
      )}
      <div class="grille-ateliers">
        {liste.ateliers.map((x) => (
          <button key={x.id} class="carte-atelier" onClick={() => ouvrir(x.id)}>
            <div class="ligne" style="flex-wrap:nowrap"><span class="petit doux espace">{liste.types[x.type]}</span><span class={`badge ${COULEUR_STATUT[x.statut] || 'b-gris'}`}>{liste.statuts[x.statut]}</span></div>
            <strong>{x.titre}</strong>
            <span class="petit doux"><Users size={12} /> {date(x.date)} · {minutes(x.duree_min || 0)}{x.kit ? ' · kit prêt' : ''}</span>
          </button>
        ))}
      </div>
    </>
  );
}
