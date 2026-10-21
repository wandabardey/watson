import { useEffect, useState } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { appel } from '../api.js';
import imgSalue from '../images/watson-salue.png';
import imgSalueBuste from '../images/watson-salue-buste.png';
import imgLit from '../images/watson-lit.png';
import imgLitBuste from '../images/watson-lit-buste.png';
import imgEcrit from '../images/watson-ecrit.png';
import imgNote from '../images/watson-note.png';
import imgReflechit from '../images/watson-reflechit.png';
import imgReflechitBuste from '../images/watson-reflechit-buste.png';

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

export function Entete({ titre, description, children }) {
  return (
    <div class="ligne" style="align-items:flex-end">
      <div style="flex:1 1 420px;display:flex;flex-direction:column;gap:6px">
        <h1>{titre}</h1>
        {description && <p class="doux">{description}</p>}
      </div>
      {children}
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

const HUMEURS = {
  salue: [imgSalue, imgSalueBuste],      // accueil, connexion, bienvenue
  lit: [imgLit, imgLitBuste],            // Claude lit des documents
  ecrit: [imgEcrit, imgEcrit],           // c'est noté, enregistré
  note: [imgNote, imgNote],              // carnet en main : invitation à alimenter, page vide
  reflechit: [imgReflechit, imgReflechitBuste] // il cherche, il manque quelque chose, une erreur
};

export const DEVISE = 'Réglementaire, mon cher Watson.';

export function Watson({ humeur = 'salue', hauteur = 160, buste = false, flotte = true, style = '' }) {
  const [entier, haut] = HUMEURS[humeur] || HUMEURS.salue;
  return <img class={`watson ${flotte ? 'flotte' : ''}`} src={buste ? haut : entier} alt="" aria-hidden="true" style={`height:${hauteur}px;${style}`} />;
}