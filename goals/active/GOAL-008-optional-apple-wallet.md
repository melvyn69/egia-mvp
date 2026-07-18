# GOAL-008 — Apple Wallet est une capacité optionnelle qui ne bloque pas la mise en production d’EGIA

## Métadonnées

- **ID :** `GOAL-008`
- **Statut :** `Done`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-18`
- **Date de clôture :** `2026-07-18`
- **Niveau de risque :** `R3` — Engineering de feature gating, sécurité cryptographique, parcours fidélité et contrats de futurs Runs; quatre revues indépendantes obligatoires.
- **Candidat applicatif figé :** `fed08f9be3954084c036a26355225f184896ba31`.

## Valeur business

EGIA peut être déployé et exploité sans compte Apple Developer, adhésion Apple,
certificat Pass Type ID, clé privée, passphrase ni certificat WWDR. Apple
Wallet demeure une capacité reportée, désactivée par défaut et activable
ultérieurement uniquement par une nouvelle décision Engineering gouvernée.

## Résultat attendu

Une configuration serveur canonique `APPLE_WALLET_ENABLED` désactive Apple
Wallet par défaut. Dans cet état, les six entrées Apple ne sont ni lues ni
requises, la route Wallet échoue de manière stable et non sensible, aucun CTA
Wallet actif n’est présenté et le reste du parcours fidélité demeure
fonctionnel. L’état activé conserve intégralement les contrôles
cryptographiques GOAL-007 et `sharingProhibited=true`.

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

## Décision produit fondatrice

Apple Wallet est reporté. Le Founder ne souhaite pas à ce stade :

- créer ou financer un compte Apple Developer;
- créer ou fournir un certificat Pass Type ID;
- fournir une clé privée, une passphrase ou un certificat WWDR;
- activer la génération de passes Apple Wallet en production.

Cette décision ne supprime ni ne réouvre GOAL-007 et n’altère aucune de ses
Evidence historiques. Elle crée une variante de déploiement dans laquelle
Wallet est explicitement désactivé.

## Sources de vérité

| Source | Portée / règle applicable |
| --- | --- |
| `AGENTS.md` | Un Goal EGIA ne contient jamais de mutation de production. |
| Autorisations fondatrices du `2026-07-18` | Création et exécution initiales jusqu’à `Review`, puis verdict `APPROVED` distinct autorisant la clôture `Review → Done`, sans autorisation de production. |
| `goals/active/GOAL-007-production-prerequisites-engineering.md` | Contrôles Apple Wallet existants et candidat historique figé. |
| `audits/GOAL-007-production-prerequisites-engineering.md` | Evidence Engineering historique immuable. |
| `docs/production/GOAL-007-*` | Contrats actifs à remplacer par une variante GOAL-008 sans réécriture historique. |
| `/Users/melvyn/Desktop/ANES/anes/docs/005-production-run-standard.md` | Séparation stricte Goal Engineering / Production Run. |

## Baseline vérifiée avant Phase 0

| Invariant | État vérifié |
| --- | --- |
| `main = origin/main` | `4778320c12538ccc5940e32332a637dd43eb4da3` |
| Dépôt EGIA | propre |
| GOAL-007 | `Done` |
| Candidat GOAL-007 | `e6958b647d50c3690cb147a5df8eaa2fdf3136f9`, ancêtre de `main` |
| GOAL-002 | `Done` |
| Dernier déploiement Vercel | `dpl_Fo9E1UgmyResT7kTm2WkE6tcxmCM` |
| Protection `main` | `git.deploymentEnabled.main=false` |
| Production Runs ANES | aucun nouveau Run; seul `PROD-RUN-001` existe et reste immuable |

## Scope Engineering

- Introduire le feature flag strictement serveur `APPLE_WALLET_ENABLED`.
- Garantir un état absent, `false` ou invalide désactivé et fail-closed.
- Ne lire ni parser aucun secret ou certificat Apple lorsque Wallet est désactivé.
- Conserver les six entrées et toutes les validations GOAL-007 lorsque Wallet est activé.
- Rendre la route Wallet stable, explicite et non sensible dans l’état désactivé.
- Masquer les CTA Apple Wallet lorsque la capacité n’est pas disponible.
- Exposer au frontend, si nécessaire, uniquement un booléen public non sensible.
- Couvrir les états de configuration, la route, le frontend et le parcours fidélité par des tests locaux synthétiques.
- Produire les nouveaux artefacts GOAL-008 des futurs Prerequisite et Deployment Runs, sans les créer ni les autoriser.
- Figer un nouveau candidat applicatif et limiter ses descendants à la documentation, au Goal et aux Evidence.

## Hors-scope

- Création, adhésion, paiement ou configuration d’un compte Apple Developer.
- Certificat, clé, passphrase, identifiant ou datum Apple réel.
- Activation d’Apple Wallet dans un environnement distant.
- Mutation Vercel, Supabase, cron, schéma, migration, secret ou donnée distante.
- Preview, staging ou déploiement Production.
- Création, autorisation ou exécution d’un Production Run.
- Modification de `PROD-RUN-001`, réouverture de GOAL-007 ou réécriture de ses Evidence historiques.

## Architecture cible

### Feature flag serveur

`APPLE_WALLET_ENABLED` accepte exclusivement les chaînes `true` et `false` :

- absent : Wallet désactivé;
- `false` : Wallet désactivé;
- `true` : activation conditionnelle, uniquement si les six entrées Apple sont valides;
- toute autre valeur : configuration invalide, Wallet désactivé fail-closed sans fuite interne.

Cette variable ne doit jamais être publiée comme variable frontend. Les six
entrées Apple restent atomiques et obligatoires dans l’état activé :
`APPLE_PASS_PRIVATE_KEY`, `APPLE_PASS_CERTIFICATE_PASSWORD`,
`APPLE_PASS_CERTIFICATE`, `APPLE_WWDR_CERTIFICATE`,
`APPLE_PASS_TYPE_IDENTIFIER` et `APPLE_TEAM_IDENTIFIER`.

### Runtime et API

Dans l’état désactivé, le runtime ne lit ni ne parse les six entrées, ne lance
aucune validation cryptographique, ne génère aucun pass et retourne un contrat
métier unique, stable et non sensible conforme aux conventions du dépôt. Dans
l’état activé, les contrôles cryptographiques GOAL-007 restent obligatoires et
`sharingProhibited=true` reste invariant.

Si le frontend doit connaître la capacité, l’API n’expose que
`appleWalletEnabled: boolean`; elle ne révèle jamais la présence individuelle
des secrets, des métadonnées cryptographiques ou une erreur de configuration
interne.

### Interface et parcours fidélité

Lorsque Wallet est désactivé, aucun bouton, lien, CTA ou texte ne doit promettre
ou déclencher Apple Wallet. Le CTA est masqué et le parcours fidélité non-Wallet
reste utilisable. Le frontend ne lit aucun secret ni le flag serveur brut.

### Activation ultérieure

Une activation future exige cumulativement :

1. un compte Apple Developer actif;
2. les six éléments Apple complets;
3. la validation cryptographique;
4. un nouveau Readiness Report;
5. un nouveau plan;
6. un nouveau candidat si nécessaire;
7. un Production Run distinct explicitement autorisé.

Un simple ajout manuel de variables ne constitue jamais une activation
autorisée. Un nouveau Goal Engineering ou Goal d’activation explicitement
accepté est obligatoire.

## Dépendances et Readiness Check

| Dépendance | État | Evidence / effet |
| --- | --- | --- |
| GOAL-002 | `Done` | Frontière sécurité et séparation Engineering / production disponibles. |
| GOAL-007 | `Done` | Contrôles Apple existants conservés; candidat historique figé. |
| Décision produit Apple | prête | Report et absence de credentials explicitement décidés par le Founder. |
| Baseline EGIA | prête | SHA exact, dépôt propre et protections vérifiés avant modification. |
| Baseline ANES | prête, lecture seule | Aucun nouveau Production Run; `PROD-RUN-001` reste immuable. |
| Autorisation Production | absente | Non nécessaire et explicitement hors-scope. |

Le Readiness Check est validé : résultat observable, scope, hors-scope,
architecture, dépendances, validations, Evidence, conditions d’arrêt et
autorités sont explicites; toutes les validations peuvent être conduites
localement avec des matériaux synthétiques et sans mutation distante.

## Critères d’acceptation

| ID | Critère observable | Validation / Evidence attendue |
| --- | --- | --- |
| AC-01 | Wallet est désactivé par défaut. | Tests flag absent et valeur `false`. |
| AC-02 | L’absence des six variables Apple ne bloque pas EGIA lorsque Wallet est désactivé. | Tests de configuration vide, typecheck et builds. |
| AC-03 | La route Wallet échoue de manière stable et non sensible lorsqu’elle est désactivée. | Test du statut et du code applicatif choisis. |
| AC-04 | Aucun certificat ou secret n’est lu lorsque Wallet est désactivé. | Injecteur d’environnement instrumenté et test de non-lecture. |
| AC-05 | Aucun CTA Wallet actif n’est présenté lorsque la capacité est désactivée. | Tests frontend de rendu. |
| AC-06 | Le parcours fidélité non-Wallet reste fonctionnel. | Test du parcours et régression fidélité. |
| AC-07 | Lorsque Wallet est activé, les contrôles GOAL-007 restent inchangés et obligatoires. | Tests avec six entrées synthétiques valides et configuration partielle. |
| AC-08 | Aucune information sur les secrets Apple n’est exposée au frontend. | Tests de contrat et recherche statique. |
| AC-09 | Les nouveaux artefacts de production n’exigent plus Apple dans la variante désactivée. | Revue documentaire des trois artefacts GOAL-008. |
| AC-10 | L’activation ultérieure est explicitement séparée et gouvernée. | Goal, rapport et plans versionnés. |
| AC-11 | Tests, types, lint, builds et audits sont verts. | Résultats locaux et CI GitHub. |
| AC-12 | Aucune mutation distante ni donnée réelle n’est utilisée. | Diff, secret scan et contrôles distants passifs. |
| AC-13 | Aucun Production Run n’est créé ou autorisé. | Inventaire ANES en lecture seule et revue de séparation. |
| AC-14 | Un nouveau candidat est figé avec descendants uniquement documentaires. | SHA exact et diff descendant. |

## Tests obligatoires

- Flag absent, `false`, `true` avec six entrées synthétiques valides, `true` avec configuration partielle et valeur invalide.
- Route désactivée et contrat non sensible.
- Frontend sans CTA, puis avec CTA lorsque la capability simulée est active.
- Parcours fidélité sans Wallet.
- Preuve qu’aucun secret n’est lu lorsque Wallet est désactivé.
- Non-régression de tous les tests Apple GOAL-007 et absence de fuite d’information.
- Typechecks, lint, builds frontend/backend, audits dépendances, secret scan, `git diff --check` et CI GitHub.

## Revues indépendantes requises

| Revue | Verdict requis |
| --- | --- |
| Architecture et feature gating | `APPROVED` |
| Sécurité et Apple Wallet | `APPROVED` |
| Frontend et parcours fidélité | `APPROVED` |
| Séparation Engineering / futurs Production Runs | `APPROVED` |

## Autorisations Git

- Phase 0 : utiliser une branche déjà protégée pour ajouter les protections de `engineering/goal-008-optional-apple-wallet` et `docs/goal-008-engineering-closeout`, créer ce Goal, obtenir CI verte et fusionner en fast-forward avant toute modification applicative.
- Implémentation : créer et pousser `engineering/goal-008-optional-apple-wallet` depuis le `main` protégé.
- Closeout : utiliser `docs/goal-008-engineering-closeout` si un descendant documentaire séparé est nécessaire.
- Commits, push, PR et fusion fast-forward dans le scope : autorisés.
- Force-push : interdit.
- Après le commit candidat, seuls les documents, le Goal et les Evidence peuvent changer.

## Autorisations de déploiement

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

- Preview, staging et production : interdits.
- Toute mutation distante : interdite.
- Aucun secret Apple ne doit être écrit dans un environnement distant.
- Retour arrière de production : N/A, aucune production ne doit être touchée.

## Conditions d’arrêt

- Divergence matérielle de la baseline obligatoire.
- Impossibilité de prouver la non-lecture des secrets dans l’état désactivé.
- Régression ou contournement des contrôles cryptographiques GOAL-007.
- Exposition d’une information de secret ou de configuration interne.
- Revue autre que `APPROVED` ou contradiction Engineering / Production Run.
- Mutation distante, Preview, déploiement ou nouveau Production Run créé.
- Modification non documentaire après gel du candidat.

## Définition de Done

GOAL-008 Engineering est clôturé. Apple Wallet est officiellement optionnel et
désactivé par défaut; les six credentials Apple ne sont pas requis pour la
variante sans Wallet. Le contrat `404 / APPLE_WALLET_DISABLED`, la capability
publique limitée au booléen non sensible, le masquage frontend et le parcours
fidélité non-Wallet sont acceptés.

- AC-01 à AC-14 sont acceptés.
- Le candidat final reste figé au SHA
  `fed08f9be3954084c036a26355225f184896ba31`.
- Les quatre revues indépendantes `APPROVED` sont acceptées.
- Les validations locales, la CI PR et la CI post-fusion sont acceptées.
- Les descendants du candidat restent exclusivement documentaires.
- L’activation ultérieure d’Apple Wallet exige un nouveau Goal Engineering ou
  Goal d’activation explicitement accepté, puis un Production Run distinct
  explicitement autorisé.
- Les futurs Production Prerequisite et Production Deployment Runs sans Apple
  restent séparés et exigent chacun leur propre Event Founder.

La clôture Engineering de GOAL-008 ne crée, n’autorise et n’exécute aucun Production Run.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-18` | `N/A → Draft` | Codex | Création explicitement autorisée par le Founder; aucune mutation de production. |
| `2026-07-18` | `Draft → Ready` | Codex | Readiness Check complet : architecture, frontières, dépendances, critères, validations, Evidence et conditions d’arrêt sont explicites et vérifiables localement. |
| `2026-07-18` | `Ready → Running` | Codex | Phase 0 fusionnée en fast-forward via PR #45, CI PR et post-fusion vertes, protections Vercel actives et aucun déploiement créé; début de l’implémentation Engineering locale. |
| `2026-07-18` | `Running → Review` | Codex | AC-01 à AC-14 satisfaits sous gates de livraison, validations locales vertes, quatre revues indépendantes `APPROVED` et candidat figé au SHA `fed08f9be3954084c036a26355225f184896ba31`; push, CI, PR, fusion fast-forward et contrôles post-fusion restent à consigner sans autoriser `Done`. |
| `2026-07-18` | `Review → Done` | Fondateur (Melvyn) | Verdict fondateur APPROVED : PR #46 fusionnée en fast-forward au SHA 1a5268e81225e7149fcb6b1a1ee0c45ba202e0e2, CI PR et post-fusion vertes, AC-01 à AC-14 satisfaits, quatre revues indépendantes APPROVED, candidat applicatif fed08f9be3954084c036a26355225f184896ba31 figé et descendants exclusivement documentaires, sans Preview, déploiement ni mutation distante. |

## Livraison attendue

- Feature gate serveur, contrat API de capacité et gating frontend.
- Tests synthétiques et de non-régression.
- `docs/production/GOAL-008-prerequisite-readiness-report.md`.
- `docs/production/GOAL-008-prerequisite-execution-plan.md`.
- `docs/production/GOAL-008-deployment-execution-plan.draft.md`.
- `audits/GOAL-008-optional-apple-wallet-engineering.md`.
- Candidat applicatif figé et closeout documentaire accepté en `Done`.

## Clôture Engineering

- **Statut :** `Done`; verdict Founder `APPROVED` du `2026-07-18`.
- **Candidat figé :** `fed08f9be3954084c036a26355225f184896ba31`.
- **Revues :** architecture/gating, sécurité Apple, frontend/fidélité et séparation des Runs `APPROVED`.
- **Validations acceptées :** GOAL-008, GOAL-007 complet, sécurité, egress, migrations, bootstrap, types application/serveur/Edge, lint, builds, audits dépendances et CI GitHub verts.
- **Gel :** tout descendant du candidat est limité au Goal, aux documents et aux Evidence.
- **Production :** aucune mutation, aucun déploiement, aucun Preview et aucun nouveau Production Run.
