// Documentation utilisateur : un guide pour les utilisateurs du produit, tiré de la base. Watson propose le sommaire,
// rédige chaque rubrique en mode d'emploi, et signale celles à mettre à jour quand la base bouge. Export HTML.
import { useEffect, useState } from 'preact/hooks';
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Check, ClipboardCopy, FileDown, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { Rendu } from './maquettes.jsx';
import { Markdown } from './markdown.jsx';

const STATUT = { a_rediger: ['À rédiger', 'b-gris'], brouillon: ['Brouillon', 'b-ambre'], relue: ['Relue', 'b-vert'] };

function Cadrage({ d, lancer, occupe, claude, annuler }) {
  const g = d.guide || {};
  const [f, setF] = useState({ decoupage: g.decoupage || 'parcours', audience: g.audience || 'utilisateur', demande: '' });
  return (
    <div class="carte ligne" style="gap:18px;flex-wrap:nowrap;align-items:flex-start">
      <Watson humeur="ecrit" hauteur={130} flotte={false} />
      <div class="pile espace" style="gap:10px">
        <strong>{d.guide ? 'Refaire le sommaire' : 'Watson prépare le sommaire du guide'}</strong>
        <span class="doux">Une rubrique par tâche que l'utilisateur accomplit vraiment, tirée des scénarios, des écrans et des actions de la base. Tu valides le sommaire, puis Watson rédige les rubriques une à une.</span>
        <div class="ligne" style="gap:8px">
          <span class="petit doux">Découpage</span>
          <div class="segments">{Object.entries(d.decoupages).map(([k, v]) => <button key={k} class={`segment ${f.decoupage === k ? 'actif' : ''}`} onClick={() => setF({ ...f, decoupage: k })}>{v}</button>)}</div>
        </div>
        <div class="ligne" style="gap:8px">
          <span class="petit doux">Public</span>
          <div class="segments">{Object.entries(d.audiences).map(([k, v]) => <button key={k} class={`segment ${f.audience === k ? 'actif' : ''}`} onClick={() => setF({ ...f, audience: k })}>{v}</button>)}</div>
        </div>
        <input class="saisie" placeholder="Une consigne, facultative : « commencer par la connexion »" value={f.demande} onInput={(e) => setF({ ...f, demande: e.target.value })} />
        {d.guide && <span class="petit doux">Les rubriques qui gardent le même titre gardent leur texte.</span>}
        <div class="ligne"><button class="bouton bouton-watson" disabled={occupe || !claude?.connecte} onClick={() => lancer(f)}><Sparkles size={14} /> Proposer le sommaire</button>
          {annuler && <button class="bouton" onClick={annuler}>Annuler</button>}</div>
      </div>
    </div>
  );
}

function Sommaire({ d, edition, setEdition, choisie, choisir }) {
  if (edition) {
    const maj = (i, ch) => setEdition(edition.map((x, j) => (i === j ? { ...x, ...ch } : x)));
    const bouger = (i, s) => { const t = [...edition]; const [x] = t.splice(i, 1); t.splice(i + s, 0, x); setEdition(t); };
    return (
      <div class="pile" style="gap:6px">
        {edition.map((x, i) => (
          <div key={x.id || i} class="ligne" style="gap:4px;flex-wrap:nowrap">
            <input class="saisie espace" value={x.titre} onInput={(e) => maj(i, { titre: e.target.value })} />
            <button class="bouton icone" disabled={!i} onClick={() => bouger(i, -1)}><ArrowUp size={13} /></button>
            <button class="bouton icone" disabled={i === edition.length - 1} onClick={() => bouger(i, 1)}><ArrowDown size={13} /></button>
            <button class="bouton icone" onClick={() => setEdition(edition.filter((_, j) => j !== i))}><X size={13} /></button>
          </div>
        ))}
        <button class="lien petit" style="align-self:flex-start" onClick={() => setEdition([...edition, { titre: '' }])}><Plus size={13} /> Rubrique</button>
      </div>
    );
  }
  let partie = null;
  return (
    <div class="pile" style="gap:2px">
      {d.rubriques.map((r) => {
        const titre = r.partie && r.partie !== partie ? (partie = r.partie) : null;
        const [, cl] = STATUT[r.statut] || STATUT.a_rediger;
        return (
          <>
            {titre && <span class="partie-guide">{titre}</span>}
            <button key={r.id} class={`menu rubrique-guide ${choisie === r.id ? 'actif' : ''}`} onClick={() => choisir(r.id)}>
              <span class={`pastille-statut ${cl}`} />
              <span class="espace tronque" style="text-align:left">{r.titre}</span>
              {r.texte && r.a_mettre_a_jour.length > 0 && <AlertTriangle size={13} color="#C2410C" />}
            </button>
          </>
        );
      })}
      {d.guide.glossaire && <button class={`menu rubrique-guide ${choisie === 'glossaire' ? 'actif' : ''}`} onClick={() => choisir('glossaire')}><span class="pastille-statut b-vert" /><span class="espace" style="text-align:left">Glossaire</span></button>}
    </div>
  );
}

function Rubrique({ projet, r, d, faire, occupe, claude, aller, maquettes, choisir }) {
  const [texte, setTexte] = useState(null);
  const [demande, setDemande] = useState(null);
  const [copie, setCopie] = useState(false);
  useEffect(() => { setTexte(null); setDemande(null); }, [r.id]);
  const [sl, sc] = STATUT[r.statut] || STATUT.a_rediger;
  const rediger = async () => { if (await faire(`/documentation/rubriques/${r.id}/rediger`, { demande: demande || '' }, true)) setDemande(null); };
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne" style="gap:8px">
        <div class="pile espace" style="gap:2px"><h2>{r.titre}</h2><span class="petit doux">{r.objectif}</span></div>
        <span class={`badge ${sc}`}>{sl}</span>
      </div>
      {r.texte && r.a_mettre_a_jour.length > 0 && (
        <div class="encart e-orange pile" style="gap:3px"><strong>À mettre à jour : la base a bougé depuis la rédaction</strong>{r.a_mettre_a_jour.map((x, i) => <span key={i}>{x}</span>)}</div>
      )}
      <div class="ligne" style="gap:6px">
        {texte === null && demande === null && <>
          <button class="bouton bouton-watson" disabled={occupe || !claude?.connecte} onClick={() => (r.texte ? setDemande('') : rediger())}><Sparkles size={14} /> {r.texte ? 'Reprendre avec Watson' : 'Rédiger avec Watson'}</button>
          {r.texte && <button class="bouton" onClick={() => setTexte(r.texte)}><Pencil size={14} /> Modifier</button>}
          {r.texte && r.statut !== 'relue' && <button class="bouton" disabled={occupe} onClick={() => faire(`/documentation/rubriques/${r.id}`, { statut: 'relue' })}><Check size={14} /> Marquer relue</button>}
          {r.texte && r.statut === 'relue' && r.a_mettre_a_jour.length > 0 && <button class="bouton" disabled={occupe} onClick={() => faire(`/documentation/rubriques/${r.id}`, { statut: 'relue' })}><Check size={14} /> Toujours juste</button>}
          {r.texte && <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(r.texte); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copiée' : 'Copier'}</button>}
        </>}
      </div>
      {demande !== null && (
        <div class="carte pile" style="gap:8px">
          <input class="saisie" autoFocus placeholder="Ce qui doit changer, facultatif" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton bouton-watson" disabled={occupe} onClick={rediger}><Sparkles size={14} /> Réécrire la rubrique</button><button class="bouton" onClick={() => setDemande(null)}>Annuler</button></div>
        </div>
      )}
      {texte !== null && (
        <div class="pile" style="gap:8px">
          <textarea class="saisie" rows={18} style="padding:12px;font-family:inherit" value={texte} onInput={(e) => setTexte(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={async () => { if (await faire(`/documentation/rubriques/${r.id}`, { texte })) setTexte(null); }}><Check size={14} /> Enregistrer</button>
            <button class="bouton" onClick={() => setTexte(null)}>Annuler</button></div>
        </div>
      )}
      {texte === null && r.texte && <section class="carte guide-page"><Markdown texte={r.texte.replace(/^\s*#{1,2}\s+[^\n]*\n/, '')} ancre={choisir} /></section>}
      {texte === null && !r.texte && <div class="vide pile" style="align-items:center;gap:8px"><Watson humeur="note" hauteur={120} /><span>Pas encore rédigée.</span></div>}
      {r.ecrans?.length > 0 && (
        <div class="pile" style="gap:8px">
          <span class="petit doux" style="font-weight:600">Captures de la rubrique</span>
          <div class="ligne" style="gap:12px;align-items:flex-start">
            {r.ecrans.map((e) => { const m = maquettes.find((x) => x.ecran === e); return m
              ? <div key={e} class="pile" style="gap:4px"><Rendu projet={projet} m={m} largeurCadre={320} hauteurMax={220} /><span class="petit doux">{m.ecran_nom || m.titre}</span></div>
              : <span key={e} class="badge b-gris">Pas de maquette pour cet écran</span>; })}
          </div>
        </div>
      )}
      {r.a_confirmer?.length > 0 && <div class="encart e-indigo pile" style="gap:3px"><strong>À confirmer</strong>{r.a_confirmer.map((x, i) => <span key={i}>{x}</span>)}</div>}
      {r.sources_noms?.length > 0 && <div class="ligne" style="gap:6px"><span class="petit doux">Tirée de</span>{r.sources_noms.map((s) => <span key={s.id} class="badge b-gris">{s.nom}</span>)}</div>}
    </div>
  );
}

export function Documentation({ projet, etat, aller }) {
  const base = `/projets/${projet.id}/documentation`;
  const [d, setD] = useState(null);
  const [maquettes, setMaquettes] = useState([]);
  const [choisie, setChoisie] = useState(null);
  const [cadrage, setCadrage] = useState(false);
  const [edition, setEdition] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [attente, setAttente] = useState(null);
  const [export_, setExport] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  useEffect(() => {
    appel(base).then((v) => { setD(v); setChoisie(v.rubriques[0]?.id || null); }).catch((e) => setMessage(e.message));
    appel(`/projets/${projet.id}/avant-projet/maquettes`).then((v) => setMaquettes(v.maquettes)).catch(() => {});
  }, []);
  const faire = async (chemin, corps, longue = false, texteAttente) => {
    setOccupe(true); setMessage(null); if (longue) setAttente(texteAttente || 'Watson rédige la rubrique');
    try { const v = await appel(`/projets/${projet.id}${chemin}`, { corps }); if (v.rubriques) setD(v); return v; } catch (e) { setMessage(e.message); return null; } finally { setOccupe(false); setAttente(null); }
  };
  if (!d) return <Attente erreur={message} />;
  const g = d.guide;
  const toutRediger = async () => {
    const manquantes = d.rubriques.filter((r) => !r.texte);
    for (let i = 0; i < manquantes.length; i++) {
      setChoisie(manquantes[i].id);
      const v = await faire(`/documentation/rubriques/${manquantes[i].id}/rediger`, {}, true, `Watson rédige « ${manquantes[i].titre} » (${i + 1} sur ${manquantes.length})`);
      if (!v) break;
    }
  };
  const exporter = async () => {
    setExport({ n: 0 }); setMessage(null);
    try {
      const ecrans = [...new Set(d.rubriques.filter((r) => r.texte).flatMap((r) => r.ecrans || []))];
      const images = {};
      const { capturerMaquette } = await import('./deck.jsx');
      for (const e of ecrans) {
        const m = maquettes.find((x) => x.ecran === e);
        if (!m) continue;
        setExport({ n: Object.keys(images).length + 1 });
        const c = await appel(`/projets/${projet.id}/avant-projet/maquettes/contenu`, { corps: { id: m.id } }).catch(() => null);
        if (c?.image) images[e] = c.image;
        else if (c?.html) images[e] = await capturerMaquette(c.html, m.support).catch(() => null);
        if (!images[e]) delete images[e];
      }
      setExport({ fini: await appel(`${base}/exporter`, { corps: { images } }) });
    } catch (e) { setMessage(e.message); setExport(null); }
  };
  const copierTout = async () => {
    const md = [`# ${g.titre}`, '', g.introduction, '', ...d.rubriques.filter((r) => r.texte).map((r) => r.texte), ...(g.glossaire ? ['## Glossaire', '', ...g.glossaire.map((t) => `- **${t.terme}** : ${t.definition}`)] : [])].join('\n\n');
    await navigator.clipboard.writeText(md);
  };
  const r = d.rubriques.find((x) => x.id === choisie);
  return (
    <>
      <Entete titre={g ? g.titre : 'Documentation'} description={g ? g.introduction : 'Le guide pour les utilisateurs du produit : des rubriques orientées tâche, rédigées en mode d\'emploi à partir de la base, et signalées quand la base bouge.'}>
        {g && !edition && (
          <div class="ligne">
            <button class="bouton bouton-watson" disabled={occupe || !claude?.connecte || !d.rubriques.some((x) => !x.texte)} onClick={toutRediger}><Sparkles size={14} /> Rédiger les rubriques manquantes</button>
            <button class="bouton" disabled={occupe || !claude?.connecte} onClick={() => faire('/documentation/glossaire', {}, true, 'Watson rédige le glossaire')}><BookOpen size={14} /> {g.glossaire ? 'Refaire le glossaire' : 'Glossaire'}</button>
            <button class="bouton" disabled={!d.compteurs.redigees || (export_ && !export_.fini)} onClick={exporter}><FileDown size={14} /> Exporter en HTML</button>
            <button class="bouton" disabled={!d.compteurs.redigees} onClick={copierTout}><ClipboardCopy size={14} /> Copier en Markdown</button>
          </div>
        )}
      </Entete>
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La documentation" />
      {message && <p class="encart e-rouge">{message}</p>}
      {export_ && <div class="encart e-indigo"><span class="espace">{export_.fini ? <>Enregistré dans Téléchargements : <strong>{export_.fini.nom}</strong> ({export_.fini.rubriques} rubriques, {export_.fini.captures} captures). Il s'ouvre dans un navigateur et s'imprime en PDF.</> : `Préparation de l'export, capture ${export_.n || 1}…`}</span>
        {export_.fini && <button class="bouton icone" onClick={() => setExport(null)}><X size={14} /></button>}</div>}
      {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={80} flotte={false} /><span><strong>{attente}</strong><br /><span class="doux">Une à deux minutes.</span></span></div>}
      {(!g || cadrage) && !attente && <Cadrage d={d} occupe={occupe} claude={claude} annuler={g ? () => setCadrage(false) : null}
        lancer={async (f) => { const v = await faire('/documentation/sommaire', f, true, 'Watson prépare le sommaire'); if (v) { setCadrage(false); setChoisie(v.rubriques[0]?.id); } }} />}
      {g && !cadrage && (
        <div class="ligne" style="align-items:flex-start;gap:18px;flex-wrap:nowrap">
          <aside class="carte pile sommaire-guide" style="gap:8px">
            <div class="ligne"><strong class="espace">Sommaire</strong>
              {!edition && <button class="bouton icone" title="Modifier le sommaire" onClick={() => setEdition(d.rubriques.map((x) => ({ id: x.id, titre: x.titre, partie: x.partie })))}><Pencil size={13} /></button>}
              {!edition && <button class="bouton icone" title="Refaire le sommaire avec Watson" onClick={() => setCadrage(true)}><RotateCcw size={13} /></button>}</div>
            <span class="petit doux">{d.compteurs.redigees} / {d.compteurs.total} rédigées{d.compteurs.a_mettre_a_jour ? ` · ${d.compteurs.a_mettre_a_jour} à mettre à jour` : ''}</span>
            <Sommaire d={d} edition={edition} setEdition={setEdition} choisie={choisie} choisir={setChoisie} />
            {edition && <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={async () => { if (await faire('/documentation', { rubriques: edition })) setEdition(null); }}><Check size={14} /> Enregistrer</button>
              <button class="bouton" onClick={() => setEdition(null)}>Annuler</button></div>}
            {edition && <span class="petit doux"><Trash2 size={12} /> Une rubrique retirée perd son texte.</span>}
          </aside>
          <main class="espace" style="min-width:0">
            {choisie === 'glossaire' && g.glossaire && <section class="carte pile" style="gap:10px"><h2>Glossaire</h2>
              <dl class="glossaire">{g.glossaire.map((t) => <><dt key={t.terme}>{t.terme}</dt><dd>{t.definition}</dd></>)}</dl></section>}
            {r && <Rubrique projet={projet} r={r} d={d} faire={faire} occupe={occupe || !!attente} claude={claude} aller={aller} maquettes={maquettes} choisir={setChoisie} />}
          </main>
        </div>
      )}
    </>
  );
}
