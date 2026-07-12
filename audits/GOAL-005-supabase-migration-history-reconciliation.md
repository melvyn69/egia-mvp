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

`20260712120000_secure_claim_review_analyze_jobs.sql` demeure immuable. Le manifeste conserve explicitement l’état capturé avant production (`LOCAL_ONLY`, 97 versions distantes). Après autorisation du mécanisme corrigé, la migration est présente une fois dans le ledger distant sous la version exacte `20260712120000`; GOAL-003 est désormais `Done`.

## Bootstrap isolé exécuté

Le bootstrap a été exécuté dans une instance Supabase Docker distincte du projet local existant et de la production. Après chargement du baseline, les 97 versions ont été marquées `applied` une par une (le CLI 2.67 ne prend pas de liste de versions), puis `db push` n’a proposé et appliqué que `20260712120000_secure_claim_review_analyze_jobs.sql`. Le ledger isolé contient 98 versions, dont les cinq collisions et GOAL-003 une seule fois. Le catalogue isolé confirme `service_role` et le propriétaire `postgres` pour la fonction, sans `PUBLIC`, `anon` ni `authenticated`.

## Première tentative du gate, arrêtée sans mutation

Après autorisation distincte, le préflight passif a confirmé l’identité, les 97 versions distantes, les cinq collisions, l’absence de `20260712120000`, le SHA-256 local, la signature et les grants vulnérables attendus. Le MCP `apply_migration` disponible ne fournit toutefois aucun paramètre permettant d’inscrire `20260712120000`; il génère sa propre version distante. L’appel n’a pas été exécuté, car il aurait créé une entrée `REMOTE_ONLY`.

Le mécanisme recommandé pour une autorisation ultérieure est un `supabase db push --linked --dry-run`, puis le push réel uniquement si le plan contient exactement `20260712120000_secure_claim_review_analyze_jobs.sql`. Cette commande était explicitement interdite par l’autorisation reçue. Aucun `db push`, `apply_migration`, repair, DCL, DDL, DML, changement de ledger, baseline, RLS, policy, fonction, donnée ou configuration n’a été exécuté.

La revue indépendante du blocage et de la procédure corrigée a rendu `APPROVED FOR COMMIT`. Elle confirme l’absence de mutation, les statuts des quatre Goals et le caractère minimal du `db push --linked --dry-run` suivi d’un push uniquement si GOAL-003 est l’unique migration proposée.

## Reprise autorisée et application conforme

Une nouvelle autorisation fondatrice a permis le mécanisme corrigé. Le projet, le SHA de `main`, le lien CLI, les 97 versions distantes, la signature, les grants et le checksum de la migration ont été contrôlés. `supabase db push --linked --dry-run` n’a proposé que `20260712120000_secure_claim_review_analyze_jobs.sql`. Après transition GOAL-003 `Blocked → Ready → Running`, un second préflight identique a précédé `supabase db push --linked`, sans flag supplémentaire.

Le postflight passif établit 98 versions distantes et une seule nouvelle entrée `20260712120000` / `secure_claim_review_analyze_jobs`. La signature, le propriétaire, `SECURITY DEFINER`, `search_path=public`, le retour et l’empreinte du corps MD5 `507ffaa9b4d88569b6e9124c1c0770b8` sont inchangés. `PUBLIC` n’a plus d’ACL `EXECUTE`; `anon` et `authenticated` ont un privilège effectif `false`; `service_role` conserve `EXECUTE`. Le test statique 28/28 confirme les deux chemins serveur sans invocation de RPC ou de worker.

Aucune autre migration, réparation, écriture manuelle du ledger, DDL, DML, DCL, seed, rôle, configuration, endpoint ou donnée applicative n’a été touché. Aucun secret, token, mot de passe ou chaîne de connexion n’a été lu ou affiché.

La vérification indépendante finale a rendu `APPROVED FOR FOUNDER CLOSURE` après correction de deux formulations documentaires obsolètes. Elle confirme les deux préflights, le dry-run unique, le ledger postflight, l’intégrité de la fonction, les grants, les chemins serveur statiques et l’absence d’opération hors scope. Le fondateur a ensuite clôturé GOAL-003 en `Done`; GOAL-005 reste `Running` pendant le durcissement final des garde-fous.

La récupération ne doit jamais rétablir un grant public. Un incident worker impose l’arrêt et une nouvelle autorisation fondatrice, avec Evidence conservées.

## Evidence locales

- `node scripts/validate-supabase-migration-history.mjs` vérifie baseline, SHA-256, collisions, fichiers gelés, migrations prospectives déjà fusionnées, versions/noms, fichiers réguliers suivis et migrations vides ou comment-only.
- `npm run test:migration-history:adversarial` exécute 29 contrôles en clones Git jetables : future valide, SQL avec chaînes/dollar-quotes, fichier non suivi, doublon, nom réutilisé, vide/comment-only, casse/Unicode/espace, symlink/répertoire, edit/delete/rename historique et prospectif, backdating, manifeste/guards, baseline et plan prospectif.
- `npm run test:canonical-bootstrap:guards` exécute 10 contrôles fail-closed sans base : marqueur isolé, ref production, hôte distant, schéma ou ledger non vide, liste prospective exacte/extra/manquante/désordonnée et portabilité Bash.
- `.github/workflows/ci.yml` compare les PR à leur base et les pushes à leur parent, puis exécute les deux suites de garde.
- `.github/workflows/migration-history-guard.yml` exécute le validateur de la branche de base de confiance contre le candidat, sans exécuter de code de la PR et avec permissions `contents: read`.
- `supabase/migration-history/guard-lock.json` protège la surface de garde après intégration ; `CODEOWNERS` rattache migrations, baseline, manifeste et scripts au fondateur.
- Le manifeste qualifie désormais ses 97 versions et l’état `not applied` comme snapshot historique ; l’état courant stable est 98 versions avec GOAL-003 appliquée une fois.
- `docs/runbooks/GOAL-005-migration-history-production-gate.md` définit préflight, mutations exhaustives, arrêts, vérifications et récupération.
- `docs/runbooks/GOAL-005-migration-authoring.md` définit la grammaire, l’append-only, les commandes et l’enforcement GitHub des migrations futures.

## Durcissement prospectif final

L’audit de clôture a découvert que le plan initial figeait par erreur toutes les migrations sauf GOAL-003 dans un ledger de 97 versions, ce qui bloquait les ajouts futurs ou aurait pu les marquer appliqués sans exécuter leur SQL. Le modèle corrigé sépare définitivement :

1. `baselineLedgerVersions` — les 97 versions strictement antérieures à GOAL-003, matérialisées par la baseline ;
2. `prospectiveMigrations` — GOAL-003 puis chaque migration future, réellement vérifiée et appliquée dans l’ordre.

Une migration future valide est acceptée et ajoutée à la chaîne prospective. Dès qu’elle existe dans la branche de base, toute modification, suppression ou renommage échoue. Les noms doivent être lowercase ASCII canoniques, les fichiers réguliers et suivis, et une migration sans token SQL effectif est refusée.

Le bootstrap réel est limité à une base loopback vide, avec ledger vide. Il refuse explicitement la référence de production, tout hôte distant et toute divergence entre dry-run, plan prospectif et ledger final. Sa récupération consiste à jeter la base isolée ; aucun repair de production n’est prévu.

La revue indépendante du Run 5 a rendu `APPROVED FOR INTEGRATION`. Elle confirme la baseline schema-only, la séparation 97/prospective, l’append-only base-aware, le workflow exécuté depuis la base de confiance, l’import du commit de base pour les forks, le guard lock, le bootstrap fail-closed et les suites `29/29` et `10/10`. La protection effective de `main` reste le dernier gate à prouver par une PR réelle avant `Running → Review`.

Le lot revu a été intégré en fast-forward strict par la PR #32 au commit `978bfb5ed9e39435f168d0cc89a7480633b015e4`. La protection de `main` exige désormais une branche à jour, les checks `build` et `migration-history-guard`, y compris pour les administrateurs, ainsi qu’un historique linéaire ; force-push et suppression de branche sont interdits. Une PR documentaire distincte doit encore produire les deux checks verts sur cette configuration avant la transition vers `Review`.

## Limites explicitement conservées

Le SQL distant de `20260221193000` reste indisponible. Le baseline réel et le ledger explicite rendent cette absence non bloquante pour le bootstrap, mais aucune attribution historique supplémentaire n’est affirmée. Le bootstrap de test ne constitue pas une autorisation de production.
