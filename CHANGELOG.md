# Journal des versions

Numérotation : X.Y.Z. Z pour une correction, Y pour une fonction nouvelle, X quand le format de la base change
au point de demander une migration.

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
