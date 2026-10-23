// Ce que Watson sait de l'écran courant (zone, élément ouvert) et les appels au panneau de conversation depuis
// n'importe quel écran. Petit magasin partagé, sans dépendance.
import { useEffect } from 'preact/hooks';

let contexte = { zone: '', libelle: '', element: null };
const abonnes = new Set();
const demandes = new Set();

export const lireContexte = () => contexte;
export function suivreContexte(f) { abonnes.add(f); f(contexte); return () => abonnes.delete(f); }
export function definirContexte(c) { contexte = { ...contexte, ...c }; abonnes.forEach((f) => f(contexte)); }

// L'élément ouvert à l'écran (une maquette, une règle, une évolution…), pour que Watson comprenne « ça ».
export function useElementWatson(element, deps = []) {
  useEffect(() => {
    definirContexte({ element: element || null });
    return () => definirContexte({ element: null });
  }, deps);
}

// Ouvre le panneau Watson, avec un message prérempli (envoyé tout de suite si `envoyer`).
export function ouvrirWatson(demande = {}) { demandes.forEach((f) => f(demande)); }
export function surOuverture(f) { demandes.add(f); return () => demandes.delete(f); }

// Le même, sous forme de composant, à placer n'importe où dans le rendu d'un écran.
export function ElementWatson({ type, id, nom }) {
  useElementWatson(id ? { type, id, nom } : null, [id, nom]);
  return null;
}
