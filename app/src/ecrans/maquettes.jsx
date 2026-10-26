// Avant-projet : les maquettes. Watson dessine les écrans (HTML statique, piste retenue du moodboard, jeu de
// données commun), on importe ce qui vient de Claude Design, et tout se regarde ici, rattaché aux écrans.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Copy, Download, Frame, Maximize2, Monitor, Pencil, Smartphone, Sparkles, Trash2, Upload, X } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { BoutonRevue } from './studio.jsx';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { ElementWatson } from '../contexte.js';

const LARGEURS = { desktop: 1280, tablette: 900, mobile: 390 };
const HAUTEURS = { desktop: 800, tablette: 1100, mobile: 844 };
const cache = {};

function useContenu(projet, id, proposition) {
  const cle = `${projet.id}|${proposition ? 'p' : 'm'}|${id}`;
  const [c, setC] = useState(cache[cle] || null);
  useEffect(() => {
    if (cache[cle]) { setC(cache[cle]); return; }
    appel(`/projets/${projet.id}/avant-projet/maquettes/contenu`, { corps: { id, proposition } }).then((r) => { cache[cle] = r; setC(r); }).catch(() => setC({ erreur: true }));
  }, [cle]);
  return c;
}
const oublier = (projet, id) => { for (const k of Object.keys(cache)) if (k.startsWith(`${projet.id}|`) && k.endsWith(`|${id}`)) delete cache[k]; };

// Le rendu d'une maquette, à l'échelle de son cadre. Cadre isolé : aucun script ne s'exécute.
export function Rendu({ projet, m, proposition = false, largeurCadre, hauteurMax }) {
  const c = useContenu(projet, m.id, proposition);
  const l = LARGEURS[m.support] || 1280;
  const h = HAUTEURS[m.support] || 800;
  const k = Math.min(1, largeurCadre / l);
  const hauteur = Math.min(hauteurMax || h * k, h * k);
  if (!c) return <div class="rendu vide-rendu" style={`width:${largeurCadre}px;height:${hauteur}px`}><span class="doux petit">Chargement…</span></div>;
  if (c.erreur) return <div class="rendu vide-rendu" style={`width:${largeurCadre}px;height:${hauteur}px`}><span class="doux petit">Illisible</span></div>;
  if (c.image) return <div class="rendu" style={`width:${largeurCadre}px;height:${hauteur}px`}><img src={c.image} alt={m.titre} style="width:100%;height:100%;object-fit:cover;object-position:top" /></div>;
  return (
    <div class={`rendu ${m.support === 'mobile' ? 'rendu-mobile' : ''}`} style={`width:${largeurCadre}px;height:${hauteur}px`}>
      <iframe title={m.titre} sandbox="" srcdoc={c.html} style={`width:${l}px;height:${hauteur / k}px;transform:scale(${k});transform-origin:0 0`} />
    </div>
  );
}

function Visionneuse({ projet, m, d, fermer, faire, reprendre, occupe }) {
  const [support, setSupport] = useState(m.support || 'desktop');
  const [dem, setDem] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const [titre, setTitre] = useState(m.titre);
  const [notes, setNotes] = useState(m.notes || '');
  const cadre = useRef(null);
  const [l, setL] = useState(900);
  useEffect(() => { const f = () => cadre.current && setL(cadre.current.clientWidth - 40); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const modifier = (champs) => faire(() => appel(`/projets/${projet.id}/avant-projet/maquettes/modifier`, { corps: { id: m.id, champs } }));
  return (
    <div class="visionneuse" onClick={fermer}>
      <ElementWatson type="maquette" id={m.id} nom={m.titre} />
      <div class="visionneuse-corps" onClick={(e) => e.stopPropagation()}>
        <div class="visionneuse-scene" ref={cadre}>
          <Rendu projet={projet} m={{ ...m, support }} largeurCadre={support === 'mobile' ? 390 : l} />
        </div>
        <aside class="visionneuse-cote pile" style="gap:12px">
          <div class="ligne"><span class="petit doux espace">{d.origines[m.origine] || 'Maquette'}{m.date ? ` · ${m.date.split('-').reverse().join('/')}` : ''}</span><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
          <input class="saisie cdc-titre-saisie" value={titre} onInput={(e) => setTitre(e.target.value)} onBlur={() => titre.trim() && titre !== m.titre && modifier({ titre })} />
          <div class="segments" style="align-self:flex-start">
            {Object.entries({ desktop: Monitor, mobile: Smartphone }).map(([k, I]) => <button key={k} class={`segment ${support === k ? 'actif' : ''}`} onClick={() => { setSupport(k); if (k !== m.support) modifier({ support: k }); }}><I size={14} /> {d.supports[k]}</button>)}
          </div>
          <label class="champ">Écran<select value={m.ecran || ''} onChange={(e) => modifier({ ecran: e.target.value })}><option value="">Aucun</option>{d.ecrans.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></label>
          {m.ecran && (m.validee
            ? <div class="encart e-vert" style="flex-direction:column;gap:6px"><span><Check size={14} /> Maquette validée le {m.validee.split('-').reverse().join('/')}{m.validee_par ? ` par ${m.validee_par}` : ''} : c'est la référence pour le code de cet écran.</span>
                <button class="bouton icone" style="align-self:flex-start" disabled={occupe} onClick={() => modifier({ validee: false })}>Retirer la validation</button></div>
            : <button class="bouton" disabled={occupe} onClick={() => modifier({ validee: true })}><Check size={15} /> Valider : référence pour le code</button>)}
          <label class="champ">Notes<textarea rows={5} value={notes} onInput={(e) => setNotes(e.target.value)} onBlur={() => notes !== (m.notes || '') && modifier({ notes })} /></label>
          {m.fichier?.endsWith('.html') && (dem === null
            ? <button class="bouton bouton-watson" disabled={occupe} onClick={() => setDem('')}><Sparkles size={15} /> Reprendre avec Watson</button>
            : <div class="pile" style="gap:6px"><textarea class="saisie" style="min-height:70px;padding:8px 10px" autoFocus placeholder="Ce qui doit changer : mettre l'historique en avant, plus dense, ajouter un filtre…" value={dem} onInput={(e) => setDem(e.target.value)} />
                <div class="ligne"><button class="bouton principal-b" onClick={() => { reprendre(m, dem); fermer(); }}><Sparkles size={14} /> Proposer</button><button class="bouton" onClick={() => setDem(null)}>Annuler</button></div></div>)}
          <BoutonRevue projet={projet} cible={{ type: 'maquette', id: m.id }} titre={m.titre}
            capturer={async () => {
              const c = await appel(`/projets/${projet.id}/avant-projet/maquettes/contenu`, { corps: { id: m.id } });
              if (c.image) return c.image;
              const { capturerMaquette } = await import('./deck.jsx');
              return capturerMaquette(c.html, support);
            }}
            corriger={m.fichier?.endsWith('.html') ? (consigne) => reprendre(m, consigne) : null} />
          <BoutonComite projet={projet} cible={{ type: 'maquette', id: m.id }} libelle="Faire évaluer par un comité" />
          <span class="espace" />
          {confirmer ? <button class="bouton danger" disabled={occupe} onClick={async () => { if (await faire(() => appel(`/projets/${projet.id}/avant-projet/maquettes/supprimer`, { corps: { id: m.id } }))) fermer(); }}>Confirmer la suppression</button>
            : <button class="bouton" onClick={() => setConfirmer(true)}><Trash2 size={14} /> Supprimer</button>}
        </aside>
      </div>
    </div>
  );
}

function Vignette({ projet, m, ouvrir, choix }) {
  return (
    <figure class="vignette-maquette" onClick={() => ouvrir(m)}>
      <Rendu projet={projet} m={m} largeurCadre={m.support === 'mobile' ? 120 : 260} hauteurMax={m.support === 'mobile' ? 200 : 162} />
      <figcaption><strong class="tronque">{m.titre}</strong><span class="doux petit">{m.origine === 'claude_design' ? 'Claude Design' : m.origine === 'import' ? 'Importée' : 'Watson'}</span></figcaption>
      {choix}
    </figure>
  );
}

function Dessiner({ d, lancer, fermer, claude }) {
  const [ecrans, setEcrans] = useState([]);
  const [libre, setLibre] = useState('');
  const [demande, setDemande] = useState('');
  const basculer = (id) => setEcrans(ecrans.includes(id) ? ecrans.filter((x) => x !== id) : [...ecrans, id]);
  return (
    <div class="carte pile" style="gap:12px">
      <div class="ligne"><strong class="espace">Dessiner avec Watson</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      {!d.piste && <p class="encart e-orange">Aucune piste retenue dans le moodboard : les maquettes seront sobres et neutres. Retenir une piste d'abord donne un rendu bien plus juste.</p>}
      <span class="doux petit">Choisis les écrans à dessiner (un appel par écran, dans l'ordre). Ils partagent le même jeu de données fictives.</span>
      <div class="choix-ecrans">{d.ecrans.map((e) => (
        <label key={e.id} class={`choix-ecran ${ecrans.includes(e.id) ? 'actif' : ''}`}><input type="checkbox" checked={ecrans.includes(e.id)} onChange={() => basculer(e.id)} />
          <span class="pile" style="gap:0"><strong>{e.nom}</strong><span class="doux petit">{e.application || 'Sans application'}{e.maquettes.length ? ` · ${e.maquettes.length} maquette${e.maquettes.length > 1 ? 's' : ''}` : ''}{e.a_trancher ? ' · à trancher' : ''}</span></span></label>
      ))}</div>
      <label class="champ">Ou un écran qui n'existe pas encore<input placeholder="Par exemple : tableau de bord du responsable d'agence" value={libre} onInput={(e) => setLibre(e.target.value)} /></label>
      <label class="champ">Consigne, facultative<input placeholder="Par exemple : montrer l'état avec une pièce manquante" value={demande} onInput={(e) => setDemande(e.target.value)} /></label>
      <div class="ligne"><button class="bouton principal-b" disabled={!claude?.connecte || (!ecrans.length && !libre.trim())} onClick={() => lancer([...ecrans.map((e) => ({ ecran: e })), ...(libre.trim() ? [{ description: libre.trim() }] : [])], demande)}>
        <Sparkles size={15} /> Dessiner {ecrans.length + (libre.trim() ? 1 : 0) || ''} écran{ecrans.length + (libre.trim() ? 1 : 0) > 1 ? 's' : ''}</button>
        <span class="doux petit">Une à trois minutes par écran.</span></div>
    </div>
  );
}

function Brief({ projet, d, fermer }) {
  const [ecrans, setEcrans] = useState(() => d.ecrans.map((e) => e.id));
  const [texte, setTexte] = useState(null);
  const [copie, setCopie] = useState(false);
  const generer = async () => setTexte((await appel(`/projets/${projet.id}/avant-projet/maquettes/brief`, { corps: { ecrans } })).brief);
  useEffect(() => { generer(); }, [ecrans.join(',')]);
  return (
    <div class="carte pile" style="gap:10px">
      <div class="ligne"><strong class="espace">Brief pour Claude Design</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <span class="doux petit">Colle ce brief dans un nouveau projet Claude Design : contexte, direction artistique retenue, écrans et données fictives. Exporte ensuite chaque écran en HTML et importe-le ici.</span>
      <div class="ligne" style="gap:6px">{d.ecrans.map((e) => <button key={e.id} class={`badge ${ecrans.includes(e.id) ? 'b-indigo' : 'b-gris'}`} style="border:0;cursor:pointer;font-weight:500" onClick={() => setEcrans(ecrans.includes(e.id) ? ecrans.filter((x) => x !== e.id) : [...ecrans, e.id])}>{e.nom}</button>)}</div>
      <textarea class="saisie cdc-editeur" readOnly value={texte ?? 'Préparation…'} />
      <div class="ligne"><button class="bouton principal-b" disabled={!texte} onClick={async () => { try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch { /* copie manuelle possible */ } }}>{copie ? <Check size={15} /> : <Copy size={15} />} {copie ? 'Copié' : 'Copier le brief'}</button></div>
    </div>
  );
}

function Importer({ d, envoyer, fermer, occupe }) {
  const [f, setF] = useState(null);
  const [titre, setTitre] = useState('');
  const [ecran, setEcran] = useState('');
  const [origine, setOrigine] = useState('claude_design');
  const [support, setSupport] = useState('desktop');
  return (
    <div class="carte pile" style="gap:10px">
      <div class="ligne"><strong class="espace">Importer une maquette</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <label class="depot" style="padding:18px"><Upload size={20} /><strong>{f ? f.name : 'Choisir un export HTML de Claude Design, ou une capture (PNG, JPG)'}</strong>
        <input type="file" accept=".html,.htm,.png,.jpg,.jpeg,.webp" style="display:none" onChange={(e) => { const x = e.target.files[0]; if (x) { setF(x); if (!titre) setTitre(x.name.replace(/\.[^.]+$/, '')); } }} /></label>
      <span class="doux petit">Le HTML est nettoyé : il s'affiche sans ses scripts (une maquette cliquable devient statique).</span>
      <div class="ligne" style="gap:8px">
        <label class="champ espace">Titre<input value={titre} onInput={(e) => setTitre(e.target.value)} /></label>
        <label class="champ">Écran<select value={ecran} onChange={(e) => setEcran(e.target.value)}><option value="">Aucun</option>{d.ecrans.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></label>
      </div>
      <div class="ligne" style="gap:8px">
        <label class="champ">Origine<select value={origine} onChange={(e) => setOrigine(e.target.value)}><option value="claude_design">Claude Design</option><option value="import">Autre</option></select></label>
        <label class="champ">Support<select value={support} onChange={(e) => setSupport(e.target.value)}>{Object.entries(d.supports).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div class="ligne"><button class="bouton principal-b" disabled={!f || occupe} onClick={() => envoyer(f, { titre, ecran, origine, support })}><Download size={15} /> Importer</button></div>
    </div>
  );
}

export function Maquettes({ projet, etat, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [panneau, setPanneau] = useState(null);
  const [vue, setVue] = useState(null);
  const [file, setFile] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/avant-projet/maquettes`;
  useEffect(() => { appel(base).then(setD).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const faire = async (f) => { setOccupe(true); setMessage(null); try { setD(await f()); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); } };
  const lancer = async (taches, demande) => {
    setPanneau(null); setMessage(null);
    for (let i = 0; i < taches.length; i++) {
      const t = taches[i];
      setFile({ i, n: taches.length, nom: t.ecran ? d.ecrans.find((e) => e.id === t.ecran)?.nom : t.reprise || t.description });
      try {
        const r = await appel(`${base}/dessiner`, { corps: { ...t, demande } });
        oublier(projet, r.id);
        setD(await appel(base));
      } catch (e) { setMessage(`${t.ecran ? d.ecrans.find((x) => x.id === t.ecran)?.nom : 'Écran'} : ${e.message}`); }
    }
    setFile(null);
  };
  const reprendre = (m, dem) => lancer([{ reprendre: m.id, reprise: m.titre }], dem?.trim() || null);
  const importer = async (f, champs) => {
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    if (await faire(() => appel(`${base}/importer`, { corps: { nom: f.name, contenu_base64: b64, ...champs } }))) setPanneau(null);
  };
  const parEcran = d.ecrans.map((e) => ({ ...e, liste: d.maquettes.filter((m) => m.ecran === e.id) }));
  const libres = d.maquettes.filter((m) => !m.ecran);
  return (
    <>
      <Entete titre="Maquettes" description="Des écrans d'exemple à montrer au client, sans code : dessinés par Watson avec la piste retenue du moodboard, ou importés de Claude Design. Chacun se rattache à un écran du projet.">
        <div class="ligne">
          <button class="bouton" onClick={() => setPanneau(panneau === 'brief' ? null : 'brief')}><Copy size={15} /> Brief Claude Design</button>
          <button class="bouton" onClick={() => setPanneau(panneau === 'importer' ? null : 'importer')}><Upload size={15} /> Importer</button>
          <button class="bouton bouton-watson" disabled={!!file} onClick={() => setPanneau(panneau === 'dessiner' ? null : 'dessiner')}><Sparkles size={15} /> Dessiner avec Watson</button>
        </div>
      </Entete>
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="Le dessin des maquettes" />
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne bandeau-piste">
        {d.piste ? <><span class="petit doux">Piste retenue</span><strong>{d.piste.nom}</strong><span class="ligne" style="gap:3px">{d.piste.couleurs.slice(0, 7).map((c) => <i key={c.hex + c.role} class="mini-nuance" style={`background:${c.hex}`} title={c.nom} />)}</span><span class="petit doux">{d.piste.typo.titres}</span></>
          : <span class="petit doux">Aucune piste retenue dans le moodboard.</span>}
        <button class="lien petit" onClick={() => aller('moodboard')}>{d.piste ? 'Changer' : 'Ouvrir le moodboard'}</button>
      </div>
      {panneau === 'dessiner' && <Dessiner d={d} lancer={lancer} fermer={() => setPanneau(null)} claude={claude} />}
      {panneau === 'brief' && <Brief projet={projet} d={d} fermer={() => setPanneau(null)} />}
      {panneau === 'importer' && <Importer d={d} envoyer={importer} fermer={() => setPanneau(null)} occupe={occupe} />}
      {file && (
        <div class="carte ligne" style="gap:16px;flex-wrap:nowrap"><Watson humeur="maquette" hauteur={90} flotte={false} />
          <div class="pile espace" style="gap:4px"><strong>Watson dessine « {file.nom} »{file.n > 1 ? ` (${file.i + 1} sur ${file.n})` : ''}</strong>
            <span class="doux">Avec la piste retenue et le jeu de données commun. Une à trois minutes par écran ; les maquettes arrivent ci-dessous au fur et à mesure.</span></div></div>
      )}
      {d.propositions.length > 0 && (
        <section class="pile" style="gap:10px">
          <h2>À garder ou écarter <span class="doux" style="font-weight:400">{d.propositions.length}</span></h2>
          <div class="propositions-maquettes">{d.propositions.map((p) => (
            <div key={p.id} class="carte pile proposition-maquette" style="gap:8px">
              <div class="ligne"><strong class="espace tronque">{p.titre}</strong><span class={`badge ${p.remplace ? 'b-violet' : 'b-indigo'}`}>{p.remplace ? 'Nouvelle version' : 'Nouvelle'}</span></div>
              <div onClick={() => setVue({ ...p, proposition: true })} style="cursor:zoom-in"><Rendu projet={projet} m={p} proposition largeurCadre={p.support === 'mobile' ? 200 : 380} hauteurMax={240} /></div>
              {p.notes && <span class="petit doux">{p.notes}</span>}
              {p.questions?.length > 0 && <span class="petit">Questions notées en gardant : {p.questions.map((q) => q.question).join(' · ')}</span>}
              <div class="ligne">
                <button class="bouton principal-b" disabled={occupe} onClick={async () => { oublier(projet, p.id); await faire(() => appel(`${base}/garder`, { corps: { id: p.id } })); }}><Check size={14} /> Garder</button>
                <button class="bouton" disabled={occupe} onClick={() => faire(() => appel(`${base}/ecarter`, { corps: { id: p.id } }))}><X size={14} /> Écarter</button>
                <span class="espace" /><button class="bouton icone" title="Voir en grand" onClick={() => setVue({ ...p, proposition: true })}><Maximize2 size={14} /></button>
              </div>
            </div>
          ))}</div>
        </section>
      )}
      {d.maquettes.length === 0 && d.propositions.length === 0 && !file && !panneau && (
        <div class="vide pile" style="align-items:center;gap:12px"><Watson humeur="maquette" hauteur={170} />
          <span>Pas encore de maquette. Je peux dessiner les écrans du projet avec la piste retenue, ou tu peux importer ceux de Claude Design.</span>
          <div class="ligne"><button class="bouton principal-b" disabled={!claude?.connecte} onClick={() => setPanneau('dessiner')}><Sparkles size={15} /> Dessiner avec Watson</button><button class="bouton" onClick={() => setPanneau('brief')}>Brief Claude Design</button></div></div>
      )}
      {d.maquettes.length > 0 && (
        <section class="pile" style="gap:18px">
          {parEcran.filter((e) => e.liste.length).map((e) => (
            <div key={e.id} class="pile" style="gap:8px">
              <div class="ligne" style="gap:8px"><Frame size={15} color="#71717A" /><strong>{e.nom}</strong><span class="doux petit">{e.application}</span>{e.version && <span class="pastille-version">{e.version}</span>}</div>
              <div class="galerie">{e.liste.map((m) => <Vignette key={m.id} projet={projet} m={m} ouvrir={setVue} />)}</div>
            </div>
          ))}
          {libres.length > 0 && <div class="pile" style="gap:8px"><strong>Sans écran rattaché</strong><div class="galerie">{libres.map((m) => <Vignette key={m.id} projet={projet} m={m} ouvrir={setVue} />)}</div></div>}
          {parEcran.some((e) => !e.liste.length) && <p class="doux petit">Sans maquette : {parEcran.filter((e) => !e.liste.length).map((e) => e.nom).join(', ')}.</p>}
        </section>
      )}
      {vue && (vue.proposition
        ? <div class="visionneuse" onClick={() => setVue(null)}><div class="visionneuse-corps seule" onClick={(e) => e.stopPropagation()}><div class="visionneuse-scene"><Rendu projet={projet} m={vue} proposition largeurCadre={vue.support === 'mobile' ? 390 : Math.min(1280, window.innerWidth - 120)} /></div>
            <button class="bouton icone visionneuse-fermer" aria-label="Fermer" onClick={() => setVue(null)}><X size={15} /></button></div></div>
        : <Visionneuse projet={projet} m={d.maquettes.find((x) => x.id === vue.id) || vue} d={d} fermer={() => setVue(null)} faire={faire} reprendre={reprendre} occupe={occupe} />)}
    </>
  );
}
