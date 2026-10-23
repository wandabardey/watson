# Journal des versions

Numérotation : X.Y.Z. Z pour une correction, Y pour une fonction nouvelle, X quand le format de la base change
au point de demander une migration.

## 0.36.0 (2026-10-23)

- App en direct : l'application qui tourne, écran par écran, en face de la spec, de la maquette et du guide utilisateur ; écarts relevés en anomalie, évolution ou question ; critique UX de l'écran réel

## 0.35.0 (2026-10-23)

- Passage en code : Watson code les écrans depuis les maquettes validées, reporte le design system ou crée l'application, sur une branche, construite puis proposée en demande de fusion

## 0.34.0 (2026-10-23)

- Évolutions : la spec d'une évolution se travaille sur une branche de la base, se valide puis se fusionne dans la version de travail

## 0.33.0 (2026-10-23)

- Avancement des écrans : de la maquette validée au code livré, lu dans le dépôt de l'application ; validation des maquettes ; lien écran et code

## 0.32.0 (2026-10-23)

- Design system du projet : fondations en nuances avec aperçu vivant, catalogue du starter 4SH ou inventaire du code existant, maquettes branchées dessus

## 0.31.0 (2026-10-23)

- Schémas de scénarios lisibles : les boîtes s'élargissent pour que les libellés tiennent en entier, les conditions sont posées sur le trait qui arrive à l'étape (elles ne se chevauchent plus), deux liens ne partagent plus le même trait vertical, et la version n'est affichée que quand elle diffère de celle du scénario. Lecture des schémas : Watson crée une application par système (couloirs, badges, sigles, couleurs), range chaque étape dans la sienne et ne fusionne plus deux boîtes de même nom dans deux systèmes ; il reprend chaque flèche avec son libellé exact. Demander à Watson : un scénario, un flux ou une application cités en source ne sont plus déclarés introuvables, et Watson ne dit plus qu'un élément existe et manque dans la même réponse.

## 0.30.0 (2026-10-23)

- Spécifications Confluence : Watson écrit les pages de la méthode DESIGN de 4SH (acteurs, objets, cas d'usage, écrans, règles, intégrations, exports et imports, contexte) à partir de la base. Il analyse l'espace du projet pour reprendre sa convention de titre, une page modèle par type (macros et mise en forme comprises) et le style des écrans. Les brouillons s'affichent en aperçu, se corrigent, puis se publient après une confirmation qui dit ce qui sera créé et ce qui sera remplacé ; une page est signalée à mettre à jour quand la base bouge. Connexion par jeton d'API Atlassian, gardé dans le trousseau.

## 0.29.0 (2026-10-23)

- Watson travaille en arrière-plan : on voit depuis tous les écrans ce qu'il fait (lecture, réflexion, texte déjà écrit, durée), on peut changer d'écran pendant ce temps, un message prévient quand c'est fini et mène au résultat. L'accueil du projet est scindé en trois : Accueil (la synthèse), Demander à Watson, Alimenter. 4ward n'est plus recherché toutes les deux minutes : au lancement, à l'ouverture des Paramètres ou si sa version change. Les maquettes et la critique suivent les nouvelles règles de composants de 4ward 0.64.

## 0.28.2 (2026-10-23)

- 4ward : Watson cherche plus loin les installations de 4ward, refait la recherche toutes les deux minutes (une mise à jour dans Claude est prise sans relancer Watson), et Paramètres liste toutes les versions trouvées, avec Rechercher à nouveau et le choix de celle à utiliser.

## 0.28.1 (2026-10-23)

- Chiffrage : taux journalier de 640 € HT par défaut, réglable dans les Paramètres pour tous les nouveaux chiffrages, et dans chaque projet.

## 0.28.0 (2026-10-23)

- Deck de soutenance à la charte 4SH : couverture, intercalaires et fin avec les photos en losanges, coin rouge et losanges sur les slides de contenu, colonnes rouges avec encoche, pictogrammes dans des cercles roses ; nouveaux types de slides (contraintes en grille, références, image, périmètre et interfaces, équipe et engagements). Le kit de présentation 4SH s'importe une fois dans Paramètres et reste sur le poste ; il apporte aussi la présentation de 4SH réutilisable, insérée après la couverture. Le planning et le budget du deck sont remplis par le chiffrage.

## 0.27.0 (2026-10-23)

- Proposition écrite et chiffrage : à côté du deck, Watson rédige le document de travail de l'avant-vente (récap du besoin, fonctionnalités, objets métier, cycle de vie, détail par objet avec écrans, états et droits, moodboard, maquettes, enveloppe financière, rétroplanning, points ouverts), exportable en Word et en HTML. Le chiffrage pose les hypothèses (taux, équipe type, sprint), recalcule chaque phase, la fourchette et la première enveloppe, et montre ce qui pèse dans chaque lot ; Watson peut proposer un découpage argumenté. Nouvel écran Qui fait quoi : origine des données, CRUD et matrice des droits par acteur, avec les incohérences signalées.

## 0.26.0 (2026-10-23)

- Flux externes : les échanges entre les applications du produit et les systèmes du client ou des partenaires deviennent des éléments de la base (sens, partenaire, déclencheur, moyen et format, données, règles, gestion des échecs, volumétrie). Watson les tire des documents dans Alimenter ou d'une description, signale ce qui manque (que faire si l'échange échoue, quelles données, quand il part), et les suit dans l'analyse d'impact, les versions et le comité. Une carte montre qui échange avec qui.

## 0.25.0 (2026-10-22)

- Documentation utilisateur : Watson propose le sommaire du guide (par tâche, par profil, par écran ou par grande fonction), rédige chaque rubrique en mode d'emploi depuis la base (au « vous », étapes numérotées, libellés réels, encadrés, sans code interne) et le glossaire ; une rubrique est signalée à mettre à jour quand la base bouge ; export HTML avec les captures des maquettes, prêt à imprimer en PDF.

## 0.24.0 (2026-10-22)

- Recette et TNR : le cahier de recette se remplit des cas tirés de la base (chemin normal, droits, règles, tables de décision) et des critères d'acceptation des évolutions, se relit et se valide ; un cas est signalé à revoir quand la base bouge. Les campagnes jouent les cas d'une version, ou ceux que touche une évolution : résultats au fil de l'eau, anomalies prêtes pour un ticket, avis go / no-go argumenté, rapport à copier.

## 0.23.0 (2026-10-22)

- Évolutions : chaque changement demandé sur le produit est rédigé par Watson (constat, attendu, règles testables, critères d'acceptation nominaux, d'erreur, de limite et de droits, questions au client) ; l'analyse d'impact suit la base à l'envers (ce qui cite chaque élément, les scénarios et écrans concernés, leurs maquettes) et donne la non-régression à rejouer ; la base se met à jour par une demande à Watson, validée comme toujours. Copie en Markdown pour Confluence, relecture par Watson.

## 0.22.0 (2026-10-22)

- Critique UX des maquettes (sur la capture) et relecture du cahier des charges, des kits d'atelier, des comptes rendus et de la proposition : verdict, retours priorisés, et correction par Watson des retours choisis. Fiche secteur : le métier du client expliqué avant de concevoir, qui nourrit le cahier des charges. Brouillons de mails au client (compte rendu, proposition, annonce de version, retard, recadrage), à relire et envoyer soi-même.

## 0.21.0 (2026-10-22)

- Ateliers client : Watson prépare le kit (objectifs, trame minutée, questions issues de ce que la base ne sait pas encore, décisions à prendre, supports), mode séance en plein écran pour cocher et noter, compte rendu rédigé depuis les notes et une transcription, qui tranche les questions ouvertes et met la base à jour après validation. Administration du projet : consommation de Claude par projet, avec la session de 5 heures et la part du projet. Cahier des charges : trois sections de plus. Signature macOS stable : le trousseau ne redemande plus l'accès à chaque version.

## 0.20.0 (2026-10-22)

- Accueil du projet : synthèse, question à Watson et dépôt de documents sur une seule page ; menu repliable qui défile ; Questions ouvertes avec compteur ; cycle de vie des objets dans Référentiels ; listes déroulantes au design de l'app ; la mise à jour continue de se télécharger quand on change d'écran et son bandeau reste en haut.

## 0.19.0 (2026-10-22)

- Comité d'experts : n'importe quel élément du projet (règle, scénario, écran, objet métier, question ouverte, cahier des charges, piste, maquette, proposition) ou une question libre peut être soumis à un panel d'experts fictifs ; trois intensités, avis dans leur voix, débat, recommandation unique ; journal des décisions, comité du projet, application à la base après validation.

## 0.18.0 (2026-10-22)

- Sujets en attente : les questions ouvertes du projet (documents, cahier des charges, moodboard, maquettes, ajout à la main) se tranchent ici ; une réponse peut ensuite mettre la base à jour par une demande à Watson, à valider ; ce que la base marque « à trancher » est rappelé.

## 0.17.0 (2026-10-22)

- Proposition commerciale : Watson écrit le deck de soutenance (trame du deck commercial 4ward) avec le cahier des charges, la piste retenue, les maquettes et le périmètre ; mise en page charte 4SH affinée et couverture Nuit ; relecture slide par slide, mode présentation, exports PDF et PowerPoint avec les notes de l'orateur.

## 0.16.0 (2026-10-22)

- Maquettes : Watson dessine les écrans du projet avec la piste retenue du moodboard et un jeu de données fictives commun, tu gardes ou écartes ; brief prêt à coller dans Claude Design et import de ses exports HTML ou de captures ; chaque maquette se rattache à un écran.

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
