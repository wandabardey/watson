// Recette et TNR : le cahier de recette (cas tirés de la base ou des évolutions, relus et validés), et les campagnes
// (cas à jouer pour une version, résultats, anomalies, rapport go / no-go). Rien ne part dans Jira depuis Watson.
import { useEffect, useState } from 'preact/hooks';
import { AlertTriangle, ArrowLeft, Check, ClipboardCopy, FlaskConical, ListChecks, Plus, Save, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, Entete, Watson } from './commun.jsx';

const date = (d) => (d ? String(d).split('-').reverse().join('/') : '');
const RES = { ok: ['Réussi', 'b-vert'], ko: ['En échec', 'b-rouge'], bloque: ['Bloqué', 'b-orange'], non_joue: ['Pas joué', 'b-gris'] };
const VERDICT = { go: ['Go', 'b-vert'], go_reserves: ['Go avec réserves', 'b-vert'], reserves: ['À arbitrer', 'b-ambre'], no_go: ['No-go', 'b-rouge'], incomplet: ['En cours', 'b-gris'] };
const MODELE_ANOMALIE = 'Étapes :\n1. \n\nRésultat attendu : \nRésultat obtenu : \nDonnées utilisées : ';

// ----------------------------------------------------------------- cahier

function Cas({ c, d, faire, occupe }) {
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const editer = () => setF({ titre: c.titre, etant_donne: c.etant_donne, quand: c.quand, alors: c.alors, a_preciser: (c.a_preciser || []).join('\n') });
  return (
    <article class={`carte pile cas-test ${c.a_revoir.length ? 'a-revoir' : ''}`} style="gap:8px">
      <button class="entete-cas" onClick={() => setOuvert(!ouvert)}>
        <span class="pile espace" style="gap:2px;text-align:left"><strong>{c.titre}</strong><span class="petit doux">{d.types[c.type] || c.type}{c.evolution ? ` · ${c.evolution}` : ''}</span></span>
        {c.a_revoir.length > 0 && <span class="badge b-orange"><AlertTriangle size={12} /> À revoir</span>}
        <span class={`badge ${c.statut === 'valide' ? 'b-vert' : 'b-gris'}`}>{d.statuts[c.statut]}</span>
      </button>
      {c.a_revoir.length > 0 && <div class="encart e-orange pile" style="gap:3px"><span>La base a bougé depuis la rédaction du cas :</span>{c.a_revoir.map((r, i) => <span key={i}>{r}</span>)}
        <button class="bouton" style="align-self:flex-start" disabled={occupe} onClick={() => faire(`/recette/cas/${c.id}`, { revu: true })}><Check size={14} /> Le cas est toujours juste</button></div>}
      {ouvert && !f && (
        <div class="pile" style="gap:6px">
          <div class="gherkin"><b>Étant donné</b> {c.etant_donne}<br /><b>Quand</b> {c.quand}<br /><b>Alors</b> {c.alors}</div>
          {c.a_preciser?.length > 0 && <span class="petit doux">À préciser : {c.a_preciser.join(' ; ')}</span>}
          <div class="ligne" style="gap:6px">
            {c.statut !== 'valide' && <button class="bouton principal-b" disabled={occupe} onClick={() => faire(`/recette/cas/${c.id}`, { statut: 'valide' })}><Check size={14} /> Valider</button>}
            {c.statut === 'valide' && <button class="bouton" disabled={occupe} onClick={() => faire(`/recette/cas/${c.id}`, { statut: 'brouillon' })}>Repasser en brouillon</button>}
            <button class="bouton" onClick={editer}>Modifier</button>
            <span class="espace" />
            {confirmer ? <button class="bouton danger" onClick={() => faire(`/recette/cas/${c.id}`, {}, 'DELETE')}>Retirer le cas</button> : <button class="bouton icone" title="Retirer" onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
          </div>
        </div>
      )}
      {f && (
        <div class="pile" style="gap:6px">
          <label class="champ">Titre<input value={f.titre} onInput={(e) => setF({ ...f, titre: e.target.value })} /></label>
          <label class="champ">Étant donné<textarea rows={2} value={f.etant_donne} onInput={(e) => setF({ ...f, etant_donne: e.target.value })} /></label>
          <label class="champ">Quand<textarea rows={2} value={f.quand} onInput={(e) => setF({ ...f, quand: e.target.value })} /></label>
          <label class="champ">Alors<textarea rows={2} value={f.alors} onInput={(e) => setF({ ...f, alors: e.target.value })} /></label>
          <label class="champ">À préciser, une ligne par point<textarea rows={2} value={f.a_preciser} onInput={(e) => setF({ ...f, a_preciser: e.target.value })} /></label>
          <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={async () => { if (await faire(`/recette/cas/${c.id}`, { ...f, a_preciser: f.a_preciser.split('\n') })) setF(null); }}><Check size={14} /> Enregistrer</button>
            <button class="bouton" onClick={() => setF(null)}>Annuler</button></div>
        </div>
      )}
    </article>
  );
}

function Propositions({ projet, fermer, faire }) {
  const [p, setP] = useState(null);
  const [choix, setChoix] = useState([]);
  useEffect(() => { appel(`/projets/${projet.id}/recette/propositions`).then((r) => { setP(r); setChoix(r.cas.map((c) => c.id)); }); }, []);
  if (!p) return <Attente />;
  const groupes = [...new Set(p.cas.map((c) => c.type))];
  return (
    <section class="carte pile" style="gap:10px">
      <div class="ligne"><h2 class="espace">Cas tirés de la base</h2><button class="bouton icone" onClick={fermer}><X size={15} /></button></div>
      <span class="doux">Watson les tire des actions du cycle de vie et des règles validées : chemin normal, droits, règle respectée ou non, lignes de table, non-régression. Rien n'est inventé ; ce qui manque est à préciser.</span>
      {p.cas.length === 0 && <span class="doux">Tous les cas possibles sont déjà dans le cahier.</span>}
      {groupes.map((g) => (
        <div key={g} class="pile" style="gap:4px">
          <span class="petit doux" style="font-weight:600">{p.types[g] || g}</span>
          {p.cas.filter((c) => c.type === g).map((c) => (
            <label key={c.id} class="ligne proposition-cas" style="flex-wrap:nowrap;gap:10px;align-items:flex-start">
              <input type="checkbox" checked={choix.includes(c.id)} onChange={() => setChoix(choix.includes(c.id) ? choix.filter((x) => x !== c.id) : [...choix, c.id])} style="margin-top:4px" />
              <span class="pile" style="gap:2px"><strong>{c.titre}</strong><span class="petit doux">Étant donné {c.etant_donne} · quand {c.quand}</span></span>
            </label>
          ))}
        </div>
      ))}
      {p.en_attente.length > 0 && <div class="encart e-indigo pile" style="gap:3px"><strong>Pas encore de cas, en attente de validation</strong>{p.en_attente.map((e, i) => <span key={i}>{e.nom} : {e.raison}</span>)}</div>}
      {p.cas.length > 0 && <button class="bouton principal-b" style="align-self:flex-start" disabled={!choix.length} onClick={async () => { if (await faire('/recette/garder', { ids: choix })) fermer(); }}><Plus size={14} /> Ajouter au cahier ({choix.length})</button>}
    </section>
  );
}

function Cahier({ projet, d, faire, occupe, evolutions }) {
  const [filtre, setFiltre] = useState('tous');
  const [prop, setProp] = useState(false);
  const [evo, setEvo] = useState('');
  const cas = d.cas.filter((c) => filtre === 'tous' || (filtre === 'revoir' ? c.a_revoir.length : c.statut === filtre));
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne" style="gap:8px">
        <div class="segments">{[['tous', `Tous (${d.compteurs.total})`], ['brouillon', 'Brouillons'], ['valide', `Validés (${d.compteurs.valides})`], ['revoir', `À revoir (${d.compteurs.a_revoir})`]].map(([k, v]) => <button key={k} class={`segment ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>)}</div>
        <span class="espace" />
        <button class="bouton" onClick={() => setProp(!prop)}><ListChecks size={14} /> Proposer depuis la base{d.a_proposer ? ` (${d.a_proposer})` : ''}</button>
        {evolutions.length > 0 && <>
          <select class="saisie" value={evo} onChange={(e) => setEvo(e.target.value)} aria-label="Évolution"><option value="">Cas d'une évolution…</option>{evolutions.map((e) => <option key={e.id} value={e.id}>{e.titre}</option>)}</select>
          <button class="bouton" disabled={!evo || occupe} onClick={() => faire('/recette/evolution', { evolution: evo })}><Plus size={14} /> Ajouter</button>
        </>}
      </div>
      {prop && <Propositions projet={projet} fermer={() => setProp(false)} faire={faire} />}
      {cas.length === 0 && !prop && <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={140} /><span>{d.compteurs.total ? 'Rien dans ce filtre.' : 'Le cahier est vide : propose des cas depuis la base ou depuis une évolution.'}</span></div>}
      <div class="pile" style="gap:8px">{cas.map((c) => <Cas key={c.id} c={c} d={d} faire={faire} occupe={occupe} />)}</div>
    </div>
  );
}

// ----------------------------------------------------------------- campagnes

function enMarkdown(c) {
  const r = c.rapport;
  const l = [`# ${c.nom}`, '', `${c.version ? `Version ${c.version} · ` : ''}${date(c.date)} · ${r.joues}/${r.total} cas joués`, '', `**Avis : ${VERDICT[r.verdict][0]}.** ${r.raison}`, '',
    `| Réussis | En échec | Bloqués | Pas joués |`, `|---|---|---|---|`, `| ${r.compte.ok} | ${r.compte.ko} | ${r.compte.bloque} | ${r.compte.non_joue} |`];
  const ko = c.details.filter((x) => c.resultats[x.id]?.resultat === 'ko');
  if (ko.length) {
    l.push('', '## Anomalies');
    for (const x of ko) { const res = c.resultats[x.id]; l.push('', `### ${x.titre} (${res.gravite})`, '', res.anomalie || res.commentaire || ''); }
  }
  return l.join('\n');
}

function LigneCampagne({ x, c, noter, close }) {
  const res = c.resultats[x.id] || {};
  const [ko, setKo] = useState(null);
  const [comm, setComm] = useState(res.commentaire || '');
  const [r0, cl] = RES[res.resultat || 'non_joue'];
  return (
    <article class={`carte pile ligne-campagne res-${res.resultat || 'non_joue'}`} style="gap:6px">
      <div class="ligne" style="flex-wrap:nowrap;gap:10px;align-items:flex-start">
        <span class="pile espace" style="gap:3px"><strong>{x.titre}</strong>
          {!x.absent && <span class="petit doux"><b>Étant donné</b> {x.etant_donne} · <b>quand</b> {x.quand} · <b>alors</b> {x.alors}</span>}</span>
        <span class={`badge ${cl}`}>{r0}{res.gravite ? ` · ${res.gravite}` : ''}</span>
      </div>
      {!close && !x.absent && ko === null && (
        <div class="ligne" style="gap:6px">
          <button class="bouton" onClick={() => noter(x.id, { resultat: 'ok', commentaire: comm })}><Check size={14} /> Réussi</button>
          <button class="bouton" onClick={() => setKo({ gravite: res.gravite || 'majeure', anomalie: res.anomalie || MODELE_ANOMALIE })}><X size={14} /> En échec</button>
          <button class="bouton" onClick={() => noter(x.id, { resultat: 'bloque', commentaire: comm })}>Bloqué</button>
          <input class="saisie espace" placeholder="Commentaire, facultatif" value={comm} onInput={(e) => setComm(e.target.value)} onBlur={() => res.resultat && comm !== (res.commentaire || '') && noter(x.id, { ...res, commentaire: comm })} />
        </div>
      )}
      {ko && (
        <div class="pile" style="gap:6px">
          <div class="ligne" style="gap:8px"><span class="petit doux">Gravité</span>
            <div class="segments">{[['bloquante', 'Bloquante'], ['majeure', 'Majeure'], ['mineure', 'Mineure']].map(([k, v]) => <button key={k} class={`segment ${ko.gravite === k ? 'actif' : ''}`} onClick={() => setKo({ ...ko, gravite: k })}>{v}</button>)}</div></div>
          <textarea class="saisie" rows={6} style="padding:10px 12px" value={ko.anomalie} onInput={(e) => setKo({ ...ko, anomalie: e.target.value })} />
          <div class="ligne"><button class="bouton principal-b" onClick={async () => { await noter(x.id, { resultat: 'ko', commentaire: comm, ...ko }); setKo(null); }}><Check size={14} /> Noter l'échec</button><button class="bouton" onClick={() => setKo(null)}>Annuler</button></div>
        </div>
      )}
      {res.resultat === 'ko' && !ko && res.anomalie && <pre class="anomalie">{res.anomalie}</pre>}
      {res.commentaire && res.resultat !== 'ko' && close && <span class="petit doux">{res.commentaire}</span>}
    </article>
  );
}

function Campagne({ projet, c: c0, retour }) {
  const [c, setC] = useState(c0);
  const [message, setMessage] = useState(null);
  const [copie, setCopie] = useState(false);
  const [filtre, setFiltre] = useState('tous');
  const base = `/projets/${projet.id}/recette/campagnes/${c.id}`;
  const noter = async (cas, champs) => { try { setC(await appel(`${base}/noter`, { corps: { cas, ...champs } })); } catch (e) { setMessage(e.message); } };
  const enregistrer = async (cloturer) => { try { setC(await appel(`${base}/enregistrer`, { corps: { cloturer } })); } catch (e) { setMessage(e.message); } };
  const r = c.rapport;
  const close = c.statut === 'close';
  const [vl, vc] = VERDICT[r.verdict];
  const details = c.details.filter((x) => filtre === 'tous' || (c.resultats[x.id]?.resultat || 'non_joue') === filtre);
  return (
    <>
      <div class="ligne" style="gap:8px">
        <button class="bouton" onClick={retour}><ArrowLeft size={14} /> Campagnes</button>
        <span class="espace" />
        <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(enMarkdown(c)); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copié' : 'Copier le rapport'}</button>
        {!close && <button class="bouton" disabled={!c.non_enregistres} onClick={() => enregistrer(false)}><Save size={14} /> Enregistrer les résultats{c.non_enregistres ? ` (${c.non_enregistres})` : ''}</button>}
        {!close && <button class="bouton principal-b" onClick={() => enregistrer(true)}><Check size={14} /> Clôturer la campagne</button>}
      </div>
      <Entete titre={c.nom} description={`${c.genre === 'tnf' ? 'Nouveautés' : 'Non-régression'}${c.version ? ` · version ${c.version}` : ''}${c.environnement ? ` · ${c.environnement}` : ''} · ouverte le ${date(c.date)}${close ? ` · close le ${date(c.close_le)}` : ''}`} />
      {message && <p class="encart e-rouge">{message}</p>}
      <section class="carte ligne rapport-campagne" style="gap:22px;align-items:center">
        <div class="pile" style="gap:4px;min-width:200px"><span class={`badge ${vc}`} style="align-self:flex-start;font-size:15px;padding:4px 12px">{vl}</span><span class="doux petit">{r.raison}</span></div>
        <div class="pile espace" style="gap:6px">
          <div class="barre-campagne">{['ok', 'ko', 'bloque'].map((k) => <span key={k} class={`seg-${k}`} style={`width:${r.total ? (100 * r.compte[k]) / r.total : 0}%`} />)}</div>
          <span class="petit doux">{r.joues} / {r.total} joués · {r.compte.ok} réussis · {r.compte.ko} en échec{r.compte.ko ? ` (${[['bloquante', 'bloquant'], ['majeure', 'majeur'], ['mineure', 'mineur']].filter(([k]) => r.par_gravite[k]).map(([k, l]) => `${r.par_gravite[k]} ${l}${r.par_gravite[k] > 1 ? 's' : ''}`).join(', ')})` : ''} · {r.compte.bloque} bloqués</span>
        </div>
      </section>
      {c.non_enregistres > 0 && !close && <p class="petit doux">Les résultats sont gardés sur ce poste au fil de l'eau ; « Enregistrer » les range dans le dépôt du projet.</p>}
      <div class="segments" style="align-self:flex-start">{[['tous', 'Tous'], ['non_joue', 'Pas joués'], ['ko', 'En échec'], ['bloque', 'Bloqués'], ['ok', 'Réussis']].map(([k, v]) => <button key={k} class={`segment ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>)}</div>
      <div class="pile" style="gap:8px">{details.map((x) => <LigneCampagne key={x.id} x={x} c={c} noter={noter} close={close} />)}</div>
    </>
  );
}

function Campagnes({ projet, evolutions, ouvrir }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => { appel(`/projets/${projet.id}/recette/campagnes`).then(setD).catch((e) => setMessage(e.message)); }, []);
  if (!d) return <Attente erreur={message} />;
  const creer = async () => {
    setMessage(null);
    try { ouvrir(await appel(`/projets/${projet.id}/recette/campagnes`, { corps: { ...f, evolution: f.source.startsWith('EVO-') ? f.source : '', brouillons: f.source === 'tous' } })); } catch (e) { setMessage(e.message); }
  };
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne"><span class="espace" /><button class="bouton principal-b" onClick={() => setF(f ? null : { nom: '', genre: 'tnr', version: '', environnement: 'recette', source: 'valides' })}><Plus size={14} /> Nouvelle campagne</button></div>
      {message && <p class="encart e-rouge">{message}</p>}
      {f && (
        <div class="carte pile" style="gap:10px">
          <div class="ligne" style="gap:12px">
            <label class="champ" style="flex:2 1 260px">Nom<input autoFocus value={f.nom} placeholder="Par exemple : TNR version 1.2" onInput={(e) => setF({ ...f, nom: e.target.value })} /></label>
            <label class="champ" style="flex:1 1 160px">Type<select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}>{Object.entries(d.genres).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label class="champ" style="flex:1 1 140px">Version testée<input value={f.version} placeholder="1.2" onInput={(e) => setF({ ...f, version: e.target.value })} /></label>
            <label class="champ" style="flex:1 1 140px">Environnement<input value={f.environnement} onInput={(e) => setF({ ...f, environnement: e.target.value })} /></label>
          </div>
          <label class="champ">Cas à jouer<select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="valides">Tous les cas validés du cahier</option>
            <option value="tous">Tous les cas, brouillons compris</option>
            {evolutions.map((e) => <option key={e.id} value={e.id}>Ce que touche l'évolution « {e.titre} »</option>)}
          </select></label>
          <div class="ligne"><button class="bouton principal-b" disabled={!f.nom.trim()} onClick={creer}><Check size={14} /> Ouvrir la campagne</button><button class="bouton" onClick={() => setF(null)}>Annuler</button></div>
        </div>
      )}
      {d.campagnes.length === 0 && !f && <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={140} /><span>Aucune campagne pour l'instant.</span></div>}
      <div class="pile" style="gap:8px">
        {d.campagnes.map((x) => (
          <button key={x.id} class="ligne-evolution" onClick={async () => ouvrir(await appel(`/projets/${projet.id}/recette/campagnes/${x.id}`))}>
            <FlaskConical size={17} color="#4F46E5" />
            <span class="pile espace" style="gap:4px;text-align:left"><strong>{x.nom}</strong>
              <span class="petit doux">{d.genres[x.genre]}{x.version ? ` · version ${x.version}` : ''} · {date(x.date)} · {x.joues}/{x.cas} joués{x.ko ? ` · ${x.ko} en échec` : ''}</span>
              <span class="barre-campagne petite"><span class="seg-ok" style={`width:${x.cas ? (100 * x.joues) / x.cas : 0}%`} /></span></span>
            <span class={`badge ${x.statut === 'close' ? 'b-gris' : 'b-indigo'}`}>{x.statut === 'close' ? 'Close' : 'En cours'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Recette({ projet }) {
  const [onglet, setOnglet] = useState('cahier');
  const [d, setD] = useState(null);
  const [evos, setEvos] = useState([]);
  const [campagne, setCampagne] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    appel(`/projets/${projet.id}/recette`).then(setD).catch((e) => setMessage(e.message));
    appel(`/projets/${projet.id}/evolutions`).then((r) => setEvos(r.evolutions.filter((e) => e.redigee))).catch(() => {});
  }, []);
  const faire = async (chemin, corps, methode) => {
    setOccupe(true); setMessage(null);
    try { const r = await appel(`/projets/${projet.id}${chemin}`, { corps, methode }); if (r.cas) setD(r); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); }
  };
  if (campagne) return <Campagne projet={projet} c={campagne} retour={() => setCampagne(null)} />;
  if (!d) return <Attente erreur={message} />;
  return (
    <>
      <Entete titre="Recette et TNR" description="Le cahier de recette tiré de la base et des évolutions, relu et validé par toi ; les campagnes pour jouer les cas d'une version, noter les anomalies et décider go ou no-go. Quand la base bouge, les cas concernés sont signalés à revoir.">
        <div class="segments">{[['cahier', 'Cahier de recette'], ['campagnes', 'Campagnes']].map(([k, v]) => <button key={k} class={`segment ${onglet === k ? 'actif' : ''}`} onClick={() => setOnglet(k)}>{v}</button>)}</div>
      </Entete>
      {message && <p class="encart e-rouge">{message}</p>}
      {onglet === 'cahier' ? <Cahier projet={projet} d={d} faire={faire} occupe={occupe} evolutions={evos} />
        : <Campagnes projet={projet} evolutions={evos} ouvrir={setCampagne} />}
    </>
  );
}
