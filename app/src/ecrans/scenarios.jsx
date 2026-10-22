// Onglet Scénarios : chaque scénario dessiné en diagramme de processus, un couloir par application.
// Colonnes calculées sur l'enchaînement des étapes, liens orthogonaux, statuts apposés en pilules noires.
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  AppWindow, ArrowRight, ArrowUp, Check, CircleDot, Diamond, Flag, LayoutList, Monitor, MousePointerClick, Pencil, Plus, Route, Scale, Search,
  Smartphone, Sparkles, Trash2, Workflow as IconeSchema, X
} from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { Attente, Entete, Statut, useVue, Watson } from './commun.jsx';
import { DemandeWatson, GererVersions, LotEnCours, slug } from './edition.jsx';
import { horsVersion } from './referentiels.jsx';
import { Fleches, Toile, largeurTexte, teinteClaire, trace } from './toile.jsx';

const GENRES = { debut: 'Début', etape: 'Étape', decision: 'Décision', statut: 'Statut apposé', fin: 'Fin' };
const GENRES_LIEN = { suite: 'Suite', refus: 'Refus, rejet', retour: 'Retour en arrière' };
const GRIS = '#6B7280';
const ECART_MIN = 64;
const RANG = 118;
const MARGE_COULOIR = 34;
const ESPACE_COULOIRS = 26;

function taille(e) {
  if (e.genre === 'statut') return { w: Math.max(120, largeurTexte(e.libelle, 13) + 10), h: 36 };
  if (e.genre === 'debut' || e.genre === 'fin') return { w: Math.min(190, Math.max(120, largeurTexte(e.libelle, 12.5) + 30)), h: 48 };
  if (e.genre === 'decision') return { w: 200, h: 66 };
  return { w: 214, h: e.regles.length || e.version || e.transition_nom ? 92 : 78 };
}

// Colonnes : plus long chemin depuis le début, en ignorant les retours (liens qui remontent le courant).
function colonnes(etapes, liens) {
  const ids = etapes.map((e) => e.id);
  const sortants = Object.fromEntries(ids.map((i) => [i, []]));
  for (const l of liens) if (sortants[l.de] && sortants[l.vers] !== undefined) sortants[l.de].push(l);
  const arriere = new Set();
  const etat = {};
  const visiter = (u) => {
    etat[u] = 1;
    for (const l of sortants[u]) {
      if (l.genre === 'retour' || etat[l.vers] === 1) arriere.add(l);
      else if (!etat[l.vers]) visiter(l.vers);
    }
    etat[u] = 2;
  };
  for (const i of ids) if (!etat[i]) visiter(i);
  const avant = liens.filter((l) => !arriere.has(l) && sortants[l.de] && sortants[l.vers]);
  const col = Object.fromEntries(ids.map((i) => [i, 0]));
  for (let tour = 0; tour < ids.length; tour++) {
    let change = false;
    for (const l of avant) if (col[l.vers] < col[l.de] + 1) { col[l.vers] = col[l.de] + 1; change = true; }
    if (!change) break;
  }
  return { col, arriere };
}

function disposer(sc, applications) {
  const etapes = sc.etapes.map((e) => ({ ...e, ...taille(e) }));
  const { col, arriere } = colonnes(etapes, sc.liens);
  const nbCol = Math.max(0, ...Object.values(col)) + 1;
  const largeurs = Array(nbCol).fill(0);
  for (const e of etapes) largeurs[col[e.id]] = Math.max(largeurs[col[e.id]], e.w);
  // L'espace après chaque colonne s'ajuste aux conditions écrites sur les liens qui en partent.
  const ecarts = Array(nbCol).fill(ECART_MIN);
  const colDe = Object.fromEntries(etapes.map((e) => [e.id, col[e.id]]));
  for (const l of sc.liens) if (l.libelle && colDe[l.de] !== undefined && !arriere.has(l)) ecarts[colDe[l.de]] = Math.max(ecarts[colDe[l.de]], largeurTexte(l.libelle, 12) + 30);
  const xCol = [];
  let x = MARGE_COULOIR + 150;
  for (let c = 0; c < nbCol; c++) { xCol.push(x); x += largeurs[c] + ecarts[c]; }
  const largeur = x - ecarts[nbCol - 1] + MARGE_COULOIR;
  const utilisees = [...new Set(etapes.map((e) => e.application || '_'))];
  const couloirs = [...applications.filter((a) => utilisees.includes(a.id)), ...(utilisees.includes('_') || utilisees.some((u) => u !== '_' && !applications.find((a) => a.id === u)) ? [{ id: '_', nom: 'Sans application', couleur: GRIS }] : [])];
  const couloirDe = (e) => (couloirs.find((c) => c.id === e.application) ? e.application : '_');
  const noeuds = [], fonds = [];
  let y = 0;
  for (const c of couloirs) {
    const dedans = etapes.filter((e) => couloirDe(e) === c.id);
    const rangs = {};
    for (const e of dedans) { const k = col[e.id]; e.rang = rangs[k] = (rangs[k] ?? -1) + 1; }
    const nbRangs = Math.max(1, ...Object.values(rangs).map((r) => r + 1));
    const h = nbRangs * RANG + 2 * 14;
    for (const e of dedans) {
      const cx = xCol[col[e.id]] + largeurs[col[e.id]] / 2;
      noeuds.push({ ...e, col: col[e.id], x: cx - e.w / 2, y: y + 14 + e.rang * RANG + (RANG - e.h) / 2, couloir: c.id });
    }
    fonds.push({ ...c, y, h, w: largeur });
    y += h + ESPACE_COULOIRS;
  }
  const pos = Object.fromEntries(noeuds.map((n) => [n.id, n]));
  const bloque = (yy, x1, x2, sauf) => noeuds.some((n) => !sauf.includes(n.id) && yy > n.y - 4 && yy < n.y + n.h + 4 && Math.max(x1, x2) > n.x && Math.min(x1, x2) < n.x + n.w);
  const traits = [];
  sc.liens.forEach((l, i) => {
    const s = pos[l.de], t = pos[l.vers];
    if (!s || !t) return;
    let pts;
    if (arriere.has(l) || t.col <= s.col) {
      const yb = Math.max(s.y + s.h, t.y + t.h) + 20;
      const sx = s.x + s.w / 2 + 14, tx = t.x + t.w / 2 - 14;
      pts = [{ x: sx, y: s.y + s.h }, { x: sx, y: yb }, { x: tx, y: yb }, { x: tx, y: t.y + t.h }];
    } else {
      const sy = s.y + s.h / 2, ty = t.y + t.h / 2;
      const x1 = s.x + s.w, x2 = t.x;
      if (Math.abs(sy - ty) < 1) pts = [{ x: x1, y: sy }, { x: x2, y: ty }];
      else {
        const tot = xCol[s.col] + largeurs[s.col] + ecarts[s.col] / 2;
        const tard = xCol[t.col] - ecarts[t.col - 1] / 2;
        const mx = !bloque(ty, tot, x2, [s.id, t.id]) ? tot : !bloque(sy, x1, tard, [s.id, t.id]) ? tard : tot;
        pts = [{ x: x1, y: sy }, { x: mx, y: sy }, { x: mx, y: ty }, { x: x2, y: ty }];
      }
    }
    let etiquette = null;
    if (l.libelle) {
      const w = largeurTexte(l.libelle, 12);
      // Sur le premier segment horizontal assez long, sinon au milieu du segment vertical.
      const a = pts[0], b = pts[1];
      if (Math.abs(a.y - b.y) < 1 && Math.abs(b.x - a.x) > w + 16) etiquette = { texte: l.libelle, x: (a.x + b.x) / 2 - w / 2, y: a.y - 13, w };
      else { const m = pts.length > 2 ? [pts[1], pts[2]] : [a, b]; etiquette = { texte: l.libelle, x: (m[0].x + m[1].x) / 2 - w / 2, y: (m[0].y + m[1].y) / 2 - 13, w }; }
    }
    traits.push({ id: `${l.de}>${l.vers}>${i}`, l, points: pts, etiquette, couleur: s.couleur || GRIS });
  });
  // Groupes : un cadre discret autour des étapes qui partagent un groupe, dans un même couloir.
  const groupes = [];
  const parGroupe = {};
  for (const n of noeuds) if (n.groupe) (parGroupe[`${n.couloir}|${n.groupe}`] ||= []).push(n);
  for (const [k, ns] of Object.entries(parGroupe)) {
    const x1 = Math.min(...ns.map((n) => n.x)) - 16, y1 = Math.min(...ns.map((n) => n.y)) - 26;
    const x2 = Math.max(...ns.map((n) => n.x + n.w)) + 16, y2 = Math.max(...ns.map((n) => n.y + n.h)) + 12;
    groupes.push({ id: k, nom: k.split('|')[1], x: x1, y: y1, w: x2 - x1, h: y2 - y1, couleur: ns[0].couleur || GRIS });
  }
  return { noeuds, traits, fonds, groupes, largeur, hauteur: Math.max(0, y - ESPACE_COULOIRS) };
}

function Etape({ e, choisie, attenuee, choisir, hors, nomV, version }) {
  const c = e.couleur || GRIS;
  const sortie = hors(e.version);
  const classes = `etape-sc g-${e.genre} ${choisie ? 'choisie' : ''} ${attenuee ? 'attenuee' : ''} ${sortie ? 'hors-version' : ''} ${e.a_trancher ? 'a-trancher' : ''}`;
  const pos = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px`;
  const clic = (ev) => { ev.stopPropagation(); choisir(e.id); };
  const pastille = e.version && (version === 'toutes' || sortie) && <span class="pastille-version">{nomV(e.version)}</span>;
  if (e.genre === 'statut') return <div class={classes} style={pos} onClick={clic} title="Statut apposé">{e.statut_nom || e.libelle}{pastille}</div>;
  if (e.genre === 'debut' || e.genre === 'fin') {
    return <div class={classes} style={`${pos};border-color:${teinteClaire(c, 0.4)}`} onClick={clic}>
      {e.genre === 'debut' ? <CircleDot size={15} color={c} /> : <Flag size={15} color={c} />}<span class="tronque">{e.libelle}</span>{pastille}</div>;
  }
  const Icone = e.genre === 'decision' ? Diamond : e.ecran ? AppWindow : MousePointerClick;
  return (
    <div class={`brique ${classes}`} style={`${pos};border-color:${sortie ? '' : e.genre === 'decision' ? '#F2C46D' : teinteClaire(c, 0.42)}`} onClick={clic}>
      <div class="brique-tete" style="height:64px;gap:10px;padding:0 12px">
        <span class="brique-icone" style={`flex-basis:36px;height:36px;border-radius:11px;${e.genre === 'decision' ? 'background:#FFF4E0;color:#B45309' : `background:${teinteClaire(c, 0.12)};color:${c}`}`}><Icone size={17} strokeWidth={1.9} /></span>
        <span class="pile espace" style="gap:2px;min-width:0">
          <strong class="brique-titre etape-titre">{e.libelle}</strong>
          {(e.acteur_nom || e.ecran_nom) && <span class="brique-sous tronque" style="font-size:11.5px">{[e.acteur_nom, e.ecran_nom].filter(Boolean).join(' · ')}</span>}
        </span>
      </div>
      {(e.transition_nom || e.regles.length > 0 || pastille || e.a_trancher) && (
        <div class="etape-pied">
          {e.transition_nom && <span class="puce-action tronque"><ArrowRight size={10} />{e.transition_nom}</span>}
          <span class="espace" />
          {e.a_trancher && <b class="a-trancher-txt petit">à trancher</b>}
          {pastille}
          {e.regles.length > 0 && <span class="pastille-regle" title={e.regles.map((r) => r.titre).join(', ')}><Scale size={11} />{e.regles.length}</span>}
        </div>
      )}
    </div>
  );
}

function SchemaScenario({ sc, applications, choisi, choisir, filtre, versions, version, marque }) {
  const plan = useMemo(() => disposer(sc, applications), [sc, applications]);
  const hors = (v) => horsVersion(versions, version, v);
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  const pos = Object.fromEntries(plan.noeuds.map((n) => [n.id, n]));
  const voisins = new Set();
  if (choisi) for (const t of plan.traits) { if (t.l.de === choisi) voisins.add(t.l.vers); if (t.l.vers === choisi) voisins.add(t.l.de); }
  const correspond = (e) => !filtre || `${e.libelle} ${e.acteur_nom || ''} ${e.ecran_nom || ''} ${e.statut_nom || ''}`.toLowerCase().includes(filtre);
  const style = (t) => {
    const actif = !choisi || t.l.de === choisi || t.l.vers === choisi;
    const sortie = hors(t.l.version) || hors(pos[t.l.de]?.version) || hors(pos[t.l.vers]?.version);
    if (sortie) return { stroke: '#C4C4CF', largeur: 1.6, pointilles: '5 5', fleche: '#C4C4CF', opacite: actif ? 1 : 0.5 };
    const o = actif ? 1 : 0.3;
    if (t.l.genre === 'refus') return { stroke: '#DC2626', largeur: 1.8, pointilles: '2 4', fleche: '#DC2626', opacite: o };
    if (t.l.genre === 'retour') return { stroke: '#A1A1AA', largeur: 1.6, pointilles: '7 5', fleche: '#A1A1AA', opacite: o };
    return { stroke: '#52525B', largeur: 1.9, fleche: '#52525B', opacite: o };
  };
  const sel = pos[choisi];
  return (
    <Toile largeur={plan.largeur} hauteur={plan.hauteur} focus={sel && { id: sel.id, x: sel.x, y: sel.y, w: sel.w }} onFond={() => choisir(null)}
      legende={<>
        <span class="pilule"><MousePointerClick size={13} color="#4F46E5" /> Étape</span>
        <span class="pilule"><Diamond size={13} color="#B45309" /> Décision</span>
        <span class="pilule pilule-echange">Statut apposé</span>
        <span class="pilule"><span class="trait-legende refus" /> Refus</span>
        <span class="pilule"><span class="trait-legende retour" /> Retour</span>
        <span class="pilule pilule-hors">Hors version</span>
        {marque && <span class={`pastille-marque ${marque}`} style="align-self:center">{marque === 'nouveau' ? 'scénario proposé' : 'scénario modifié'}</span>}
      </>}>
      {plan.fonds.map((f) => (
        <div key={f.id} class="couloir couloir-sc" style={`top:${f.y}px;width:${f.w}px;height:${f.h}px;background:${teinteClaire(f.couleur, 0.045)};border-color:${teinteClaire(f.couleur, 0.18)}`}>
          <span class="couloir-nom-sc" style={`color:${f.couleur}`}>{f.support === 'mobile' ? <Smartphone size={15} /> : <Monitor size={15} />}<span>{f.nom}</span></span>
        </div>
      ))}
      {plan.groupes.map((g) => (
        <div key={g.id} class="groupe-sc" style={`left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;border-color:${teinteClaire(g.couleur, 0.3)}`}>
          <span style={`color:${g.couleur}`}>{g.nom}</span>
        </div>
      ))}
      <svg class="schema-liens" width={plan.largeur + 40} height={plan.hauteur + 40}>
        <Fleches couleurs={['#52525B', '#DC2626', '#A1A1AA', '#C4C4CF']} />
        {plan.traits.map((t) => {
          const s = style(t);
          return <path key={t.id} d={trace(t.points)} fill="none" stroke={s.stroke} stroke-width={s.largeur} stroke-dasharray={s.pointilles || undefined}
            opacity={s.opacite} marker-end={`url(#f-${s.fleche.replace('#', '')})`} />;
        })}
      </svg>
      {plan.traits.filter((t) => t.etiquette).map((t) => (
        <span key={`l-${t.id}`} class={`etiquette-lien ${t.l.genre === 'refus' ? 'refus' : ''}`}
          style={`left:${t.etiquette.x}px;top:${t.etiquette.y}px;height:24px;font-size:12px;opacity:${!choisi || t.l.de === choisi || t.l.vers === choisi ? 1 : 0.35}`}>{t.etiquette.texte}</span>
      ))}
      {plan.noeuds.map((e) => (
        <Etape key={e.id} e={e} choisie={choisi === e.id} attenuee={(choisi && choisi !== e.id && !voisins.has(e.id)) || !correspond(e)} choisir={choisir}
          hors={hors} nomV={nomV} version={version} />
      ))}
    </Toile>
  );
}

function FicheEtape({ sc, e, choisir, aller, fermer, modifier, versions, projet, lance }) {
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  const nom = (id) => sc.etapes.find((x) => x.id === id)?.libelle || id;
  const sortants = sc.liens.filter((l) => l.de === e.id);
  const entrants = sc.liens.filter((l) => l.vers === e.id);
  return (
    <aside class="fiche" onMouseDown={(ev) => ev.stopPropagation()}>
      <div class="ligne"><span class="petit doux espace">{GENRES[e.genre]}{e.version_propre && ` · ${nomV(e.version_propre)}`}</span>
        <button class="bouton" onClick={modifier}><Pencil size={14} /> Modifier</button>
        <button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <h2>{e.libelle}</h2>
      <div class="ligne" style="gap:6px">
        {e.application_nom && <span class="badge" style={`background:${teinteClaire(e.couleur || GRIS, 0.12)};color:${e.couleur || GRIS}`}>{e.application_nom}</span>}
        {e.acteur_nom && <span class="badge b-gris">{e.acteur_nom}</span>}
        {e.groupe && <span class="badge b-gris">{e.groupe}</span>}
        {e.a_trancher && <span class="badge b-orange">à trancher</span>}
      </div>
      {e.description && <p class="doux">{e.description}</p>}
      <section class="pile" style="gap:6px">
        {e.ecran && <span class="petit"><span class="doux">Se passe sur </span><button class="lien" onClick={() => aller('ecrans')}>{e.ecran_nom || e.ecran}</button></span>}
        {e.transition_nom && <span class="petit"><span class="doux">Déclenche l'action </span><button class="lien" onClick={() => aller('referentiels')}>{e.transition_nom}</button></span>}
        {e.statut && <span class="petit"><span class="doux">Statut : </span><span class="statut-noir">{e.statut_nom || e.statut}</span></span>}
      </section>
      {(entrants.length > 0 || sortants.length > 0) && (
        <section class="pile" style="gap:6px">
          <h3>Enchaînement</h3>
          {entrants.map((l, i) => <span key={`e${i}`} class="petit"><span class="doux">Vient de </span><button class="lien" onClick={() => choisir(l.de)}>{nom(l.de)}</button>{l.libelle && <span class="doux"> « {l.libelle} »</span>}</span>)}
          {sortants.map((l, i) => <span key={`s${i}`} class="petit"><span class="doux">{l.genre === 'refus' ? 'En cas de refus, va à ' : l.genre === 'retour' ? 'Revient à ' : 'Puis '}</span><button class="lien" onClick={() => choisir(l.vers)}>{nom(l.vers)}</button>
            {l.libelle && <span class="doux"> si « {l.libelle} »</span>}{l.version && <span class="pastille-version" style="margin-left:6px">{nomV(l.version)}</span>}</span>)}
        </section>
      )}
      {e.regles.length > 0 && (
        <section class="pile" style="gap:6px">
          <h3>Règles qui s'appliquent</h3>
          {e.regles.map((r) => <button key={r.id} class="bouton" style="justify-content:space-between" onClick={() => aller('regles')}><span class="tronque">{r.titre}</span><Statut s={r.statut} /></button>)}
        </section>
      )}
      <section class="encadre-watson"><DemandeWatson projet={projet} element={sc.id} nomElement={`${e.libelle} (${sc.nom})`} lance={lance} exemple="si les documents sont refusés, l'expédition revient au brouillon" /></section>
    </aside>
  );
}

function EditionScenario({ projet, id, d, fini, annuler }) {
  const [f, setF] = useState(null);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const versions = d.versions_produit || [];
  useEffect(() => {
    if (id) appel(`/projets/${projet.id}/elements/${id}`).then((r) => setF({ ...r.contenu, liens: r.contenu.liens || [], _uc: (r.contenu.cas_usage || []).join(', ') })).catch((e) => setMessage(e.message));
    else setF({ id: '', nom: '', etapes: [{ id: '', libelle: '', genre: 'debut', application: d.applications[0]?.id }, { id: '', libelle: '', application: d.applications[0]?.id }], liens: [], _uc: '' });
  }, [id]);
  if (!f) return <p class="doux">Chargement…</p>;
  const ent = d.entites.find((x) => x.id === f.entite);
  const statuts = ent ? ent.statuts : d.entites.flatMap((x) => x.statuts);
  const transitions = ent ? ent.transitions : d.entites.flatMap((x) => x.transitions);
  const maj = (k, v) => setF({ ...f, [k]: v });
  const majL = (k, i, c, v) => setF({ ...f, [k]: f[k].map((x, j) => (j === i ? { ...x, [c]: v } : x)) });
  const retirer = (k, i) => setF({ ...f, [k]: f[k].filter((_, j) => j !== i) });
  const monter = (k, i) => { if (!i) return; const t = [...f[k]]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; setF({ ...f, [k]: t }); };
  // Repère d'étape : donné une fois pour toutes (les règles et les liens s'y réfèrent), tiré du libellé.
  const repere = (et, pris) => {
    if (et.id) return et.id;
    let base = slug(et.libelle || 'etape').slice(0, 30), r = base, n = 2;
    while (pris.has(r)) r = `${base}_${n++}`;
    return r;
  };
  const etapesNommees = () => {
    const pris = new Set(f.etapes.filter((e) => e.id).map((e) => e.id));
    return f.etapes.map((e) => { const r = repere(e, pris); pris.add(r); return { ...e, id: r }; });
  };
  const enregistrer = async () => {
    setMessage(null);
    if (!f.nom?.trim()) { setMessage('Donne un nom au scénario.'); return; }
    const etapes = etapesNommees().filter((e) => e.libelle?.trim());
    if (!etapes.length) { setMessage('Ajoute au moins une étape.'); return; }
    const c = { ...f, nom: f.nom.trim() };
    if (!c.id?.trim()) {
      let i = d.scenarios.length + 1; c.id = `SCN-${String(i).padStart(3, '0')}`;
      while (d.scenarios.some((x) => x.id === c.id)) c.id = `SCN-${String(++i).padStart(3, '0')}`;
    } else c.id = c.id.trim().toUpperCase();
    c.cas_usage = (f._uc || '').split(',').map((x) => x.trim()).filter(Boolean);
    delete c._uc;
    c.etapes = etapes.map((e) => {
      const r = { id: e.id, libelle: e.libelle.trim() };
      if (e.genre && e.genre !== 'etape') r.genre = e.genre;
      for (const k of ['description', 'application', 'acteur', 'ecran', 'statut', 'transition', 'groupe', 'version']) if (e[k]?.trim?.()) r[k] = e[k].trim();
      if (e.a_trancher) r.a_trancher = true;
      return r;
    });
    const ids = new Set(c.etapes.map((e) => e.id));
    const parIndex = etapesNommees();
    c.liens = (f.liens || []).map((l) => ({ ...l, de: parIndex[l._de]?.id ?? l.de, vers: parIndex[l._vers]?.id ?? l.vers }))
      .filter((l) => ids.has(l.de) && ids.has(l.vers))
      .map((l) => ({ de: l.de, vers: l.vers, ...(l.libelle?.trim() ? { libelle: l.libelle.trim() } : {}), ...(l.genre && l.genre !== 'suite' ? { genre: l.genre } : {}), ...(l.version ? { version: l.version } : {}) }));
    for (const k of ['description', 'version', 'acteur', 'entite']) if (!c[k]) delete c[k];
    for (const k of ['cas_usage', 'liens']) if (!c[k]?.length) delete c[k];
    if (!c.a_trancher) delete c.a_trancher;
    setOccupe(true);
    try { await appel(`/projets/${projet.id}/elements`, { corps: { type: 'scenario', contenu: c } }); fini(c.id); } catch (e) { setMessage(e.message); setOccupe(false); }
  };
  const supprimer = async () => {
    setOccupe(true);
    try { await appel(`/projets/${projet.id}/elements/${id}`, { methode: 'DELETE', corps: {} }); fini(null); } catch (e) { setMessage(e.message); setOccupe(false); setConfirmer(false); }
  };
  // Les liens désignent les étapes par leur position tant qu'elles n'ont pas de repère.
  const choixEtape = (l, cle) => {
    const v = l[`_${cle}`] ?? f.etapes.findIndex((e) => e.id && e.id === l[cle]);
    return v === -1 ? '' : String(v);
  };
  const libelleEtape = (e, i) => e.libelle?.trim() || `Étape ${i + 1}`;
  const select = (valeur, change, options, vide, style = '') => (
    <select class="saisie" style={style} value={valeur || ''} onChange={(ev) => change(ev.target.value)}><option value="">{vide}</option>{options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
  );
  return (
    <div class="pile edition" style="gap:12px">
      <div class="ligne"><span class="petit doux espace">{id ? 'Modifier un scénario' : 'Créer un scénario'}</span><button class="bouton icone" aria-label="Fermer" onClick={annuler}><X size={15} /></button></div>
      <div class="ligne" style="gap:8px;flex-wrap:nowrap">
        <label class="champ" style="width:120px">Repère<input value={f.id} disabled={!!id} placeholder="SCN-…" onInput={(e) => maj('id', e.target.value)} /></label>
        <label class="champ espace">Nom<input value={f.nom} onInput={(e) => maj('nom', e.target.value)} /></label>
      </div>
      <div class="ligne" style="gap:8px">
        <label class="champ">Acteur principal{select(f.acteur, (v) => maj('acteur', v), d.acteurs.map((a) => [a.id, a.nom]), 'Aucun')}</label>
        {d.entites.length > 0 && <label class="champ">Objet suivi{select(f.entite, (v) => maj('entite', v), d.entites.map((x) => [x.id, x.nom]), 'Aucun')}</label>}
        {versions.length > 0 && <label class="champ">Version{select(f.version, (v) => maj('version', v), versions.map((v) => [v.id, v.nom]), 'Aucune en particulier')}</label>}
      </div>
      <label class="ligne petit" style="gap:6px"><input type="checkbox" checked={!!f.a_trancher} onChange={(e) => maj('a_trancher', e.target.checked)} /> Scénario encore à trancher</label>
      <label class="champ">Cas d'usage<input placeholder="UC 04, UC 05" value={f._uc} onInput={(e) => maj('_uc', e.target.value)} /></label>
      <label class="champ">Description<textarea rows={2} value={f.description || ''} onInput={(e) => maj('description', e.target.value)} /></label>
      <section class="pile" style="gap:8px">
        <h3>Étapes</h3>
        {f.etapes.map((e, i) => (
          <div key={i} class="ligne-edition pile" style="gap:6px">
            <div class="ligne" style="gap:6px;flex-wrap:nowrap">
              <select class="saisie" style="flex:0 0 136px" value={e.genre || 'etape'} onChange={(ev) => majL('etapes', i, 'genre', ev.target.value)}>{Object.entries(GENRES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input class="saisie espace" placeholder={e.genre === 'decision' ? 'Question (Conforme ?)' : 'Libellé'} value={e.libelle} onInput={(ev) => majL('etapes', i, 'libelle', ev.target.value)} />
              <button class="bouton icone" title="Monter" onClick={() => monter('etapes', i)}><ArrowUp size={13} /></button>
              <button class="bouton icone" title="Retirer" onClick={() => retirer('etapes', i)}><Trash2 size={13} /></button>
            </div>
            <div class="ligne" style="gap:6px">
              {d.applications.length > 0 && select(e.application, (v) => majL('etapes', i, 'application', v), d.applications.map((a) => [a.id, a.nom]), 'Application', 'flex:1')}
              {e.genre !== 'statut' && select(e.acteur, (v) => majL('etapes', i, 'acteur', v), d.acteurs.map((a) => [a.id, a.nom]), 'Acteur', 'flex:1')}
              {e.genre === 'statut' && select(e.statut, (v) => majL('etapes', i, 'statut', v), statuts.map((s) => [s.id, s.nom]), 'Statut', 'flex:1')}
            </div>
            {(!e.genre || e.genre === 'etape') && (
              <div class="ligne" style="gap:6px">
                {select(e.ecran, (v) => majL('etapes', i, 'ecran', v), d.ecrans.map((x) => [x.id, x.nom]), 'Écran', 'flex:1')}
                {transitions.length > 0 && select(e.transition, (v) => majL('etapes', i, 'transition', v), transitions.map((t) => [t.id, t.nom]), 'Action du workflow', 'flex:1')}
              </div>
            )}
            <div class="ligne" style="gap:6px">
              <input class="saisie espace" placeholder="Groupe (facultatif)" value={e.groupe || ''} onInput={(ev) => majL('etapes', i, 'groupe', ev.target.value)} />
              {versions.length > 0 && select(e.version, (v) => majL('etapes', i, 'version', v), versions.map((v) => [v.id, v.nom]), 'Version')}
              <label class="ligne petit" style="gap:4px"><input type="checkbox" checked={!!e.a_trancher} onChange={(ev) => majL('etapes', i, 'a_trancher', ev.target.checked)} /> à trancher</label>
            </div>
          </div>
        ))}
        <button class="bouton" style="align-self:flex-start" onClick={() => maj('etapes', [...f.etapes, { id: '', libelle: '', application: f.etapes[f.etapes.length - 1]?.application }])}><Plus size={15} /> Ajouter une étape</button>
      </section>
      <section class="pile" style="gap:8px">
        <h3>Liens</h3>
        {f.liens.length === 0 && <p class="petit doux">Sans lien écrit, les étapes s'enchaînent dans l'ordre. Ajoute des liens pour une décision, un refus ou un retour.</p>}
        {f.liens.map((l, i) => (
          <div key={i} class="ligne-edition pile" style="gap:6px">
            <div class="ligne" style="gap:6px;flex-wrap:nowrap">
              <select class="saisie espace" value={choixEtape(l, 'de')} onChange={(ev) => majL('liens', i, '_de', ev.target.value === '' ? undefined : Number(ev.target.value))}><option value="">De…</option>{f.etapes.map((e, j) => <option key={j} value={j}>{libelleEtape(e, j)}</option>)}</select>
              <ArrowRight size={14} color="#A1A1AA" />
              <select class="saisie espace" value={choixEtape(l, 'vers')} onChange={(ev) => majL('liens', i, '_vers', ev.target.value === '' ? undefined : Number(ev.target.value))}><option value="">Vers…</option>{f.etapes.map((e, j) => <option key={j} value={j}>{libelleEtape(e, j)}</option>)}</select>
              <button class="bouton icone" title="Retirer" onClick={() => retirer('liens', i)}><Trash2 size={13} /></button>
            </div>
            <div class="ligne" style="gap:6px">
              <input class="saisie espace" placeholder="Condition (Oui, Conforme…)" value={l.libelle || ''} onInput={(ev) => majL('liens', i, 'libelle', ev.target.value)} />
              <select class="saisie" value={l.genre || 'suite'} onChange={(ev) => majL('liens', i, 'genre', ev.target.value)}>{Object.entries(GENRES_LIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {versions.length > 0 && select(l.version, (v) => majL('liens', i, 'version', v), versions.map((v) => [v.id, v.nom]), 'Version')}
            </div>
          </div>
        ))}
        <button class="bouton" style="align-self:flex-start" onClick={() => {
          // Premier lien ajouté : on écrit d'abord l'enchaînement dans l'ordre, pour ne rien perdre.
          const base = f.liens.length ? f.liens : f.etapes.slice(1).map((_, j) => ({ _de: j, _vers: j + 1 }));
          maj('liens', [...base, { genre: 'suite' }]);
        }}><Plus size={15} /> Ajouter un lien</button>
      </section>
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

function ListeScenario({ sc, choisir, filtre, versions }) {
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v || '';
  const ok = (e) => !filtre || `${e.libelle} ${e.acteur_nom || ''} ${e.ecran_nom || ''}`.toLowerCase().includes(filtre);
  const suite = (e) => sc.liens.filter((l) => l.de === e.id).map((l) => `${l.libelle ? `${l.libelle} : ` : ''}${sc.etapes.find((x) => x.id === l.vers)?.libelle || l.vers}`).join(' ; ');
  return (
    <div class="cadre-tableau">
      <table class="tableau">
        <thead><tr><th>Étape</th><th>Application</th><th>Acteur</th><th>Écran</th><th>Action, statut</th><th>Version</th><th>Puis</th></tr></thead>
        <tbody>{sc.etapes.filter(ok).map((e) => (
          <tr key={e.id} class="cliquable" onClick={() => choisir(e.id)}>
            <td><strong style="color:var(--indigo)">{e.libelle}</strong><div class="petit doux">{GENRES[e.genre]}{e.a_trancher ? ' · à trancher' : ''}</div></td>
            <td>{e.application_nom || ''}</td>
            <td class="doux">{e.acteur_nom || ''}</td>
            <td class="doux">{e.ecran_nom || ''}</td>
            <td class="doux">{e.transition_nom || ''}{e.statut_nom && <span class="statut-noir">{e.statut_nom}</span>}</td>
            <td>{e.version_propre && <span class="pastille-version">{nomV(e.version_propre)}</span>}</td>
            <td class="doux">{suite(e)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Scenarios({ projet, aller }) {
  const { donnees: base, erreur, recharger } = useVue(`/projets/${projet.id}/scenarios`);
  const lire = (k, defaut) => { try { return localStorage.getItem(k) || defaut; } catch { return defaut; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans importance */ } };
  const [vue, setVue] = useState(() => lire('watson.scenarios.vue', 'schema'));
  const [version, setVersion] = useState(() => lire(`watson.version.${projet.id}`, 'toutes'));
  const [courant, setCourant] = useState(() => lire(`watson.scenario.${projet.id}`, ''));
  const [choisi, setChoisi] = useState(null);
  const [panneau, setPanneau] = useState(null);
  const [lot, setLot] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [recherche, setRecherche] = useState('');
  const d = apercu ? apercu.scenarios : base;
  if (!d) return <Attente erreur={erreur} />;
  const versions = d.versions_produit || [];
  const filtre = recherche.trim().toLowerCase();
  const sc = d.scenarios.find((x) => x.id === courant) || d.scenarios[0];
  const marques = apercu ? Object.fromEntries([...apercu.nouveaux.map((i) => [i, 'nouveau']), ...apercu.modifies.map((i) => [i, 'modifie'])]) : {};
  const changerScenario = (id) => { setCourant(id); setChoisi(null); if (panneau?.mode === 'edition' || panneau?.mode === 'demande') setPanneau(null); ecrire(`watson.scenario.${projet.id}`, id); };
  const lancerLot = async (l) => {
    setLot(l); setPanneau(null); setChoisi(null);
    try {
      const a = await appel(`/projets/${projet.id}/alimenter/${l.id}/apercu`);
      setApercu(a);
      const touche = [...a.nouveaux, ...a.modifies].find((i) => a.scenarios.scenarios.some((x) => x.id === i));
      if (touche) setCourant(touche);
    } catch { setApercu(null); }
  };
  const finirLot = (r) => { setLot(null); setApercu(null); recharger(); setPanneau({ mode: 'bilan', r }); };
  const abandonnerLot = async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); setApercu(null); };
  const changerVersion = (v) => { if (v === '__gerer') { setPanneau({ mode: 'versions' }); return; } setVersion(v); ecrire(`watson.version.${projet.id}`, v); };
  const etape = sc && choisi ? sc.etapes.find((e) => e.id === choisi) : null;
  let cote = null;
  if (lot) cote = <aside class="fiche"><LotEnCours projet={projet} lot={lot} fini={finirLot} abandonner={abandonnerLot} /></aside>;
  else if (panneau?.mode === 'edition') cote = <aside class="fiche"><EditionScenario key={panneau.id || 'nouveau'} projet={projet} id={panneau.id} d={d} fini={(id) => { setPanneau(null); recharger(); if (id) { setCourant(id); ecrire(`watson.scenario.${projet.id}`, id); } }} annuler={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'demande') cote = <aside class="fiche"><DemandeWatson projet={projet} element={panneau.element} nomElement={panneau.nom} lance={lancerLot} fermer={() => setPanneau(null)} exemple={panneau.element ? "ajoute une étape de paiement après la livraison, en V2" : "décris le parcours de facturation : le comptable émet la facture, l'expéditeur la paie"} /></aside>;
  else if (panneau?.mode === 'versions') cote = <aside class="fiche"><GererVersions projet={projet} versions={versions} fini={() => { setPanneau(null); recharger(); }} fermer={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'bilan') cote = <aside class="fiche"><div class="ligne" style="gap:10px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={90} flotte={false} /><span class="espace"><strong>C'est noté.</strong></span><button class="bouton icone" aria-label="Fermer" onClick={() => setPanneau(null)}><X size={15} /></button></div>{panneau.r.ecrits.map((e) => <span key={e.id} class="petit ligne"><Check size={14} color="#166534" /> {e.titre}</span>)}</aside>;
  else if (etape) cote = <FicheEtape sc={sc} e={etape} choisir={setChoisi} aller={aller} fermer={() => setChoisi(null)} versions={versions} projet={projet} lance={lancerLot} modifier={() => setPanneau({ mode: 'edition', id: sc.id })} />;
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  return (
    <div class="pile referentiels" style="gap:16px">
      <Entete titre="Scénarios" description="Les parcours de bout en bout : qui fait quoi, sur quel écran, et quel statut l'objet prend à chaque étape.">
        <div class="ligne">
          <label class="ligne saisie" style="gap:6px;min-height:36px"><Search size={15} /><input style="border:0;outline:none;width:150px" placeholder="Chercher une étape" value={recherche} onInput={(e) => setRecherche(e.target.value)} /></label>
          <select class="saisie" value={version} onChange={(e) => changerVersion(e.target.value)} aria-label="Version produit">
            <option value="toutes">Toutes les versions</option>
            {versions.map((v) => <option key={v.id} value={v.id}>Version {v.nom}</option>)}
            <option value="__gerer">{versions.length ? 'Gérer les versions…' : 'Définir des versions (MVP, V2…)'}</option>
          </select>
          <div class="segments">
            <button class={`segment ${vue === 'schema' ? 'actif' : ''}`} onClick={() => { setVue('schema'); ecrire('watson.scenarios.vue', 'schema'); }}><IconeSchema size={14} /> Diagramme</button>
            <button class={`segment ${vue === 'liste' ? 'actif' : ''}`} onClick={() => { setVue('liste'); ecrire('watson.scenarios.vue', 'liste'); }}><LayoutList size={14} /> Liste</button>
          </div>
        </div>
      </Entete>
      <div class="ligne barre-edition">
        {d.scenarios.length > 0 && (
          <div class="onglets-sc" role="tablist">
            {d.scenarios.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === sc?.id} class={`onglet-sc ${x.id === sc?.id ? 'actif' : ''} ${horsVersion(versions, version, x.version) ? 'hors' : ''}`} onClick={() => changerScenario(x.id)}>
                <Route size={14} />{x.nom}{x.version && <span class="pastille-version">{nomV(x.version)}</span>}
                {marques[x.id] && <span class={`pastille-marque ${marques[x.id]}`}>{marques[x.id] === 'nouveau' ? 'proposé' : 'modifié'}</span>}
              </button>
            ))}
          </div>
        )}
        <span class="espace" />
        {sc && <BoutonComite projet={projet} cible={{ type: 'scenario', id: sc.id }} desactive={!!lot} />}
        {sc && <button class="bouton" disabled={!!lot} onClick={() => setPanneau({ mode: 'edition', id: sc.id })}><Pencil size={14} /> Modifier</button>}
        <button class="bouton" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'edition' }); }}><Plus size={15} /> Scénario</button>
        <button class="bouton bouton-watson" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'demande', element: sc?.id, nom: sc?.nom }); }}><Sparkles size={15} /> Demander à Watson</button>
      </div>
      {lot && <span class="badge b-violet" style="align-self:flex-start">Aperçu : le scénario proposé est affiché, rien n'est encore enregistré</span>}
      {sc && (
        <div class="ligne bandeau-sc">
          {sc.description && <span class="doux espace">{sc.description}</span>}
          {sc.acteur && <span class="badge b-gris">{sc.acteur.nom}</span>}
          {sc.entite && <span class="badge b-indigo">{sc.entite.nom}</span>}
          {sc.a_trancher && <span class="badge b-orange">à trancher</span>}
          {sc.cas_usage.map((u) => <span key={u} class="puce-uc">{u}</span>)}
        </div>
      )}
      {!sc && !cote ? (
        <div class="vide pile" style="align-items:center"><Watson humeur="reflechit" hauteur={180} />
          <span>Aucun scénario pour l'instant. Décris un parcours, demande-moi de le dessiner, ou donne-moi un compte rendu d'atelier dans Alimenter.</span>
          <div class="ligne"><button class="bouton principal-b" onClick={() => setPanneau({ mode: 'demande' })}><Sparkles size={15} /> Demander à Watson</button><button class="bouton" onClick={() => setPanneau({ mode: 'edition' })}><Plus size={15} /> Créer un scénario</button></div></div>
      ) : (
        <div class="ligne" style="align-items:stretch;gap:14px;flex-wrap:nowrap;flex:1;min-height:0">
          {sc && (
            <div style={`flex:1;min-width:0;display:flex;flex-direction:column;${vue === 'liste' ? 'overflow:auto' : ''}`}>
              {vue === 'schema'
                ? <SchemaScenario key={sc.id} sc={sc} applications={d.applications} choisi={choisi} choisir={(id) => { setChoisi(id); if (id && !lot) setPanneau(null); }} filtre={filtre} versions={versions} version={version} marque={marques[sc.id]} />
                : <ListeScenario sc={sc} choisir={(id) => { setChoisi(id); setPanneau(null); }} filtre={filtre} versions={versions} />}
            </div>
          )}
          {cote}
        </div>
      )}
    </div>
  );
}
