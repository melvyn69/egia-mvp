# GOAL-005 — Création et contrôle des migrations futures

## Modèle canonique

La baseline `supabase/baselines/20260712-production-public-schema.sql` matérialise le schéma `public` observé au moment de la capture, sans donnée. Son ledger de bootstrap contient exactement les 97 versions historiques antérieures à `20260712120000`. La chaîne prospective commence par `20260712120000_secure_claim_review_analyze_jobs.sql`, puis contient chaque migration future réellement exécutée dans l’ordre.

Le manifeste est une Evidence historique immuable, pas un état distant vivant. L’état post-réconciliation courant est documenté dans `audits/GOAL-005-supabase-migration-history-reconciliation.md`.

## Règles d’auteur

1. Créer la migration avec `supabase migration new <nom_lowercase_ascii>`.
2. Utiliser une version à 14 chiffres strictement supérieure à la version maximale déjà présente sur la branche de base.
3. Employer uniquement un nom `[a-z0-9]+(?:_[a-z0-9]+)*` et un fichier SQL régulier suivi par Git.
4. Ne jamais modifier, renommer ou supprimer une migration déjà fusionnée, historique ou prospective.
5. Ne jamais ajouter une migration vide, whitespace-only, semicolon-only ou comment-only.
6. Conserver les snapshots et fichiers temporaires hors de `supabase/migrations/`, sous `supabase/snapshots/` si nécessaire.
7. Ne jamais modifier le manifeste, le guard lock ou les scripts/workflows de garde sans override administratif explicitement autorisé et nouvelle revue indépendante.

## Validations locales obligatoires

```bash
npm run test:migration-history
npm run test:migration-history:adversarial
npm run test:canonical-bootstrap
npm run test:canonical-bootstrap:guards
git diff --check
```

Le plan de bootstrap doit toujours conserver 97 `baselineLedgerVersions`. `prospectiveMigrations` doit commencer par GOAL-003 et inclure, dans l’ordre, toutes les migrations ultérieures. Une migration future valide augmente uniquement cette liste prospective ; elle ne doit jamais être marquée `applied` par le baseline.

## Enforcement GitHub

- `CI / build` exécute le validateur sur les PR et compare aussi chaque push à son commit précédent.
- `Migration History Guard / migration-history-guard` s’exécute via `pull_request_target` depuis la branche de base de confiance ; il ne lance aucun code de la PR.
- `supabase/migration-history/guard-lock.json` rend le validateur, le manifeste, le bootstrap, le validateur de dry-run, le workflow dédié et `CODEOWNERS` immuables après intégration.
- `main` doit exiger les checks `build` et `migration-history-guard`, l’historique linéaire, et interdire force-push et suppression.
- Un commit sans ces checks ne doit pas pouvoir atteindre `main`, y compris par push direct.

## Bootstrap canonique

Le bootstrap réel est limité à une base loopback vide et jetable. Le script refuse le projet de production connu, tout hôte distant, toute table `public` existante et tout ledger non vide. Il charge la baseline, inscrit seulement les 97 versions qu’elle matérialise, exige que le dry-run corresponde exactement à `prospectiveMigrations`, applique cette chaîne, puis compare le ledger final au plan.

En cas d’échec, jeter et recréer la base isolée. Aucun repair de production, renommage historique ou élargissement de grant n’est une méthode de récupération autorisée.
