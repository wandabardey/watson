import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  AppWindow, ArrowLeftRight, BookOpen, ChevronsUpDown, Database, Route, FilePlus2, CircleHelp, FlaskConical, GitBranch, GitPullRequestArrow, LayoutDashboard, Library,
  MonitorPlay, Network, Palette, FileText, Frame, Presentation, Users, RefreshCw, Scale, Settings, Sparkles, ChevronRight, MessagesSquare
} from 'lucide-preact';
import { appel, attendreMoteur, lancerMiseAJour, suivreMiseAJour, verifierMiseAJour } from './api.js';
import { ConnexionGitHub } from './ecrans/connexion.jsx';
import { Accueil, Tuile } from './ecrans/accueil.jsx';
import { DEVISE, Watson } from './ecrans/commun.jsx';
import logo from './images/logo.png';
import { AccueilProjet } from './ecrans/projet.jsx';
import { Referentiels } from './ecrans/referentiels.jsx';
import { Ecrans } from './ecrans/ecrans.jsx';
import { Regles } from './ecrans/regles.jsx';
import { Versions } from './ecrans/versions.jsx';
import { Scenarios } from './ecrans/scenarios.jsx';
import { Cahier } from './ecrans/cahier.jsx';
import { Sujets } from './ecrans/sujets.jsx';
import { Comite } from './ecrans/comite.jsx';
import { Moodboard } from './ecrans/moodboard.jsx';
import { Maquettes } from './ecrans/maquettes.jsx';
import { Proposition } from './ecrans/proposition.jsx';
import { Parametres } from './ecrans/parametres.jsx';
import './styles.css';

// Catégories repliables de la barre latérale. [clé, libellé, icône, bientôt]
const GROUPES = [
  ['avant', 'Avant-projet', [['cahier', 'Cahier des charges', FileText], ['moodboard', 'Moodboard', Palette], ['maquettes', 'Maquettes', Frame],
    ['proposition', 'Proposition', Presentation]]],
  ['metier', 'Connaissance métier', [['referentiels', 'Référentiels', Database], ['scenarios', 'Scénarios', Route], ['ecrans', 'Écrans', AppWindow],
    ['regles', 'Règles', Scale], ['flux', 'Flux externes', ArrowLeftRight, true]]],
  ['gestion', 'Gestion projet', [['ateliers', 'Ateliers', MessagesSquare, true], ['comite', 'Comité d\'experts', Users], ['evolutions', 'Évolutions', GitPullRequestArrow, true],
    ['versions', 'Versions', GitBranch], ['recette', 'Recette et TNR', FlaskConical, true], ['documentation', 'Documentation', BookOpen, true]]],
  ['produit', 'Produit', [['apercu', 'App en direct', MonitorPlay, true], ['design', 'Design system', Palette, true]]],
];

const ECRANS = { projet: AccueilProjet, synthese: AccueilProjet, demander: AccueilProjet, alimenter: AccueilProjet, sujets: Sujets, comite: Comite,
  cahier: Cahier, moodboard: Moodboard, maquettes: Maquettes, proposition: Proposition, referentiels: Referentiels, catalogue: Referentiels,
  workflow: Referentiels, ecrans: Ecrans, scenarios: Scenarios, regles: Regles, versions: Versions };

const lireOuverts = () => { try { return JSON.parse(localStorage.getItem('watson.menu.ouverts') || '["avant","metier"]'); } catch { return ['avant', 'metier']; } };

function Lateral({ projet, ecran, choisir, quitter, compte, parametres, changerProjet }) {
  const [projets, setProjets] = useState([]);
  const [liste, setListe] = useState(false);
  const [ouverts, setOuverts] = useState(lireOuverts);
  const [questions, setQuestions] = useState(null);
  useEffect(() => { appel('/projets').then((d) => setProjets(d.projets.filter((p) => !p.absent))).catch(() => {}); }, []);
  useEffect(() => { appel(`/projets/${projet.id}/compteurs`).then((d) => setQuestions(d.questions_ouvertes)).catch(() => {}); }, [ecran]);
  const groupeCourant = GROUPES.find(([, , items]) => items.some(([cle]) => cle === ecran))?.[0];
  const basculer = (g) => {
    const n = ouverts.includes(g) ? ouverts.filter((x) => x !== g) : [...ouverts, g];
    setOuverts(n);
    try { localStorage.setItem('watson.menu.ouverts', JSON.stringify(n)); } catch { /* sans importance */ }
  };
  return (
    <nav class="panneau lateral" aria-label="Navigation du projet">
      <button class="marque" onClick={quitter} title="Retour à l'accueil">
        <img class="marque-logo" src={logo} alt="" />
        <strong class="marque-nom">Watson</strong>
        <span class="petit doux" style="margin-left:auto">Accueil</span>
      </button>
      <div class="bloc-projet-cadre">
        <button class="bloc-projet" onClick={() => setListe(!liste)} title="Changer de projet" aria-expanded={liste}>
          <Tuile nom={projet.nom} taille={34} />
          <span style="display:flex;flex-direction:column;min-width:0;flex:1">
            <strong style="font-size:14px" class="tronque">{projet.nom}</strong>
            <span class="petit doux tronque">{projet.depot}</span>
          </span>
          <ChevronsUpDown size={15} color="#A1A1AA" />
        </button>
        {liste && (
          <div class="liste-projets">
            {projets.map((p) => (
              <button key={p.id} class={`menu ${p.id === projet.id ? 'actif' : ''}`} onClick={() => { setListe(false); if (p.id !== projet.id) changerProjet(p); }}>
                <Tuile nom={p.nom} taille={24} /> <span class="tronque">{p.nom}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="menu-defilant">
        <button class={`menu ${['projet', 'synthese', 'demander', 'alimenter'].includes(ecran) ? 'actif' : ''}`} onClick={() => choisir('projet')}>
          <LayoutDashboard size={18} strokeWidth={1.8} /> Accueil du projet
        </button>
        <button class={`menu ${ecran === 'sujets' ? 'actif' : ''}`} onClick={() => choisir('sujets')}>
          <CircleHelp size={18} strokeWidth={1.8} /> Questions ouvertes
          {questions > 0 && <span class="compte b-ambre">{questions}</span>}
        </button>
        {GROUPES.map(([g, titre, items]) => {
          const ouvert = ouverts.includes(g) || g === groupeCourant;
          return (
            <div key={g} class="groupe-menu">
              <button class="section-menu" aria-expanded={ouvert} onClick={() => basculer(g)}>
                <ChevronRight size={14} class={`chevron ${ouvert ? 'ouvert' : ''}`} /> {titre}
              </button>
              {ouvert && items.map(([cle, libelle, Icone, bientot]) => (
                <button key={cle} class={`menu ${ecran === cle ? 'actif' : ''}`} disabled={bientot} onClick={() => choisir(cle)} title={bientot ? 'Dans une prochaine version' : ''}>
                  <Icone size={18} strokeWidth={1.8} /> {libelle}
                  {bientot && <span class="compte b-gris">bientôt</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <button class="menu petit-menu" disabled title="Dans une prochaine version"><Settings size={16} strokeWidth={1.8} /> Administration du projet <span class="compte b-gris">bientôt</span></button>
      {compte && (
        <div class="profil">
          {compte.avatar ? <img class="avatar" src={compte.avatar} alt="" /> : <span class="avatar" />}
          <span style="display:flex;flex-direction:column;flex:1;min-width:0"><span style="font-weight:500">{compte.nom}</span><span class="petit doux">@{compte.login}</span></span>
          <button class="bouton icone" title="Paramètres" aria-label="Paramètres" onClick={parametres}><Settings size={16} /></button>
        </div>
      )}
    </nav>
  );
}

function BandeauMiseAJour({ maj }) {
  const [etat, setEtat] = useState(null);
  useEffect(() => suivreMiseAJour(setEtat), []);
  if (!maj) return null;
  const installer = () => lancerMiseAJour(maj);
  return (
    <div class="bandeau-maj">
      <RefreshCw size={18} />
      <span class="espace">Watson {maj.version} est disponible{maj.body ? ` : ${maj.body.split('\n')[0]}` : '.'}</span>
      {etat === null || String(etat).startsWith('Échec') ? <>{etat && <span>{etat}</span>}<button class="bouton" onClick={installer}>Installer et redémarrer</button></>
        : <span>{typeof etat === 'number' ? `Téléchargement… ${etat} %` : etat} <span class="doux">· tu peux continuer à travailler</span></span>}
    </div>
  );
}

function App() {
  const [erreur, setErreur] = useState(null);
  const [etat, setEtat] = useState(null);
  const [projet, setProjet] = useState(null);
  const [ecran, setEcran] = useState('projet');
  const [maj, setMaj] = useState(null);
  const [synchro, setSynchro] = useState(null);
  const [parametres, setParametres] = useState(false);

  const charger = async () => {
    try {
      await attendreMoteur();
      setEtat(await appel('/etat'));
    } catch (e) { setErreur(e.message || String(e)); }
  };
  useEffect(() => { charger(); verifierMiseAJour().then(setMaj); }, []);

  const [questionInitiale, setQuestionInitiale] = useState(null);
  const ouvrir = async (p, ecranInitial = 'projet', question = null) => {
    setProjet(p); setEcran(ecranInitial); setQuestionInitiale(question); setSynchro({ etat: 'en_cours' });
    try { setSynchro(await appel(`/projets/${p.id}/synchroniser`, { corps: {} })); } catch (e) { setSynchro({ erreur: e.message }); }
    appel(`/projets/${p.id}/visite`, { corps: {} }).catch(() => {});
  };

  if (erreur) return <div class="coquille"><div class="panneau principal"><Watson humeur="reflechit" hauteur={180} /><h1>Watson ne démarre pas</h1><pre class="encart e-rouge" style="white-space:pre-wrap;font-size:12px">{erreur}</pre><p class="doux">Envoie ce message à la personne qui maintient Watson.</p></div></div>;
  if (!etat) return <div class="demarrage"><img src={logo} alt="" /><span class="doux">Watson arrive…</span><span class="devise">{DEVISE}</span></div>;
  if (!etat.github.connecte) return <ConnexionGitHub version={etat.version} connecte={charger} />;
  if (parametres) {
    return (
      <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
        <BandeauMiseAJour maj={maj} />
        <Parametres etat={etat} retour={() => { setParametres(false); charger(); }} deconnecte={() => { setParametres(false); setProjet(null); charger(); }} signalerMaj={setMaj} />
      </div>
    );
  }
  if (!projet) {
    return (
      <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
        <BandeauMiseAJour maj={maj} />
        <Accueil etat={etat} ouvrir={ouvrir} deconnecte={charger} parametres={() => setParametres(true)} />
      </div>
    );
  }
  const Ecran = ECRANS[ecran];
  return (
    <div class="coquille">
      <Lateral key={projet.id} projet={projet} ecran={ecran} choisir={(e) => { setQuestionInitiale(null); setEcran(e); }} quitter={() => setProjet(null)} compte={etat.github.compte} parametres={() => setParametres(true)} changerProjet={(p) => ouvrir(p)} />
      <main class="panneau principal">
        <BandeauMiseAJour maj={maj} />
        <div class="ligne petit doux">
          <span>{projet.nom}</span><span class="espace" />
          {synchro?.etat === 'en_cours' && <span>Synchronisation avec GitHub…</span>}
          {synchro?.erreur && <span class="badge b-rouge" title={synchro.erreur}>Synchronisation impossible</span>}
          {synchro && !synchro.erreur && synchro.etat !== 'en_cours' && <span class="badge b-vert">À jour avec GitHub</span>}
          <button class="bouton" style="min-height:30px" onClick={() => ouvrir(projet)}><RefreshCw size={14} /> Synchroniser</button>
        </div>
        <Ecran key={`${projet.id}-${ECRANS[ecran] === AccueilProjet ? 'projet' : ecran}-${synchro?.etat === 'en_cours' ? 'a' : 'b'}`} projet={projet} etat={etat} aller={setEcran} questionInitiale={questionInitiale} zone={ecran} />
      </main>
    </div>
  );
}

// Sur Mac, pas de barre de titre : les boutons de fenêtre flottent sur l'application, une bande invisible en haut sert à la déplacer.
if (navigator.userAgent.includes('Mac')) document.documentElement.classList.add('mac');
render(<><div class="barre-titre" data-tauri-drag-region /><App /></>, document.getElementById('app'));
