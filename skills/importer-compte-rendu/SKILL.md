---
name: importer-compte-rendu
description: Transforme un compte rendu de réunion, des notes d'atelier ou une transcription en propositions pour le référentiel métier (nouvelles règles, corrections, confirmations, conflits) et en questions à valider. Utiliser quand l'utilisateur dépose ou colle un CR, des notes ou un transcript et dit « intègre ce CR », « qu'est-ce que ça change dans le référentiel ? », « extrais les règles de cette réunion », « mets à jour la base avec l'atelier ».
---

# Importer un compte rendu

Objectif : ne rien perdre de ce qui a été décidé en réunion, sans faire entrer dans la base une règle que personne n'a validée. Tout passe par une revue ligne à ligne avec l'utilisateur.

Suivre d'abord les règles du skill `referentiel` (trouver le projet, aucune écriture sans accord).

## 1. Lire et situer

1. Lire le compte rendu en entier. Noter sa date, son titre ou objet, et les participants s'ils figurent : ils servent de `source` (« CR atelier transport du 2026-10-02 »).
2. `etat_projet`, `lister_elements`, puis `rechercher` les termes métier du CR pour retrouver les éléments existants concernés. Lire (`lire_element`) chaque règle potentiellement touchée.

## 2. Extraire

Relever chaque passage qui concerne le métier et le classer :

| Catégorie | Signal dans le CR | Ce qu'on proposera |
| --- | --- | --- |
| Nouvelle règle | une condition, une obligation, un droit, un calcul non présent dans la base | règle `proposee` (ou `validee` si le CR acte une décision et que l'utilisateur le confirme) |
| Correction | contredit ou modifie une règle existante | `remplacer_regle` si changement de fond, reformulation sinon |
| Confirmation | valide une règle `proposee` | passage en `validee` avec la source |
| Nouvel élément | nouveau statut, transition, acteur, écran, cas d'usage | élément à créer |
| Conflit | deux passages du CR se contredisent, ou le CR contredit une règle validée sans le dire | question à trancher, rien n'est écrit |
| Question ouverte | point laissé en suspens, « à confirmer », « on revient vers vous » | question à valider |

Ne pas extraire ce qui n'est pas métier (logistique de projet, planning) sauf demande. Ne rien inventer : chaque proposition s'appuie sur une citation courte du CR.

## 3. Revue avec l'utilisateur

Présenter un tableau numéroté : n°, catégorie, proposition en une phrase, élément touché (son nom métier, ou « nouveau »), citation du CR. Pas de code d'élément dans le tableau (voir « Parler métier, pas codes » dans le skill `referentiel`). Pour chaque correction, appeler `analyser_impact` et résumer l'impact en une ligne (actions, écrans, captures à revoir, par leur nom).

Mettre en tête les conflits et les corrections de règles validées : ce sont les points à risque.

Demander à l'utilisateur ce qu'il retient (AskUserQuestion avec choix multiples si disponible, sinon par numéros) : tout, une sélection, ou rien. Les lignes non retenues ne sont pas écrites ; proposer de les garder comme questions.

## 4. Écrire

Pour chaque ligne retenue, dans l'ordre : nouveaux acteurs et statuts d'abord, puis transitions, puis règles, puis cas d'usage et écrans (les références doivent exister avant d'être citées).

- Renseigner `source` avec la référence du CR et `raison` avec la citation ou le résumé de la décision.
- Numéroter les nouveaux éléments à la suite des existants.
- Après chaque écriture, noter les trous apparus : ils alimentent la liste de questions.

## 5. Restituer

Conclure par :

1. ce qui a été intégré (nombre par catégorie, et les règles créées ou modifiées, par leur nom) ;
2. les questions à valider : questions ouvertes du CR, conflits, et nouveaux trous, formulées pour être envoyées telles quelles au client ou à l'équipe ;
3. les captures de documentation à revoir s'il y en a.

Proposer ensuite `combler-trous` sur les nouveaux trous, ou `generer_spec`.
