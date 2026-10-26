import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { appel } from '../api.js';
import imgDebout from '../images/watson-debout.png';
import imgSalue from '../images/watson-salue.png';
import imgLit from '../images/watson-lit.png';
import imgEcrit from '../images/watson-ecrit.png';
import imgQuestion from '../images/watson-question.png';
import imgIdee from '../images/watson-idee.png';
import imgValide from '../images/watson-valide.png';
import imgJoie from '../images/watson-joie.png';
import imgCode from '../images/watson-code.png';
import imgCoeur from '../images/watson-coeur.png';
import imgRange from '../images/watson-range.png';
import imgFusee from '../images/watson-fusee.png';
import imgMaquette from '../images/watson-maquette.png';

// Charge une vue du moteur et gère l'attente et l'erreur.
export function useVue(chemin, deps = []) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const recharger = () => appel(chemin).then((d) => { setDonnees(d); setErreur(null); }).catch((e) => setErreur(e.message));
  useEffect(() => { setDonnees(null); recharger(); }, [chemin, ...deps]);
  return { donnees, erreur, recharger };
}

export function Attente({ erreur }) {
  return erreur ? <p class="encart e-rouge">{erreur}</p> : <p class="chargement">Chargement…</p>;
}

export const STATUT = {
  validee: ['Validée', 'b-vert'], proposee: ['Proposée', 'b-ambre'], obsolete: ['Obsolète', 'b-gris'], introuvable: ['Introuvable', 'b-rouge']
};
export const GRAVITE = { erreur: ['Incohérence', 'e-rouge'], trou: ['Information manquante', 'e-orange'], alerte: ['À vérifier', 'e-indigo'] };

export function Statut({ s }) {
  const [t, c] = STATUT[s] || [s, 'b-gris'];
  return <span class={`badge ${c}`}>{t}</span>;
}

// En-tête d'un écran : le titre et la phrase qui dit à quoi il sert ; les actions principales montent dans la barre du
// haut (elles restent dans la page s'il n'y a pas de barre, sur l'accueil général par exemple).
export function Entete({ titre, description, children, actionsIci = false }) {
  const [cible, setCible] = useState(actionsIci ? null : undefined);
  useEffect(() => { if (!actionsIci) setCible(document.getElementById('barre-actions') || null); }, []);
  return (
    <div class="entete">
      <div class="pile" style="gap:4px;flex:1 1 420px;min-width:0">
        <h1>{titre}</h1>
        {description && <p class="doux entete-texte">{description}</p>}
      </div>
      {children && cible && createPortal(<div class="ligne barre-actions-ecran">{children}</div>, cible)}
      {children && cible !== undefined && <div class={`ligne entete-actions ${cible ? '' : 'toujours'}`}>{children}</div>}
    </div>
  );
}

export function Point({ p }) {
  const [titre, classe] = GRAVITE[p.gravite] || ['Point', 'e-indigo'];
  return <div class={`encart ${classe}`}><span><strong>{titre}.</strong> {p.question || p.message}</span></div>;
}

// Connexion du compte Claude (page d'Anthropic, Watson ne voit pas les identifiants).
export function ConnexionClaude({ claude, setClaude, usage }) {
  const [attente, setAttente] = useState(false);
  if (claude?.connecte) return null;
  const connecter = async () => {
    setAttente(true);
    await appel('/claude/connexion', { corps: {} }).catch(() => {});
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const c = (await appel('/etat')).claude;
      if (c?.connecte) { setClaude(c); break; }
    }
    setAttente(false);
  };
  return (
    <div class="encart e-indigo"><Sparkles size={18} />
      <span class="espace">{usage} utilise ton compte Claude. Connecte-le une fois : la page d'Anthropic s'ouvre, Watson ne voit pas tes identifiants.</span>
      <button class="bouton" disabled={attente} onClick={connecter}>{attente ? 'En attente de la connexion…' : 'Connecter mon compte Claude'}</button>
    </div>
  );
}

// Watson, la mascotte, selon ce qui se passe dans l'application.

// D'autres poses viendront : une humeur inconnue retombe sur « debout ».
const HUMEURS = {
  debout: imgDebout,     // présent, disponible : en-têtes, panneau de conversation
  salue: imgSalue,       // accueil, connexion, bienvenue
  lit: imgLit,           // Claude lit des documents, cherche dans la base
  ecrit: imgEcrit,       // Watson rédige
  note: imgEcrit,        // invitation à alimenter, page vide
  question: imgQuestion, // il manque quelque chose, une question à poser, une erreur
  reflechit: imgLit,     // Claude travaille
  idee: imgIdee,         // une suggestion, une piste
  valide: imgValide,     // c'est vérifié, conforme
  joie: imgJoie,         // réussite, c'est fait
  code: imgCode,         // passage en code
  coeur: imgCoeur,       // merci, remerciements, rien en attente
  range: imgRange,       // propositions rangées, prêtes à trier
  fusee: imgFusee,       // livraison, publication, mise à jour
  maquette: imgMaquette, // maquettes, design system, app en direct
};
export const HUMEURS_WATSON = Object.keys(HUMEURS);

export const DEVISE = 'Réglementaire, mon cher Watson.';

export function Watson({ humeur = 'salue', hauteur = 160, flotte = true, style = '' }) {
  return <img class={`watson ${flotte ? 'flotte' : ''}`} src={HUMEURS[humeur] || imgDebout} alt="" aria-hidden="true" style={`height:${hauteur}px;width:auto;${style}`} />;
}
