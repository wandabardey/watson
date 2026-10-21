import { useEffect, useState } from 'preact/hooks';
import { FolderGit2, LogOut, Network, Plus, Search } from 'lucide-preact';
import { appel } from '../api.js';

function Ouvrir({ fermer, ouvert }) {
  const [q, setQ] = useState('');
  const [depots, setDepots] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => appel(`/github/depots?q=${encodeURIComponent(q)}`).then((d) => setDepots(d.depots)).catch((e) => setMessage(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const choisir = async (nom) => {
    setOccupe(nom); setMessage(null);
    try { ouvert(await appel('/projets', { corps: { depot: nom } })); } catch (e) { setMessage(e.message); setOccupe(null); }
  };
  return (
    <div class="carte pile">
      <div class="ligne"><h2 class="espace">Ouvrir un dépôt de connaissance</h2><button class="bouton" onClick={fermer}>Fermer</button></div>
      <label class="ligne saisie" style="gap:8px"><Search size={16} /><input style="border:0;outline:none;flex:1;min-height:36px" placeholder="Rechercher un dépôt" value={q} onInput={(e) => setQ(e.target.value)} autoFocus /></label>
      {message && <p class="encart e-rouge">{message}</p>}
      {!depots && <p class="doux">Chargement des dépôts…</p>}
      <div class="pile" style="max-height:360px;overflow:auto;gap:4px">
        {depots?.map((d) => (
          <button key={d.nom} class="menu" style="min-height:48px" disabled={!!occupe} onClick={() => choisir(d.nom)}>
            <FolderGit2 size={18} />
            <span style="display:flex;flex-direction:column;align-items:flex-start;min-width:0">
              <span>{d.nom} {d.prive && <span class="badge b-gris">privé</span>}</span>
              {d.description && <span class="petit doux">{d.description}</span>}
            </span>
            {occupe === d.nom && <span class="compte b-indigo">récupération…</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Creer({ fermer, ouvert, compte }) {
  const [nom, setNom] = useState('Fret international');
  const [demo, setDemo] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);
  const slug = nom.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const creer = async () => {
    setOccupe(true); setMessage(null);
    try { ouvert(await appel('/projets', { corps: { creer: true, nom, demo } })); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  return (
    <div class="carte pile">
      <div class="ligne"><h2 class="espace">Créer un projet</h2><button class="bouton" onClick={fermer}>Fermer</button></div>
      <label class="champ">Nom du projet<input value={nom} onInput={(e) => setNom(e.target.value)} /></label>
      <label class="ligne" style="cursor:pointer"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Partir du projet de démonstration (expéditions, règles, workflow d'exemple)</label>
      <p class="encart e-indigo">Watson crée le dépôt privé <strong>{compte.login}/{slug}-connaissance</strong> sur GitHub. Toute la connaissance du projet y vit ; les dépôts de code pourront s'appuyer dessus.</p>
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne"><button class="bouton principal-b" disabled={occupe || !nom.trim()} onClick={creer}><Plus size={16} />{occupe ? 'Création…' : 'Créer le projet'}</button></div>
    </div>
  );
}

export function MesProjets({ compte, version, ouvrir, deconnecte }) {
  const [projets, setProjets] = useState(null);
  const [mode, setMode] = useState(null);
  const [message, setMessage] = useState(null);
  const charger = () => appel('/projets').then((d) => setProjets(d.projets)).catch((e) => setMessage(e.message));
  useEffect(() => { charger(); }, []);
  const deconnecter = async () => { await appel('/github/deconnexion', { corps: {} }); deconnecte(); };
  const ouvert = (p) => { setMode(null); charger(); ouvrir(p); };
  return (
    <div class="panneau principal" style="max-width:1100px;margin:0 auto;width:100%">
      <div class="ligne">
        <span class="logo"><Network size={18} /></span><strong style="font-size:16px">Watson</strong><span class="petit doux">{version}</span>
        <span class="espace" />
        <span class="doux">{compte.nom}</span>
        <button class="bouton" onClick={deconnecter} title="Se déconnecter de GitHub"><LogOut size={16} /></button>
      </div>
      <div class="ligne" style="align-items:flex-end">
        <div style="flex:1 1 400px" class="pile"><h1>Mes projets</h1><p class="doux">Chaque projet est un dépôt de connaissance sur GitHub. Watson le garde à jour et y enregistre chaque changement validé, à ton nom.</p></div>
        <button class="bouton" onClick={() => setMode('ouvrir')}><FolderGit2 size={16} /> Ouvrir un dépôt</button>
        <button class="bouton principal-b" onClick={() => setMode('creer')}><Plus size={16} /> Créer un projet</button>
      </div>
      {mode === 'ouvrir' && <Ouvrir fermer={() => setMode(null)} ouvert={ouvert} />}
      {mode === 'creer' && <Creer fermer={() => setMode(null)} ouvert={ouvert} compte={compte} />}
      {message && <p class="encart e-rouge">{message}</p>}
      {projets && projets.length === 0 && !mode && <div class="vide">Aucun projet sur ce poste pour l'instant. Ouvre un dépôt de connaissance existant, ou crée le projet de démonstration.</div>}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
        {projets?.map((p) => (
          <button key={p.id} class="carte pile" style="text-align:left;cursor:pointer;border:0" onClick={() => !p.absent && ouvrir(p)}>
            <div class="ligne"><strong style="font-size:16px" class="espace">{p.nom}</strong>{p.absent && <span class="badge b-rouge">copie absente</span>}</div>
            <span class="petit doux">{p.depot}</span>
            {p.description && <span class="doux" style="font-size:13px">{p.description}</span>}
            {!p.absent && <span class="ligne petit"><span class="badge b-gris">{p.entites} entités</span><span class="badge b-gris">{p.regles} règles</span>{(p.applications || []).map((a) => <span key={a} class="badge b-indigo">{a}</span>)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
