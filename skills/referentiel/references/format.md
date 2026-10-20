# Format de la base

### Organisation d'un projet

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

### Le format en bref

#### Entité

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

#### Règle, avec table de décision

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

#### Corriger une décision

On ne supprime pas une règle validée :

1. on crée la nouvelle règle avec `remplace: RG-006` et une entrée d'historique (date, auteur, changement, raison) ;
2. on passe l'ancienne en `statut: obsolete` et on ajoute une entrée d'historique ;
3. l'outil signale chaque transition encore rattachée à l'ancienne règle, et chaque capture d'écran prise avant le changement.

Pour une correction mineure (reformulation), on modifie la règle et on ajoute une entrée d'historique. Git garde de toute façon chaque version.

#### Assumer un trou

Le PO n'est pas obligé de tout combler. Dans `trous.yaml` :

```yaml
- trou: STATUT_INATTEIGNABLE:ENT-EXPEDITION:ARCHIVEE   # id affiché par la commande trous
  statut: hors_perimetre        # hors_perimetre | impossible_metier | a_traiter
  justification: L'archivage est spécifié dans le lot 2.
  par: Wanda Bardey
  date: 2026-10-08
```

Le trou passe alors dans « Trous traités » et ne compte plus dans la couverture. Si le trou disparaît (parce qu'on l'a comblé), l'outil signale la décision devenue sans objet.

### Contrôles disponibles

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

