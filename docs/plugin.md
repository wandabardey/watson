# Plugin Watson

Relie Claude au référentiel métier d'un projet : la source de vérité des entités, statuts, transitions, règles, acteurs, cas d'usage et écrans.

## Ce que l'on peut demander

- « Ouvre le projet fret et dis-moi où on en est »
- « Que se passe-t-il si le document douanier est refusé ? »
- « Montre-moi le workflow de l'expédition »
- « Comble les trous de l'entité Expédition » / « Prépare les questions pour l'atelier client »
- « Intègre ce compte rendu dans le référentiel »
- « La règle d'annulation change : … » / « Qu'est-ce qui bouge si on modifie RG-002 ? »
- « Génère la spec »

## Contenu

| Élément | Rôle |
| --- | --- |
| Serveur MCP `watson` | Lit et écrit la base, calcule les trous, l'impact, versions, évolutions, correspondance code et spec, tests. 26 outils. |
| Skill `referentiel` | Socle : trouver le projet, répondre en citant les règles, écrire seulement après accord. |
| Skill `combler-trous` | Session de questions guidées, une à la fois, avec la liste pour l'atelier client. |
| Skill `importer-compte-rendu` | Transforme un CR en règles proposées, corrections, conflits et questions, revus ligne à ligne. |
| Skill `modifier-regle` | Ajout ou correction de règle avec analyse d'impact et questions manquantes. |

## Prérequis

- `python3` (version 3.9 ou plus) disponible sur l'ordinateur. Aucune bibliothèque à installer : tout est embarqué.
  Sur Mac, si `python3` manque, macOS propose d'installer les outils de développement à la première utilisation.
- Un dossier de projet accessible par Claude (dans Cowork, connecter le dossier à la conversation).

## Sécurité

Le serveur ne lit et n'écrit que dans le dossier du projet indiqué. Aucune donnée ne sort de l'ordinateur. Rien n'est écrit sans accord explicite dans la conversation, et rien n'est écrit si la structure est invalide.
