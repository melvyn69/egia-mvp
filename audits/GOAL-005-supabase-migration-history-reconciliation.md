# GOAL-005 — Evidence de réconciliation de l’historique des migrations

## Portée du Run 1

Le Run 1 a lu passivement le projet unique `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production, son historique de migrations et les métadonnées de catalogue nécessaires. Le projet retourné est `ACTIVE_HEALTHY`, PostgreSQL 17.6.1. Aucune ligne applicative, payload, contenu utilisateur, secret, jeton, variable d’environnement, donnée Auth ou Storage sensible n’a été lue.

Aucune DDL, DML, DCL, migration, réparation d’historique, grant, policy, RLS, fonction, contrainte, index, configuration, RPC, endpoint, cron ou Edge Function n’a été modifié ou invoqué en production.

## Historique et catalogue observés

- Historique distant : 97 versions, dont les cinq collisions documentées par GOAL-004 ; `20260712120000` reste absente.
- Le CLI `supabase migration list --linked` confirme qu’il compare les **versions**, non les noms : il ne peut pas à lui seul détecter ou expliquer une collision de noms.
- Le catalogue confirme l’existence et les propriétés nécessaires des objets `automation_conditions`, `automation_actions`, `cron_state`, `ai_jobs`, `alerts`, `user_roles` et `ai_run_history`, sans établir leur provenance par version.
- `public.ai_jobs` existe avec huit colonnes, RLS active, l’index `ai_jobs_status_created_at_idx`, le trigger Google et des objets ultérieurs ; cela ne prouve pas que la migration locale `20260219130000_ai_jobs_queue` a été appliquée sous cette version.
- L’index et la contrainte `alerts_unique_rule_per_review` sont absents ; cette absence ne prouve pas le SQL exact de la version distante `20260219130000`.

## Cause Git établie

| Version distante | Evidence Git locale | Conclusion |
| --- | --- | --- |
| `20260219120000` / `automation_rules_schema` | Créée par `8dcdb04`, puis renommée `191200 → 191230` dans `ea8ee2f`. | Version locale réutilisée après renommage. |
| `20260219123000` / `fix_cron_state_rls` | Créée par `1a37338`, puis renommée `191230 → 191245` dans `ea8ee2f`. | Version locale réutilisée après renommage. |
| `20260219130000` / `drop_alerts_unique_rule_per_review` | Créée par `751f422`, renommée `191300 → 191330` dans `776993e`; `52aa638` crée ensuite `191300_ai_jobs_queue`. | Version locale réutilisée après renommage. |
| `20260219133000` / `user_roles_is_admin` | Créée par `ea767ee`, supprimée comme déjà appliquée dans `af7e251`. | SQL Git prouvé, mais non présent dans le ledger local actuel. |
| `20260221193000` / `fix_rpc_ai_jobs_user_filter` | Aucun objet Git atteignable ou dangling ne contient ce SQL ; `3109792` ajoute seulement le placeholder local. | Migration distante opaque. |

La migration `20260219124500_fix_cron_state_rls.sql` a ensuite été modifiée par `bc461781`; son contenu courant ne peut pas être recopié sous `20260219123000` sans réécrire l’histoire.

## Anomalie de dépôt corrigée

Deux no-op placeholders `remote_schema` existaient sous `supabase/migrations/` mais étaient ignorés par Git tout en étant lus par le CLI : un clone propre n’aurait pas eu les mêmes versions locales. Ils sont désormais explicitement versionnés, checksumés dans le manifeste et seules ces deux exceptions historiques sont admises. L’inventaire reproductible contient ainsi 98 migrations versionnées.

## Stratégie retenue : hybride baseline + ledger gelé

1. Le ledger `supabase/migrations/` historique reste inchangé dans son sens et est gelé jusqu’à `20260712120000` par commit d’ancrage et SHA-256 ; aucune collision ne sera renommée ou rejouée.
2. `supabase/migration-history/canonical-manifest.json` conserve la provenance Git, les cinq collisions, les exceptions historiques, la migration GOAL-003 locale seule et le checksum du baseline.
3. `supabase/baselines/20260712-production-public-schema.sql` est un dump `public` schema-only de 139 756 octets, SHA-256 `d2fb33345efcb5ed28e999c93fcf99a19cbd0a313d33be56e76ac11d7a1592d0`, sans section `Data for Name` ni commande `COPY`. C’est la référence de bootstrap d’un environnement neuf, jamais une migration de production.
4. Les migrations futures doivent être strictement postérieures à `20260712120000`, uniques et non vides ; la CI exécute le validateur et interdit tout changement des migrations gelées.
5. Aucune réparation de l’historique Supabase n’est retenue : elle ne reconstituerait pas le SQL opaque `20260221193000` et risquerait de marquer des DDL non démontrés.

## Impact sur GOAL-003

`20260712120000_secure_claim_review_analyze_jobs.sql` demeure immuable et `LOCAL_ONLY`. Le ledger, le baseline, le manifeste et le runbook permettent de préparer son application isolée. GOAL-003 reste `Blocked` : le préflight de production est conforme, mais le MCP `apply_migration` ne peut pas préserver la version locale et son utilisation créerait une nouvelle entrée distante orpheline.

## Bootstrap isolé exécuté

Le bootstrap a été exécuté dans une instance Supabase Docker distincte du projet local existant et de la production. Après chargement du baseline, les 97 versions ont été marquées `applied` une par une (le CLI 2.67 ne prend pas de liste de versions), puis `db push` n’a proposé et appliqué que `20260712120000_secure_claim_review_analyze_jobs.sql`. Le ledger isolé contient 98 versions, dont les cinq collisions et GOAL-003 une seule fois. Le catalogue isolé confirme `service_role` et le propriétaire `postgres` pour la fonction, sans `PUBLIC`, `anon` ni `authenticated`.

## Gate de production tenté, arrêté sans mutation

Après autorisation distincte, le préflight passif a confirmé l’identité, les 97 versions distantes, les cinq collisions, l’absence de `20260712120000`, le SHA-256 local, la signature et les grants vulnérables attendus. Le MCP `apply_migration` disponible ne fournit toutefois aucun paramètre permettant d’inscrire `20260712120000`; il génère sa propre version distante. L’appel n’a pas été exécuté, car il aurait créé une entrée `REMOTE_ONLY`.

Le mécanisme recommandé pour une autorisation ultérieure est un `supabase db push --linked --dry-run`, puis le push réel uniquement si le plan contient exactement `20260712120000_secure_claim_review_analyze_jobs.sql`. Cette commande était explicitement interdite par l’autorisation reçue. Aucun `db push`, `apply_migration`, repair, DCL, DDL, DML, changement de ledger, baseline, RLS, policy, fonction, donnée ou configuration n’a été exécuté.

La revue indépendante du blocage et de la procédure corrigée a rendu `APPROVED FOR COMMIT`. Elle confirme l’absence de mutation, les statuts des quatre Goals et le caractère minimal du `db push --linked --dry-run` suivi d’un push uniquement si GOAL-003 est l’unique migration proposée.

La récupération ne doit jamais rétablir un grant public. Un incident worker impose l’arrêt et une nouvelle autorisation fondatrice, avec Evidence conservées.

## Evidence locales

- `node scripts/validate-supabase-migration-history.mjs` vérifie le baseline, les SHA-256, les collisions, les fichiers gelés, les noms réutilisés et les fichiers vides.
- `.github/workflows/ci.yml` exécute ce validateur avec l’historique Git complet et la base de PR lorsque disponible.
- `docs/runbooks/GOAL-005-migration-history-production-gate.md` définit préflight, mutations exhaustives, arrêts, vérifications et récupération.

## Limites explicitement conservées

Le SQL distant de `20260221193000` reste indisponible. Le baseline réel et le ledger explicite rendent cette absence non bloquante pour le bootstrap, mais aucune attribution historique supplémentaire n’est affirmée. Le bootstrap de test ne constitue pas une autorisation de production.
