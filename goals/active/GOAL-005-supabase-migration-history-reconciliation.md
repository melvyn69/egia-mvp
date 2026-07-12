# GOAL-005 — Réconcilier l’historique des migrations Supabase

## Métadonnées

- **ID :** `GOAL-005`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-12`
- **Date de clôture :** `N/A`
- **Niveau de risque :** `R3` — la préparation est locale ou passive ; toute mutation de production exige une autorisation fondatrice distincte après revue indépendante.

## Valeur business

Restaurer une source de vérité fiable entre le dépôt et Supabase afin de sécuriser les futurs déploiements, empêcher les collisions de versions et rendre le correctif de sécurité GOAL-003 déployable sans perte de données, régression ou incohérence d’historique.

## Résultat attendu

À la clôture, les cinq collisions ont une stratégie déterministe documentée, les historiques local et distant ont une interprétation reproductible, les migrations existantes ne peuvent pas être silencieusement réinterprétées et les futures PR ne peuvent plus introduire de collision ou contourner les garde-fous. Le dépôt contient un manifeste canonique, une baseline schema-only, un ledger historique gelé, des contrôles automatisés exécutés depuis une base de confiance, des runbooks de préflight et d’auteur, un plan de récupération et une procédure de vérification post-production. GOAL-003 a été appliqué, vérifié indépendamment puis clôturé en `Done`. La reprise de GOAL-002 peut être proposée au fondateur après clôture de GOAL-005.

## Contexte confirmé

GOAL-004, clôturé le `2026-07-12`, a établi passivement sur le projet unique `fhadiwkdznhuxtlgrwfd` (`egia-mvp`, production) : 98 migrations locales, 97 entrées distantes, 92 correspondances nominales, cinq `VERSION_COLLISION`, une migration `LOCAL_ONLY` et aucune `REMOTE_ONLY`. Le contenu SQL distant n’est pas présumé disponible ; l’état réel de catalogue et l’historique Git doivent être confrontés avant toute décision.

| Version | Nom local | Nom distant | État initial |
| --- | --- | --- | --- |
| `20260219120000` | `ai_run_history_rls` | `automation_rules_schema` | collision confirmée |
| `20260219123000` | `automation_rules_schema` | `fix_cron_state_rls` | collision confirmée |
| `20260219130000` | `ai_jobs_queue` | `drop_alerts_unique_rule_per_review` | collision confirmée ; effets `ai_jobs` d’attribution ambiguë |
| `20260219133000` | `drop_alerts_unique_rule_per_review` | `user_roles_is_admin` | collision confirmée |
| `20260221193000` | `remote_history_placeholder` | `fix_rpc_ai_jobs_user_filter` | collision confirmée |
| `20260712120000` | `secure_claim_review_analyze_jobs` | — | `LOCAL_ONLY`, GOAL-003 non appliqué |

Cette dernière ligne décrit l’état initial capturé par GOAL-004 et par le manifeste du `2026-07-12`. Après le Run de production autorisé, la version `20260712120000` est présente une fois dans le ledger distant sous le nom `secure_claim_review_analyze_jobs`.

## Sources de vérité et limites

| Source | Usage autorisé |
| --- | --- |
| Git et `supabase/migrations/` | Établir la provenance, les dépendances, les versions, les noms, les contenus locaux et les anomalies. |
| Historique du projet Supabase unique | Lecture passive complète des versions et noms appliqués. |
| Catalogue PostgreSQL système | Lecture passive des tables, colonnes, contraintes, index, fonctions, triggers, grants, policies et états RLS strictement nécessaires. |
| `audits/GOAL-004-supabase-migration-history-diagnostic.md` | Evidence du diagnostic initial et limites d’attribution. |

Sont interdits avant le gate : lecture de lignes métier, payloads, contenus utilisateur, secrets, jetons, variables d’environnement, données Auth ou Storage sensibles ; DDL, DML, DCL, `db push`, `migration repair`, modification de l’historique, RPC, endpoint, Edge Function, cron, déploiement ou changement de configuration.

## Stratégie retenue et décision

L’analyse a retenu une stratégie hybride sans réparation du ledger de production : une baseline schema-only matérialise le schéma observé, 97 versions historiques antérieures à GOAL-003 forment le ledger de bootstrap gelé, et GOAL-003 puis chaque migration future constituent une chaîne prospective réellement exécutée dans l’ordre. Le manifeste conserve les faits et checksums capturés sans prétendre être un état distant vivant. Le validateur et le workflow de confiance rendent cette interprétation déterministe, reproductible et automatiquement vérifiable.

## Scope

- Reconstituer la chronologie des cinq collisions avec Git, les migrations adjacentes, l’historique distant et le catalogue.
- Identifier les dépendances de schéma, les migrations vides, les noms réutilisés et les risques de `db push` ou CI/CD futur.
- Versionner un manifeste canonique et un validateur qui bloque versions dupliquées, réutilisation de noms non autorisée, migrations vides non déclarées et divergence de la chaîne connue.
- Versionner tests, préflight, vérification post-production, plan de récupération et Evidence de la stratégie retenue.
- Préparer, sans l’exécuter, le plan exact des mutations de production nécessaires à la réconciliation puis à GOAL-003.
- Faire réaliser une revue indépendante jusqu’au verdict `APPROVED FOR PRODUCTION GATE`.

## Hors-scope avant autorisation fondatrice au gate

- Toute modification de Supabase production, incluant l’application d’une migration, `supabase db push`, `supabase migration repair`, modification de `supabase_migrations.schema_migrations`, DDL, DML, DCL, grant, policy, RLS, fonction, index, contrainte ou configuration.
- L’application en production de `20260712120000_secure_claim_review_analyze_jobs`.
- Toute correction de produit non nécessaire à la réconciliation et à la sécurité de GOAL-003.

## Critères d’acceptation, validations et Evidence

| ID | Critère observable | Validation | Evidence |
| --- | --- | --- | --- |
| AC-01 | Les cinq collisions et la migration GOAL-003 locale seule sont exhaustivement couvertes. | VAL-01 | EV-01 |
| AC-02 | La stratégie retenue est déterministe et ne réinterprète aucune migration sans Evidence. | VAL-02 | EV-02 |
| AC-03 | Une chaîne locale canonique et une procédure de bootstrap reproductible sont définies. | VAL-03 | EV-03 |
| AC-04 | Les futures collisions, doublons, noms réutilisés et fichiers vides non déclarés échouent automatiquement. | VAL-04 | EV-04 |
| AC-05 | Le plan de production est limité, ordonné, vérifiable et sans perte de données. | VAL-05 | EV-05 |
| AC-06 | Un plan de rollback ou de récupération est documenté pour chaque mutation prévue. | VAL-06 | EV-06 |
| AC-07 | La migration GOAL-003 est appliquée et vérifiée, puis GOAL-003 est clôturé en `Done` sur Evidence explicite. | VAL-07 | EV-07 |
| AC-08 | Tests projet et contrôles migration pertinents sont verts sans nouvelle erreur ou warning lié au changement. | VAL-08 | EV-08 |
| AC-09 | Une revue indépendante approuve le durcissement final et le passage de GOAL-005 à `Review`. | VAL-09 | EV-09 |
| AC-10 | Aucune mutation de production n’a eu lieu avant l’autorisation fondatrice. | VAL-10 | EV-10 |

### Validations

| ID | Méthode |
| --- | --- |
| VAL-01 | Comparer le manifeste, le rapport GOAL-004 et l’inventaire local ; vérifier les cinq collisions et la capture `LOCAL_ONLY` de GOAL-003. |
| VAL-02 | Vérifier les checksums immuables du manifeste, son sens de snapshot et l’absence de réparation historique. |
| VAL-03 | Générer le plan canonique ; vérifier 97 `baselineLedgerVersions`, la chaîne prospective ordonnée et les garde-fous loopback/base vide. |
| VAL-04 | Exécuter les tests adversariaux du validateur et du bootstrap, incluant doublons, backdating, renommage, suppression, migrations sans SQL et neutralisation des contrôles. |
| VAL-05 | Vérifier le dry-run historique, l’unique migration appliquée et le ledger post-production à 98 entrées. |
| VAL-06 | Vérifier les procédures d’arrêt et de récupération sans repair ni restauration de grants publics. |
| VAL-07 | Vérifier le journal et les Evidence de GOAL-003 jusqu’à sa clôture fondatrice en `Done`. |
| VAL-08 | Exécuter les tests migration, tests projet, typecheck, lint, build et contrôles whitespace. |
| VAL-09 | Obtenir une revue indépendante en lecture seule de l’ensemble des garde-fous et Evidence. |
| VAL-10 | Vérifier la chronologie des autorisations et l’absence d’opération Supabase pendant le durcissement final. |

### Evidence

| ID | Preuve |
| --- | --- |
| EV-01 | `supabase/migration-history/canonical-manifest.json` et audit GOAL-005. |
| EV-02 | Checksums du manifeste, baseline et migration GOAL-003 ; absence de `migration repair`. |
| EV-03 | `scripts/plan-goal-005-canonical-bootstrap.mjs`, bootstrap canonique et runbook de production. |
| EV-04 | Validateur, guard lock, workflow de confiance, `CODEOWNERS`, guide d’auteur et suites adversariales. |
| EV-05 | Evidence de production documentée : dry-run exact, ledger à 98, signature et grants conformes. |
| EV-06 | Sections arrêt/récupération des runbooks GOAL-005. |
| EV-07 | GOAL-003 `Done` au `2026-07-12` après verdict `APPROVED FOR FOUNDER CLOSURE`. |
| EV-08 | Sorties locales et checks GitHub consignés lors de l’intégration finale. |
| EV-09 | Verdict de revue indépendante du durcissement final. |
| EV-10 | Journal GOAL-005 et confirmation d’absence de nouvel accès Supabase pendant le Run 5. |

## Plan de Runs

### Run 1 — Reconstruction et stratégie passive

1. Vérifier l’identité du projet unique et lire passivement son historique complet. — **réalisé**
2. Recalculer l’inventaire local et confronter Git, migrations, catalogue et dépendances. — **réalisé**
3. Documenter la stratégie unique et ses alternatives, sans mutation. — **réalisé — hybride baseline + ledger gelé**

### Run 2 — Garde-fous locaux et reproductibilité

1. Écrire le manifeste canonique, le validateur et les tests de non-régression. — **réalisé**
2. Écrire le préflight, la vérification post-production et le plan de récupération. — **réalisé**
3. Vérifier les validations projet applicables. — **réalisé**

### Run 3 — Revue et intégration

1. Faire réaliser la revue indépendante du contrat, de la stratégie et de l’implémentation. — **réalisé — `APPROVED FOR PRODUCTION GATE`**
2. Corriger les demandes de revue et intégrer les changements Git sans mutation Supabase. — **réalisé**

### Run 4 — Gate de production (autorisation fondatrice distincte)

1. Présenter le Founder Brief avec opérations, ordre, arrêts, vérifications et récupération exacts. — **réalisé ; autorisation reçue**
2. Exécuter uniquement les mutations explicitement autorisées. — **premier mécanisme arrêté avant mutation ; reprise `db push --linked` autorisée et réalisée conformément**
3. Faire revoir indépendamment le blocage et le mécanisme corrigé. — **réalisé — `APPROVED FOR COMMIT`**
4. Vérifier passivement l’application exacte, le ledger, la fonction et les grants. — **réalisé, conforme**
5. Faire réaliser la vérification indépendante finale de production. — **réalisé — `APPROVED FOR FOUNDER CLOSURE`**

### Run 5 — Durcissement durable et clôture technique

1. Séparer le ledger historique gelé de la chaîne prospective afin que toute migration future soit réellement exécutée. — **réalisé**
2. Bloquer modifications, suppressions, renommages, backdating, fichiers non suivis ou sans SQL et neutralisation des garde-fous. — **réalisé localement**
3. Vérifier le bootstrap uniquement sur une base loopback vide, son dry-run exact et son ledger final. — **réalisé localement**
4. Exécuter les contrôles CI depuis la branche de base de confiance et protéger `main` avec checks requis, historique linéaire, sans force-push ni suppression. — **à confirmer après intégration Git**
5. Obtenir la revue indépendante, intégrer les changements et soumettre GOAL-005 au verdict fondateur. — **revue `APPROVED FOR INTEGRATION`; intégration en cours**

### Blocage du gate de production

Le préflight autorisé a confirmé le projet, les 97 entrées distantes, les cinq collisions, l’absence de `20260712120000`, la signature de la fonction et les grants vulnérables attendus. La migration locale et son SHA-256 correspondent au manifeste.

Le MCP Supabase `apply_migration` disponible accepte seulement un nom et une requête ; il génère sa propre version distante. Il ne peut donc pas inscrire exactement `20260712120000`. L’utiliser créerait une nouvelle entrée `REMOTE_ONLY` et violerait l’objectif même de GOAL-005. Le Run s’est arrêté avant tout appel de mutation.

Le mécanisme recommandé a ensuite été explicitement autorisé : `supabase db push --linked --dry-run` a proposé uniquement `20260712120000_secure_claim_review_analyze_jobs.sql`, puis un second préflight identique a précédé le push réel. Le ledger contient maintenant 98 entrées avec cette unique nouvelle version. Aucune réparation de ledger n’a été réalisée.

## Readiness Check

| Point | État | Evidence / condition |
| --- | --- | --- |
| Projet unique | validé | `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production. |
| Diagnostic GOAL-004 | validé | Rapport accepté et Goal clôturé. |
| Données sensibles | exclues | Lecture limitée à l’historique et au catalogue système. |
| Mutations de production | réalisées dans le périmètre | Une seule migration appliquée sous `20260712120000`; quatre DCL autorisées, aucune autre entrée ni opération. |
| Stratégie déterministe | validée localement | Hybride : baseline schema-only, ledger gelé et aucune réparation historique. |
| Garde-fous automatisés | validés localement | Manifeste, validateur base-aware, guard lock, workflow de confiance et tests adversariaux versionnés. |
| Bootstrap isolé | validé localement | 97 versions historiques séparées de GOAL-003 et des migrations futures ; base loopback vide et dry-run exact exigés. |
| État GOAL-003 | clôturé | GOAL-003 est `Done` après application, vérification et verdict fondateur. |
| Protection GitHub | en attente d’intégration | Checks `build` et `migration-history-guard`, historique linéaire, force-push et suppression interdits. |
| Revue indépendante Run 5 | validée | Verdict `APPROVED FOR INTEGRATION`; aucun P0/P1/P2 restant. |

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-12` | N/A → `Draft` | Fondateur (Melvyn) | GOAL-004 accepté ; création autorisée pour réconcilier l’historique sans mutation de production. |
| `2026-07-12` | `Draft` → `Ready` | Codex | Contrat R3, scope, gates, AC/VAL/EV et conditions d’arrêt documentés. |
| `2026-07-12` | `Ready` → `Running` | Codex | Reconstruction passive et implémentation locale autorisées jusqu’au gate de mutation. |

## Définition de Done

GOAL-005 est `Done` seulement après réconciliation contrôlée autorisée, Evidence post-production, vérification indépendante, interprétation stable des historiques local et distant, contrôles durables des futures collisions depuis une base de confiance, protection effective de `main` et verdict fondateur explicite. GOAL-005 passe d’abord de `Running` à `Review`. Sa clôture peut ensuite proposer la reprise de GOAL-002 ; elle ne l’autorise pas implicitement.
