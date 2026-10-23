// Spécifications Confluence : Watson écrit les pages DESIGN du projet (méthode 4SH de 4ward) à partir de la base, sur le
// modèle des pages déjà présentes dans l'espace, et les publie après confirmation. Rien n'est écrit dans Confluence sans
// la fenêtre de confirmation, qui dit ce qui sera créé et ce qui sera remplacé.
import { useEffect, useState } from 'preact/hooks';
import { Check, ExternalLink, Eye, FileText, LogOut, RefreshCw, Search, Send, Sparkles, TriangleAlert, X } from 'lucide-preact';
import { appel, ouvrirLien } from '../api.js';
import { Attente, ConnexionClaude, Entete, Watson } from './commun.jsx';

const ETATS = { nouvelle: ['Nouvelle', 'b-indigo'], existante: ['Existe déjà, écrite à la main', 'b-ambre'], a_mettre_a_jour: ['À mettre à jour', 'b-ambre'], a_jour: ['Publiée, à jour', 'b-vert'] };

function Connexion({ recevoir }) {
  const [f, setF] = useState({ site: '', email: '', jeton: '' });
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const go = async () => { setOccupe(true); setMsg(null); try { await appel('/confluence', { corps: f }); recevoir(); } catch (e) { setMsg(e.message); } finally { setOccupe(false); } };
  return (
    <div class="carte pile" style="gap:10px;max-width:640px">
      <strong>Connecter Watson à Confluence</strong>
      <span class="doux petit">Avec ton e-mail et un jeton d'API Atlassian. Le jeton reste dans le trousseau de ce poste, jamais dans un fichier ni dans le dépôt.</span>
      {msg && <p class="encart e-rouge">{msg}</p>}
      <label class="champ">Site<input placeholder="4sh.atlassian.net" value={f.site} onInput={(e) => setF({ ...f, site: e.target.value })} /></label>
      <label class="champ">E-mail<input value={f.email} onInput={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label class="champ">Jeton d'API<input type="password" value={f.jeton} onInput={(e) => setF({ ...f, jeton: e.target.value })} /></label>
      <div class="ligne"><button class="bouton principal-b" disabled={occupe || !f.site || !f.email || !f.jeton} onClick={go}><Check size={15} /> Connecter</button>
        <button class="lien petit" onClick={() => ouvrirLien('https://id.atlassian.com/manage-profile/security/api-tokens')}>Créer un jeton d'API <ExternalLink size={12} /></button></div>
    </div>
  );
}

function Configuration({ d, base, recevoir, setMessage }) {
  const [espaces, setEspaces] = useState(null);
  const [f, setF] = useState({ espace: d.config.espace?.cle || '', racine_titre: d.config.racine?.titre || 'DESIGN', style: d.config.style || 'regles' });
  const [ouvert, setOuvert] = useState(!d.config.racine);
  useEffect(() => { if (ouvert && !espaces) appel('/confluence/espaces').then((r) => setEspaces(r.espaces)).catch((e) => setMessage(e.message)); }, [ouvert]);
  if (!ouvert) {
    return (
      <div class="carte ligne" style="gap:12px">
        <FileText size={18} color="#4F46E5" />
        <span class="pile espace" style="gap:2px"><strong>{d.config.espace.nom} · page racine « {d.config.racine.titre} »</strong>
          <span class="doux petit">Style des écrans : {d.styles[d.config.style]}. {d.analyse.date ? `Espace analysé le ${d.analyse.date} : ${d.analyse.pages} pages, modèles : ${Object.values(d.analyse.modeles).join(', ') || 'aucun'}.` : 'Espace pas encore analysé.'}</span></span>
        <button class="bouton" onClick={() => setOuvert(true)}>Changer</button>
      </div>
    );
  }
  return (
    <div class="carte pile" style="gap:10px">
      <strong>Où vont les spécifications</strong>
      <div class="ligne" style="gap:10px;align-items:flex-end">
        <label class="champ" style="min-width:260px">Espace<select value={f.espace} onChange={(e) => setF({ ...f, espace: e.target.value })}><option value="">{espaces ? 'Choisir un espace' : 'Chargement…'}</option>{(espaces || []).map((s) => <option key={s.cle} value={s.cle}>{s.nom} ({s.cle})</option>)}</select></label>
        <label class="champ" style="width:220px">Page racine<input value={f.racine_titre} onInput={(e) => setF({ ...f, racine_titre: e.target.value })} /></label>
        <label class="champ" style="width:260px">Style des écrans<select value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })}>{Object.entries(d.styles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button class="bouton principal-b" disabled={!f.espace} onClick={async () => { try { recevoir(await appel(`${base}/configurer`, { corps: f })); recevoir(await appel(`${base}/analyser`, { corps: {} })); setOuvert(false); } catch (e) { setMessage(e.message); } }}><Check size={15} /> Valider et analyser</button>
      </div>
      <span class="doux petit">Watson lit les pages sous la racine pour reprendre leur convention de titre et une page modèle par type (le style des écrans est déduit du modèle quand il existe).</span>
    </div>
  );
}

function Apercu({ base, cle, fermer, recharger }) {
  const [b, setB] = useState(null);
  const [edition, setEdition] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { appel(`${base}/brouillon`, { corps: { cle } }).then(setB).catch((e) => setMsg(e.message)); }, [cle]);
  const doc = b ? `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 -apple-system,Arial,sans-serif;color:#172B4D;padding:16px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #DFE1E6;padding:6px 8px;text-align:left;vertical-align:top}th{background:#F4F5F7}.macro{border:1px dashed #8777D9;border-radius:6px;padding:8px;margin:8px 0}.macro>span{display:block;font-size:11px;color:#6554C0;margin-bottom:4px}.lien-page{color:#0052CC;text-decoration:underline}</style>${b.apercu}` : '';
  return (
    <div class="specs-apercu carte pile">
      <div class="ligne"><strong class="espace">{b?.titre || 'Aperçu'}</strong>
        {b && <button class="bouton" onClick={() => setEdition(edition === null ? b.storage : null)}>{edition === null ? 'Modifier le format Confluence' : 'Voir l\'aperçu'}</button>}
        <button class="bouton icone" aria-label="Fermer" onClick={fermer}><X size={15} /></button></div>
      {msg && <p class="encart e-rouge">{msg}</p>}
      {b?.alertes?.length > 0 && b.alertes.map((a, i) => <p key={i} class="encart e-orange petit"><TriangleAlert size={14} /> {a}</p>)}
      {b?.hypotheses?.length > 0 && <div class="encart e-indigo petit"><b>À confirmer :</b> {b.hypotheses.join(' · ')}</div>}
      {b && (edition === null ? <iframe class="specs-cadre" sandbox="" srcdoc={doc} title="Aperçu de la page" />
        : <><textarea class="saisie specs-source" value={edition} onInput={(e) => setEdition(e.target.value)} />
          <button class="bouton principal-b" style="align-self:flex-start" onClick={async () => { try { const r = await appel(`${base}/brouillon`, { corps: { cle, storage: edition } }); setB(r); setEdition(null); recharger(); } catch (e) { setMsg(e.message); } }}><Check size={15} /> Enregistrer le brouillon</button></>)}
    </div>
  );
}

export function Specifications({ projet, etat }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [choix, setChoix] = useState(new Set());
  const [voir, setVoir] = useState(null);
  const [confirmer, setConfirmer] = useState(false);
  const [publiees, setPubliees] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [claude, setClaude] = useState(etat.claude);
  const base = `/projets/${projet.id}/specifications`;
  const charger = () => appel(base).then(setD).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => { if (!d?.lot?.en_cours) return undefined; const t = setTimeout(charger, 2000); return () => clearTimeout(t); }, [d]);
  if (!d) return <Attente erreur={erreur} />;
  const entete = <Entete titre="Spécifications Confluence" description="Watson écrit les pages de spécification du projet (méthode DESIGN de 4SH) à partir de la base, comme les pages déjà présentes dans l'espace Confluence du projet. Tu relis, puis tu publies : rien n'est écrit dans Confluence sans ta confirmation." />;
  if (!d.connexion.connecte) return <>{entete}<Connexion recevoir={charger} /></>;
  const lignes = d.plan;
  const choisies = lignes.filter((x) => choix.has(x.cle));
  const basculer = (cle) => { const n = new Set(choix); if (n.has(cle)) n.delete(cle); else n.add(cle); setChoix(n); };
  const groupes = Object.keys(d.types).map((t) => [t, lignes.filter((x) => x.type === t)]).filter(([, l]) => l.length);
  const pretes = choisies.filter((x) => x.brouillon && !x.brouillon.alertes.some((a) => a.startsWith('Format')));
  const ecrasees = pretes.filter((x) => x.etat === 'existante');
  const faire = async (f) => { setOccupe(true); setMessage(null); try { const r = await f(); setD(r); return r; } catch (e) { setMessage(e.message); return null; } finally { setOccupe(false); } };
  return (
    <>
      {entete}
      <ConnexionClaude claude={claude} setClaude={setClaude} usage="La rédaction des spécifications" />
      {message && <p class="encart e-rouge">{message}</p>}
      <div class="ligne petit doux"><span>Connecté à {d.connexion.site} ({d.connexion.email})</span>
        <button class="lien petit" onClick={async () => { await appel('/confluence', { methode: 'DELETE' }); charger(); }}><LogOut size={12} /> Se déconnecter</button></div>
      <Configuration d={d} base={base} recevoir={setD} setMessage={setMessage} />
      {d.config.racine && (
        <>
          <div class="ligne" style="gap:8px">
            <span class="doux espace">{d.compte.nouvelle} nouvelles · {d.compte.existante} déjà dans l'espace · {d.compte.a_mettre_a_jour} à mettre à jour · {d.compte.a_jour} à jour</span>
            <button class="bouton" disabled={occupe} onClick={() => faire(() => appel(`${base}/analyser`, { corps: {} }))}><Search size={15} /> Analyser l'espace</button>
            <button class="bouton" onClick={() => setChoix(new Set(lignes.filter((x) => ['nouvelle', 'a_mettre_a_jour'].includes(x.etat)).map((x) => x.cle)))}>Sélectionner le reste à faire</button>
            <button class="bouton bouton-watson" disabled={!claude?.connecte || !choisies.length || d.lot?.en_cours} onClick={() => faire(() => appel(`${base}/rediger`, { corps: { cles: choisies.map((x) => x.cle) } }))}><Sparkles size={15} /> Rédiger {choisies.length || ''} page{choisies.length > 1 ? 's' : ''}</button>
            <button class="bouton principal-b" disabled={!pretes.length || d.lot?.en_cours} onClick={() => setConfirmer(true)}><Send size={15} /> Publier {pretes.length || ''}</button>
          </div>
          {d.lot?.en_cours && (
            <div class="carte ligne" style="gap:14px;flex-wrap:nowrap"><Watson humeur="ecrit" hauteur={70} flotte={false} />
              <div class="pile espace" style="gap:6px"><strong>Watson rédige les pages : {d.lot.faits} sur {d.lot.total}</strong>
                <span class="travail-barre"><i class="ecrit" style={`position:static;display:block;width:${Math.max(4, (d.lot.faits / d.lot.total) * 100)}%;animation:none`} /></span>
                <span class="doux petit">En cours : {lignes.find((x) => x.cle === d.lot.courante)?.titre || '…'}. Tu peux changer d'écran, la rédaction continue.</span></div></div>
          )}
          {d.lot?.erreurs?.length > 0 && !d.lot.en_cours && <p class="encart e-orange petit">Pages non rédigées : {d.lot.erreurs.join(' · ')}</p>}
          {publiees && <div class="encart e-vert pile" style="gap:4px"><strong>Publié dans Confluence</strong>{publiees.map((p) => <button key={p.url} class="lien petit" style="align-self:flex-start" onClick={() => ouvrirLien(p.url)}>{p.titre} ({p.action}) <ExternalLink size={12} /></button>)}</div>}
          <div class={`specs ${voir ? 'avec-apercu' : ''}`}>
            <div class="pile" style="gap:12px">
              {groupes.map(([t, l]) => (
                <div key={t} class="carte" style="padding:0;overflow:hidden">
                  <table class="tableau">
                    <thead><tr><th style="width:34px"><input type="checkbox" checked={l.every((x) => choix.has(x.cle))} onChange={(e) => { const n = new Set(choix); l.forEach((x) => (e.target.checked ? n.add(x.cle) : n.delete(x.cle))); setChoix(n); }} /></th>
                      <th>{d.types[t]} ({l.length})</th><th>Dans Confluence</th><th>Brouillon</th><th /></tr></thead>
                    <tbody>{l.map((x) => (
                      <tr key={x.cle} class={voir === x.cle ? 'choisi' : ''}>
                        <td><input type="checkbox" checked={choix.has(x.cle)} onChange={() => basculer(x.cle)} /></td>
                        <td>{x.titre}</td>
                        <td><span class={`badge ${ETATS[x.etat][1]}`}>{ETATS[x.etat][0]}</span></td>
                        <td class="petit">{x.brouillon ? <>{x.brouillon.date}{!x.brouillon.a_jour && <span class="doux"> · la base a bougé depuis</span>}{x.brouillon.alertes.length > 0 && <span style="color:#B45309"> · {x.brouillon.alertes.length} alerte{x.brouillon.alertes.length > 1 ? 's' : ''}</span>}</> : <span class="doux">aucun</span>}</td>
                        <td>{x.brouillon && <button class="bouton icone" title="Aperçu" onClick={() => setVoir(x.cle)}><Eye size={15} /></button>}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              ))}
            </div>
            {voir && <Apercu base={base} cle={voir} fermer={() => setVoir(null)} recharger={charger} />}
          </div>
        </>
      )}
      {confirmer && (
        <div class="visionneuse" onClick={() => setConfirmer(false)}>
          <div class="carte pile" style="gap:12px;max-width:560px;width:100%" onClick={(e) => e.stopPropagation()}>
            <strong>Publier dans Confluence ?</strong>
            <span>Espace <b>{d.config.espace.nom}</b>, sous « {d.config.racine.titre} » : {pretes.filter((x) => !x.page_id).length} page{pretes.filter((x) => !x.page_id).length > 1 ? 's' : ''} créée{pretes.filter((x) => !x.page_id).length > 1 ? 's' : ''}, {pretes.filter((x) => x.page_id).length} mise{pretes.filter((x) => x.page_id).length > 1 ? 's' : ''} à jour.</span>
            {ecrasees.length > 0 && <p class="encart e-orange petit"><TriangleAlert size={14} /> {ecrasees.length} page{ecrasees.length > 1 ? 's' : ''} déjà écrite{ecrasees.length > 1 ? 's' : ''} à la main ser{ecrasees.length > 1 ? 'ont' : 'a'} remplacée{ecrasees.length > 1 ? 's' : ''} (l'historique de Confluence garde l'ancienne version) : {ecrasees.map((x) => x.titre).join(', ')}.</p>}
            {choisies.length > pretes.length && <span class="doux petit">{choisies.length - pretes.length} page{choisies.length - pretes.length > 1 ? 's' : ''} sélectionnée{choisies.length - pretes.length > 1 ? 's' : ''} sans brouillon valide ne ser{choisies.length - pretes.length > 1 ? 'ont' : 'a'} pas publiée{choisies.length - pretes.length > 1 ? 's' : ''}.</span>}
            <div class="ligne"><button class="bouton principal-b" disabled={occupe} onClick={async () => { const r = await faire(() => appel(`${base}/publier`, { corps: { cles: pretes.map((x) => x.cle), confirme: true } })); setConfirmer(false); if (r) { setPubliees(r.publiees); setChoix(new Set()); } }}><Send size={15} /> Publier</button>
              <button class="bouton" onClick={() => setConfirmer(false)}>Annuler</button></div>
          </div>
        </div>
      )}
    </>
  );
}
