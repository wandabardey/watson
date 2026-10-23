// App en direct : l'application qui tourne, écran par écran, à côté de ce que la base en dit (spec, maquette de
// référence, rubrique du guide utilisateur, avancement). On y relève les écarts : anomalie (ticket rédigé), évolution
// (backlog) ou question pour le client. La critique UX se fait depuis une capture de l'écran réel.
import { useEffect, useRef, useState } from 'preact/hooks';
import { AlertTriangle, BookOpen, Camera, ClipboardCopy, ExternalLink, FileText, Frame, ListChecks, MonitorPlay, RefreshCw, X } from 'lucide-preact';
import { appel, ouvrirLien } from '../api.js';
import { Attente, Entete } from './commun.jsx';
import { Markdown } from './markdown.jsx';
import { Rendu } from './maquettes.jsx';
import { BoutonRevue } from './studio.jsx';
import { ElementWatson } from '../contexte.js';

const lireImage = (fichier) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(fichier); });

function Capture({ capture, setCapture }) {
  const zone = useRef(null);
  useEffect(() => {
    const coller = async (e) => {
      const f = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'))?.getAsFile();
      if (f) { e.preventDefault(); setCapture(await lireImage(f)); }
    };
    window.addEventListener('paste', coller);
    return () => window.removeEventListener('paste', coller);
  }, []);
  return (
    <div ref={zone} class="direct-capture" onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) setCapture(await lireImage(f)); }}>
      {capture ? <><img src={capture} alt="Capture de l'écran" /><button class="bouton icone" aria-label="Retirer la capture" onClick={() => setCapture(null)}><X size={14} /></button></>
        : <span class="petit doux"><Camera size={14} /> Colle une capture de l'écran (sur Mac : Cmd+Ctrl+Maj+4, puis Cmd+V) ou dépose une image ici.</span>}
    </div>
  );
}

function Releve({ projet, e, environnement, url, capture, recevoir }) {
  const [genre, setGenre] = useState('anomalie');
  const [constat, setConstat] = useState('');
  const [attendu, setAttendu] = useState('');
  const [etapes, setEtapes] = useState('');
  const [resultat, setResultat] = useState(null);
  const [message, setMessage] = useState(null);
  const [copie, setCopie] = useState(false);
  const envoyer = async () => {
    setMessage(null);
    try {
      const r = await appel(`/projets/${projet.id}/direct/relever`, { corps: { ecran: e.id, genre, constat, attendu, etapes: etapes.split('\n'), environnement, url, capture: genre === 'anomalie' ? capture : null } });
      setResultat(r); recevoir(r); setConstat(''); setAttendu(''); setEtapes('');
    } catch (x) { setMessage(x.message); }
  };
  return (
    <div class="pile" style="gap:8px">
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="segments" style="align-self:flex-start">
        {[['anomalie', 'Anomalie'], ['evolution', 'Évolution'], ['question', 'Question']].map(([k, l]) => <button key={k} class={`segment ${genre === k ? 'actif' : ''}`} onClick={() => setGenre(k)}>{l}</button>)}
      </div>
      <span class="petit doux">{{ anomalie: "Le code ne fait pas ce que dit la spec : Watson range l'écart avec sa capture et rédige le ticket.", evolution: 'La spec elle-même est à revoir : Watson crée une évolution dans le backlog.', question: 'Une décision du client est nécessaire : Watson ajoute une question ouverte.' }[genre]}</span>
      <textarea class="saisie" rows={3} style="padding:8px 10px" placeholder="Ce que tu constates" value={constat} onInput={(x) => setConstat(x.currentTarget.value)} />
      {genre !== 'question' && <textarea class="saisie" rows={2} style="padding:8px 10px" placeholder="Ce qui est attendu" value={attendu} onInput={(x) => setAttendu(x.currentTarget.value)} />}
      {genre === 'anomalie' && <textarea class="saisie" rows={2} style="padding:8px 10px" placeholder="Étapes pour reproduire, une par ligne (facultatif)" value={etapes} onInput={(x) => setEtapes(x.currentTarget.value)} />}
      <button class="bouton principal-b" style="align-self:flex-start" disabled={!constat.trim()} onClick={envoyer}>Relever</button>
      {resultat?.ticket && (
        <div class="encart e-indigo" style="flex-direction:column;gap:6px">
          <span>Écart {resultat.ecart.id} relevé. Le ticket est prêt à coller dans Jira (Watson ne crée rien dans Jira sans ton accord).</span>
          <button class="bouton" style="align-self:flex-start" onClick={async () => { await navigator.clipboard.writeText(resultat.ticket); setCopie(true); setTimeout(() => setCopie(false), 2000); }}><ClipboardCopy size={14} /> {copie ? 'Copié' : 'Copier le ticket'}</button>
        </div>
      )}
      {resultat?.evolution && <p class="encart e-vert">Évolution {resultat.evolution} créée dans le backlog.</p>}
      {resultat?.genre === 'question' && <p class="encart e-vert">Question ajoutée aux questions ouvertes.</p>}
    </div>
  );
}

export function Direct({ projet, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [id, setId] = useState(null);
  const [env, setEnv] = useState(0);
  const [onglet, setOnglet] = useState('spec');
  const [cle, setCle] = useState(0);
  const [capture, setCapture] = useState(null);
  const panneau = useRef(null);
  const [largeur, setLargeur] = useState(380);
  const charger = () => appel(`/projets/${projet.id}/direct`).then((v) => { setD(v); setId((x) => x || (v.ecrans.find((e) => e.adresses.length) || v.ecrans[0])?.id); }).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => { const f = () => panneau.current && setLargeur(panneau.current.clientWidth - 28); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [d]);
  if (!d) return <Attente erreur={erreur} />;
  const e = d.ecrans.find((x) => x.id === id) || d.ecrans[0];
  const sansAdresse = !d.applications.some((a) => a.adresses.length);
  const adr = e?.adresses[Math.min(env, Math.max(0, e.adresses.length - 1))];
  const ouverts = (e?.ecarts || []).filter((x) => x.statut === 'ouvert').length;
  return (
    <>
      <ElementWatson type="écran" id={e?.id} nom={e?.nom} />
      <Entete titre="App en direct" description="L'application qui tourne, écran par écran, en face de ce que la base en dit : la spec, la maquette de référence, le guide utilisateur. Chaque écart se relève sur place." />
      {sansAdresse && <p class="encart e-orange">Aucune adresse d'application n'est renseignée. Ajoute-les dans Passage en code, Réglages de l'application (par exemple Local, http://localhost:4200, et Recette).</p>}
      <div class="direct">
        <aside class="direct-liste">
          {d.ecrans.map((x) => (
            <button key={x.id} class={`direct-ecran ${x.id === e?.id ? 'actif' : ''}`} onClick={() => { setId(x.id); setCapture(null); }}>
              <span class="espace">{x.nom}</span>
              {x.ecarts.some((y) => y.statut === 'ouvert') && <AlertTriangle size={12} color="#D97706" />}
              {!x.route && <span class="petit doux" title="Pas d'adresse pour cet écran">?</span>}
            </button>
          ))}
        </aside>
        <section class="direct-app">
          <div class="ligne direct-barre">
            {e?.adresses.length > 1 && <select class="saisie" value={env} onChange={(x) => setEnv(+x.currentTarget.value)}>{e.adresses.map((a, i) => <option key={i} value={i}>{a.nom}</option>)}</select>}
            <span class="petit doux espace" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{adr ? adr.url : 'Pas d\'adresse'}{e && !e.route && adr ? ' (adresse de l\'écran inconnue : relie-le dans Avancement des écrans)' : ''}</span>
            <button class="bouton icone" title="Recharger" disabled={!adr} onClick={() => setCle(cle + 1)}><RefreshCw size={14} /></button>
            <button class="bouton icone" title="Ouvrir dans le navigateur" disabled={!adr} onClick={() => ouvrirLien(adr.url)}><ExternalLink size={14} /></button>
          </div>
          {adr ? <iframe key={`${adr.url}-${cle}`} class="direct-cadre" title={`Application : ${e.nom}`} src={adr.url} />
            : <div class="direct-vide"><MonitorPlay size={36} /><span class="doux">L'application de cet écran n'a pas d'adresse.</span></div>}
          <span class="petit doux">Si l'application refuse de s'afficher ici (protection contre l'affichage dans un cadre), ouvre-la dans le navigateur : le panneau de droite reste utilisable.</span>
        </section>
        <aside class="direct-panneau" ref={panneau}>
          {e && <>
            <div class="pile" style="gap:2px"><strong>{e.nom}</strong><span class="petit doux">{e.id} · {e.etat_libelle}{e.livre_dans ? ` en ${e.livre_dans}` : ''}</span></div>
            <div class="onglets">
              {[['spec', 'Spec', FileText], ['maquette', 'Maquette', Frame], ['guide', 'Guide', BookOpen], ['ecarts', `Écarts${ouverts ? ` (${ouverts})` : ''}`, ListChecks]].map(([k, l, I]) => (
                <button key={k} class={`onglet ${onglet === k ? 'actif' : ''}`} onClick={() => setOnglet(k)}><I size={13} /> {l}</button>
              ))}
            </div>
            {onglet === 'spec' && <div class="pile" style="gap:8px">
              <div class="direct-texte">{e.spec}</div>
              <button class="bouton" style="align-self:flex-start" onClick={() => aller?.('ecrans')}>Ouvrir la fiche de l'écran</button>
            </div>}
            {onglet === 'maquette' && (e.maquette
              ? <div class="pile" style="gap:6px"><span class="petit doux">{e.maquette.titre} · {e.maquette.validee ? 'validée, référence' : 'non validée'}</span><Rendu projet={projet} m={{ id: e.maquette.id, titre: e.maquette.titre, support: 'desktop' }} largeurCadre={largeur} /></div>
              : <span class="doux">Pas de maquette pour cet écran.</span>)}
            {onglet === 'guide' && (e.rubriques.length === 0 ? <span class="doux">Aucune rubrique du guide utilisateur ne parle de cet écran.</span>
              : e.rubriques.map((r) => (
                <div key={r.id} class="pile" style="gap:4px">
                  <strong>{r.titre}</strong>
                  {r.a_mettre_a_jour.length > 0 && <span class="badge b-ambre" style="align-self:flex-start">À mettre à jour</span>}
                  {r.texte ? <Markdown texte={r.texte} classe="direct-guide" /> : <span class="doux">Pas encore rédigée.</span>}
                </div>
              )))}
            {onglet === 'ecarts' && <div class="pile" style="gap:12px">
              <Capture capture={capture} setCapture={setCapture} />
              <BoutonRevue projet={projet} cible={{ type: 'ecran_reel', id: e.id }} titre={e.nom} libelle="Critique UX de l'écran réel" desactive={!capture} capturer={async () => capture} />
              <Releve projet={projet} e={e} environnement={adr?.nom || ''} url={adr?.url || ''} capture={capture} recevoir={(r) => setD({ ...d, ecrans: r.ecrans, ecarts_ouverts: r.ecarts_ouverts })} />
              {e.ecarts.length > 0 && <div class="pile" style="gap:6px">
                <span class="petit doux" style="font-weight:600">Écarts relevés</span>
                {e.ecarts.map((x) => (
                  <div key={x.id} class="ligne" style="flex-wrap:nowrap;gap:8px">
                    <span class="espace petit"><strong>{x.id}</strong> {x.titre}</span>
                    <select class="saisie" value={x.statut} onChange={async (s) => { try { setD(await appel(`/projets/${projet.id}/direct/ecarts/${x.id}`, { corps: { statut: s.currentTarget.value } })); } catch (err) { setErreur(err.message); } }}>
                      {Object.entries(d.statuts).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </div>
                ))}
              </div>}
            </div>}
          </>}
        </aside>
      </div>
    </>
  );
}
