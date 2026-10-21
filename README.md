# Watson, le référentiel métier vivant

Une source de vérité unique pour les règles métier d'un projet. À partir de fichiers YAML versionnés dans Git, l'outil :

- **contrôle la cohérence** de la base (références cassées, règle obsolète encore utilisée, acteur non autorisé) ;
- **détecte les trous** (statut sans sortie ou inatteignable, transition sans règle ou sans acteur, table de décision incomplète ou contradictoire, capture de doc à revérifier) et formule **la question à poser** pour chacun ;
- **mesure la couverture** de chaque entité ;
- **calcule l'impact** d'un changement (règles, transitions, statuts, cas d'usage, écrans, captures) ;
- **génère la spécification** consultable (HTML) et les diagrammes de cycle de vie (Mermaid).

Il s'utilise de deux façons : depuis l'app Claude grâce au **plugin** (serveur MCP + skills), ou en ligne de commande.

## L'application Watson

Sur Mac (Apple Silicon ou Intel), dans le Terminal :

```
curl -fsSL https://raw.githubusercontent.com/wandabardey/watson/main/installer/install.sh | sh
```

Sur Windows, dans PowerShell :

```
irm https://raw.githubusercontent.com/wandabardey/watson/main/installer/install.ps1 | iex
```

La commande télécharge la dernière version, vérifie son empreinte, l'installe et l'ouvre. Ensuite, Watson se
met à jour tout seul : à chaque nouvelle version publiée, un bandeau propose « Installer et redémarrer ».
Les mises à jour sont signées (clé dans le secret `TAURI_SIGNING_PRIVATE_KEY` du dépôt) et vérifiées par
l'application avant installation.

L'application embarque son moteur : rien d'autre à installer, ni Python, ni git. La connaissance de chaque
projet vit dans son propre dépôt GitHub ; Watson en garde une copie de travail et y enregistre chaque changement.

Organisation : `app/` (interface Preact et coquille Tauri), `referentiel/api.py` (API locale du moteur),
`referentiel/depot.py` (Git en Python), `referentiel/github.py` (connexion et dépôts), `installer/`.

## Installation (moteur, ligne de commande)

Python 3.7 ou plus pour le moteur et le plugin, **aucune bibliothèque à installer** : PyYAML (licence MIT) est embarqué dans `referentiel/_vendor`.
Pour lancer les tests : `pip install pytest` puis `pytest` (Python 3.8 ou plus ; les tests de l'assistant demandent Python 3.10 et `claude-agent-sdk`, ils sont sautés sinon). La CI les lance en 3.8 et 3.12, et vérifie que le moteur reste compatible Python 3.7.

## Installer et mettre à jour (plugin Claude)

Le dépôt est à la fois le plugin et un catalogue de plugins Claude (`.claude-plugin/marketplace.json`).

Installer, une seule fois (dépôt privé : il faut avoir accès à `wandabardey/watson` sur GitHub) :

```
/plugin marketplace add wandabardey/watson
/plugin install watson@watson
```

Mettre à jour : `/plugin marketplace update watson`, puis accepter la mise à jour du plugin (ou activer la mise
à jour automatique du catalogue dans `/plugin`). Rien à re-télécharger à la main.

Sans le catalogue, chaque publication GitHub propose aussi le fichier `watson-X.Y.Z.plugin`.

## Publier une nouvelle version

```bash
python3 scripts/publier_version.py 0.6.0 "Ce qui change, en une phrase"
git push && git push --tags
```

Le script refuse s'il reste des changements non enregistrés ou si un test échoue ; il met le numéro à jour
partout (manifeste, catalogue, moteur), ajoute l'entrée au `CHANGELOG.md`, puis crée le commit et l'étiquette
`v0.6.0`. Sur GitHub, l'étiquette déclenche les tests, la construction du `.plugin` et la publication.

Le plugin watson contient le serveur MCP `watson` et les skills `referentiel` (socle),
`combler-trous`, `importer-compte-rendu`, `modifier-regle`. Voir `docs/plugin.md`.

Le serveur peut aussi être branché à n'importe quel client MCP :

```json
{ "mcpServers": { "watson": { "command": "python3", "args": ["/chemin/vers/watson/serveur/lancer.py"],
  "env": { "REFERENTIEL_PROJET": "/chemin/vers/mon-projet" } } } }
```

Toutes les écritures passent par le moteur : structure validée avant écriture, annulation si la base deviendrait
invalide, historique des règles tenu automatiquement, bilan des trous résolus et apparus après chaque écriture.

## Commandes

```bash
python -m referentiel valider exemples/fret          # code retour 1 s'il y a des erreurs (utilisable en CI)
python -m referentiel trous   exemples/fret          # trous, questions, couverture
python -m referentiel trous   exemples/fret --json   # même chose pour Claude ou un autre outil
python -m referentiel impact  exemples/fret RG-002   # ce qui dépend de la règle RG-002
python -m referentiel generer exemples/fret          # sortie/spec.html + sortie/diagrammes/*.mmd
python -m referentiel nouveau projets/mon-projet MON-PROJET "Mon projet"
python -m referentiel contexte exemples/fret -o REFERENTIEL.md   # la base en un texte compact pour Claude
python -m referentiel versions exemples/fret         # versions figées et environnements
python -m referentiel comparer exemples/fret production          # écarts production / version de travail
python -m referentiel figer    exemples/fret 1.2 "Tolérance de 3 heures" --auteur "Wanda Bardey"
python -m referentiel evolution exemples/fret creer "Blocage en douane" --cible 1.6 --auteur "Wanda Bardey"
python -m referentiel evolution exemples/fret lister            # évolutions, version cible, ce qu'elles changent
python -m referentiel livraisons exemples/fret                  # quelle version de code applique quelle spec
python -m referentiel tests    exemples/fret --element RG-002   # cas de test proposés pour une règle
python -m referentiel tests    exemples/fret --a-revoir         # cas dont la règle a bougé
```

Ouvrir `exemples/fret/sortie/spec.html` dans un navigateur (les diagrammes se chargent depuis le CDN jsDelivr, il faut une connexion).

## Organisation d'un projet

Un projet = un dossier (et à terme un dépôt GitHub privé). Un fichier par élément, ce qui limite les conflits quand plusieurs personnes travaillent en parallèle.

```
mon-projet/
  projet.yaml          id, nom, description, glossaire
  acteurs/             ACT-*.yaml   qui agit
  entites/             ENT-*.yaml   attributs, statuts, transitions
  regles/              RG-*.yaml    règles métier (contrainte, calcul, droit, table de décision)
  cas-usage/           UC-*.yaml    parcours, étape par étape, avec transition et écran
  ecrans/              SCR-*.yaml   acteurs, captures de doc datées
  trous.yaml           décisions du PO sur les trous (hors périmètre, impossible métier)
```

Les identifiants (`RG-002`, `TR-LIVRER`, `SCR-001`…) sont **stables** : ce sont eux que le code, les tests et la doc référencent. On ne renumérote jamais.

## Le format en bref

### Entité

```yaml
id: ENT-EXPEDITION
nom: Expédition
attributs:                      # servent aux tables de décision
  - nom: document_douanier
    type: enum                  # enum | booleen | texte | nombre | date
    valeurs: [valide, manquant, refuse]
statut_initial: BROUILLON
statuts:
  - id: LIVREE
    nom: Livrée
    final: true
transitions:
  - id: TR-LIVRER
    nom: Livrer
    de: EN_TRANSIT
    vers: LIVREE
    acteurs: [ACT-TRANSPORTEUR]   # qui a le droit
    regles: [RG-004]              # ce qui l'encadre
```

### Règle, avec table de décision

```yaml
id: RG-002
titre: Orientation après vérification des documents
statut: validee                  # proposee | validee | obsolete
type: table_decision             # contrainte | calcul | droit | table_decision
entite: ENT-EXPEDITION
enonce: ...
source: Atelier de cadrage du 2026-09-12
conditions:
  - attribut: document_douanier
  - attribut: marchandise_dangereuse
lignes:                          # un attribut absent d'une ligne = indifférent
  - si: {document_douanier: valide, marchandise_dangereuse: false}
    alors: TR-VALIDER-DOCS
historique:
  - date: 2026-09-12
    auteur: Wanda Bardey
    changement: Création
```

L'outil croise toutes les valeurs des conditions et signale chaque combinaison sans résultat (regroupée quand c'est possible : « document_douanier = refuse » plutôt que 4 lignes) et chaque combinaison avec deux résultats différents.

### Corriger une décision

On ne supprime pas une règle validée :

1. on crée la nouvelle règle avec `remplace: RG-006` et une entrée d'historique (date, auteur, changement, raison) ;
2. on passe l'ancienne en `statut: obsolete` et on ajoute une entrée d'historique ;
3. l'outil signale chaque transition encore rattachée à l'ancienne règle, et chaque capture d'écran prise avant le changement.

Pour une correction mineure (reformulation), on modifie la règle et on ajoute une entrée d'historique. Git garde de toute façon chaque version.

### Assumer un trou

Le PO n'est pas obligé de tout combler. Dans `trous.yaml` :

```yaml
- trou: STATUT_INATTEIGNABLE:ENT-EXPEDITION:ARCHIVEE   # id affiché par la commande trous
  statut: hors_perimetre        # hors_perimetre | impossible_metier | a_traiter
  justification: L'archivage est spécifié dans le lot 2.
  par: Wanda Bardey
  date: 2026-10-08
```

Le trou passe alors dans « Trous traités » et ne compte plus dans la couverture. Si le trou disparaît (parce qu'on l'a comblé), l'outil signale la décision devenue sans objet.

## Contrôles disponibles

| Type | Gravité | Ce qui est détecté |
| --- | --- | --- |
| `REFERENCE_INCONNUE` | erreur | Un identifiant cité n'existe pas |
| `REGLE_OBSOLETE_UTILISEE` | erreur | Une règle obsolète encadre encore une transition |
| `ACTEUR_NON_AUTORISE` | erreur | Un cas d'usage fait agir un acteur non autorisé sur la transition |
| `TABLE_CONTRADICTOIRE` | erreur | Deux lignes d'une table donnent des résultats différents pour le même cas |
| `STATUT_INATTEIGNABLE` | trou | Aucun chemin ne mène au statut |
| `STATUT_SANS_SORTIE` | trou | Statut non final sans transition sortante |
| `TRANSITION_SANS_REGLE` | trou | Transition encadrée par aucune règle |
| `TRANSITION_SANS_ACTEUR` | trou | Personne n'est autorisé à la déclencher |
| `TABLE_INCOMPLETE` | trou | Combinaisons de conditions sans résultat |
| `REGLE_SANS_SOURCE` | trou | Règle validée sans source |
| `ACTEUR_SANS_ACTION` | trou | Acteur qui n'intervient nulle part |
| `REGLE_A_VALIDER` | à vérifier | Règle encore au statut proposée |
| `REGLE_NON_RATTACHEE` | à vérifier | Règle liée à aucune transition |
| `STATUT_HORS_CAS_USAGE` | à vérifier | Aucun parcours ne passe par ce statut |
| `ECRAN_HORS_CAS_USAGE` | à vérifier | Écran absent de tous les parcours |
| `CAPTURE_A_VERIFIER` | à vérifier | Capture prise avant la modification d'une règle de l'écran |

## L'exemple fourni

`exemples/fret` est un projet **fictif** (une entité Expédition, 9 statuts, 9 transitions, 7 règles, 2 cas d'usage, 4 écrans) avec des trous volontaires pour montrer chaque contrôle.

## Organisation du dépôt

```
.claude-plugin/         manifeste du plugin et catalogue (marketplace)
.mcp.json               déclaration du serveur MCP du plugin
referentiel/            moteur (chargement, contrôles, impact, écriture, versions, évolutions, serveur MCP)
serveur/lancer.py       lanceur du serveur MCP
skills/                 skills du plugin
scripts/                construction du plugin et publication d'une version
.github/workflows/      tests à chaque envoi, publication à chaque étiquette vX.Y.Z
docs/                   documentation du plugin
exemples/fret/          projet fictif de démonstration
tests/                  tests automatiques
```

## Prochaines étapes

- Test du format sur une entité réelle d'un projet pilote.
- V1 : application de bureau (dashboard multi-projets, explorateur de workflows, encart de décisions).


## Demander au référentiel (prototype)

Claude répond aux questions sur la base du projet, en citant ses sources (règle, décision, date, auteur).
Il tourne sur le poste, avec le compte Claude de la personne, par le kit d'agents d'Anthropic
(Claude Agent SDK), qui lance Claude Code sans le modifier. L'outil ne voit et ne stocke aucun identifiant.

    pip install claude-agent-sdk
    python -m referentiel connexion            # état de la connexion
    python -m referentiel connexion --login    # connexion par la page d'Anthropic
    python -m referentiel demander <projet> "Un expéditeur peut-il annuler une expédition soumise ?"
    python -m referentiel app <projet>         # interface locale dans le navigateur

Garde-fous : Claude n'a que les outils de lecture du serveur MCP (aucun outil d'écriture, ni fichiers,
ni terminal, ni web) ; une réponse sans source n'est pas affichée ; chaque source est vérifiée dans la base.

Secours : si la connexion par compte Claude n'est plus acceptée, définir `REFERENTIEL_CLE_API` avec une clé
de l'organisation (crédits API inclus dans la licence Team) ; le reste ne change pas.

Rapidité : toute la base tient dans un texte compact (environ 2 000 jetons pour l'exemple fret) placé dans
les consignes de Claude, qui répond en une seule passe, sans appel d'outil. Ces consignes sont identiques d'une
question à l'autre, donc servies par le cache. Les outils de lecture ne servent qu'aux très grosses bases
(au delà d'environ 60 000 jetons), où le texte ne garde que les titres des règles. Pour aller plus vite encore :
`REFERENTIEL_MODELE=haiku`.

Portée : `travail` (défaut, avec les écarts par rapport à la production), `production` (la version déployée,
avec ce qui changera), `histoire` (les changements de version en version).

## Versions

Une version de la spec est une étiquette Git annotée `spec-X.Y` posée sur le dépôt du référentiel
(`python -m referentiel figer`, qui refuse s'il reste des changements non enregistrés). La version de travail
est ce qui est dans les fichiers. `versions.yaml`, à la racine du projet, dit quelle version tourne où :

```yaml
environnements:
  production: {spec: '1.0', applications: {Portail Fret: 2.2.0, App Transporteur: 1.4.0}}
  recette:    {spec: '1.1'}
```

Toutes les lectures acceptent une version : numéro, `production`, `recette` ou `travail`. Une version passée
est lue avec `git archive`, sans toucher aux fichiers ni changer de branche. Outils MCP ajoutés :
`lister_versions`, `comparer_versions`, `historique_versions` (à quelle version une règle est apparue ou a
changé, et si elle est déjà en production) et `figer_version` (écriture, sur accord explicite).

## Le référentiel côté développement (Claude Code)

L'équipe qui construit l'application s'appuie sur le référentiel comme référence métier. Pour que ce soit
rapide et peu coûteux, Claude doit lire la base en une fois, pas élément par élément. Deux façons, au choix :

1. Fichier importé (le plus économe). Générer le texte compact dans le dépôt de code, puis l'importer depuis
   le `CLAUDE.md` du dépôt. Claude Code l'a alors dans son contexte à chaque session, servi par le cache,
   sans aucun appel d'outil.

   ```bash
   python -m referentiel contexte ../referentiel/fret --version recette -o docs/REFERENTIEL.md
   ```

   Dans `CLAUDE.md` :

   ```markdown
   Référence métier : @docs/REFERENTIEL.md (spec 1.1). Une règle n'est en vigueur que si elle est validée.
   Citer l'identifiant de la règle ([RG-007]) dans le code et les tests qui l'appliquent.
   Si le code doit trancher un point que la base ne dit pas, le signaler au lieu de l'inventer.
   ```

   Régénérer le fichier à chaque nouvelle version figée (une étape de CI suffit). Choisir la version visée
   par le développement (souvent `recette`), pas forcément la version de travail.

2. Serveur MCP en lecture. Déclarer le serveur dans `.mcp.json` du dépôt de code, et n'autoriser que les
   outils de lecture. Claude appelle `contexte` une fois (avec `sections` pour réduire, `version` pour viser une
   version), puis `lire_element` ou `analyser_impact` seulement pour un détail.

   ```json
   {"mcpServers": {"referentiel": {"command": "python", "args": ["-m", "referentiel.mcp_serveur"],
     "env": {"REFERENTIEL_PROJET": "../referentiel/fret", "PYTHONPATH": "../watson"}}}}
   ```

Les réponses des outils sont en JSON compact, sans indentation, pour ne pas payer d'espaces.


## Cas de test tirés des règles

Une fois une règle validée, l'outil propose les cas de test qui en découlent, en langage métier
(étant donné, quand, alors) :

- pour chaque action dont toutes les règles sont validées : le chemin normal, les droits (les autres acteurs
  ne peuvent pas la faire) et la non-régression (l'action n'est pas proposée hors de son étape de départ) ;
- pour chaque règle : le cas où elle n'est pas respectée, et le cas où elle l'est si aucune action ne la porte ;
- pour une table de décision : une situation par ligne ;
- pour une règle qui en remplace une autre : l'ancien comportement doit être refusé.

Une règle proposée ou obsolète n'en produit aucun : la proposition liste ce qui attend une validation. Ce que la
base ne dit pas (jeu de données, texte exact du message) est noté « à préciser », jamais inventé.

Rien n'est écrit sans demande. `tests --enregistrer` (ou l'outil `enregistrer_tests`) écrit les cas choisis en
brouillon dans `recette/cas/`, sans jamais remplacer un cas existant, qui a pu être relu. Chaque cas garde
l'empreinte de ses sources : `tests --a-revoir` (ou `cas_a_revoir`) signale ceux dont la règle a changé, est
devenue obsolète ou a disparu.


## Évolutions et version cible

Un changement destiné à une version précise se fait dans une évolution : une branche `evo/<nom>` du dépôt du
référentiel, rattachée à une version cible (« 1.6 » ou « plus tard ») dans `evolutions.yaml`. On y travaille
dans un dossier à part, rangé dans `.git`, si bien que la version de travail et les autres évolutions ne bougent
pas. Les outils d'écriture du serveur MCP acceptent le paramètre `evolution` ; chaque écriture y est enregistrée
sur la branche, signée par son auteur.

Figer la 1.6 intègre les évolutions validées qui la ciblent, et elles seules. Une évolution qui vise la 1.6 sans
être validée bloque la version : on la valide, ou on la décale (`evolution cibler <id> plus-tard`). En cas de
conflit, rien n'est intégré.

## Code et spec : qui applique quoi

Deux horloges : la spec (ce que le métier a décidé) et le code (ce qui est livré, application par application).
Un correctif de code ne change pas la spec ; une version de spec peut ne toucher qu'une application. Le lien est
déclaré par le code, à chaque livraison :

- le fichier de référence généré par `contexte -o REFERENTIEL.md` et rangé dans le dépôt de code commence par
  `<!-- referentiel: FRET-DEMO spec 1.5 -->` ;
- à défaut, le message de l'étiquette de livraison contient « spec 1.5 ».

Dans `projet.yaml`, chaque application déclare son dépôt (lu en lecture seule) :

```yaml
applications:
  - {id: PORTAIL, nom: Portail Fret, depot: ../fret-portail}
  - {id: APP, nom: App Transporteur, depot: ../fret-transporteur-mobile, etiquettes: "mobile-*"}
```

Les éléments peuvent dire quelles applications ils concernent (`applications: [PORTAIL]` sur une action, une
règle ou un écran ; une règle sans ce champ suit les actions qui la citent ; sans indication, toutes).
`livraisons` (ou l'outil `correspondance`) croise alors `versions.yaml` et les dépôts : pour chaque environnement,
chaque application est « à jour », « conforme » (spec plus ancienne mais rien de ce qui a changé ne la concerne),
« en retard » (avec les changements manquants), « en avance » ou « inconnue ».
