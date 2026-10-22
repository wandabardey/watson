// Accueil du projet : tout au même endroit. Watson dit où en est le projet, on lui pose une question, on lui donne
// des documents, et on voit l'avancement, les questions ouvertes et les derniers changements.
import { useEffect, useRef } from 'preact/hooks';
import { ArrowRight, Check, CircleHelp, ExternalLink, FileText, Frame, Palette, Presentation } from 'lucide-preact';
import { ouvrirLien } from '../api.js';
import { Alimenter } from './alimenter.jsx';
import { Attente, GRAVITE, useVue, Watson } from './commun.jsx';
import { Demander } from './demander.jsx';

const prenom = (nom) => (nom || '').split(/\s+/)[0] || '';

function Etape({ icone: I, titre, etat, fait, aller, cible }) {
  return (
    <button class={`etape-avant ${fait ? 'faite' : ''}`} onClick={() => aller(cible)}>
      <span class="etape-avant-icone">{fait ? <Check size={16} /> : <I size={16} />}</span>
      <span class="pile" style="gap:1px;text-align:left;min-width:0"><strong>{titre}</strong><span class="petit doux tronque">{etat}</span></span>
    </button>
  );
}

export function AccueilProjet({ projet, etat, aller, questionInitiale, zone }) {
  const { donnees: d, erreur } = useVue(`/projets/${projet.id}/synthese`);
  const alimenter = useRef(null);
  useEffect(() => { if (d && zone === 'alimenter') alimenter.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [d, zone]);
  if (!d) return <Attente erreur={erreur} />;
  const ap = d.avant_projet;
  const vide = d.compteurs.entites + d.compteurs.regles + d.compteurs.acteurs === 0;
  const resume = [
    d.questions_ouvertes && `${d.questions_ouvertes} question${d.questions_ouvertes > 1 ? 's' : ''} ouverte${d.questions_ouvertes > 1 ? 's' : ''}`,
    d.points.length && `${d.points.length} point${d.points.length > 1 ? 's' : ''} à vérifier dans la base`,
    d.a_trancher && `${d.a_trancher} élément${d.a_trancher > 1 ? 's' : ''} à trancher`,
  ].filter(Boolean);
  return (
    <div class="accueil-projet pile" style="gap:18px">
      <section class="hero-projet">
        <Watson humeur={vide ? 'note' : 'salue'} hauteur={150} flotte={false} />
        <div class="pile espace" style="gap:6px;min-width:0">
          <span class="petit doux">{projet.nom}</span>
          <h1>{vide ? `Bonjour ${prenom(etat.github.compte?.nom)}, on commence ?` : `Bonjour ${prenom(etat.github.compte?.nom)}, voici où en est le projet.`}</h1>
          <p class="doux">{vide ? 'Le projet est vide. Donne-moi ce qui existe déjà (comptes rendus, notes, captures, spécifications) : je le lis et je t\'en tire une première base, que tu valides.'
            : resume.length ? `${resume.join(', ')}.` : 'Rien d\'ouvert : la base est à jour.'}</p>
          <div class="question-projet"><Demander projet={projet} etat={etat} questionInitiale={questionInitiale} integre /></div>
        </div>
      </section>

      <section class="pile" style="gap:10px">
        <h2>Avant-projet</h2>
        <div class="etapes-avant">
          <Etape icone={FileText} titre="Cahier des charges" cible="cahier" aller={aller} fait={ap.cahier.existe && ap.cahier.remplies >= ap.cahier.total}
            etat={ap.cahier.existe ? `${ap.cahier.remplies} / ${ap.cahier.total} sections · ${ap.cahier.statut}` : 'À rédiger'} />
          <Etape icone={Palette} titre="Moodboard" cible="moodboard" aller={aller} fait={!!ap.moodboard.retenue}
            etat={ap.moodboard.retenue ? `Piste retenue : ${ap.moodboard.retenue}` : ap.moodboard.pistes ? `${ap.moodboard.pistes} piste${ap.moodboard.pistes > 1 ? 's' : ''}, aucune retenue` : 'À proposer'} />
          <Etape icone={Frame} titre="Maquettes" cible="maquettes" aller={aller} fait={ap.maquettes > 0}
            etat={ap.maquettes ? `${ap.maquettes} maquette${ap.maquettes > 1 ? 's' : ''}` : 'À dessiner'} />
          <Etape icone={Presentation} titre="Proposition" cible="proposition" aller={aller} fait={ap.proposition.statut === 'Envoyé au client'}
            etat={ap.proposition.existe ? `${ap.proposition.slides} slides · ${ap.proposition.statut}` : 'À écrire'} />
        </div>
      </section>

      <section class="carte pile" ref={alimenter} style="gap:10px">
        <div class="ligne"><h2 class="espace">Donner des documents à Watson</h2><span class="petit doux">Comptes rendus, transcriptions, notes, captures, spécifications</span></div>
        <Alimenter projet={projet} etat={etat} aller={aller} integre />
      </section>

      <div class="ligne" style="align-items:flex-start;gap:16px">
        <section class="carte pile" style="flex:2 1 460px;gap:10px">
          <div class="ligne"><h2 class="espace">Questions ouvertes</h2><button class="lien petit" onClick={() => aller('sujets')}>Toutes les questions <ArrowRight size={13} /></button></div>
          {d.questions.length === 0 && <p class="doux">Aucune question ouverte.</p>}
          {d.questions.map((q) => (
            <button key={q.id} class="question-ouverte" onClick={() => aller('sujets')}><CircleHelp size={16} color="#B45309" /><span class="pile espace" style="gap:1px;text-align:left"><span>{q.question}</span><span class="petit doux">{q.source}</span></span></button>
          ))}
          <h2 style="margin-top:6px">Ce que la base ne dit pas encore</h2>
          {d.points.length === 0 && <p class="doux">Aucun point ouvert.</p>}
          {d.points.slice(0, 5).map((p, i) => {
            const [titre, classe] = GRAVITE[p.gravite] || ['Point', 'e-indigo'];
            return <div key={i} class={`encart ${classe}`}><span><strong>{titre}.</strong> {p.question || p.message}</span></div>;
          })}
          {d.points.length > 5 && <span class="doux petit">… et {d.points.length - 5} autres.</span>}
        </section>
        <section class="carte pile" style="flex:1 1 300px;gap:10px">
          <div class="tuiles-projet">
            {[['Objets métier', d.compteurs.entites, 'referentiels'], ['Règles', d.compteurs.regles, 'regles'], ['Écrans', d.compteurs.ecrans, 'ecrans'], ['Version figée', d.versions.derniere || 'aucune', 'versions']].map(([t, n, e]) => (
              <button key={t} class="tuile-chiffre" onClick={() => aller(e)}><span class="petit doux">{t}</span><strong>{n}</strong></button>
            ))}
          </div>
          <h2>Derniers changements</h2>
          {d.historique.length === 0 && <p class="doux">Aucun historique.</p>}
          {d.historique.slice(0, 6).map((h, i) => (
            <div key={i} class="pile" style="gap:2px;padding-bottom:8px;border-bottom:1px solid #F4F4F5">
              <span><strong>{h.regle}</strong> : {h.changement}</span>
              <span class="petit doux">{h.date} · {h.auteur}{h.raison ? ` · ${h.raison}` : ''}</span>
            </div>
          ))}
          <button class="bouton" style="align-self:flex-start" onClick={() => ouvrirLien(`https://github.com/${d.depot}`)}><ExternalLink size={14} /> Dépôt GitHub</button>
        </section>
      </div>
    </div>
  );
}
