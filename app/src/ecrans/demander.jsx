import { useEffect, useState } from 'preact/hooks';
import { ArrowUp, Scale, Sparkles } from 'lucide-preact';
import { appel } from '../api.js';
import { ConnexionClaude, Entete, Watson } from './commun.jsx';

const VERDICT = { oui: 'b-vert', non: 'b-rouge', depend: 'b-violet', partiel: 'b-ambre', inconnu: 'b-ambre', resume: 'b-indigo' };

export function Demander({ projet, etat, questionInitiale, integre }) {
  const [q, setQ] = useState('');
  const [portee, setPortee] = useState('travail');
  const [fil, setFil] = useState([]);
  const [claude, setClaude] = useState(etat.claude);
  const poser = async (e, texte) => {
    e?.preventDefault();
    const question = (texte ?? q).trim(); if (!question) return;
    setQ('');
    const id = Date.now();
    setFil((f) => [{ id, question }, ...f]);
    try {
      const r = await appel(`/projets/${projet.id}/demander`, { corps: { question, portee } });
      setFil((f) => f.map((x) => (x.id === id ? { ...x, r } : x)));
    } catch (err) { setFil((f) => f.map((x) => (x.id === id ? { ...x, erreur: err.message } : x))); }
  };
  useEffect(() => { if (questionInitiale) poser(null, questionInitiale); }, []);
  return (
    <>
      {!integre && <Entete titre="Poser une question" description="Claude répond à partir de la connaissance du projet, et cite ses sources : règle, décision, date, auteur." />}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="Cette fonction" />
      <form class="ligne" onSubmit={poser} style="padding:8px 8px 8px 16px;border-radius:16px;box-shadow:0 0 0 1px var(--bord),0 6px 16px rgba(24,24,27,.06)">
        <input style="flex:1;border:0;outline:none;min-height:36px" placeholder="Par exemple : qui peut annuler une expédition ?" value={q} onInput={(e) => setQ(e.target.value)} />
        <select class="saisie" value={portee} onChange={(e) => setPortee(e.target.value)}><option value="travail">Version de travail</option><option value="production">Production</option><option value="histoire">Toute l'histoire</option></select>
        <button class="bouton principal-b" aria-label="Envoyer"><ArrowUp size={18} /></button>
      </form>
      {fil.length === 0 && !integre && (
        <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={190} />
          <span>Je réponds à partir de la base du projet, et je te dis toujours d'où vient la réponse.</span></div>
      )}
      {fil.map((x) => (
        <section key={x.id} class="pile">
          <p style="align-self:flex-end;max-width:80%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:#18181B;color:#fff">{x.question}</p>
          {!x.r && !x.erreur && <p class="ligne doux"><Watson humeur="reflechit" buste hauteur={56} />Je cherche dans la base du projet…</p>}
          {x.erreur && <p class="encart e-rouge">{x.erreur}</p>}
          {x.r && (
            <div class="carte pile">
              <span class={`badge ${VERDICT[x.r.verdict] || 'b-indigo'}`} style="align-self:flex-start">{x.r.libelle_verdict}</span>
              {x.r.paragraphes.map((p, i) => <p key={i}>{p}</p>)}
              {x.r.sources.length > 0 && <strong>Sur quoi je m'appuie</strong>}
              {x.r.sources.map((s, i) => (
                <div key={i} class="ligne" style="align-items:flex-start;padding:10px 12px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--bord)">
                  <Scale size={16} color="#4338CA" />
                  <span class="pile espace" style="gap:2px"><span><span class="petit doux">{s.type}</span> <strong>{s.nom}</strong> {s.statut && <span class="badge b-gris">{s.statut}</span>} {s.verifiee === false && <span class="badge b-rouge">introuvable dans la base</span>}</span><span class="petit doux">{s.trace}</span></span>
                </div>
              ))}
              {x.r.trou && <p class="encart e-orange ligne" style="flex-wrap:nowrap"><Watson humeur="reflechit" buste hauteur={44} flotte={false} /><span>{x.r.trou}</span></p>}
              <span class="petit doux">Répondu par {x.r.modele} en {Math.round(x.r.duree_ms / 1000)} s.</span>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
