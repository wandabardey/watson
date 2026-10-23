// La coquille de l'application dans un projet : un rail de catégories, un second niveau avec les écrans de la
// catégorie, une barre du haut (fil d'Ariane, actions principales de l'écran, ce que Watson fait en ce moment,
// Watson), et le panneau de conversation à droite.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  AppWindow, ArrowLeftRight, BookMarked, BookOpen, ChevronsUpDown, CircleHelp, Cloud, CloudAlert, Code2, Database, FileText, FileUp, FlaskConical, Frame,
  GitBranch, GitPullRequestArrow, House, KeyRound, KanbanSquare, Landmark, LayoutDashboard, Lightbulb, ListChecks, LoaderCircle, MessagesSquare, MonitorPlay,
  Moon, Palette, PanelLeft, Presentation, RefreshCw, Route, Scale, Search, Settings, Sun, Users, X,
} from 'lucide-preact';
import { appel } from './api.js';
import { Tuile } from './ecrans/accueil.jsx';
import { Watson } from './ecrans/commun.jsx';

// [clé, libellé, icône, [écrans : clé, libellé, icône, compteur]]
export const CATEGORIES = [
  ['accueil', 'Projet', House, [['projet', 'Vue d\'ensemble', LayoutDashboard], ['sujets', 'Questions ouvertes', CircleHelp, 'questions'],
    ['alimenter', 'Alimenter la base', FileUp, 'lots'], ['administration', 'Administration', Settings]]],
  ['avant', 'Avant-projet', Lightbulb, [['cahier', 'Cahier des charges', FileText], ['moodboard', 'Moodboard', Palette], ['maquettes', 'Maquettes', Frame],
    ['proposition', 'Proposition', Presentation]]],
  ['metier', 'Connaissance métier', Database, [['referentiels', 'Référentiels', Database, 'entites'], ['scenarios', 'Scénarios', Route], ['ecrans', 'Écrans', AppWindow, 'ecrans'],
    ['regles', 'Règles', Scale, 'regles'], ['crud', 'Qui fait quoi', KeyRound], ['secteur', 'Fiche secteur', Landmark], ['flux', 'Flux externes', ArrowLeftRight]]],
  ['gestion', 'Gestion projet', KanbanSquare, [['ateliers', 'Ateliers', MessagesSquare], ['comite', 'Comité d\'experts', Users], ['evolutions', 'Évolutions', GitPullRequestArrow],
    ['versions', 'Versions', GitBranch], ['specifications', 'Spécifications Confluence', BookMarked], ['recette', 'Recette et TNR', FlaskConical], ['documentation', 'Documentation', BookOpen]]],
  ['produit', 'Produit', MonitorPlay, [['direct', 'App en direct', MonitorPlay], ['design', 'Design system', Palette], ['avancement', 'Avancement des écrans', ListChecks],
    ['code', 'Passage en code', Code2]]],
];
export const ALIAS = { synthese: 'projet', catalogue: 'referentiels', workflow: 'referentiels', demander: 'projet' };
export const categorieDe = (ecran) => CATEGORIES.find(([, , , items]) => items.some(([c]) => c === (ALIAS[ecran] || ecran)))?.[0] || 'accueil';
export const libelleDe = (ecran) => {
  for (const [, , , items] of CATEGORIES) for (const [c, l] of items) if (c === (ALIAS[ecran] || ecran)) return l;
  return '';
};

const duree = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`);

export function Rail({ categorie, choisirCategorie, compte, theme, basculerTheme, parametres, quitter, questions }) {
  const [menu, setMenu] = useState(false);
  return (
    <nav class="rail" aria-label="Catégories">
      <button class="rail-logo" onClick={quitter} title="Tous les projets"><span>W</span></button>
      <div class="rail-groupe">
        {CATEGORIES.map(([k, l, I]) => (
          <button key={k} class={`rail-bouton ${categorie === k ? 'actif' : ''}`} onClick={() => choisirCategorie(k)} aria-label={l} title={l}>
            <I size={19} strokeWidth={1.8} />
            {k === 'accueil' && questions > 0 && <i class="rail-pastille" />}
          </button>
        ))}
      </div>
      <span class="espace" />
      <button class="rail-bouton" onClick={basculerTheme} title={theme === 'sombre' ? 'Thème clair' : 'Thème sombre'} aria-label="Changer de thème">
        {theme === 'sombre' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
      </button>
      <button class="rail-bouton" onClick={parametres} title="Paramètres" aria-label="Paramètres"><Settings size={18} strokeWidth={1.8} /></button>
      <div style="position:relative">
        <button class="rail-avatar" onClick={() => setMenu(!menu)} title={compte?.nom} aria-expanded={menu}>
          {compte?.avatar ? <img src={compte.avatar} alt="" /> : <span>{(compte?.nom || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2)}</span>}
        </button>
        {menu && (
          <div class="menu-flottant rail-menu" onMouseLeave={() => setMenu(false)}>
            <div class="pile" style="gap:0;padding:6px 10px 8px"><strong>{compte?.nom}</strong><span class="petit doux">@{compte?.login}</span></div>
            <button class="menu" onClick={() => { setMenu(false); parametres(); }}><Settings size={15} /> Paramètres</button>
            <button class="menu" onClick={() => { setMenu(false); quitter(); }}><House size={15} /> Tous les projets</button>
          </div>
        )}
      </div>
    </nav>
  );
}

export function SousMenu({ projet, categorie, ecran, choisir, changerProjet, compteurs, ouvrirWatson, recherche }) {
  const [projets, setProjets] = useState([]);
  const [liste, setListe] = useState(false);
  const [q, setQ] = useState('');
  const champ = useRef(null);
  useEffect(() => { appel('/projets').then((d) => setProjets(d.projets.filter((p) => !p.absent))).catch(() => {}); }, []);
  useEffect(() => { if (recherche) champ.current?.focus(); }, [recherche]);
  const cat = CATEGORIES.find(([k]) => k === categorie) || CATEGORIES[0];
  const tous = CATEGORIES.flatMap(([k, l, , items]) => items.map((it) => [...it, l, k]));
  const trouves = q.trim() ? tous.filter(([, l]) => l.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))) : null;
  const actif = ALIAS[ecran] || ecran;
  const Item = ([cle, libelle, Icone, compteur, groupe]) => (
    <button key={cle} class={`sm-item ${actif === cle ? 'actif' : ''}`} onClick={() => { setQ(''); choisir(cle); }}>
      <Icone size={16} strokeWidth={1.8} /> <span class="espace tronque">{libelle}</span>
      {groupe && <span class="petit doux">{groupe}</span>}
      {compteur && compteurs[compteur] > 0 && <span class={`sm-compte ${compteur === 'questions' || compteur === 'lots' ? 'chaud' : ''}`}>{compteurs[compteur]}</span>}
    </button>
  );
  return (
    <nav class="sous-menu" aria-label={cat[1]}>
      <div style="position:relative">
        <button class="sm-projet" onClick={() => setListe(!liste)} aria-expanded={liste} title="Changer de projet">
          <Tuile nom={projet.nom} taille={26} /><span class="espace tronque">{projet.nom}</span><ChevronsUpDown size={14} class="doux" />
        </button>
        {liste && (
          <div class="menu-flottant" style="left:0;right:0;top:44px">
            {projets.map((p) => (
              <button key={p.id} class={`menu ${p.id === projet.id ? 'actif' : ''}`} onClick={() => { setListe(false); if (p.id !== projet.id) changerProjet(p); }}>
                <Tuile nom={p.nom} taille={22} /> <span class="tronque">{p.nom}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <label class="sm-recherche">
        <Search size={14} /><input ref={champ} value={q} placeholder="Aller à…" onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && trouves?.[0]) { choisir(trouves[0][0]); setQ(''); } if (e.key === 'Escape') setQ(''); }} />
        {q ? <button aria-label="Effacer" onClick={() => setQ('')}><X size={12} /></button> : <kbd>⌘K</kbd>}
      </label>
      <div class="sm-liste">
        {trouves ? (trouves.length ? trouves.map(([c, l, I, k, g]) => Item([c, l, I, k, g])) : <span class="petit doux" style="padding:8px">Aucun écran.</span>) : <>
          <span class="sm-titre">{cat[1]}</span>
          {cat[3].map((it) => Item(it))}
        </>}
      </div>
      <span class="espace" />
      <button class="sm-watson" onClick={ouvrirWatson}>
        <Watson humeur="debout" hauteur={38} flotte={false} />
        <span class="pile" style="gap:0;text-align:left;min-width:0"><strong>Watson</strong>
          <span class="petit doux tronque">{compteurs.lots ? `${compteurs.lots} lot${compteurs.lots > 1 ? 's' : ''} à trier` : 'Demande-moi ce que tu veux'}</span></span>
        <kbd>⌘J</kbd>
      </button>
    </nav>
  );
}

// Ce que Watson fait en ce moment, visible quel que soit l'écran.
function Activite({ projet, aller, ouvrirWatson }) {
  const [v, setV] = useState({ en_cours: [], finis: [] });
  const [fini, setFini] = useState(null);
  const vus = useRef(null);
  useEffect(() => {
    let vivant = true;
    let minuterie;
    const tour = async () => {
      try {
        const r = await appel('/travaux');
        if (!vivant) return;
        const enCours = new Set(r.en_cours.map((t) => t.id));
        if (vus.current) {
          const n = r.finis.find((t) => vus.current.has(t.id) && !enCours.has(t.id) && t.usage !== 'watson' && (!t.projet || t.projet === projet.id));
          if (n) setFini(n);
        }
        vus.current = enCours;
        setV(r);
        minuterie = setTimeout(tour, r.en_cours.length ? 1500 : 5000);
      } catch { minuterie = setTimeout(tour, 8000); }
    };
    tour();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [projet.id]);
  useEffect(() => { if (!fini) return undefined; const t = setTimeout(() => setFini(null), 12000); return () => clearTimeout(t); }, [fini]);
  const ici = v.en_cours.filter((t) => !t.projet || t.projet === projet.id);
  const voir = (t) => {
    if (t.ecran === 'watson') { ouvrirWatson(); return; }
    try { sessionStorage.setItem('watson.resultat', t.usage); } catch { /* rien */ }
    aller(t.ecran);
  };
  if (ici.length) {
    const t = ici[0];
    return (
      <button class="activite" onClick={() => voir(t)} title="Voir où le résultat arrivera">
        <Watson humeur="lit" hauteur={24} flotte={false} />
        <span class="tronque"><strong>{t.libelle}</strong> · {t.phase_libelle}{t.caracteres > 0 ? ` · ${t.caracteres.toLocaleString('fr-FR')} car.` : ''}</span>
        <span class="doux">{duree(t.duree_s)}</span>
        {ici.length > 1 && <span class="badge b-violet">+{ici.length - 1}</span>}
        <i class={`activite-barre ${t.phase}`} />
      </button>
    );
  }
  if (fini) {
    return (
      <button class={`activite ${fini.etat === 'erreur' ? 'erreur' : 'fini'}`} onClick={() => { setFini(null); if (fini.etat !== 'erreur') voir(fini); }}>
        <Watson humeur={fini.etat === 'erreur' ? 'question' : 'valide'} hauteur={24} flotte={false} />
        <span class="tronque"><strong>{fini.libelle}</strong> · {fini.etat === 'erreur' ? `échec : ${fini.erreur}` : 'terminé, voir le résultat'}</span>
      </button>
    );
  }
  return null;
}

export function BarreHaut({ projet, ecran, aller, basculerMenu, menuOuvert, synchro, synchroniser, watsonOuvert, basculerWatson, ouvrirWatson }) {
  const cat = CATEGORIES.find(([k]) => k === categorieDe(ecran));
  return (
    <header class="barre-haut" data-tauri-drag-region>
      <button class="bouton icone" onClick={basculerMenu} title={menuOuvert ? 'Masquer le menu' : 'Afficher le menu'} aria-pressed={menuOuvert}><PanelLeft size={16} /></button>
      <nav class="ariane" aria-label="Fil d'Ariane">
        <span class="tronque doux">{projet.nom}</span><span class="doux">/</span>
        {cat && cat[0] !== 'accueil' && <><span class="doux">{cat[1]}</span><span class="doux">/</span></>}
        <strong class="tronque">{libelleDe(ecran) || 'Vue d\'ensemble'}</strong>
      </nav>
      <Activite projet={projet} aller={aller} ouvrirWatson={ouvrirWatson} />
      <span class="espace" data-tauri-drag-region />
      <div id="barre-actions" class="barre-actions" />
      <button class={`bouton icone synchro ${synchro?.erreur ? 'erreur' : ''}`} onClick={synchroniser} disabled={synchro?.etat === 'en_cours'}
        title={synchro?.etat === 'en_cours' ? 'Synchronisation avec GitHub…' : synchro?.erreur ? `Synchronisation impossible : ${synchro.erreur}` : 'À jour avec GitHub. Cliquer pour synchroniser.'}>
        {synchro?.etat === 'en_cours' ? <LoaderCircle size={16} class="tourne" /> : synchro?.erreur ? <CloudAlert size={16} /> : <Cloud size={16} />}
      </button>
      <button class={`bouton-watson-haut ${watsonOuvert ? 'actif' : ''}`} onClick={basculerWatson} title="Demander à Watson (⌘J)">
        <Watson humeur="debout" hauteur={22} flotte={false} /> Watson <kbd>⌘J</kbd>
      </button>
    </header>
  );
}

export { RefreshCw };
