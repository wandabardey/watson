import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, BookOpen, Check, LogOut, RefreshCw, Sparkles } from 'lucide-preact';
import { appel, verifierMiseAJour } from '../api.js';
import { ConnexionClaude } from './commun.jsx';

function Section({ titre, description, children }) {
  return (
    <section class="carte pile" style="gap:14px">
      <div class="pile" style="gap:4px"><h2>{titre}</h2>{description && <p class="doux">{description}</p>}</div>
      {children}
    </section>
  );
}

export function Parametres({ etat, retour, deconnecte, signalerMaj }) {
  const [r, setR] = useState(null);
  const [autre, setAutre] = useState('');
  const [test, setTest] = useState(null);
  const [message, setMessage] = useState(null);
  const [claude, setClaude] = useState(etat.claude);
  const [maj, setMaj] = useState(undefined);
  const [dossier, setDossier] = useState('');
  useEffect(() => { appel('/reglages').then((x) => { setR(x); if (!x.modeles.some((m) => m.id === x.modele)) setAutre(x.modele); }); }, []);
  const changer = async (c) => {
    setMessage(null); setTest(null);
    try { setR(await appel('/reglages', { corps: c })); } catch (e) { setMessage(e.message); }
  };
  const tester = async () => {
    setTest({ attente: true });
    try { setTest(await appel('/reglages/tester', { corps: {} })); } catch (e) { setTest({ erreur: e.message }); }
  };
  const deconnecter = async () => { await appel('/github/deconnexion', { corps: {} }); deconnecte(); };
  if (!r) return <p class="chargement">Chargement…</p>;
  const connu = r.modeles.some((m) => m.id === r.modele);
  return (
    <div class="panneau principal" style="max-width:860px;margin:0 auto;width:100%">
      <button class="bouton" style="align-self:flex-start" onClick={retour}><ArrowLeft size={16} /> Retour</button>
      <div class="pile" style="gap:4px"><h1>Paramètres</h1><p class="doux">Ces réglages valent pour ce poste.</p></div>

      <Section titre="Claude" description="Le modèle et le niveau de réflexion utilisés pour répondre aux questions et lire les documents.">
        <ConnexionClaude claude={claude} setClaude={setClaude} usage="Watson" />
        {r.impose_par_variable && <p class="encart e-orange">Une variable d'environnement impose le modèle sur ce poste : les choix ci-dessous ne s'appliquent pas.</p>}
        <div class="pile" style="gap:8px">
          <strong>Modèle</strong>
          {r.modeles.map((m) => (
            <button key={m.id} class={`choix ${r.modele === m.id ? 'actif' : ''}`} onClick={() => changer({ modele: m.id })}>
              <span class="pastille">{r.modele === m.id && <Check size={13} />}</span>
              <span class="pile" style="gap:2px"><strong>{m.nom}{m.id === 'claude-opus-5-5' && <span class="badge b-indigo" style="margin-left:8px">recommandé</span>}</strong><span class="doux petit">{m.description}</span></span>
            </button>
          ))}
          <div class={`choix ${!connu ? 'actif' : ''}`} style="cursor:default">
            <span class="pastille">{!connu && <Check size={13} />}</span>
            <span class="pile espace" style="gap:6px"><strong>Autre modèle</strong>
              <span class="ligne"><input class="saisie espace" placeholder="Identifiant, par exemple claude-opus-5-5" value={autre} onInput={(e) => setAutre(e.target.value)} />
                <button class="bouton" disabled={!autre.trim()} onClick={() => changer({ modele: autre.trim() })}>Utiliser</button></span></span>
          </div>
        </div>
        <div class="pile" style="gap:8px">
          <strong>Niveau de réflexion</strong>
          <div class="segments" style="align-self:flex-start">
            {r.efforts.map((e) => <button key={e.id} class={`segment ${r.effort === e.id ? 'actif' : ''}`} onClick={() => changer({ effort: e.id })}>{e.nom}</button>)}
          </div>
          <span class="doux petit">{r.efforts.find((e) => e.id === r.effort)?.description} Plus Claude réfléchit, plus la réponse est longue à venir.</span>
        </div>
        {message && <p class="encart e-rouge">{message}</p>}
        <div class="ligne">
          <button class="bouton" disabled={test?.attente || !claude?.connecte} onClick={tester}><Sparkles size={15} /> Tester ces réglages</button>
          {test?.attente && <span class="doux">Échange avec Claude…</span>}
          {test?.modele && <span class="badge b-vert">{test.modele} a répondu en {test.duree_s} s</span>}
          {test?.erreur && <span class="encart e-rouge">{test.erreur}</span>}
        </div>
      </Section>

 <Section titre="Méthode 4ward" description="Quand le studio 4ward de 4SH est installé sur ce poste, Watson en suit les compétences à chaque appel à Claude : cadrage, direction artistique, maquettes, deck commercial. Rien de 4ward n'est copié dans Watson ni dans les dépôts.">
        {r.methode.trouve
          ? <div class="ligne"><BookOpen size={18} color="#4F46E5" /><span class="pile espace" style="gap:2px"><strong>4ward {r.methode.version} {r.methode.choisi ? '(dossier choisi)' : '(trouvé automatiquement)'}</strong><span class="doux petit tronque">{r.methode.chemin}</span></span>
              {r.methode.choisi && <button class="bouton" onClick={() => changer({ dossier_4ward: '' })}>Détection automatique</button>}</div>
          : <p class="encart e-orange">{r.methode.choisi_introuvable ? 'Le dossier choisi ne contient plus 4ward.' : '4ward n\'a pas été trouvé sur ce poste.'} Watson applique ses consignes de base. Installe 4ward dans Claude, ou indique son dossier ci-dessous.</p>}
        <span class="ligne"><input class="saisie espace" placeholder="Dossier du plugin 4ward (celui qui contient « skills »)" value={dossier} onInput={(e) => setDossier(e.target.value)} />
          <button class="bouton" disabled={!dossier.trim()} onClick={() => changer({ dossier_4ward: dossier.trim() })}>Utiliser ce dossier</button></span>
      </Section>

      <Section titre="GitHub" description="Les dépôts de connaissance sont lus et enregistrés avec ce compte.">
        <div class="ligne">
          {etat.github.compte?.avatar && <img class="avatar" src={etat.github.compte.avatar} alt="" />}
          <span class="pile espace" style="gap:0"><strong>{etat.github.compte?.nom}</strong><span class="doux petit">@{etat.github.compte?.login}</span></span>
          <button class="bouton" onClick={deconnecter}><LogOut size={15} /> Se déconnecter</button>
        </div>
      </Section>

      <Section titre="Watson">
        <div class="ligne">
          <span class="espace">Version {etat.version}</span>
          {maj === undefined && <button class="bouton" onClick={async () => { const m = await verifierMiseAJour(); setMaj(m); if (m) signalerMaj(m); }}><RefreshCw size={15} /> Vérifier les mises à jour</button>}
          {maj === null && <span class="badge b-vert">À jour</span>}
          {maj && <span class="badge b-indigo">Watson {maj.version} disponible : l'installer depuis le bandeau ci-dessus</span>}
        </div>
        <span class="doux petit">Copies de travail des projets : {etat.donnees}. Elles peuvent être supprimées sans rien perdre d'enregistré sur GitHub.</span>
      </Section>
    </div>
  );
}
