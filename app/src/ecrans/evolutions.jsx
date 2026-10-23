// Évolutions : un changement demandé sur le produit. Watson la rédige (constat, attendu, règles, critères
// d'acceptation), l'analyse d'impact suit la base à l'envers (ce qui cite quoi) et donne ce qu'il faut rejouer ;
// la mise à jour de la base passe par une demande à Watson, validée comme toujours.
import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, Check, CircleHelp, ClipboardCopy, GitBranch, GitMerge, GitPullRequestArrow, Network, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, X } from 'lucide-preact';
import { appel } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';
import { LotEnCours } from './edition.jsx';
import { BoutonRevue } from './studio.jsx';

const COULEUR = { a_qualifier: 'b-gris', prete: 'b-indigo', en_cours: 'b-ambre', livree: 'b-vert', abandonnee: 'b-rouge' };
const PRIO = { haute: 'b-rouge', normale: 'b-gris', basse: 'b-gris' };
const CAS = { nominal: ['Nominal', 'b-vert'], erreur: ['Erreur', 'b-rouge'], limite: ['Limite', 'b-ambre'], droits: ['Droits', 'b-violet'] };
const NIVEAUX = [['direct', 'Changé par l\'évolution'], ['cite', 'Ce qui le cite'], ['indirect', 'Par ricochet']];
const date = (d) => (d ? String(d).split('-').reverse().join('/') : '');

function enMarkdown(e) {
  const r = e.redaction || {};
  const l = [`# ${e.titre}`, '', `Statut : ${e.statut_libelle || e.statut} · Priorité : ${e.priorite}${e.version ? ` · Version : ${e.version}` : ''}`, '', '## Description', '',
    `**Actuellement**`, '', r.constat || e.besoin || '', '', `**Attendu**`, '', ...(r.attendu || []).map((x) => `- ${x}`)];
  if (r.regles?.length) l.push('', '## Règles métier', '', ...r.regles.map((x) => `- ${x}`));
  if (r.criteres?.length) l.push('', '## Critères d\'acceptation', '', ...r.criteres.map((c) => `- **Étant donné** ${c.etant_donne}, **lorsque** ${c.lorsque}, **alors** ${c.alors}.`));
  if (r.lots?.length) l.push('', '## Découpage', '', ...r.lots.map((x) => `- **${x.nom}** : ${x.contenu}`));
  if (e.impact?.elements?.length) l.push('', '## Impact', '', ...e.impact.elements.map((x) => `- ${x.genre_libelle} « ${x.nom} » : ${x.pourquoi}`));
  if (e.impact?.a_rejouer?.length) l.push('', '## Non-régression à rejouer', '', ...e.impact.a_rejouer.map((x) => `- ${x.genre} « ${x.nom} »`));
  if (r.questions?.length) l.push('', '## Questions au client', '', ...r.questions.map((x) => `- ${x}`));
  return l.join('\n');
}

function Formulaire({ d, valider, annuler, occupe }) {
  const [f, setF] = useState({ titre: '', besoin: '', origine: '', demandeur: '', priorite: 'normale', version: '' });
  const maj = (k, v) => setF({ ...f, [k]: v });
  return (
    <div class="carte pile" style="gap:12px">
      <label class="champ">Titre<input autoFocus value={f.titre} placeholder="Par exemple : compter le délai de litige en jours ouvrés" onInput={(e) => maj('titre', e.target.value)} /></label>
      <label class="champ">Le besoin, avec les mots du demandeur<textarea rows={4} value={f.besoin} onInput={(e) => maj('besoin', e.target.value)} /></label>
      <div class="ligne" style="gap:12px">
        <label class="champ" style="flex:1 1 200px">D'où ça vient<input value={f.origine} placeholder="Atelier du 22/10, mail, recette…" onInput={(e) => maj('origine', e.target.value)} /></label>
        <label class="champ" style="flex:1 1 200px">Demandé par<input value={f.demandeur} onInput={(e) => maj('demandeur', e.target.value)} /></label>
        <label class="champ" style="flex:0 1 160px">Priorité<select value={f.priorite} onChange={(e) => maj('priorite', e.target.value)}>{Object.entries(d.priorites).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {d.versions_produit.length > 0 && <label class="champ" style="flex:0 1 180px">Version visée<select value={f.version} onChange={(e) => maj('version', e.target.value)}><option value="">Pas encore</option>{d.versions_produit.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></label>}
      </div>
      <div class="ligne"><button class="bouton principal-b" disabled={occupe || !f.titre.trim()} onClick={() => valider(f)}><Check size={14} /> Créer l'évolution</button><button class="bouton" onClick={annuler}>Annuler</button></div>
    </div>
  );
}

function Impact({ e, aller, faire, occupe }) {
  const im = e.impact;
  if (!im) return null;
  return (
    <section class="carte pile" style="gap:12px">
      <div class="ligne"><h2 class="espace"><Network size={17} /> Analyse d'impact</h2>
        <span class="petit doux">Calculée le {date(im.calcule_le)}</span>
        <button class="bouton" disabled={occupe} onClick={() => faire(`/evolutions/${e.id}/impact`, {})}><RefreshCw size={14} /> Recalculer</button></div>
      <span class="petit doux">Watson suit la base à l'envers : ce qui cite chaque élément touché, les scénarios qui passent par les étapes concernées, leurs écrans et leurs maquettes.</span>
      {im.elements.length === 0 && <p class="doux">Rien de la base n'est touché : l'évolution ajoute du neuf, ou Watson n'a pas su relier le besoin à la base.</p>}
      <div class="ligne" style="align-items:flex-start;gap:16px">
        {NIVEAUX.map(([n, titre]) => {
          const els = im.elements.filter((x) => x.niveau === n);
          if (!els.length) return null;
          return (
            <div key={n} class="pile colonne-impact" style="gap:6px">
              <span class="petit doux" style="font-weight:600">{titre} · {els.length}</span>
              {els.map((x) => (
                <button key={x.id} class={`element-impact niveau-${n}`} onClick={() => aller(x.onglet)}>
                  <span class="petit doux">{x.genre_libelle}</span><strong>{x.nom}</strong><span class="petit doux">{x.pourquoi}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {im.a_rejouer.length > 0 && (
        <div class="encart e-indigo pile" style="gap:4px">
          <strong>Non-régression à rejouer</strong>
          {im.a_rejouer.map((x) => <span key={x.id}>{x.genre} « {x.nom} »</span>)}
        </div>
      )}
    </section>
  );
}

const GENRE_CH = { ajouté: 'b-vert', modifié: 'b-indigo', supprimé: 'b-rouge', remplacé: 'b-ambre', 'rendu obsolète': 'b-ambre' };

// La spec de l'évolution travaillée à part : une branche de la base, validée puis fusionnée dans la version de travail.
function Branche({ e, b, faire, occupe }) {
  const [confirmer, setConfirmer] = useState(false);
  const active = b && ['en_cours', 'validee'].includes(b.statut);
  return (
    <section class="carte pile" style="gap:10px">
      <div class="ligne"><h2 class="espace">Spec de l'évolution</h2>{b && <span class={`badge ${b.statut === 'integree' ? 'b-vert' : b.statut === 'validee' ? 'b-indigo' : b.statut === 'abandonnee' ? 'b-gris' : 'b-ambre'}`}>{b.libelle}</span>}</div>
      {!active && <>
        <span class="doux">{b?.statut === 'integree' ? `Fusionnée dans la version de travail le ${date(b.integree_le)}. ` : ''}Pour une évolution qui change la spec en profondeur, travaille-la à part : les changements que Watson propose iront sur une branche de la base, la version de travail ne bouge pas tant que la spec n'est pas validée et fusionnée.</span>
        <button class="bouton" style="align-self:flex-start" disabled={occupe} onClick={() => faire(`/evolutions/${e.id}/brancher`, {})}><GitBranch size={14} /> Travailler la spec sur une branche</button>
      </>}
      {active && <>
        <span class="doux">Branche {b.nom}, ouverte le {date(b.creee_le)} · {b.commits || 0} enregistrement{b.commits > 1 ? 's' : ''}{b.statut === 'validee' ? ` · validée le ${date(b.validee_le)}${b.validee_par ? ` par ${b.validee_par}` : ''}` : ''}</span>
        {b.erreur && <p class="encart e-rouge">{b.erreur}</p>}
        {(b.changements || []).length === 0 ? <span class="doux">Rien de changé sur la branche pour l'instant : demande à Watson les changements de la spec ci-dessous.</span> : (
          <div class="pile" style="gap:4px">{b.changements.map((c) => <span key={c.id}><span class={`badge ${GENRE_CH[c.changement] || 'b-gris'}`}>{c.changement}</span> {c.nom} <span class="petit doux">{c.id}{c.champs?.length ? ` · ${c.champs.join(', ')}` : ''}</span></span>)}</div>
        )}
        <div class="ligne">
          {b.statut === 'en_cours' && <button class="bouton principal-b" disabled={occupe || !(b.changements || []).length} onClick={() => faire(`/evolutions/${e.id}/branche-valider`, { valide: true })}><Check size={14} /> Valider la spec</button>}
          {b.statut === 'validee' && (confirmer
            ? <><button class="bouton principal-b" disabled={occupe} onClick={() => { setConfirmer(false); faire(`/evolutions/${e.id}/branche-fusionner`, { confirme: true }); }}>Confirmer la fusion</button><button class="bouton" onClick={() => setConfirmer(false)}>Annuler</button></>
            : <><button class="bouton principal-b" disabled={occupe} onClick={() => setConfirmer(true)}><GitMerge size={14} /> Fusionner dans la version de travail</button>
                <button class="bouton" disabled={occupe} onClick={() => faire(`/evolutions/${e.id}/branche-valider`, { valide: false })}>Remettre en cours</button></>)}
          <span class="espace" />
          <button class="bouton icone" disabled={occupe} title="Abandonner la branche (elle reste dans l'historique)" onClick={() => faire(`/evolutions/${e.id}/branche-abandonner`, {})}><X size={14} /></button>
        </div>
        {confirmer && <span class="petit doux">Les {b.changements.length} changements de la branche rejoignent la version de travail et partent sur GitHub. Si un même fichier a bougé des deux côtés, rien n'est fusionné.</span>}
      </>}
    </section>
  );
}

function Fiche({ projet, d, faire, occupe, attente, claude, aller, retour }) {
  const e = d.evolution;
  const r = e.redaction;
  const [demande, setDemande] = useState(null);
  const [consigne, setConsigne] = useState(null);
  const [lot, setLot] = useState(null);
  const [message, setMessage] = useState(null);
  const [copie, setCopie] = useState(false);
  const [notees, setNotees] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const versions = Object.fromEntries(d.versions_produit.map((v) => [v.id, v.nom]));
  const lancerBase = async () => {
    setMessage(null);
    try { setLot(await appel(`/projets/${projet.id}/evolutions/${e.id}/base`, { corps: { consigne } })); setConsigne(null); } catch (x) { setMessage(x.message); }
  };
  const noterQuestions = async () => {
    try {
      for (const q of r.questions) await appel(`/projets/${projet.id}/sujets`, { corps: { question: q, contexte: `Évolution « ${e.titre} »` } });
      setNotees(true);
    } catch (x) { setMessage(x.message); }
  };
  return (
    <>
      <div class="ligne" style="gap:10px">
        <button class="bouton" onClick={retour}><ArrowLeft size={14} /> Évolutions</button>
        <span class="espace" />
        <button class="bouton" onClick={async () => { await navigator.clipboard.writeText(enMarkdown({ ...e, statut_libelle: d.statuts[e.statut] })); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copiée' : 'Copier en Markdown'}</button>
        {r && <BoutonRevue projet={projet} cible={{ type: 'evolution', id: e.id }} titre={e.titre} corriger={(c) => faire(`/evolutions/${e.id}/rediger`, { demande: c }, 'POST', true)} />}
        {confirmer ? <button class="bouton danger" onClick={async () => { await faire(`/evolutions/${e.id}`, {}, 'DELETE'); retour(); }}>Supprimer l'évolution</button>
          : <button class="bouton icone" title="Supprimer" onClick={() => setConfirmer(true)}><Trash2 size={14} /></button>}
      </div>
      <Entete titre={e.titre} description={`${e.id} · créée le ${date(e.date)}${e.par ? ` par ${e.par}` : ''}${e.origine ? ` · ${e.origine}` : ''}${e.demandeur ? ` · demandée par ${e.demandeur}` : ''}`}>
        <div class="ligne">
          <select class="saisie" value={e.statut} onChange={(x) => faire(`/evolutions/${e.id}`, { statut: x.target.value })} aria-label="Statut">{Object.entries(d.statuts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select class="saisie" value={e.priorite} onChange={(x) => faire(`/evolutions/${e.id}`, { priorite: x.target.value })} aria-label="Priorité">{Object.entries(d.priorites).map(([k, v]) => <option key={k} value={k}>Priorité {v.toLowerCase()}</option>)}</select>
          {d.versions_produit.length > 0 && <select class="saisie" value={e.version || ''} onChange={(x) => faire(`/evolutions/${e.id}`, { version: x.target.value })} aria-label="Version visée"><option value="">Version : pas encore</option>{d.versions_produit.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select>}
        </div>
      </Entete>
      {message && <p class="encart e-rouge">{message}</p>}
      {e.besoin && <section class="carte pile" style="gap:6px"><span class="petit doux">Le besoin</span><span style="white-space:pre-wrap">{e.besoin}</span></section>}
      {attente && <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="reflechit" hauteur={80} flotte={false} /><span><strong>Watson rédige l'évolution</strong><br /><span class="doux">Il la confronte à la base pour repérer ce qu'elle touche.</span></span></div>}
      {!attente && (demande !== null || !r) && (
        <div class="carte ligne" style="gap:18px;flex-wrap:nowrap;align-items:center">
          <Watson humeur="note" hauteur={110} flotte={false} />
          <div class="pile espace" style="gap:8px">
            <strong>{r ? 'Reprendre la rédaction' : 'Watson rédige l\'évolution'}</strong>
            <span class="doux">Constat et attendu, règles testables, critères d'acceptation (nominal, erreurs, limites, droits), ce qu'on oublie souvent, les questions pour le client, et ce que l'évolution touche dans la base.</span>
            <input class="saisie" placeholder="Une consigne, facultative" value={demande || ''} onInput={(x) => setDemande(x.target.value)} />
            <div class="ligne"><button class="bouton bouton-watson" disabled={occupe || !claude?.connecte} onClick={async () => { if (await faire(`/evolutions/${e.id}/rediger`, { demande: demande || '' }, 'POST', true)) setDemande(null); }}><Sparkles size={14} /> Rédiger</button>
              {r && <button class="bouton" onClick={() => setDemande(null)}>Annuler</button>}</div>
          </div>
        </div>
      )}
      {r && !attente && (
        <>
          <div class="ligne" style="align-items:flex-start;gap:16px">
            <section class="carte pile" style="flex:1 1 420px;gap:10px">
              <div class="ligne"><h2 class="espace">Description</h2>{demande === null && <button class="lien petit" onClick={() => setDemande('')}><RotateCcw size={13} /> Reprendre avec Watson</button>}</div>
              <span class="petit doux" style="font-weight:600">Actuellement</span><span>{r.constat}</span>
              <span class="petit doux" style="font-weight:600;margin-top:4px">Attendu</span>
              {r.attendu.map((x, i) => <span key={i}><Check size={14} color="#4F46E5" /> {x}</span>)}
              {r.regles?.length > 0 && <><span class="petit doux" style="font-weight:600;margin-top:4px">Règles métier</span>{r.regles.map((x, i) => <span key={i}>{x}</span>)}</>}
              {r.lots?.length > 0 && <><span class="petit doux" style="font-weight:600;margin-top:4px">Découpage</span>{r.lots.map((x, i) => <span key={i}><strong>{x.nom}</strong> : {x.contenu}</span>)}</>}
            </section>
            <section class="carte pile" style="flex:1 1 320px;gap:10px">
              {r.oublis?.length > 0 && <div class="encart e-orange pile" style="gap:3px"><strong>Ce qu'on oublie souvent</strong>{r.oublis.map((x, i) => <span key={i}>{x}</span>)}</div>}
              {r.questions?.length > 0 && <div class="pile" style="gap:4px"><h2>Questions au client</h2>{r.questions.map((x, i) => <span key={i}><CircleHelp size={14} color="#B45309" /> {x}</span>)}
                {notees ? <span class="badge b-vert" style="align-self:flex-start">Ajoutées aux questions ouvertes</span>
                  : <button class="bouton" style="align-self:flex-start" onClick={noterQuestions}><Plus size={14} /> Ajouter aux questions ouvertes</button>}</div>}
              {r.inconnus?.length > 0 && <span class="petit doux">Watson a cité des éléments absents de la base, écartés de l'analyse : {r.inconnus.join(', ')}.</span>}
            </section>
          </div>
          <section class="carte pile" style="gap:10px">
            <h2>Critères d'acceptation</h2>
            <table class="tableau-criteres">
              <thead><tr><th>Cas</th><th>Étant donné</th><th>Lorsque</th><th>Alors</th></tr></thead>
              <tbody>{r.criteres.map((c, i) => { const [l, cl] = CAS[c.cas] || ['', 'b-gris']; return <tr key={i}><td>{l && <span class={`badge ${cl}`}>{l}</span>}</td><td>{c.etant_donne}</td><td>{c.lorsque}</td><td>{c.alors}</td></tr>; })}</tbody>
            </table>
          </section>
          <Impact e={e} aller={aller} faire={faire} occupe={occupe} />
          <section class="carte ligne" style="gap:10px">
            <span class="pile espace" style="gap:2px"><strong>Recette</strong><span class="petit doux">Un cas de test par critère d'acceptation, puis une campagne avec ces cas et ceux de la non-régression.</span></span>
            <button class="bouton" disabled={occupe} onClick={async () => { try { await appel(`/projets/${projet.id}/recette/evolution`, { corps: { evolution: e.id } }); aller('recette'); } catch (x) { setMessage(x.message); } }}>Créer les cas de test</button>
            <button class="bouton" disabled={occupe} onClick={async () => { try { await appel(`/projets/${projet.id}/recette/campagnes`, { corps: { nom: `TNR ${e.titre}`, genre: 'tnr', evolution: e.id } }); aller('recette'); } catch (x) { setMessage(x.message); } }}>Ouvrir une campagne</button>
          </section>
          <Branche e={e} b={d.branche} faire={faire} occupe={occupe} />
          <section class="carte pile" style="gap:10px">
            <div class="ligne"><h2 class="espace">{d.branche && ['en_cours', 'validee'].includes(d.branche.statut) ? `Changer la spec sur la branche ${d.branche.nom}` : 'Mettre la base à jour'}</h2>
              {e.base?.etat === 'appliquee' && <span class="badge b-vert">Base mise à jour le {date(e.base.le)}</span>}
              {e.base?.etat === 'proposee' && !lot && <span class="badge b-ambre">Proposition en attente dans Alimenter</span>}</div>
            {!lot && consigne === null && <>
              <span class="doux">Watson propose les changements de la base (règles, écrans, scénarios) qui découlent de l'évolution. Tu les tries, comme toujours.</span>
              <button class="bouton bouton-watson" style="align-self:flex-start" disabled={!claude?.connecte} onClick={() => setConsigne(r.consigne_base || '')}><Sparkles size={14} /> Préparer les changements</button>
            </>}
            {consigne !== null && <>
              <textarea class="saisie" rows={4} style="padding:10px 12px" value={consigne} onInput={(x) => setConsigne(x.target.value)} />
              <div class="ligne"><button class="bouton bouton-watson" disabled={!consigne.trim()} onClick={lancerBase}><Sparkles size={14} /> Demander à Watson</button><button class="bouton" onClick={() => setConsigne(null)}><X size={14} /> Annuler</button></div>
            </>}
            {lot && <LotEnCours projet={projet} lot={lot}
              fini={async () => { setLot(null); if (lot.branche) await faire(`/evolutions/${e.id}`, undefined, 'GET'); else { await faire(`/evolutions/${e.id}`, { base_appliquee: true }); await faire(`/evolutions/${e.id}/impact`, {}); } }}
              abandonner={async () => { await appel(`/projets/${projet.id}/alimenter/${lot.id}`, { methode: 'DELETE', corps: {} }).catch(() => {}); setLot(null); }} />}
          </section>
        </>
      )}
    </>
  );
}

export function Evolutions({ projet, etat, aller }) {
  const base = `/projets/${projet.id}/evolutions`;
  const [liste, setListe] = useState(null);
  const [d, setD] = useState(null);
  const [creation, setCreation] = useState(false);
  const [filtre, setFiltre] = useState('ouvertes');
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [attente, setAttente] = useState(false);
  const [claude, setClaude] = useState(etat.claude);
  const charger = () => appel(base).then(setListe).catch((x) => setMessage(x.message));
  useEffect(() => { charger(); }, []);
  const faire = async (chemin, corps, methode = 'POST', longue = false) => {
    setOccupe(true); setMessage(null); if (longue) setAttente(true);
    try { const r = await appel(`/projets/${projet.id}${chemin}`, { corps, methode }); if (r.evolution) setD(r); return r; } catch (x) { setMessage(x.message); return null; } finally { setOccupe(false); setAttente(false); }
  };
  if (!liste) return <Attente erreur={message} />;
  if (d) {
    return (
      <>
        <ConnexionClaude claude={claude} setClaude={setClaude} usage="La rédaction des évolutions" />
        {message && <p class="encart e-rouge">{message}</p>}
        <Fiche projet={projet} d={d} faire={faire} occupe={occupe} attente={attente} claude={claude} aller={aller} retour={() => { setD(null); charger(); }} />
      </>
    );
  }
  const ouvertes = (x) => !['livree', 'abandonnee'].includes(x.statut);
  const vues = liste.evolutions.filter((x) => filtre === 'toutes' || (filtre === 'ouvertes') === ouvertes(x));
  const versions = Object.fromEntries(liste.versions_produit.map((v) => [v.id, v.nom]));
  return (
    <>
      <Entete titre="Évolutions" description="Les changements demandés sur le produit. Watson rédige chaque évolution selon la méthode du studio et mesure son impact sur la base : ce qui est touché, et ce qu'il faut rejouer en non-régression.">
        <div class="ligne">
          <div class="segments">{[['ouvertes', `En cours (${liste.evolutions.filter(ouvertes).length})`], ['fermees', 'Livrées ou abandonnées'], ['toutes', 'Toutes']].map(([k, v]) => <button key={k} class={`segment ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>)}</div>
          <button class="bouton principal-b" onClick={() => setCreation(!creation)}><Plus size={15} /> Nouvelle évolution</button>
        </div>
      </Entete>
      {message && <p class="encart e-rouge">{message}</p>}
      {creation && <Formulaire d={liste} occupe={occupe} annuler={() => setCreation(false)} valider={async (f) => { if (await faire('/evolutions', f)) setCreation(false); }} />}
      {vues.length === 0 && !creation && <div class="vide pile" style="align-items:center;gap:10px"><Watson humeur="note" hauteur={150} /><span>{liste.evolutions.length ? 'Rien dans ce filtre.' : 'Aucune évolution pour l\'instant.'}</span></div>}
      <div class="pile" style="gap:8px">
        {vues.map((x) => (
          <button key={x.id} class="ligne-evolution" onClick={() => faire(`/evolutions/${x.id}`, undefined, 'GET')}>
            <GitPullRequestArrow size={17} color="#4F46E5" />
            <span class="pile espace" style="gap:2px;text-align:left"><strong>{x.titre}</strong>
              <span class="petit doux">{x.id} · {date(x.date)}{x.origine ? ` · ${x.origine}` : ''}{x.redigee ? ` · ${x.touches} élément${x.touches > 1 ? 's' : ''} touché${x.touches > 1 ? 's' : ''}` : ' · à rédiger'}{x.base === 'appliquee' ? ' · base à jour' : ''}</span></span>
            {x.version && <span class="badge b-gris">{versions[x.version] || x.version}</span>}
            {x.priorite === 'haute' && <span class={`badge ${PRIO.haute}`}>Priorité haute</span>}
            <span class={`badge ${COULEUR[x.statut] || 'b-gris'}`}>{liste.statuts[x.statut]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
