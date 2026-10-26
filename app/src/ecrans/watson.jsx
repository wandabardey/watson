// Le panneau Watson, ouvert depuis n'importe quel écran (⌘J) : la conversation du projet. On y pose ses questions,
// on y donne des documents ou des liens, on y demande des changements ; Watson tient compte de l'écran courant.
// Tout changement de la base passe par un lot de propositions à trier, comme partout dans Watson.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowRight, ArrowUp, BookOpenCheck, FileText, Link2, MapPin, Paperclip, Scale, SquarePen, X } from 'lucide-preact';
import { appel } from '../api.js';
import { lireContexte, suivreContexte, surOuverture } from '../contexte.js';
import { ConnexionClaude, Watson } from './commun.jsx';
import { Markdown } from './markdown.jsx';

const lireFichier = (f) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok({ nom: f.name, contenu_base64: String(r.result).split(',')[1] || '' });
  r.onerror = ko;
  r.readAsDataURL(f);
});
const prenom = (nom) => (nom || '').split(/\s+/)[0] || '';

// Relances proposées selon l'écran, avant le premier message.
const SUGGESTIONS = {
  projet: ['Où en est le projet ?', 'Qu\'est-ce qui bloque le passage en specs ?', 'Prépare les questions pour le prochain atelier'],
  cahier: ['Qu\'est-ce qui manque au cahier des charges ?', 'Reformule le besoin en trois phrases'],
  maquettes: ['Quels écrans n\'ont pas encore de maquette ?', 'Que faut-il vérifier avant de valider cette maquette ?'],
  regles: ['Quelles règles sont encore proposées ?', 'Y a-t-il des règles qui se contredisent ?'],
  ecrans: ['Quels écrans n\'ont pas de règle ?', 'Explique le parcours de cet écran'],
  scenarios: ['Résume ce scénario pour le client', 'Quelles étapes n\'ont pas d\'écran ?'],
  evolutions: ['Quel est l\'impact de cette évolution ?', 'Découpe cette évolution en lots'],
  recette: ['Quels cas de test manquent ?', 'Prépare la non-régression du prochain lot'],
  direct: ['Cet écran est-il conforme à la spec ?', 'Rédige l\'anomalie que je viens de voir'],
};
const GENERIQUES = ['Résume ce que la base dit de cet écran', 'Qu\'est-ce qui manque encore ?', 'Ajoute une règle…'];

function Reponse({ m, aller, envoyer, fermer }) {
  if (m.etat === 'en_cours') {
    return (
      <div class="wt-attente"><Watson humeur="lit" hauteur={44} flotte={false} />
        <span class="pile" style="gap:2px"><span class="wt-points">{m.etape || 'Watson réfléchit'}</span>
          {m.texte && <span class="petit doux">{m.texte}</span>}</span></div>
    );
  }
  if (m.etat === 'erreur') return <p class="encart e-rouge">{m.texte}</p>;
  return (
    <div class="wt-reponse pile" style="gap:10px">
      {m.texte && <Markdown texte={m.texte} classe="wt-texte" />}
      {m.sources?.length > 0 && (
        <div class="wt-sources">
          {m.sources.map((s, i) => (
            <span key={i} class="wt-source" title={s.trace || ''}><Scale size={12} /> <span class="doux">{s.type}</span> {s.nom}
              {s.verifiee === false && <span class="badge b-rouge">introuvable</span>}</span>
          ))}
        </div>
      )}
      {m.trou && <p class="encart e-orange"><span>{m.trou}</span></p>}
      {m.question && (
        <div class="wt-question pile" style="gap:8px">
          <strong>{m.question.texte}</strong>
          <div class="ligne" style="gap:6px">{m.question.options.map((o) => <button key={o} class="bouton wt-option" onClick={() => envoyer(o)}>{o}</button>)}</div>
        </div>
      )}
      {m.lot && (
        <div class="wt-lot">
          <Watson humeur="range" hauteur={42} flotte={false} />
          <span class="pile espace" style="gap:2px">
            <strong>{m.lot.propositions} proposition{m.lot.propositions > 1 ? 's' : ''} pour la base</strong>
            <span class="petit doux">{m.lot.resume || 'À trier : rien n\'est écrit sans ton accord.'}</span>
          </span>
          <button class="bouton principal-b" onClick={() => { try { sessionStorage.setItem('watson.lot', m.lot.id); } catch { /* rien */ } aller('alimenter'); }}>Trier <ArrowRight size={14} /></button>
        </div>
      )}
      {m.avertissements?.length > 0 && <span class="petit doux">{m.avertissements.join(' ')}</span>}
      {m.ecrans?.length > 0 && (
        <div class="ligne" style="gap:6px">{m.ecrans.map((e) => <button key={e} class="bouton petit-b" onClick={() => aller(e)}>Ouvrir {ECRANS_NOMS[e] || e} <ArrowRight size={13} /></button>)}</div>
      )}
    </div>
  );
}

const ECRANS_NOMS = { projet: 'la vue d\'ensemble', sujets: 'les questions', alimenter: 'Alimenter', cahier: 'le cahier des charges', moodboard: 'le moodboard',
  maquettes: 'les maquettes', proposition: 'la proposition', referentiels: 'les référentiels', scenarios: 'les scénarios', ecrans: 'les écrans', regles: 'les règles',
  crud: 'Qui fait quoi', secteur: 'la fiche secteur', flux: 'les flux', ateliers: 'les ateliers', comite: 'le comité', evolutions: 'les évolutions',
  versions: 'les versions', specifications: 'les spécifications', recette: 'la recette', documentation: 'la documentation', direct: 'l\'app en direct',
  design: 'le design system', avancement: 'l\'avancement', code: 'le passage en code' };

export function PanneauWatson({ projet, etat, ouvert, fermer, aller }) {
  const [conv, setConv] = useState({ messages: [] });
  const [texte, setTexte] = useState('');
  const [pieces, setPieces] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [ctx, setCtx] = useState(lireContexte());
  const [avecEcran, setAvecEcran] = useState(true);
  const [claude, setClaude] = useState(etat.claude);
  const fil = useRef(null);
  const saisie = useRef(null);
  const fichier = useRef(null);
  const enCours = conv.messages.some((m) => m.etat === 'en_cours');

  const charger = () => appel(`/projets/${projet.id}/watson`).then(setConv).catch(() => {});
  useEffect(() => { charger(); }, [projet.id]);
  useEffect(() => suivreContexte(setCtx), []);
  useEffect(() => {
    if (!enCours) return undefined;
    const t = setInterval(charger, 1500);
    return () => clearInterval(t);
  }, [enCours, projet.id]);
  useEffect(() => { if (fil.current) fil.current.scrollTop = fil.current.scrollHeight; }, [conv.messages.length, enCours, ouvert]);
  useEffect(() => { if (ouvert) setTimeout(() => saisie.current?.focus(), 60); }, [ouvert]);

  const envoyer = async (t = texte, p = pieces) => {
    const message = (t || '').trim();
    if ((!message && !p.length) || enCours) return;
    setErreur(null); setTexte(''); setPieces([]);
    const ecran = avecEcran ? { zone: ctx.zone, libelle: ctx.libelle, element: ctx.element } : {};
    try { setConv(await appel(`/projets/${projet.id}/watson`, { corps: { texte: message, pieces: p, ecran } })); } catch (e) { setErreur(e.message); setTexte(message); setPieces(p); }
  };
  useEffect(() => surOuverture((d) => {
    if (d.texte && d.envoyer) envoyer(d.texte, d.pieces || []);
    else if (d.texte) { setTexte(d.texte); setTimeout(() => saisie.current?.focus(), 80); }
    if (d.pieces?.length && !d.envoyer) setPieces((x) => [...x, ...d.pieces]);
  }), [projet.id, enCours, ctx, avecEcran]);

  const joindre = async (fichiers) => {
    const lus = await Promise.all([...fichiers].slice(0, 10).map(lireFichier));
    setPieces((x) => [...x, ...lus].slice(0, 10));
  };
  const nouveau = async () => { setErreur(null); try { setConv(await appel(`/projets/${projet.id}/watson`, { methode: 'DELETE', corps: {} })); } catch (e) { setErreur(e.message); } };
  const derniere = [...conv.messages].reverse().find((m) => m.role === 'watson' && m.etat === 'fini');
  const relances = conv.messages.length === 0 ? (SUGGESTIONS[ctx.zone] || GENERIQUES) : (derniere?.suggestions || []);
  const lien = /https?:\/\/\S+/.test(texte);

  return (
    <aside class={`panneau-watson ${ouvert ? 'ouvert' : ''}`} aria-label="Conversation avec Watson" aria-hidden={!ouvert}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); joindre(e.dataTransfer.files); }}>
      <div class="wt-tete">
        <Watson humeur="debout" hauteur={30} flotte={false} />
        <strong class="espace">Demander à Watson</strong>
        <span class="badge b-violet" title="Watson répond avec ton compte Claude">Claude</span>
        <button class="bouton icone" title="Nouvelle conversation" disabled={enCours || !conv.messages.length} onClick={nouveau}><SquarePen size={15} /></button>
        <button class="bouton icone" title="Fermer (⌘J)" onClick={fermer}><X size={15} /></button>
      </div>
      <div class="wt-fil" ref={fil}>
        {!claude?.connecte && <ConnexionClaude claude={claude} setClaude={setClaude} usage="La conversation avec Watson" />}
        {conv.messages.length === 0 && (
          <div class="wt-vide">
            <Watson humeur="salue" hauteur={120} />
            <h2>Comment je peux t'aider, {prenom(etat.github.compte?.nom)} ?</h2>
            <p class="doux">Pose une question sur le projet, donne-moi un document ou un lien, demande un changement de la base. Je tiens compte de l'écran où tu es.</p>
          </div>
        )}
        {conv.messages.map((m) => (m.role === 'moi'
          ? (
            <div key={m.id} class="wt-moi">
              {m.texte && <p>{m.texte}</p>}
              {m.pieces?.length > 0 && <div class="ligne" style="gap:4px;justify-content:flex-end">{m.pieces.map((p) => <span key={p.nom} class="wt-piece"><FileText size={12} /> {p.nom}</span>)}</div>}
              {m.ecran?.libelle && <span class="petit doux"><MapPin size={11} /> {m.ecran.libelle}{m.ecran.element?.nom ? ` · ${m.ecran.element.nom}` : ''}</span>}
            </div>
          )
          : <div key={m.id} class="wt-lui"><Reponse m={m} aller={aller} envoyer={(t) => envoyer(t, [])} fermer={fermer} /></div>))}
        {erreur && <p class="encart e-rouge">{erreur}</p>}
      </div>
      {relances.length > 0 && !enCours && (
        <div class="wt-relances">{relances.map((s) => <button key={s} class="wt-relance" onClick={() => (s.endsWith('…') ? (setTexte(s.replace('…', ' ')), saisie.current?.focus()) : envoyer(s, []))}><BookOpenCheck size={13} /> {s}</button>)}</div>
      )}
      <div class="wt-saisie">
        {pieces.length > 0 && (
          <div class="ligne" style="gap:4px">{pieces.map((p, i) => <span key={i} class="wt-piece">{p.nom}<button aria-label={`Retirer ${p.nom}`} onClick={() => setPieces(pieces.filter((_, j) => j !== i))}><X size={11} /></button></span>)}</div>
        )}
        <textarea ref={saisie} rows={2} value={texte} placeholder={enCours ? 'Watson répond…' : 'Écris ta demande, colle un lien, dépose un document…'}
          onInput={(e) => { setTexte(e.currentTarget.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(180, e.currentTarget.scrollHeight)}px`; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          onPaste={(e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); joindre(f); } }} />
        <div class="ligne" style="gap:6px;flex-wrap:nowrap">
          <button class="bouton icone" title="Joindre des documents ou des images" onClick={() => fichier.current?.click()}><Paperclip size={15} /></button>
          <input ref={fichier} type="file" multiple hidden onChange={(e) => { joindre(e.currentTarget.files); e.currentTarget.value = ''; }} />
          {ctx.libelle && (
            <button class={`wt-ici ${avecEcran ? 'actif' : ''}`} title="Watson tient compte de l'écran où tu es" onClick={() => setAvecEcran(!avecEcran)}>
              <MapPin size={12} /> <span class="tronque">{ctx.libelle}{ctx.element?.nom ? ` · ${ctx.element.nom}` : ''}</span>
            </button>
          )}
          {lien && <span class="petit doux" title="Watson lira le lien"><Link2 size={13} /></span>}
          <span class="espace" />
          <button class="bouton principal-b wt-envoyer" aria-label="Envoyer" disabled={enCours || (!texte.trim() && !pieces.length)} onClick={() => envoyer()}><ArrowUp size={16} /></button>
        </div>
      </div>
    </aside>
  );
}
