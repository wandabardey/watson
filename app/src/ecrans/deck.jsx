// Mise en page des slides de la proposition commerciale : charte 4SH affinée, couverture « Nuit ».
// Format 960 × 540 ; l'aperçu et l'export utilisent exactement le même rendu.
import { Fragment } from 'preact';
import { toPng } from 'html-to-image';

export const L = 960;
export const H = 540;

// [À CONFIRMER] devient une pastille visible : impossible de l'oublier avant la soutenance.
function rt(t) {
  if (typeof t !== 'string' || !/\[\s*[AÀ]\s*CONFIRMER\s*\]/i.test(t)) return t;
  return t.split(/(\[\s*[AÀ]\s*CONFIRMER\s*\])/i).map((x, i) => (i % 2 ? <span key={i} class="sl-acf">à confirmer</span> : x));
}

const num = (s, i) => (s.sur_titre ? s.sur_titre : String(i).padStart(2, '0'));

function Pied({ deck, n }) {
  return <div class="sl-pied"><span><b>4SH</b> · {deck.titre || 'Proposition'}</span><span>{n}</span></div>;
}
function Sur({ s, section }) {
  const t = s.sur_titre || section;
  return t ? <div class="sl-sur">{t}</div> : null;
}
function Points({ points, style = '' }) {
  return (
    <div class="sl-points" style={style}>
      {(points || []).map((p, i) => <div key={i} class="sl-point"><span class="sl-n">{i + 1}</span><div><b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}</div></div>)}
    </div>
  );
}
function Bandeau({ b }) {
  if (!b?.texte) return null;
  return <div class="sl-bandeau">{b.libelle && <b>{b.libelle} : </b>}{rt(b.texte)}</div>;
}
function Capture({ image, support, style }) {
  return (
    <div class={`sl-capture ${support === 'mobile' ? 'mobile' : ''}`} style={style}>
      {image ? <img src={image} alt="" /> : <span class="sl-vide">Maquette à choisir</span>}
    </div>
  );
}

export function Slide({ s, deck, n, section, images = {}, maquettes = [], piste }) {
  const m = maquettes.find((x) => x.id === s.maquette);
  const img = s.maquette ? images[s.maquette] : null;
  switch (s.type) {
    case 'couverture':
      return (
        <div class="sl sl-nuit">
          <div class="sl-lum" /><div class="sl-los1" /><div class="sl-los2" />
          <div class="sl-haut"><strong>4SH</strong><span>{deck.date || ''}</span></div>
          <div class="sl-tag"><i />Proposition pour {deck.client || deck.titre || 'le client'}</div>
          <h1 class="sl-couv-titre">{coupe(s.titre)}</h1>
          {s.sous_titre && <div class="sl-couv-bas">{s.sous_titre}</div>}
        </div>
      );
    case 'section':
      return (
        <div class="sl sl-section">
          <div class="sl-grand">{num(s, n)}</div>
          <div class="sl-section-titre">{s.titre}</div>
          {s.sous_titre && <div class="sl-section-sous">{s.sous_titre}</div>}
          <div class="sl-trait" style="left:640px;top:70px" /><div class="sl-trait" style="left:760px;top:-180px;width:300px;height:300px" />
        </div>
      );
    case 'merci':
      return (
        <div class="sl sl-nuit">
          <div class="sl-lum" style="left:-140px;right:auto;top:auto;bottom:-200px" /><div class="sl-los1" style="right:auto;left:120px;top:150px" />
          <div class="sl-haut"><strong>4SH</strong><span>{deck.date || ''}</span></div>
          <h1 class="sl-couv-titre" style="left:auto;right:70px;top:210px;width:auto;font-size:64px;text-align:right">{s.titre || 'Merci !'}</h1>
          {s.sous_titre && <div class="sl-couv-bas" style="left:auto;right:70px">{s.sous_titre}</div>}
        </div>
      );
    default:
      break;
  }
  let corps = null;
  if (s.type === 'besoin') {
    corps = (<>
      <div class="sl-constats">{(s.points || []).map((p, i) => <div key={i} class="sl-constat"><span>{i + 1}</span><div><b>{rt(p.titre)}</b>{p.texte && <em>{rt(p.texte)}</em>}</div></div>)}</div>
      <div class="sl-objectifs"><h3>{s.colonne?.titre || 'Vos objectifs'}</h3>{(s.colonne?.points || []).map((o, i) => <div key={i} class="sl-obj"><b>{i + 1}</b><span>{rt(o)}</span></div>)}<div class="sl-trait petit" /></div>
    </>);
  } else if (s.type === 'cartes' || s.type === 'texte' || s.type === 'questions') {
    corps = (<>
      <div class={`sl-cartes ${(s.points || []).length > 3 ? 'quatre' : ''}`}>{(s.points || []).map((p, i) => (
        <div key={i} class="sl-carte"><span class="sl-losange" /><b>{rt(p.titre)}</b>{p.texte && <span>{rt(p.texte)}</span>}</div>))}</div>
      {s.texte && <div class="sl-texte-bas">{rt(s.texte)}</div>}
      <Bandeau b={s.bandeau} />
    </>);
  } else if (s.type === 'chiffres' || s.type === 'budget') {
    corps = (<>
      <div class="sl-chiffres">{(s.chiffres || []).map((c, i) => <div key={i} class="sl-chiffre"><div class="v">{rt(c.valeur)}{c.unite && <small> {c.unite}</small>}</div>{c.legende && <p>{rt(c.legende)}</p>}</div>)}</div>
      {s.colonne?.points?.length > 0 && <div class="sl-inclus"><b>{s.colonne.titre || 'Inclus'}</b>{s.colonne.points.map((x, i) => <span key={i}>{x}</span>)}</div>}
      {s.texte && <div class="sl-mention">{rt(s.texte)}</div>}
      <Bandeau b={s.bandeau} />
    </>);
  } else if (s.type === 'lots') {
    corps = (<>
      <div class="sl-lots">{(s.lots || []).slice(0, 3).map((l, i) => (
        <div key={i} class={`sl-lot ${l.recommande || (i === 0 && !(s.lots || []).some((x) => x.recommande)) ? 'mvp' : ''}`}>
          <div class="sl-lot-tete"><h4>{l.nom}</h4>{l.duree && <span>{rt(l.duree)}</span>}</div>
          {l.sous_titre && <div class="sl-lot-sous">{l.sous_titre}</div>}
          <ul>{(l.elements || []).slice(0, 7).map((e, j) => <li key={j}>{rt(e)}</li>)}</ul>
        </div>))}</div>
      <Bandeau b={s.bandeau} />
    </>);
  } else if (s.type === 'parcours') {
    const e = s.etapes || [];
    corps = (<>
      <div class="sl-flux">{e.map((x, i) => (<Fragment key={i}>
        <div class={`sl-etape ${i === e.length - 1 ? 'fin' : ''}`}><span class="sl-losange" />{x}</div>
        {i < e.length - 1 && <span class="sl-fleche">→</span>}</Fragment>))}</div>
      {s.texte && <div class="sl-alternatif">{s.texte}</div>}
      <Points points={s.points} style="top:360px;flex-direction:row" />
    </>);
  } else if (s.type === 'maquette' || s.type === 'message') {
    corps = (<>
      <Capture image={img} support={m?.support} />
      {s.texte && s.type === 'message' && <div class="sl-message">{s.texte}</div>}
      <Points points={(s.points || []).slice(0, 3)} style={`left:612px;top:${s.type === 'message' && s.texte ? 230 : 150}px;width:300px`} />
    </>);
  } else if (s.type === 'identite') {
    const p = piste;
    corps = (<>
      {s.texte && <div class="sl-parti">{s.texte}</div>}
      {p && <div class="sl-palette">{p.couleurs.slice(0, 7).map((c) => <div key={c.hex + c.role}><i style={`background:${c.hex}`} /><span>{c.nom}</span></div>)}</div>}
      {p && <div class="sl-typo"><span style={`font-family:'${p.typo.titres}',system-ui,sans-serif`}>Aa</span><small>{p.typo.titres}{p.typo.texte !== p.typo.titres ? ` · ${p.typo.texte}` : ''}</small></div>}
      <Points points={(s.points || []).slice(0, 3)} style="left:612px;top:150px;width:300px" />
    </>);
  } else if (s.type === 'planning') {
    const phases = s.phases || [];
    const max = Math.max(4, ...phases.map((p) => p.fin || 0), ...(s.jalons || []).map((j) => j.semaine || 0));
    const x = (sem) => 300 + ((sem - 1) / max) * 560;
    corps = (<>
      <div class="sl-echelle">{Array.from({ length: max }, (_, i) => <span key={i} style={`left:${x(i + 1)}px`}>S{i + 1}</span>)}</div>
      {phases.map((p, i) => (
        <div key={i} class="sl-phase" style={`top:${180 + i * 52}px`}>
          <div class="sl-phase-nom"><b>{p.nom}</b>{p.detail && <span>{p.detail}</span>}</div>
          {p.debut && p.fin && <div class="sl-barre" style={`left:${x(p.debut)}px;width:${Math.max(18, x(p.fin + 1) - x(p.debut))}px;opacity:${[1, 1, 0.6, 0.35][Math.min(3, i)]}`} />}
        </div>))}
      {(s.jalons || []).map((j, i) => <div key={i} class="sl-jalon" style={`left:${x(j.semaine || 1)}px`}><i /><span>{j.libelle}</span></div>)}
    </>);
  }
  return (
    <div class="sl">
      <Sur s={s} section={section} />
      <h2 class="sl-titre">{s.titre}</h2>
      {corps}
      <Pied deck={deck} n={n} />
    </div>
  );
}

// La fin du titre de couverture en gris, à partir de la virgule ou des deux-points.
function coupe(t) {
  const m = (t || '').match(/^(.*?[,:])\s+(.+)$/);
  return m ? <>{m[1]} <span>{m[2]}</span></> : t;
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
