# GOAL-006 — Corriger la résolution `pgcrypto` du claim IA

## Métadonnées

- **ID :** `GOAL-006`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-16`
- **Risque :** `R2` — correctif SQL local et versionné, sans mutation distante.

## Valeur business

Rétablir le traitement IA borné des avis sans élargir les privilèges ni
affaiblir les frontières de sécurité préparées par GOAL-002.

## Diagnostic

`pgcrypto` est disponible dans le schéma `extensions`. La fonction
`public.claim_ai_tag_candidates(integer, text, text)` est
`SECURITY DEFINER`, mais impose `search_path=public` et appelle deux fois
`digest` sans qualification. Son chemin d'exécution ne voit donc pas
`extensions.digest(text,text)` et échoue avec `digest(text, unknown) does not
exist`.

Le littéral `unknown` n'est pas la cause racine : PostgreSQL peut le convertir
vers le second argument `text` après résolution d'un candidat. Ici, aucun
candidat n'est visible dans le `search_path` effectif. L'extension est présente
et fonctionnelle; elle ne doit être ni déplacée, ni recréée.

## Scope

- Ajouter une migration prospective qui recrée uniquement la RPC concernée.
- Qualifier directement les deux appels avec `extensions.digest`.
- Fixer le `search_path` privilégié à `pg_catalog`.
- Conserver signature, retour, filtres, verrouillage, plafond et sémantique.
- Conserver `SECURITY DEFINER`, révoquer `PUBLIC`, `anon`, `authenticated` et
  accorder uniquement `service_role`.
- Ajouter des tests statiques, fonctionnels et d'abus sur base locale isolée.
- Vérifier la baseline GOAL-005 et le migration-history guard.
- Faire réaliser une revue indépendante et intégrer le correctif dans `main`.

## Hors-scope

- Toute mutation Supabase distante ou application de la migration.
- Tout déploiement Edge Function ou Vercel.
- Toute modification cron-job.org, secret, donnée ou compte de production.
- Tout déplacement ou changement de schéma de `pgcrypto`.
- Toute modification fonctionnelle du worker IA ou des cadences.

## Critères d'acceptation

| ID | Critère |
| --- | --- |
| AC-01 | L'appel local de la RPC ne produit plus l'erreur `digest(text, unknown)`. |
| AC-02 | Les deux appels utilisent `extensions.digest` avec arguments `text`. |
| AC-03 | La fonction utilise uniquement `search_path=pg_catalog`. |
| AC-04 | Seul `service_role` conserve `EXECUTE`. |
| AC-05 | Un schéma attaquant placé en tête du `search_path` appelant ne détourne pas `digest`. |
| AC-06 | Filtre localisation, détection de contenu modifié, verrouillage et plafond 20 restent conformes. |
| AC-07 | La migration prospective est admise par la baseline et les guards GOAL-005. |
| AC-08 | Revue indépendante et CI rendent un verdict sans demande ouverte. |
| AC-09 | Aucune mutation distante n'a lieu pendant GOAL-006. |

## Evidence attendues

- Migration
  `supabase/migrations/20260716142352_fix_claim_ai_tag_candidates_digest.sql`.
- Test statique `scripts/test-goal-006-claim-ai-tag-candidates.mjs`.
- Test SQL transactionnel
  `supabase/tests/goal006_claim_ai_tag_candidates.sql`.
- Sorties du bootstrap canonique, migration-history guard, tests projet,
  sécurité production, lint, typecheck, build et `git diff --check`.
- Rapport `audits/GOAL-006-fix-claim-ai-tag-candidates-digest.md`.
- PR et checks GitHub verts.

## Dépendances

- GOAL-005 : `Done`; baseline et chaîne prospective disponibles.
- GOAL-002 : reste `Blocked` uniquement jusqu'à la clôture de GOAL-006.
- Autorisation de production : absente et non nécessaire pour ce Goal.

## Journal de statut

| Date | Transition | Raison |
| --- | --- | --- |
| `2026-07-16` | N/A → `Draft` | Goal séparé demandé par le fondateur. |
| `2026-07-16` | `Draft` → `Ready` | Cause reproductible, scope et interdictions établis. |
| `2026-07-16` | `Ready` → `Running` | Implémentation locale, tests, revue et intégration Git autorisés. |

## Définition de Done

Le fondateur peut décider `Review → Done` après fusion dans `main`, CI verte,
diagnostic exact et revue indépendante approuvée. Cette transition autorise
ensuite la proposition de reprise de GOAL-002, mais aucune mutation de
production par elle-même.
