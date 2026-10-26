// Passage en code : Watson code des écrans depuis les maquettes validées et tout le référentiel, reporte le design
// system dans le code, ou crée l'application. Toujours sur une branche watson/..., construite avant d'être proposée,
// envoyée en demande de fusion : rien n'est jamais fusionné par Watson.
import { useEffect, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, Code2, ExternalLink, FolderGit2, GitBranch, Hammer, Palette, Plus, Rocket, Trash2, X } from 'lucide-preact';
import { appel, ouvrirLien } from '../api.js';
import { Attente, Entete, Watson } from './commun.jsx';

const duree = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`);

function Reglages({ projet, a, recevoir }) {
  const [depot, setDepot] = useState(a.depot);
  const [build, setBuild] = useState(a.build_declare || '');
  const [adresses, setAdresses] = useState(a.adresses.length ? a.adresses : []);
  const [message, setMessage] = useState(null);
  const [ok, setOk] = useState(false);
  const enregistrer = async () => {
    setMessage(null); setOk(false);
    try { recevoir(await appel(`/projets/${projet.id}/code/application`, { corps: { application: a.id, depot, build, adresses } })); setOk(true); } catch (e) { setMessage(e.message); }
  };
  return (
    <div class="pile" style="gap:8px">
      {message && <p class="encart e-rouge">{message}</p>}
      <label class="champ">Dossier du dépôt de code sur ce poste<input value={depot} onInput={(e) => setDepot(e.currentTarget.value)} placeholder="/Users/moi/dev/portail-fret" /></label>
      <label class="champ">Commande de construction (vide : le script build du projet)<input value={build} onInput={(e) => setBuild(e.currentTarget.value)} placeholder={a.build || 'npm run build'} /></label>
      <span class="champ">Adresses de l'application (app en direct)</span>
      {adresses.map((x, i) => (
        <div key={i} class="ligne" style="flex-wrap:nowrap">
          <input class="saisie" style="width:140px" value={x.nom} placeholder="Recette" onInput={(e) => setAdresses(adresses.map((y, j) => (j === i ? { ...y, nom: e.currentTarget.value } : y)))} />
          <input class="saisie espace" value={x.url} placeholder="https://recette.portail-fret.fr" onInput={(e) => setAdresses(adresses.map((y, j) => (j === i ? { ...y, url: e.currentTarget.value } : y)))} />
          <button class="bouton icone" aria-label="Retirer" onClick={() => setAdresses(adresses.filter((_, j) => j !== i))}><X size={14} /></button>
        </div>
      ))}
      <div class="ligne">
        <button class="bouton icone" onClick={() => setAdresses([...adresses, { nom: adresses.length ? '' : 'Local', url: adresses.length ? '' : 'http://localhost:4200' }])}><Plus size={14} /> Adresse</button>
        <span class="espace" />
        {ok && <span class="doux"><Check size={14} /> Enregistré</span>}
        <button class="bouton principal-b" onClick={enregistrer}>Enregistrer</button>
      </div>
      <span class="petit doux">Le dossier du dépôt est propre à ce poste. La commande de construction et les adresses sont partagées avec l'équipe.</span>
    </div>
  );
}

function Lancer({ projet, a, d, recevoir }) {
  const ecrans = d.ecrans.filter((e) => e.application === a.id);
  const [genre, setGenre] = useState(a.git ? 'ecrans' : 'creation');
  const [choix, setChoix] = useState(() => ecrans.filter((e) => e.etat === 'maquette_validee').map((e) => e.id));
  const [demande, setDemande] = useState('');
  const [dossier, setDossier] = useState('');
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const lancer = async () => {
    setOccupe(true); setMessage(null);
    try { recevoir(await appel(`/projets/${projet.id}/code/lancer`, { corps: { application: a.id, genre, ecrans: choix, demande, dossier } })); setDemande(''); } catch (e) { setMessage(e.message); } finally { setOccupe(false); }
  };
  const enCours = d.chantiers.some((c) => c.etat === 'en_cours' && c.application === a.id);
  return (
    <div class="pile" style="gap:10px">
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="segments" style="align-self:flex-start">
        {a.git && <button class={`segment ${genre === 'ecrans' ? 'actif' : ''}`} onClick={() => setGenre('ecrans')}><Code2 size={14} /> Coder des écrans</button>}
        {a.git && <button class={`segment ${genre === 'design_system' ? 'actif' : ''}`} onClick={() => setGenre('design_system')}><Palette size={14} /> Reporter le design system</button>}
        {!a.git && <button class={`segment ${genre === 'creation' ? 'actif' : ''}`} onClick={() => setGenre('creation')}><Rocket size={14} /> Créer l'application</button>}
      </div>
      {genre === 'ecrans' && (
        <div class="code-ecrans">
          {ecrans.map((e) => (
            <label key={e.id} class="ligne" style="gap:8px;flex-wrap:nowrap">
              <input type="checkbox" checked={choix.includes(e.id)} onChange={() => setChoix(choix.includes(e.id) ? choix.filter((x) => x !== e.id) : [...choix, e.id])} />
              <span class="espace">{e.nom}</span><span class="petit doux">{e.etat_libelle}</span>
            </label>
          ))}
        </div>
      )}
      {genre === 'design_system' && <span class="doux">Watson met les jetons du code (couleurs, polices, rayons, espacements, animations) en accord avec le design system validé du projet, en gardant leurs noms.</span>}
      {genre === 'creation' && <>
        <span class="doux">Watson crée l'application Angular avec le starter 4SH (kit de composants @4sh/ui-kit), une page par écran de la base et le design system validé. Node.js doit être installé sur ce poste{d.node ? '' : ' : il ne l\'est pas pour l\'instant'}.</span>
        <label class="champ">Dossier à créer sur ce poste (vide)<input value={dossier} onInput={(e) => setDossier(e.currentTarget.value)} placeholder="/Users/moi/dev/portail-fret" /></label>
      </>}
      <textarea class="saisie" rows={3} style="padding:10px 12px" value={demande} onInput={(e) => setDemande(e.currentTarget.value)} placeholder="Précisions pour Watson (facultatif) : données à simuler, priorités, ce qui doit rester hors du chantier…" />
      <div class="ligne">
        <button class="bouton principal-b" disabled={occupe || enCours || (genre === 'ecrans' && !choix.length) || (genre === 'creation' && (!dossier.trim() || !d.node))} onClick={lancer}><Hammer size={15} /> Lancer le chantier</button>
        {enCours && <span class="doux">Un chantier est déjà en cours sur cette application.</span>}
      </div>
      <span class="petit doux">Watson travaille sur une branche à part, construit l'application, puis ouvre une demande de fusion sur GitHub. Il ne fusionne jamais.</span>
    </div>
  );
}

function Chantier({ projet, c, d, recevoir }) {
  const [ouvert, setOuvert] = useState(c.etat === 'en_cours');
  const [message, setMessage] = useState(null);
  const faire = async (action, corps = {}) => { setMessage(null); try { recevoir(await appel(`/projets/${projet.id}/code/${action}`, { corps })); } catch (e) { setMessage(e.message); } };
  const liens = Object.entries(c.liens_proposes || {});
  const nomEcran = Object.fromEntries(d.ecrans.map((e) => [e.id, e.nom]));
  return (
    <div class="carte pile" style="gap:8px">
      <div class="ligne" style="flex-wrap:nowrap;cursor:pointer" onClick={() => setOuvert(!ouvert)}>
        {ouvert ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span class="pile espace" style="gap:2px"><strong>{c.titre}</strong>
          <span class="petit doux">{c.application_nom} · {c.libelle} · {c.date.split('-').reverse().join('/')}{c.par ? ` · ${c.par}` : ''}{c.fin ? ` · ${duree(c.fin - c.debut)}` : ''}</span></span>
        {c.etat === 'en_cours' && <span class="badge b-ambre">{d.etapes[c.etape]}</span>}
        {c.etat === 'termine' && <span class={`badge ${c.construit === false ? 'b-rouge' : 'b-vert'}`}>{c.construit === false ? 'Construction en échec' : c.construit ? 'Construite' : 'Terminé'}</span>}
        {c.etat === 'erreur' && <span class="badge b-rouge">Arrêté</span>}
      </div>
      {ouvert && <>
        {message && <p class="encart e-rouge">{message}</p>}
        {c.etat === 'en_cours' && <div class="ligne" style="gap:12px;flex-wrap:nowrap"><Watson humeur="code" hauteur={70} flotte={false} /><span class="doux">{d.etapes[c.etape]}… Tu peux quitter cet écran : le chantier continue, et l'avancée reste visible dans la barre du haut.</span></div>}
        {c.erreur && <p class="encart e-rouge">{c.erreur}</p>}
        <div class="code-journal">{(c.journal || []).map((j, i) => <span key={i}><span class="doux">{j.t}</span> {j.texte}</span>)}</div>
        <div class="ligne">
          <span class="badge b-gris"><GitBranch size={12} /> {c.branche}</span>
          {c.commit && <span class="petit doux">enregistrement {c.commit}</span>}
          {c.demande_fusion && <button class="bouton" onClick={() => ouvrirLien(c.demande_fusion)}><ExternalLink size={14} /> Demande de fusion #{c.numero}</button>}
          {c.message_envoi && <span class="petit doux">{c.message_envoi}</span>}
        </div>
        {c.sortie_build && <details><summary class="doux">Dernière sortie de la construction</summary><pre class="code-sortie">{c.sortie_build}</pre></details>}
        {c.compte_rendu && <div class="code-cr">{c.compte_rendu}</div>}
        {c.fichiers?.length > 0 && <details><summary class="doux">{c.fichiers.length} fichier{c.fichiers.length > 1 ? 's' : ''} changé{c.fichiers.length > 1 ? 's' : ''}</summary><div class="code-fichiers">{c.fichiers.map((f) => <span key={f}>{f}</span>)}</div></details>}
        {liens.length > 0 && !c.liens_poses && (
          <div class="encart e-indigo" style="flex-direction:column;gap:6px">
            <span>Watson propose de relier ces écrans à leurs fichiers (pour l'avancement des écrans et l'app en direct) :</span>
            {liens.map(([e, fs]) => <span key={e} class="petit"><strong>{nomEcran[e] || e}</strong> : {fs.join(', ')}</span>)}
            <button class="bouton" style="align-self:flex-start" onClick={() => faire(`chantiers/${c.id}/lier`)}><Check size={14} /> Relier</button>
          </div>
        )}
        {c.genre === 'creation' && c.etat === 'termine' && c.a_declarer && <button class="bouton principal-b" style="align-self:flex-start" onClick={() => faire('declarer', { application: c.application, chemin: c.a_declarer })}><FolderGit2 size={14} /> En faire le dépôt de l'application</button>}
        {c.etat !== 'en_cours' && c.chantier && !c.retire && <button class="bouton icone" style="align-self:flex-start" title="Retire le dossier de travail de ce poste ; la branche et la demande de fusion restent" onClick={() => faire(`chantiers/${c.id}/abandonner`)}><Trash2 size={14} /> Retirer le dossier du chantier</button>}
      </>}
    </div>
  );
}

export function Code({ projet }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [reglages, setReglages] = useState(null);
  const charger = () => appel(`/projets/${projet.id}/code`).then(setD).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => {
    if (!d?.chantiers.some((c) => c.etat === 'en_cours')) return undefined;
    const t = setInterval(charger, 3000);
    return () => clearInterval(t);
  }, [d]);
  if (!d) return <Attente erreur={erreur} />;
  return (
    <>
      <Entete titre="Passage en code" description="Watson code les écrans à partir des maquettes validées et de tout le référentiel, reporte le design system dans le code, ou crée l'application avec le starter 4SH. Toujours sur une branche à part, construite avant d'être proposée en demande de fusion : rien n'est fusionné sans toi et l'équipe." />
      {d.applications.map((a) => (
        <section key={a.id} class="carte pile" style="gap:12px;margin-bottom:14px">
          <div class="ligne">
            <h2 class="espace">{a.nom}</h2>
            {a.git ? <span class="badge b-vert">Dépôt de code trouvé</span> : <span class="badge b-gris">Pas de dépôt de code sur ce poste</span>}
            {a.github && <span class="petit doux">{a.github}</span>}
            <button class="bouton icone" onClick={() => setReglages(reglages === a.id ? null : a.id)}>Réglages</button>
          </div>
          {reglages === a.id && <Reglages projet={projet} a={a} recevoir={(v) => { setD(v); }} />}
          {a.git && a.build && <span class="petit doux">Construction : {a.build}</span>}
          <Lancer projet={projet} a={a} d={d} recevoir={setD} />
        </section>
      ))}
      {d.chantiers.length > 0 && <h2 style="margin:6px 0 10px">Chantiers</h2>}
      <div class="pile" style="gap:10px">{d.chantiers.map((c) => <Chantier key={c.id} projet={projet} c={c} d={d} recevoir={setD} />)}</div>
    </>
  );
}
