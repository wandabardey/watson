// Toile commune aux schémas générés (Écrans, Scénarios) : déplacement au glisser, zoom (⌘ + molette, boutons),
// « Tout voir », légende en pilules.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Maximize2, Minus, Plus } from 'lucide-preact';

export function Toile({ largeur, hauteur, focus, legende, onFond, children }) {
  const [vue, setVue] = useState({ x: 24, y: 72, k: 1 });
  const cadre = useRef(null);
  const glisse = useRef(null);
  const ajuster = () => {
    if (!cadre.current || !largeur) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const k = Math.min(1.1, (w - 48) / largeur, (h - 130) / hauteur);
    setVue({ k, x: (w - largeur * k) / 2, y: Math.max(68, (h - hauteur * k) / 2 + 20) });
  };
  useEffect(() => {
    if (!cadre.current || !largeur) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const k = Math.min(1.1, (w - 48) / largeur, (h - 130) / hauteur);
    if (k >= 0.7) ajuster(); else setVue({ k: 0.82, x: 28, y: 72 });
  }, [largeur, hauteur]);
  useEffect(() => {
    if (!focus || !cadre.current) return;
    const { clientWidth: w, clientHeight: h } = cadre.current;
    const sx = vue.x + focus.x * vue.k, sy = vue.y + focus.y * vue.k;
    if (sx < 0 || sy < 110 || sx + focus.w * vue.k > w || sy + 80 > h) setVue({ ...vue, x: w / 2 - (focus.x + focus.w / 2) * vue.k, y: 150 - focus.y * vue.k });
  }, [focus?.id]);
  const zoom = (f, cx, cy) => {
    const k = Math.min(2.2, Math.max(0.2, vue.k * f));
    const px = cx ?? cadre.current.clientWidth / 2, py = cy ?? cadre.current.clientHeight / 2;
    setVue({ k, x: px - (px - vue.x) * (k / vue.k), y: py - (py - vue.y) * (k / vue.k) });
  };
  const roue = (e) => {
    e.preventDefault();
    const r = cadre.current.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else setVue((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  };
  return (
    <div class="schema-cadre" ref={cadre} onWheel={roue}
      onMouseDown={(e) => { if (e.button === 0) glisse.current = { x: e.clientX - vue.x, y: e.clientY - vue.y, bouge: false }; }}
      onMouseMove={(e) => { if (glisse.current) { glisse.current.bouge = true; setVue({ ...vue, x: e.clientX - glisse.current.x, y: e.clientY - glisse.current.y }); } }}
      onMouseUp={() => { if (glisse.current && !glisse.current.bouge) onFond?.(); glisse.current = null; }}
      onMouseLeave={() => { glisse.current = null; }}>
      <div class="schema-plan" style={`transform:translate(${vue.x}px,${vue.y}px) scale(${vue.k});width:${largeur}px;height:${hauteur}px`}>
        {children}
      </div>
      <div class="schema-outils" onMouseDown={(e) => e.stopPropagation()}>
        <button class="bouton icone" title="Zoom arrière" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button>
        <span class="petit doux" style="min-width:42px;text-align:center">{Math.round(vue.k * 100)} %</span>
        <button class="bouton icone" title="Zoom avant" onClick={() => zoom(1.2)}><Plus size={16} /></button>
        <button class="bouton icone" title="Tout voir" onClick={ajuster}><Maximize2 size={15} /></button>
      </div>
      {legende && <div class="schema-legende" onMouseDown={(e) => e.stopPropagation()}>{legende}</div>}
    </div>
  );
}

// Tracé orthogonal aux angles arrondis.
export function trace(pts, r = 10) {
  if (!pts || pts.length < 2) return '';
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

// Marqueurs de flèche, un par couleur utilisée.
export function Fleches({ couleurs }) {
  return (
    <defs>
      {couleurs.map((c) => (
        <marker key={c} id={`f-${c.replace('#', '')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={c} />
        </marker>
      ))}
    </defs>
  );
}

export const largeurTexte = (t, taille = 12.5) => Math.ceil((t || '').length * taille * 0.56) + 26;

// Couleur d'application éclaircie (fond de couloir, tuile d'icône).
export function teinteClaire(hex, alpha) {
  const h = (hex || '#6B7280').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}
