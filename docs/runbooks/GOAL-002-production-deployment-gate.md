# GOAL-002 — Gate de production corrigé

Ce document prépare un futur Run explicitement autorisé. Il n'autorise aucune
mutation par lui-même.

## Cibles et source

- Supabase : projet `fhadiwkdznhuxtlgrwfd`, nom `egia-mvp`, production.
- Vercel : projet `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT`, nom `egia`,
  équipe `team_zfHqQFVkGjeOVDHZTYvfkMmW`.
- GitHub : `melvyn69/egia-mvp`.
- Release exécutable approuvé :
  `GOAL002_EXECUTABLE_RELEASE_SHA`, descendant de
  `198aea23fbba9154327453507c010299f28e1da6`, contenant le correctif
  `queue_analysis`, le correctif GOAL-006, le watchdog à deux migrations et les
  artefacts de récupération.
- Migrations exclusives, dans cet ordre strict :
  1. `20260713073853_production_security_hardening.sql`;
  2. `20260716142352_fix_claim_ai_tag_candidates_digest.sql`.

Toute divergence d'identité, de SHA, d'arbre, d'ordre ou de migration arrête
le Run.

## Stratégie

Fenêtre contrôlée. L'application actuelle n'est pas compatible avec le backend
durci. Le nouveau candidat `7fad679...` n'est pas compatible avec la base
actuelle et conserve une régression produit. Le release autorisé est donc un
roll-forward enfant, déployé seulement après maintenance, safe-deny, migration
et Edge sécurisées.

Le dernier point d'arrêt sans récupération est immédiatement avant la
suspension des quatre tâches cron-job.org. Cette suspension est la première
mutation matérielle de production.

Après cette première mutation, sont interdits :

- le déploiement ou la promotion de `cb82cc5495...`;
- le déploiement ou la promotion de `7fad679...` sans correctif;
- la restauration de `dpl_5xpfD2E6wbsmAZgkmnkKaVvux5Sd`;
- le redéploiement d'une ancienne Edge Function;
- tout grant public, désactivation RLS, relâchement de policy ou retour du
  parcours fidélité immédiat.

## Préflight passif

1. Vérifier les trois identités projet et le SHA release. Confirmer
   passivement l'authentification opérateur Supabase (`SUPABASE_ACCESS_TOKEN`
   ou session CLI existante), Vercel (`VERCEL_TOKEN` ou session CLI existante)
   et cron-job.org (clé présente dans le trousseau), sans afficher ni copier
   aucune valeur.
2. Vérifier que `main` contient toujours
   `git.deploymentEnabled.main = false`; aucun push ne doit créer un
   déploiement avant l'étape explicitement autorisée.
3. Vérifier le ledger : GOAL-003 présente une fois; `20260713073853` et
   `20260716142352` absentes.
4. Exécuter migration-history guard, bootstrap canonique plan-only, tests,
   lint, typecheck, build, audits et `git diff --check`.
5. Exécuter `node scripts/run-goal-002-db-push.mjs --dry-run`; le helper doit
   refuser tout plan autre que les deux migrations autorisées, exactement
   dans l'ordre `20260713073853` puis `20260716142352`, sans troisième fichier.
6. Capturer l'Evidence baseline exacte avant mutation :

   ```bash
   GOAL002_INSPECTION_AUTHORIZED=fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352 \
   node scripts/inspect-goal-002-migration-state.mjs --capture-baseline
   ```

   Exiger `classification = BASELINE`, puis conserver le
   `hardening_vector` à huit bits et le `digest_fix_vector` à quatre bits avec
   leur timestamp et le SHA release.
7. Vérifier passivement l'absence des objets prospectifs, l'intégrité
   relationnelle fidélité et les assets de marque. Tous les compteurs
   d'anomalie doivent être zéro.
8. Vérifier l'existence et la portée, sans lire les valeurs, de tous les noms
   de secrets listés ci-dessous.
9. Vérifier qu'une sauvegarde/PITR récente existe, sans la présenter comme
   rollback applicatif et sans lancer de restauration.
10. Construire localement le release, la maintenance Vercel et les sept
   safe-deny. Capturer hashes et inventaire.
11. Vérifier passivement les quatre tâches cron-job.org selon le contrat
    versionné ci-dessous. `GET /jobs` doit répondre `someFailed = false`, puis
    chaque cible doit correspondre à exactement un `jobId`. Toute URL,
    duplication, méthode, timezone, cadence, header attendu ou configuration
    divergente arrête le Run.

Si un point échoue, arrêter avant toute mutation. Aucune récupération n'est
nécessaire.

## Ordre strict des mutations

### 1. Suspension cron-job.org — première mutation

Les quatre crons ne sont pas des Vercel Cron Jobs. Ils sont déclenchés par
l'ordonnanceur externe `cron-job.org`. Leur suspension ne requiert aucune
modification du projet Vercel, aucun déploiement, aucune variable Vercel ou
Supabase, ni aucune modification de `vercel.json` ou d'un autre fichier.

La configuration distante observée le `2026-07-16` est la source de vérité
immuable de ce Run. Le Run ne modifie ni timezone, ni cadence, ni URL, ni
méthode. Les quatre tâches utilisent la timezone `Europe/Paris` et la méthode
`POST` (`requestMethod = 1`) :

| Ordre de suspension | `jobId` | Nom canonique | URL exacte | Cadence | Objet `schedule` cron-job.org |
| ---: | ---: | --- | --- | --- | --- |
| 1 | `7132230` | Google — synchronisation des réponses | `https://egia-six.vercel.app/api/cron/google/sync-replies` | `0 * * * *`, toutes les heures à `:00` | `timezone=Europe/Paris`, `expiresAt=0`, `hours=[-1]`, `minutes=[0]`, `mdays=[-1]`, `months=[-1]`, `wdays=[-1]` |
| 2 | `7133264` | IA — étiquetage des avis | `https://egia-six.vercel.app/api/cron/ai/tag-reviews` | `0 */2 * * *`, toutes les deux heures paires à `:00` | `timezone=Europe/Paris`, `expiresAt=0`, `hours=[0,2,4,6,8,10,12,14,16,18,20,22]`, `minutes=[0]`, `mdays=[-1]`, `months=[-1]`, `wdays=[-1]` |
| 3 | `7201111` | Automatisations de réponses | `https://egia-six.vercel.app/api/reports/automations` | `0,30 * * * *`, deux fois par heure | `timezone=Europe/Paris`, `expiresAt=0`, `hours=[-1]`, `minutes=[0,30]`, `mdays=[-1]`, `months=[-1]`, `wdays=[-1]` |
| 4 | `7155832` | Rapports mensuels | `https://egia-six.vercel.app/api/cron/monthly-reports` | `0 8 1 * *`, premier jour du mois à `08:00 Europe/Paris` | `timezone=Europe/Paris`, `expiresAt=0`, `hours=[8]`, `minutes=[0]`, `mdays=[1]`, `months=[-1]`, `wdays=[-1]` |

L'état `enabled` observé avant le Run peut refléter la suspension temporaire
des accès Supabase et n'appartient pas à cette configuration immuable. L'état
cible après succès est `enabled=true` pour les quatre tâches.

Avant la première modification, exécuter uniquement le helper versionné :

```bash
node scripts/manage-goal-002-cron-jobs.mjs snapshot \
  --output evidence/goal002-cron-baseline.json
```

Le helper lit `CRON_JOB_ORG_API_KEY` directement dans le trousseau macOS,
conserve la réponse brute uniquement en mémoire et n'émet jamais la clé ni une
valeur d'en-tête. Conserver son Evidence horodatée contenant :

- `jobId`, titre, URL, `enabled`, `requestMethod`, `schedule`,
  `requestTimeout`, `redirectSuccess`, `folderId`, notifications,
  `saveResponses`, `auth.enable` et les noms des headers;
- les valeurs de headers remplacées par `<redacted>`;
- un SHA-256 calculé en mémoire sur la configuration canonique complète,
  valeurs de headers incluses, après exclusion des seuls champs volatils
  `enabled`, `lastStatus`, `lastDuration`, `lastExecution`, `nextExecution`
  et `sslCertExpiry`.

La mutation distante exacte est ensuite :

```bash
node scripts/manage-goal-002-cron-jobs.mjs suspend \
  --baseline evidence/goal002-cron-baseline.json
```

Le helper suit l'ordre du tableau et envoie pour chaque tâche exactement
`{"job":{"enabled":false}}`. Aucun autre champ n'est écrit. Après chaque
`PATCH`, il relit le job en mémoire, exige `enabled=false`, compare le SHA-256
immuable au snapshot et n'émet que la configuration redigée. Plafond global :
deux minutes. Les quatre tâches doivent être désactivées avant de poursuivre.

### 2. Maintenance Vercel

Construire et déployer `recovery/goal-002/vercel-maintenance` sur le projet
exact `egia` :

```bash
VERCEL_ORG_ID=team_zfHqQFVkGjeOVDHZTYvfkMmW \
VERCEL_PROJECT_ID=prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT \
vercel build --prod --yes \
  --cwd recovery/goal-002/vercel-maintenance

VERCEL_ORG_ID=team_zfHqQFVkGjeOVDHZTYvfkMmW \
VERCEL_PROJECT_ID=prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT \
vercel deploy --prebuilt --prod --yes \
  --cwd recovery/goal-002/vercel-maintenance
```

Avant le build, capturer le SHA Git et les SHA-256 de `package-lock.json`,
`vercel.json`, `index.html` et `api/maintenance.ts`. Le deployment ID doit être
rattaché à ces Evidence.

Dans les deux minutes, vérifier :

- `/` = `503` HTML;
- `/api/loyalty/join` = `503` JSON;
- `/api/cron/ai/tag-reviews` = `503`;
- `/api/cron/google/sync-replies` = `503`;
- `/api/reports/automations` = `503`;
- `/api/cron/monthly-reports` = `503`;
- `Cache-Control: no-store` et `Retry-After: 120`.

Les tâches cron-job.org sont déjà suspendues. Aucun job réel ne doit être
réclamé pendant la fenêtre.

Si le build ou le déploiement Maintenance no 1 échoue avant que l'alias Vercel,
une Edge Function ou la base n'ait été modifié, restaurer exactement les états
`enabled` du snapshot, y compris les tâches initialement inactives :

```bash
node scripts/manage-goal-002-cron-jobs.mjs restore \
  --baseline evidence/goal002-cron-baseline.json
```

Exiger les quatre hashes immuables identiques, puis arrêter le Run. Cette
récupération précoce ne force pas l'état cible final actif et ne modifie aucun
autre champ cron.

### 3. Safe-deny Edge avant migration — cinq fonctions

Déployer depuis `recovery/goal-002/edge-safe-deny`, dans cet ordre :

1. `process-review-analyze` avec `--no-verify-jwt`;
2. `generate-reply`;
3. `post-reply-google`;
4. `google_oauth_start`;
5. `google_oauth_exchange`.

Plafond : une minute par fonction. Vérifier immédiatement `503
GOAL002_SAFE_DENY`. À partir du safe-deny OAuth, démarrer un chronomètre de dix
minutes; aucun nouvel état OAuth ne peut être créé.

Commandes exactes, en remplaçant `<function>` dans l'ordre ci-dessus :

```bash
supabase functions deploy <function> \
  --project-ref fhadiwkdznhuxtlgrwfd \
  --workdir recovery/goal-002/edge-safe-deny
```

Ajouter `--no-verify-jwt` uniquement pour `process-review-analyze`. Capturer le
SHA Git et les SHA-256 du `config.toml`, du helper et des sept `index.ts`.

Après chaque déploiement, exécuter :

```bash
node scripts/probe-goal-002-safe-deny.mjs <function>
```

Le helper lit `SUPABASE_URL` et `SUPABASE_ANON_KEY` sans les afficher. Pour les
six fonctions avec `verify_jwt=true`, il envoie la clé anonyme à la fois comme
`apikey` et Bearer afin de franchir le gateway et d'atteindre le safe-deny.
Pour `process-review-analyze --no-verify-jwt`, il envoie uniquement `apikey`.
Le seul résultat accepté est `503` JSON avec
`code=GOAL002_SAFE_DENY` et le nom exact de la fonction.

Cette séparation est technique et définitive :

- `process-review-analyze` réclame et modifie des jobs avec `service_role`;
- `generate-reply` appelle OpenAI et sa version sécurisée dépend du RPC
  `consume_security_rate_limit` créé par la migration;
- `post-reply-google` rafraîchit un token et publie chez Google;
- `google_oauth_start` crée un état OAuth;
- `google_oauth_exchange` consomme cet état et persiste des credentials.

Ces cinq fonctions traversent donc une frontière privilégiée, fournisseur ou
OAuth directement affectée par le durcissement. Elles doivent être `503`
avant toute modification de la base.

### 4. Deux migrations strictes et ordonnées

Les deux migrations versionnées restent strictement immuables. Exécuter
uniquement :

```bash
GOAL002_MIGRATION_MODE=BASELINE_CHAIN \
GOAL002_PRODUCTION_AUTHORIZED=fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352 \
node scripts/run-goal-002-db-push.mjs
```

Le helper lance d'abord `supabase db push --linked --dry-run`, capture
uniquement le plan et refuse un fichier absent, supplémentaire ou inversé. Il
lance ensuite exactement `supabase db push --linked`, sans `--include-all`,
`--include-seed`, `--include-roles` ni `migration repair`. Supabase applique
les fichiers selon leur timestamp : le durcissement d'abord, puis le correctif
GOAL-006. Son watchdog envoie `SIGTERM` à 125 secondes puis `SIGKILL` au
plafond dur de 130 secondes. La connexion est marquée
`application_name = goal002_migrations_20260713073853_20260716142352`.
Le code de sortie `124` ne permet pas de conclure si la transaction a été
annulée, si les deux transactions ont été validées ou si seule la première l'a
été juste avant la perte de réponse. Il impose de conserver maintenance,
safe-deny et crons suspendus, puis d'appliquer la classification passive
décrite dans la section « Arrêt et roll-forward ».

Post-check, plafond cinq minutes :

- ledgers `20260713073853` puis `20260716142352` présents chacun exactement
  une fois;
- tables, RLS, vues `security_invoker`, fonctions et `search_path` conformes;
- `join_loyalty_program`, `finalize_loyalty_enrollment` et
  `consume_security_rate_limit` réservées à `service_role`;
- `claim_ai_tag_candidates` avec `search_path=pg_catalog`, deux appels
  `extensions.digest(text,text)` et `EXECUTE` réservé à `service_role`;
- contraintes de scope fidélité validées;
- bucket `brand-assets` privé, taille et MIME conformes.
- exécution transactionnelle exacte :

  ```bash
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
    -f supabase/tests/goal002_claim_ai_tag_candidates_postdeploy.sql
  ```

  Les seules fixtures sont préfixées `GOAL002_SYNTH` et le fichier se termine
  par `ROLLBACK`. Il vérifie résolution de `digest`, claim atomique, filtre
  lieu A/B, plafond 20, résistance au `search_path` attaquant et refus
  `anon`/`authenticated`.

L'application `cb82cc...` est alors matériellement incompatible. C'est attendu
et sûr uniquement parce que la maintenance reste active. Un frontend ancien
déjà en cache obtient un refus sur l'inscription fidélité et sur les grants
retirés; il ne récupère aucune capacité.

### 5. Safe-deny Edge après les deux migrations — deux fonctions

Déployer et vérifier :

6. `google_gbp_sync_locations`;
7. `google_gbp_sync_all`.

Toutes les sept fonctions doivent alors être fail-closed. Aucun appel Google
ou OpenAI n'est effectué.

Ces deux fonctions de synchronisation utilisent uniquement les tables
`google_connections`, `google_accounts`, `google_locations` et
`google_reviews`; elles ne dépendent ni des nouveaux RPC de quota/fidélité ni
des grants navigateur retirés par la migration. Avec les quatre crons
suspendus et Vercel en maintenance, elles restent compatibles pendant
l'application transactionnelle du SQL. Elles sont placées en safe-deny
immédiatement après le post-check des deux migrations afin de réduire la fenêtre de synchronisation
indisponible sans exposer une frontière incompatible. Cet ordre ne peut pas
être remplacé par un déploiement des sept fonctions avant migration.

### 6. Drain OAuth

Attendre que dix minutes complètes se soient écoulées depuis l'activation du
safe-deny de `google_oauth_start`. Ne pas raccourcir cette durée. Les anciens
états OAuth sont alors expirés.

### 7. Edge Functions sécurisées

Déployer depuis le release approuvé, dans cet ordre :

1. `process-review-analyze --no-verify-jwt`;
2. `post-reply-google`;
3. `google_gbp_sync_locations`;
4. `google_gbp_sync_all`;
5. `google_oauth_exchange`;
6. `google_oauth_start`;
7. `generate-reply`.

Plafond : deux minutes par fonction. Après chaque déploiement, vérifier la
version et `verify_jwt`. Une fonction non encore remplacée reste safe-deny.
Les probes utilisent uniquement des payloads synthétiques ou invalides :
`401/403/405` attendus, aucun fournisseur réel.

Commande exacte :

```bash
supabase functions deploy <function> \
  --project-ref fhadiwkdznhuxtlgrwfd \
  --workdir .
```

Ajouter `--no-verify-jwt` uniquement pour `process-review-analyze`. Chaque
version doit être rattachée au SHA release et au hash du fichier déployé.

### 8. Release Vercel roll-forward

Déployer manuellement le release approuvé sur le projet `egia`. Ne pas
promouvoir un ancien déploiement et ne pas utiliser un artefact d'un autre
SHA. Plafond : dix minutes, smoke tests inclus.

```bash
VERCEL_ORG_ID=team_zfHqQFVkGjeOVDHZTYvfkMmW \
VERCEL_PROJECT_ID=prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT \
vercel build --prod --yes --cwd .

VERCEL_ORG_ID=team_zfHqQFVkGjeOVDHZTYvfkMmW \
VERCEL_PROJECT_ID=prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT \
vercel deploy --prebuilt --prod --yes --cwd .
```

Avant le build, capturer le SHA release et les SHA-256 de `package-lock.json`,
`vercel.json`, des sept `index.ts` Edge et de la migration. Après le build,
capturer le hash de `.vercel/output/config.json` et l'inventaire des fonctions
produites. Le deployment ID doit référencer ces Evidence.

Vérifier immédiatement :

- SHA et deployment ID;
- `/`, routes API et en-têtes;
- `/api/loyalty/join` avec programme synthétique;
- `/api/reviews?action=queue_analysis` avec utilisateur synthétique;
- cron sans/mauvais secret `403`;
- aucune erreur 5xx persistante.

Les crons restent suspendus pendant les smoke tests.

### 9. Reprise contrôlée des crons

Réactiver une tâche à la fois par l'API cron-job.org, dans cet ordre :

1. rapports mensuels — `/api/cron/monthly-reports`;
2. automatisations — `/api/reports/automations`;
3. IA — `/api/cron/ai/tag-reviews`;
4. synchronisation Google — `/api/cron/google/sync-replies`.

Exécuter uniquement :

```bash
node scripts/manage-goal-002-cron-jobs.mjs resume \
  --baseline evidence/goal002-cron-baseline.json
```

Le helper suit l'ordre ci-dessus et envoie uniquement
`{"job":{"enabled":true}}`. Plafond : deux minutes par tâche. Après chaque
réactivation, il relit la tâche en mémoire et exige :

- `enabled=true`;
- le même `jobId`;
- le SHA-256 immuable strictement identique au snapshot pré-mutation;
- URL, méthode `POST`, timezone, cadence, headers, timeout, notifications et
  tous les autres champs non volatils identiques;
- les trois prédictions retournées par `GET /jobs/<jobId>/history` conformes à
  la cadence du tableau.

Les invocations manuelles avec secret restent limitées aux tenants
synthétiques; le cron Google global est observé passivement. Toute dérive
suspend immédiatement la tâche concernée avec le même `PATCH enabled=false`.
La reprise ne modifie toujours ni Vercel, ni Supabase, ni secret, ni fichier.

### 10. Réactivation Git Vercel

Après réussite de tous les tests, réutiliser la branche
`security/goal-002-production-validation`, qui reste désactivée. Préparer un
commit de configuration limité à la suppression de l'entrée
`git.deploymentEnabled.main`; conserver l'entrée de la branche.

Le push de cette branche ne doit créer aucun Preview. La PR doit obtenir sa CI
verte avant fusion. La fusion crée l'unique déploiement Production automatique
de réactivation. Vérifier que le contenu applicatif est identique au release
sécurisé, hors configuration Git, et répéter les probes HTTP. Toute autre
modification interdit la fusion.

## Décompte fermé des déploiements Vercel Production

Le Run doit créer exactement **trois** déploiements Vercel avec
`target=production`. Un build local `vercel build --prod` n'est pas un
déploiement et n'entre pas dans ce total. La fusion initiale de la PR #36 ne
doit créer aucun déploiement, car `git.deploymentEnabled.main=false`.

| Numéro | Source attendue | Target | Effet exact sur l'alias Production | Condition de succès | Nécessité |
| ---: | --- | --- | --- | --- | --- |
| 1 | Paquet `recovery/goal-002/vercel-maintenance` du SHA `GOAL002_EXECUTABLE_RELEASE_SHA`, hashes préflight identiques | `production` | L'alias canonique du projet `egia` pointe vers la maintenance globale `503` | Deployment ID capturé; `/`, fidélité et quatre routes cron = `503`; `no-store`; `Retry-After: 120` | Empêche l'ancien frontend d'utiliser le backend pendant les états incompatibles. |
| 2 | Application sécurisée du SHA `GOAL002_EXECUTABLE_RELEASE_SHA`, construite et déployée manuellement avec `--prebuilt --prod` | `production` | Le même alias quitte la maintenance et pointe vers le release sécurisé | Deployment ID/SHA exacts; deux migrations et sept Edge vérifiées; smoke tests synthétiques verts; aucune `5xx` persistante | Restaure le service seulement après base durcie, correctif GOAL-006 et sept Edge sécurisées. |
| 3 | Commit enfant de réactivation dont l'unique diff supprime `git.deploymentEnabled.main`; contenu applicatif identique au SHA `GOAL002_EXECUTABLE_RELEASE_SHA` | `production`, automatique après fusion sur `main` | L'alias est réassigné au build Git du release sécurisé avec l'auto-déploiement de `main` restauré | Exactement un nouveau Deployment ID; CI verte; diff limité; probes identiques au déploiement 2 | Rétablit le contrat Git/Vercel durable; le déploiement manuel 2 ne réactive pas à lui seul les futurs déploiements de `main`. |

Zéro Preview est attendu. Un quatrième déploiement Production, l'absence de
l'un des trois, un target différent ou une source différente arrête le Run.
Aucun redéploiement compensatoire supplémentaire n'est autorisé sans nouvelle
autorisation fondatrice.

## Durées maximales

- suspension des quatre crons : 2 min;
- maintenance initiale : 2 min;
- cinq safe-deny critiques : 5 min;
- chaîne des deux migrations : 130 s;
- état `HARDENING_ONLY`, classification et unique roll-forward GOAL-006 :
  8 min maximum;
- post-check des deux migrations : 5 min;
- deux safe-deny restants : 2 min;
- drain OAuth : dix minutes depuis le safe-deny start, entièrement absorbées
  par la fin du safe-deny, la migration et ses post-checks;
- sept Edge sécurisées : 14 min;
- release Vercel et smoke tests : 10 min.
- reprise des quatre crons : 8 min.

Indisponibilité Vercel maximale : 49 minutes, de la maintenance au release,
si l'unique récupération `HARDENING_ONLY` est nécessaire. Pause cron maximale :
59 minutes, suspension et reprise incluses. Un
dépassement conserve maintenance, safe-deny et crons suspendus; il n'autorise
aucun rollback ancien.

## Secrets — noms uniquement

Supabase / Edge :

- `SUPABASE_ACCESS_TOKEN` — credential opérateur CLI, jamais ajouté au projet
  ni aux Evidence;
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `AUTOMATION_REPLY_URL` ou `APP_URL` ou `VERCEL_URL`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PROCESS_REVIEW_ANALYZE_SECRET`
- `INTERNAL_API_KEY`
- `ALLOWED_ORIGIN`
- `ALLOWED_ORIGINS`
- `AI_USER_REQUESTS_PER_HOUR`

Ordonnanceur externe :

- `CRON_JOB_ORG_API_KEY`

Vercel :

- `VERCEL_TOKEN` — credential opérateur CLI, jamais ajouté au projet ni aux
  Evidence;
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRON_SECRET`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `INTERNAL_API_KEY`
- `APPLE_PASS_TYPE_IDENTIFIER`
- `APPLE_TEAM_IDENTIFIER`
- `APPLE_PASS_CERTIFICATE`
- `APPLE_PASS_PRIVATE_KEY`
- `APPLE_WWDR_CERTIFICATE`
- `APP_PUBLIC_URL`
- `OPENAI_MODEL`
- `OPENAI_REPLY_MODEL`
- `AI_USER_REQUESTS_PER_HOUR`
- `APPLE_PASS_CERTIFICATE_PASSWORD`

Une valeur absente ou mal portée maintient la maintenance et déclenche le
roll-forward fail-closed; aucune valeur n'est consignée.

## Tests synthétiques

Créer uniquement deux comptes, deux tenants, deux lieux et des données
préfixées `GOAL002_SYNTH`. Aucun compte ou datum client.

1. A ne lit ni ne modifie B.
2. A ne récupère ni membre ni Wallet de B.
3. Nouvelle/existante reçoivent le même `202`.
4. Avant e-mail : aucun membre nouveau, code, QR ou Wallet.
5. Après e-mail : création ou récupération stable; replay rejeté.
6. Action IA manuelle : seul le lieu A est mis en file; lieu B = `404`.
7. Invitation, quotas, upload, rapport CID/PDF et logs redigés.
8. Edge : auth/méthodes, quota partagé, aucun corps fournisseur.
9. Cron : absence/mauvais secret `403`; seuls les crons ciblés synthétiques
   sont invoqués avec le vrai secret. Google global reste passif.

Evidence : SHA, deployment IDs, versions Edge, timestamps, statuts HTTP,
en-têtes, compteurs SQL, identifiants synthétiques redigés et absence de
donnée client.

## Arrêt et roll-forward

Après la première mutation et avant le release sécurisé, toute erreur
conserve :

- `recovery/goal-002/vercel-maintenance`;
- les sept fonctions de `recovery/goal-002/edge-safe-deny`.

Après le déploiement Production no 2, aucun quatrième déploiement Vercel n'est
autorisé. Le recovery maintient le nouveau release sécurisé et les safe-deny
ciblés. Si une isolation frontend complète est indispensable, exécuter
exactement :

```bash
vercel promote "$GOAL002_MAINTENANCE_DEPLOYMENT_ID" --yes --timeout 3m
```

Cette promotion réutilise le deployment no 1 et ne crée aucun deployment. Le
Run s'arrête alors : aucune promotion retour, aucun déploiement no 3 et aucun
hotfix Vercel n'est autorisé sans nouvelle décision fondatrice. Si le release
no 2 reste servi, tout hotfix applicatif qui créerait un nouveau deployment
exige également une nouvelle autorisation.

Procédure :

1. confirmer maintenance `503`;
2. confirmer safe-deny `503` sur toute fonction non fiable;
3. si le watchdog migration retourne `124`, attendre passivement au maximum
   deux minutes que la session marquée
   `goal002_migrations_20260713073853_20260716142352` disparaisse; tant
   qu'elle existe, ne lancer aucune autre migration;
4. exécuter exactement l'inspecteur passif versionné :

   ```bash
   GOAL002_BASELINE_HARDENING_VECTOR=<valeur-capturée-au-préflight> \
   GOAL002_BASELINE_DIGEST_FIX_VECTOR=<valeur-capturée-au-préflight> \
   GOAL002_INSPECTION_AUTHORIZED=fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352 \
   node scripts/inspect-goal-002-migration-state.mjs
   ```

   Il utilise le client Node `pg` versionné et uniquement `SUPABASE_DB_URL`,
   marque sa propre connexion `goal002_state_inspector`, puis exécute
   `scripts/inspect-goal-002-migration-state.sql`. L'Evidence JSON compte la
   session exacte, les deux entrées ledger, les dix objets prospectifs, les
   huit invariants de durcissement et les quatre invariants GOAL-006
   (signature `extensions.digest`, `SECURITY DEFINER`/`search_path`, appels
   qualifiés, ACL). La connexion est bornée à dix secondes, la
   requête à trente secondes et le processus à quarante-cinq secondes; tout
   timeout vaut arrêt fail-closed;
5. `COMMITTED` signifie : aucune session, les deux ledgers exactement une
   fois, dix objets prospectifs présents, huit invariants de durcissement et
   quatre invariants GOAL-006 conformes. Ne pas rejouer; reprendre le post-check
   complet;
6. `HARDENING_ONLY` signifie : `20260713073853` est validée,
   `20260716142352` est absente, le durcissement est complet et la définition
   de `claim_ai_tag_candidates` correspond encore exactement au vecteur
   préflight. Maintenir maintenance, sept safe-deny et crons suspendus; après
   correction de la cause externe, relancer une seule fois le même helper. Son
   dry-run doit alors proposer uniquement
   `20260716142352_fix_claim_ai_tag_candidates_digest.sql`; aucun retour à la
   base antérieure n'est autorisé. La commande de récupération exacte est :

   ```bash
   GOAL002_MIGRATION_MODE=HARDENING_ONLY_ROLL_FORWARD \
   GOAL002_PRODUCTION_AUTHORIZED=fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352 \
   node scripts/run-goal-002-db-push.mjs
   ```
7. `ROLLED_BACK` signifie : aucune session, les deux ledgers absents, zéro
   objet prospectif et les deux vecteurs strictement identiques au préflight.
   Après correction de la cause externe, rejouer une seule fois la chaîne
   immuable avec le même helper;
8. si un ledger et le catalogue divergent, si un objet est partiel, si la
   classification vaut `ACTIVE`/`INCONSISTENT`, si la session persiste au-delà
   de deux minutes ou si l'unique roll-forward échoue,
   arrêter le Run en maintenant maintenance, safe-deny et crons suspendus;
9. pour une erreur applicative ou Edge, ne modifier ni migration, ni grants,
   ni RLS, ni données; maintenir le release sécurisé ou le safe-deny concerné,
   préparer un commit enfant minimal et arrêter le Run;
10. rejouer localement tests complets, matrice, build et revues pour préparer
    une autorisation de roll-forward séparée;
11. ne redéployer aucune fonction corrigée et aucun release corrigé dans ce
    Run sans cette nouvelle autorisation.

Le hotfix de récupération prévalidé et immédiatement disponible est le paquet
versionné `recovery/goal-002` : maintenance Vercel globale `503` et sept Edge
Functions de même nom en safe-deny `503`, sans accès DB, fournisseur, secret
métier ni capacité membre. Il maintient ou restaure le nouveau périmètre
sécurisé pendant la classification ou la préparation d'un commit enfant
roll-forward. PITR n'est utilisable que pour un incident de données indépendant
et ne justifie jamais la restauration de droits vulnérables.

## Conditions d'arrêt

- identité ou SHA divergent;
- dry-run non exact;
- anomalie données/assets;
- secret obligatoire absent;
- maintenance non globale;
- safe-deny non vérifié;
- ordre de migration divergent, état partiel non classifiable ou post-check
  divergent;
- état OAuth encore valide après le drain;
- fuite inter-tenant ou capacité avant preuve e-mail;
- déploiement non lié au release;
- erreur 5xx persistante;
- dépassement de durée sans maintenance/safe-deny confirmé;
- diff de réactivation Vercel non strictement limité.

## Evidence de clôture

- PR de release et SHA fusionné;
- dry-run exact, deux ledgers et catalogues;
- IDs maintenance, sept safe-deny, sept Edge sécurisées, release Vercel et
  déploiement de réactivation;
- résultats A/B, fidélité one-shot, action IA et crons;
- logs redigés et absence de donnée réelle;
- revue indépendante finale `APPROVED FOR PRODUCTION`;
- GOAL-002 passe `Running → Done` uniquement après toutes ces Evidence.

## Founder Brief — autorisation de production demandée

### Objectif

Déployer le release sécurisé GOAL-002 avec GOAL-006, sans réintroduire un code,
un droit ou une fonction vulnérable.

### Résultat préparé

- Release exécutable : `GOAL002_EXECUTABLE_RELEASE_SHA`.
- Supabase : `fhadiwkdznhuxtlgrwfd` / `egia-mvp`.
- Vercel : `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`.
- Quatre crons identifiés et gérés par le helper versionné redigé.
- Exactement trois déploiements Vercel Production et zéro Preview.

### Mutations de production prévues

1. snapshot redigé puis suspension `enabled=false` des crons Google, IA,
   Automations, Monthly reports;
2. déploiement Vercel Production no 1 : maintenance du release
   `GOAL002_EXECUTABLE_RELEASE_SHA`;
3. safe-deny, dans l'ordre : `process-review-analyze`,
   `generate-reply`, `post-reply-google`, `google_oauth_start`,
   `google_oauth_exchange`;
4. migrations exclusives, dans l'ordre :
   `20260713073853_production_security_hardening.sql`, puis
   `20260716142352_fix_claim_ai_tag_candidates_digest.sql`;
5. safe-deny : `google_gbp_sync_locations`, puis `google_gbp_sync_all`;
6. déploiement des sept Edge Functions sécurisées dans l'ordre versionné;
7. déploiement Vercel Production no 2 : application du release
   `GOAL002_EXECUTABLE_RELEASE_SHA`;
8. tests `GOAL002_SYNTH`;
9. réactivation `enabled=true` des crons Monthly reports, Automations, IA,
   Google, sans modifier leur autre configuration;
10. suppression versionnée de `git.deploymentEnabled.main`, CI et fusion;
11. déploiement Vercel Production no 3 automatique du contenu applicatif
    identique au release sécurisé.

### Tests prévus

Deux comptes, tenants et lieux synthétiques; isolation A/B; fidélité
nouvelle/existante indistinguable avant e-mail; absence de carte, QR et Wallet
avant preuve; replay refusé; claim IA qualifié et borné; invitations, uploads,
assets, rapports, OAuth et crons; Evidence redigées des ledgers, catalogues,
versions Edge, deployment IDs, HTTP et hashes cron.

### Risque et récupération

Le risque principal est un état partiel entre les deux migrations ou entre
backend et frontend. `HARDENING_ONLY` autorise uniquement le roll-forward vers
GOAL-006. Après la première mutation, aucun retour vers `cb82cc...`,
`7fad679...`, une ancienne Edge Function, un grant public ou une RLS affaiblie
n'est permis. Maintenance et safe-deny restent disponibles; après le
deployment no 2, aucun nouveau deployment/hotfix n'est permis sans nouvelle
autorisation.

### Décision demandée

> J'autorise le Run de production GOAL-002 sur Supabase
> `fhadiwkdznhuxtlgrwfd` / `egia-mvp` et Vercel
> `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`, exclusivement depuis le release
> `GOAL002_EXECUTABLE_RELEASE_SHA`. J'autorise la suspension puis la
> réactivation `enabled` des quatre cronjobs identifiés, sans modification de
> leurs URL, méthodes, timezones, cadences, headers ou autres champs;
> exactement trois déploiements Vercel Production et zéro Preview; les cinq
> safe-deny pré-migration puis les deux safe-deny post-migrations dans l'ordre
> documenté; exclusivement
> `20260713073853_production_security_hardening.sql`, puis
> `20260716142352_fix_claim_ai_tag_candidates_digest.sql`; les sept Edge
> Functions sécurisées; les tests transactionnels et HTTP `GOAL002_SYNTH`; et
> la réactivation versionnée finale de `main`. Les noms de credentials,
> variables et secrets dont la présence et la portée peuvent être vérifiées
> sont exactement : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`,
> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
> `SERVICE_ROLE_KEY`, `VERCEL_TOKEN`, `CRON_JOB_ORG_API_KEY`,
> `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `APP_URL`, `APP_BASE_URL`,
> `APP_PUBLIC_URL`, `AUTOMATION_REPLY_URL`, `VERCEL_URL`, `RESEND_API_KEY`,
> `EMAIL_FROM`, `CRON_SECRET`, `PROCESS_REVIEW_ANALYZE_SECRET`,
> `INTERNAL_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
> `OPENAI_REPLY_MODEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
> `ALLOWED_ORIGIN`, `ALLOWED_ORIGINS`, `AI_USER_REQUESTS_PER_HOUR`,
> `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`,
> `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_PRIVATE_KEY`,
> `APPLE_WWDR_CERTIFICATE` et `APPLE_PASS_CERTIFICATE_PASSWORD`; aucune valeur
> ne doit être affichée, copiée, modifiée ou ajoutée. J'interdis tout compte ou
> donnée client, toute
> autre migration, tout quatrième déploiement Vercel, tout Preview, toute
> restauration d'un SHA ou droit vulnérable et toute modification de secret
> ou configuration non prévue. Arrêt obligatoire sur identité/SHA divergent,
> dry-run non exact, secret absent, drift cron, fuite inter-tenant, capacité
> fidélité avant preuve, état migration `ACTIVE`/`INCONSISTENT`, safe-deny ou
> post-check non conforme, erreur 5xx persistante ou dépassement des plafonds.
> J'autorise comme récupération uniquement la restauration exacte des états
> cron initiaux avant toute mutation backend, l'unique roll-forward GOAL-006
> depuis `HARDENING_ONLY`, le maintien des safe-deny, ou la promotion du
> deployment Maintenance no 1 déjà créé; cette dernière action arrête le Run
> et exige une nouvelle autorisation pour reprendre.
