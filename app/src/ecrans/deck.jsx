// Mise en page des slides de la proposition commerciale, à la charte des présentations 4SH (visuels du kit).
// Format 960 × 540 ; l'aperçu et l'export utilisent exactement le même rendu.
import { Fragment } from 'preact';
import { toPng } from 'html-to-image';
import {
  Accessibility, BadgeCheck, Building2, CalendarDays, CircleCheck, CircleDot, Clock, Cloud, Code, Compass, Database, Euro, Eye, FileText, Flag,
  Gauge, HeartHandshake, History, Layers, LayoutGrid, Link, ListChecks, Lock, Mail, MapPin, Palette, PenLine, RefreshCw, Rocket, Search, Server,
  ShieldCheck, Smartphone, Star, Target, TriangleAlert, Truck, UserRound, Users, Workflow, Zap
} from 'lucide-preact';

export const L = 960;
export const H = 540;

// Pictogrammes permis (mêmes noms que le moteur), rendus en rouge 4SH dans un cercle rose pâle.
const ICONES = {
  grille: LayoutGrid, fusee: Rocket, coeur: HeartHandshake, equipe: Users, code: Code, bouclier: ShieldCheck, horloge: Clock, eclair: Zap,
  cadenas: Lock, historique: History, lieu: MapPin, donnees: Database, mail: Mail, document: FileText, coche: CircleCheck, loupe: Search,
  badge: BadgeCheck, batiment: Building2, couches: Layers, oeil: Eye, crayon: PenLine, liste: ListChecks, boussole: Compass,
  accessibilite: Accessibility, palette: Palette, mobile: Smartphone, serveur: Server, synchro: RefreshCw, calendrier: CalendarDays,
  euro: Euro, alerte: TriangleAlert, jauge: Gauge, flux: Workflow, lien: Link, nuage: Cloud, personne: UserRound, etoile: Star,
  drapeau: Flag, cible: Target, camion: Truck,
};
function Ico({ nom, defaut = 'coche' }) {
  const C = ICONES[nom] || ICONES[defaut];
  return <span class="sl-ico"><C /></span>;
}

// [À CONFIRMER] devient une pastille visible : impossible de l'oublier avant la soutenance.
function rt(t) {
  if (typeof t !== 'string' || !/\[\s*[AÀ]\s*CONFIRMER\s*\]/i.test(t)) return t;
  return t.split(/(\[\s*[AÀ]\s*CONFIRMER\s*\])/i).map((x, i) => (i % 2 ? <span key={i} class="sl-acf">à confirmer</span> : x));
}

const num = (s, i) => (s.sur_titre ? s.sur_titre : String(i).padStart(2, '0'));

// Un visuel du kit, à sa position de référence (canevas 960 × 540, soit la moitié du 1920 × 1080 de la charte).
function K({ kit, nom, x, y, l, h, style = '' }) {
  const src = kit?.[nom];
  return src ? <img class="k" src={src} alt="" style={`left:${x}px;top:${y}px;width:${l}px;height:${h}px;${style}`} /> : null;
}

function Bandeau({ b }) {
  if (!b?.texte) return null;
  return <div class="sl-bandeau"><Ico nom="coche" /><span>{b.libelle && <b>{b.libelle} : </b>}{rt(b.texte)}</span></div>;
}
function Point({ p, n }) {
  return <div class="sl-pt">{n ? <span class="sl-pastille">{n}</span> : <Ico nom={p.icone} />}<div><b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}</div></div>;
}
function Lignes({ lignes }) {
  return <div class="sl-lignes">{(lignes || []).map((l, i) => <div key={i}><b>{rt(l.libelle)}</b><span>{rt(l.detail || '')}</span><em>{rt(l.valeur || '')}</em></div>)}</div>;
}
function Capture({ image, support }) {
  return <div class={`sl-capture ${support === 'mobile' ? 'mobile' : ''}`}>{image ? <img src={image} alt="" /> : <span class="sl-vide">Maquette à choisir</span>}</div>;
}
// Colonne rouge à droite : l'aplat, puis l'encoche et les losanges blancs par-dessus (sinon la colonne les cache).
function Colonne({ kit, children }) {
  return (<>
    <div class="sl-col">{children}</div>
    <K kit={kit} nom="colonne-rouge-encoche-blanche.png" x={441} y={239} l={62} h={62} />
    <K kit={kit} nom="losanges-decoratifs-blancs.png" x={902} y={56} l={58} h={98} />
  </>);
}

export function Slide({ s, deck, n, section, images = {}, maquettes = [], piste, kit = {} }) {
  const m = maquettes.find((x) => x.id === s.maquette);
  const img = s.maquette ? images[s.maquette] : null;
  const pts = s.points || [];
  switch (s.type) {
    case 'couverture':
      return (
        <div class="sl">
          <K kit={kit} nom="couverture-photos-losanges.png" x={533} y={0} l={427} h={540} />
          <K kit={kit} nom="logo-4sh-couleur.png" x={25} y={26} l={152} h={139} />
          <div class="sl-couv"><h1 class="sl-couv-titre">{rt(s.titre)}</h1>
            <div class="sl-couv-sous">{rt(s.sous_titre || `Proposition 4SH · ${deck.date || ''}`)}</div></div>
        </div>
      );
    case 'section':
      return (
        <div class="sl sl-section">
          <K kit={kit} nom="intercalaire-fond-pictos.png" x={0} y={0} l={960} h={540} />
          <K kit={kit} nom="intercalaire-photos-losanges.png" x={215} y={0} l={529} h={288} />
          <div class="sl-section-titre">{s.sur_titre ? `${s.sur_titre}  ${s.titre}` : s.titre}</div>
          {s.sous_titre && <div class="sl-section-sous">{s.sous_titre}</div>}
        </div>
      );
    case 'merci':
      return (
        <div class="sl">
          <K kit={kit} nom="fin-photos-losanges.png" x={419} y={0} l={541} h={540} />
          <K kit={kit} nom="logo-4sh-couleur.png" x={25} y={26} l={233} h={213} />
          <div class="sl-merci" style={kit['logo-4sh-couleur.png'] ? '' : 'left:33px'}>{s.titre || 'Merci !'}</div>
          <div class="sl-liens"><span><i>www</i>www.4sh.fr</span><span><i>in</i>linkedin.com/company/4sh-france/</span></div>
        </div>
      );
    default:
      break;
  }
  const fond = (<>
    <K kit={kit} nom="contenu-coin-rouge.png" x={13} y={9} l={108} h={108} />
    {!['besoin', 'budget', 'equipe'].includes(s.type) && <K kit={kit} nom="losanges-decoratifs-rouges.png" x={902} y={56} l={58} h={98} />}
  </>);
  let corps = null;
  if (s.type === 'besoin') {
    corps = (<>
      <div class="sl-gauche">{pts.map((p, i) => <Point key={i} p={p} />)}</div>
      <Colonne kit={kit}><h3>{s.colonne?.titre || 'Vos objectifs'}</h3>{(s.colonne?.points || []).map((o, i) => <div key={i} class="obj"><b>{i + 1}</b><span>{rt(o)}</span></div>)}</Colonne>
    </>);
  } else if (s.type === 'equipe') {
    corps = (<>
      <div class="sl-gauche">{pts.map((p, i) => <Point key={i} p={p} />)}{s.texte && <div class="sl-rouge-txt">{rt(s.texte)}</div>}</div>
      <Colonne kit={kit}><h3>{s.colonne?.titre || 'Nos engagements'}</h3>{(s.colonne?.points || []).map((o, i) => <div key={i} class="sl-coche"><CircleCheck />{rt(o)}</div>)}</Colonne>
    </>);
  } else if (s.type === 'budget') {
    const c = s.colonne || {};
    corps = (<>
      <div class="sl-budget">
        {s.sur_titre && <div class="sur">{rt(s.sur_titre)}</div>}
        {s.chiffres?.[0] && <div class="gros">{rt(s.chiffres[0].valeur)}</div>}
        <Lignes lignes={s.lignes} />
        {s.sous_titre && <div style="font-size:11.5px">{rt(s.sous_titre)}</div>}
        {s.texte && <div class="sl-mention">{rt(s.texte)}</div>}
      </div>
      <Colonne kit={kit}><h3 style="font-size:15px">{c.titre || 'Le socle complet'}</h3>{c.valeur && <div class="gros">{rt(c.valeur)}</div>}
        <Lignes lignes={c.lignes} />{(c.points || []).map((x, i) => <div key={i} style="font-size:12px">{rt(x)}</div>)}{c.texte && <div class="sl-mention">{rt(c.texte)}</div>}</Colonne>
    </>);
  } else if (s.type === 'cartes' || s.type === 'texte' || s.type === 'questions') {
    corps = (<div class="sl-zone">
      <div class={`sl-cartes ${pts.length > 3 ? 'quatre' : ''}`}>{pts.map((p, i) => (
        <div key={i} class="sl-carte">{s.type === 'questions' ? <span class="sl-pastille">{i + 1}</span> : <Ico nom={p.icone} />}<b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}</div>))}</div>
      {s.texte && <div class="sl-texte-bas">{rt(s.texte)}</div>}
      <Bandeau b={s.bandeau} />
    </div>);
  } else if (s.type === 'chiffres') {
    const ch = s.chiffres || [];
    corps = (<div class="sl-zone">
      <div class="sl-chiffres" style={`--n:${Math.min(4, Math.max(2, ch.length))}`}>{ch.map((c, i) => <div key={i} class="sl-chiffre"><div class="v">{rt(c.valeur)}{c.unite && <small> {c.unite}</small>}</div>{c.legende && <p>{rt(c.legende)}</p>}</div>)}</div>
      <Bandeau b={s.bandeau} />
    </div>);
  } else if (s.type === 'grille') {
    const icones = pts.some((p) => p.icone);
    corps = (<div class="sl-zone"><div class={`sl-grille ${icones ? 'trois' : ''}`}>{pts.map((p, i) => (
      <div key={i} class="sl-case">{icones && <Ico nom={p.icone} />}<div class="v">{rt(p.valeur || p.titre)}</div>{icones ? <span>{rt(p.legende || p.texte || '')}</span> : <b>{rt(p.legende || p.texte || '')}</b>}</div>))}</div>
      <Bandeau b={s.bandeau} /></div>);
  } else if (s.type === 'references') {
    corps = (<div class="sl-zone"><div class="sl-refs">{pts.map((p, i) => <div key={i} class="sl-ref"><b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}<div class="v">{rt(p.valeur || '')}</div>{p.legende && <em>{rt(p.legende)}</em>}</div>)}</div></div>);
  } else if (s.type === 'image') {
    corps = <div class="sl-zone"><div class="sl-image">{kit[s.image] ? <img src={kit[s.image]} alt="" /> : <span class="sl-vide">Image « {s.image || '?'} » absente du kit</span>}</div></div>;
  } else if (s.type === 'perimetre') {
    const cote = (l) => <div class="sl-perim-cote">{(l || []).map((p, i) => <div key={i} class="sl-sys"><Ico nom={p.icone} defaut="serveur" /><b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}</div>)}</div>;
    corps = (<div class="sl-zone">
      <div class="sl-perim">{cote(s.gauche)}<span class="sl-fl">{(s.gauche || []).length ? '→' : ''}</span>
        <div class="sl-centre"><h4>{rt(s.centre?.titre || deck.client || 'Application')}</h4><div class="sl-modules">{(s.centre?.modules || []).map((x, i) => <span key={i}>{rt(x)}</span>)}</div></div>
        <span class="sl-fl">{(s.droite || []).length ? '↔' : ''}</span>{cote(s.droite)}</div>
      <Bandeau b={s.bandeau} />
    </div>);
  } else if (s.type === 'lots') {
    corps = (<div class="sl-zone">
      <div class="sl-lots">{(s.lots || []).slice(0, 2).map((l, i) => (
        <div key={i} class={`sl-lot ${l.recommande || (i === 0 && !(s.lots || []).some((x) => x.recommande)) ? 'mvp' : ''}`}>
          <div class="sl-lot-tete"><h4>{l.nom}</h4>{l.duree && <span>{rt(l.duree)}</span>}</div>
          {l.sous_titre && <div class="sl-lot-sous">{rt(l.sous_titre)}</div>}
          <ul>{(l.elements || []).slice(0, 7).map((e, j) => <li key={j}><CircleCheck />{rt(e)}</li>)}</ul>
        </div>))}</div>
      <Bandeau b={s.bandeau} />
    </div>);
  } else if (s.type === 'parcours') {
    const e = s.etapes || [];
    corps = (<div class="sl-zone">
      <div class="sl-flux">{e.map((x, i) => (<Fragment key={i}>
        <div class={`sl-etape ${i === e.length - 1 ? 'fin' : ''}`}>{i === e.length - 1 ? <Flag /> : <CircleDot />}{rt(x)}</div>
        {i < e.length - 1 && <span class="sl-fleche">➜</span>}</Fragment>))}</div>
      {s.texte && <div class="sl-alternatif">{rt(s.texte)}</div>}
      {pts.length > 0 && <div class="sl-ligne3">{pts.slice(0, 3).map((p, i) => <Point key={i} p={p} />)}</div>}
    </div>);
  } else if (s.type === 'maquette' || s.type === 'message') {
    corps = (<>
      <Capture image={img} support={m?.support} />
      <div class="sl-droite">{s.texte && s.type === 'message' && <div class="sl-message">{rt(s.texte)}</div>}
        {pts.slice(0, 3).map((p, i) => <Point key={i} p={p} n={s.type === 'maquette' ? i + 1 : undefined} />)}</div>
    </>);
  } else if (s.type === 'identite') {
    const p = piste;
    corps = (<>
      <div class="sl-gauche" style="width:440px">{s.texte && <div class="sl-message">{rt(s.texte)}</div>}{pts.slice(0, 3).map((x, i) => <Point key={i} p={x} />)}</div>
      <div class="sl-carte-d">
        {p ? <><div class="sl-palette">{p.couleurs.slice(0, 7).map((c) => <div key={c.hex + c.role}><i style={`background:${c.hex}`} /><span>{c.nom}</span></div>)}</div>
          <div class="sl-typo"><span style={`font-family:'${p.typo.titres}',system-ui,sans-serif`}>Aa</span><small>{p.typo.titres}{p.typo.texte !== p.typo.titres ? ` · ${p.typo.texte}` : ''}</small></div></>
          : <span class="sl-vide">Pas de piste de moodboard retenue</span>}
      </div>
    </>);
  } else if (s.type === 'planning') {
    const phases = s.phases || [];
    const max = Math.max(4, ...phases.map((p) => Math.ceil(p.fin || 0)), ...(s.jalons || []).map((j) => Math.ceil(j.semaine || 0)));
    const g = 250, d = 900;
    const x = (sem) => g + ((sem - 1) / max) * (d - g);
    const bas = 140 + phases.length * 52;
    corps = (<>
      <div class="sl-echelle">{Array.from({ length: max }, (_, i) => <span key={i} style={`left:${x(i + 1.5)}px`}>S{i + 1}</span>)}</div>
      {phases.map((p, i) => (
        <div key={i} class="sl-phase" style={`top:${140 + i * 52}px`}>
          <div class="sl-phase-nom"><b>{p.nom}</b>{p.detail && <span>{p.detail.length > 46 ? `${p.detail.slice(0, 45)}…` : p.detail}</span>}</div>
          {p.debut && p.fin && <div class="sl-barre" style={`left:${x(p.debut) - 33}px;width:${Math.max(16, x(p.fin + 1) - x(p.debut))}px;opacity:${[1, 1, 0.6, 0.35, 0.25][Math.min(4, i)]}`} />}
        </div>))}
      {(s.jalons || []).map((j, i) => (<Fragment key={i}>
        <div class="sl-pointille" style={`left:${x((j.semaine || 1) + 1)}px;top:132px;height:${bas - 128}px`} />
        <div class="sl-jalon" style={`left:${Math.min(880, x((j.semaine || 1) + 1))}px;top:${bas}px`}><i /><b>Semaine {j.semaine}</b><span>{j.libelle}</span></div>
      </Fragment>))}
    </>);
  }
  return (
    <div class="sl">
      {fond}
      <h2 class="sl-titre" style={['besoin', 'budget', 'equipe'].includes(s.type) ? 'right:500px' : ''}>{s.titre}</h2>
      {corps}
      <span class="sl-num" style={['besoin', 'budget', 'equipe'].includes(s.type) ? 'color:#fff' : ''}>{n}</span>
    </div>
  );
}

// Le sur-titre d'une slide : la section en cours (« 01 · Votre besoin »).
export function sections(slides) {
  let cur = null;
  let i = 0;
  return slides.map((s) => {
    if (s.type === 'section') { i += 1; cur = `${num(s, i)} · ${s.titre}`; return null; }
    return ['couverture', 'merci'].includes(s.type) ? null : cur;
  });
}

// Image d'une maquette HTML : rendue dans un cadre caché (sans script), puis photographiée.
export async function capturerMaquette(html, support) {
  const l = support === 'mobile' ? 390 : 1280;
  const h = support === 'mobile' ? 844 : 800;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin');
  f.style.cssText = `position:fixed;left:-20000px;top:0;width:${l}px;height:${h}px;border:0`;
  f.srcdoc = html;
  document.body.appendChild(f);
  try {
    await new Promise((ok) => { f.onload = ok; setTimeout(ok, 4000); });
    await new Promise((ok) => setTimeout(ok, 600));
    const doc = f.contentDocument;
    return await toPng(doc.documentElement, { width: l, height: h, pixelRatio: 1, backgroundColor: '#ffffff', cacheBust: true });
  } finally { f.remove(); }
}

export async function photographier(noeud) {
  return toPng(noeud, { width: L, height: H, pixelRatio: 2, cacheBust: true });
}
