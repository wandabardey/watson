// Édition des référentiels depuis l'application : formulaire direct, demande en langage naturel à Watson,
// lot de propositions à valider, versions produit. Chaque enregistrement part sur GitHub au nom de la personne.
import { useEffect, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Check, Plus, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Watson } from './commun.jsx';

export const TYPES_DONNEE = [
  ['texte', 'Texte'], ['nombre', 'Nombre'], ['date', 'Date'], ['booleen', 'Oui ou non'], ['enum', 'Choix (quelques valeurs)'],
  ['reference', 'Lien vers une entité'], ['liste', "Valeur d'une liste"]
];

export function slug(texte, sep = '_') {
  const s = (texte || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');
  return /^[a-z]/.test(s) ? s : `d${sep}${s || 'donnee'}`;
}

function nouvelId(prefixe, nom, existants) {
  const base = `${prefixe}-${slug(nom, '-').toUpperCase()}`;
  let id = base, n = 2;
  while (existants.has(id)) id = `${base}-${n++}`;
  return id;
}

function SelectVersion({ versions, valeur, changer, vide = 'Toutes versions' }) {
  if (!versions.length) return null;
  return (
    <select class="saisie" value={valeur || ''} onChange={(e) => changer(e.target.value || undefined)}>
      <option value="">{vide}</option>
      {versions.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
    </select>
  );
}

// Formulaire d'une entité ou d'une liste de valeurs (création ou modification).
export function Edition({ projet, id, genre, d, fini, annuler }) {
  const [forme, setForme] = useState(null);
  const [type, setType] = useState(genre);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const versions = d.versions_produit || [];
  useEffect(() => {
    if (id) {
      appel(`/projets/${projet.id}/elements/${id}`).then((r) => {
        setType(r.type);
        const c = r.contenu;
        if (c.attributs) c.attributs = c.attributs.map((a) => ({ ...a, _existant: true, _valeurs: (a.valeurs || []).join(', ') }));
        setForme(c);
      }).catch((e) => setMessage(e.message));
    } else {
      setForme(genre === 'liste' ? { nom: '', valeurs: [{ nom: '' }] } : { nom: '', attributs: [{ libelle: '', type: 'texte' }] });
    }
  }, [id]);
  if (!forme) return <div class="pile"><p class="doux">Chargement…</p>{message && <p class="encart e-rouge">{message}</p>}</div>;
  const maj = (champ, v) => setForme({ ...forme, [champ]: v });
  const majLigne = (cle, i, champ, v) => setForme({ ...forme, [cle]: forme[cle].map((x, j) => (j === i ? { ...x, [champ]: v } : x)) });
  const retirer = (cle, i) => setForme({ ...forme, [cle]: forme[cle].filter((_, j) => j !== i) });
  const deplacer = (cle, i, sens) => {
    const t = [...forme[cle]]; const j = i + sens;
    if (j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j], t[i]]; setForme({ ...forme, [cle]: t });
  };
  const existants = new Set([...d.entites.map((e) => e.id), ...d.listes.map((l) => l.id)]);

  const construire = () => {
    if (!forme.nom?.trim()) throw new Error('Donne un nom.');
    const c = { ...forme, nom: forme.nom.trim() };
    if (!c.id) c.id = nouvelId(type === 'liste' ? 'LST' : 'ENT', c.nom, existants);
    if (!c.description?.trim()) delete c.description;
    if (!c.version) delete c.version;
    if (type === 'liste') {
      c.valeurs = c.valeurs.filter((v) => v.nom?.trim()).map((v) => {
        const x = { nom: v.nom.trim() };
        for (const k of ['groupe', 'note', 'version']) if (v[k]?.trim?.() || (k === 'version' && v[k])) x[k] = k === 'version' ? v[k] : v[k].trim();
        return x;
      });
      if (!c.valeurs.length) throw new Error('Ajoute au moins une valeur.');
    } else {
      const noms = new Set();
      c.attributs = (c.attributs || []).filter((a) => (a.libelle || a.nom || '').trim()).map((a) => {
        let nom = a._existant ? a.nom : slug(a.libelle);
        if (!a._existant) { let n = 2; const b = nom; while (noms.has(nom)) nom = `${b}_${n++}`; }
        noms.add(nom);
        const x = { nom, libelle: (a.libelle || a.nom).trim(), type: a.type };
        if (a.description?.trim()) x.description = a.description.trim();
        if (a.type === 'reference' || a.type === 'liste') {
          if (!a.cible) throw new Error(`Choisis ce que désigne « ${x.libelle} ».`);
          x.cible = a.cible;
        }
        if (a.type === 'enum') {
          const vals = (a._valeurs || '').split(',').map((v) => v.trim()).filter(Boolean);
          if (!vals.length) throw new Error(`Donne les valeurs possibles de « ${x.libelle} », séparées par des virgules.`);
          x.valeurs = vals;
        }
        if (a.multiple) x.multiple = true;
        if (a.optionnel) x.optionnel = true;
        if (a.version) x.version = a.version;
        return x;
      });
    }
    return c;
  };
  const enregistrer = async () => {
    setMessage(null);
    let contenu;
    try { contenu = construire(); } catch (e) { setMessage(e.message); return; }
    setOccupe(true);
    try { await appel(`/projets/${projet.id}/elements`, { corps: { type, contenu } }); fini(contenu.id); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  const supprimer = async () => {
    setOccupe(true); setMessage(null);
    try { await appel(`/projets/${projet.id}/elements/${id}`, { methode: 'DELETE', corps: {} }); fini(null); } catch (e) { setMessage(e.message); setOccupe(false); setConfirmer(false); }
  };

  return (
    <div class="pile edition" style="gap:14px">
      <div class="ligne"><span class="petit doux espace">{id ? 'Modifier' : 'Créer'} {type === 'liste' ? 'une liste de valeurs' : 'une entité'}</span>
        <button class="bouton icone" aria-label="Fermer" onClick={annuler}><X size={15} /></button></div>
      <label class="champ">Nom<input value={forme.nom} onInput={(e) => maj('nom', e.target.value)} autoFocus={!id} /></label>
      <label class="champ">Description<textarea rows={2} value={forme.description || ''} onInput={(e) => maj('description', e.target.value)} /></label>
      {versions.length > 0 && <label class="champ">Version produit<SelectVersion versions={versions} valeur={forme.version} changer={(v) => maj('version', v)} vide="Aucune en particulier" /></label>}

      {type !== 'liste' && (
        <section class="pile" style="gap:8px">
          <h3>Données</h3>
          {forme.attributs.map((a, i) => (
            <div key={i} class="ligne-edition pile" style="gap:6px">
              <div class="ligne" style="gap:6px;flex-wrap:nowrap">
                <input class="saisie espace" placeholder="Nom de la donnée" value={a.libelle ?? a.nom} onInput={(e) => majLigne('attributs', i, 'libelle', e.target.value)} />
                <button class="bouton icone" title="Monter" onClick={() => deplacer('attributs', i, -1)}><ArrowUp size={13} /></button>
                <button class="bouton icone" title="Descendre" onClick={() => deplacer('attributs', i, 1)}><ArrowDown size={13} /></button>
                <button class="bouton icone" title="Retirer" onClick={() => retirer('attributs', i)}><Trash2 size={13} /></button>
              </div>
              <div class="ligne" style="gap:6px">
                <select class="saisie" value={a.type} onChange={(e) => majLigne('attributs', i, 'type', e.target.value)}>
                  {TYPES_DONNEE.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {a.type === 'reference' && (
                  <select class="saisie" value={a.cible || ''} onChange={(e) => majLigne('attributs', i, 'cible', e.target.value)}>
                    <option value="">Quelle entité ?</option>
                    {d.entites.filter((e) => e.id !== id).map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                )}
                {a.type === 'liste' && (
                  <select class="saisie" value={a.cible || ''} onChange={(e) => majLigne('attributs', i, 'cible', e.target.value)}>
                    <option value="">Quelle liste ?</option>
                    {d.listes.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                  </select>
                )}
                {a.type === 'enum' && <input class="saisie espace" placeholder="Valeurs, séparées par des virgules" value={a._valeurs || ''} onInput={(e) => majLigne('attributs', i, '_valeurs', e.target.value)} />}
              </div>
              <div class="ligne petit" style="gap:12px">
                {(a.type === 'reference' || a.type === 'liste') && <label class="ligne" style="gap:4px"><input type="checkbox" checked={!!a.multiple} onChange={(e) => majLigne('attributs', i, 'multiple', e.target.checked)} /> plusieurs</label>}
                <label class="ligne" style="gap:4px"><input type="checkbox" checked={!!a.optionnel} onChange={(e) => majLigne('attributs', i, 'optionnel', e.target.checked)} /> optionnelle</label>
                {versions.length > 0 && <SelectVersion versions={versions} valeur={a.version} changer={(v) => majLigne('attributs', i, 'version', v)} vide="Même version que l'entité" />}
              </div>
            </div>
          ))}
          <button class="bouton" style="align-self:flex-start" onClick={() => maj('attributs', [...forme.attributs, { libelle: '', type: 'texte' }])}><Plus size={15} /> Ajouter une donnée</button>
          {forme.statuts?.length > 0 && <p class="petit doux">Son cycle de vie ({forme.statuts.length} statuts) est conservé tel quel.</p>}
        </section>
      )}

      {type === 'liste' && (
        <section class="pile" style="gap:8px">
          <h3>Valeurs</h3>
          {forme.valeurs.map((v, i) => (
            <div key={i} class="ligne-edition pile" style="gap:6px">
              <div class="ligne" style="gap:6px;flex-wrap:nowrap">
                <input class="saisie espace" placeholder="Valeur" value={v.nom} onInput={(e) => majLigne('valeurs', i, 'nom', e.target.value)} />
                <button class="bouton icone" title="Monter" onClick={() => deplacer('valeurs', i, -1)}><ArrowUp size={13} /></button>
                <button class="bouton icone" title="Retirer" onClick={() => retirer('valeurs', i)}><Trash2 size={13} /></button>
              </div>
              <div class="ligne" style="gap:6px">
                <input class="saisie" style="flex:1" placeholder="Groupe (facultatif)" value={v.groupe || ''} onInput={(e) => majLigne('valeurs', i, 'groupe', e.target.value)} />
                <input class="saisie" style="flex:1" placeholder="Note (facultatif)" value={v.note || ''} onInput={(e) => majLigne('valeurs', i, 'note', e.target.value)} />
                {versions.length > 0 && <SelectVersion versions={versions} valeur={v.version} changer={(x) => majLigne('valeurs', i, 'version', x)} vide="Même version" />}
              </div>
            </div>
          ))}
          <button class="bouton" style="align-self:flex-start" onClick={() => maj('valeurs', [...forme.valeurs, { nom: '' }])}><Plus size={15} /> Ajouter une valeur</button>
        </section>
      )}

      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne">
        <button class="bouton principal-b" disabled={occupe} onClick={enregistrer}><Check size={15} /> {occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button class="bouton" disabled={occupe} onClick={annuler}>Annuler</button>
        <span class="espace" />
        {id && !confirmer && <button class="bouton" disabled={occupe} onClick={() => setConfirmer(true)}><Trash2 size={15} /> Supprimer</button>}
        {id && confirmer && <button class="bouton danger" disabled={occupe} onClick={supprimer}>Confirmer la suppression</button>}
      </div>
      <p class="petit doux">Enregistré à ton nom et envoyé sur GitHub ; le schéma se met à jour.</p>
    </div>
  );
}

// « Demander à Watson » : une demande en langage naturel devient des propositions à voir sur le schéma.
export function DemandeWatson({ projet, element, nomElement, lance, fermer, exemple }) {
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);
  const envoyer = async () => {
    if (!texte.trim()) return;
    setOccupe(true); setMessage(null);
    try { lance(await appel(`/projets/${projet.id}/modifier`, { corps: { consigne: texte.trim(), element } })); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  return (
    <div class="pile demande-watson" style="gap:10px">
      <div class="ligne" style="gap:10px;flex-wrap:nowrap">
        <Watson humeur={occupe ? 'reflechit' : 'ecrit'} buste={occupe} hauteur={occupe ? 54 : 70} flotte={occupe} />
        <span class="espace"><strong>Demander à Watson</strong><br /><span class="petit doux">{nomElement ? `À propos de « ${nomElement} », ou de tout le modèle.` : 'Décris le changement, je le prépare.'}</span></span>
        {fermer && <button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button>}
      </div>
      <textarea class="saisie" rows={3} style="padding:10px 12px" disabled={occupe}
        placeholder={exemple ? `Par exemple : ${exemple}` : nomElement ? `Par exemple : ajoute un code IATA optionnel à ${nomElement.toLowerCase()}` : 'Par exemple : ajoute un véhicule rattaché à la société, avec son immatriculation'}
        value={texte} onInput={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer(); }} />
      {message && <p class="encart e-rouge">{message}</p>}
      <button class="bouton principal-b" style="align-self:flex-start" disabled={occupe || !texte.trim()} onClick={envoyer}>
        <Sparkles size={15} /> {occupe ? 'Watson prépare…' : 'Préparer le changement'}</button>
    </div>
  );
}

// Le lot préparé : propositions à garder ou écarter, visibles sur le schéma, puis enregistrées en une fois.
export function LotEnCours({ projet, lot, fini, abandonner }) {
  const [garde, setGarde] = useState(() => Object.fromEntries(lot.propositions.map((p) => [p.index, !p.invalide])));
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);
  const enregistrer = async () => {
    setOccupe(true); setMessage(null);
    try {
      fini(await appel(`/projets/${projet.id}/alimenter/${lot.id}/appliquer`, { corps: { decisions: lot.propositions.map((p) => ({ index: p.index, accepte: garde[p.index] })) } }));
    } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  const n = lot.propositions.filter((p) => garde[p.index] && !p.invalide).length;
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne" style="gap:10px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={70} flotte={false} />
        <span class="espace"><strong>Voici ce que je propose</strong><br /><span class="petit doux">{lot.resume || 'Les changements apparaissent sur le schéma.'}</span></span></div>
      {lot.propositions.length === 0 && <p class="doux">Rien à changer d'après ta demande.</p>}
      {lot.propositions.map((p) => (
        <label key={p.index} class={`proposition-courte ${garde[p.index] && !p.invalide ? '' : 'ecartee'}`}>
          <input type="checkbox" disabled={!!p.invalide} checked={garde[p.index] && !p.invalide} onChange={(e) => setGarde({ ...garde, [p.index]: e.target.checked })} />
          <span class="pile" style="gap:2px">
            <span><span class={`badge ${p.action === 'modifier' ? 'b-violet' : 'b-indigo'}`}>{p.action === 'modifier' ? 'Modifié' : 'Nouveau'}</span> <strong>{p.titre}</strong></span>
            <span class="petit doux">{p.pourquoi}</span>
            {p.conflit && <span class="petit" style="color:var(--orange)">{p.conflit}</span>}
            {p.invalide && <span class="petit" style="color:var(--rouge)">Mal formé, ne peut pas être enregistré : reformule ta demande.</span>}
          </span>
        </label>
      ))}
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne">
        <button class="bouton principal-b" disabled={occupe || !n} onClick={enregistrer}><Check size={15} /> {occupe ? 'Enregistrement…' : `Enregistrer${n ? ` (${n})` : ''}`}</button>
        <button class="bouton" disabled={occupe} onClick={abandonner}>Abandonner</button>
      </div>
    </div>
  );
}

// Versions produit du projet (MVP, V2…), dans l'ordre de livraison.
export function GererVersions({ projet, versions, fini, fermer }) {
  const [liste, setListe] = useState(versions.map((v) => ({ ...v })));
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const maj = (i, champ, v) => setListe(liste.map((x, j) => (j === i ? { ...x, [champ]: v } : x)));
  const enregistrer = async () => {
    setOccupe(true); setMessage(null);
    const propres = liste.filter((v) => v.nom?.trim()).map((v) => ({ ...v, id: v.id || v.nom.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'V' }));
    try { await appel(`/projets/${projet.id}/versions-produit`, { corps: { versions: propres } }); fini(); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  return (
    <div class="pile" style="gap:12px">
      <div class="ligne"><strong class="espace">Versions produit</strong><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <p class="petit doux">Dans l'ordre de livraison. Chaque entité, donnée, valeur, règle, écran ou étape peut appartenir à l'une d'elles ; ce qui vient après la version affichée apparaît en pointillés.</p>
      {liste.map((v, i) => (
        <div key={i} class="ligne" style="gap:6px;flex-wrap:nowrap">
          <input class="saisie" style="width:90px" placeholder="Nom" value={v.nom} onInput={(e) => maj(i, 'nom', e.target.value)} />
          <input class="saisie espace" placeholder="Description (facultatif)" value={v.description || ''} onInput={(e) => maj(i, 'description', e.target.value)} />
          <button class="bouton icone" title="Monter" onClick={() => { if (i) { const t = [...liste]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; setListe(t); } }}><ArrowUp size={13} /></button>
          <button class="bouton icone" title="Retirer" onClick={() => setListe(liste.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button class="bouton" style="align-self:flex-start" onClick={() => setListe([...liste, { nom: liste.length ? `V${liste.length + 1}` : 'MVP' }])}><Plus size={15} /> Ajouter une version</button>
      {message && <p class="encart e-rouge">{message}</p>}
      <button class="bouton principal-b" style="align-self:flex-start" disabled={occupe} onClick={enregistrer}><Check size={15} /> Enregistrer</button>
    </div>
  );
}
