import { useEffect, useState } from 'preact/hooks';
import { Check, ClipboardPaste, FileText, Quote, Trash2, Upload, X } from 'lucide-preact';
import { appel } from '../api.js';
import { ConnexionClaude, Entete } from './commun.jsx';

const FORMATS = '.pdf,.docx,.pptx,.txt,.md,.vtt,.srt,.html,.csv,.json';
const MAX = 40 * 1024 * 1024;
const GROUPES = [
  ['entite', 'Objets métier et workflow'], ['regle', 'Règles'], ['acteur', 'Acteurs'], ['question', 'Questions ouvertes']
];

function lireFichier(f) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok({ nom: f.name, contenu_base64: String(r.result).split(',')[1] || '' });
    r.onerror = () => ko(new Error(`Lecture impossible : ${f.name}`));
    r.readAsDataURL(f);
  });
}

function Depot({ projet, lancer, reprendre }) {
  const [fichiers, setFichiers] = useState([]);
  const [textes, setTextes] = useState([]);
  const [survol, setSurvol] = useState(false);
  const [lots, setLots] = useState([]);
  useEffect(() => { appel(`/projets/${projet.id}/alimenter`).then((d) => setLots(d.lots)).catch(() => {}); }, []);
  const ajouter = (liste) => setFichiers((f) => [...f, ...Array.from(liste)]);
  const taille = fichiers.reduce((t, f) => t + f.size, 0);
  const pret = (fichiers.length || textes.some((t) => t.texte.trim())) && taille <= MAX;
  const envoyer = async () => {
    const documents = [...await Promise.all(fichiers.map(lireFichier)), ...textes.filter((t) => t.texte.trim())];
    lancer(documents, [...fichiers.map((f) => f.name), ...textes.filter((t) => t.texte.trim()).map((t) => t.titre || 'Texte collé')]);
  };
  return (
    <>
      {lots.length > 0 && (
        <div class="carte pile" style="gap:8px">
          <h3>À trier</h3>
          {lots.map((l) => (
            <div key={l.id} class="ligne">
              <FileText size={16} /><span class="espace">{l.documents.join(', ')} <span class="doux petit">· {l.date} · {l.propositions} propositions</span></span>
              <button class="bouton" onClick={() => reprendre(l.id)}>Reprendre le tri</button>
            </div>
          ))}
        </div>
      )}
      <label
        class={`depot ${survol ? 'survol' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer.files); }}
      >
        <Upload size={26} />
        <strong>Dépose ici des documents, ou clique pour les choisir</strong>
        <span class="doux petit">Comptes rendus, transcriptions Meet, notes Gemini, spécifications, présentations, mails.
          PDF, Word, PowerPoint, texte, sous-titres .vtt. Un document Google s'exporte en .docx ou .pdf (Fichier, Télécharger).</span>
        <input type="file" multiple accept={FORMATS} style="display:none" onChange={(e) => { ajouter(e.target.files); e.target.value = ''; }} />
      </label>
      {fichiers.map((f, i) => (
        <div key={i} class="ligne fichier"><FileText size={16} /><span class="espace">{f.name}</span><span class="doux petit">{Math.ceil(f.size / 1024)} Ko</span>
          <button class="bouton icone" aria-label="Retirer" onClick={() => setFichiers(fichiers.filter((_, j) => j !== i))}><X size={14} /></button></div>
      ))}
      {textes.map((t, i) => (
        <div key={i} class="carte pile" style="gap:8px">
          <div class="ligne"><input class="saisie espace" placeholder="Titre, par exemple : Comité produit du 20/10" value={t.titre}
            onInput={(e) => setTextes(textes.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)))} />
            <button class="bouton icone" aria-label="Retirer" onClick={() => setTextes(textes.filter((_, j) => j !== i))}><X size={14} /></button></div>
          <textarea class="saisie" style="min-height:160px;padding:10px 12px" placeholder="Colle ici un compte rendu, un mail, des notes…" value={t.texte}
            onInput={(e) => setTextes(textes.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))} />
        </div>
      ))}
      {taille > MAX && <p class="encart e-rouge">Plus de 40 Mo de documents : en envoyer une partie, puis le reste.</p>}
      <div class="ligne">
        <button class="bouton" onClick={() => setTextes([...textes, { titre: '', texte: '' }])}><ClipboardPaste size={16} /> Coller du texte</button>
        <span class="espace" />
        <button class="bouton principal-b" disabled={!pret} onClick={envoyer}>Faire lire à Claude</button>
      </div>
      <p class="doux petit">Claude lit les documents avec la base actuelle et propose ce qu'ils apportent. Rien n'est écrit avant ton tri.
        Les documents rejoindront le dossier « sources » du dépôt : chaque élément gardera le passage d'où il vient.</p>
    </>
  );
}

function Resume({ c, avant }) {
  const noms = Object.fromEntries((c.statuts || []).map((s) => [s.id, s.nom]));
  const ancienStatut = new Set((avant?.statuts || []).map((s) => s.id));
  const anciennes = Object.fromEntries((avant?.transitions || []).map((t) => [t.id, JSON.stringify(t)]));
  const etat = (t) => (!avant ? null : !(t.id in anciennes) ? 'nouvelle' : anciennes[t.id] !== JSON.stringify(t) ? 'modifiée' : null);
  const transitions = (c.transitions || []).filter((t) => !avant || etat(t));
  return (
    <div class="pile" style="gap:6px">
      {c.description && !avant && <p>{c.description}</p>}
      <div class="ligne" style="gap:6px">{(c.statuts || []).map((s) => (
        <span key={s.id} class={`badge ${avant && !ancienStatut.has(s.id) ? 'b-indigo' : 'b-gris'}`}>{s.nom}{avant && !ancienStatut.has(s.id) ? ' (nouveau)' : ''}</span>
      ))}</div>
      {avant && <span class="doux petit">Étapes ajoutées ou changées :</span>}
      {transitions.map((t) => (
        <span key={t.id} class="petit"><strong>{t.nom}</strong> <span class="doux">: {noms[t.de] || t.de} → {noms[t.vers] || t.vers}</span>
          {etat(t) && <span class="badge b-indigo" style="margin-left:6px">{etat(t)}</span>}</span>
      ))}
    </div>
  );
}

function Proposition({ pr, choix, changer, documents }) {
  const c = choix.contenu || pr.contenu;
  const maj = (champ, valeur) => changer({ ...choix, contenu: { ...c, [champ]: valeur } });
  const doc = documents.find((d) => d.ref === pr.citation?.document);
  const invalide = !!pr.invalide;
  return (
    <div class={`carte pile proposition ${choix.accepte && !invalide ? '' : 'ecartee'}`} style="gap:10px">
      <div class="ligne" style="align-items:flex-start">
        <button class={`case ${choix.accepte && !invalide ? 'cochee' : ''}`} disabled={invalide} aria-label={choix.accepte ? 'Écarter' : 'Accepter'}
          onClick={() => changer({ ...choix, accepte: !choix.accepte })}>{choix.accepte && !invalide && <Check size={14} />}</button>
        <div class="pile espace" style="gap:4px">
          <div class="ligne" style="gap:8px"><strong>{pr.titre}</strong>
            <span class={`badge ${pr.action === 'modifier' ? 'b-violet' : 'b-indigo'}`}>{pr.action === 'modifier' ? 'Modification' : 'Nouveau'}</span>
            {pr.remplace && <span class="badge b-violet">Remplace « {pr.remplace.titre} », qui deviendra obsolète</span>}
          </div>
          <span class="doux">{pr.pourquoi}</span>
        </div>
      </div>
      {pr.citation?.extrait && (
        <div class="citation"><Quote size={14} /><span><em>{pr.citation.extrait}</em><span class="doux petit"> · {doc?.titre || pr.citation.document}</span></span></div>
      )}
      {pr.conflit && <p class="encart e-orange">{pr.conflit}</p>}
      {invalide && <p class="encart e-rouge">Claude a mal formé cet élément : il ne peut pas être accepté tel quel. Reformule-le dans un prochain document, ou ajoute-le à la main.</p>}
      {!invalide && pr.type === 'regle' && (
        <div class="pile" style="gap:8px">
          <label class="champ">Titre<input value={c.titre} onInput={(e) => maj('titre', e.target.value)} /></label>
          <label class="champ">Énoncé<textarea value={c.enonce} onInput={(e) => maj('enonce', e.target.value)} /></label>
          <div class="segments">
            <button class={`segment ${c.statut === 'validee' ? 'actif' : ''}`} onClick={() => maj('statut', 'validee')}>En vigueur</button>
            <button class={`segment ${c.statut !== 'validee' ? 'actif' : ''}`} onClick={() => maj('statut', 'proposee')}>À confirmer</button>
          </div>
        </div>
      )}
      {!invalide && pr.type === 'acteur' && <label class="champ">Nom<input value={c.nom} onInput={(e) => maj('nom', e.target.value)} /></label>}
      {!invalide && pr.type === 'question' && <label class="champ">Question<textarea value={c.question} onInput={(e) => maj('question', e.target.value)} /></label>}
      {!invalide && pr.type === 'entite' && <Resume c={c} avant={pr.action === 'modifier' ? pr.avant : null} />}
    </div>
  );
}

function Tri({ projet, lot, fini, abandonner }) {
  const [choix, setChoix] = useState(() => Object.fromEntries(lot.propositions.map((p) => [p.index, { accepte: !p.invalide }])));
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);
  const acceptes = lot.propositions.filter((p) => choix[p.index].accepte && !p.invalide);
  const enregistrer = async () => {
    setOccupe(true); setMessage(null);
    const decisions = lot.propositions.map((p) => ({ index: p.index, accepte: choix[p.index].accepte, contenu: choix[p.index].contenu }));
    try { fini(await appel(`/projets/${projet.id}/alimenter/${lot.id}/appliquer`, { corps: { decisions } })); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  const tout = (v) => setChoix(Object.fromEntries(lot.propositions.map((p) => [p.index, { ...choix[p.index], accepte: v }])));
  return (
    <>
      <div class="carte pile" style="gap:6px">
        <span class="doux petit">Lu par Claude{lot.duree_s ? ` en ${lot.duree_s} s` : ''} · {lot.documents.map((d) => d.titre).join(', ')}</span>
        <p>{lot.resume}</p>
      </div>
      {lot.propositions.length === 0 && <div class="vide">Claude n'a rien trouvé de nouveau dans ces documents par rapport à la base.</div>}
      {lot.propositions.length > 0 && (
        <div class="ligne"><span class="doux espace">Tout est accepté par défaut : décoche ce que tu écartes, corrige le reste.</span>
          <button class="bouton" onClick={() => tout(true)}>Tout accepter</button><button class="bouton" onClick={() => tout(false)}>Tout écarter</button></div>
      )}
      {GROUPES.map(([type, titre]) => {
        const liste = lot.propositions.filter((p) => p.type === type);
        if (!liste.length) return null;
        return (
          <section key={type} class="pile">
            <h2>{titre} <span class="doux" style="font-weight:400">{liste.length}</span></h2>
            {liste.map((p) => <Proposition key={p.index} pr={p} choix={choix[p.index]} documents={lot.documents} changer={(c) => setChoix({ ...choix, [p.index]: c })} />)}
          </section>
        );
      })}
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="barre-action">
        <button class="bouton" disabled={occupe} onClick={abandonner}><Trash2 size={15} /> Abandonner ce lot</button>
        <span class="espace" />
        <span class="doux">{acceptes.length} sur {lot.propositions.length} acceptés</span>
        <button class="bouton principal-b" disabled={occupe} onClick={enregistrer}>{occupe ? 'Enregistrement…' : 'Enregistrer dans le projet'}</button>
      </div>
    </>
  );
}

function Bilan({ r, recommencer, aller }) {
  return (
    <div class="carte pile">
      <h2>{r.ecrits.length ? 'C\'est enregistré' : 'Documents gardés, rien d\'ajouté'}</h2>
      <p class="doux">{r.envoye ? 'Envoyé sur GitHub, à ton nom.' : 'Enregistré sur ce poste : partira sur GitHub à la prochaine synchronisation.'}</p>
      {r.ecrits.map((e) => <span key={e.id} class="ligne"><Check size={15} color="#166534" /> {e.titre} <span class="doux petit">({e.action})</span></span>)}
      {r.questions > 0 && <span class="ligne"><Check size={15} color="#166534" /> {r.questions} question{r.questions > 1 ? 's' : ''} ouverte{r.questions > 1 ? 's' : ''} notée{r.questions > 1 ? 's' : ''}</span>}
      {r.retouches.map((t, i) => <p key={i} class="encart e-indigo">{t}</p>)}
      {r.refus.map((x, i) => <p key={i} class="encart e-orange"><span><strong>{x.titre}</strong> n'a pas été enregistré : {x.raison}</span></p>)}
      <div class="ligne"><button class="bouton principal-b" onClick={recommencer}>Ajouter d'autres documents</button>
        <button class="bouton" onClick={() => aller('synthese')}>Voir la synthèse</button><button class="bouton" onClick={() => aller('catalogue')}>Voir le catalogue</button></div>
    </div>
  );
}

export function Alimenter({ projet, etat, aller }) {
  const [claude, setClaude] = useState(etat.claude);
  const [phase, setPhase] = useState({ nom: 'depot' });
  const [erreur, setErreur] = useState(null);
  const lancer = async (documents, noms) => {
    setErreur(null); setPhase({ nom: 'lecture', noms });
    try { setPhase({ nom: 'tri', lot: await appel(`/projets/${projet.id}/alimenter`, { corps: { documents } }) }); } catch (e) { setErreur(e.message); setPhase({ nom: 'depot' }); }
  };
  const reprendre = async (id) => {
    try { setPhase({ nom: 'tri', lot: await appel(`/projets/${projet.id}/alimenter/${id}`) }); } catch (e) { setErreur(e.message); }
  };
  const abandonner = async () => {
    await appel(`/projets/${projet.id}/alimenter/${phase.lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {});
    setPhase({ nom: 'depot' });
  };
  return (
    <>
      <Entete titre="Alimenter le projet" description="Donne à Claude ce qui existe déjà : comptes rendus, transcriptions, notes, spécifications. Il propose les objets métier, étapes, règles et questions qu'il y trouve ; tu choisis ce qui entre dans la base." />
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La lecture des documents" />
      {erreur && <p class="encart e-rouge">{erreur}</p>}
      {phase.nom === 'depot' && <Depot projet={projet} lancer={lancer} reprendre={reprendre} />}
      {phase.nom === 'lecture' && (
        <div class="carte pile" style="align-items:center;padding:40px;text-align:center">
          <span class="rond-attente" />
          <strong>Claude lit {phase.noms.length > 1 ? `${phase.noms.length} documents` : `« ${phase.noms[0]} »`}</strong>
          <span class="doux">Avec la base actuelle, pour ne proposer que ce qui est nouveau. Compte de trente secondes à deux minutes.</span>
        </div>
      )}
      {phase.nom === 'tri' && <Tri projet={projet} lot={phase.lot} fini={(r) => setPhase({ nom: 'bilan', r })} abandonner={abandonner} />}
      {phase.nom === 'bilan' && <Bilan r={phase.r} recommencer={() => setPhase({ nom: 'depot' })} aller={aller} />}
    </>
  );
}
