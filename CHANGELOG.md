# Journal des versions

Numérotation : X.Y.Z. Z pour une correction, Y pour une fonction nouvelle, X quand le format de la base change
au point de demander une migration.

## 0.15.0 (2026-10-22)

- Moodboard : Watson propose 1 à 3 pistes de direction artistique (couleurs, typographie, réglages, principes, ergonomie) à partir du cahier des charges et des images d'inspiration ; chaque piste se voit sur un écran type, se retouche, se reprend avec Watson, et la piste retenue habillera les maquettes.

## 0.14.0 (2026-10-22)

- Avant-projet : nouveau bloc du menu et cahier des charges. Watson rédige un premier jet depuis la base et les documents, section par section, tu gardes ce qui te va. Périmètre par version et points à confirmer tenus à jour. Watson suit la méthode 4ward quand elle est installée sur le poste (Paramètres).

## 0.13.0 (2026-10-22)

- Alimenter lit les images : captures d'écran, maquettes, schémas de parcours ou de données, photos de tableau blanc. Une capture se colle directement. Les écrans et scénarios proposés apparaissent dans le tri.

## 0.12.0 (2026-10-22)

- Onglet Scénarios : parcours en diagramme de processus, un couloir par application, décisions, refus et retours, statuts apposés, versions MVP, édition et Demander à Watson

## 0.11.0 (2026-10-22)

- Onglet Écrans : carte des écrans par application, contenu, routages et échanges, versions MVP, édition et Demander à Watson

## 0.10.0 (2026-10-22)

- Référentiels éditables : créer, modifier, supprimer une entité ou une liste de valeurs depuis sa fiche ; « Demander à Watson » prépare un changement décrit en langage naturel, visible sur le schéma avant d'être enregistré. Versions produit (MVP, V2…) : chaque entité, donnée, valeur ou règle peut en porter une, et le schéma montre en pointillés ce qui vient après la version choisie. Une règle peut porter sur des données précises ; elle apparaît en pastille sur le schéma.

## 0.9.1 (2026-10-22)

- Référentiels : le schéma prend le style du Workflow (briques blanches avec icône parlante et résumé, liens vers d'autres entités en pastilles, flèches indigo, listes de valeurs en ambre, légende en pilules) et s'ouvre à une taille lisible.

## 0.9.0 (2026-10-22)

- Nouvel onglet Référentiels (remplace Catalogue) : l'architecture de données en schéma généré automatiquement, avec les entités, leurs données, les listes de valeurs et les liens entre elles, ou en liste ; clic sur une brique pour sa fiche (données, cycle de vie, règles, qui l'utilise). Le modèle accepte les entités sans cycle de vie, les données qui désignent une autre entité (une ou plusieurs, optionnelles) et les listes de valeurs groupées ; Alimenter sait les proposer.

## 0.8.2 (2026-10-21)

- Sur Mac, plus de barre de titre grise : les boutons de fenêtre flottent sur l'application, et le haut de la fenêtre sert à la déplacer.

## 0.8.1 (2026-10-21)

- Icône plus claire. Watson apparaît selon ce que tu fais : il salue à l'accueil et à la connexion, lit tes documents pendant l'analyse, prend note quand c'est enregistré, réfléchit quand il cherche ou qu'il manque quelque chose. Devise : « Réglementaire, mon cher Watson. »

## 0.8.0 (2026-10-21)

- Nouvelle identité : icône à la moustache, mascotte Watson. Nouvel accueil : Watson te salue, résume ce qui a changé depuis ta dernière visite et les questions qui t'attendent, permet de poser une question ou de donner un document directement, et présente tes projets. Dans un projet, le logo Watson en haut ramène à l'accueil et le bloc projet permet de passer d'un projet à l'autre.

## 0.7.1 (2026-10-21)

- Écran Paramètres : choix du modèle Claude (Opus 5.5 par défaut, Sonnet 5.5, Haiku 5.5 ou un autre identifiant) et du niveau de réflexion (moyen par défaut), bouton pour tester, compte GitHub et version. Chaque réponse indique le modèle qui l'a produite.

## 0.7.0 (2026-10-21)

- Alimenter un projet : déposer des documents (PDF, Word, PowerPoint, texte, transcriptions) ou coller du texte ; Claude propose objets métier, étapes du workflow, règles et questions ouvertes, chacun avec le passage qui le justifie ; tri élément par élément ; documents gardés dans le dossier sources du dépôt. Écran « Par où commencer » pour un projet vide.

## 0.6.6 (2026-10-21)

- Création d'un projet : le dépôt s'appelle <nom>-knowledge par défaut, son nom se modifie, et on choisit de le créer sur son compte ou dans une de ses organisations. Watson demande désormais aussi la lecture des organisations : se reconnecter une fois.

## 0.6.5 (2026-10-21)

- Connexion à GitHub : la page de validation s'ouvre dans le navigateur ; sinon l'adresse est affichée pour l'ouvrir à la main.

## 0.6.4 (2026-10-21)

- Connexion à GitHub depuis l'application : le moteur utilise les certificats du système (Trousseau macOS, magasin Windows, proxy d'entreprise compris). Le message d'erreur précise la cause, et la publication vérifie que l'application joint GitHub.

## 0.6.3 (2026-10-21)

- Mac : le moteur ne démarrait pas (« Le moteur s'est arrêté, code 255 »). macOS refusait de charger le Python
  embarqué, signé par un autre éditeur que l'application. Le moteur et son Python sont désormais signés de la
  même façon, et l'application déclare le droit de charger ses propres bibliothèques.
- Si le moteur s'arrête, l'écran d'erreur affiche ses derniers messages au lieu d'un simple code.

## 0.6.2 (2026-10-21)

- Publication : la version Mac Intel est construite sur une machine Apple Silicon (GitHub n'attribue plus de
  machine Intel, la 0.6.1 restait en attente) ; une plateforme en échec n'empêche plus de publier les autres.

## 0.6.1 (2026-10-21)

- Installation sur Mac : architecture détectée par le système, même dans un Terminal lancé avec Rosetta
  (qui faisait croire à un Mac Intel) ; version Mac Intel publiée aussi.

## 0.6.0 (2026-10-21)

- Première version de l'application de bureau Watson, pour Mac (Apple Silicon) et Windows, installée par une
  commande et mise à jour toute seule (mises à jour signées).
- Connexion GitHub depuis l'application (code à saisir sur github.com, jeton dans le trousseau du système).
- Projets : ouvrir un dépôt de connaissance GitHub, ou en créer un (vide ou le projet de démonstration Fret).
  La référence est le dépôt GitHub ; chaque changement validé y est enregistré au nom de la personne.
- Écrans branchés sur le moteur : Synthèse, Catalogue, Workflow (schéma tracé depuis les données), Règles
  (avec validation d'une règle proposée), Versions (comparaison), Poser une question.
- Accès Git sans le programme git (Dulwich) dans l'application ; plugin et ligne de commande inchangés.

## 0.5.2 (2026-10-21)

- Lecture des versions passées compatible avec les Git anciens (2.33, 2.34) : l'archive est lancée depuis la
  racine du dépôt, sans le pathspec « :(top) » que ces Git n'honorent pas depuis un sous-dossier. Touchait les
  projets rangés dans un sous-dossier du dépôt (comparaison, histoire, contexte d'une version figée).

## 0.5.1 (2026-10-20)

- Moteur et plugin compatibles Python 3.7 (le python3 de certains postes) ; tests lançables dès Python 3.8,
  ceux de l'assistant sautés sans claude-agent-sdk ; CI en 3.8 et 3.12 avec contrôle de compatibilité 3.7.
- Tests collectés depuis la racine du dépôt (conftest.py).

## 0.5.0 (2026-10-20)

- Le plugin s'appelle désormais watson (serveur MCP watson, skill socle referentiel). Dépôt GitHub « watson » : le dépôt est lui-même le plugin et un catalogue de plugins Claude, pour installer
  puis mettre à jour sans rien re-télécharger.
- Évolutions rattachées à une version cible (1.6, plus tard) : chacune sur sa branche, intégrée quand on fige sa
  version si elle est validée.
- Correspondance code et spec : chaque livraison de code déclare la spec qu'elle applique ; l'outil dit, par
  environnement et par application, ce qui est à jour, conforme, en retard ou en avance.
- Cas de test proposés à partir des règles validées, enregistrés en brouillon, signalés quand une règle change.

## 0.4.0 (2026-10-20)

- Versions de la spec (étiquettes Git spec-X.Y), environnements, comparaison et histoire d'un élément.
- Lecture optimisée : la base en un texte compact, lu en une fois par Claude (assistant et équipes de dev).

## 0.3.0 (2026-10-15)

- « Demander au référentiel » : réponses sourcées de Claude, avec le compte Claude de chacun.

## 0.1.1 (2026-10-08)

- Première version du moteur, du serveur MCP et des skills.
