import { useMemo, useState } from 'preact/hooks';
import { Attente, Entete, Point, Statut, useVue } from './commun.jsx';

const L = 190, H = 64, EX = 120, EY = 104; // taille d'une étape et écarts

// Disposition en couches, de haut en bas : chaque étape à la distance la plus courte depuis l'étape de départ.
function disposer(e) {
  const niveau = { [e.initiale]: 0 };
  const file = [e.initiale];
  while (file.length) {
    const s = file.shift();
    for (const a of e.actions) if (a.de === s && niveau[a.vers] === undefined) { niveau[a.vers] = niveau[s] + 1; file.push(a.vers); }
  }
  let max = Math.max(0, ...Object.values(niveau));
  for (const s of e.etapes) if (niveau[s.id] === undefined) niveau[s.id] = ++max; // étapes inatteignables : en bas
  const rangees = {};
  for (const s of e.etapes) (rangees[niveau[s.id]] ||= []).push(s.id);
  const plusLarge = Math.max(...Object.values(rangees).map((r) => r.length));
  const largeur = plusLarge * (L + EX) - EX + 160;
  const pos = {};
  Object.entries(rangees).forEach(([n, ids]) => {
    const total = ids.length * (L + EX) - EX;
    ids.forEach((id, i) => { pos[id] = { x: 80 + (largeur - 160 - total) / 2 + i * (L + EX), y: 20 + n * (H + EY) }; });
  });
  const hauteur = 40 + Object.keys(rangees).length * (H + EY) - EY;
  return { pos, largeur, hauteur };
}

function trace(a, pos, rang) {
  const p1 = pos[a.de], p2 = pos[a.vers];
  const decal = rang * 18;
  if (a.de === a.vers) {
    const x = p1.x, y = p1.y + H / 2; // boucle sur le côté gauche
    return { d: `M${x} ${y - 14} C${x - 60} ${y - 40}, ${x - 60} ${y + 40}, ${x} ${y + 14}`, lx: x - 20, ly: p1.y - 14 };
  }
  if (p2.y > p1.y) { // vers le bas
    const x1 = p1.x + L / 2 + decal, y1 = p1.y + H, x2 = p2.x + L / 2 + decal, y2 = p2.y;
    const my = (y1 + y2) / 2;
    // étiquette aux deux tiers du trajet : deux actions qui partent de la même étape ne se chevauchent pas
    return { d: `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 4}`, lx: x1 + (x2 - x1) * 0.7, ly: y1 + (y2 - y1) * 0.62 };
  }
  // même rangée ou retour vers le haut : par le côté
  const gauche = p2.x <= p1.x;
  const x1 = gauche ? p1.x : p1.x + L, y1 = p1.y + H / 2 + decal;
  const x2 = gauche ? p2.x + L : p2.x, y2 = p2.y + H / 2 + decal;
  if (p2.y === p1.y) { // même rangée : par-dessous, étiquette sous les étapes
    const xa = p1.x + L / 2 + decal, xb = p2.x + L / 2 + decal, bas = p1.y + H + 36;
    return { d: `M${xa} ${p1.y + H} C${xa} ${bas}, ${xb} ${bas}, ${xb} ${p2.y + H + 4}`, lx: (xa + xb) / 2, ly: bas - 4 };
  }
  const cote = gauche ? Math.min(x1, x2) - 50 : Math.max(x1, x2) + 50;
  return { d: `M${x1} ${y1} C${cote} ${y1}, ${cote} ${y2}, ${x2 + (gauche ? 4 : -4)} ${y2}`, lx: cote, ly: (y1 + y2) / 2 };
}

export function Workflow({ projet, aller, entite, integre }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/workflow`);
  const [ent, setEnt] = useState(entite || null);
  const [sel, setSel] = useState(null);
  const e = d && (d.entites.find((x) => x.id === ent) || d.entites[0]);
  const plan = useMemo(() => (e ? disposer(e) : null), [e]);
  if (!d) return <Attente erreur={erreur} />;
  if (!e) return <><Entete titre="Workflow" /><p class="vide">Aucune entité avec un cycle de vie.</p></>;
  const rangs = {};
  const choix = sel && (e.actions.find((a) => a.id === sel) || e.etapes.find((s) => s.id === sel));
  const nomEtape = (id) => e.etapes.find((s) => s.id === id)?.nom || id;
  return (
    <>
      {integre ? <p class="doux">Les étapes de « {e.nom} », les actions qui font passer de l'une à l'autre, qui peut les faire et les règles qui les gouvernent. Clique une étape ou une action pour le détail.</p> : <Entete titre={`Cycle de vie : ${e.nom}`} description="Les étapes, les actions qui font passer de l'une à l'autre, qui peut les faire et les règles qui les gouvernent. Cliquer une étape ou une action pour le détail.">
        {d.entites.length > 1 && <div class="segments">{d.entites.map((x) => <button key={x.id} class={`segment ${x.id === e.id ? 'actif' : ''}`} onClick={() => { setEnt(x.id); setSel(null); }}>{x.nom}</button>)}</div>}
      </Entete>}
      <div class="ligne petit">
        <span class="badge b-gris">Action</span><span class="badge b-orange">Information manquante</span><span class="badge b-rouge">Incohérence</span>
      </div>
      <div class="ligne" style="align-items:flex-start;gap:16px">
        <div style="flex:1 1 600px;min-width:0;overflow:auto;border-radius:16px;background-color:var(--surface-2);background-image:radial-gradient(var(--bord2) 1px,transparent 1px);background-size:20px 20px;box-shadow:inset 0 0 0 1px var(--bord)">
          <div style={`position:relative;width:${plan.largeur}px;height:${plan.hauteur + 60}px;margin:30px`}>
            <svg width={plan.largeur} height={plan.hauteur + 60} style="position:absolute;inset:0;overflow:visible">
              <defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#A1A1AA" /></marker>
                <marker id="fl-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#EA580C" /></marker>
                <marker id="fl-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4F46E5" /></marker></defs>
              {e.actions.map((a) => {
                const cle = `${a.de}>${a.vers}`; const rang = (rangs[cle] = (rangs[cle] ?? -1) + 1);
                const t = trace(a, plan.pos, rang);
                const manque = a.points.length > 0, choisi = sel === a.id;
                return <path key={a.id} d={t.d} fill="none" stroke={choisi ? '#4F46E5' : manque ? '#EA580C' : '#A1A1AA'} stroke-width={choisi ? 2.5 : 1.6} stroke-dasharray={manque ? '6 5' : '0'} marker-end={`url(#${choisi ? 'fl-i' : manque ? 'fl-o' : 'fl'})`} />;
              })}
            </svg>
            {e.etapes.map((s) => {
              const p = plan.pos[s.id]; const manque = s.points.length > 0; const choisi = sel === s.id;
              return (
                <button key={s.id} onClick={() => setSel(s.id)} style={`position:absolute;left:${p.x}px;top:${p.y}px;width:${L}px;height:${H}px;padding:0 12px;border-radius:14px;text-align:left;cursor:pointer;background:var(--surface);color:var(--texte);display:flex;flex-direction:column;justify-content:center;border:${choisi ? '2px solid #4F46E5' : manque ? '1.5px dashed #FB923C' : '1px solid var(--bord)'};box-shadow:0 4px 14px rgba(24,24,27,.05)`}>
                  <strong>{s.nom}</strong><span class="petit doux">{s.id === e.initiale ? 'étape de départ' : s.finale ? 'étape finale' : `${e.actions.filter((a) => a.de === s.id).length} action(s) possible(s)`}</span>
                </button>
              );
            })}
            {(() => { const r2 = {}; return e.actions.map((a) => {
              const cle = `${a.de}>${a.vers}`; const rang = (r2[cle] = (r2[cle] ?? -1) + 1);
              const t = trace(a, plan.pos, rang); const manque = a.points.length > 0; const choisi = sel === a.id;
              return <button key={a.id} onClick={() => setSel(a.id)} style={`position:absolute;left:${t.lx}px;top:${t.ly}px;transform:translate(-50%,-50%);white-space:nowrap;min-height:26px;padding:0 10px;border-radius:999px;font-size:12px;cursor:pointer;${choisi ? 'background:#4F46E5;color:#fff;border:1px solid #4F46E5' : manque ? 'background:#FFF7ED;color:#9A3412;border:1px dashed #FB923C' : 'background:var(--surface);color:var(--texte);border:1px solid var(--bord)'}`}>{a.nom}</button>;
            }); })()}
          </div>
        </div>
        <aside class="carte detail">
          {!choix && <p class="doux">Choisir une étape ou une action pour voir qui peut la faire, les règles qui la gouvernent et ce qui manque.</p>}
          {choix && choix.de !== undefined && (
            <>
              <span class="petit doux">Action</span><h2>{choix.nom}</h2>
              <p><span class="doux">Trajet : </span>{nomEtape(choix.de)} → {nomEtape(choix.vers)}</p>
              <p><span class="doux">Qui peut la faire : </span>{choix.acteurs.map((a) => a.nom).join(', ') || <span class="badge b-orange">personne n'est désigné</span>}</p>
              {choix.applications.length > 0 && <p><span class="doux">Application : </span>{choix.applications.join(', ')}</p>}
              <div class="pile" style="gap:8px"><span class="petit doux">Règles</span>
                {choix.regles.length === 0 && <span class="doux">Aucune règle rattachée.</span>}
                {choix.regles.map((r) => <button key={r.id} class="carte pile" style="gap:4px;text-align:left;cursor:pointer;border:0;padding:12px" onClick={() => aller('regles')}><span class="ligne"><strong class="espace">{r.titre}</strong><Statut s={r.statut} /></span><span class="petit doux">{r.enonce}</span></button>)}
              </div>
              {choix.points.map((p, i) => <Point key={i} p={p} />)}
            </>
          )}
          {choix && choix.de === undefined && (
            <>
              <span class="petit doux">Étape</span><h2>{choix.nom}</h2>
              {choix.description && <p>{choix.description}</p>}
              <p><span class="doux">Actions possibles : </span>{e.actions.filter((a) => a.de === choix.id).map((a) => a.nom).join(', ') || 'aucune'}</p>
              {choix.points.map((p, i) => <Point key={i} p={p} />)}
            </>
          )}
        </aside>
      </div>
      {d.tables.length > 0 && (
        <section class="pile">
          <h2>Tables de décision</h2>
          {d.tables.map((t) => (
            <div key={t.id} class="carte pile">
              <div class="ligne"><strong class="espace">{t.titre}</strong><Statut s={t.statut} /></div>
              <div class="cadre-tableau"><table class="tableau"><thead><tr><th>Situation</th><th>Action</th></tr></thead><tbody>
                {t.lignes.map((l, i) => <tr key={i}><td>{Object.entries(l.si).map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v === true ? 'oui' : v === false ? 'non' : v}`).join(', ')}</td><td>{l.alors_nom}{l.note && <div class="petit doux">{l.note}</div>}</td></tr>)}
              </tbody></table></div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
