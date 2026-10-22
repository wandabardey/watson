// Avant-projet : le cahier des charges. Un document en sections, rédigé avec Watson, corrigé à la main.
// Le périmètre (par version) et les points à confirmer se tiennent à jour depuis la base.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Copy, FileText, Pencil, RefreshCw, Sparkles, X } from 'lucide-preact';
import { appel } from '../api.js';
import { BoutonComite } from './comite.jsx';
import { BoutonRevue } from './studio.jsx';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { Markdown } from './markdown.jsx';

function Perimetre({ d, aller }) {
  if (!d.perimetre.length) return <p class="doux petit">Aucune version produit ni aucun élément rattaché pour l'instant. Les versions se définissent depuis Référentiels, Écrans ou Scénarios.</p>;
  return (
    <div class="pile" style="gap:10px">
      {d.perimetre.map((v) => {
        const lignes = [['Scénarios', v.scenarios, 'scenarios'], ['Écrans', v.ecrans, 'ecrans'], ['Objets métier', v.entites, 'referentiels'], ['Listes de valeurs', v.listes, 'referentiels']].filter(([, l]) => l.length);
        return (
          <div key={v.version || '_'} class="lot-perimetre">
            <div class="ligne" style="gap:8px"><span class="pastille-lot">{v.nom}</span><span class="doux petit">{v.description}</span></div>
            {lignes.length === 0 && <span class="doux petit">Rien de nouveau dans cette version pour l'instant.</span>}
            {lignes.map(([titre, l, ecran]) => (
              <div key={titre} class="ligne" style="gap:6px;align-items:baseline;flex-wrap:nowrap">
                <button class="lien petit" style="flex:0 0 120px;text-align:left" onClick={() => aller(ecran)}>{titre}</button>
                <span class="petit espace">{l.map((x) => x.nom + (x.a_trancher ? ' (à trancher)' : '')).join(', ')}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Section({ s, d, modifiable, enregistrer, reecrire, aller, occupe }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(s.contenu || '');
  const [titre, setTitre] = useState(s.titre);
  const [demande, setDemande] = useState(null);
  useEffect(() => { setTexte(s.contenu || ''); setTitre(s.titre); }, [s.contenu, s.titre]);
  return (
    <section id={`cdc-${s.id}`} class="cdc-section">
      <div class="ligne cdc-tete">
        {edition ? <input class="saisie espace cdc-titre-saisie" value={titre} onInput={(e) => setTitre(e.target.value)} /> : <h2 class="espace">{s.titre}</h2>}
        {modifiable && !edition && (
          <span class="cdc-actions">
            {!s.vivante && <button class="bouton bouton-watson petit-b" disabled={occupe} onClick={() => setDemande(demande === null ? '' : null)}><Sparkles size={13} /> Réécrire</button>}
            <button class="bouton petit-b" onClick={() => setEdition(true)}><Pencil size={13} /> Modifier</button>
          </span>
        )}
      </div>
      {demande !== null && (
        <div class="ligne cdc-demande">
          <input class="saisie espace" autoFocus placeholder="Facultatif : ce que Watson doit changer (plus court, insister sur…)" value={demande}
            onInput={(e) => setDemande(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { reecrire([s.id], demande); setDemande(null); } }} />
          <button class="bouton principal-b" onClick={() => { reecrire([s.id], demande); setDemande(null); }}><Sparkles size={14} /> Proposer</button>
          <button class="bouton icone" aria-label="Annuler" onClick={() => setDemande(null)}><X size={14} /></button>
        </div>
      )}
      {s.id === 'perimetre' && <Perimetre d={d} aller={aller} />}
      {s.id === 'questions' && (d.questions.length
        ? <ul class="cdc-questions">{d.questions.map((q) => <li key={q.id}>{q.question}</li>)}</ul>
        : <p class="doux petit">Aucune question ouverte dans le projet.</p>)}
      {edition ? (
        <div class="pile" style="gap:8px">
          <textarea class="saisie cdc-editeur" value={texte} placeholder={s.vivante ? 'Texte d\'introduction, facultatif' : s.aide} onInput={(e) => setTexte(e.target.value)} />
          <span class="doux petit">Mise en forme : listes avec « - » ou « 1. », **gras**, ### sous-titre, tableaux avec « | ».</span>
          <div class="ligne">
            <button class="bouton principal-b" disabled={occupe} onClick={async () => { if (await enregistrer(s.id, { contenu: texte, titre: titre.trim() || s.titre })) setEdition(false); }}><Check size={14} /> Enregistrer</button>
            <button class="bouton" onClick={() => { setEdition(false); setTexte(s.contenu || ''); setTitre(s.titre); }}>Annuler</button>
          </div>
        </div>
      ) : s.contenu ? <Markdown texte={s.contenu} /> : !s.vivante && <p class="doux cdc-vide">{s.aide}</p>}
    </section>
  );
}

function Revue({ prop, d, garder, ecarter, occupe }) {
  const [sections, setSections] = useState(() => prop.sections.map((s) => s.id));
  const [questions, setQuestions] = useState(() => prop.questions.map((_, i) => i));
  const basculer = (l, set, v) => set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  return (
    <div class="pile" style="gap:14px">
      <div class="carte ligne" style="gap:16px;flex-wrap:nowrap;align-items:flex-start">
        <Watson humeur="ecrit" hauteur={110} flotte={false} />
        <div class="pile espace" style="gap:6px">
          <strong>Watson propose {prop.sections.length} section{prop.sections.length > 1 ? 's' : ''}{prop.questions.length ? ` et ${prop.questions.length} question${prop.questions.length > 1 ? 's' : ''}` : ''}</strong>
          <span class="doux">{prop.resume}</span>
          <span class="doux petit">Rédigé par {prop.modele}{prop.duree_s ? ` en ${prop.duree_s} s` : ''}{prop.demande ? ` · demande : « ${prop.demande} »` : ''}. Rien n'est enregistré avant ton choix.</span>
        </div>
      </div>
      {prop.sections.map((s) => {
        const garde = sections.includes(s.id);
        return (
          <div key={s.id} class={`carte pile proposition ${garde ? '' : 'ecartee'}`} style="gap:10px">
            <div class="ligne" style="align-items:flex-start">
              <button class={`case ${garde ? 'cochee' : ''}`} aria-label={garde ? 'Écarter' : 'Garder'} onClick={() => basculer(sections, setSections, s.id)}>{garde && <Check size={14} />}</button>
              <div class="pile espace" style="gap:2px"><strong>{s.titre}</strong>{s.pourquoi && <span class="doux petit">{s.pourquoi}</span>}</div>
              <span class={`badge ${s.avant ? 'b-violet' : 'b-indigo'}`}>{s.avant ? 'Réécrite' : 'Nouvelle'}</span>
            </div>
            <div class={s.avant ? 'cdc-comparaison' : ''}>
              {s.avant && <div class="cdc-avant"><span class="doux petit">Avant</span><Markdown texte={s.avant} /></div>}
              <div><span class="doux petit">{s.avant ? 'Proposé' : ''}</span><Markdown texte={s.contenu} /></div>
            </div>
          </div>
        );
      })}
      {prop.questions.length > 0 && (
        <div class="carte pile" style="gap:8px">
          <strong>Questions à noter dans le projet</strong>
          {prop.questions.map((q, i) => (
            <label key={i} class="ligne petit" style="gap:8px;align-items:flex-start"><input type="checkbox" checked={questions.includes(i)} onChange={() => basculer(questions, setQuestions, i)} />
              <span>{q.question}{q.contexte && <span class="doux"> · {q.contexte}</span>}</span></label>
          ))}
        </div>
      )}
      <div class="barre-action">
        <button class="bouton" disabled={occupe} onClick={ecarter}><X size={15} /> Tout écarter</button>
        <span class="espace" />
        <span class="doux">{sections.length} section{sections.length > 1 ? 's' : ''} gardée{sections.length > 1 ? 's' : ''}</span>
        <button class="bouton principal-b" disabled={occupe || (!sections.length && !questions.length)} onClick={() => garder(sections, questions)}>{occupe ? 'Enregistrement…' : 'Garder dans le cahier'}</button>
      </div>
    </div>
  );
}

export function enMarkdown(c, d) {
  const l = [`# ${c.titre || 'Cahier des charges'}`, ''];
  for (const s of c.sections) {
    l.push(`## ${s.titre}`, '');
    if (s.id === 'perimetre') for (const v of d.perimetre) {
      l.push(`### ${v.nom}`, '');
      for (const [t, x] of [['Scénarios', v.scenarios], ['Écrans', v.ecrans], ['Objets métier', v.entites]]) if (x.length) l.push(`- ${t} : ${x.map((e) => e.nom).join(', ')}`);
      l.push('');
    }
    if (s.id === 'questions') { for (const q of d.questions) l.push(`- ${q.question}`); l.push(''); }
    if (s.contenu) l.push(s.contenu, '');
  }
  return l.join('\n');
}

export function Cahier({ projet, etat, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [redaction, setRedaction] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [claude, setClaude] = useState(etat.claude);
  const [copie, setCopie] = useState(false);
  const corps = useRef(null);
  const base = `/projets/${projet.id}/avant-projet/cahier`;
  useEffect(() => { appel(base).then(setD).catch((e) => setErreur(e.message)); }, []);
  if (!d) return <Attente erreur={erreur} />;
  const c = d.cahier;
  const enregistrer = async (cahier, messageCommit) => {
    setOccupe(true); setMessage(null);
    try { setD(await appel(base, { corps: { cahier, message: messageCommit } })); return true; } catch (e) { setMessage(e.message); return false; } finally { setOccupe(false); }
  };
  const majSection = (id, champs) => {
    const s = c.sections.find((x) => x.id === id);
    return enregistrer({ ...c, sections: c.sections.map((x) => (x.id === id ? { ...x, ...champs } : x)) }, `Cahier des charges : ${champs.titre || s.titre}`);
  };
  const rediger = async (sections, demande) => {
    setRedaction({ sections }); setMessage(null);
    try { await appel(`${base}/rediger`, { corps: { sections, demande } }); setD(await appel(base)); } catch (e) { setMessage(e.message); }
    setRedaction(null);
  };
  const garder = async (sections, questions) => {
    setOccupe(true); setMessage(null);
    try { setD(await appel(`${base}/garder`, { corps: { sections, questions } })); } catch (e) { setMessage(e.message); }
    setOccupe(false);
  };
  const ecarter = async () => { setOccupe(true); try { setD(await appel(`${base}/proposition`, { methode: 'DELETE', corps: {} })); } finally { setOccupe(false); } };
  const copier = async () => {
    try { await navigator.clipboard.writeText(enMarkdown(c, d)); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch { setMessage('Copie impossible sur ce poste.'); }
  };
  const remplies = c.sections.filter((s) => s.contenu || s.vivante).length;
  const entete = (
    <Entete titre="Cahier des charges" description="Le cadrage du projet avec le client : contexte, objectifs, périmètre du MVP et des versions suivantes, contraintes. Watson rédige à partir de la base et des documents ; tu gardes ce qui te va.">
      {d.existe && !d.proposition && (
        <div class="ligne">
          <select class="saisie" value={c.statut || 'brouillon'} onChange={(e) => enregistrer({ ...c, statut: e.target.value }, `Cahier des charges : ${d.statuts[e.target.value].toLowerCase()}`)} aria-label="Statut du cahier">
            {Object.entries(d.statuts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <BoutonRevue projet={projet} cible={{ type: 'cahier', id: 'cahier' }} titre="Cahier des charges" corriger={(consigne) => rediger(null, consigne)} />
          <BoutonComite projet={projet} cible={{ type: 'cahier', id: 'cahier' }} />
          <button class="bouton" onClick={copier}>{copie ? <Check size={15} /> : <Copy size={15} />} {copie ? 'Copié' : 'Copier en Markdown'}</button>
          <button class="bouton bouton-watson" disabled={!!redaction || !claude?.connecte} onClick={() => rediger(null, null)}><RefreshCw size={15} /> Tout reprendre avec Watson</button>
        </div>
      )}
    </Entete>
  );
  if (redaction) {
    return (
      <>{entete}
        <div class="carte pile" style="align-items:center;padding:40px;text-align:center">
          <Watson humeur="ecrit" hauteur={200} />
          <strong>Watson rédige {redaction.sections ? `« ${c.sections.find((s) => s.id === redaction.sections[0])?.titre} »` : 'le cahier des charges'}</strong>
          <span class="doux">À partir de la base et des documents lus. Compte une à trois minutes.</span>
        </div>
      </>
    );
  }
  return (
    <>
      {entete}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La rédaction du cahier des charges" />
      {message && <p class="encart e-rouge">{message}</p>}
      {d.proposition ? <Revue prop={d.proposition} d={d} garder={garder} ecarter={ecarter} occupe={occupe} /> : !d.existe ? (
        <div class="vide pile" style="align-items:center;gap:14px">
          <Watson humeur="note" hauteur={190} />
          <strong>Pas encore de cahier des charges.</strong>
          <span>Je peux en rédiger un premier jet à partir de ce que contient le projet{d.perimetre.length ? ' et des documents déjà lus' : ''}. Plus Alimenter a reçu de comptes rendus, meilleur il sera.</span>
          <div class="ligne">
            <button class="bouton principal-b" disabled={!claude?.connecte} onClick={() => rediger(null, null)}><Sparkles size={15} /> Rédiger un premier jet</button>
            <button class="bouton" onClick={() => enregistrer(c, 'Cahier des charges : trame')}><FileText size={15} /> Partir de la trame vide</button>
            <button class="bouton" onClick={() => aller('alimenter')}>Alimenter d'abord</button>
          </div>
        </div>
      ) : (
        <div class="cdc">
          <nav class="cdc-sommaire" aria-label="Sommaire">
            <span class="doux petit">{remplies} / {c.sections.length} sections</span>
            {c.sections.map((s) => (
              <button key={s.id} class={`cdc-lien ${s.contenu || s.vivante ? 'remplie' : ''}`} onClick={() => corps.current?.querySelector(`#cdc-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <span class="cdc-puce" />{s.titre}</button>
            ))}
            {d.manquantes.length > 0 && <button class="lien petit" style="margin-top:8px" onClick={() => enregistrer({ ...c, sections: [...c.sections, ...d.manquantes.map((m) => ({ id: m.id, titre: m.titre, contenu: '' }))] }, 'Cahier des charges : sections de la trame')}>Ajouter les sections manquantes de la trame</button>}
          </nav>
          <article class="cdc-page" ref={corps}>
            <div class="cdc-titre"><span class="doux petit">{projet.nom}{c.mis_a_jour ? ` · mis à jour le ${c.mis_a_jour.split('-').reverse().join('/')}` : ''}</span><h1>{c.titre}</h1></div>
            {c.sections.map((s) => <Section key={s.id} s={s} d={d} modifiable={!occupe} occupe={occupe || !claude?.connecte} enregistrer={majSection} reecrire={rediger} aller={aller} />)}
          </article>
        </div>
      )}
    </>
  );
}
