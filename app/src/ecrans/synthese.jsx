import { ExternalLink } from 'lucide-preact';
import { ouvrirLien } from '../api.js';
import { Attente, Entete, GRAVITE, useVue } from './commun.jsx';

export function Synthese({ projet, aller }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/synthese`);
  if (!d) return <Attente erreur={erreur} />;
  const ouverts = d.points.length;
  const tuiles = [
    ['Entités', d.compteurs.entites, 'catalogue'], ['Règles', d.compteurs.regles, 'regles'], ['Acteurs', d.compteurs.acteurs, 'catalogue'],
    ['Points à trancher', ouverts, 'regles'], ['Spec figée', d.versions.derniere || 'aucune', 'versions']
  ];
  return (
    <>
      <Entete titre={d.projet.nom} description={d.projet.description}>
        <button class="bouton" onClick={() => ouvrirLien(`https://github.com/${d.depot}`)}><ExternalLink size={15} /> Dépôt GitHub</button>
      </Entete>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px">
        {tuiles.map(([t, n, e]) => (
          <button key={t} class="carte pile" style="gap:4px;text-align:left;border:0;cursor:pointer" onClick={() => aller(e)}>
            <span class="doux">{t}</span><strong style="font-size:26px">{n}</strong>
          </button>
        ))}
      </div>
      <div class="ligne" style="align-items:flex-start;gap:16px">
        <section class="carte pile" style="flex:2 1 460px">
          <h2>Règles</h2>
          <div class="ligne">
            <span class="badge b-vert">{d.regles.validee} validées</span>
            <span class="badge b-ambre">{d.regles.proposee} proposées, pas encore en vigueur</span>
            <span class="badge b-gris">{d.regles.obsolete} obsolètes</span>
          </div>
          <h2 style="margin-top:8px">Ce que la base ne dit pas encore</h2>
          {d.points.length === 0 && <p class="doux">Aucun point ouvert.</p>}
          {d.points.slice(0, 8).map((p, i) => {
            const [titre, classe] = GRAVITE[p.gravite] || ['Point', 'e-indigo'];
            return <div key={i} class={`encart ${classe}`}><span><strong>{titre}.</strong> {p.question || p.message}</span></div>;
          })}
          {d.points.length > 8 && <span class="doux">… et {d.points.length - 8} autres.</span>}
        </section>
        <section class="carte pile" style="flex:1 1 300px">
          <h2>Derniers changements</h2>
          {d.historique.length === 0 && <p class="doux">Aucun historique.</p>}
          {d.historique.map((h, i) => (
            <div key={i} class="pile" style="gap:2px;padding-bottom:10px;border-bottom:1px solid #F4F4F5">
              <span><strong>{h.regle}</strong> : {h.changement}</span>
              <span class="petit doux">{h.date} · {h.auteur}{h.raison ? ` · ${h.raison}` : ''}</span>
            </div>
          ))}
          {d.glossaire.length > 0 && <h2 style="margin-top:8px">Glossaire</h2>}
          {d.glossaire.map((g) => <p key={g.terme}><strong>{g.terme}</strong> <span class="doux">{g.definition}</span></p>)}
        </section>
      </div>
    </>
  );
}
