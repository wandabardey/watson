// Vue d'ensemble du projet : on parle à Watson tout de suite (la saisie part dans le panneau de conversation), puis
// ce qui bloque, la file d'actions, la maturité du cadrage, les angles morts de la base et les derniers changements.
import { useRef, useState } from 'preact/hooks';
import { ArrowRight, ArrowUp, BookOpen, CircleHelp, ExternalLink, FileText, FileUp, MessagesSquare, Palette, Paperclip, Presentation, Sparkles, TriangleAlert, X } from 'lucide-preact';
import { ouvrirWatson } from '../contexte.js';
import { ouvrirLien } from '../api.js';
import { Alimenter } from './alimenter.jsx';
import { Attente, GRAVITE, useVue, Watson } from './commun.jsx';

export function EcranAlimenter(props) { return <Alimenter {...props} />; }

const prenom = (nom) => (nom || '').split(/\s+/)[0] || '';
const lireFichier = (f) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok({ nom: f.name, contenu_base64: String(r.result).split(',')[1] || '' });
  r.onerror = ko;
  r.readAsDataURL(f);
});

// La zone de saisie de l'accueil : ce qu'on y écrit part dans la conversation avec Watson (panneau de droite).
function Composeur() {
  const [texte, setTexte] = useState('');
  const [pieces, setPieces] = useState([]);
  const fichier = useRef(null);
  const envoyer = () => { if (!texte.trim() && !pieces.length) return; ouvrirWatson({ texte: texte.trim() || 'Voici des documents pour le projet.', pieces, envoyer: true }); setTexte(''); setPieces([]); };
  return (
    <div class="composeur" onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); setPieces([...pieces, ...(await Promise.all([...e.dataTransfer.files].map(lireFichier)))]); }}>
      <div class="ligne" style="flex-wrap:nowrap;align-items:flex-start;gap:10px">
        <Sparkles size={16} class="composeur-etincelle" />
        <textarea rows={2} value={texte} placeholder="Décris ton besoin, pose une question, colle un compte rendu ou un lien, dépose un document…"
          onInput={(e) => setTexte(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }} />
      </div>
      {pieces.length > 0 && <div class="ligne" style="gap:4px">{pieces.map((p, i) => <span key={i} class="wt-piece">{p.nom}<button onClick={() => setPieces(pieces.filter((_, j) => j !== i))}><X size={11} /></button></span>)}</div>}
      <div class="ligne" style="gap:8px">
        <button class="bouton petit-b" onClick={() => fichier.current?.click()}><Paperclip size={14} /> Joindre</button>
        <input ref={fichier} type="file" multiple hidden onChange={async (e) => { const l = await Promise.all([...e.currentTarget.files].map(lireFichier)); setPieces([...pieces, ...l]); e.currentTarget.value = ''; }} />
        <span class="petit doux"><BookOpen size={13} style="vertical-align:-2px" /> Méthode 4SH, réponses sourcées</span>
        <span class="espace" />
        <button class="bouton principal-b composeur-envoyer" aria-label="Envoyer à Watson" disabled={!texte.trim() && !pieces.length} onClick={envoyer}><ArrowUp size={16} /></button>
      </div>
    </div>
  );
}

function Barre({ libelle, valeur, total }) {
  const taux = total ? Math.min(1, valeur / total) : 0;
  return (
    <div class="maturite-ligne">
      <span class="espace">{libelle}</span><strong>{total ? `${valeur}/${total}` : 'aucun'}</strong>
      <span class="maturite-barre"><i style={`width:${Math.round(taux * 100)}%;background:${taux < 0.5 ? '#F59E0B' : 'var(--indigo)'}`} /></span>
    </div>
  );
}

export function AccueilProjet({ projet, etat, aller }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/synthese`);
  if (!d) return <Attente erreur={erreur} />;
  const ap = d.avant_projet;
  const c = d.compteurs;
  const vide = c.entites + c.regles + c.acteurs === 0;
  const graves = d.points.filter((p) => p.gravite === 'erreur');
  const bloquant = graves[0] || d.points.find((p) => p.gravite === 'trou');
  const couv = Object.values(d.couverture || {});
  const couvMoy = couv.length ? Math.round(couv.reduce((s, x) => s + x.taux, 0) / couv.length) : 0;
  const etapes = [
    !ap.cahier.existe && { t: 'Rédiger le cahier des charges', s: 'Avant-projet', e: 'cahier', p: 'Haute' },
    ap.cahier.existe && ap.cahier.remplies < ap.cahier.total && { t: `Compléter le cahier des charges (${ap.cahier.total - ap.cahier.remplies} sections)`, s: 'Avant-projet', e: 'cahier', p: 'Moyenne' },
    !ap.moodboard.retenue && { t: ap.moodboard.pistes ? 'Choisir une piste du moodboard' : 'Proposer un moodboard', s: 'Avant-projet', e: 'moodboard', p: 'Moyenne' },
    c.ecrans > ap.maquettes && { t: `Maquetter ${c.ecrans - ap.maquettes} écran${c.ecrans - ap.maquettes > 1 ? 's' : ''}`, s: 'Avant-projet', e: 'maquettes', p: 'Basse' },
    d.regles.proposee > 0 && { t: `Faire valider ${d.regles.proposee} règle${d.regles.proposee > 1 ? 's' : ''} proposée${d.regles.proposee > 1 ? 's' : ''}`, s: 'Connaissance métier', e: 'regles', p: 'Haute' },
  ].filter(Boolean);
  const actions = [...d.questions.slice(0, 3).map((q) => ({ t: q.question, s: q.source || 'Question ouverte', e: 'sujets', p: 'Haute', q: true })), ...etapes].slice(0, 5);
  return (
    <div class="accueil-projet pile" style="gap:22px">
      <section class="accueil-hero">
        <Watson humeur={vide ? 'idee' : 'salue'} hauteur={112} />
        <h1>Bonjour {prenom(etat.github.compte?.nom)},<br /><span>qu'est-ce qu'on </span><span class="texte-degrade">{vide ? 'cadre' : 'avance'} aujourd'hui ?</span></h1>
        <Composeur />
        <span class="petit doux"><i class="point-vert" /> Watson connaît ce projet : {c.entites} objets métier, {c.regles} règles, {c.ecrans} écrans, {c.parcours} parcours.</span>
      </section>

      {vide ? (
        <section class="pile" style="gap:10px;max-width:880px;width:100%;margin:0 auto">
          <span class="sm-titre" style="padding:0">Commencer</span>
          <div class="exemples">
            {[['Donner ce qui existe', 'Comptes rendus, notes, captures, specs : Watson en tire la base', FileUp, () => aller('alimenter')],
              ['Cadrer le besoin', 'Le cahier des charges, section par section', FileText, () => aller('cahier')],
              ['Proposer une identité', 'Trois pistes de moodboard', Palette, () => aller('moodboard')],
              ['Préparer un atelier', 'Objectifs, trame minutée, questions', MessagesSquare, () => aller('ateliers')]].map(([t, s, I, f]) => (
              <button key={t} class="exemple" onClick={f}><strong>{t}</strong><span class="petit doux">{s}</span><I size={16} /></button>
            ))}
          </div>
        </section>
      ) : <>
        {bloquant && (
          <section class="carte bloquant">
            <div class="ligne" style="gap:8px"><span class={`badge ${bloquant.gravite === 'erreur' ? 'b-rouge' : 'b-ambre'}`}>{bloquant.gravite === 'erreur' ? 'Bloquant' : 'À éclaircir'}</span>
              {d.points.length > 1 && <span class="petit doux">et {d.points.length - 1} autre{d.points.length > 2 ? 's' : ''} point{d.points.length > 2 ? 's' : ''}</span>}</div>
            <div class="ligne" style="flex-wrap:nowrap;align-items:flex-start;gap:14px">
              <TriangleAlert size={18} color={bloquant.gravite === 'erreur' ? 'var(--rouge)' : 'var(--ambre)'} style="flex:0 0 auto;margin-top:3px" />
              <div class="pile espace" style="gap:4px"><strong style="font-size:15px">{bloquant.question || bloquant.message}</strong>
                {bloquant.question && <span class="petit doux">{bloquant.message}</span>}</div>
              <button class="bouton bouton-watson" onClick={() => ouvrirWatson({ texte: `Aide-moi à résoudre ce point : ${bloquant.question || bloquant.message}`, envoyer: true })}><Sparkles size={14} /> Résoudre avec Watson</button>
            </div>
          </section>
        )}
        <div class="grille-accueil">
          <section class="carte pile" style="gap:10px">
            <div class="ligne"><h2 class="espace">File d'actions</h2>{actions.length > 0 && <span class="badge b-violet">{actions.length}</span>}</div>
            {actions.length === 0 && <p class="doux">Rien en attente. Belle journée.</p>}
            {actions.map((x, i) => (
              <button key={i} class="action-ligne" onClick={() => aller(x.e)}>
                <span class="action-icone">{x.q ? <CircleHelp size={15} /> : <ArrowRight size={15} />}</span>
                <span class="pile espace" style="gap:1px;text-align:left;min-width:0"><span class="tronque">{x.t}</span><span class="petit doux tronque">{x.s}</span></span>
                <span class={`badge ${x.p === 'Haute' ? 'b-rouge' : x.p === 'Moyenne' ? 'b-ambre' : 'b-vert'}`}>{x.p}</span>
              </button>
            ))}
          </section>
          <section class="carte pile" style="gap:10px">
            <div class="ligne"><h2 class="espace">Maturité du cadrage</h2></div>
            <Barre libelle="Cahier des charges" valeur={ap.cahier.remplies || 0} total={ap.cahier.total || 0} />
            <Barre libelle="Règles validées" valeur={d.regles.validee} total={c.regles} />
            <Barre libelle="Écrans maquettés" valeur={Math.min(ap.maquettes, c.ecrans)} total={c.ecrans} />
            <Barre libelle="Cycles de vie complets" valeur={couvMoy} total={couv.length ? 100 : 0} />
            <div class="ligne" style="gap:6px;margin-top:4px">
              {[['Moodboard', Palette, 'moodboard', ap.moodboard.retenue ? `Piste ${ap.moodboard.retenue}` : 'Moodboard à choisir'],
                ['Proposition', Presentation, 'proposition', ap.proposition.existe ? `Proposition : ${ap.proposition.statut}` : 'Proposition à écrire']].map(([k, I, e, s]) => (
                <button key={k} class="bouton petit-b" onClick={() => aller(e)}><I size={13} /> {s}</button>
              ))}
            </div>
          </section>
          <section class="carte pile" style="gap:8px">
            <div class="ligne"><h2 class="espace">Angles morts</h2>{d.points.length > 0 && <span class="badge b-ambre">{d.points.length} à traiter</span>}</div>
            {d.points.length === 0 && <p class="doux">La base ne signale aucun trou.</p>}
            {d.points.slice(0, 4).map((p, i) => {
              const [titre] = GRAVITE[p.gravite] || ['Point'];
              return (
                <button key={i} class="angle-mort" onClick={() => ouvrirWatson({ texte: `Comment combler ce manque : ${p.question || p.message}`, envoyer: true })} title="Demander à Watson">
                  <TriangleAlert size={14} /><span class="pile espace" style="gap:1px;text-align:left"><span>{p.question || p.message}</span><span class="petit doux">{titre}</span></span>
                </button>
              );
            })}
          </section>
          <section class="carte pile" style="gap:8px">
            <div class="ligne"><h2 class="espace">Derniers changements</h2>
              <button class="bouton icone" title="Dépôt GitHub" onClick={() => ouvrirLien(`https://github.com/${d.depot}`)}><ExternalLink size={14} /></button></div>
            {d.historique.length === 0 && <p class="doux">Aucun historique.</p>}
            {d.historique.slice(0, 5).map((h, i) => (
              <div key={i} class="pile" style="gap:1px;padding-bottom:7px;border-bottom:1px solid var(--bord)">
                <span class="tronque"><strong>{h.regle}</strong> : {h.changement}</span>
                <span class="petit doux">{h.date} · {h.auteur}</span>
              </div>
            ))}
          </section>
        </div>
      </>}
    </div>
  );
}
