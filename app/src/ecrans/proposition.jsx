// Avant-projet : la proposition commerciale. Watson écrit le deck (trame du deck commercial), on le relit slide
// par slide, on le présente, on l'exporte en PDF ou en PowerPoint (notes de l'orateur comprises).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, FileDown, Play, Plus, Presentation, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { H, L, Slide, capturerMaquette, photographier, sections } from './deck.jsx';
import { police } from './moodboard.jsx';

const imagesMaquettes = {};

function useImages(projet, slides, maquettes) {
  const [images, setImages] = useState({});
  useEffect(() => {
    let vivant = true;
    const ids = [...new Set(slides.map((s) => s.maquette).filter(Boolean))];
    (async () => {
      for (const id of ids) {
        const cle = `${projet.id}|${id}`;
        if (!imagesMaquettes[cle]) {
          try {
            const c = await appel(`/projets/${projet.id}/avant-projet/maquettes/contenu`, { corps: { id } });
            const m = maquettes.find((x) => x.id === id);
            imagesMaquettes[cle] = c.image || await capturerMaquette(c.html, m?.support);
          } catch { imagesMaquettes[cle] = null; }
        }
        if (vivant) setImages((x) => ({ ...x, [id]: imagesMaquettes[cle] }));
      }
    })();
    return () => { vivant = false; };
  }, [slides.map((s) => s.maquette).join(',')]);
  return images;
}

function Echelle({ largeur, children }) {
  const k = largeur / L;
  return <div class="sl-cadre" style={`width:${largeur}px;height:${H * k}px`}><div style={`transform:scale(${k});transform-origin:0 0;width:${L}px;height:${H}px`}>{children}</div></div>;
}

const lignes = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const enPoints = (t) => lignes(t).map((x) => { const [a, ...b] = x.split(' : '); return b.length ? { titre: a.trim(), texte: b.join(' : ').trim() } : { titre: a.trim() }; });
const dePoints = (p) => (p || []).map((x) => (x.texte ? `${x.titre} : ${x.texte}` : x.titre)).join('\n');
const parBarres = (t, cles) => lignes(t).map((x) => Object.fromEntries(x.split('|').map((v, i) => [cles[i], v.trim()]).filter(([k, v]) => k && v)));

function Formulaire({ s, d, changer, reprendre, occupe }) {
  const [dem, setDem] = useState(null);
  const champ = (k, lib, long) => (
    <label class="champ">{lib}{long ? <textarea rows={3} value={s[k] || ''} onInput={(e) => changer({ ...s, [k]: e.target.value })} />
      : <input value={s[k] || ''} onInput={(e) => changer({ ...s, [k]: e.target.value })} />}</label>
  );
  const t = s.type;
  return (
    <div class="pile" style="gap:10px">
      <label class="champ">Type<select value={t} onChange={(e) => changer({ ...s, type: e.target.value })}>{Object.entries(d.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {t === 'section' && champ('sur_titre', 'Numéro (01, 02…)')}
      {champ('titre', 'Titre (le message)')}
      {['couverture', 'section', 'merci'].includes(t) && champ('sous_titre', 'Sous-titre')}
      {['message', 'parcours', 'identite', 'budget', 'cartes', 'texte'].includes(t) && champ('texte', t === 'budget' ? 'Base de calcul' : t === 'parcours' ? 'Chemin alternatif' : t === 'identite' ? 'Parti pris' : 'Phrase', true)}
      {['besoin', 'cartes', 'texte', 'questions', 'maquette', 'message', 'identite', 'parcours'].includes(t) && (
        <label class="champ">{t === 'maquette' ? 'Trois repères' : 'Points'} (un par ligne, « Titre : détail »)<textarea rows={5} value={dePoints(s.points)} onInput={(e) => changer({ ...s, points: enPoints(e.target.value) })} /></label>)}
      {(t === 'besoin' || t === 'budget') && (<>
        <label class="champ">{t === 'besoin' ? 'Colonne rouge : titre' : 'Encart : titre'}<input value={s.colonne?.titre || ''} onInput={(e) => changer({ ...s, colonne: { ...(s.colonne || {}), titre: e.target.value } })} /></label>
        <label class="champ">{t === 'besoin' ? 'Objectifs' : 'Lignes'} (un par ligne)<textarea rows={4} value={(s.colonne?.points || []).join('\n')} onInput={(e) => changer({ ...s, colonne: { ...(s.colonne || {}), points: lignes(e.target.value) } })} /></label>
      </>)}
      {(t === 'chiffres' || t === 'budget') && <label class="champ">Chiffres (« valeur | unité | légende », un par ligne)<textarea rows={4} value={(s.chiffres || []).map((c) => [c.valeur, c.unite || '', c.legende || ''].join(' | ')).join('\n')} onInput={(e) => changer({ ...s, chiffres: parBarres(e.target.value, ['valeur', 'unite', 'legende']).filter((c) => c.valeur) })} /></label>}
      {t === 'lots' && <label class="champ">Lots (« nom | sous-titre | durée | élément ; élément », un par ligne, le premier mis en avant)<textarea rows={5} value={(s.lots || []).map((l) => [l.nom, l.sous_titre || '', l.duree || '', (l.elements || []).join(' ; ')].join(' | ')).join('\n')}
        onInput={(e) => changer({ ...s, lots: lignes(e.target.value).map((x) => { const [nom, sous_titre, duree, el] = x.split('|').map((v) => (v || '').trim()); return { nom, ...(sous_titre ? { sous_titre } : {}), ...(duree ? { duree } : {}), elements: (el || '').split(';').map((v) => v.trim()).filter(Boolean) }; }).filter((l) => l.nom) })} /></label>}
      {t === 'parcours' && <label class="champ">Étapes (une par ligne)<textarea rows={4} value={(s.etapes || []).join('\n')} onInput={(e) => changer({ ...s, etapes: lignes(e.target.value) })} /></label>}
      {t === 'planning' && (<>
        <label class="champ">Phases (« nom | détail | semaine de début | semaine de fin »)<textarea rows={4} value={(s.phases || []).map((p) => [p.nom, p.detail || '', p.debut || '', p.fin || ''].join(' | ')).join('\n')}
          onInput={(e) => changer({ ...s, phases: parBarres(e.target.value, ['nom', 'detail', 'debut', 'fin']).filter((p) => p.nom).map((p) => ({ ...p, ...(p.debut ? { debut: Number(p.debut) || 1 } : {}), ...(p.fin ? { fin: Number(p.fin) || 1 } : {}) })) })} /></label>
        <label class="champ">Jalons (« libellé | semaine »)<textarea rows={3} value={(s.jalons || []).map((j) => [j.libelle, j.semaine || ''].join(' | ')).join('\n')}
          onInput={(e) => changer({ ...s, jalons: parBarres(e.target.value, ['libelle', 'semaine']).filter((j) => j.libelle).map((j) => ({ ...j, ...(j.semaine ? { semaine: Number(j.semaine) || 1 } : {}) })) })} /></label>
      </>)}
      {(t === 'maquette' || t === 'message') && <label class="champ">Maquette<select value={s.maquette || ''} onChange={(e) => changer({ ...s, maquette: e.target.value || undefined })}><option value="">Aucune</option>{d.maquettes.map((m) => <option key={m.id} value={m.id}>{m.titre}{m.ecran_nom ? ` (${m.ecran_nom})` : ''}</option>)}</select></label>}
      {['cartes', 'chiffres', 'lots', 'texte'].includes(t) && (
        <div class="ligne" style="gap:6px;flex-wrap:nowrap"><label class="champ" style="width:110px">Bandeau<input value={s.bandeau?.libelle || ''} placeholder="Règle d'or" onInput={(e) => changer({ ...s, bandeau: { ...(s.bandeau || {}), libelle: e.target.value } })} /></label>
          <label class="champ espace">&nbsp;<input value={s.bandeau?.texte || ''} placeholder="La phrase à retenir" onInput={(e) => changer({ ...s, bandeau: { ...(s.bandeau || {}), texte: e.target.value } })} /></label></div>)}
      {champ('notes', 'Notes de l\'orateur', true)}
      {dem === null ? <button class="bouton bouton-watson" disabled={occupe} onClick={() => setDem('')}><Sparkles size={14} /> Reprendre cette slide avec Watson</button>
        : <div class="pile" style="gap:6px"><textarea class="saisie" style="min-height:60px;padding:8px 10px" autoFocus placeholder="Ce qui doit changer" value={dem} onInput={(e) => setDem(e.target.value)} />
            <div class="ligne"><button class="bouton principal-b" onClick={() => { reprendre(s.id, dem); setDem(null); }}><Sparkles size={14} /> Proposer</button><button class="bouton" onClick={() => setDem(null)}>Annuler</button></div></div>}
    </div>
  );
}

function Presenter({ slides, rendu, fermer }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = (e) => { if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1)); if (['ArrowLeft', 'PageUp'].includes(e.key)) setI((x) => Math.max(0, x - 1)); if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, []);
  const l = Math.min(window.innerWidth - 40, (window.innerHeight - 70) * (L / H));
  return (
    <div class="presentation" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}>
      <Echelle largeur={l}>{rendu(slides[i], i)}</Echelle>
      <div class="presentation-barre" onClick={(e) => e.stopPropagation()}>
        <button class="bouton icone" onClick={() => setI(Math.max(0, i - 1))}><ChevronLeft size={16} /></button><span>{i + 1} / {slides.length}</span>
        <button class="bouton icone" onClick={() => setI(Math.min(slides.length - 1, i + 1))}><ChevronRight size={16} /></button>
        <span class="presentation-notes">{slides[i].notes}</span><button class="bouton icone" onClick={fermer}><X size={16} /></button>
      </div>
    </div>
  );
}

export function Proposition({ projet, etat, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [deck, setDeck] = useState(null);
  const [modifie, setModifie] = useState(false);
  const [sel, setSel] = useState(0);
  const [attente, setAttente] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [presenter, setPresenter] = useState(false);
  const [export_, setExport] = useState(null);
  const [demande, setDemande] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const photo = useRef(null);
  const scene = useRef(null);
  const [largeur, setLargeur] = useState(760);
  useEffect(() => {
    if (!scene.current) return undefined;
    const o = new ResizeObserver(() => setLargeur(Math.min(L, scene.current.clientWidth)));
    o.observe(scene.current);
    return () => o.disconnect();
  }, [scene.current]);
  const base = `/projets/${projet.id}/avant-projet/proposition`;
  const recevoir = (v) => { setD(v); setDeck(v.proposition); setModifie(false); };
  useEffect(() => { police('Asap'); appel(base).then(recevoir).catch((e) => setErreur(e.message)); }, []);
  const vus = d?.en_attente ? d.en_attente : deck;
  const images = useImages(projet, vus?.slides || [], d?.maquettes || []);
  if (!d || !deck) return <Attente erreur={erreur} />;
  const affiche = d.en_attente ? { ...deck, titre: d.en_attente.titre, client: d.en_attente.client, date: deck.date || d.en_attente.date, slides: d.en_attente.slides } : deck;
  const secs = sections(affiche.slides);
  const rendu = (s, i) => <Slide s={s} deck={affiche} n={i + 1} section={secs[i]} images={images} maquettes={d.maquettes} piste={d.piste} />;
  const faire = async (f) => { setOccupe(true); setMessage(null); try { recevoir(await f()); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); } };
  const enregistrer = () => faire(() => appel(base, { corps: { proposition: deck, message: 'Proposition : relecture' } }));
  const changerSlide = (ns) => { setDeck({ ...deck, slides: deck.slides.map((x, j) => (j === sel ? ns : x)) }); setModifie(true); };
  const deplacer = (j, k) => { const t = [...deck.slides]; if (k < 0 || k >= t.length) return; [t[j], t[k]] = [t[k], t[j]]; setDeck({ ...deck, slides: t }); setSel(k); setModifie(true); };
  const rediger = async (corps) => {
    setAttente(corps.slide ? 'slide' : 'deck'); setMessage(null); setDemande(null);
    try { await appel(`${base}/rediger`, { corps }); const v = await appel(base); setD(v); } catch (e) { setMessage(e.message); }
    setAttente(null);
  };
  const exporter = async (format) => {
    if (modifie && !(await enregistrer())) return;
    setExport({ format, i: 0 });
    try {
      const imgs = [];
      for (let i = 0; i < deck.slides.length; i++) {
        setExport({ format, i: i + 1, n: deck.slides.length });
        setSel(i);
        await new Promise((ok) => setTimeout(ok, 120));
        imgs.push(await photographier(photo.current.firstChild));
      }
      const r = await appel(`${base}/exporter`, { corps: { format, images: imgs } });
      setExport({ fini: r });
    } catch (e) { setMessage(e.message); setExport(null); }
  };
  const ajouter = (type) => {
    const id = `${type}-${Date.now().toString(36).slice(-4)}`;
    const t = [...deck.slides]; t.splice(sel + 1, 0, { id, type, titre: d.types[type] });
    setDeck({ ...deck, slides: t }); setSel(sel + 1); setModifie(true);
  };
  const courant = affiche.slides[Math.min(sel, affiche.slides.length - 1)];
  const entete = (
    <Entete titre="Proposition commerciale" description="Le deck de soutenance : votre besoin, le socle fonctionnel, l'identité, les maquettes, notre proposition. Watson l'écrit avec ce que contient l'avant-projet ; tu relis, tu présentes, tu exportes.">
      {!d.en_attente && !attente && (
        <div class="ligne">
          {d.existe && <select class="saisie" value={deck.statut || 'brouillon'} onChange={(e) => { setDeck({ ...deck, statut: e.target.value }); setModifie(true); }}>{Object.entries(d.statuts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          {d.existe && <BoutonComite projet={projet} cible={{ type: 'proposition', id: 'proposition' }} />}
          {d.existe && <button class="bouton" onClick={() => setPresenter(true)}><Play size={15} /> Présenter</button>}
          {d.existe && <button class="bouton" disabled={!!export_ && !export_.fini} onClick={() => exporter('pdf')}><FileDown size={15} /> PDF</button>}
          {d.existe && <button class="bouton" disabled={!!export_ && !export_.fini} onClick={() => exporter('pptx')}><Presentation size={15} /> PowerPoint</button>}
          <button class="bouton bouton-watson" disabled={!claude?.connecte} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={15} /> {d.existe ? 'Tout réécrire' : 'Rédiger avec Watson'}</button>
        </div>
      )}
    </Entete>
  );
  if (attente) {
    return (<>{entete}<div class="carte pile" style="align-items:center;padding:40px;text-align:center"><Watson humeur="ecrit" hauteur={200} />
      <strong>{attente === 'deck' ? 'Watson écrit la proposition' : 'Watson reprend la slide'}</strong>
      <span class="doux">À partir du cahier des charges, du moodboard, des maquettes et du périmètre. {attente === 'deck' ? 'Compte deux à quatre minutes.' : 'Une minute environ.'}</span></div></>);
  }
  return (
    <>
      {entete}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La rédaction de la proposition" />
      {message && <p class="encart e-rouge">{message}</p>}
      {export_ && (
        <div class="encart e-indigo"><span class="espace">{export_.fini ? <>Enregistré dans Téléchargements : <strong>{export_.fini.nom}</strong></> : `Préparation de l'export, slide ${export_.i || 1} sur ${export_.n || deck.slides.length}…`}</span>
          {export_.fini && <button class="bouton icone" onClick={() => setExport(null)}><X size={14} /></button>}</div>
      )}
      {demande !== null && (
        <div class="carte pile" style="gap:8px">
          <strong>Ce que Watson doit savoir</strong>
          <textarea class="saisie" style="min-height:70px;padding:10px 12px" placeholder="Facultatif : durée de la soutenance, qui sera dans la salle, le message à faire retenir, budget et planning s'ils sont connus…" value={demande} onInput={(e) => setDemande(e.target.value)} />
          <div class="ligne"><button class="bouton principal-b" onClick={() => rediger({ demande })}><Sparkles size={15} /> {d.existe ? 'Réécrire tout le deck' : 'Rédiger le deck'}</button><button class="bouton" onClick={() => setDemande(null)}>Annuler</button>
            <span class="doux petit">{[!d.cahier && 'pas de cahier des charges', !d.piste && 'pas de piste retenue', !d.nb_maquettes && 'pas de maquette'].filter(Boolean).join(', ') || 'Cahier, moodboard et maquettes seront utilisés.'}</span></div>
        </div>
      )}
      {d.en_attente && (
        <div class="carte ligne" style="gap:16px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={96} flotte={false} />
          <div class="pile espace" style="gap:4px"><strong>{d.en_attente.slide ? 'Watson propose une nouvelle version de la slide' : `Watson propose un deck de ${d.en_attente.slides.length} slides`}</strong>
            {d.en_attente.resume && <span class="doux">{d.en_attente.resume}</span>}
            {d.en_attente.a_confirmer?.length > 0 && <span class="petit">À confirmer avant de le montrer : {d.en_attente.a_confirmer.join(' · ')}</span>}</div>
          <div class="pile" style="gap:6px"><button class="bouton principal-b" disabled={occupe} onClick={() => faire(() => appel(`${base}/garder`, { corps: {} }))}><Check size={15} /> Garder</button>
            <button class="bouton" disabled={occupe} onClick={() => faire(() => appel(`${base}/ecarter`, { corps: {} }))}><X size={15} /> Écarter</button></div>
        </div>
      )}
      {!d.existe && !d.en_attente && demande === null && (
        <div class="vide pile" style="align-items:center;gap:12px"><Watson humeur="note" hauteur={170} />
          <span>Pas encore de proposition. J'écris le deck avec le cahier des charges, la piste retenue et les maquettes : mieux vaut les avoir avant.</span>
          <div class="ligne"><button class="bouton principal-b" disabled={!claude?.connecte} onClick={() => setDemande('')}><Sparkles size={15} /> Rédiger avec Watson</button></div></div>
      )}
      {affiche.slides.length > 0 && (
        <div class="deck">
          <div class="deck-liste">
            {affiche.slides.map((s, i) => (
              <button key={s.id} class={`deck-mini ${i === sel ? 'actif' : ''}`} onClick={() => setSel(i)}><span class="doux petit">{i + 1}</span><Echelle largeur={168}>{rendu(s, i)}</Echelle></button>
            ))}
          </div>
          <div class="deck-scene" ref={scene}>
            <Echelle largeur={largeur}>{rendu(courant, sel)}</Echelle>
            <div ref={photo} class="deck-photo" aria-hidden="true"><Echelle largeur={L}>{rendu(courant, sel)}</Echelle></div>
            {courant.notes && <div class="deck-notes"><b>Notes de l'orateur</b> {courant.notes}</div>}
          </div>
          {!d.en_attente && (
            <aside class="deck-edition pile" style="gap:10px">
              <div class="ligne" style="gap:4px"><strong class="espace">Slide {sel + 1}</strong>
                <button class="bouton icone" title="Monter" onClick={() => deplacer(sel, sel - 1)}><ArrowUp size={14} /></button>
                <button class="bouton icone" title="Descendre" onClick={() => deplacer(sel, sel + 1)}><ArrowDown size={14} /></button>
                <button class="bouton icone" title="Supprimer" onClick={() => { setDeck({ ...deck, slides: deck.slides.filter((_, j) => j !== sel) }); setSel(Math.max(0, sel - 1)); setModifie(true); }}><Trash2 size={14} /></button></div>
              <Formulaire key={courant.id} s={courant} d={d} changer={changerSlide} reprendre={(id, dem) => { if (modifie) enregistrer(); rediger({ slide: id, demande: dem }); }} occupe={occupe} />
              <div class="ligne" style="gap:6px"><select class="saisie espace" value="" onChange={(e) => e.target.value && ajouter(e.target.value)}><option value="">Ajouter une slide après…</option>{Object.entries(d.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Plus size={15} color="#A1A1AA" /></div>
              <div class="pile" style="gap:6px;border-top:1px solid #F1F1F6;padding-top:10px">
                <label class="champ">Client<input value={deck.client || ''} onInput={(e) => { setDeck({ ...deck, client: e.target.value }); setModifie(true); }} /></label>
                <label class="champ">Date<input value={deck.date || ''} onInput={(e) => { setDeck({ ...deck, date: e.target.value }); setModifie(true); }} /></label>
              </div>
              {modifie && <div class="barre-action" style="position:sticky;bottom:0"><span class="espace doux petit">Modifications non enregistrées</span><button class="bouton principal-b" disabled={occupe} onClick={enregistrer}><Check size={15} /> Enregistrer</button></div>}
            </aside>
          )}
        </div>
      )}
      {presenter && <Presenter slides={deck.slides} rendu={rendu} fermer={() => setPresenter(false)} />}
    </>
  );
}
