import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Database, LayoutList, Link2, List as IconeListe, Maximize2, Minus, Plus, Search, Workflow as IconeSchema, X } from 'lucide-preact';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Attente, Entete, Statut, useVue, Watson } from './commun.jsx';

const TYPES = { enum: 'Choix', booleen: 'Oui ou non', texte: 'Texte', nombre: 'Nombre', date: 'Date', reference: 'Lien', liste: 'Liste de valeurs' };
const L = 296; // largeur d'une brique
const ENTETE = 46;
const LIGNE = 32;
const GROUPE = 26;
const elk = new ELK();

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
  if (el.genre === 'liste') return ENTETE + lignesListe(el).reduce((h, l) => h + (l.entete ? GROUPE : LIGNE), 0);
  return ENTETE + Math.max(1, el.donnees.length) * LIGNE;
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

function Brique({ n, choisi, attenue, choisir }) {
  const liste = n.genre === 'liste';
  return (
    <div class={`brique ${liste ? 'brique-liste' : ''} ${choisi ? 'choisie' : ''} ${attenue ? 'attenuee' : ''}`}
      style={`left:${n.x}px;top:${n.y}px;width:${L}px;height:${n.h}px`} onClick={(e) => { e.stopPropagation(); choisir(n.id); }}>
      <div class="brique-tete" style={`height:${ENTETE}px`}>
        {liste ? <IconeListe size={15} /> : <Database size={15} />}
        <strong class="espace tronque">{n.nom}</strong>
        {liste && <span class="pastille-liste">LISTE</span>}
        {!liste && n.cycle.length > 0 && <span class="pastille-cycle" title="Cette entité a un cycle de vie">{n.cycle.length} statuts</span>}
      </div>
      {liste
        ? lignesListe(n).map((l, i) => (l.entete
          ? <div key={i} class="brique-groupe" style={`height:${GROUPE}px`}>{l.groupe}</div>
          : <div key={i} class="brique-ligne" style={`height:${LIGNE}px`}><span class="espace tronque">{l.nom}</span>{l.note && <span class="brique-note tronque">{l.note}</span>}</div>))
        : n.donnees.length === 0
          ? <div class="brique-ligne doux" style={`height:${LIGNE}px`}>Aucune donnée décrite</div>
          : n.donnees.map((d) => (
            <div key={d.nom} class={`brique-ligne ${d.cible ? 'lien' : ''} ${d.optionnel ? 'optionnelle' : ''}`} style={`height:${LIGNE}px`}>
              <span class="espace tronque">{d.libelle}{d.multiple && <span class="multiple" title="Plusieurs valeurs possibles"> [ ]</span>}</span>
              {d.cible ? <span class={`brique-cible ${d.cible_genre}`}>{d.cible_genre === 'liste' ? <IconeListe size={12} /> : <Link2 size={12} />}{d.cible_nom}</span>
                : d.optionnel ? <span class="brique-note">optionnel</span> : <span class="brique-type">{TYPES[d.type] || d.type}</span>}
            </div>
          ))}
    </div>
  );
}

function Schema({ entites, listes, choisi, choisir, filtre }) {
  const [plan, setPlan] = useState(null);
  const [vue, setVue] = useState({ x: 24, y: 24, k: 1 });
  const cadre = useRef(null);
  const glisse = useRef(null);
  useEffect(() => { disposer(entites, listes).then((p) => { setPlan(p); }); }, [entites, listes]);
  const ajuster = () => {
    if (!plan || !cadre.current) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const k = Math.min(1.1, (w - 48) / plan.largeur, (h - 48) / plan.hauteur);
    setVue({ k, x: (w - plan.largeur * k) / 2, y: Math.max(24, (h - plan.hauteur * k) / 2) });
  };
  useEffect(() => { ajuster(); }, [plan]);
  // Centrer la brique choisie si elle sort du cadre.
  useEffect(() => {
    if (!plan || !choisi || !cadre.current) return;
    const n = plan.noeuds.find((x) => x.id === choisi);
    if (!n) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const sx = vue.x + n.x * vue.k, sy = vue.y + n.y * vue.k;
    if (sx < 0 || sy < 0 || sx + L * vue.k > w || sy + 60 > h) setVue({ ...vue, x: w / 2 - (n.x + L / 2) * vue.k, y: 60 - n.y * vue.k });
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
            <marker id="fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#2563EB" /></marker>
            <marker id="fleche-pale" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#CBD5E1" /></marker>
            <marker id="point" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="4" fill="#2563EB" /></marker>
            <marker id="fleche-debut" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#2563EB" /></marker>
          </defs>
          {plan.aretes.map((a) => {
            const [src, cible] = a.id.split('>');
            const actif = !choisi || src.startsWith(`${choisi}:`) || cible === choisi;
            const debut = actif ? (a.double ? 'url(#fleche-debut)' : 'url(#point)') : undefined;
            return <path key={a.id} d={trace(a.points)} class={`lien-schema ${a.liste ? 'vers-liste' : ''} ${actif ? '' : 'pale'}`}
              marker-start={debut} marker-end={actif ? 'url(#fleche)' : 'url(#fleche-pale)'} />;
          })}
        </svg>
        {plan.noeuds.map((n) => (
          <Brique key={n.id} n={n} choisi={choisi === n.id} attenue={(choisi && choisi !== n.id && !voisins.has(n.id)) || !correspond(n)} choisir={choisir} />
        ))}
      </div>
      <div class="schema-outils" onMouseDown={(e) => e.stopPropagation()}>
        <button class="bouton icone" title="Zoom arrière" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button>
        <span class="petit doux" style="min-width:42px;text-align:center">{Math.round(vue.k * 100)} %</span>
        <button class="bouton icone" title="Zoom avant" onClick={() => zoom(1.2)}><Plus size={16} /></button>
        <button class="bouton icone" title="Tout voir" onClick={ajuster}><Maximize2 size={15} /></button>
      </div>
      <div class="schema-legende" onMouseDown={(e) => e.stopPropagation()}>
        <span><i class="leg-entite" /> Entité</span><span><i class="leg-liste" /> Liste de valeurs</span>
        <span><Link2 size={12} color="#2563EB" /> Lien vers une autre entité</span><span><b>[ ]</b> Plusieurs valeurs</span><span><em>optionnel</em></span>
      </div>
    </div>
  );
}

function Fiche({ el, tout, choisir, aller, fermer }) {
  if (!el) return null;
  const liste = el.genre === 'liste';
  return (
    <aside class="fiche" onMouseDown={(e) => e.stopPropagation()}>
      <div class="ligne"><span class="petit doux espace">{liste ? 'Liste de valeurs' : 'Entité'}</span><button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      <h2>{el.nom}</h2>
      {el.description && <p class="doux">{el.description}</p>}
      {!liste && (
        <section class="pile" style="gap:6px">
          <h3>Données</h3>
          {el.donnees.length === 0 && <p class="doux">Aucune donnée décrite pour l'instant.</p>}
          {el.donnees.map((d) => (
            <div key={d.nom} class="fiche-donnee">
              <div class="ligne" style="gap:6px"><strong>{d.libelle}</strong>
                {d.multiple && <span class="badge b-gris">plusieurs</span>}{d.optionnel && <span class="badge b-gris">optionnel</span>}</div>
              <span class="petit doux">
                {d.cible ? <>{d.cible_genre === 'liste' ? 'Valeur de la liste ' : 'Désigne '}<button class="lien" onClick={() => choisir(d.cible)}>{d.cible_nom}</button></> : TYPES[d.type] || d.type}
                {d.valeurs.length > 0 && ` : ${d.valeurs.join(', ')}`}
              </span>
              {d.description && <span class="petit">{d.description}</span>}
              {d.regles.length > 0 && <span class="petit">Utilisée par {d.regles.length} règle{d.regles.length > 1 ? 's' : ''}</span>}
            </div>
          ))}
        </section>
      )}
      {liste && (
        <section class="pile" style="gap:4px">
          <h3>Valeurs</h3>
          {lignesListe(el).map((l, i) => (l.entete ? <span key={i} class="petit doux" style="margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">{l.groupe}</span>
            : <span key={i}>{l.nom}{l.note && <span class="doux petit"> · {l.note}</span>}</span>))}
        </section>
      )}
      {!liste && el.cycle.length > 0 && (
        <section class="pile" style="gap:6px">
          <h3>Cycle de vie</h3>
          <div class="ligne" style="gap:6px">{el.cycle.map((s) => <span key={s.id} class="badge b-gris" style="font-weight:500">{s.nom}</span>)}</div>
          <button class="bouton" style="align-self:flex-start" onClick={() => aller('workflow')}>Voir ses {el.actions} étapes dans le Workflow</button>
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
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/referentiels`);
  const { donnees: cat } = useVue(`/projets/${projet.id}/catalogue`);
  const [vue, setVue] = useState(() => { try { return localStorage.getItem('watson.referentiels.vue') || 'schema'; } catch { return 'schema'; } });
  const [choisi, setChoisi] = useState(null);
  const [recherche, setRecherche] = useState('');
  const tout = useMemo(() => (d ? Object.fromEntries([...d.entites.map((e) => [e.id, { ...e, genre: 'entite' }]), ...d.listes.map((l) => [l.id, { ...l, genre: 'liste' }])]) : {}), [d]);
  if (!d) return <Attente erreur={erreur} />;
  const changerVue = (v) => { setVue(v); try { localStorage.setItem('watson.referentiels.vue', v); } catch { /* sans importance */ } };
  const filtre = recherche.trim().toLowerCase();
  const vide = d.entites.length === 0 && d.listes.length === 0;
  return (
    <div class="pile referentiels" style="gap:16px">
      <Entete titre="Référentiels" description="L'architecture de données du projet : les entités, les données qu'elles portent, les listes de valeurs et les liens entre elles.">
        <div class="ligne">
          <label class="ligne saisie" style="gap:6px;min-height:36px"><Search size={15} /><input style="border:0;outline:none;width:170px" placeholder="Chercher une donnée" value={recherche} onInput={(e) => setRecherche(e.target.value)} /></label>
          <div class="segments">
            <button class={`segment ${vue === 'schema' ? 'actif' : ''}`} onClick={() => changerVue('schema')}><IconeSchema size={14} /> Schéma</button>
            <button class={`segment ${vue === 'liste' ? 'actif' : ''}`} onClick={() => changerVue('liste')}><LayoutList size={14} /> Liste</button>
          </div>
        </div>
      </Entete>
      {vide ? (
        <div class="vide pile" style="align-items:center"><Watson humeur="note" hauteur={180} />
          <span>Aucune entité pour l'instant. Donne-moi une spécification ou un schéma de données dans Alimenter, je t'en propose le modèle.</span>
          <button class="bouton principal-b" onClick={() => aller('alimenter')}>Alimenter le projet</button></div>
      ) : (
        <div class="ligne" style="align-items:stretch;gap:14px;flex-wrap:nowrap;flex:1;min-height:0">
          <div style={`flex:1;min-width:0;display:flex;flex-direction:column;${vue === 'liste' ? 'overflow:auto' : ''}`}>
            {vue === 'schema'
              ? <Schema entites={d.entites} listes={d.listes} choisi={choisi} choisir={setChoisi} filtre={filtre} />
              : <VueListe entites={d.entites} listes={d.listes} acteurs={cat?.acteurs} choisir={setChoisi} filtre={filtre} />}
          </div>
          {choisi && tout[choisi] && <Fiche el={tout[choisi]} tout={tout} choisir={setChoisi} aller={aller} fermer={() => setChoisi(null)} />}
        </div>
      )}
    </div>
  );
}
