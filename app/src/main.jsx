import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  ArrowLeftRight, BookOpen, FilePlus2, CircleHelp, FlaskConical, GitBranch, GitPullRequestArrow, LayoutDashboard, Library,
  MonitorPlay, Network, Palette, RefreshCw, Scale, Settings, Sparkles, Workflow as IconeWorkflow
} from 'lucide-preact';
import { appel, attendreMoteur, installerMiseAJour, verifierMiseAJour } from './api.js';
import { ConnexionGitHub } from './ecrans/connexion.jsx';
import { MesProjets } from './ecrans/projets.jsx';
import { Synthese } from './ecrans/synthese.jsx';
import { Catalogue } from './ecrans/catalogue.jsx';
import { Workflow } from './ecrans/workflow.jsx';
import { Regles } from './ecrans/regles.jsx';
import { Versions } from './ecrans/versions.jsx';
import { Demander } from './ecrans/demander.jsx';
import { Alimenter } from './ecrans/alimenter.jsx';
import './styles.css';

const MENU = [
  ['Connaissance métier'],
  ['synthese', 'Synthèse', LayoutDashboard], ['catalogue', 'Catalogue', Library], ['workflow', 'Workflow', IconeWorkflow],
  ['regles', 'Règles', Scale], ['flux', 'Flux externes', ArrowLeftRight, true], ['sujets', 'Sujets en attente', CircleHelp, true],
  ['Gestion projet'],
  ['evolutions', 'Évolutions', GitPullRequestArrow, true], ['versions', 'Versions', GitBranch],
  ['recette', 'Recette et TNR', FlaskConical, true], ['documentation', 'Documentation', BookOpen, true],
  ['Produit'],
  ['apercu', 'App en direct', MonitorPlay, true], ['design', 'Design system', Palette, true],
  ['Projet'],
  ['administration', 'Administration', Settings, true]
];

const ECRANS = { synthese: Synthese, catalogue: Catalogue, workflow: Workflow, regles: Regles, versions: Versions, demander: Demander, alimenter: Alimenter };

function Lateral({ projet, ecran, choisir, quitter, compte }) {
  return (
    <nav class="panneau lateral" aria-label="Navigation du projet">
      <button class="marque" onClick={quitter} title="Mes projets">
        <span class="logo"><Network size={18} /></span>
        <span style="display:flex;flex-direction:column;min-width:0">
          <strong style="font-size:15px">{projet.nom}</strong>
          <span class="petit doux" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{projet.depot}</span>
        </span>
      </button>
      <button class={`menu question ${ecran === 'demander' ? 'actif' : ''}`} onClick={() => choisir('demander')}>
        <Sparkles size={17} /> Poser une question
      </button>
      <button class={`menu ${ecran === 'alimenter' ? 'actif' : ''}`} onClick={() => choisir('alimenter')}>
        <FilePlus2 size={18} strokeWidth={1.8} /> Alimenter
      </button>
      {MENU.map(([cle, libelle, Icone, bientot]) => (Icone ? (
        <button key={cle} class={`menu ${ecran === cle ? 'actif' : ''}`} disabled={bientot} onClick={() => choisir(cle)} title={bientot ? 'Dans une prochaine version' : ''}>
          <Icone size={18} strokeWidth={1.8} /> {libelle}
          {bientot && <span class="compte b-gris">bientôt</span>}
        </button>
      ) : <span key={cle} class="section">{cle}</span>))}
      <span class="espace" />
      {compte && (
        <div class="profil">
          {compte.avatar ? <img class="avatar" src={compte.avatar} alt="" /> : <span class="avatar" />}
          <span style="display:flex;flex-direction:column"><span style="font-weight:500">{compte.nom}</span><span class="petit doux">@{compte.login}</span></span>
        </div>
      )}
    </nav>
  );
}

function BandeauMiseAJour({ maj }) {
  const [etat, setEtat] = useState(null);
  if (!maj) return null;
  const installer = async () => {
    setEtat(0);
    try { await installerMiseAJour(maj, (p) => setEtat(p)); } catch (e) { setEtat(`Échec : ${e.message || e}`); }
  };
  return (
    <div class="bandeau-maj">
      <RefreshCw size={18} />
      <span class="espace">Watson {maj.version} est disponible{maj.body ? ` : ${maj.body.split('\n')[0]}` : '.'}</span>
      {etat === null ? <button class="bouton" onClick={installer}>Installer et redémarrer</button>
        : <span>{typeof etat === 'number' ? `Téléchargement… ${etat}%` : etat}</span>}
    </div>
  );
}

function App() {
  const [erreur, setErreur] = useState(null);
  const [etat, setEtat] = useState(null);
  const [projet, setProjet] = useState(null);
  const [ecran, setEcran] = useState('synthese');
  const [maj, setMaj] = useState(null);
  const [synchro, setSynchro] = useState(null);

  const charger = async () => {
    try {
      await attendreMoteur();
      setEtat(await appel('/etat'));
    } catch (e) { setErreur(e.message || String(e)); }
  };
  useEffect(() => { charger(); verifierMiseAJour().then(setMaj); }, []);

  const ouvrir = async (p) => {
    setProjet(p); setEcran('synthese'); setSynchro({ etat: 'en_cours' });
    try { setSynchro(await appel(`/projets/${p.id}/synchroniser`, { corps: {} })); } catch (e) { setSynchro({ erreur: e.message }); }
  };

  if (erreur) return <div class="coquille"><div class="panneau principal"><h1>Watson ne démarre pas</h1><pre class="encart e-rouge" style="white-space:pre-wrap;font-size:12px">{erreur}</pre><p class="doux">Envoie ce message à la personne qui maintient Watson.</p></div></div>;
  if (!etat) return <div class="chargement">Démarrage de Watson…</div>;
  if (!etat.github.connecte) return <ConnexionGitHub version={etat.version} connecte={charger} />;
  if (!projet) {
    return (
      <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
        <BandeauMiseAJour maj={maj} />
        <MesProjets compte={etat.github.compte} version={etat.version} ouvrir={ouvrir} deconnecte={charger} />
      </div>
    );
  }
  const Ecran = ECRANS[ecran];
  return (
    <div class="coquille">
      <Lateral projet={projet} ecran={ecran} choisir={setEcran} quitter={() => setProjet(null)} compte={etat.github.compte} />
      <main class="panneau principal">
        <BandeauMiseAJour maj={maj} />
        <div class="ligne petit doux">
          <span>{projet.nom}</span><span class="espace" />
          {synchro?.etat === 'en_cours' && <span>Synchronisation avec GitHub…</span>}
          {synchro?.erreur && <span class="badge b-rouge" title={synchro.erreur}>Synchronisation impossible</span>}
          {synchro && !synchro.erreur && synchro.etat !== 'en_cours' && <span class="badge b-vert">À jour avec GitHub</span>}
          <button class="bouton" style="min-height:30px" onClick={() => ouvrir(projet)}><RefreshCw size={14} /> Synchroniser</button>
        </div>
        <Ecran key={`${ecran}-${synchro?.etat}`} projet={projet} etat={etat} aller={setEcran} />
      </main>
    </div>
  );
}

render(<App />, document.getElementById('app'));
