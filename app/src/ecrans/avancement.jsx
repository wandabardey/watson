// Avancement par écran : de la maquette imaginée au code livré. Watson lit le dépôt de code de l'application sur ce
// poste (branche principale, branches de travail, étiquettes de livraison) ; le lien entre un écran et ses fichiers
// de code se pose ici, avec des suggestions.
import { useEffect, useState } from 'preact/hooks';
import { AlertTriangle, GitBranch, Link2, Search, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, Entete } from './commun.jsx';

const COULEURS = { a_maquetter: '#D4D4D8', maquette: '#C4B5FD', maquette_validee: '#8B5CF6', en_cours: '#F59E0B', en_code: '#38BDF8', livre: '#10B981' };
const date = (d) => (d ? String(d).split('-').reverse().join('/') : '');

function Lien({ projet, e, fermer, recevoir }) {
  const [fichiers, setFichiers] = useState(e.fichiers.join('\n'));
  const [route, setRoute] = useState(e.route || '');
  const [sugg, setSugg] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const base = `/projets/${projet.id}/avancement`;
  const chercher = async () => { setMessage(null); try { setSugg((await appel(`${base}/suggestions`, { corps: { ecran: e.id } })).suggestions); } catch (x) { setMessage(x.message); } };
  const enregistrer = async () => {
    setOccupe(true); setMessage(null);
    try { recevoir(await appel(`${base}/lier`, { corps: { ecran: e.id, fichiers: fichiers.split('\n').map((x) => x.trim()).filter(Boolean), route } })); fermer(); } catch (x) { setMessage(x.message); } finally { setOccupe(false); }
  };
  const ajouter = (f) => { const l = fichiers.split('\n').map((x) => x.trim()).filter(Boolean); if (!l.includes(f)) setFichiers([...l, f].join('\n')); };
  return (
    <div class="visionneuse" onClick={fermer}>
      <div class="carte pile" style="max-width:640px;width:100%;margin:auto" onClick={(x) => x.stopPropagation()}>
        <div class="ligne"><strong class="espace">{e.nom} : lien avec le code</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
        <span class="doux">{e.application_nom ? `Application ${e.application_nom}. ` : ''}Les fichiers qui portent cet écran dans le dépôt de code, et son adresse dans l'application (pour l'app en direct).</span>
        {message && <p class="encart e-rouge">{message}</p>}
        <label class="champ">Fichiers (un par ligne, chemin depuis la racine du dépôt)<textarea rows={4} value={fichiers} onInput={(x) => setFichiers(x.currentTarget.value)} placeholder="src/app/expeditions/saisie-expedition.component.ts" /></label>
        <label class="champ">Adresse de l'écran dans l'application<input value={route} onInput={(x) => setRoute(x.currentTarget.value)} placeholder="/expeditions/nouvelle" /></label>
        {e.depot && <div><button class="bouton" onClick={chercher}><Search size={15} /> Chercher dans le code</button></div>}
        {sugg && (sugg.length === 0 ? <span class="doux">Rien qui ressemble à cet écran dans le dépôt.</span> : (
          <div class="pile" style="gap:4px">{sugg.map((s) => <button key={s.fichier} class="bouton icone" style="justify-content:flex-start" onClick={() => ajouter(s.fichier)}>+ {s.fichier}</button>)}</div>
        ))}
        <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={enregistrer}><Link2 size={15} /> Enregistrer le lien</button><button class="bouton" onClick={fermer}>Annuler</button></div>
      </div>
    </div>
  );
}

export function Avancement({ projet, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState({ app: '', version: '', etat: '' });
  const [lien, setLien] = useState(null);
  useEffect(() => { appel(`/projets/${projet.id}/avancement`).then(setD).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const lignes = d.ecrans.filter((e) => (!filtre.app || e.application === filtre.app) && (!filtre.version || (e.version || 'MVP') === filtre.version) && (!filtre.etat || e.etat === filtre.etat));
  const total = d.ecrans.length || 1;
  return (
    <>
      <Entete titre="Avancement des écrans" description="Chaque écran est d'abord une maquette, validée, puis codée sur une branche, fusionnée, et enfin livrée dans une version de l'application. Watson lit le dépôt de code sur ce poste, sans rien y modifier." />
      <div class="carte pile" style="margin-bottom:14px">
        <div class="av-barre">{Object.keys(d.etats).map((k) => d.compte[k] > 0 && <div key={k} title={`${d.etats[k]} : ${d.compte[k]}`} style={`flex:${d.compte[k]};background:${COULEURS[k]}`} />)}</div>
        <div class="ligne" style="gap:16px">
          {Object.entries(d.etats).map(([k, l]) => (
            <button key={k} class={`av-legende ${filtre.etat === k ? 'actif' : ''}`} onClick={() => setFiltre({ ...filtre, etat: filtre.etat === k ? '' : k })}>
              <i style={`background:${COULEURS[k]}`} /> {l} <strong>{d.compte[k]}</strong> <span class="doux">{Math.round((100 * d.compte[k]) / total)} %</span>
            </button>
          ))}
        </div>
        {d.applications.some((a) => !a.depot) && <span class="doux" style="font-size:12px">{d.applications.filter((a) => !a.depot).map((a) => a.nom).join(', ')} : pas de dépôt de code indiqué sur ce poste (Administration du projet), l'avancement s'arrête à la maquette.</span>}
      </div>
      <div class="ligne" style="margin-bottom:10px">
        {d.applications.length > 1 && <select class="saisie" value={filtre.app} onChange={(e) => setFiltre({ ...filtre, app: e.currentTarget.value })}><option value="">Toutes les applications</option>{d.applications.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>}
        {d.versions.length > 0 && <select class="saisie" value={filtre.version} onChange={(e) => setFiltre({ ...filtre, version: e.currentTarget.value })}><option value="">Toutes les versions</option>{d.versions.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
      </div>
      <div class="carte" style="padding:0;overflow:auto">
        <table class="tableau">
          <thead><tr><th>Écran</th><th>Version</th><th>État</th><th>Maquette</th><th>Code</th><th /></tr></thead>
          <tbody>
            {lignes.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.nom}</strong><div class="doux" style="font-size:12px">{e.id}{e.application_nom ? ` · ${e.application_nom}` : ''}</div></td>
                <td>{e.version || (d.versions[0] || '')}</td>
                <td><span class="av-etat" style={`--c:${COULEURS[e.etat]}`}>{e.etat_libelle}{e.etat === 'livre' && e.code?.livre_dans ? ` en ${e.code.livre_dans}` : ''}</span>
                  {e.alertes.map((a) => <div key={a} class="av-alerte"><AlertTriangle size={12} /> {a}</div>)}</td>
                <td>{e.maquette ? <button class="av-lien" onClick={() => aller?.('maquettes')}>{e.maquette.titre}</button> : <span class="doux">Aucune</span>}
                  {e.maquette && <div class="doux" style="font-size:12px">{e.validee ? `Validée le ${date(e.validee.validee)}` : `Non validée · ${date(e.maquette.date)}`}{e.maquettes > 1 ? ` · ${e.maquettes} versions` : ''}</div>}</td>
                <td style="font-size:13px">
                  {!e.depot ? <span class="doux">Pas de dépôt</span> : !e.fichiers.length ? <span class="doux">Non relié</span> : (
                    <>
                      <div>{e.fichiers.length} fichier{e.fichiers.length > 1 ? 's' : ''}{e.route ? ` · ${e.route}` : ''}</div>
                      {e.code?.derniere && <div class="doux" style="font-size:12px">Modifié le {date(e.code.derniere.date)}{e.code.derniere_livree ? `, livré en ${e.code.derniere_livree}` : ''}</div>}
                      {e.code?.branches.map((b) => <div key={b.nom} class="doux" style="font-size:12px"><GitBranch size={11} /> {b.nom} ({b.commits})</div>)}
                      {e.code?.non_enregistre && <div class="doux" style="font-size:12px">Modifications non enregistrées sur le poste</div>}
                    </>
                  )}
                </td>
                <td><button class="bouton icone" title="Relier au code" onClick={() => setLien(e)}><Link2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lien && <Lien projet={projet} e={lien} fermer={() => setLien(null)} recevoir={setD} />}
    </>
  );
}
