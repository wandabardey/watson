// Savoir-faire du studio sur les livrables : relecture et critique UX (avec correction par Watson), fiche secteur,
// mail au client. Rien ne part chez le client depuis Watson : le mail se copie ou s'ouvre dans la messagerie.
import { useEffect, useState } from 'preact/hooks';
import { BookOpenCheck, Check, ClipboardCopy, Landmark, Mail, MessageSquareWarning, RefreshCw, Sparkles, X } from 'lucide-preact';
import { appel, ouvrirLien } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { Markdown } from './markdown.jsx';

const GRAVITE = { bloquant: ['Bloquant', 'b-rouge'], majeur: ['Majeur', 'b-orange'], mineur: ['Mineur', 'b-gris'] };
const date = (d) => (d ? String(d).split('-').reverse().join('/') : '');

export function consigneCorrection(revue, choisis) {
  const pts = revue.points.filter((_, i) => choisis.includes(i));
  return 'Corrige selon ces retours de relecture :\n' + (pts.length ? pts : revue.points)
    .map((p) => `- ${p.ou ? `${p.ou} : ` : ''}${p.constat} → ${p.recommandation}`).join('\n');
}

// ----------------------------------------------------------------- relecture

function Revue({ projet, cible, titre, capturer, corriger, fermer }) {
  const [revue, setRevue] = useState(undefined);
  const [question, setQuestion] = useState('');
  const [attente, setAttente] = useState(false);
  const [message, setMessage] = useState(null);
  const [choisis, setChoisis] = useState([]);
  useEffect(() => { appel(`/projets/${projet.id}/studio/revue`, { corps: { cible } }).then((r) => setRevue(r.revue)).catch((e) => setMessage(e.message)); }, []);
  const relire = async () => {
    setAttente(true); setMessage(null);
    try {
      const capture = capturer ? await capturer().catch(() => null) : null;
      const r = await appel(`/projets/${projet.id}/studio/relire`, { corps: { cible, question, capture } });
      setRevue(r); setChoisis(r.points.map((p, i) => (p.gravite !== 'mineur' ? i : -1)).filter((i) => i >= 0));
    } catch (e) { setMessage(e.message); }
    setAttente(false);
  };
  const critique = cible.type === 'maquette' || cible.type === 'ecran_reel';
  return (
    <div class="visionneuse" onClick={fermer}>
      <div class="modale-comite" onClick={(e) => e.stopPropagation()}>
        <div class="ligne" style="flex-wrap:nowrap">
          <MessageSquareWarning size={18} />
          <strong class="espace">{critique ? 'Critique UX' : 'Relecture'} : {titre}</strong>
          <button class="bouton icone" onClick={fermer} title="Fermer"><X size={16} /></button>
        </div>
        <div class="ligne" style="gap:8px;flex-wrap:nowrap">
          <input class="saisie espace" placeholder={critique ? 'Une question précise, facultative : « le parcours de validation est-il clair ? »' : 'Une question précise, facultative : « est-ce prêt à partir chez le client ? »'}
            value={question} onInput={(e) => setQuestion(e.target.value)} />
          <button class="bouton bouton-watson" disabled={attente} onClick={relire}><Sparkles size={14} /> {revue ? 'Relire à nouveau' : cible.type === 'ecran_reel' ? 'Critiquer l\'écran' : critique ? 'Critiquer la maquette' : 'Relire'}</button>
        </div>
        {message && <p class="encart e-rouge">{message}</p>}
        {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="lit" hauteur={80} flotte={false} /><span><strong>Watson relit</strong><br /><span class="doux">{critique ? 'Il regarde la maquette telle qu\'elle s\'affiche, et la confronte à la base.' : 'Il confronte le livrable à la base du projet.'}</span></span></div>}
        {revue === undefined && !message && <Attente />}
        {revue === null && !attente && <p class="doux">Pas encore relu. {critique ? 'Watson juge l\'usage avant l\'esthétique : parcours, hiérarchie, lisibilité, accessibilité, états, libellés, justesse métier.' : 'Watson vérifie la complétude, la précision, les angles morts et la cohérence avec la base.'}</p>}
        {revue && !attente && (
          <div class="pile" style="gap:12px">
            <div class="carte pile" style="gap:6px">
              <span class="petit doux">Relu le {date(revue.date)}{revue.question ? ` · « ${revue.question} »` : ''}{revue.avec_capture ? ' · sur la capture' : ''}</span>
              <strong>{revue.verdict}</strong>
              {revue.reponse && <span>{revue.reponse}</span>}
            </div>
            {revue.forces?.length > 0 && <div class="pile" style="gap:4px"><h2>Ce qui fonctionne</h2>{revue.forces.map((f, i) => <span key={i}><Check size={14} color="#16A34A" /> {f}</span>)}</div>}
            <div class="pile" style="gap:8px">
              <div class="ligne"><h2 class="espace">Retours</h2>{corriger && revue.points.length > 0 && <span class="petit doux">Coche ce que Watson doit corriger</span>}</div>
              {revue.points.length === 0 && <span class="doux">Aucun retour.</span>}
              {revue.points.map((p, i) => {
                const [g, c] = GRAVITE[p.gravite] || ['Retour', 'b-gris'];
                return (
                  <label key={i} class="retour-revue">
                    {corriger && <input type="checkbox" checked={choisis.includes(i)} onChange={() => setChoisis(choisis.includes(i) ? choisis.filter((x) => x !== i) : [...choisis, i])} />}
                    <span class="pile espace" style="gap:3px">
                      <span class="ligne" style="gap:8px"><span class={`badge ${c}`}>{g}</span>{p.ou && <span class="petit doux">{p.ou}</span>}</span>
                      <span>{p.constat}</span>
                      {p.pourquoi && <span class="petit doux">{p.pourquoi}</span>}
                      <span class="reco-revue">{p.recommandation}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {revue.quick_wins?.length > 0 && <div class="pile" style="gap:4px"><h2>Gains rapides</h2>{revue.quick_wins.map((q, i) => <span key={i}>{q}</span>)}</div>}
            {revue.a_confronter && <div class="encart e-indigo"><span><strong>À confronter{critique ? ' avec le designer' : ''}.</strong> {revue.a_confronter}</span></div>}
            {corriger && revue.points.length > 0 && (
              <button class="bouton bouton-watson" style="align-self:flex-start" disabled={!choisis.length}
                onClick={() => { corriger(consigneCorrection(revue, choisis)); fermer(); }}>
                <Sparkles size={14} /> Faire corriger par Watson ({choisis.length})</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function BoutonRevue({ projet, cible, titre, capturer, corriger, libelle, desactive }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button class="bouton" disabled={desactive} onClick={() => setOuvert(true)}><BookOpenCheck size={14} /> {libelle || (cible.type === 'maquette' ? 'Critique UX' : 'Relire')}</button>
      {ouvert && <Revue projet={projet} cible={cible} titre={titre} capturer={capturer} corriger={corriger} fermer={() => setOuvert(false)} />}
    </>
  );
}

// ----------------------------------------------------------------- mail au client

const MAILS = { compte_rendu: 'Envoi du compte rendu', proposition: 'Envoi de la proposition', livraison: 'Annonce d\'une version',
  retard: 'Annonce d\'un retard', recadrage: 'Recadrage de périmètre', reponse: 'Réponse à un retour', libre: 'Autre message' };

function ModaleMail({ projet, genre: g0, source, fermer }) {
  const [genre, setGenre] = useState(g0 || 'libre');
  const [contexte, setContexte] = useState('');
  const [mail, setMail] = useState(null);
  const [attente, setAttente] = useState(false);
  const [message, setMessage] = useState(null);
  const [copie, setCopie] = useState(false);
  const rediger = async () => {
    setAttente(true); setMessage(null);
    try { setMail(await appel(`/projets/${projet.id}/studio/mail`, { corps: { genre, contexte, source } })); } catch (e) { setMessage(e.message); }
    setAttente(false);
  };
  const ouvrir = async () => {
    const ok = await ouvrirLien(`mailto:?subject=${encodeURIComponent(mail.objet)}&body=${encodeURIComponent(mail.corps)}`);
    if (!ok) setMessage('La messagerie ne s\'ouvre pas d\'ici : copie le message.');
  };
  return (
    <div class="visionneuse" onClick={fermer}>
      <div class="modale-comite" style="width:min(820px,100%)" onClick={(e) => e.stopPropagation()}>
        <div class="ligne" style="flex-wrap:nowrap"><Mail size={18} /><strong class="espace">Écrire au client</strong><button class="bouton icone" onClick={fermer}><X size={16} /></button></div>
        <div class="ligne" style="gap:8px;align-items:flex-start">
          <label class="champ" style="flex:0 1 240px">Message<select value={genre} onChange={(e) => setGenre(e.target.value)}>{Object.entries(MAILS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label class="champ espace">Ce que tu veux dire, facultatif<textarea rows={2} value={contexte} placeholder="Par exemple : remercier, rappeler l'envoi des volumes avant vendredi" onInput={(e) => setContexte(e.target.value)} /></label>
        </div>
        <button class="bouton bouton-watson" style="align-self:flex-start" disabled={attente} onClick={rediger}><Sparkles size={14} /> {mail ? 'Réécrire' : 'Rédiger le brouillon'}</button>
        {message && <p class="encart e-rouge">{message}</p>}
        {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={70} flotte={false} /><span>Watson rédige le brouillon.</span></div>}
        {mail && !attente && (
          <div class="pile" style="gap:8px">
            <label class="champ">Objet<input value={mail.objet} onInput={(e) => setMail({ ...mail, objet: e.target.value })} /></label>
            <label class="champ">Message<textarea rows={14} value={mail.corps} onInput={(e) => setMail({ ...mail, corps: e.target.value })} /></label>
            {mail.a_verifier?.length > 0 && <div class="encart e-orange pile" style="gap:3px"><strong>À compléter avant d'envoyer</strong>{mail.a_verifier.map((x, i) => <span key={i}>{x}</span>)}</div>}
            <div class="ligne">
              <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(`${mail.objet}\n\n${mail.corps}`); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copié' : 'Copier'}</button>
              <button class="bouton principal-b" onClick={ouvrir}><Mail size={14} /> Ouvrir dans la messagerie</button>
              <span class="petit doux">Watson n'envoie rien : tu relis et tu envoies.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BoutonMail({ projet, genre, source, libelle = 'Écrire au client', desactive }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button class="bouton" disabled={desactive} onClick={() => setOuvert(true)}><Mail size={14} /> {libelle}</button>
      {ouvert && <ModaleMail projet={projet} genre={genre} source={source} fermer={() => setOuvert(false)} />}
    </>
  );
}

// ----------------------------------------------------------------- fiche secteur

export function Secteur({ projet, etat }) {
  const base = `/projets/${projet.id}/studio/secteur`;
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [attente, setAttente] = useState(false);
  const [demande, setDemande] = useState('');
  const [edition, setEdition] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  useEffect(() => { appel(base).then(setD).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const faire = async (chemin, corps, longue = false) => {
    setErreur(null); if (longue) setAttente(true);
    try { setD(await appel(`${base}${chemin}`, { corps })); return true; } catch (e) { setErreur(e.message); return false; } finally { setAttente(false); }
  };
  const p = d.proposition;
  return (
    <>
      <Entete titre="Fiche secteur" description="Le métier du client expliqué avant de concevoir : vocabulaire, processus, réglementation, ce que les logiciels du secteur font tous, et les pièges. Watson la rédige depuis la base ; une fois gardée, elle nourrit le cahier des charges.">
        {d.fiche && !edition && <button class="bouton" onClick={() => setEdition(d.fiche)}>Modifier</button>}
      </Entete>
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La fiche secteur" />
      {erreur && <p class="encart e-rouge">{erreur}</p>}
      <div class="carte pile" style="gap:8px">
        <span class="doux">{d.fiche ? 'Watson peut la compléter ou la reprendre.' : 'Pas encore de fiche.'} Il n'a pas accès au web : ce qui dépend d'une source à jour est marqué à confirmer.</span>
        <input class="saisie" placeholder="Une consigne, facultative : « insister sur la réglementation des marchandises dangereuses »" value={demande} onInput={(e) => setDemande(e.target.value)} />
        <div class="ligne">
          <button class="bouton bouton-watson" disabled={attente || !claude?.connecte} onClick={() => faire('/proposer', { complete: false, demande }, true)}><Sparkles size={14} /> Fiche rapide</button>
          <button class="bouton bouton-watson" disabled={attente || !claude?.connecte} onClick={() => faire('/proposer', { complete: true, demande }, true)}><Landmark size={14} /> Analyse complète</button>
        </div>
      </div>
      {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="reflechit" hauteur={80} flotte={false} /><span><strong>Watson rédige la fiche</strong><br /><span class="doux">Une à deux minutes.</span></span></div>}
      {p && !attente && (
        <section class="carte pile proposition-cadre" style="gap:10px">
          <div class="ligne"><strong class="espace">Proposition de Watson · {p.domaine}{p.complete ? ' · analyse complète' : ''}</strong>
            <button class="bouton principal-b" onClick={() => faire('/garder', {})}><Check size={14} /> Garder</button>
            <button class="bouton" onClick={() => faire('/ecarter', {})}>Écarter</button></div>
          {p.a_confirmer?.length > 0 && <div class="encart e-orange pile" style="gap:3px"><strong>À confirmer</strong>{p.a_confirmer.map((x, i) => <span key={i}>{x}</span>)}</div>}
          <Markdown texte={p.texte} />
        </section>
      )}
      {edition !== null && (
        <div class="carte pile" style="gap:8px">
          <textarea class="saisie" rows={24} style="padding:12px;font-family:inherit" value={edition} onInput={(e) => setEdition(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={async () => { if (await faire('/garder', { texte: edition })) setEdition(null); }}><Check size={14} /> Enregistrer</button>
            <button class="bouton" onClick={() => setEdition(null)}>Annuler</button></div>
        </div>
      )}
      {d.fiche && edition === null && <section class="carte"><Markdown texte={d.fiche} /></section>}
      {!d.fiche && !p && !attente && <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={150} /><span>Aucune fiche pour l'instant.</span></div>}
    </>
  );
}
