---
name: combler-trous
description: Session guidée pour compléter les workflows et les règles d'un projet du référentiel métier, en posant une à une les questions manquantes. Utiliser quand l'utilisateur dit « comble les trous », « qu'est-ce qui manque ? », « pose-moi les questions », « aide-moi à compléter le workflow de… », « je veux être exhaustif sur… », « prépare les questions pour l'atelier », ou après un ajout qui a fait apparaître des trous.
---

# Combler les trous

Objectif : faire progresser la complétude d'un projet en transformant chaque trou en décision, sans forcer l'exhaustivité. Le PO choisit ce qu'il comble, ce qu'il assume hors périmètre, et ce qu'il garde pour le client.

Suivre d'abord les règles du skill `referentiel` (trouver le projet, aucune écriture sans accord).

## 1. Cadrer la session

1. `etat_projet` puis `lister_trous` (filtrer avec `entite` si l'utilisateur vise une entité).
2. Présenter en trois lignes : couverture par entité, nombre d'erreurs, de trous, de points à vérifier.
3. Demander le périmètre de la session (AskUserQuestion si disponible) :
   - les erreurs seulement (rapide, rend la base cohérente) ;
   - une entité donnée ;
   - tout, en mode exhaustif ;
   - préparer la liste des questions pour un atelier client, sans y répondre maintenant (aller au point 4).

## 2. Ordre de traitement

Erreurs d'abord, puis trous, puis alertes. À l'intérieur, regrouper par entité puis suivre le cycle de vie (du statut initial vers les statuts finaux) : les réponses en amont résolvent souvent des trous en aval.

Regrouper les trous liés en une seule question quand c'est naturel (par exemple deux combinaisons manquantes de la même table de décision).

## 3. Une question à la fois

Pour chaque trou :

1. Donner le contexte en une phrase (l'élément, d'où vient le trou), puis la question du trou, reformulée si besoin dans le vocabulaire du projet. Aucun code d'élément ni identifiant de trou dans le texte, les options ou leurs descriptions (voir « Parler métier, pas codes » dans le skill `referentiel`).
2. Proposer des réponses quand l'ensemble est fermé (AskUserQuestion si disponible), toujours avec ces trois options en plus des réponses métier :
   - « Hors périmètre » (demander une justification courte) ;
   - « Impossible dans le métier » (idem) ;
   - « À demander au client » (le trou reste ouvert et va dans la liste d'atelier).
   Exemples de réponses métier : pour une règle incomplète (`TABLE_INCOMPLETE`), les actions possibles depuis cette étape, nommées ; pour une action sans acteur (`TRANSITION_SANS_ACTEUR`), les acteurs existants et « le système, automatiquement ».
3. Si la réponse appelle des précisions, poser les questions manquantes avant d'écrire : condition exacte, exceptions, acteur, délai, source de la décision. Une seule relance à la fois.
4. Traduire la réponse en modification concrète et la montrer en une ou deux phrases métier, comme on l'expliquerait à quelqu'un du métier. Une nouvelle règle issue de la session a le statut `proposee` sauf si l'utilisateur dit qu'elle est validée et par qui.
5. Après le oui, écrire (`enregistrer_element`, `remplacer_regle` ou `decider_trou`), puis annoncer en une ligne, en mots métier, ce qui est réglé et ce qui reste à préciser. Un trou apparu rejoint la file.

Toutes les trois ou quatre décisions, rappeler la progression (couverture de l'entité) et proposer de continuer ou de s'arrêter.

## 4. Liste pour l'atelier client

Garder la trace des trous marqués « À demander au client ». En fin de session (ou directement si c'est la demande), produire la liste groupée par entité : pour chaque point, la question formulée pour le client (sans jargon technique ni identifiant de trou), le contexte en une phrase, et les options envisagées. Si le skill 4ward `4SH-preparation-atelier` est disponible, proposer de s'en servir pour bâtir la trame de l'atelier.

## 5. Clôture

Résumer : décisions prises (nombre et principales), trous assumés, questions pour le client, couverture avant et après. Proposer `generer_spec` pour mettre à jour la spécification.

## À éviter

- Remplir un trou avec une hypothèse « habituelle dans le secteur » sans la faire valider : la proposer comme option, jamais l'écrire d'office.
- Enchaîner plusieurs questions dans un même message.
- Pousser à l'exhaustivité si l'utilisateur a choisi un périmètre réduit.
