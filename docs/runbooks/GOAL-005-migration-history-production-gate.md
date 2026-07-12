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

## Mutations de production prévues après autorisation fondatrice distincte

Une seule migration est autorisable : `20260712120000_secure_claim_review_analyze_jobs.sql`. Elle doit être soumise à l’API de gestion Supabase **`apply_migration`**, avec ce nom de migration et les octets dont le SHA-256 est figé par le manifeste. Cette opération unique exécute la migration dans sa transaction et enregistre uniquement la version `20260712120000` dans le ledger ; l’opération s’arrête si elle ne peut pas garantir ce couple migration/version. Elle ne contient ni DDL ni DML et effectue exclusivement, sur la signature exacte :

1. `REVOKE EXECUTE` à `PUBLIC` ;
2. `REVOKE EXECUTE` à `anon` ;
3. `REVOKE EXECUTE` à `authenticated` ;
4. `GRANT EXECUTE` à `service_role`.

Il n’est prévu **aucun** `supabase migration repair`, `db push` global, changement de version historique, baseline appliqué à la production, modification de RLS, policy, fonction, contrainte, index, configuration ou donnée. Si l’API ne peut pas appliquer cette seule migration et enregistrer cette seule version, le Run s’arrête sans mutation.

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
