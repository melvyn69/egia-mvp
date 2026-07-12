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

À la clôture, les cinq collisions auront une stratégie déterministe documentée, les historiques local et distant auront une interprétation reproductible, les migrations existantes ne seront pas silencieusement réinterprétées et les futures PR ne pourront plus introduire de version dupliquée. Le dépôt contiendra un manifeste canonique, des contrôles automatisés, un runbook de préflight, un plan de récupération et une procédure de vérification post-production. GOAL-003 pourra passer de `Blocked` à `Ready` seulement si les Evidence établissent qu’il peut être appliqué sans masquer une divergence ; sinon le maintien de son blocage sera démontré.

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

## Sources de vérité et limites

| Source | Usage autorisé |
| --- | --- |
| Git et `supabase/migrations/` | Établir la provenance, les dépendances, les versions, les noms, les contenus locaux et les anomalies. |
| Historique du projet Supabase unique | Lecture passive complète des versions et noms appliqués. |
| Catalogue PostgreSQL système | Lecture passive des tables, colonnes, contraintes, index, fonctions, triggers, grants, policies et états RLS strictement nécessaires. |
| `audits/GOAL-004-supabase-migration-history-diagnostic.md` | Evidence du diagnostic initial et limites d’attribution. |

Sont interdits avant le gate : lecture de lignes métier, payloads, contenus utilisateur, secrets, jetons, variables d’environnement, données Auth ou Storage sensibles ; DDL, DML, DCL, `db push`, `migration repair`, modification de l’historique, RPC, endpoint, Edge Function, cron, déploiement ou changement de configuration.

## Stratégie à établir et décision

Les options suivantes doivent être évaluées avec bénéfice, risque, préconditions, impact sur les futures migrations, réversibilité ou récupération et besoin d’accès production : absence de réparation, migration prospective seule, renommage local, baselining, réparation contrôlée de l’historique, stratégie hybride et nouvelle chaîne canonique fondée sur l’état réel. La stratégie retenue ne sera pas présumée être une réparation d’historique ; elle devra être déterministe, sans perte de données, reproductible sur un environnement neuf, automatiquement vérifiable et accompagnée d’un plan de récupération lorsque l’inversion stricte est impossible.

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
| AC-07 | GOAL-003 reste bloqué ou devient `Ready` sur Evidence explicite. | VAL-07 | EV-07 |
| AC-08 | Tests projet et contrôles migration pertinents sont verts sans nouvelle erreur ou warning lié au changement. | VAL-08 | EV-08 |
| AC-09 | Une revue indépendante approuve le gate de production. | VAL-09 | EV-09 |
| AC-10 | Aucune mutation de production n’a eu lieu avant l’autorisation fondatrice. | VAL-10 | EV-10 |

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
2. Exécuter uniquement les mutations explicitement autorisées. — **arrêté avant mutation : mécanisme incapable de préserver la version locale**
3. Faire revoir indépendamment le blocage et le mécanisme corrigé. — **réalisé — `APPROVED FOR COMMIT`**

### Blocage du gate de production

Le préflight autorisé a confirmé le projet, les 97 entrées distantes, les cinq collisions, l’absence de `20260712120000`, la signature de la fonction et les grants vulnérables attendus. La migration locale et son SHA-256 correspondent au manifeste.

Le MCP Supabase `apply_migration` disponible accepte seulement un nom et une requête ; il génère sa propre version distante. Il ne peut donc pas inscrire exactement `20260712120000`. L’utiliser créerait une nouvelle entrée `REMOTE_ONLY` et violerait l’objectif même de GOAL-005. Le Run s’est arrêté avant tout appel de mutation.

Le mécanisme recommandé est désormais un `supabase db push --linked --dry-run` contrôlé, suivi du push réel seulement si la sortie propose exactement `20260712120000_secure_claim_review_analyze_jobs.sql` et aucune autre migration. Cette commande reste explicitement interdite par l’autorisation actuelle et exige une nouvelle autorisation fondatrice. Aucune réparation de ledger ne doit être autorisée.

## Readiness Check

| Point | État | Evidence / condition |
| --- | --- | --- |
| Projet unique | validé | `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production. |
| Diagnostic GOAL-004 | validé | Rapport accepté et Goal clôturé. |
| Données sensibles | exclues | Lecture limitée à l’historique et au catalogue système. |
| Mutations de production | bloquées | Autorisation reçue, mais mécanisme autorisé incapable de préserver `20260712120000`; aucune mutation exécutée. |
| Stratégie déterministe | validée localement | Hybride : baseline schema-only, ledger gelé et aucune réparation historique. |
| Garde-fous automatisés | validés localement | Manifeste, validateur, baseline checksum et CI versionnés. |
| Bootstrap isolé | validé localement | Baseline, 97 versions et GOAL-003 seule vérifiés dans une instance Docker distincte. |
| Revue indépendante | validée sur le blocage et le mécanisme corrigé | Verdict `APPROVED FOR COMMIT`; aucune mutation n’est autorisée par ce verdict. |

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-12` | N/A → `Draft` | Fondateur (Melvyn) | GOAL-004 accepté ; création autorisée pour réconcilier l’historique sans mutation de production. |
| `2026-07-12` | `Draft` → `Ready` | Codex | Contrat R3, scope, gates, AC/VAL/EV et conditions d’arrêt documentés. |
| `2026-07-12` | `Ready` → `Running` | Codex | Reconstruction passive et implémentation locale autorisées jusqu’au gate de mutation. |

## Définition de Done

GOAL-005 est `Done` seulement après réconciliation contrôlée autorisée, Evidence post-production, vérification indépendante, interprétation stable des historiques local et distant, contrôle automatisé des futures collisions et décision explicite sur la reprise de GOAL-003. Avant le gate, le Goal reste `Running`.
