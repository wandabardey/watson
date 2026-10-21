import { useEffect, useState } from 'preact/hooks';
import { appel } from '../api.js';

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
