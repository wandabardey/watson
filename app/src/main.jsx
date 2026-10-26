import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { appel, attendreMoteur, lancerMiseAJour, suivreMiseAJour, verifierMiseAJour } from './api.js';
import { ConnexionGitHub } from './ecrans/connexion.jsx';
import { Accueil, Tuile } from './ecrans/accueil.jsx';
import { DEVISE, Watson } from './ecrans/commun.jsx';
import { AccueilProjet, EcranAlimenter } from './ecrans/projet.jsx';
import { BarreHaut, Rail, SousMenu, categorieDe, libelleDe } from './coquille.jsx';
import { PanneauWatson } from './ecrans/watson.jsx';
import { definirContexte, ouvrirWatson, surOuverture } from './contexte.js';
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
import { Administration } from './ecrans/administration.jsx';
import { Ateliers } from './ecrans/ateliers.jsx';
import { Secteur } from './ecrans/studio.jsx';
import { Evolutions } from './ecrans/evolutions.jsx';
import { Recette } from './ecrans/recette.jsx';
import { Documentation } from './ecrans/documentation.jsx';
import { Flux } from './ecrans/flux.jsx';
import { Crud } from './ecrans/crud.jsx';
import { Design } from './ecrans/design.jsx';
import { Avancement } from './ecrans/avancement.jsx';
import { Code } from './ecrans/code.jsx';
import { Direct } from './ecrans/direct.jsx';
import { Specifications } from './ecrans/specifications.jsx';
import '@fontsource-variable/inter';
import './styles.css';

const ECRANS = { projet: AccueilProjet, synthese: AccueilProjet, demander: AccueilProjet, alimenter: EcranAlimenter, sujets: Sujets, comite: Comite,
  cahier: Cahier, moodboard: Moodboard, maquettes: Maquettes, proposition: Proposition, referentiels: Referentiels, catalogue: Referentiels,
  workflow: Referentiels, ecrans: Ecrans, scenarios: Scenarios, regles: Regles, versions: Versions, administration: Administration, ateliers: Ateliers, secteur: Secteur, evolutions: Evolutions, recette: Recette, documentation: Documentation, flux: Flux, crud: Crud, specifications: Specifications, design: Design, avancement: Avancement, code: Code, direct: Direct };

const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const garder = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans importance */ } };

// Thème : clair, sombre, ou celui du système tant que la personne n'a pas choisi.
function appliquerTheme(t) { document.documentElement.dataset.theme = t; }
const themeInitial = () => lire('watson.theme', null) || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair');
appliquerTheme(themeInitial());

function BandeauMiseAJour({ maj }) {
  const [etat, setEtat] = useState(null);
  useEffect(() => suivreMiseAJour(setEtat), []);
  if (!maj) return null;
  const installer = () => lancerMiseAJour(maj);
  return (
    <div class="bandeau-maj">
      <Watson humeur="fusee" hauteur={34} flotte={false} />
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

  if (erreur) return <div class="coquille"><div class="panneau principal"><Watson humeur="question" hauteur={180} /><h1>Watson ne démarre pas</h1><pre class="encart e-rouge" style="white-space:pre-wrap;font-size:12px">{erreur}</pre><p class="doux">Envoie ce message à la personne qui maintient Watson.</p></div></div>;
  if (!etat) return <div class="demarrage"><Watson humeur="salue" hauteur={150} /><span class="doux">Watson arrive…</span><span class="devise">{DEVISE}</span></div>;
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
      <div style="display:flex;flex-direction:column">
        <BandeauMiseAJour maj={maj} />
        <Accueil etat={etat} ouvrir={ouvrir} deconnecte={charger} parametres={() => setParametres(true)} />
      </div>
    );
  }
  return <Espace projet={projet} etat={etat} ecran={ecran} setEcran={setEcran} questionInitiale={questionInitiale} setQuestionInitiale={setQuestionInitiale}
    maj={maj} synchro={synchro} synchroniser={() => ouvrir(projet, ecran)} quitter={() => setProjet(null)} parametres={() => setParametres(true)} changerProjet={(p) => ouvrir(p)} />;
}

function Espace({ projet, etat, ecran, setEcran, questionInitiale, setQuestionInitiale, maj, synchro, synchroniser, quitter, parametres, changerProjet }) {
  const [categorie, setCategorie] = useState(categorieDe(ecran));
  const [menu, setMenu] = useState(lire('watson.menu', '1') === '1');
  const [watson, setWatson] = useState(lire('watson.panneau', '0') === '1');
  const [theme, setTheme] = useState(themeInitial());
  const [compteurs, setCompteurs] = useState({});
  const [recherche, setRecherche] = useState(0);
  const aller = (e) => {
    if (e === 'watson' || e === 'demander') { setWatson(true); garder('watson.panneau', '1'); return; }
    setQuestionInitiale(null); setEcran(e); setCategorie(categorieDe(e));
  };
  useEffect(() => { definirContexte({ zone: ecran, libelle: libelleDe(ecran) || 'Vue d\'ensemble', element: null }); }, [ecran]);
  useEffect(() => { appel(`/projets/${projet.id}/compteurs`).then(setCompteurs).catch(() => {}); }, [ecran, projet.id, synchro?.etat]);
  const basculerWatson = (v) => { const n = typeof v === 'boolean' ? v : !watson; setWatson(n); garder('watson.panneau', n ? '1' : '0'); };
  useEffect(() => surOuverture(() => basculerWatson(true)), [watson]);
  useEffect(() => {
    const touche = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'j') { e.preventDefault(); basculerWatson(); }
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setMenu(true); setRecherche((n) => n + 1); }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [watson]);
  useEffect(() => {
    if (ecran === 'demander') setEcran('projet');
    if (questionInitiale) { basculerWatson(true); setTimeout(() => ouvrirWatson({ texte: questionInitiale, envoyer: true }), 300); setQuestionInitiale(null); }
  }, [questionInitiale]);
  const choisirCategorie = (k) => {
    if (k === categorie && menu) { setMenu(false); garder('watson.menu', '0'); return; }
    setCategorie(k); setMenu(true); garder('watson.menu', '1');
  };
  const basculerTheme = () => { const n = theme === 'sombre' ? 'clair' : 'sombre'; setTheme(n); appliquerTheme(n); garder('watson.theme', n); };
  const Ecran = ECRANS[ecran] || AccueilProjet;
  return (
    <div class={`espace-projet ${menu ? 'avec-menu' : ''} ${watson ? 'avec-watson' : ''}`}>
      <Rail categorie={categorie} choisirCategorie={choisirCategorie} compte={etat.github.compte} theme={theme} basculerTheme={basculerTheme}
        parametres={parametres} quitter={quitter} questions={compteurs.questions} />
      {menu && <SousMenu key={projet.id} projet={projet} categorie={categorie} ecran={ecran} choisir={aller} changerProjet={changerProjet} compteurs={compteurs}
        ouvrirWatson={() => basculerWatson(true)} recherche={recherche} />}
      <div class="colonne">
        <BarreHaut projet={projet} ecran={ecran} aller={aller} basculerMenu={() => { setMenu(!menu); garder('watson.menu', menu ? '0' : '1'); }} menuOuvert={menu}
          synchro={synchro} synchroniser={synchroniser} watsonOuvert={watson} basculerWatson={() => basculerWatson()} ouvrirWatson={() => basculerWatson(true)} />
        <main class="contenu">
          <BandeauMiseAJour maj={maj} />
          <Ecran key={`${projet.id}-${ecran}-${synchro?.etat === 'en_cours' ? 'a' : 'b'}`} projet={projet} etat={etat} aller={aller} zone={ecran} />
        </main>
      </div>
      <PanneauWatson projet={projet} etat={etat} ouvert={watson} fermer={() => basculerWatson(false)} aller={aller} />
    </div>
  );
}

// Sur Mac, pas de barre de titre : les boutons de fenêtre flottent sur l'application, une bande invisible en haut sert à la déplacer.
if (navigator.userAgent.includes('Mac')) document.documentElement.classList.add('mac');
render(<><div class="barre-titre" data-tauri-drag-region /><App /></>, document.getElementById('app'));
