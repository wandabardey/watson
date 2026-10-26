import { useEffect, useState } from 'preact/hooks';
import { ArrowUp, FilePlus2, FolderGit2, Plus, Settings } from 'lucide-preact';
import { appel } from '../api.js';
import { Creer, Ouvrir } from './projets.jsx';
import { DEVISE, Watson } from './commun.jsx';
import logo from '../images/logo.png';

const TEINTES = [['#EFEDFF', '#4B3BD6'], ['#FFF3E0', '#9A5A00'], ['#E8F6EE', '#1E7A3C'], ['#FDECEF', '#A3263F'], ['#E7F1FD', '#1D5FA8'], ['#F3ECFB', '#7A2FB0']];

export function teinte(texte) {
  let h = 0;
  for (const c of texte || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

export function initiales(nom) {
  const mots = (nom || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] || '?') + (mots[1]?.[0] || mots[0]?.[1] || '')).toUpperCase();
}

export function Tuile({ nom, taille = 44 }) {
  const [fond, texte] = teinte(nom);
  return <span class="tuile" style={`width:${taille}px;height:${taille}px;background:${fond};color:${texte};font-size:${Math.round(taille / 3.1)}px`}>{initiales(nom)}</span>;
}

function quand(horodatage) {
  if (!horodatage) return '';
  const j = Math.floor((Date.now() / 1000 - horodatage) / 86400);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} jours`;
  if (j < 31) return `il y a ${Math.round(j / 7)} semaine${j >= 14 ? 's' : ''}`;
  return `il y a ${Math.round(j / 30)} mois`;
}

function liste(mots) {
  return mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

// Ce que Watson dit en arrivant : ce qui a bougé depuis la dernière visite, et ce qui attend une décision.
function Resume({ projets }) {
  const bouges = projets.filter((p) => p.nouveautes?.total);
  const questions = projets.flatMap((p) => (p.questions || []).map((q) => ({ ...q, projet: p.nom })));
  if (!projets.length) return <p class="bulle">Je suis Watson. Je garde la mémoire de tes projets : les règles, les décisions, d'où elles viennent. Commence par créer un projet, ou ouvre un dépôt existant.</p>;
  if (!bouges.length && !questions.length) return <p class="bulle">Tout est à jour. Pose-moi une question, ou donne-moi un compte rendu à lire.</p>;
  return (
    <p class="bulle">
      {bouges.length > 0 && <>Depuis ta dernière visite, {bouges.map((p, i) => (
        <span key={p.id}>{i > 0 && (i === bouges.length - 1 ? ' et ' : ', ')}
          <b>{p.nouveautes.auteurs.length ? `${liste(p.nouveautes.auteurs)} ${p.nouveautes.auteurs.length > 1 ? 'ont' : 'a'} enregistré ${p.nouveautes.total} changement${p.nouveautes.total > 1 ? 's' : ''}` : `${p.nouveautes.total} changement${p.nouveautes.total > 1 ? 's' : ''}`}</b> sur {p.nom}</span>
      ))}{questions.length ? ', et ' : '.'}</>}
      {questions.length > 0 && <><b>{questions.length} question{questions.length > 1 ? 's' : ''} {bouges.length ? 't\'attend' : 'attend'}{questions.length > 1 ? 'ent' : ''}{bouges.length ? '' : ' ta décision'}</b>
        {questions.length <= 2 ? ` : ${liste(questions.map((q) => `« ${q.question} »`))}` : ''}.</>}
    </p>
  );
}

const ACCROCHES = ["On s'y remet ?", "Qu'est-ce qu'on éclaircit ?", 'Je t\'écoute.', 'Par quoi on commence ?'];

export function Accueil({ etat, ouvrir, parametres, deconnecte }) {
  const [donnees, setDonnees] = useState(null);
  const [mode, setMode] = useState(null);
  const [question, setQuestion] = useState('');
  const [cible, setCible] = useState(null);
  const [synchro, setSynchro] = useState(false);
  const [message, setMessage] = useState(null);
  const compte = etat.github.compte;
  const prenom = (compte?.nom || compte?.login || '').split(' ')[0];
  const heure = new Date().getHours();
  const accroche = ACCROCHES[new Date().getDate() % ACCROCHES.length];

  const charger = () => appel('/accueil').then((d) => { setDonnees(d); return d; }).catch((e) => setMessage(e.message));
  useEffect(() => {
    charger().then(async (d) => {
      const presents = (d?.projets || []).filter((p) => !p.absent);
      if (!presents.length) return;
      setSynchro(true);
      for (const p of presents) await appel(`/projets/${p.id}/synchroniser`, { corps: {} }).catch(() => {});
      setSynchro(false);
      charger();
    });
  }, []);
  const projets = donnees?.projets || [];
  const choisi = projets.find((p) => p.id === cible) || projets.find((p) => !p.absent);
  const ouvert = (p) => { setMode(null); charger(); ouvrir(p); };
  const envoyer = (e) => {
    e.preventDefault();
    if (choisi && question.trim()) ouvrir(choisi, 'demander', question.trim());
  };

  return (
    <div class="accueil">
      <nav class="rail" aria-label="Projets">
        <button class="rail-logo" title="Accueil" aria-label="Accueil"><img src={logo} alt="Watson" /></button>
        <span class="rail-sep" />
        {projets.map((p) => (
          <button key={p.id} class="rail-projet" title={p.nom} onClick={() => !p.absent && ouvrir(p)}><Tuile nom={p.nom} taille={42} /></button>
        ))}
        <button class="rail-projet rail-plus" title="Créer un projet" onClick={() => setMode('creer')}><Plus size={20} /></button>
        <span class="espace" />
        <button class="rail-icone" title="Paramètres" aria-label="Paramètres" onClick={parametres}><Settings size={20} /></button>
        {compte?.avatar ? <img class="avatar" src={compte.avatar} alt={compte.nom} title={compte.nom} /> : <span class="avatar" />}
      </nav>

      <main class="accueil-centre">
        <Watson humeur="salue" buste hauteur={150} />
        <h1 class="salut">{heure >= 18 ? 'Bonsoir' : 'Bonjour'} {prenom}. <span>{projets.length ? accroche : 'Enchanté.'}</span></h1>
        {donnees ? <Resume projets={projets} /> : <p class="bulle">&nbsp;</p>}

        {projets.some((p) => !p.absent) && (
          <form class="saisie-accueil" onSubmit={envoyer}>
            <textarea rows={2} placeholder="Pose-moi une question sur tes projets…" value={question} onInput={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) envoyer(e); }} />
            <div class="ligne">
              <button type="button" class="bouton" onClick={() => choisi && ouvrir(choisi, 'alimenter')}><FilePlus2 size={16} /> Me donner un document à lire</button>
              <select class="saisie" value={choisi?.id} onChange={(e) => setCible(e.target.value)} aria-label="Projet">
                {projets.filter((p) => !p.absent).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
              <span class="espace" />
              <button class="envoi" aria-label="Envoyer" disabled={!question.trim()}><ArrowUp size={18} /></button>
            </div>
          </form>
        )}

        <div class="ligne entete-projets">
          <h3 class="espace">Tes projets {synchro && <span class="doux petit" style="text-transform:none;letter-spacing:0;font-weight:500">· mise à jour depuis GitHub…</span>}</h3>
          <button class="lien" onClick={() => setMode('ouvrir')}><FolderGit2 size={15} /> Ouvrir un dépôt existant</button>
        </div>
        {mode === 'ouvrir' && <Ouvrir fermer={() => setMode(null)} ouvert={ouvert} />}
        {mode === 'creer' && <Creer fermer={() => setMode(null)} ouvert={ouvert} compte={compte} reconnecter={deconnecte} />}
        {message && <p class="encart e-rouge">{message}</p>}
        <div class="grille-projets">
          {projets.map((p) => (
            <button key={p.id} class="carte-projet" onClick={() => !p.absent && ouvrir(p)}>
              <div class="ligne" style="gap:12px;flex-wrap:nowrap"><Tuile nom={p.nom} taille={40} />
                <span class="pile" style="gap:0;min-width:0"><strong class="titre-projet">{p.nom}</strong><span class="petit doux tronque">{p.depot}</span></span></div>
              {p.description && <span class="doux tronque2">{p.description}</span>}
              {p.derniere && <span class="petit doux">Modifié {quand(p.derniere.date)} par {p.derniere.auteur}</span>}
              <span class="ligne" style="gap:6px;margin-top:auto">
                {p.absent ? <span class="badge b-rouge">copie absente</span> : <>
                  <span class="badge b-gris">{p.regles} règle{p.regles > 1 ? 's' : ''}</span>
                  {p.questions?.length > 0 && <span class="badge b-ambre">{p.questions.length} question{p.questions.length > 1 ? 's' : ''}</span>}
                  {p.nouveautes?.total > 0 && <span class="badge b-indigo">{p.nouveautes.total} nouveauté{p.nouveautes.total > 1 ? 's' : ''}</span>}
                  {p.regles === 0 && p.entites === 0 && <span class="badge b-violet">à alimenter</span>}
                </>}
              </span>
            </button>
          ))}
          <button class="carte-projet carte-nouveau" onClick={() => setMode('creer')}><Plus size={20} /> Créer un projet</button>
        </div>
        <span class="petit doux devise-pied">{DEVISE} <span>Watson {etat.version}</span></span>
      </main>
    </div>
  );
}
