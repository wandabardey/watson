// Ce que Watson est en train de faire, visible depuis tous les écrans : chaque travail en cours (lecture de documents,
// rédaction, maquette…), sa phase et ce qu'il a déjà écrit. Quand un travail finit, un message le dit, avec un lien
// vers l'écran où le résultat attend. On peut changer d'écran pendant ce temps : le travail continue.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowRight, Check, TriangleAlert, X } from 'lucide-preact';
import { appel } from '../api.js';

const duree = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`);
const nombre = (n) => n.toLocaleString('fr-FR');

export function Travaux({ projet, aller }) {
  const [v, setV] = useState({ en_cours: [], finis: [] });
  const [avis, setAvis] = useState([]);
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
          const nouveaux = r.finis.filter((t) => vus.current.has(t.id) && !enCours.has(t.id));
          if (nouveaux.length) setAvis((a) => [...a, ...nouveaux].slice(-3));
        }
        vus.current = enCours;
        setV(r);
        minuterie = setTimeout(tour, r.en_cours.length ? 1500 : 5000);
      } catch { minuterie = setTimeout(tour, 8000); }
    };
    tour();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, []);
  useEffect(() => {
    if (!avis.length) return undefined;
    const t = setTimeout(() => setAvis((a) => a.slice(1)), 9000);
    return () => clearTimeout(t);
  }, [avis]);
  const ici = v.en_cours.filter((t) => !t.projet || t.projet === projet.id);
  const ailleurs = v.en_cours.length - ici.length;
  return (
    <>
      {(ici.length > 0 || ailleurs > 0) && (
        <div class="travaux" role="status" aria-live="polite">
          <strong class="petit">Watson travaille</strong>
          {ici.map((t) => (
            <button key={t.id} class="travail" onClick={() => aller(t.ecran)} title="Voir l'écran">
              <span class="travail-tete"><span class="tronque">{t.libelle}</span><span class="doux">{duree(t.duree_s)}</span></span>
              <span class="travail-barre"><i class={t.phase} /></span>
              <span class="petit doux">{t.phase_libelle}{t.caracteres > 0 ? `, ${nombre(t.caracteres)} caractères` : ''}</span>
            </button>
          ))}
          {ailleurs > 0 && <span class="petit doux">Et {ailleurs} dans un autre projet.</span>}
        </div>
      )}
      <div class="avis-pile">
        {avis.map((t) => (
          <div key={t.id} class={`avis ${t.etat === 'erreur' ? 'avis-erreur' : ''}`}>
            {t.etat === 'erreur' ? <TriangleAlert size={16} /> : <Check size={16} />}
            <span class="espace">{t.libelle} : {t.etat === 'erreur' ? `échec, ${t.erreur}` : 'terminé.'}</span>
            {t.etat !== 'erreur' && (!t.projet || t.projet === projet.id) && <button class="lien" onClick={() => { try { sessionStorage.setItem('watson.resultat', t.usage); } catch { /* rien */ } aller(t.ecran); setAvis((a) => a.filter((x) => x.id !== t.id)); }}>Voir <ArrowRight size={13} /></button>}
            <button class="bouton icone" aria-label="Fermer" onClick={() => setAvis((a) => a.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

// Le travail en cours de Watson pour un usage d'un projet (null s'il n'y en a pas), suivi tant que l'écran est ouvert.
export function useTravail(projetId, usage, actif = true) {
  const [t, setT] = useState(undefined);
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    let minuterie;
    const tour = async () => {
      try {
        const r = await appel('/travaux');
        if (!vivant) return;
        setT(r.en_cours.find((x) => x.projet === projetId && x.usage === usage) || null);
      } catch { /* on réessaie */ }
      minuterie = setTimeout(tour, 1500);
    };
    tour();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [projetId, usage, actif]);
  return t;
}

export function Avancee({ t }) {
  if (!t) return null;
  return (
    <div class="pile" style="gap:6px;align-items:center;width:min(360px,100%)">
      <span class="travail-barre" style="width:100%"><i class={t.phase} /></span>
      <span class="petit doux">{t.phase_libelle} · {duree(t.duree_s)}{t.caracteres > 0 ? ` · ${nombre(t.caracteres)} caractères écrits` : ''}</span>
    </div>
  );
}
