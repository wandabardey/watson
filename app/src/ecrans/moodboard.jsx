// Avant-projet : le moodboard. Des pistes de direction artistique (palette, typographie, réglages, principes,
// ergonomie), chacune montrée sur un écran type construit à partir de ses jetons. Watson les propose ; on garde,
// on retouche, on retient une piste.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, ImagePlus, Pencil, Plus, Sparkles, Star, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';

const ROLES = { marque: 'Marque', accent: 'Accent', fond: 'Fond', surface: 'Surface', texte: 'Texte', texte_doux: 'Texte doux', bordure: 'Bordure', succes: 'Succès', alerte: 'Alerte', erreur: 'Erreur', info: 'Information' };
const DIALS = [['variance', 'Variance', 'sage', 'éditorial'], ['motion', 'Animation', 'discrète', 'marquée'], ['densite', 'Densité', 'aéré', 'dense']];
const charges = new Set();

// Charge une police Google Fonts (une fois) pour l'aperçu.
export function police(famille) {
  if (!famille || charges.has(famille)) return;
  charges.add(famille);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(famille).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(l);
}

const couleur = (p, role, defaut) => p.couleurs.find((c) => c.role === role)?.hex || defaut;
function contraste(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt((hex || '#000000').slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111' : '#fff';
}

function EcranType({ p, projet }) {
  police(p.typo.titres); police(p.typo.texte);
  const c = {
    marque: couleur(p, 'marque', '#333'), fond: couleur(p, 'fond', '#fff'), surface: couleur(p, 'surface', '#F6F6F6'), texte: couleur(p, 'texte', '#111'),
    doux: couleur(p, 'texte_doux', '#777'), bord: couleur(p, 'bordure', '#E5E5E5'), ok: couleur(p, 'succes', '#2E7D32'), al: couleur(p, 'alerte', '#B26A00'), er: couleur(p, 'erreur', '#C62828'),
    accent: couleur(p, 'accent', couleur(p, 'marque', '#333'))
  };
  const r = p.formes?.rayon ?? 8;
  const ombre = { aucune: 'none', legere: '0 1px 2px rgba(0,0,0,.06), 0 4px 14px rgba(0,0,0,.06)', marquee: '0 10px 30px rgba(0,0,0,.14)' }[p.formes?.ombre || 'legere'];
  const bord = p.formes?.bordure === false ? 'transparent' : c.bord;
  const dense = p.dials.densite;
  const hLigne = Math.round(52 - dense * 2.4);
  const ech = p.typo.echelle?.length >= 5 ? p.typo.echelle : [32, 24, 19, 16, 14, 12];
  const titre = projet.entites[0]?.nom ? `${projet.entites[0].nom}s` : 'Dossiers';
  const lignes = [['Dossier 2481', 'Lyon vers Montréal', 'Conforme', c.ok], ['Dossier 2479', 'Marseille vers Dakar', 'Pièce manquante', c.al], ['Dossier 2477', 'Le Havre vers Anvers', 'Conforme', c.ok], ['Dossier 2470', 'Lille vers Turin', 'Bloqué', c.er], ['Dossier 2466', 'Nantes vers Porto', 'Conforme', c.ok]].slice(0, dense >= 6 ? 5 : 4);
  const pastille = (coul, txt) => <span style={`display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:${Math.min(r, 99) > 6 ? 99 : r}px;background:${coul}1A;color:${coul};font-size:${ech[5] - 0.5}px;font-weight:600`}><i style={`width:6px;height:6px;border-radius:50%;background:${coul}`} />{txt}</span>;
  return (
    <div class="ecran-type" style={`background:${c.fond};color:${c.texte};font-family:'${p.typo.texte}',system-ui,sans-serif;border-radius:${Math.min(r + 4, 20)}px;border:1px solid ${c.bord}`}>
      <div style={`display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid ${c.bord}`}>
        <span style={`width:22px;height:22px;border-radius:${Math.min(r, 8)}px;background:${c.marque}`} />
        <strong style={`font-family:'${p.typo.titres}',system-ui,sans-serif;font-size:${ech[4]}px`}>{projet.nom || 'Application'}</strong>
        <span style={`margin-left:auto;font-size:${ech[5]}px;color:${c.doux}`}>{(projet.ecrans.slice(0, 3).map((e) => e.nom)).join('   ·   ')}</span>
      </div>
      <div style={`padding:${26 - dense}px ${30 - dense}px`}>
        <div style="display:flex;align-items:flex-end;gap:12px">
          <div style="flex:1">
            <div style={`font-size:${ech[5]}px;color:${c.doux};margin-bottom:4px`}>Suivi</div>
            <div style={`font-family:'${p.typo.titres}',system-ui,sans-serif;font-weight:${p.typo.graisse_titres || 700};font-size:${ech[1]}px;line-height:1.15`}>{titre}</div>
          </div>
          <span style={`padding:${Math.round(hLigne / 5)}px 14px;border:1px solid ${bord === 'transparent' ? c.surface : c.bord};border-radius:${r}px;font-size:${ech[4]}px;background:${c.fond}`}>Filtrer</span>
          <span style={`padding:${Math.round(hLigne / 5)}px 16px;border-radius:${r}px;background:${c.marque};color:${contraste(c.marque)};font-size:${ech[4]}px;font-weight:600`}>Nouveau</span>
        </div>
        <div style={`margin-top:${22 - dense}px;background:${c.surface};border:1px solid ${bord};border-radius:${r}px;box-shadow:${ombre};overflow:hidden`}>
          {lignes.map(([a, b, s, col], i) => (
            <div key={i} style={`display:flex;align-items:center;gap:14px;height:${hLigne}px;padding:0 16px;font-size:${ech[4]}px;${i ? `border-top:1px solid ${c.bord}` : ''};background:${i === 0 ? `${c.accent}0D` : 'transparent'}`}>
              <strong style="width:30%;font-weight:600">{a}</strong><span style={`flex:1;color:${c.doux}`}>{b}</span>{pastille(col, s)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Planche({ p, projet, projetW, retenue, retenir, modifier, reprendre, supprimer, occupe, choix }) {
  police(p.typo.titres); police(p.typo.texte);
  const [dem, setDem] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const ech = p.typo.echelle?.length ? p.typo.echelle : [32, 24, 19, 16, 14, 12];
  return (
    <section class={`planche ${retenue ? 'retenue' : ''}`}>
      <div class="ligne planche-tete">
        {choix}
        <div class="pile espace" style="gap:4px">
          <div class="ligne" style="gap:8px"><h2 style={`font-family:'${p.typo.titres}',system-ui,sans-serif`}>{p.nom}</h2>{retenue && <span class="badge b-vert"><Star size={12} /> Piste retenue</span>}</div>
          <span class="doux">{p.parti_pris}</span>
          {p.ambiance?.length > 0 && <div class="ligne" style="gap:6px">{p.ambiance.map((a) => <span key={a} class="puce-ambiance">{a}</span>)}</div>}
        </div>
        {modifier && (
          <span class="ligne" style="gap:6px;align-self:flex-start;flex-wrap:nowrap">
            {!retenue && <button class="bouton" disabled={occupe} onClick={retenir}><Star size={14} /> Retenir</button>}
            {projetW && <BoutonComite projet={projetW} cible={{ type: 'moodboard', id: p.id }} />}
            <button class="bouton bouton-watson" disabled={occupe} onClick={() => setDem(dem === null ? '' : null)}><Sparkles size={14} /> Reprendre</button>
            <button class="bouton" disabled={occupe} onClick={modifier}><Pencil size={14} /> Modifier</button>
            {confirmer ? <button class="bouton danger" disabled={occupe} onClick={supprimer}>Supprimer la piste</button>
              : <button class="bouton icone" title="Supprimer la piste" disabled={occupe} onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
          </span>
        )}
      </div>
      {dem !== null && (
        <div class="ligne" style="gap:6px;margin-bottom:12px">
          <input class="saisie espace" autoFocus placeholder="Ce qui doit changer : plus chaleureux, une autre police, moins dense…" value={dem} onInput={(e) => setDem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') reprendre(dem); }} />
          <button class="bouton principal-b" onClick={() => reprendre(dem)}><Sparkles size={14} /> Proposer</button>
          <button class="bouton icone" aria-label="Annuler" onClick={() => setDem(null)}><X size={14} /></button>
        </div>
      )}
      <div class="planche-grille">
        <div class="planche-bloc couleurs-bloc">
          <h3>Couleurs</h3>
          <div class="nuancier">{p.couleurs.map((c, i) => (
            <div key={i} class="nuance"><span class="echantillon" style={`background:${c.hex};color:${contraste(c.hex)}`}>{c.hex}</span>
              <strong>{c.nom}</strong><span class="doux petit">{ROLES[c.role] || c.role}{c.usage ? ` · ${c.usage}` : ''}</span></div>
          ))}</div>
        </div>
        <div class="planche-bloc demi">
          <h3>Typographie</h3>
          <div style={`font-family:'${p.typo.titres}',system-ui,sans-serif;font-weight:${p.typo.graisse_titres || 700};font-size:46px;line-height:1`}>Aa</div>
          <span class="petit doux">{p.typo.titres}{p.typo.texte !== p.typo.titres ? ` · ${p.typo.texte}` : ''}</span>
          <div class="pile" style="gap:2px;margin-top:8px">
            {ech.slice(0, 4).map((t, i) => <span key={i} class="tronque" style={`font-family:'${i < 2 ? p.typo.titres : p.typo.texte}',system-ui,sans-serif;font-size:${Math.min(t, 30)}px;font-weight:${i < 2 ? p.typo.graisse_titres || 700 : 400}`}>{i < 2 ? 'Titre de page' : 'Texte courant lisible'} <span class="doux petit">{t}</span></span>)}
          </div>
        </div>
        <div class="planche-bloc demi">
          <h3>Réglages</h3>
          {DIALS.map(([k, nom, bas, haut]) => (
            <div key={k} class="dial"><span class="ligne" style="justify-content:space-between"><strong class="petit">{nom}</strong><span class="petit doux">{p.dials[k]} / 10</span></span>
              <span class="dial-barre"><i style={`width:${p.dials[k] * 10}%`} /></span><span class="ligne petit doux" style="justify-content:space-between"><span>{bas}</span><span>{haut}</span></span></div>
          ))}
          <span class="petit doux">Rayon {p.formes?.rayon ?? 8} px · ombre {({ aucune: 'aucune', legere: 'légère', marquee: 'marquée' })[p.formes?.ombre || 'legere']}{p.formes?.bordure === false ? ' · sans bordure' : ''}</span>
        </div>
        {p.principes?.length > 0 && <div class="planche-bloc"><h3>Principes</h3><ul class="liste-planche">{p.principes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        <div class="planche-bloc ecran-bloc"><h3>Écran type</h3><EcranType p={p} projet={projet} /></div>
        {p.ergonomie?.length > 0 && <div class="planche-bloc"><h3>Ergonomie</h3><ul class="liste-planche">{p.ergonomie.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {p.references?.length > 0 && <div class="planche-bloc"><h3>Références</h3><ul class="liste-planche">{p.references.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </div>
    </section>
  );
}

function EditionPiste({ piste, enregistrer, annuler, occupe }) {
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(piste)));
  const maj = (k, v) => setF({ ...f, [k]: v });
  const lignes = (k) => (f[k] || []).join('\n');
  const listeDe = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <div class="carte pile edition" style="gap:12px">
      <div class="ligne"><strong class="espace">Modifier la piste</strong><button class="bouton icone" aria-label="Fermer" onClick={annuler}><X size={15} /></button></div>
      <label class="champ">Nom<input value={f.nom} onInput={(e) => maj('nom', e.target.value)} /></label>
      <label class="champ">Parti pris<textarea rows={3} value={f.parti_pris} onInput={(e) => maj('parti_pris', e.target.value)} /></label>
      <label class="champ">Ambiance (mots séparés par des virgules)<input value={(f.ambiance || []).join(', ')} onInput={(e) => maj('ambiance', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>
      <h3>Couleurs</h3>
      {f.couleurs.map((c, i) => (
        <div key={i} class="ligne" style="gap:6px;flex-wrap:nowrap">
          <input type="color" value={c.hex} onInput={(e) => maj('couleurs', f.couleurs.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))} style="width:42px;height:38px;border:0;background:none;padding:0" />
          <input class="saisie" style="width:96px" value={c.hex} onInput={(e) => maj('couleurs', f.couleurs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
          <input class="saisie espace" value={c.nom} onInput={(e) => maj('couleurs', f.couleurs.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
          <select class="saisie" value={c.role} onChange={(e) => maj('couleurs', f.couleurs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button class="bouton icone" title="Retirer" onClick={() => maj('couleurs', f.couleurs.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button class="bouton" style="align-self:flex-start" onClick={() => maj('couleurs', [...f.couleurs, { nom: 'Nouvelle couleur', hex: '#888888', role: 'accent' }])}><Plus size={14} /> Couleur</button>
      <div class="ligne" style="gap:8px">
        <label class="champ espace">Police des titres (Google Fonts)<input value={f.typo.titres} onInput={(e) => maj('typo', { ...f.typo, titres: e.target.value })} /></label>
        <label class="champ espace">Police du texte<input value={f.typo.texte} onInput={(e) => maj('typo', { ...f.typo, texte: e.target.value })} /></label>
      </div>
      <h3>Réglages</h3>
      {DIALS.map(([k, nom]) => (
        <label key={k} class="ligne petit" style="gap:10px"><span style="width:90px">{nom}</span>
          <input type="range" min="1" max="10" value={f.dials[k]} onInput={(e) => maj('dials', { ...f.dials, [k]: Number(e.target.value) })} style="flex:1" /><span style="width:20px">{f.dials[k]}</span></label>
      ))}
      <div class="ligne" style="gap:8px">
        <label class="champ">Rayon (px)<input type="number" min="0" max="32" value={f.formes?.rayon ?? 8} onInput={(e) => maj('formes', { ...(f.formes || {}), rayon: Math.max(0, Math.min(32, Number(e.target.value) || 0)) })} /></label>
        <label class="champ">Ombre<select value={f.formes?.ombre || 'legere'} onChange={(e) => maj('formes', { ...(f.formes || {}), ombre: e.target.value })}><option value="aucune">Aucune</option><option value="legere">Légère</option><option value="marquee">Marquée</option></select></label>
      </div>
      <label class="champ">Principes (un par ligne)<textarea rows={4} value={lignes('principes')} onInput={(e) => maj('principes', listeDe(e.target.value))} /></label>
      <label class="champ">Ergonomie (une règle par ligne)<textarea rows={4} value={lignes('ergonomie')} onInput={(e) => maj('ergonomie', listeDe(e.target.value))} /></label>
      <label class="champ">Références (une par ligne)<textarea rows={3} value={lignes('references')} onInput={(e) => maj('references', listeDe(e.target.value))} /></label>
      <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={() => enregistrer(f)}><Check size={15} /> Enregistrer</button><button class="bouton" onClick={annuler}>Annuler</button></div>
    </div>
  );
}

function Inspirations({ projet, mb, envoyer, retirer, occupe }) {
  const [images, setImages] = useState({});
  const entree = useRef(null);
  useEffect(() => {
    for (const i of mb.inspirations || []) if (!images[i.fichier]) appel(`/projets/${projet.id}/avant-projet/image`, { corps: { fichier: i.fichier } }).then((r) => setImages((x) => ({ ...x, [i.fichier]: r.data_url }))).catch(() => {});
  }, [mb.inspirations]);
  useEffect(() => {
    const coller = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      const f = Array.from(e.clipboardData?.files || []).filter((x) => x.type.startsWith('image/'));
      if (f.length) { e.preventDefault(); f.forEach((x, i) => envoyer(new File([x], `capture-${Date.now()}-${i}.${(x.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: x.type }))); }
    };
    window.addEventListener('paste', coller);
    return () => window.removeEventListener('paste', coller);
  }, []);
  return (
    <div class="carte pile" style="gap:10px">
      <div class="ligne"><strong class="espace">Inspirations</strong><span class="doux petit">Captures, sites, maquettes que le client aime. Watson les regarde avant de proposer. Une capture se colle ici (⌘V).</span></div>
      <div class="inspirations">
        {(mb.inspirations || []).map((i) => (
          <figure key={i.fichier} class="inspiration">
            {images[i.fichier] ? <img src={images[i.fichier]} alt={i.note || ''} /> : <span class="doux petit">…</span>}
            {i.note && <figcaption>{i.note}</figcaption>}
            <button class="bouton icone retirer" title="Retirer" disabled={occupe} onClick={() => retirer(i.fichier)}><X size={13} /></button>
          </figure>
        ))}
        <button class="inspiration ajout" disabled={occupe} onClick={() => entree.current?.click()}><ImagePlus size={22} /><span class="petit">Ajouter</span></button>
        <input ref={entree} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif" style="display:none" onChange={(e) => { Array.from(e.target.files).forEach(envoyer); e.target.value = ''; }} />
      </div>
    </div>
  );
}

export function Moodboard({ projet, etat, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [attente, setAttente] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [edition, setEdition] = useState(null);
  const [demande, setDemande] = useState(null);
  const [choix, setChoix] = useState([]);
  const [charte, setCharte] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/avant-projet/moodboard`;
  const recevoir = (v) => { setD(v); setChoix((v.proposition?.pistes || []).map((p) => p.id)); };
  useEffect(() => { appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const mb = d.moodboard;
  const faire = async (f) => { setOccupe(true); setMessage(null); try { recevoir(await f()); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); } };
  const enregistrer = (m, msg) => faire(() => appel(base, { corps: { moodboard: m, message: msg } }));
  const proposer = async (corps) => {
    setAttente(corps.piste ? mb.pistes.find((p) => p.id === corps.piste)?.nom : 'pistes'); setMessage(null); setDemande(null);
    try { await appel(`${base}/proposer`, { corps }); recevoir(await appel(base)); } catch (e) { setMessage(e.message); }
    setAttente(null);
  };
  const envoyerImage = async (f) => {
    if (f.size > 5e6) { setMessage(`« ${f.name} » dépasse 5 Mo.`); return; }
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    await faire(() => appel(`${base}/inspirations`, { corps: { nom: f.name, contenu_base64: b64 } }));
  };
  const entete = (
    <Entete titre="Moodboard" description="Des pistes de direction artistique à montrer au client avant les maquettes : couleurs, typographie, réglages, principes et ergonomie. Watson en propose, tu retiens celle qui part en maquette.">
      {!d.proposition && !attente && (
        <div class="ligne">
          {d.existe && <select class="saisie" value={mb.statut || 'brouillon'} onChange={(e) => enregistrer({ ...mb, statut: e.target.value }, `Moodboard : ${d.statuts[e.target.value].toLowerCase()}`)} aria-label="Statut du moodboard">
            {Object.entries(d.statuts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={15} /> {mb.pistes.length ? 'Nouvelles pistes' : 'Proposer des pistes'}</button>
        </div>
      )}
    </Entete>
  );
  if (attente) {
    return (<>{entete}<div class="carte pile" style="align-items:center;padding:40px;text-align:center"><Watson humeur="reflechit" hauteur={200} />
      <strong>{attente === 'pistes' ? 'Watson compose des pistes' : `Watson reprend « ${attente} »`}</strong>
      <span class="doux">À partir du cahier des charges, de la base et des inspirations. Compte une à trois minutes.</span></div></>);
  }
  return (
    <>
      {entete}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La proposition de pistes" />
      {message && <p class="encart e-rouge">{message}</p>}
      {demande !== null && (
        <div class="carte pile" style="gap:8px">
          <strong>Ce que Watson doit savoir</strong>
          <textarea class="saisie" style="min-height:70px;padding:10px 12px" placeholder="Facultatif : public, ambiance voulue, ce que le client n'aime pas, une piste à pousser…" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={() => proposer({ nombre: 3, demande })}><Sparkles size={15} /> Proposer 3 pistes</button>
            <button class="bouton" onClick={() => proposer({ nombre: 1, demande })}>Une seule piste</button><button class="bouton" onClick={() => setDemande(null)}>Annuler</button>
            {!d.cahier && <span class="doux petit">Astuce : avec un cahier des charges rédigé, les pistes seront plus justes.</span>}</div>
        </div>
      )}
      {d.proposition ? (
        <div class="pile" style="gap:14px">
          <div class="carte ligne" style="gap:16px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={100} flotte={false} />
            <div class="pile espace" style="gap:4px"><strong>Watson propose {d.proposition.pistes.length} piste{d.proposition.pistes.length > 1 ? 's' : ''}</strong><span class="doux">{d.proposition.resume}</span>
              <span class="doux petit">Par {d.proposition.modele}. {d.proposition.ecartees ? `${d.proposition.ecartees} piste mal formée écartée. ` : ''}Coche celles à garder.</span></div></div>
          {d.proposition.pistes.map((p) => (
            <Planche key={p.id} p={p} projet={d.projet} choix={<button class={`case ${choix.includes(p.id) ? 'cochee' : ''}`} onClick={() => setChoix(choix.includes(p.id) ? choix.filter((x) => x !== p.id) : [...choix, p.id])}>{choix.includes(p.id) && <Check size={14} />}</button>} />
          ))}
          <div class="barre-action">
            <button class="bouton" disabled={occupe} onClick={() => faire(() => appel(`${base}/proposition`, { methode: 'DELETE', corps: {} }))}><X size={15} /> Tout écarter</button><span class="espace" />
            <button class="bouton principal-b" disabled={occupe || !choix.length} onClick={() => faire(() => appel(`${base}/garder`, { corps: { pistes: choix, questions: (d.proposition.questions || []).map((_, i) => i) } }))}>Garder {choix.length} piste{choix.length > 1 ? 's' : ''}</button>
          </div>
        </div>
      ) : (
        <>
          <Inspirations projet={projet} mb={mb} envoyer={envoyerImage} retirer={(f) => faire(() => appel(`${base}/inspirations`, { methode: 'DELETE', corps: { fichier: f } }))} occupe={occupe} />
          <div class="carte pile" style="gap:6px">
            <strong>Charte du client</strong>
            <textarea class="saisie" style="min-height:56px;padding:10px 12px" placeholder="Si le client a déjà une charte (couleurs, polices, logo), décris-la : toutes les pistes resteront dedans." value={charte ?? mb.charte_client ?? ''} onInput={(e) => setCharte(e.target.value)}
              onBlur={() => { if (charte !== null && charte !== (mb.charte_client || '')) enregistrer({ ...mb, charte_client: charte.trim() || undefined }, 'Moodboard : charte du client'); setCharte(null); }} />
          </div>
          {mb.pistes.length === 0 && demande === null && (
            <div class="vide pile" style="align-items:center;gap:12px"><Watson humeur="note" hauteur={170} />
              <span>Pas encore de piste. Ajoute quelques inspirations, puis demande-moi des pistes.</span>
              <button class="bouton principal-b" disabled={!claude?.connecte} onClick={() => setDemande('')}><Sparkles size={15} /> Proposer des pistes</button></div>
          )}
          {mb.pistes.map((p) => (edition === p.id
            ? <EditionPiste key={p.id} piste={p} occupe={occupe} annuler={() => setEdition(null)} enregistrer={async (np) => { if (await enregistrer({ ...mb, pistes: mb.pistes.map((x) => (x.id === p.id ? np : x)) }, `Moodboard : ${np.nom}`)) setEdition(null); }} />
            : <Planche key={p.id} p={p} projet={d.projet} projetW={projet} retenue={mb.retenue === p.id} occupe={occupe}
                retenir={() => enregistrer({ ...mb, retenue: p.id }, `Moodboard : piste retenue, ${p.nom}`)}
                modifier={() => setEdition(p.id)}
                reprendre={(t) => proposer({ piste: p.id, nombre: 1, demande: t?.trim() || `Affine la piste « ${p.nom} »` })}
                supprimer={() => enregistrer({ ...mb, pistes: mb.pistes.filter((x) => x.id !== p.id) }, `Moodboard : piste retirée, ${p.nom}`)} />))}
          {mb.retenue && <p class="doux petit">La piste retenue habillera les maquettes générées par Watson.</p>}
        </>
      )}
    </>
  );
}
