import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  BadgeCheck, Building2, CreditCard, Database, IdCard, KeyRound, LayoutList, Link2, List as IconeListe, MapPin, Maximize2, Minus, Package, Plus,
  Check, Pencil, Scale, Search, Send, Shield, Sparkles, Truck, User, Workflow as IconeSchema, X
} from 'lucide-preact';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Attente, Entete, Statut, useVue, Watson } from './commun.jsx';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { DemandeWatson, Edition, GererVersions, LotEnCours } from './edition.jsx';
import { Workflow } from './workflow.jsx';

const TYPES = { enum: 'Choix', booleen: 'Oui ou non', texte: 'Texte', nombre: 'Nombre', date: 'Date', reference: 'Lien', liste: 'Liste de valeurs' };
const L = 300; // largeur d'une brique
const ENTETE = 74;
const LIGNE = 31;
const GROUPE = 26;
const PIED = 8;

// Une icône parlante selon le nom de l'entité, sinon une icône générique.
const ICONES = [
  [/soci[ée]t|entreprise|organisation|compagnie/i, Building2], [/lieu|site|adresse|entrep[oô]t|magasin/i, MapPin],
  [/personne|utilisateur|contact|client|chauffeur|agent/i, User], [/agr[ée]ment|certificat|habilitation|validation/i, BadgeCheck],
  [/v[ée]hicule|camion|transport/i, Truck], [/exp[ée]dition|colis|marchandise|lot|envoi/i, Package], [/exp[ée]diteur|destinataire/i, Send],
  [/pi[eè]ce|identit[ée]|badge|carte d'/i, IdCard], [/r[ôo]le|s[ûu]ret[ée]|s[ée]curit/i, Shield], [/droit|acc[eè]s|permission/i, KeyRound],
  [/paiement|facture|tarif|prix/i, CreditCard]
];
const icone = (n) => (n.genre === 'liste' ? IconeListe : (ICONES.find(([re]) => re.test(n.nom)) || [null, Database])[1]);
const elk = new ELK();

// Versions produit : un élément d'une version postérieure à celle choisie est « hors version » (en pointillés).
export function horsVersion(versions, choisie, v) {
  if (!choisie || choisie === 'toutes' || !v) return false;
  const rang = (x) => versions.findIndex((y) => y.id === x);
  return rang(v) > rang(choisie);
}
const nomVersion = (versions, v) => versions.find((x) => x.id === v)?.nom || v;

// Lignes d'une liste de valeurs, avec les intertitres de groupe (Traçable, Non traçable…).
function lignesListe(liste) {
  const out = [];
  let groupe = null;
  for (const v of liste.valeurs) {
    if ((v.groupe || null) !== groupe) { groupe = v.groupe || null; if (groupe) out.push({ entete: true, groupe }); }
    out.push(v);
  }
  return out;
}

function hauteur(el) {
  if (el.genre === 'liste') return ENTETE + lignesListe(el).reduce((h, l) => h + (l.entete ? GROUPE : LIGNE), 0) + PIED;
  return ENTETE + Math.max(1, el.donnees.length) * LIGNE + PIED;
}

async function disposer(entites, listes) {
  const noeuds = [...entites.map((e) => ({ ...e, genre: 'entite' })), ...listes.map((l) => ({ ...l, genre: 'liste' }))];
  const ids = new Set(noeuds.map((n) => n.id));
  // Le trait réciproque part de l'entité la plus « centrale » (celle qui porte le plus de liens), sinon de la première.
  const poids = Object.fromEntries(noeuds.map((n, i) => [n.id, (n.donnees || []).filter((d) => d.cible).length * 1000 - i]));
  // Liens réciproques (Société ↔ Lieu) : un seul trait à double flèche, tiré depuis l'entité qui vient en premier.
  const reciproque = (a, b) => noeuds.find((n) => n.id === b)?.donnees?.some((d) => d.cible === a);
  const aretes = [];
  const graphe = {
    id: 'racine',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110', 'elk.spacing.nodeNode': '44', 'elk.spacing.edgeNode': '24', 'elk.spacing.edgeEdge': '14',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true', 'elk.spacing.componentComponent': '70'
    },
    children: noeuds.map((n) => {
      const ports = [{ id: `${n.id}:entree`, width: 1, height: 1, x: -1, y: ENTETE / 2, layoutOptions: { 'elk.port.side': 'WEST' } }];
      if (n.genre === 'entite') {
        n.donnees.forEach((d, i) => {
          if (d.cible && ids.has(d.cible)) {
            const double = reciproque(n.id, d.cible);
            if (double && poids[d.cible] > poids[n.id]) return; // l'autre sens le dessine déjà
            const port = `${n.id}:${d.nom}`;
            ports.push({ id: port, width: 1, height: 1, x: L, y: ENTETE + i * LIGNE + LIGNE / 2, layoutOptions: { 'elk.port.side': 'EAST' } });
            aretes.push({ id: `${port}>${d.cible}`, sources: [port], targets: [`${d.cible}:entree`], liste: d.cible_genre === 'liste', double });
          }
        });
      }
      return { id: n.id, width: L, height: hauteur(n), ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } };
    }),
    edges: aretes
  };
  const res = await elk.layout(graphe);
  const pos = Object.fromEntries(res.children.map((c) => [c.id, c]));
  return {
    noeuds: noeuds.map((n) => ({ ...n, x: pos[n.id].x, y: pos[n.id].y, h: pos[n.id].height })),
    aretes: res.edges.map((e, i) => ({ id: e.id, liste: aretes[i].liste, double: aretes[i].double, points: e.sections?.flatMap((s) => [s.startPoint, ...(s.bendPoints || []), s.endPoint]) || [] })),
    largeur: res.width, hauteur: res.height
  };
}

// Tracé orthogonal aux angles arrondis.
function trace(pts, r = 8) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const r1 = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    d += ` L${b.x - ux * r1},${b.y - uy * r1} Q${b.x},${b.y} ${b.x + vx * r1},${b.y + vy * r1}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${z.x},${z.y}`;
}

function Brique({ n, choisi, attenue, choisir, versions, version, marque }) {
  const liste = n.genre === 'liste';
  const hors = (v) => horsVersion(versions, version, v);
  const pastilleVersion = (v) => (v && (version === 'toutes' || hors(v)) ? <span class="pastille-version">{nomVersion(versions, v)}</span> : null);
  const nbRegles = liste ? 0 : n.regles.length;
  const Icone = icone(n);
  const liens = liste ? 0 : n.donnees.filter((d) => d.cible).length;
  const sous = liste ? `Liste de valeurs · ${n.valeurs.length} valeur${n.valeurs.length > 1 ? 's' : ''}`
    : [`${n.donnees.length} donnée${n.donnees.length > 1 ? 's' : ''}`, liens && `${liens} lien${liens > 1 ? 's' : ''}`,
      nbRegles && `${nbRegles} règle${nbRegles > 1 ? 's' : ''}`, n.cycle.length && `${n.cycle.length} statuts`].filter(Boolean).join(' · ');
  return (
    <div class={`brique ${liste ? 'brique-liste' : ''} ${choisi ? 'choisie' : ''} ${attenue ? 'attenuee' : ''} ${hors(n.version) ? 'hors-version' : ''} ${marque ? `marque-${marque}` : ''}`}
      style={`left:${n.x}px;top:${n.y}px;width:${L}px;height:${n.h}px`} onClick={(e) => { e.stopPropagation(); choisir(n.id); }}>
      <div class="brique-tete" style={`height:${ENTETE}px`}>
        <span class="brique-icone"><Icone size={20} strokeWidth={1.8} /></span>
        <span class="pile espace" style="gap:2px;min-width:0">
          <span class="ligne" style="gap:6px;flex-wrap:nowrap;min-width:0"><strong class="tronque brique-titre">{n.nom}</strong>{pastilleVersion(n.version)}
            {marque && <span class={`pastille-marque ${marque}`}>{marque === 'nouveau' ? 'proposé' : 'modifié'}</span>}</span>
          <span class="brique-sous tronque"><i class="point-couleur" />{sous}</span>
        </span>
      </div>
      {liste
        ? lignesListe(n).map((l, i) => (l.entete
          ? <div key={i} class="brique-groupe" style={`height:${GROUPE}px`}>{l.groupe}</div>
          : <div key={i} class={`brique-ligne ${hors(l.version) ? 'hors-version' : ''}`} style={`height:${LIGNE}px`}><span class="espace tronque">{l.nom}</span>
            {l.version !== n.version && pastilleVersion(l.version)}{l.note && <span class="brique-note tronque">{l.note}</span>}</div>))
        : n.donnees.length === 0
          ? <div class="brique-ligne doux" style={`height:${LIGNE}px`}>Aucune donnée décrite</div>
          : n.donnees.map((d) => (
            <div key={d.nom} class={`brique-ligne ${d.cible ? 'lien' : ''} ${d.optionnel ? 'optionnelle' : ''} ${hors(d.version) ? 'hors-version' : ''}`} style={`height:${LIGNE}px`}>
              <span class="espace tronque">{d.libelle}{d.multiple && <span class="multiple" title="Plusieurs valeurs possibles"> [ ]</span>}</span>
              {d.version_propre && pastilleVersion(d.version_propre)}
              {d.regles.length > 0 && <span class="pastille-regle" title={d.regles.map((r) => r.titre).join(', ')}><Scale size={11} />{d.regles.length}</span>}
              {d.cible ? <span class={`brique-cible ${d.cible_genre}`}>{d.cible_nom}</span>
                : d.optionnel ? <span class="brique-note">optionnel</span> : <span class="brique-type">{TYPES[d.type] || d.type}</span>}
            </div>
          ))}
    </div>
  );
}

function Schema({ entites, listes, choisi, choisir, filtre, versions = [], version = 'toutes', marques = {} }) {
  const [plan, setPlan] = useState(null);
  const [vue, setVue] = useState({ x: 24, y: 24, k: 1 });
  const cadre = useRef(null);
  const glisse = useRef(null);
  useEffect(() => { disposer(entites, listes).then((p) => { setPlan(p); }); }, [entites, listes]);
  const ajuster = () => {
    if (!plan || !cadre.current) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const k = Math.min(1.1, (w - 48) / plan.largeur, (h - 130) / plan.hauteur);
    setVue({ k, x: (w - plan.largeur * k) / 2, y: Math.max(68, (h - plan.hauteur * k) / 2 + 20) });
  };
  // À l'ouverture : tout voir si ça reste lisible, sinon une taille confortable en partant du haut à gauche.
  useEffect(() => {
    if (!plan || !cadre.current) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const k = Math.min(1.1, (w - 48) / plan.largeur, (h - 130) / plan.hauteur);
    if (k >= 0.72) ajuster();
    else setVue({ k: 0.85, x: 32, y: 72 });
  }, [plan]);
  // Centrer la brique choisie si elle sort du cadre.
  useEffect(() => {
    if (!plan || !choisi || !cadre.current) return;
    const n = plan.noeuds.find((x) => x.id === choisi);
    if (!n) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const sx = vue.x + n.x * vue.k, sy = vue.y + n.y * vue.k;
    if (sx < 0 || sy < 0 || sx + L * vue.k > w || sy + 60 > h) setVue({ ...vue, x: w / 2 - (n.x + L / 2) * vue.k, y: 90 - n.y * vue.k });
  }, [choisi]);
  if (!plan) return <div class="schema-cadre"><p class="chargement">Mise en page…</p></div>;
  const zoom = (f, cx, cy) => {
    const k = Math.min(2.2, Math.max(0.25, vue.k * f));
    const px = cx ?? cadre.current.clientWidth / 2, py = cy ?? cadre.current.clientHeight / 2;
    setVue({ k, x: px - (px - vue.x) * (k / vue.k), y: py - (py - vue.y) * (k / vue.k) });
  };
  const roue = (e) => {
    e.preventDefault();
    const r = cadre.current.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else setVue((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  };
  const voisins = new Set();
  if (choisi) {
    for (const n of plan.noeuds) {
      if (n.id === choisi) (n.donnees || []).forEach((d) => d.cible && voisins.add(d.cible));
      if ((n.donnees || []).some((d) => d.cible === choisi)) voisins.add(n.id);
    }
  }
  const correspond = (n) => !filtre || n.nom.toLowerCase().includes(filtre) || (n.donnees || n.valeurs).some((d) => (d.libelle || d.nom).toLowerCase().includes(filtre));
  return (
    <div class="schema-cadre" ref={cadre} onWheel={roue}
      onMouseDown={(e) => { if (e.button === 0) glisse.current = { x: e.clientX - vue.x, y: e.clientY - vue.y, bouge: false }; }}
      onMouseMove={(e) => { if (glisse.current) { glisse.current.bouge = true; setVue({ ...vue, x: e.clientX - glisse.current.x, y: e.clientY - glisse.current.y }); } }}
      onMouseUp={() => { if (glisse.current && !glisse.current.bouge) choisir(null); glisse.current = null; }}
      onMouseLeave={() => { glisse.current = null; }}>
      <div class="schema-plan" style={`transform:translate(${vue.x}px,${vue.y}px) scale(${vue.k});width:${plan.largeur}px;height:${plan.hauteur}px`}>
        <svg class="schema-liens" width={plan.largeur + 20} height={plan.hauteur + 20}>
          <defs>
            <marker id="fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#4F46E5" /></marker>
            <marker id="fleche-liste" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#B45309" /></marker>
            <marker id="fleche-pale" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#CBD5E1" /></marker>
            <marker id="point" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="3.6" fill="#4F46E5" /></marker>
            <marker id="fleche-debut" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#4F46E5" /></marker>
          </defs>
          {plan.aretes.map((a) => {
            const [src, cible] = a.id.split('>');
            const actif = !choisi || src.startsWith(`${choisi}:`) || cible === choisi;
            const [srcId, donnee] = src.split(':');
            const d = plan.noeuds.find((x) => x.id === srcId)?.donnees?.find((x) => x.nom === donnee);
            const horsV = horsVersion(versions, version, d?.version) || horsVersion(versions, version, plan.noeuds.find((x) => x.id === cible)?.version);
            const debut = actif ? (a.double ? 'url(#fleche-debut)' : 'url(#point)') : undefined;
            return <path key={a.id} d={trace(a.points)} class={`lien-schema ${a.liste ? 'vers-liste' : ''} ${actif ? '' : 'pale'} ${horsV ? 'hors-version' : ''}`}
              marker-start={a.liste ? undefined : debut} marker-end={actif ? (a.liste ? 'url(#fleche-liste)' : 'url(#fleche)') : 'url(#fleche-pale)'} />;
          })}
        </svg>
        {plan.noeuds.map((n) => (
          <Brique key={n.id} n={n} choisi={choisi === n.id} attenue={(choisi && choisi !== n.id && !voisins.has(n.id)) || !correspond(n)} choisir={choisir}
            versions={versions} version={version} marque={marques[n.id]} />
        ))}
      </div>
      <div class="schema-outils" onMouseDown={(e) => e.stopPropagation()}>
        <button class="bouton icone" title="Zoom arrière" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button>
        <span class="petit doux" style="min-width:42px;text-align:center">{Math.round(vue.k * 100)} %</span>
        <button class="bouton icone" title="Zoom avant" onClick={() => zoom(1.2)}><Plus size={16} /></button>
        <button class="bouton icone" title="Tout voir" onClick={ajuster}><Maximize2 size={15} /></button>
      </div>
      <div class="schema-legende" onMouseDown={(e) => e.stopPropagation()}>
        <span class="pilule"><Database size={14} /> Entité</span>
        <span class="pilule pilule-liste"><IconeListe size={14} /> Liste de valeurs</span>
        <span class="pilule pilule-lien"><Link2 size={14} /> Lien vers une entité</span>
        <span class="pilule"><b>[ ]</b> Plusieurs</span>
        <span class="pilule"><em>optionnel</em></span>
        <span class="pilule"><Scale size={13} /> Règle</span>
        {version !== 'toutes' && versions.length > 0 && <span class="pilule pilule-hors">Après {nomVersion(versions, version)}</span>}
      </div>
    </div>
  );
}

// Le cycle de vie d'un objet (ses statuts, les actions qui l'y font passer, qui peut les faire, les règles) : dans une fenêtre.
function BoutonCycle({ projet, el, aller }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button class="bouton" style="align-self:flex-start" onClick={() => setOuvert(true)}><IconeSchema size={14} /> Voir le cycle de vie ({el.actions} action{el.actions > 1 ? 's' : ''})</button>
      {ouvert && (
        <div class="visionneuse" onClick={() => setOuvert(false)}>
          <div class="modale-comite" style="width:min(1400px,100%)" onClick={(e) => e.stopPropagation()}>
            <div class="ligne"><IconeSchema size={18} color="#4F46E5" /><strong class="espace">Cycle de vie : {el.nom}</strong><button class="bouton icone" aria-label="Fermer" onClick={() => setOuvert(false)}><X size={15} /></button></div>
            <Workflow projet={projet} entite={el.id} integre aller={(e) => { setOuvert(false); aller(e); }} />
          </div>
        </div>
      )}
    </>
  );
}

function Fiche({ el, tout, choisir, aller, fermer, modifier, versions, projet, lance }) {
  if (!el) return null;
  const liste = el.genre === 'liste';
  const nomV = (v) => versions.find((x) => x.id === v)?.nom || v;
  return (
    <aside class="fiche" onMouseDown={(e) => e.stopPropagation()}>
      <div class="ligne"><span class="petit doux espace">{liste ? 'Liste de valeurs' : 'Entité'}{el.version && ` · ${nomV(el.version)}`}</span>
        <BoutonComite projet={projet} cible={{ type: liste ? 'liste' : 'entite', id: el.id }} />
        <button class="bouton" onClick={modifier}><Pencil size={14} /> Modifier</button>
        <button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <h2>{el.nom}</h2>
      {el.description && <p class="doux">{el.description}</p>}
      {!liste && (
        <section class="pile" style="gap:6px">
          <h3>Données</h3>
          {el.donnees.length === 0 && <p class="doux">Aucune donnée décrite pour l'instant.</p>}
          {el.donnees.map((d) => (
            <div key={d.nom} class="fiche-donnee">
              <div class="ligne" style="gap:6px"><strong>{d.libelle}</strong>
                {d.multiple && <span class="badge b-gris">plusieurs</span>}{d.optionnel && <span class="badge b-gris">optionnelle</span>}
                {d.version_propre && <span class="pastille-version">{nomV(d.version_propre)}</span>}</div>
              <span class="petit doux">
                {d.cible ? <>{d.cible_genre === 'liste' ? 'Valeur de la liste ' : 'Désigne '}<button class="lien" onClick={() => choisir(d.cible)}>{d.cible_nom}</button></> : TYPES[d.type] || d.type}
                {d.valeurs.length > 0 && ` : ${d.valeurs.join(', ')}`}
              </span>
              {d.description && <span class="petit">{d.description}</span>}
              {d.regles.map((r) => <span key={r.id} class="petit ligne" style="gap:4px;color:#4338CA"><Scale size={12} /> {r.titre}</span>)}
            </div>
          ))}
        </section>
      )}
      {liste && (
        <section class="pile" style="gap:4px">
          <h3>Valeurs</h3>
          {lignesListe(el).map((l, i) => (l.entete ? <span key={i} class="petit doux" style="margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">{l.groupe}</span>
            : <span key={i}>{l.nom}{l.note && <span class="doux petit"> · {l.note}</span>}{l.version && l.version !== el.version && <span class="pastille-version" style="margin-left:6px">{nomV(l.version)}</span>}</span>))}
        </section>
      )}
      {!liste && el.cycle.length > 0 && (
        <section class="pile" style="gap:6px">
          <h3>Cycle de vie</h3>
          <div class="ligne" style="gap:6px">{el.cycle.map((s) => <span key={s.id} class="badge b-gris" style="font-weight:500">{s.nom}</span>)}</div>
          <BoutonCycle projet={projet} el={el} aller={aller} />
        </section>
      )}
      {!liste && el.regles.length > 0 && (
        <section class="pile" style="gap:6px">
          <h3>Règles</h3>
          {el.regles.map((r) => <button key={r.id} class="bouton" style="justify-content:space-between" onClick={() => aller('regles')}><span class="tronque">{r.titre}</span><Statut s={r.statut} /></button>)}
        </section>
      )}
      <section class="pile" style="gap:6px">
        <h3>Utilisée par</h3>
        {el.utilisee_par.length === 0 && <p class="doux">Aucune autre entité n'y fait référence.</p>}
        {el.utilisee_par.map((u, i) => <button key={i} class="lien" style="justify-content:flex-start" onClick={() => choisir(u.id)}>{tout[u.id]?.nom || u.nom} <span class="doux petit">· {u.donnee}</span></button>)}
      </section>
      <section class="encadre-watson"><DemandeWatson projet={projet} element={el.id} nomElement={el.nom} lance={lance} /></section>
    </aside>
  );
}

function VueListe({ entites, listes, acteurs, choisir, filtre }) {
  const ok = (n) => !filtre || n.nom.toLowerCase().includes(filtre) || (n.donnees || n.valeurs || []).some((d) => (d.libelle || d.nom).toLowerCase().includes(filtre));
  return (
    <div class="pile" style="gap:18px">
      <div class="cadre-tableau">
        <table class="tableau">
          <thead><tr><th>Entité</th><th>Donnée</th><th>Type</th><th>Lien vers</th><th /></tr></thead>
          <tbody>
            {entites.filter(ok).flatMap((e) => (e.donnees.length ? e.donnees : [null]).map((d, i) => (
              <tr key={`${e.id}-${i}`} class="cliquable" onClick={() => choisir(e.id)}>
                <td>{i === 0 && <strong style="color:var(--indigo)">{e.nom}</strong>}</td>
                <td>{d ? d.libelle : <span class="doux">Aucune donnée</span>}</td>
                <td class="doux">{d && (TYPES[d.type] || d.type)}{d?.valeurs?.length ? ` : ${d.valeurs.join(', ')}` : ''}</td>
                <td>{d?.cible && <span class={`brique-cible ${d.cible_genre}`}>{d.cible_nom}</span>}</td>
                <td class="doux petit">{d && [d.multiple && 'plusieurs', d.optionnel && 'optionnel'].filter(Boolean).join(', ')}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      {listes.filter(ok).length > 0 && (
        <div class="cadre-tableau">
          <table class="tableau">
            <thead><tr><th>Liste de valeurs</th><th>Valeurs</th><th>Utilisée par</th></tr></thead>
            <tbody>{listes.filter(ok).map((l) => (
              <tr key={l.id} class="cliquable" onClick={() => choisir(l.id)}>
                <td><strong style="color:var(--indigo)">{l.nom}</strong></td>
                <td class="doux">{l.valeurs.map((v) => v.nom).join(', ')}</td>
                <td class="doux">{l.utilisee_par.map((u) => u.nom).join(', ')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {acteurs?.length > 0 && !filtre && (
        <div class="cadre-tableau">
          <table class="tableau">
            <thead><tr><th>Acteur</th><th>Description</th></tr></thead>
            <tbody>{acteurs.map((a) => <tr key={a.id}><td><strong>{a.nom}</strong></td><td class="doux">{a.description}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Referentiels({ projet, aller }) {
  const { donnees: base, erreur, recharger } = useVue(`/projets/${projet.id}/referentiels`);
  const { donnees: cat } = useVue(`/projets/${projet.id}/catalogue`);
  const lire = (k, defaut) => { try { return localStorage.getItem(k) || defaut; } catch { return defaut; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans importance */ } };
  const [vue, setVue] = useState(() => lire('watson.referentiels.vue', 'schema'));
  const [version, setVersion] = useState(() => lire(`watson.version.${projet.id}`, 'toutes'));
  const [choisi, setChoisi] = useState(null);
  const [panneau, setPanneau] = useState(null); // null | {mode: 'edition', id, genre} | {mode: 'demande'} | {mode: 'versions'} | {mode: 'bilan', r}
  const [lot, setLot] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [recherche, setRecherche] = useState('');
  const d = apercu ? { ...apercu.referentiels } : base;
  const tout = useMemo(() => (d ? Object.fromEntries([...d.entites.map((e) => [e.id, { ...e, genre: 'entite' }]), ...d.listes.map((l) => [l.id, { ...l, genre: 'liste' }])]) : {}), [d]);
  if (!d) return <Attente erreur={erreur} />;
  const versions = d.versions_produit || [];
  const changerVue = (v) => { setVue(v); ecrire('watson.referentiels.vue', v); };
  const changerVersion = (v) => { if (v === '__gerer') { setPanneau({ mode: 'versions' }); return; } setVersion(v); ecrire(`watson.version.${projet.id}`, v); };
  const filtre = recherche.trim().toLowerCase();
  const vide = d.entites.length === 0 && d.listes.length === 0;
  const marques = apercu ? Object.fromEntries([...apercu.nouveaux.map((i) => [i, 'nouveau']), ...apercu.modifies.map((i) => [i, 'modifie'])]) : {};
  const lancerLot = async (l) => {
    setLot(l); setPanneau(null);
    try { setApercu(await appel(`/projets/${projet.id}/alimenter/${l.id}/apercu`)); } catch { setApercu(null); }
    setChoisi(null);
  };
  const finirLot = (r) => { setLot(null); setApercu(null); recharger(); setPanneau({ mode: 'bilan', r }); };
  const abandonnerLot = async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); setApercu(null); };
  const finiEdition = (id) => { setPanneau(null); recharger(); setChoisi(id); };

  let cote = null;
  if (lot) cote = <aside class="fiche"><LotEnCours projet={projet} lot={lot} fini={finirLot} abandonner={abandonnerLot} /></aside>;
  else if (panneau?.mode === 'edition') cote = <aside class="fiche"><Edition key={panneau.id || panneau.genre} projet={projet} id={panneau.id} genre={panneau.genre} d={d} fini={finiEdition} annuler={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'demande') cote = <aside class="fiche"><DemandeWatson projet={projet} lance={lancerLot} fermer={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'versions') cote = <aside class="fiche"><GererVersions projet={projet} versions={versions} fini={() => { setPanneau(null); recharger(); }} fermer={() => setPanneau(null)} /></aside>;
  else if (panneau?.mode === 'bilan') {
    const r = panneau.r;
    cote = (
      <aside class="fiche"><div class="ligne" style="gap:10px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={90} flotte={false} />
        <span class="espace"><strong>C'est noté.</strong><br /><span class="petit doux">{r.envoye ? 'Envoyé sur GitHub, à ton nom.' : 'Partira sur GitHub à la prochaine synchronisation.'}</span></span>
        <button class="bouton icone" aria-label="Fermer" onClick={() => setPanneau(null)}><X size={15} /></button></div>
        {r.ecrits.map((e) => <span key={e.id} class="ligne petit"><Check size={14} color="#166534" /> {e.titre} <span class="doux">({e.action})</span></span>)}
        {(r.retouches || []).map((t, i) => <p key={i} class="encart e-indigo petit">{t}</p>)}
        {(r.refus || []).map((x, i) => <p key={i} class="encart e-orange petit">{x.titre} : {x.raison}</p>)}
      </aside>
    );
  } else if (choisi && tout[choisi]) {
    cote = <Fiche el={tout[choisi]} tout={tout} choisir={setChoisi} aller={aller} fermer={() => setChoisi(null)} versions={versions} projet={projet} lance={lancerLot}
      modifier={() => setPanneau({ mode: 'edition', id: choisi, genre: tout[choisi].genre })} />;
  }

  return (
    <div class="pile referentiels" style="gap:16px">
      <Entete titre="Référentiels" description="L'architecture de données du projet : les entités, les données qu'elles portent, les listes de valeurs et les liens entre elles.">
        <div class="ligne">
          <label class="ligne saisie" style="gap:6px;min-height:36px"><Search size={15} /><input style="border:0;outline:none;width:150px" placeholder="Chercher une donnée" value={recherche} onInput={(e) => setRecherche(e.target.value)} /></label>
          <select class="saisie" value={version} onChange={(e) => changerVersion(e.target.value)} title="Version produit" aria-label="Version produit">
            <option value="toutes">Toutes les versions</option>
            {versions.map((v) => <option key={v.id} value={v.id}>Version {v.nom}</option>)}
            <option value="__gerer">{versions.length ? 'Gérer les versions…' : 'Définir des versions (MVP, V2…)'}</option>
          </select>
          <div class="segments">
            <button class={`segment ${vue === 'schema' ? 'actif' : ''}`} onClick={() => changerVue('schema')}><IconeSchema size={14} /> Schéma</button>
            <button class={`segment ${vue === 'liste' ? 'actif' : ''}`} onClick={() => changerVue('liste')}><LayoutList size={14} /> Liste</button>
          </div>
        </div>
      </Entete>
      <div class="ligne barre-edition">
        <button class="bouton" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'edition', genre: 'entite' }); }}><Plus size={15} /> Entité</button>
        <button class="bouton" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'edition', genre: 'liste' }); }}><Plus size={15} /> Liste de valeurs</button>
        <button class="bouton bouton-watson" disabled={!!lot} onClick={() => { setChoisi(null); setPanneau({ mode: 'demande' }); }}><Sparkles size={15} /> Demander à Watson</button>
        {lot && <span class="badge b-violet">Aperçu : les changements proposés sont marqués sur le schéma</span>}
      </div>
      {vide && !cote ? (
        <div class="vide pile" style="align-items:center"><Watson humeur="note" hauteur={180} />
          <span>Aucune entité pour l'instant. Crée-en une, demande-moi de le faire, ou donne-moi une spécification dans Alimenter.</span>
          <div class="ligne"><button class="bouton principal-b" onClick={() => setPanneau({ mode: 'demande' })}><Sparkles size={15} /> Demander à Watson</button>
            <button class="bouton" onClick={() => aller('alimenter')}>Alimenter le projet</button></div></div>
      ) : (
        <div class="ligne" style="align-items:stretch;gap:14px;flex-wrap:nowrap;flex:1;min-height:0">
          <div style={`flex:1;min-width:0;display:flex;flex-direction:column;${vue === 'liste' ? 'overflow:auto' : ''}`}>
            {vue === 'schema'
              ? <Schema entites={d.entites} listes={d.listes} choisi={choisi} choisir={(id) => { setChoisi(id); if (id && !lot) setPanneau(null); }} filtre={filtre} versions={versions} version={version} marques={marques} />
              : <VueListe entites={d.entites} listes={d.listes} acteurs={cat?.acteurs} choisir={(id) => { setChoisi(id); setPanneau(null); }} filtre={filtre} />}
          </div>
          {cote}
        </div>
      )}
    </div>
  );
}
