# GOAL-005 — Gate de production : réconciliation de l’historique

## Stratégie retenue

La stratégie est **hybride, sans réparation de l’historique de production** : le ledger legacy est gelé et documenté par `supabase/migration-history/canonical-manifest.json`; un baseline schema-only du `public` réel est versionné pour les environnements neufs ; les migrations futures sont prospectives et contrôlées. Les cinq collisions ne sont ni renommées ni rejouées en production. Cette décision évite de réinterpréter silencieusement les versions historiques, notamment le SQL distant opaque `20260221193000`.

La chaîne de production existante conserve ses versions appliquées. La chaîne de bootstrap est le baseline `supabase/baselines/20260712-production-public-schema.sql`, dont le checksum est contrôlé automatiquement ; elle ne contient aucune ligne applicative et n’est pas une migration à appliquer à la production.

## Préflight obligatoire (lecture seule)

1. Vérifier l’identité `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production.
2. Exécuter `node scripts/validate-supabase-migration-history.mjs` et exiger le checksum du baseline attendu.
3. Lire l’historique distant complet et vérifier 97 entrées, les cinq collisions documentées et l’absence de `20260712120000`.
4. Vérifier au catalogue la signature exacte de `public.claim_review_analyze_jobs(integer, text, text)`, son état `SECURITY DEFINER`, son `search_path` et ses grants ; ne lire aucune ligne de table.
5. Arrêter sans mutation si l’identité, l’historique, le baseline, le checksum de la migration GOAL-003 ou un prérequis diffère.

## Mécanisme de production et condition d’arrêt constatée

Une seule migration est autorisable : `20260712120000_secure_claim_review_analyze_jobs.sql`. Le préflight du `2026-07-12` a établi que le MCP Supabase **`apply_migration`** disponible ne peut pas l’appliquer en préservant sa version : l’outil accepte seulement `name` et `query`, puis génère sa propre version distante. Son utilisation créerait une entrée `REMOTE_ONLY` et est donc interdite par ce gate. Le Run a été arrêté avant mutation.

Le mécanisme recommandé pour une nouvelle autorisation est :

1. exécuter `supabase db push --linked --dry-run` et exiger qu’il propose exactement `20260712120000_secure_claim_review_analyze_jobs.sql`, sans autre migration ;
2. arrêter sans mutation si le dry-run propose un autre fichier, une réparation, un changement historique ou une opération supplémentaire ;
3. seulement après un dry-run exact et une autorisation fondatrice couvrant explicitement `db push`, exécuter le push lié ;
4. relire immédiatement le ledger et exiger l’unique nouvelle version `20260712120000`.

La migration ne contient ni DDL ni DML et effectue exclusivement, sur la signature exacte :

1. `REVOKE EXECUTE` à `PUBLIC` ;
2. `REVOKE EXECUTE` à `anon` ;
3. `REVOKE EXECUTE` à `authenticated` ;
4. `GRANT EXECUTE` à `service_role`.

Il n’est prévu **aucun** `supabase migration repair`, `--include-all`, changement de version historique, baseline appliqué à la production, modification de RLS, policy, fonction, contrainte, index, configuration ou donnée. Une application SQL directe sans inscription correcte au ledger est également interdite. L’autorisation du `2026-07-12` interdisait tout `db push`; elle n’a donc permis que le préflight et s’est terminée sans mutation.

## Vérifications post-production

1. Relire passivement l’historique : `20260712120000` doit apparaître une seule fois.
2. Relire les grants de la signature exacte : `service_role` seul ; absence de `PUBLIC`, `anon` et `authenticated`.
3. Relire la signature, `SECURITY DEFINER` et `search_path` : aucun changement de corps ou paramètre n’est attendu.
4. Vérifier les deux workers légitimes selon le contrat GOAL-003, sans RPC, endpoint ni lecture de payload.
5. Conserver les Evidence et faire réaliser la revue post-déploiement indépendante avant toute reprise de GOAL-003.

## Récupération et rollback

La migration de sécurité est une réduction de privilèges : son rollback ne doit jamais rétablir `EXECUTE` pour `PUBLIC`, `anon` ou `authenticated`. Si un worker `service_role` échoue, arrêter le Run, conserver les Evidence et demander une nouvelle autorisation fondatrice pour toute action corrective. Aucun rollback manuel, repair ou grant élargi n’est permis par ce runbook.

## Bootstrap d’un environnement neuf

1. Dans un environnement neuf et isolé, exécuter `npm run test:canonical-bootstrap` et exiger 97 versions, le hash de set `621e061b770369d578344a2d7e9bbd1825ee275bd2065a87834cc94ffde27d39` et le checksum du baseline.
2. Pour un bootstrap réel, lancer `GOAL5_BOOTSTRAP_TARGET=isolated CANONICAL_DATABASE_URL="$CANONICAL_DATABASE_URL" bash scripts/bootstrap-goal-005-canonical.sh`. Le script charge le baseline, marque les 97 versions **une par une** et fait d’abord un `db push --dry-run`.
3. Le script refuse toute proposition différente de `20260712120000_secure_claim_review_analyze_jobs.sql`, puis applique seulement cette migration. Toute écriture de ledger est interdite sur la production.
4. Vérifier que le ledger contient exactement les 97 versions de baseline plus `20260712120000`, puis produire l’Evidence de catalogue. Les migrations futures sont ajoutées après cette version et soumises au validateur CI.

Le bootstrap est une procédure distincte de la production existante : il ne prétend pas que les cinq migrations historiques ont le même contenu que les fichiers locaux actuels. Il initialise explicitement son ledger à partir du baseline réel afin qu’un futur `db push` ne rejoue jamais les 98 migrations legacy.
