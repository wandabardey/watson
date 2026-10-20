---
name: modifier-regle
description: Ajoute, corrige, remplace ou rend obsolète une règle métier dans le référentiel, avec analyse d'impact et questions manquantes avant d'écrire. Utiliser quand l'utilisateur dit « ajoute une règle », « nouvelle règle : … », « la règle X change », « on a décidé que… », « corrige la règle », « cette règle n'est plus valable », « qu'est-ce qui bouge si on change… ».
---

# Ajouter ou corriger une règle

Suivre d'abord les règles du skill `referentiel` (trouver le projet, aucune écriture sans accord).

## 1. Comprendre la demande

1. Reformuler la règle en une phrase métier et identifier l'entité concernée.
2. `rechercher` les règles proches : la demande est-elle nouvelle, une correction d'une règle existante, ou un doublon ? En cas de doublon ou de contradiction avec une règle validée, le dire avant toute chose.

## 2. Mesurer l'impact (règle existante)

Appeler `analyser_impact` sur la règle (et sur les actions ou étapes touchées). Présenter en quelques lignes, avec les noms métier renvoyés par l'outil : actions et étapes concernées, parcours, écrans, captures de documentation à revoir. Signaler aussi que le code qui applique cette règle devra être revu par l'équipe de développement (le code de la règle n'est utile qu'à elle : le donner seulement si l'utilisateur le demande).

## 3. Compléter avant d'écrire

Vérifier que la règle est complète. Poser une question à la fois, seulement pour ce qui manque :

- **Quand** : à quel moment du cycle de vie (quelle action, depuis quelle étape) ?
- **Conditions** : sur quelles informations ? Si plusieurs conditions se croisent, proposer une table de décision et vérifier que chaque condition est une information de l'entité à valeurs fixes (attribut `enum` ou `booleen`), sinon proposer de l'ajouter.
- **Cas contraire** : que se passe-t-il quand la condition n'est pas remplie (blocage, message, autre action) ?
- **Exceptions** : un type de client, un acteur, une période échappent-ils à la règle ?
- **Qui** : quels acteurs sont concernés ou autorisés ?
- **Source** : qui a décidé, où et quand ? Sans source, la règle reste `proposee`.

## Pour quelle version ?

Avant d'écrire, demander pour quelle version de la spec est le changement : la prochaine (par exemple 1.6), une
suivante, ou plus tard. Le faire dans une évolution : `lister_evolutions` pour en reprendre une qui vise déjà
cette version, sinon `creer_evolution` (après accord sur le nom et la cible). Écrire ensuite avec le paramètre
`evolution`. Une correction mineure sans enjeu de version peut aller directement dans la version de travail, si
la personne le dit.

## 4. Choisir le bon geste

| Situation | Outil |
| --- | --- |
| Nouvelle règle | `enregistrer_element` (type `regle`), puis rattacher la règle à sa transition en enregistrant l'entité mise à jour |
| Reformulation sans changement de sens, ajout d'une source, ligne ajoutée à une table incomplète | `enregistrer_element` sur le même identifiant (l'historique est complété) |
| Changement de fond d'une règle validée | `remplacer_regle` : nouvel identifiant, l'ancienne devient obsolète avec son historique, les transitions sont rattachées à la nouvelle |
| Règle abandonnée sans remplaçante | `enregistrer_element` avec `statut: obsolete` et une `raison`, puis traiter les transitions qui la citaient |
| Confirmation d'une règle proposée | `enregistrer_element` : `statut: validee` et `source` renseignée |

Présenter le geste choisi en phrases métier (sans code ni YAML, sauf demande), attendre le oui, puis écrire.

## 5. Rendre compte

Donner le bilan en mots métier : ce qui est réglé, ce qui reste à préciser avec la question à poser. Si des trous sont apparus, proposer de les traiter tout de suite (skill `combler-trous`). Rappeler les captures de documentation à revoir s'il y en a.

## 6. Tests

Quand une règle vient d'être validée (ou remplacée), appeler `proposer_tests` avec son identifiant et présenter les cas en mots métier : chemin normal, droits, règle non respectée, une situation par ligne de table, non-régression de l'ancienne règle. Signaler ce que chaque cas laisse « à préciser » (données, message affiché) au lieu de l'inventer. N'enregistrer avec `enregistrer_tests` que les cas que la personne garde, après son oui. Après un changement de fond, appeler `cas_a_revoir` et lister les cas existants touchés.
