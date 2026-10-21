import { useState } from 'preact/hooks';
import { Attente, Entete, useVue } from './commun.jsx';

const GENRES = { 'ajouté': 'b-vert', 'modifié': 'b-violet', 'remplacé': 'b-rouge', 'rendu obsolète': 'b-ambre', 'supprimé': 'b-gris' };

function Comparaison({ projet, de, a }) {
  const { donnees: c, erreur } = useVue(`/projets/${projet.id}/comparer?de=${encodeURIComponent(de)}&a=${encodeURIComponent(a)}`, [de, a]);
  if (!c) return <Attente erreur={erreur} />;
  if (!c.changements.length) return <p class="vide">Aucune différence entre ces deux versions.</p>;
  return (
    <div class="cadre-tableau"><table class="tableau"><thead><tr><th>Changement</th><th>Élément</th><th>Détail</th></tr></thead><tbody>
      {c.changements.map((x, i) => (
        <tr key={i}><td><span class={`badge ${GENRES[x.changement] || 'b-gris'}`}>{x.changement}</span></td><td><strong>{x.nom}</strong> <span class="petit doux">{x.type}</span></td>
          <td class="doux">{x.champs ? `Ce qui change : ${x.champs.join(', ')}` : x.remplace_par ? 'Remplacé par une nouvelle règle' : x.remplace ? 'Remplace une règle' : ''}</td></tr>
      ))}
    </tbody></table></div>
  );
}

export function Versions({ projet }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/versions`);
  const [de, setDe] = useState(null);
  const [a, setA] = useState('travail');
  if (!d) return <Attente erreur={erreur} />;
  const choix = [...d.versions.map((v) => v.version), 'travail'];
  const depart = de || d.derniere || 'travail';
  const envs = Object.entries(d.environnements);
  return (
    <>
      <Entete titre="Versions" description="Une version de la spec est une photo figée de la connaissance. Tout le reste est la version de travail. Chaque livraison de code déclare la spec qu'elle applique." />
      {envs.length > 0 && (
        <div class="ligne" style="align-items:stretch;gap:12px">
          {envs.map(([nom, e]) => (
            <div key={nom} class="carte pile" style="flex:1 1 220px;gap:6px">
              <span class="badge b-indigo" style="align-self:flex-start">{nom}</span>
              <strong style="font-size:22px">{e.spec === 'travail' ? 'Version de travail' : `spec ${e.spec}`}</strong>
              {Object.entries(e.applications || {}).map(([app, v]) => <span key={app} class="doux">{app} {v}</span>)}
            </div>
          ))}
        </div>
      )}
      <section class="pile">
        <h2>Versions figées</h2>
        {d.versions.length === 0 && <p class="doux">Aucune version figée pour l'instant : tout est en version de travail.</p>}
        <div class="ligne" style="gap:10px">
          {d.versions.map((v) => (
            <div key={v.version} class="carte pile" style="gap:2px;min-width:170px">
              <strong style="font-size:17px">Spec {v.version}</strong>
              <span class="petit doux">Figée le {v.date}{v.auteur ? ` par ${v.auteur}` : ''}</span>
              {v.message && <span class="petit">{v.message}</span>}
            </div>
          ))}
          <div class="carte pile" style="gap:2px;min-width:170px;background:var(--indigo-pale)"><strong style="font-size:17px">Travail</strong><span class="petit doux">en cours</span></div>
        </div>
      </section>
      <section class="pile carte" style="background:#FAFAFA">
        <div class="ligne"><h2 class="espace">Comparer deux versions</h2>
          <span class="doux">De</span><select class="saisie" value={depart} onChange={(e) => setDe(e.target.value)}>{choix.map((v) => <option key={v} value={v}>{v === 'travail' ? 'Travail' : v}</option>)}</select>
          <span class="doux">à</span><select class="saisie" value={a} onChange={(e) => setA(e.target.value)}>{choix.map((v) => <option key={v} value={v}>{v === 'travail' ? 'Travail' : v}</option>)}</select>
        </div>
        {depart === a ? <p class="doux">Choisir deux versions différentes.</p> : <Comparaison projet={projet} de={depart} a={a} />}
      </section>
    </>
  );
}
