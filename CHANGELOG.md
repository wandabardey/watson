# Journal des versions

Numérotation : X.Y.Z. Z pour une correction, Y pour une fonction nouvelle, X quand le format de la base change
au point de demander une migration.

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
