import { useState } from 'preact/hooks';
import { Package, Users } from 'lucide-preact';
import { Attente, Entete, Statut, useVue } from './commun.jsx';

const TYPES = { enum: 'Liste', booleen: 'Oui ou non', texte: 'Texte', nombre: 'Nombre', date: 'Date' };

export function Catalogue({ projet, aller }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/catalogue`);
  const [onglet, setOnglet] = useState(null);
  const [sel, setSel] = useState(null);
  if (!d) return <Attente erreur={erreur} />;
  const tab = onglet || d.entites[0]?.id || 'acteurs';
  const e = d.entites.find((x) => x.id === tab);
  const lignes = e ? e.attributs : d.acteurs;
  const choisi = lignes.find((l) => (l.nom || l.id) === sel) || lignes[0];
  return (
    <>
      <Entete titre="Catalogue" description="Le modèle de données du projet : les entités, leurs informations et les acteurs. Les actions vivent dans le Workflow, les règles dans Règles." />
      <div class="onglets">
        {d.entites.map((x) => (
          <button key={x.id} class={`onglet ${tab === x.id ? 'actif' : ''}`} onClick={() => { setOnglet(x.id); setSel(null); }}>
            <Package size={15} /> {x.nom} <span class="petit doux">{x.attributs.length}</span>
          </button>
        ))}
        <button class={`onglet ${tab === 'acteurs' ? 'actif' : ''}`} onClick={() => { setOnglet('acteurs'); setSel(null); }}>
          <Users size={15} /> Acteurs <span class="petit doux">{d.acteurs.length}</span>
        </button>
      </div>
      <div class="ligne" style="align-items:flex-start;gap:16px">
        <div class="pile" style="flex:1 1 520px;min-width:0">
          {e && <p>{e.description}</p>}
          <div class="cadre-tableau">
            <table class="tableau">
              <thead><tr>{e ? <><th>Information</th><th>Type</th><th>Valeurs</th><th>Utilisée par</th></> : <><th>Acteur</th><th>Description</th><th>Peut faire</th></>}</tr></thead>
              <tbody>
                {e && e.attributs.map((a) => (
                  <tr key={a.nom} class={`cliquable ${choisi === a ? 'choisi' : ''}`} onClick={() => setSel(a.nom)}>
                    <td><strong style="color:var(--indigo)">{a.libelle || a.nom}</strong></td>
                    <td class="doux">{TYPES[a.type] || a.type}</td>
                    <td class="doux">{(a.valeurs || []).join(', ')}</td>
                    <td class={a.regles.length ? '' : 'doux'}>{a.regles.length ? `${a.regles.length} règle${a.regles.length > 1 ? 's' : ''}` : 'Aucune'}</td>
                  </tr>
                ))}
                {!e && d.acteurs.map((a) => (
                  <tr key={a.id} class={`cliquable ${choisi === a ? 'choisi' : ''}`} onClick={() => setSel(a.nom)}>
                    <td><strong style="color:var(--indigo)">{a.nom}</strong></td><td class="doux">{a.description}</td><td>{a.actions.length} actions</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e && e.attributs.length === 0 && <p class="vide">Aucune information décrite pour cette entité.</p>}
          </div>
          {e && (
            <section class="pile" style="gap:8px">
              <div class="ligne"><h3 class="espace">Étapes</h3><button class="bouton" onClick={() => aller('workflow')}>Voir le cycle de vie dans le Workflow</button></div>
              <div class="ligne" style="gap:6px">{e.etapes.map((s) => <span key={s.id} class={`badge ${s.initiale ? 'b-indigo' : s.finale ? 'b-gris' : 'b-gris'}`} style="font-weight:500">{s.nom}{s.initiale ? ' · départ' : s.finale ? ' · finale' : ''}</span>)}</div>
            </section>
          )}
        </div>
        {choisi && (
          <aside class="carte detail">
            <span class="petit doux">{e ? `Information de ${e.nom.toLowerCase()}` : 'Acteur'}</span>
            <h2>{choisi.libelle || choisi.nom}</h2>
            {choisi.description && <p>{choisi.description}</p>}
            {e && <p><span class="doux">Type : </span>{TYPES[choisi.type] || choisi.type}{choisi.valeurs?.length ? ` (${choisi.valeurs.join(', ')})` : ''}</p>}
            {e && (
              <div class="pile" style="gap:6px">
                <span class="petit doux">Règles qui l'utilisent</span>
                {choisi.regles.length === 0 && <span class="doux">Aucune pour l'instant.</span>}
                {choisi.regles.map((r) => <button key={r.id} class="bouton" style="justify-content:flex-start" onClick={() => aller('regles')}>{r.titre} <Statut s={r.statut} /></button>)}
              </div>
            )}
            {!e && <div class="ligne" style="gap:6px">{choisi.actions.map((a) => <span key={a} class="badge b-gris">{a}</span>)}</div>}
          </aside>
        )}
      </div>
    </>
  );
}
