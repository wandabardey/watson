import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  AppWindow, Check, Diamond, FileText, LayoutDashboard, LayoutList, List, LogIn, Monitor, PanelRight, Pencil, Plus, Scale, Search,
  Smartphone, Sparkles, Trash2, Workflow as IconeSchema, X, ArrowUp
} from 'lucide-preact';
import ELK from 'elkjs/lib/elk.bundled.js';
import { appel } from '../api.js';
import { Attente, Entete, Statut, useVue, Watson } from './commun.jsx';
import { DemandeWatson, GererVersions, LotEnCours } from './edition.jsx';
import { horsVersion } from './referentiels.jsx';
import { Fleches, Toile, largeurTexte, teinteClaire, trace } from './toile.jsx';

const elk = new ELK();
export const TYPES_ECRAN = { page: 'Page', formulaire: 'Formulaire', liste: 'Liste', panneau: 'Panneau', modale: 'Modale', tableau_de_bord: 'Tableau de bord' };
const ICONES_ECRAN = { page: LogIn, formulaire: FileText, liste: List, panneau: PanelRight, modale: AppWindow, tableau_de_bord: LayoutDashboard };
const GENRES_ROUTAGE = { navigation: 'Navigation', routage: 'Routage vers un formulaire', echange: 'Échange entre applications' };
const LE = 290;
const ET = 74;
const LS = 27;
const GRIS = '#6B7280';
const ESPACE_COULOIRS = 84;

const couleurEcran = (e) => e.applications[0]?.couleur || GRIS;
const hauteurEcran = (e) => ET + Math.max(1, e.sections.length) * LS + (e.cas_usage.length || e.regles.length ? 40 : 12);

async function disposer(ecrans, applications) {
  const ids = new Set(ecrans.map((e) => e.id));
  const couloirs = [...applications.map((a) => ({ ...a, ecrans: [] })), { id: '_', nom: 'Sans application', couleur: GRIS, ecrans: [] }];
  const couloirDe = {};
  for (const e of ecrans) {
    const c = couloirs.find((x) => x.id === e.applications[0]?.id) || couloirs[couloirs.length - 1];
    c.ecrans.push(e); couloirDe[e.id] = c.id;
  }
  const aretes = [];
  for (const e of ecrans) {
    for (const [i, r] of e.routages.entries()) if (ids.has(r.vers)) aretes.push({ id: `${e.id}>${r.vers}>${i}`, de: e.id, vers: r.vers, r, couleur: couleurEcran(e) });
    if (e.parent && ids.has(e.parent)) aretes.push({ id: `${e.parent}>${e.id}>parent`, de: e.parent, vers: e.id, r: { genre: 'parent' }, couleur: GRIS });
  }
  const etiquette = (a) => (a.r.genre === 'parent' || a.r.genre === 'navigation' || !a.r.libelle ? null : a.r.libelle);
  const noeuds = [], traits = [], fonds = [];
  let y = 0, largeur = 0;
  const pos = {};
  for (const c of couloirs.filter((x) => x.ecrans.length)) {
    const internes = aretes.filter((a) => couloirDe[a.de] === c.id && couloirDe[a.vers] === c.id);
    const res = await elk.layout({
      id: c.id,
      layoutOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.padding': '[top=28,left=28,bottom=58,right=28]',
        'elk.layered.spacing.nodeNodeBetweenLayers': '96', 'elk.spacing.nodeNode': '40', 'elk.spacing.edgeLabel': '6', 'elk.edgeLabels.inline': 'true',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
      },
      children: c.ecrans.map((e) => ({ id: e.id, width: LE, height: hauteurEcran(e) })),
      edges: internes.map((a) => ({ id: a.id, sources: [a.de], targets: [a.vers], labels: etiquette(a) ? [{ text: etiquette(a), width: largeurTexte(etiquette(a)), height: 26 }] : [] }))
    });
    for (const n of res.children) {
      const e = c.ecrans.find((x) => x.id === n.id);
      pos[n.id] = { x: n.x, y: y + n.y, w: n.width, h: n.height };
      noeuds.push({ ...e, x: n.x, y: y + n.y, h: n.height });
    }
    for (const ed of res.edges) {
      const a = internes.find((x) => x.id === ed.id);
      const pts = ed.sections?.flatMap((s) => [s.startPoint, ...(s.bendPoints || []), s.endPoint]).map((p) => ({ x: p.x, y: p.y + y })) || [];
      const lab = ed.labels?.[0];
      traits.push({ ...a, points: pts, etiquette: lab ? { texte: lab.text, x: lab.x, y: lab.y + y, w: lab.width } : null });
    }
    fonds.push({ ...c, y, h: res.height, w: res.width });
    largeur = Math.max(largeur, res.width);
    y += res.height + ESPACE_COULOIRS;
  }
  // Liens entre couloirs : on descend (ou remonte) dans l'espace entre les couloirs.
  for (const a of aretes.filter((x) => couloirDe[x.de] !== couloirDe[x.vers])) {
    const s = pos[a.de], t = pos[a.vers];
    if (!s || !t) continue;
    const fondT = fonds.find((f) => f.id === couloirDe[a.vers]);
    const descend = t.y > s.y;
    const sx = s.x + s.w / 2 + 30, tx = t.x + t.w / 2 - 30;
    const gy = descend ? fondT.y - ESPACE_COULOIRS / 2 : fondT.y + fondT.h + ESPACE_COULOIRS / 2;
    const pts = descend
      ? [{ x: sx, y: s.y + s.h }, { x: sx, y: gy }, { x: tx, y: gy }, { x: tx, y: t.y }]
      : [{ x: sx, y: s.y }, { x: sx, y: gy }, { x: tx, y: gy }, { x: tx, y: t.y + t.h }];
    const txt = etiquette(a);
    traits.push({ ...a, points: pts, etiquette: txt ? { texte: txt, x: (sx + tx) / 2 - largeurTexte(txt) / 2, y: gy - 13, w: largeurTexte(txt) } : null });
  }
  return { noeuds, traits, fonds: fonds.map((f) => ({ ...f, w: largeur })), largeur, hauteur: Math.max(0, y - ESPACE_COULOIRS) };
}

function CarteEcran({ e, choisi, attenue, choisir, versions, version, marque }) {
  const hors = (v) => horsVersion(versions, version, v);
  const c = couleurEcran(e);
  const Icone = ICONES_ECRAN[e.type] || FileText;
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  let n = 0;
  return (
    <div class={`brique ecran ${choisi ? 'choisie' : ''} ${attenue ? 'attenuee' : ''} ${hors(e.version) ? 'hors-version' : ''} ${e.a_trancher ? 'a-trancher' : ''} ${marque ? `marque-${marque}` : ''}`}
      style={`left:${e.x}px;top:${e.y}px;width:${LE}px;height:${e.h}px;border-color:${hors(e.version) ? '' : teinteClaire(c, 0.42)}`}
      onClick={(ev) => { ev.stopPropagation(); choisir(e.id); }}>
      <div class="brique-tete" style={`height:${ET}px`}>
        <span class="brique-icone" style={`background:${teinteClaire(c, 0.12)};color:${c}`}><Icone size={20} strokeWidth={1.8} /></span>
        <span class="pile espace" style="gap:2px;min-width:0">
          <span class="ligne" style="gap:6px;flex-wrap:nowrap;min-width:0"><strong class="tronque brique-titre">{e.nom}</strong>
            {e.version && (version === 'toutes' || hors(e.version)) && <span class="pastille-version">{nomV(e.version)}</span>}
            {marque && <span class={`pastille-marque ${marque}`}>{marque === 'nouveau' ? 'proposé' : 'modifié'}</span>}</span>
          <span class="brique-sous tronque"><i class="point-couleur" style={`background:${c}`} />{e.id} · {TYPES_ECRAN[e.type] || 'Écran'}{e.a_trancher && <b class="a-trancher-txt"> · à trancher</b>}</span>
        </span>
      </div>
      {e.sections.length === 0 && <div class="ecran-section doux" style={`height:${LS}px`}>Contenu à décrire</div>}
      {e.sections.map((s, i) => {
        const genre = s.genre || 'section';
        if (genre === 'section') n += 1;
        return (
          <div key={i} class={`ecran-section es-${genre} ${hors(s.version) ? 'hors-version' : ''}`} style={`height:${LS}px`}>
            {genre === 'section' && <span class="num-section" style={`background:${c}`}>{n}</span>}
            {genre === 'onglet' && <span class="marque-onglet" style={`border-color:${c}`} />}
            {genre === 'variante' && <Diamond size={11} color={c} />}
            <span class="espace tronque">{s.titre}</span>
            {s.version && s.version !== e.version && (version === 'toutes' || hors(s.version)) && <span class="pastille-version">{nomV(s.version)}</span>}
          </div>
        );
      })}
      {(e.cas_usage.length > 0 || e.regles.length > 0) && (
        <div class="ecran-pied">
          {e.cas_usage.slice(0, 4).map((u) => <span key={u} class="puce-uc">{u}</span>)}
          {e.cas_usage.length > 4 && <span class="puce-uc">+{e.cas_usage.length - 4}</span>}
          {e.regles.length > 0 && <span class="pastille-regle" title={e.regles.map((r) => r.titre).join(', ')}><Scale size={11} />{e.regles.length}</span>}
        </div>
      )}
    </div>
  );
}

function SchemaEcrans({ ecrans, applications, choisi, choisir, filtre, versions, version, marques }) {
  const [plan, setPlan] = useState(null);
  useEffect(() => { disposer(ecrans, applications).then(setPlan); }, [ecrans, applications]);
  if (!plan) return <div class="schema-cadre"><p class="chargement">Mise en page…</p></div>;
  const voisins = new Set();
  if (choisi) for (const t of plan.traits) { if (t.de === choisi) voisins.add(t.vers); if (t.vers === choisi) voisins.add(t.de); }
  const correspond = (e) => !filtre || `${e.nom} ${e.id} ${e.sections.map((s) => s.titre).join(' ')} ${e.cas_usage.join(' ')}`.toLowerCase().includes(filtre);
  const sel = plan.noeuds.find((x) => x.id === choisi);
  const couleurs = [...new Set([...plan.traits.map((t) => t.couleur), '#18181B', '#A1A1AA', '#C4C4CF'])];
  const style = (t) => {
    const actif = !choisi || t.de === choisi || t.vers === choisi;
    const hors = horsVersion(versions, version, t.r.version) || horsVersion(versions, version, plan.noeuds.find((x) => x.id === t.vers)?.version);
    if (!actif || hors) return { stroke: '#C4C4CF', largeur: 1.6, pointilles: hors ? '4 5' : null, fleche: '#C4C4CF', opacite: actif ? 1 : 0.6 };
    if (t.r.genre === 'echange') return { stroke: '#18181B', largeur: 1.8, pointilles: '6 4', fleche: '#18181B' };
    if (t.r.genre === 'routage') return { stroke: t.couleur, largeur: 2.3, fleche: t.couleur };
    if (t.r.genre === 'parent') return { stroke: '#A1A1AA', largeur: 1.4, pointilles: '2 4', fleche: null };
    return { stroke: '#A1A1AA', largeur: 1.6, fleche: '#A1A1AA' };
  };
  return (
    <Toile largeur={plan.largeur} hauteur={plan.hauteur} focus={sel && { id: sel.id, x: sel.x, y: sel.y, w: LE }} onFond={() => choisir(null)}
      legende={<>
        <span class="pilule"><span class="num-section" style="background:#4F46E5">1</span> Section</span>
        <span class="pilule"><Diamond size={12} color="#4F46E5" /> Variante</span>
        <span class="pilule"><span class="marque-onglet" style="border-color:#4F46E5" /> Onglet</span>
        <span class="pilule">Routage</span>
        <span class="pilule pilule-echange">Échange entre applications</span>
        <span class="pilule pilule-hors">À trancher</span>
      </>}>
      {plan.fonds.map((f) => (
        <div key={f.id} class="couloir" style={`top:${f.y}px;width:${f.w}px;height:${f.h}px;background:${teinteClaire(f.couleur, 0.045)};border-color:${teinteClaire(f.couleur, 0.18)}`}>
          <span class="couloir-nom" style={`color:${f.couleur}`}>{f.support === 'mobile' ? <Smartphone size={15} /> : <Monitor size={15} />} {f.nom}{f.support ? ` · ${f.support}` : ''}</span>
        </div>
      ))}
      <svg class="schema-liens" width={plan.largeur + 40} height={plan.hauteur + 40}>
        <Fleches couleurs={couleurs} />
        {plan.traits.map((t) => {
          const s = style(t);
          return <path key={t.id} d={trace(t.points)} fill="none" stroke={s.stroke} stroke-width={s.largeur} stroke-dasharray={s.pointilles || undefined}
            opacity={s.opacite ?? 1} marker-end={s.fleche ? `url(#f-${s.fleche.replace('#', '')})` : undefined} />;
        })}
      </svg>
      {plan.traits.filter((t) => t.etiquette).map((t) => (
        <span key={`l-${t.id}`} class={`etiquette-lien ${t.r.genre}`} style={`left:${t.etiquette.x}px;top:${t.etiquette.y}px;${t.r.genre === 'routage' ? `color:${t.couleur};border-color:${teinteClaire(t.couleur, 0.35)}` : ''};opacity:${!choisi || t.de === choisi || t.vers === choisi ? 1 : 0.35}`}>{t.etiquette.texte}</span>
      ))}
      {plan.noeuds.map((e) => (
        <CarteEcran key={e.id} e={e} choisi={choisi === e.id} attenue={(choisi && choisi !== e.id && !voisins.has(e.id)) || !correspond(e)} choisir={choisir}
          versions={versions} version={version} marque={marques[e.id]} />
      ))}
    </Toile>
  );
}

function FicheEcran({ e, tout, choisir, aller, fermer, modifier, versions, projet, lance }) {
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  let n = 0;
  return (
    <aside class="fiche" onMouseDown={(ev) => ev.stopPropagation()}>
      <div class="ligne"><span class="petit doux espace">{e.id} · {TYPES_ECRAN[e.type] || 'Écran'}{e.version && ` · ${nomV(e.version)}`}</span>
        <button class="bouton" onClick={modifier}><Pencil size={14} /> Modifier</button>
        <button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <h2>{e.nom}</h2>
      <div class="ligne" style="gap:6px">
        {e.applications.map((a) => <span key={a.id} class="badge" style={`background:${teinteClaire(a.couleur || GRIS, 0.12)};color:${a.couleur || GRIS}`}>{a.nom}</span>)}
        {e.a_trancher && <span class="badge b-orange">à trancher</span>}
        {e.cas_usage.map((u) => <span key={u} class="puce-uc">{u}</span>)}
      </div>
      {e.description && <p class="doux">{e.description}</p>}
      {e.parent && <p class="petit">Dans <button class="lien" onClick={() => choisir(e.parent)}>{tout[e.parent]?.nom || e.parent}</button></p>}
      <section class="pile" style="gap:6px">
        <h3>Contenu</h3>
        {e.sections.length === 0 && <p class="doux">Pas encore décrit.</p>}
        {e.sections.map((s, i) => {
          const genre = s.genre || 'section';
          if (genre === 'section') n += 1;
          return <span key={i} class="ligne" style="gap:8px">{genre === 'section' ? <span class="num-section" style={`background:${couleurEcran(e)}`}>{n}</span> : genre === 'variante' ? <Diamond size={12} /> : <span class="marque-onglet" />}
            <span class={genre === 'variante' ? 'doux' : ''}>{genre === 'variante' ? 'Variante : ' : genre === 'onglet' ? 'Onglet : ' : ''}{s.titre}</span>
            {s.version && s.version !== e.version && <span class="pastille-version">{nomV(s.version)}</span>}</span>;
        })}
      </section>
      <section class="pile" style="gap:6px">
        <h3>Mène à</h3>
        {e.routages.length === 0 && <p class="doux">Aucun routage décrit.</p>}
        {e.routages.map((r, i) => (
          <span key={i} class="petit"><span class="doux">{GENRES_ROUTAGE[r.genre] || 'Navigation'}{r.libelle ? ` « ${r.libelle} »` : ''} vers </span>
            <button class="lien" onClick={() => choisir(r.vers)}>{r.vers_nom}</button>{r.condition && <span class="doux"> si {r.condition}</span>}
            {r.version && <span class="pastille-version" style="margin-left:6px">{nomV(r.version)}</span>}</span>
        ))}
        {e.sous_ecrans.map((s) => <span key={s} class="petit"><span class="doux">Contient </span><button class="lien" onClick={() => choisir(s)}>{tout[s]?.nom || s}</button></span>)}
      </section>
      {e.acteurs.length > 0 && <section class="pile" style="gap:6px"><h3>Pour qui</h3><div class="ligne" style="gap:6px">{e.acteurs.map((a) => <span key={a.id} class="badge b-gris">{a.nom}</span>)}</div></section>}
      {e.regles.length > 0 && (
        <section class="pile" style="gap:6px">
          <h3>Règles appliquées</h3>
          {e.regles.map((r) => <button key={r.id} class="bouton" style="justify-content:space-between" onClick={() => aller('regles')}><span class="tronque">{r.titre}</span><Statut s={r.statut} /></button>)}
        </section>
      )}
      {e.parcours.length > 0 && <section class="pile" style="gap:6px"><h3>Parcours qui l'utilisent</h3>{e.parcours.map((u) => <span key={u.id}>{u.nom}</span>)}</section>}
      <section class="encadre-watson"><DemandeWatson projet={projet} element={e.id} nomElement={e.nom} lance={lance} exemple="ajoute un onglet Historique, prévu en V2" /></section>
    </aside>
  );
}

function EditionEcran({ projet, id, d, fini, annuler }) {
  const [f, setF] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const versions = d.versions_produit || [];
  useEffect(() => {
    if (id) appel(`/projets/${projet.id}/elements/${id}`).then((r) => setF({ ...r.contenu, _uc: (r.contenu.cas_usage || []).join(', ') })).catch((e) => setMessage(e.message));
    else setF({ id: '', nom: '', type: 'formulaire', applications: d.applications[0] ? [d.applications[0].id] : [], sections: [{ titre: '' }], routages: [], _uc: '' });
  }, [id]);
  if (!f) return <p class="doux">Chargement…</p>;
  const maj = (k, v) => setF({ ...f, [k]: v });
  const majL = (k, i, c, v) => setF({ ...f, [k]: f[k].map((x, j) => (j === i ? { ...x, [c]: v } : x)) });
  const retirer = (k, i) => setF({ ...f, [k]: f[k].filter((_, j) => j !== i) });
  const monter = (k, i) => { if (!i) return; const t = [...f[k]]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; setF({ ...f, [k]: t }); };
  const enregistrer = async () => {
    setMessage(null);
    if (!f.nom?.trim()) { setMessage('Donne un nom.'); return; }
    const c = { ...f, nom: f.nom.trim() };
    if (!c.id?.trim()) {
      const base = `SCR-${String(d.ecrans.length + 1).padStart(3, '0')}`;
      let i = d.ecrans.length + 1; c.id = base;
      while (d.ecrans.some((x) => x.id === c.id)) c.id = `SCR-${String(++i).padStart(3, '0')}`;
    } else c.id = c.id.trim().toUpperCase();
    c.cas_usage = (f._uc || '').split(',').map((x) => x.trim()).filter(Boolean);
    delete c._uc;
    c.sections = (c.sections || []).filter((s) => s.titre?.trim()).map((s) => ({ titre: s.titre.trim(), ...(s.genre && s.genre !== 'section' ? { genre: s.genre } : {}), ...(s.version ? { version: s.version } : {}), ...(s.description ? { description: s.description } : {}) }));
    c.routages = (c.routages || []).filter((r) => r.vers).map((r) => ({ vers: r.vers, genre: r.genre || 'navigation', ...(r.libelle?.trim() ? { libelle: r.libelle.trim() } : {}), ...(r.condition?.trim() ? { condition: r.condition.trim() } : {}), ...(r.version ? { version: r.version } : {}) }));
    for (const k of ['description', 'version', 'parent']) if (!c[k]) delete c[k];
    for (const k of ['cas_usage', 'sections', 'routages', 'regles', 'acteurs', 'applications']) if (!c[k]?.length) delete c[k];
    if (!c.a_trancher) delete c.a_trancher;
    setOccupe(true);
    try { await appel(`/projets/${projet.id}/elements`, { corps: { type: 'ecran', contenu: c } }); fini(c.id); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  const supprimer = async () => {
    setOccupe(true);
    try { await appel(`/projets/${projet.id}/elements/${id}`, { methode: 'DELETE', corps: {} }); fini(null); } catch (e) { setMessage(e.message); setOccupe(false); setConfirmer(false); }
  };
  const basculer = (k, v) => maj(k, (f[k] || []).includes(v) ? f[k].filter((x) => x !== v) : [...(f[k] || []), v]);
  return (
    <div class="pile edition" style="gap:12px">
      <div class="ligne"><span class="petit doux espace">{id ? 'Modifier un écran' : 'Créer un écran'}</span><button class="bouton icone" aria-label="Fermer" onClick={annuler}><X size={15} /></button></div>
      <div class="ligne" style="gap:8px;flex-wrap:nowrap">
        <label class="champ" style="width:120px">Repère<input value={f.id} disabled={!!id} placeholder="SCR-…" onInput={(e) => maj('id', e.target.value)} /></label>
        <label class="champ espace">Nom<input value={f.nom} onInput={(e) => maj('nom', e.target.value)} /></label>
      </div>
      <div class="ligne" style="gap:8px">
        <label class="champ">Type<select value={f.type || 'formulaire'} onChange={(e) => maj('type', e.target.value)}>{Object.entries(TYPES_ECRAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {d.applications.length > 0 && <label class="champ">Application<select value={f.applications?.[0] || ''} onChange={(e) => maj('applications', e.target.value ? [e.target.value] : [])}><option value="">Aucune</option>{d.applications.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>}
        {versions.length > 0 && <label class="champ">Version<select value={f.version || ''} onChange={(e) => maj('version', e.target.value)}><option value="">Aucune en particulier</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></label>}
      </div>
      <label class="ligne petit" style="gap:6px"><input type="checkbox" checked={!!f.a_trancher} onChange={(e) => maj('a_trancher', e.target.checked)} /> Écran encore à trancher</label>
      <label class="champ">Dans l'écran (sous-écran : panneau, modale)<select value={f.parent || ''} onChange={(e) => maj('parent', e.target.value)}><option value="">Aucun</option>{d.ecrans.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></label>
      <label class="champ">Cas d'usage<input placeholder="UC 14, UC 27" value={f._uc} onInput={(e) => maj('_uc', e.target.value)} /></label>
      <label class="champ">Description<textarea rows={2} value={f.description || ''} onInput={(e) => maj('description', e.target.value)} /></label>
      <section class="pile" style="gap:6px">
        <h3>Contenu</h3>
        {(f.sections || []).map((s, i) => (
          <div key={i} class="ligne" style="gap:6px;flex-wrap:nowrap">
            <select class="saisie" style="width:110px" value={s.genre || 'section'} onChange={(e) => majL('sections', i, 'genre', e.target.value)}><option value="section">Section</option><option value="onglet">Onglet</option><option value="variante">Variante</option></select>
            <input class="saisie espace" placeholder="Titre" value={s.titre} onInput={(e) => majL('sections', i, 'titre', e.target.value)} />
            {versions.length > 0 && <select class="saisie" style="width:92px" value={s.version || ''} onChange={(e) => majL('sections', i, 'version', e.target.value)}><option value="">Version</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select>}
            <button class="bouton icone" title="Monter" onClick={() => monter('sections', i)}><ArrowUp size={13} /></button>
            <button class="bouton icone" title="Retirer" onClick={() => retirer('sections', i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button class="bouton" style="align-self:flex-start" onClick={() => maj('sections', [...(f.sections || []), { titre: '' }])}><Plus size={15} /> Ajouter</button>
      </section>
      <section class="pile" style="gap:6px">
        <h3>Mène à</h3>
        {(f.routages || []).map((r, i) => (
          <div key={i} class="ligne-edition pile" style="gap:6px">
            <div class="ligne" style="gap:6px;flex-wrap:nowrap">
              <select class="saisie espace" value={r.vers} onChange={(e) => majL('routages', i, 'vers', e.target.value)}><option value="">Vers quel écran ?</option>{d.ecrans.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
              <button class="bouton icone" title="Retirer" onClick={() => retirer('routages', i)}><Trash2 size={13} /></button>
            </div>
            <div class="ligne" style="gap:6px">
              <select class="saisie" value={r.genre || 'navigation'} onChange={(e) => majL('routages', i, 'genre', e.target.value)}>{Object.entries(GENRES_ROUTAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input class="saisie espace" placeholder="Libellé (Soumettre…)" value={r.libelle || ''} onInput={(e) => majL('routages', i, 'libelle', e.target.value)} />
            </div>
            <div class="ligne" style="gap:6px">
              <input class="saisie espace" placeholder="Condition (facultatif)" value={r.condition || ''} onInput={(e) => majL('routages', i, 'condition', e.target.value)} />
              {versions.length > 0 && <select class="saisie" value={r.version || ''} onChange={(e) => majL('routages', i, 'version', e.target.value)}><option value="">Version</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select>}
            </div>
          </div>
        ))}
        <button class="bouton" style="align-self:flex-start" onClick={() => maj('routages', [...(f.routages || []), { vers: '', genre: 'routage' }])}><Plus size={15} /> Ajouter un routage</button>
      </section>
      {d.acteurs.length > 0 && <section class="pile" style="gap:6px"><h3>Pour qui</h3><div class="ligne" style="gap:6px">{d.acteurs.map((a) => (
        <button key={a.id} class={`badge ${(f.acteurs || []).includes(a.id) ? 'b-indigo' : 'b-gris'}`} style="border:0;cursor:pointer" onClick={() => basculer('acteurs', a.id)}>{a.nom}</button>))}</div></section>}
      {d.regles.length > 0 && <section class="pile" style="gap:6px"><h3>Règles appliquées</h3><div class="ligne" style="gap:6px">{d.regles.map((r) => (
        <button key={r.id} class={`badge ${(f.regles || []).includes(r.id) ? 'b-indigo' : 'b-gris'}`} style="border:0;cursor:pointer;font-weight:500" onClick={() => basculer('regles', r.id)}>{r.titre}</button>))}</div></section>}
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne">
        <button class="bouton principal-b" disabled={occupe} onClick={enregistrer}><Check size={15} /> {occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button class="bouton" disabled={occupe} onClick={annuler}>Annuler</button><span class="espace" />
        {id && !confirmer && <button class="bouton" onClick={() => setConfirmer(true)}><Trash2 size={15} /> Supprimer</button>}
        {id && confirmer && <button class="bouton danger" disabled={occupe} onClick={supprimer}>Confirmer la suppression</button>}
      </div>
    </div>
  );
}

function ListeEcrans({ ecrans, choisir, filtre, versions }) {
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v || '';
  const ok = (e) => !filtre || `${e.nom} ${e.id} ${e.cas_usage.join(' ')}`.toLowerCase().includes(filtre);
  return (
    <div class="cadre-tableau">
      <table class="tableau">
        <thead><tr><th>Écran</th><th>Application</th><th>Type</th><th>Version</th><th>Cas d'usage</th><th>Contenu</th><th>Mène à</th></tr></thead>
        <tbody>{ecrans.filter(ok).map((e) => (
          <tr key={e.id} class="cliquable" onClick={() => choisir(e.id)}>
            <td><strong style="color:var(--indigo)">{e.nom}</strong><div class="petit doux">{e.id}{e.a_trancher ? ' · à trancher' : ''}</div></td>
            <td>{e.applications.map((a) => a.nom).join(', ')}</td>
            <td class="doux">{TYPES_ECRAN[e.type] || ''}</td>
            <td>{e.version && <span class="pastille-version">{nomV(e.version)}</span>}</td>
            <td class="doux">{e.cas_usage.join(', ')}</td>
            <td class="doux">{e.sections.length}</td>
            <td class="doux">{e.routages.map((r) => r.vers_nom).join(', ')}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Ecrans({ projet, aller }) {
  const { donnees: base, erreur, recharger } = useVue(`/projets/${projet.id}/ecrans`);
  const lire = (k, defaut) => { try { return localStorage.getItem(k) || defaut; } catch { return defaut; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans importance */ } };
  const [vue, setVue] = useState(() => lire('watson.ecrans.vue', 'schema'));
  const [version, setVersion] = useState(() => lire(`watson.version.${projet.id}`, 'toutes'));
  const [choisi, setChoisi] = useState(null);
  const [panneau, setPanneau] = useState(null);
  const [lot, setLot] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [recherche, setRecherche] = useState('');
  const d = apercu ? apercu.ecrans : base;
  const tout = useMemo(() => (d ? Object.fromEntries(d.ecrans.map((e) => [e.id, e])) : {}), [d]);
  if (!d) return <Attente erreur={erreur} />;
  const versions = d.versions_produit || [];
  const filtre = recherche.trim().toLowerCase();
  const marques = apercu ? Object.fromEntries([...apercu.nouveaux.map((i) => [i, 'nouveau']), ...apercu.modifies.map((i) => [i, 'modifie'])]) : {};
  const lancerLot = async (l) => {
    setLot(l); setPanneau(null); setChoisi(null);
    try { setApercu(await appel(`/projets/${projet.id}/alimenter/${l.id}/apercu`)); } catch { setApercu(null); }
  };
  const finirLot = (r) => { setLot(null); setApercu(null); recharger(); setPanneau({ mode: 'bilan', r }); };
  const abandonnerLot = async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); setApercu(null); };
  const changerVersion = (v) => { if (v === '__gerer') { setPanneau({ mode: 'versions' }); return; } setVersion(v); ecrire(`watson.version.${projet.id}`, v); };
  let cote = null;
  if (lot) cote = <aside class="fiche"><LotEnCours projet={projet} lot={lot} fini={finirLot} abandonner={abandonnerLot} /></aside>;
  else if (panneau?.mode === 'edition') cote = <aside class="fiche"><EditionEcran key={panneau.id || 'nouveau'} projet={projet} id={panneau.id} d={d} fini={(id) => { setPanneau(null); recharger(); setChoisi(id); }} annuler={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'demande') cote = <aside class="fiche"><DemandeWatson projet={projet} lance={lancerLot} fermer={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'versions') cote = <aside class="fiche"><GererVersions projet={projet} versions={versions} fini={() => { setPanneau(null); recharger(); }} fermer={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'bilan') cote = <aside class="fiche"><div class="ligne" style="gap:10px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={90} flotte={false} /><span class="espace"><strong>C'est noté.</strong></span><button class="bouton icone" aria-label="Fermer" onClick={() => setPanneau(null)}><X size={15} /></button></div>{panneau.r.ecrits.map((e) => <span key={e.id} class="petit ligne"><Check size={14} color="#166534" /> {e.titre}</span>)}</aside>;
  else if (choisi && tout[choisi]) cote = <FicheEcran e={tout[choisi]} tout={tout} choisir={setChoisi} aller={aller} fermer={() => setChoisi(null)} versions={versions} projet={projet} lance={lancerLot} modifier={() => setPanneau({ mode: 'edition', id: choisi })} />;
  return (
    <div class="pile referentiels" style="gap:16px">
      <Entete titre="Écrans" description="Les écrans de chaque application, ce qu'ils contiennent et où ils mènent. Les scénarios s'y réfèrent étape par étape.">
        <div class="ligne">
          <label class="ligne saisie" style="gap:6px;min-height:36px"><Search size={15} /><input style="border:0;outline:none;width:150px" placeholder="Chercher un écran" value={recherche} onInput={(e) => setRecherche(e.target.value)} /></label>
          <select class="saisie" value={version} onChange={(e) => changerVersion(e.target.value)} aria-label="Version produit">
            <option value="toutes">Toutes les versions</option>
            {versions.map((v) => <option key={v.id} value={v.id}>Version {v.nom}</option>)}
            <option value="__gerer">{versions.length ? 'Gérer les versions…' : 'Définir des versions (MVP, V2…)'}</option>
          </select>
          <div class="segments">
            <button class={`segment ${vue === 'schema' ? 'actif' : ''}`} onClick={() => { setVue('schema'); ecrire('watson.ecrans.vue', 'schema'); }}><IconeSchema size={14} /> Carte</button>
            <button class={`segment ${vue === 'liste' ? 'actif' : ''}`} onClick={() => { setVue('liste'); ecrire('watson.ecrans.vue', 'liste'); }}><LayoutList size={14} /> Liste</button>
          </div>
        </div>
      </Entete>
      <div class="ligne barre-edition">
        <button class="bouton" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'edition' }); }}><Plus size={15} /> Écran</button>
        <button class="bouton bouton-watson" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'demande' }); }}><Sparkles size={15} /> Demander à Watson</button>
        {lot && <span class="badge b-violet">Aperçu : les changements proposés sont marqués sur la carte</span>}
      </div>
      {d.ecrans.length === 0 && !cote ? (
        <div class="vide pile" style="align-items:center"><Watson humeur="note" hauteur={180} />
          <span>Aucun écran pour l'instant. Crée-en un, demande-moi de le faire, ou donne-moi une maquette ou une spécification dans Alimenter.</span>
          <div class="ligne"><button class="bouton principal-b" onClick={() => setPanneau({ mode: 'demande' })}><Sparkles size={15} /> Demander à Watson</button><button class="bouton" onClick={() => aller('alimenter')}>Alimenter le projet</button></div></div>
      ) : (
        <div class="ligne" style="align-items:stretch;gap:14px;flex-wrap:nowrap;flex:1;min-height:0">
          <div style={`flex:1;min-width:0;display:flex;flex-direction:column;${vue === 'liste' ? 'overflow:auto' : ''}`}>
            {vue === 'schema'
              ? <SchemaEcrans ecrans={d.ecrans} applications={d.applications} choisi={choisi} choisir={(id) => { setChoisi(id); if (id && !lot) setPanneau(null); }} filtre={filtre} versions={versions} version={version} marques={marques} />
              : <ListeEcrans ecrans={d.ecrans} choisir={(id) => { setChoisi(id); setPanneau(null); }} filtre={filtre} versions={versions} />}
          </div>
          {cote}
        </div>
      )}
    </div>
  );
}
