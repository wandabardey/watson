import { useState } from 'preact/hooks';
import { Check } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { Attente, Entete, Point, Statut, useVue } from './commun.jsx';

const FILTRES = [['tous', 'Toutes'], ['validee', 'Validées'], ['proposee', 'À valider'], ['obsolete', 'Obsolètes']];

function Valider({ projet, regle, fait }) {
  const [source, setSource] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);
  const valider = async () => {
    setOccupe(true); setMessage(null);
    try {
      const r = await appel(`/projets/${projet.id}/regles/${regle.id}/valider`, { corps: { source: source || undefined } });
      fait(r.envoye ? 'Règle validée et enregistrée sur GitHub.' : 'Règle validée sur ce poste ; elle partira sur GitHub à la prochaine synchronisation.');
    } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  return (
    <div class="pile" style="gap:8px;padding:12px;border-radius:12px;background:#FAFAFA;box-shadow:inset 0 0 0 1px var(--bord)">
      <label class="champ">D'où vient la décision<input placeholder="Par exemple : comité produit du 21/10/2026" value={source} onInput={(e) => setSource(e.target.value)} /></label>
      <button class="bouton principal-b" disabled={occupe} onClick={valider}><Check size={16} />{occupe ? 'Enregistrement…' : 'Valider la règle'}</button>
      <span class="petit doux">Signée à ton nom, datée du jour, enregistrée dans le dépôt GitHub du projet.</span>
      {message && <p class="encart e-rouge">{message}</p>}
    </div>
  );
}

export function Regles({ projet, aller }) {
  const { donnees: d, erreur, recharger } = useVue(`/projets/${projet.id}/regles`);
  const [filtre, setFiltre] = useState('tous');
  const [sel, setSel] = useState(null);
  const [info, setInfo] = useState(null);
  if (!d) return <Attente erreur={erreur} />;
  const liste = d.regles.filter((r) => filtre === 'tous' || r.statut === filtre);
  const r = d.regles.find((x) => x.id === sel) || liste[0];
  const compte = (s) => d.regles.filter((x) => s === 'tous' || x.statut === s).length;
  return (
    <>
      <Entete titre="Règles et décisions" description="Les règles du projet, leur statut et leur histoire : qui a décidé quoi, quand, et ce que chaque règle remplace." />
      <div class="segments">{FILTRES.map(([k, t]) => <button key={k} class={`segment ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{t} {compte(k)}</button>)}</div>
      {info && <p class="encart e-vert">{info}</p>}
      <div class="ligne" style="align-items:flex-start;gap:16px">
        <div class="cadre-tableau" style="flex:1 1 480px;min-width:0">
          <table class="tableau">
            <thead><tr><th>Règle</th><th>Statut</th><th>Actions concernées</th></tr></thead>
            <tbody>
              {liste.map((x) => (
                <tr key={x.id} class={`cliquable ${r === x ? 'choisi' : ''}`} onClick={() => setSel(x.id)}>
                  <td><strong style="color:var(--indigo)">{x.titre}</strong>{x.points.length > 0 && <span class="badge b-orange" style="margin-left:6px">{x.points.length} point{x.points.length > 1 ? 's' : ''}</span>}</td>
                  <td><Statut s={x.statut} /></td>
                  <td class="doux">{x.actions.map((a) => a.nom).join(', ') || 'Aucune'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r && (
          <aside class="carte detail" style="flex-basis:380px">
            <div class="ligne"><Statut s={r.statut} /><span class="petit doux">{r.type === 'table_decision' ? 'Table de décision' : 'Règle'}{r.entite ? ` · ${r.entite}` : ''}</span></div>
            <div class="ligne"><h2 class="espace">{r.titre}</h2><BoutonComite projet={projet} cible={{ type: 'regle', id: r.id }} /></div>
            <p>{r.enonce}</p>
            {r.remplace && <p class="encart e-indigo">Remplace « {r.remplace.titre} ».</p>}
            {r.remplacee_par && <p class="encart e-indigo">Remplacée par « {r.remplacee_par.titre} ».</p>}
            {r.lignes.length > 0 && (
              <div class="cadre-tableau"><table class="tableau"><thead><tr><th>Situation</th><th>Alors</th></tr></thead><tbody>
                {r.lignes.map((l, i) => <tr key={i}><td>{Object.entries(l.si).map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v === true ? 'oui' : v === false ? 'non' : v}`).join(', ')}</td><td>{l.alors}{l.note ? <div class="petit doux">{l.note}</div> : null}</td></tr>)}
              </tbody></table></div>
            )}
            {r.points.map((p, i) => <Point key={i} p={p} />)}
            {r.actions.length > 0 && <div class="ligne" style="gap:6px"><span class="petit doux">Actions :</span>{r.actions.map((a) => <button key={a.id} class="badge b-gris" style="border:0;cursor:pointer" onClick={() => aller('workflow')}>{a.nom}</button>)}</div>}
            {r.source && <p class="petit"><span class="doux">Source : </span>{r.source}</p>}
            <div class="pile" style="gap:6px">
              <span class="petit doux">Histoire</span>
              {r.historique.map((h, i) => <span key={i} class="petit">{h.date} · <strong>{h.auteur}</strong> · {h.changement}{h.raison ? ` (${h.raison})` : ''}</span>)}
            </div>
            {r.statut === 'proposee' && <Valider projet={projet} regle={r} fait={(m) => { setInfo(m); recharger(); }} />}
          </aside>
        )}
      </div>
    </>
  );
}
