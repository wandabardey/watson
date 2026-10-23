// Design system du projet : les fondations (couleurs en dix nuances, typographie, rayons, espacements, ombres, motion)
// avec un aperçu vivant, le catalogue des composants (du starter 4SH ou du code existant) et leur statut. Les maquettes
// s'appuient dessus dès qu'il existe ; le passage en code le reporte dans le dépôt de l'application.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Code2, Palette, RefreshCw, Save, Sparkles } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, Entete } from './commun.jsx';

const STATUTS = { disponible: 'Disponible dans le kit', utilise: 'Utilisé dans le code', a_construire: 'À construire', sur_mesure: 'Sur mesure' };
const GENRES = { starter: 'Starter 4SH', moodboard: 'Identité du moodboard', existant: 'Code existant', libre: 'Saisie libre' };

function Apercu({ css }) {
  const polices = [...new Set([...css.matchAll(/--police-\w+: '([^']+)'/g)].map((m) => m[1]))].filter((p) => !/^(system-ui|Inter)$/.test(p));
  const style = useMemo(() => (polices.length ? `@import url('https://fonts.googleapis.com/css2?${polices.map((p) => `family=${encodeURIComponent(p)}:wght@400;600;700`).join('&')}&display=swap');\n` : '') + css, [css]);
  return (
    <div class="ds-apercu">
      <style>{style + APERCU_CSS}</style>
      <div class="ds-barre"><strong>Expéditions</strong><span class="ds-badge">12 en cours</span></div>
      <div class="ds-corps">
        <div class="ds-carte">
          <h3>Nouvelle expédition</h3>
          <label>Référence client<input value="CMD-2026-0418" readOnly /></label>
          <label class="ds-bascule"><input type="checkbox" checked /><span /> Marchandise sensible</label>
          <div class="ds-actions"><button class="ds-b ds-b1">Enregistrer</button><button class="ds-b ds-b2">Annuler</button></div>
        </div>
        <div class="ds-pile">
          <div class="ds-alerte ds-ok">Expédition EXP-0418 validée</div>
          <div class="ds-alerte ds-av">Pièce justificative manquante</div>
          <div class="ds-alerte ds-er">Transporteur non habilité</div>
          <p class="ds-texte">Le texte courant reprend la police et la taille de base. <a href="#" onClick={(e) => e.preventDefault()}>Un lien</a>.</p>
        </div>
      </div>
    </div>
  );
}

const APERCU_CSS = `
.ds-apercu { font-family: var(--police-texte); font-size: var(--taille-texte); color: var(--couleur-neutre-900); background: var(--couleur-neutre-50); border-radius: var(--rayon-grand); overflow: hidden; border: 1px solid var(--couleur-neutre-200); }
.ds-apercu h3 { font-family: var(--police-titres); font-weight: var(--graisse-titres); margin: 0 0 var(--espace-3); font-size: 1.15em; }
.ds-barre { display: flex; justify-content: space-between; align-items: center; padding: var(--espace-3) var(--espace-4); background: var(--couleur-primaire-700); color: #fff; font-family: var(--police-titres); }
.ds-badge { background: var(--couleur-secondaire-500); color: #fff; border-radius: var(--rayon-pilule); padding: 2px 10px; font-size: .8em; }
.ds-corps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--espace-4); padding: var(--espace-4); }
.ds-carte { background: #fff; border-radius: var(--rayon-defaut); box-shadow: var(--ombre-legere); padding: var(--espace-4); transition: box-shadow var(--motion-defaut) var(--motion-courbe), transform var(--motion-defaut) var(--motion-courbe); }
.ds-carte:hover { box-shadow: var(--ombre-forte); transform: translateY(-2px); }
.ds-carte label { display: flex; flex-direction: column; gap: 4px; font-size: .85em; color: var(--couleur-neutre-700); margin-bottom: var(--espace-3); }
.ds-carte input:not([type]) , .ds-carte input[readonly] { font: inherit; padding: 8px 10px; border: 1px solid var(--couleur-neutre-300); border-radius: var(--rayon-petit); transition: border-color var(--motion-rapide) var(--motion-courbe); }
.ds-carte input[readonly]:focus { outline: 2px solid var(--couleur-primaire-300); border-color: var(--couleur-primaire-500); }
.ds-bascule { flex-direction: row !important; align-items: center; gap: 8px !important; cursor: pointer; }
.ds-bascule input { position: absolute; opacity: 0; }
.ds-bascule span { width: 36px; height: 20px; border-radius: var(--rayon-pilule); background: var(--couleur-neutre-300); position: relative; transition: background var(--motion-defaut) var(--motion-courbe); }
.ds-bascule span::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform var(--motion-defaut) var(--motion-courbe); }
.ds-bascule input:checked + span { background: var(--couleur-primaire-600); }
.ds-bascule input:checked + span::after { transform: translateX(16px); }
.ds-actions { display: flex; gap: var(--espace-2); }
.ds-b { font: inherit; font-size: .9em; padding: 8px 14px; border-radius: var(--rayon-defaut); border: 1px solid transparent; cursor: pointer; transition: background var(--motion-rapide) var(--motion-courbe), transform var(--motion-rapide) var(--motion-courbe); }
.ds-b:active { transform: scale(.97); }
.ds-b1 { background: var(--couleur-primaire-600); color: #fff; }
.ds-b1:hover { background: var(--couleur-primaire-700); }
.ds-b2 { background: #fff; color: var(--couleur-neutre-800); border-color: var(--couleur-neutre-300); }
.ds-b2:hover { background: var(--couleur-neutre-100); }
.ds-pile { display: flex; flex-direction: column; gap: var(--espace-2); }
.ds-alerte { padding: 10px 12px; border-radius: var(--rayon-petit); font-size: .9em; border-left: 3px solid; }
.ds-ok { background: var(--couleur-succes-50); border-color: var(--couleur-succes-500); color: var(--couleur-succes-800); }
.ds-av { background: var(--couleur-alerte-50); border-color: var(--couleur-alerte-500); color: var(--couleur-alerte-800); }
.ds-er { background: var(--couleur-erreur-50); border-color: var(--couleur-erreur-500); color: var(--couleur-erreur-800); }
.ds-texte a { color: var(--couleur-primaire-600); }
`;

function Gamme({ c, changer }) {
  return (
    <div class="ds-gamme">
      <div class="ds-gamme-tete">
        <input type="color" value={c.base} onInput={(e) => changer(e.currentTarget.value)} aria-label={`Couleur de base ${c.nom}`} />
        <div><strong>{c.nom}</strong><div class="doux" style="font-size:12px">{c.role}</div></div>
        <input class="saisie" style="width:100px;margin-left:auto" value={c.base} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.currentTarget.value) && changer(e.currentTarget.value)} />
      </div>
      <div class="ds-nuances">
        {Object.entries(c.nuances || {}).map(([n, v]) => (
          <div key={n} title={`${n} ${v}`} style={`background:${v};color:${+n >= 500 ? '#fff' : '#18181b'}`} class={v === c.base?.toLowerCase() ? 'base' : ''}>{n}</div>
        ))}
      </div>
    </div>
  );
}

export function Design({ projet }) {
  const [d, setD] = useState(null);
  const [ds, setDs] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [onglet, setOnglet] = useState('fondations');
  const [occupe, setOccupe] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [famille, setFamille] = useState('');
  const [app, setApp] = useState('');
  const base = `/projets/${projet.id}/design`;
  const recevoir = (v) => { setD(v); setDs(v.systeme); setModifie(false); };
  useEffect(() => { appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const faire = async (quoi, f) => { setOccupe(quoi); setMessage(null); try { recevoir(await f()); } catch (e) { setMessage(e.message); } finally { setOccupe(null); } };
  const f = ds.fondations;
  const changerF = (k, v) => { setDs({ ...ds, fondations: { ...f, [k]: v } }); setModifie(true); };
  const changerCouleur = async (id, hex) => {
    const couleurs = f.couleurs.map((c) => (c.id === id ? { ...c, base: hex } : c));
    changerF('couleurs', couleurs);
    try {
      const { nuances } = await appel(`${base}/gamme`, { corps: { couleur: hex } });
      setDs((x) => ({ ...x, fondations: { ...x.fondations, couleurs: x.fondations.couleurs.map((c) => (c.id === id ? { ...c, base: hex, nuances } : c)) } }));
    } catch (e) { setMessage(e.message); }
  };
  const css = cssLocal(f);
  const changerComposant = (id, k, v) => { setDs({ ...ds, composants: ds.composants.map((c) => (c.id === id ? { ...c, [k]: v } : c)) }); setModifie(true); };
  const ajouter = () => { const n = (ds.composants || []).filter((c) => c.statut === 'sur_mesure').length + 1; setDs({ ...ds, composants: [...(ds.composants || []), { id: `sur-mesure-${n}`, nom: 'Nouveau composant', famille: 'autre', statut: 'sur_mesure', description: '' }] }); setModifie(true); };
  const comps = (ds.composants || []).filter((c) => !famille || c.famille === famille);
  const src = ds.source || {};
  const apps = d.applications.filter((a) => a.depot);
  return (
    <>
      <Entete titre="Design system" description="Les fondations visuelles validées et les composants du projet. Les maquettes s'appuient dessus, et le passage en code les reporte dans l'application. L'apparence du starter 4SH n'est jamais reprise : seule sa structure technique sert de base.">
        {modifie && <button class="bouton principal-b" disabled={occupe} onClick={() => faire('enregistrer', () => appel(base, { corps: { systeme: ds } }))}><Save size={15} /> Enregistrer</button>}
      </Entete>
      {message && <p class="encart e-rouge">{message}</p>}
      {!d.existe && (
        <div class="carte pile" style="margin-bottom:14px">
          <strong>Pas encore de design system pour ce projet</strong>
          <span class="doux">Trois départs possibles. Tu pourras tout retoucher ensuite.</span>
          <div class="ligne">
            {d.piste && <button class="bouton principal-b" disabled={occupe} onClick={() => faire('piste', () => appel(`${base}/piste`, { corps: {} }))}><Palette size={15} /> Depuis l'identité retenue « {d.piste.nom} »</button>}
            <button class="bouton" disabled={occupe} onClick={() => faire('starter', () => appel(`${base}/starter`, { corps: { kit: '@4sh/ui-kit' } }))}><Sparkles size={15} /> Catalogue du starter 4SH Angular</button>
            <button class="bouton" disabled={occupe} onClick={() => faire('starter', () => appel(`${base}/starter`, { corps: { kit: '@4sh/ui-kit-react' } }))}><Sparkles size={15} /> Starter 4SH React</button>
            {apps.length > 0 && <button class="bouton" disabled={occupe} onClick={() => setOnglet('source')}><Code2 size={15} /> Depuis le code existant</button>}
          </div>
          {occupe && <span class="doux">Watson prépare le design system…</span>}
        </div>
      )}
      {d.controles.length > 0 && <div class="encart e-orange" style="flex-direction:column;margin-bottom:14px">{d.controles.map((x) => <div key={x}>{x}</div>)}</div>}
      <div class="onglets" style="margin-bottom:14px">
        {[['fondations', 'Fondations'], ['composants', `Composants (${(ds.composants || []).length})`], ['source', 'Origine et code']].map(([k, l]) => (
          <button key={k} class={`onglet ${onglet === k ? 'actif' : ''}`} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </div>
      {onglet === 'fondations' && (
        <div class="ds-deux">
          <div class="pile">
            <div class="carte pile"><strong>Couleurs</strong>{f.couleurs.map((c) => <Gamme key={c.id} c={c} changer={(hex) => changerCouleur(c.id, hex)} />)}</div>
            <div class="carte pile">
              <strong>Typographie</strong>
              <div class="ligne">
                <label class="champ">Titres<input value={f.typo.titres} onChange={(e) => changerF('typo', { ...f.typo, titres: e.currentTarget.value })} /></label>
                <label class="champ">Texte<input value={f.typo.texte} onChange={(e) => changerF('typo', { ...f.typo, texte: e.currentTarget.value })} /></label>
                <label class="champ">Taille de base<input type="number" min="12" max="20" value={f.typo.taille} onChange={(e) => changerF('typo', { ...f.typo, taille: +e.currentTarget.value })} /></label>
              </div>
              <span class="doux" style="font-size:12px">Polices Google Fonts, chargées par les maquettes.</span>
            </div>
            <div class="carte pile">
              <strong>Formes</strong>
              <div class="ligne">
                {Object.entries(f.rayons).map(([k, v]) => (
                  <label key={k} class="champ">Rayon {k}<input type="number" min="0" max="999" value={v} onChange={(e) => changerF('rayons', { ...f.rayons, [k]: +e.currentTarget.value })} /></label>
                ))}
              </div>
              <label class="champ">Espacements (px, du plus petit au plus grand)<input value={f.espacements.join(', ')} onChange={(e) => changerF('espacements', e.currentTarget.value.split(',').map((x) => +x.trim()).filter((x) => x >= 0))} /></label>
            </div>
            <div class="carte pile">
              <strong>Motion</strong>
              <div class="ligne">
                {['rapide', 'defaut', 'lent'].map((k) => (
                  <label key={k} class="champ">{{ rapide: 'Rapide', defaut: 'Par défaut', lent: 'Lent' }[k]} (ms)<input type="number" min="0" max="1000" value={f.motion[k]} onChange={(e) => changerF('motion', { ...f.motion, [k]: +e.currentTarget.value })} /></label>
                ))}
              </div>
              <span class="doux" style="font-size:12px">Survole la carte, clique sur la bascule et les boutons de l'aperçu pour voir les animations. Elles sont coupées pour les personnes qui ont demandé moins d'animations.</span>
            </div>
          </div>
          <div class="ds-colle"><div class="doux" style="font-size:12px;margin-bottom:6px">Aperçu vivant</div><Apercu css={css} /></div>
        </div>
      )}
      {onglet === 'composants' && (
        <div class="carte pile">
          <div class="ligne">
            <select class="saisie" value={famille} onChange={(e) => setFamille(e.currentTarget.value)}>
              <option value="">Toutes les familles</option>
              {Object.entries(d.familles).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button class="bouton" onClick={ajouter}>Ajouter un composant sur mesure</button>
            {src.genre === 'starter' && <button class="bouton" disabled={occupe} onClick={() => faire('starter', () => appel(`${base}/starter`, { corps: { kit: src.kit } }))}><RefreshCw size={15} /> Relire le catalogue du kit</button>}
          </div>
          {comps.length === 0 && <span class="doux">Aucun composant. Pars du starter 4SH ou du code existant.</span>}
          <table class="tableau">
            <thead><tr><th>Composant</th><th>Famille</th><th>Statut</th><th>Description</th></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id}>
                  <td>{c.statut === 'sur_mesure' ? <input class="saisie" value={c.nom} onChange={(e) => changerComposant(c.id, 'nom', e.currentTarget.value)} /> : <><strong>{c.nom}</strong><div class="doux" style="font-size:12px">{c.id}</div></>}</td>
                  <td>{d.familles[c.famille] || c.famille}</td>
                  <td><select class="saisie" value={c.statut || 'disponible'} onChange={(e) => changerComposant(c.id, 'statut', e.currentTarget.value)}>{Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td><input class="saisie" style="width:100%" value={c.description || ''} placeholder="Usage dans ce projet" onChange={(e) => changerComposant(c.id, 'description', e.currentTarget.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onglet === 'source' && (
        <div class="pile">
          <div class="carte pile">
            <strong>Origine</strong>
            <span>{GENRES[src.genre] || 'Saisie libre'}{src.kit ? ` · ${src.kit}` : ''}{src.piste ? ` · piste ${src.piste}` : ''}{src.detecte_le ? ` · lu le ${src.detecte_le}` : ''}</span>
            {d.piste && <div><button class="bouton" disabled={occupe} onClick={() => faire('piste', () => appel(`${base}/piste`, { corps: {} }))}><Palette size={15} /> Reprendre les fondations de l'identité « {d.piste.nom} »</button></div>}
          </div>
          <div class="carte pile">
            <strong>Projet déjà codé</strong>
            <span class="doux">Watson lit le dépôt de code de l'application sur ce poste : kit et librairies, Storybook, fichiers de jetons, variables CSS. Il en tire les fondations reconnaissables et la liste des composants, sans rien modifier dans le code.</span>
            {apps.length === 0 ? <span class="doux">Aucune application n'a de dépôt de code indiqué. Renseigne-le dans Passage en code, Réglages de l'application.</span> : (
              <div class="ligne">
                <select class="saisie" value={app} onChange={(e) => setApp(e.currentTarget.value)}><option value="">Choisir l'application</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
                <button class="bouton principal-b" disabled={!app || occupe} onClick={() => faire('existant', () => appel(`${base}/existant`, { corps: { application: app } }))}><Code2 size={15} /> Lire le code</button>
              </div>
            )}
            {ds.detection && (
              <ul class="doux" style="margin:0">
                {(ds.detection.librairies || []).map((l) => <li key={l.paquet}>{l.nom} {l.version}</li>)}
                {ds.detection.storybook && <li>Storybook : {ds.detection.storybook.histoires} histoires</li>}
                {(ds.detection.jetons || []).length > 0 && <li>{ds.detection.jetons.length} fichiers de jetons</li>}
                <li>{ds.detection.variables} variables CSS</li>
                {(ds.detection.indices || []).map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
          </div>
          <div class="carte pile">
            <strong>Appliquer au code</strong>
            <span class="doux">Le report des fondations dans le dépôt de l'application (jetons du kit, sur une branche à valider) se fait depuis l'écran Passage en code.</span>
          </div>
        </div>
      )}
    </>
  );
}

// Les variables CSS calculées dans l'écran, pour que l'aperçu suive chaque retouche sans attendre l'enregistrement.
function cssLocal(f) {
  const l = ['.ds-apercu {'];
  for (const c of f.couleurs || []) for (const [n, v] of Object.entries(c.nuances || {})) l.push(`--couleur-${c.id}-${n}: ${v};`);
  l.push(`--police-titres: '${f.typo.titres}', system-ui, sans-serif; --police-texte: '${f.typo.texte}', system-ui, sans-serif;`);
  l.push(`--taille-texte: ${f.typo.taille || 16}px; --graisse-titres: ${f.typo.graisse_titres || 700};`);
  for (const [k, v] of Object.entries(f.rayons || {})) l.push(`--rayon-${k}: ${v}px;`);
  (f.espacements || []).forEach((v, i) => l.push(`--espace-${i + 1}: ${v}px;`));
  for (const [k, v] of Object.entries(f.ombres || {})) l.push(`--ombre-${k}: ${v};`);
  for (const k of ['rapide', 'defaut', 'lent']) l.push(`--motion-${k}: ${f.motion?.[k] ?? 180}ms;`);
  l.push(`--motion-courbe: ${f.motion?.courbe || 'ease'}; }`);
  l.push('@media (prefers-reduced-motion: reduce) { .ds-apercu * { transition: none !important; } }');
  return l.join('\n');
}
