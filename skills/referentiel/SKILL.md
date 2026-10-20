---
name: referentiel
description: Socle du référentiel métier vivant d'un projet (entités, statuts, transitions, règles, acteurs, cas d'usage, écrans). Utiliser dès qu'une question porte sur les règles métier ou le fonctionnement attendu d'un projet suivi dans le référentiel, par exemple « que se passe-t-il si… », « qui peut… », « quelle règle s'applique à… », « montre-moi le workflow de… », « ouvre le projet… », « crée un projet référentiel », « génère la spec », ou quand l'utilisateur parle de « source de vérité », de « référentiel » ou de « base de connaissance projet ».
---

# Référentiel métier vivant

Le référentiel est la source de vérité des règles métier d'un projet. Il vit dans un dossier (à terme un dépôt GitHub privé) et se manipule uniquement avec les outils du serveur MCP `watson`. Ne jamais lire ou modifier les fichiers YAML à la main quand un outil existe : les outils valident la structure, tiennent l'historique et calculent les trous.

## Parler métier, pas codes

L'utilisateur est un responsable produit ou une personne du métier : il pense en noms, pas en codes. Les identifiants (`RG-004`, `TR-LIVRER`, `SCR-002`, `UC-001`, `ACT-EXPEDITEUR`) servent aux outils et aux fichiers ; ils n'apparaissent pas dans ce que l'utilisateur lit.

- Désigner chaque élément par son nom, avec son type en mots simples :
  | Dans la base | À l'écran pour l'utilisateur |
  | --- | --- |
  | `RG-004` Preuve de livraison obligatoire | « la règle de preuve de livraison » |
  | `TR-LIVRER` (transition) | « l'action Livrer » |
  | statut `EN_TRANSIT` | « l'étape En transit » |
  | `UC-001` (cas d'usage) | « le parcours Expédier une marchandise » |
  | `ACT-EXPEDITEUR` | « l'Expéditeur » |
  | `SCR-002` | « l'écran Détail d'une expédition » |
  | attribut `client_grand_compte` | « client grand compte » (ou son `libelle`) |
- Vaut partout : réponses, questions, options et descriptions d'AskUserQuestion, tableaux, bilans après écriture. Les outils renvoient les noms à côté des codes (champ `nom`, `message`, `question`) : s'en servir.
- Éviter le vocabulaire de modélisation : dire « étape » plutôt que statut, « action » plutôt que transition, « parcours » plutôt que cas d'usage, « information » plutôt qu'attribut.
- Montrer un code seulement si l'utilisateur le demande (« donne-moi les codes », « quel est l'identifiant ? ») ou s'il parle lui-même en codes ; dans ce cas, le mettre entre parenthèses après le nom. Le YAML ne s'affiche que sur demande.
- Exemple. À éviter : « Ajout de ACT-EXPEDITEUR sur TR-LIVRER ; RG-004 s'appliquera aussi. » À préférer : « L'Expéditeur pourra lui aussi faire l'action Livrer. Attention : la règle de preuve de livraison s'appliquera à lui, il devra fournir une signature ou une photo géolocalisée. »

## Trouver le projet

1. Si le chemin du projet est déjà connu dans la conversation, le réutiliser dans le paramètre `projet` de chaque outil.
2. Sinon, appeler `localiser_projets` (sans argument, ou avec le dossier que l'utilisateur indique).
   - Un seul projet trouvé : le confirmer en une phrase et continuer.
   - Plusieurs : demander lequel (AskUserQuestion si disponible).
   - Aucun : proposer de créer le projet avec `creer_projet` (demander identifiant en majuscules et nom), ou demander le dossier. Si un dossier donné n'est pas reconnu, `localiser_projets` renvoie l'environnement du serveur : s'en servir pour retrouver le chemin tel que le serveur le voit (par exemple sous `~/mnt/<dossier>`).
3. Appeler `etat_projet` pour avoir la vue d'ensemble avant de répondre.

## Répondre à une question métier

- Chercher avec `rechercher` (tolère accents et terminaisons), puis `lire_element` sur les éléments pertinents. Pour une question « que se passe-t-il si », lire la table de décision de la règle concernée.
- Répondre en langage métier, sans identifiant : « l'expédition part en contrôle sécurité, d'après la règle d'orientation après vérification des documents ».
- Distinguer clairement : règle validée, règle proposée (pas encore confirmée), règle obsolète (remplacée, citer la remplaçante).
- Si la base ne contient pas la réponse, ne jamais l'inventer ni la déduire de l'usage du secteur. Dire que c'est un trou, formuler la question à poser, et proposer de l'enregistrer (skill `modifier-regle`) ou de la garder pour l'atelier client.

## Montrer un workflow

`generer_spec` produit la spécification HTML dans `sortie/spec.html` du projet et renvoie le code Mermaid de chaque entité. Pour montrer un cycle de vie dans la conversation, utiliser ce code Mermaid tel quel. Les statuts en orange portent un trou ouvert. Indiquer le chemin du fichier HTML pour la vue complète.

## Écrire dans la base

Règle absolue : aucune écriture sans accord explicite de l'utilisateur sur le contenu exact.

1. Consulter `decrire_format` pour le type d'élément si le format n'est pas déjà connu dans la conversation.
2. Présenter la modification en langage métier, sans code ni YAML (sauf demande), avec son impact en noms métier (`analyser_impact` pour toute règle, action ou étape existante).
3. Après le oui, appeler `enregistrer_element`, `remplacer_regle` ou `decider_trou`. Le paramètre `auteur` est le nom de l'utilisateur.
4. Rendre compte du bilan en une ou deux phrases métier : ce qui est désormais réglé, ce qui reste à préciser (avec la question à poser). Ne pas lister les fichiers écrits sauf demande.

Conventions :

- Identifiants en majuscules, stables, jamais renumérotés : `ACT-`, `ENT-`, `RG-`, `UC-`, `SCR-`, transitions `TR-`. Prendre le numéro libre suivant (`lister_elements`).
- Une règle non confirmée par le métier a le statut `proposee`. Elle ne passe en `validee` que sur confirmation explicite, avec une `source` (atelier, comité, compte rendu, personne et date).
- Une règle validée ne se supprime pas : changement de fond = `remplacer_regle` (nouvel identifiant, l'ancienne devient obsolète avec son historique) ; simple reformulation = `enregistrer_element` sur le même identifiant.
- Une condition de table de décision doit être un attribut de l'entité de type `enum` ou `booleen` pour que les trous soient calculés.

## Trous

Les trous ont trois gravités : `erreur` (incohérence à corriger), `trou` (information métier manquante), `alerte` (à vérifier). Chacun porte un identifiant stable et une question prête à poser. Pour une session de travail sur les trous, suivre le skill `combler-trous`. Le PO peut assumer un trou (`decider_trou` avec `hors_perimetre` ou `impossible_metier` et une justification) : il sort alors des trous ouverts sans être perdu.

## Autres skills du plugin

- `combler-trous` : session guidée de questions pour compléter les workflows.
- `importer-compte-rendu` : transformer un compte rendu de réunion en règles proposées et questions à valider.
- `modifier-regle` : ajouter, corriger ou remplacer une règle avec analyse d'impact.

Le détail du format est dans `references/format.md`.

## Style

Écrire en français, phrases courtes, vocabulaire du métier du projet (reprendre le glossaire). Ne pas utiliser de tiret cadratin ni demi-cadratin.
