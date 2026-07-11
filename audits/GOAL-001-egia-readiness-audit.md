# GOAL-001 — Rapport de readiness EGIA

- **Run :** 1 — 2026-07-11
- **Périmètre de preuve :** dépôt local à `c30a475ef7d6c5412380a02dbc8c3593c74de847`, sans accès aux services distants ni lecture de secret.
- **Verdict proposé au fondateur :** **non prêt** pour un usage quotidien fiable. Le dépôt construit et les contrôles locaux passent, mais l’état des dépendances de production, de Supabase/RLS déployé, de la CI et des crons demeure non prouvé ; les types de base de données divergent et plusieurs surfaces sont explicitement simulées ou incomplètes.

## 1. Résumé exécutif

**Fait confirmé.** Le dépôt est une application React/Vite avec API Vercel, handlers TypeScript partagés, Supabase et huit Edge Functions. La CI versionnée installe, lint et build avec Node 20. Les validations locales `lint`, `typecheck`, `test`, le test ciblé de statut Google et `build` sont passées ; ESLint a émis un avertissement sans erreur.

**Risque P1.** `src/database.types.ts` et `server/_shared/database.types.ts` divergent (`generated_reports` n’est présent que côté frontend), alors que 95 migrations suivies vont jusqu’au 2026-07-11. Les deux fichiers sont issus d’un dernier commit les concernant daté du 2026-01-18. La cohérence types/schéma ne peut donc pas être considérée assurée.

**Limite de vérification.** Aucun accès n’a été effectué à Supabase, Vercel, GitHub, Google, OpenAI, Resend, cron-job.org ou Apple. Le déploiement réel, les secrets configurés, les migrations appliquées, RLS/grants effectifs, les logs, la santé des intégrations, la CI distante et les schedules restent **à confirmer**.

## 2. Périmètre réellement audité

Inspection statique du dépôt, de son historique et de ses fichiers versionnés : documentation, frontend, API Vercel, handlers, migrations, fonctions Edge, configuration Supabase/Vercel/CI, scripts npm et types. Les validations ont été exclusivement locales et non interactives. Les services distants, `.env.local` et toute valeur de secret ont été exclus.

## 3. Sources inspectées

| Source | Evidence locale / conclusion |
| --- | --- |
| `PROJECT-CONTEXT.md`, `README.md`, `docs/SUPABASE_EGRESS_AUDIT.md` | Périmètre produit, procédures et contradictions comparés au code. |
| `package.json`, lockfile, `tsconfig*.json`, `vite.config.ts`, `.gitignore` | Scripts, build, typecheck et artefacts générés. |
| `vercel.json`, `.github/workflows/ci.yml` | Routage et CI versionnés. |
| `src/`, `api/`, `server/_shared/` | Frontend, routes Vercel, auth, handlers et observabilité. |
| `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, types DB | Schéma attendu local, RLS/RPC/grants et Edge Functions. |
| Git local (`main`, `origin/main`, branches, tags, historique) | Traçabilité et état de livraison local. |
| Documents ANES 000–004 référencés par le Goal | Gates R1, Evidence, statut `Review` et traitement non arbitré des contradictions. |

`AGENTS.md` est absent du dépôt (fait confirmé par `PROJECT-CONTEXT.md` et l’inventaire).

## 4. Commandes exécutées

| Commande | Résultat |
| --- | --- |
| `git status --short`; vérification des refs `main`/`origin/main` | Arbre initial propre ; les deux refs : `c30a475…e847`. |
| Inventaire `package.json` | Scripts inventoriés avant toute exécution. |
| Recherches `rg`, lectures `sed`, Git en lecture seule | Inventaires et constats ci-dessous. |
| `npm run lint` | Succès ; 0 erreur, 1 avertissement `react-hooks/exhaustive-deps` dans `src/services/coach/useCoachResult.ts:227`. |
| `npm run typecheck` | Succès. |
| `npm test` | Succès : garde-fous egress Supabase. |
| `npm run test:google-connection-status` | Succès : 5 cas de mapping. |
| `npm run build` | Succès ; avertissements Browserslist obsolète et bundle JS principal gzip ~343 kB (> seuil 500 kB non compressé). |
| `git diff --check` | Succès avant remise finale. |

Non exécutés : `smoke`, `smoke:google-onboarding`, `smoke:auth`, `pdf:smoke`, `smoke:reports`, `npm audit` et tout CLI distant. Ils nécessitent des secrets, lisent un fichier d’environnement, ou appellent des endpoints/tiers ; ils sortent du périmètre R1.

## 5. Inventaire des composants

| Couche | Inventaire confirmé |
| --- | --- |
| Frontend | React 19, Vite 7, TypeScript, React Router, TanStack Query ; routes de dashboard, inbox, Google, analytics, coach, automatisation, rapports, équipe, fidélité et paramètres dans `src/App.tsx`. |
| API Vercel | 8 entrées : cron, Google, KPI, rapports, avis, settings, équipe et Apple Wallet. |
| Handlers | 12 handlers partagés : Google/OAuth, cron Google/IA/rapports, rapports et Wallet. |
| Supabase | 95 migrations suivies ; 38 tables avec activation RLS observable ; RPC de claim, inbox, fidélité, rapports et profils. |
| Edge Functions | `generate-reply`, `post-reply-google`, `process-review-analyze`, `google_oauth_start`, `google_oauth_exchange`, `google_oauth_callback`, `google_gbp_sync_all`, `google_gbp_sync_locations`. |
| CI/déploiement | Workflow GitHub Actions versionné ; routes Vercel catch-all pour `/api/cron`, `/api/google`, `/api/reports`, puis SPA. |

## 6. Cohérence documentation / code / configuration

**Fait confirmé.** La stack et le chemin React → API Vercel → handlers → Supabase sont cohérents entre `PROJECT-CONTEXT.md`, `package.json`, `vercel.json` et le code. `npm run build` construit les handlers vers `server/_shared_dist/`, que les routes API importent ; ce répertoire est ignoré et n’est pas une source éditable.

**Risque P1 — types DB divergents.** `cmp` confirme la divergence entre les deux fichiers de types. Le script `sync:db-types` existe mais son résultat n’est pas présent ; l’écart inclut au minimum `generated_reports`. Les entités tardives sondées (`wallet_passes`, `loyalty_members`, `user_profiles`, `review_ai_replies`, `ai_jobs`) ne sont pas trouvées dans ces types. [Evidence : `src/database.types.ts`, `server/_shared/database.types.ts`, migration head `20260711120000_supabase_egress_guardrails.sql`.]

**Risque P2 — documentation fonctionnelle incomplète.** Le README se présente comme le MVP inbox v0.1 et ne liste que deux Edge Functions, alors que huit sont suivies dans `supabase/functions/`; de nombreuses surfaces sont présentes au-delà de l’inbox.

## 7. Git, branches, tags et CI

**Fait confirmé.** Précondition satisfaite : `main` et `origin/main` pointaient sur `c30a475…e847`. Branche créée avec autorisation : `audit/goal-001-egia-readiness`. Le tag `v0.1-inbox-sync-stable` et la branche `release/v0.1-stable` existent et sont ancêtres de `main`.

**Fait confirmé.** `.github/workflows/ci.yml` exécute `npm ci`, `npm run lint`, `npm run build` sur PR et push vers `main`/`release/*`, Node 20.

**Limite de vérification.** État des checks CI, protections de branche, releases, règles de merge et déploiements GitHub/Vercel : à confirmer à distance.

## 8. Build, lint, typecheck et tests

Les cinq contrôles locaux autorisés ont réussi. La couverture disponible est toutefois limitée : le script `test` vérifie statiquement les garde-fous egress et le test Google valide cinq cas purs ; aucun test local de flux API, RLS, OAuth, intégration ou E2E n’a été trouvé dans les scripts.

**Risque P2.** `test:google-connection-status:clean` supprime `.tmp-tests`, alors que deux fichiers à cet emplacement étaient suivis par Git au départ. Ils ont été restaurés depuis `HEAD` pendant ce Run ; le script est donc fragile pour l’hygiène de l’arbre.

## 9. Architecture frontend, API et handlers

**Fait confirmé.** Les catch-all Vercel résolvent des allowlists de chemins : trois routes cron et cinq routes Google. Les routes API utilisent les handlers compilés depuis `server/_shared/`.

**Fait confirmé.** Les entrées observées appliquent majoritairement méthodes et authentification : `requireUser`, `getUserFromRequest` ou contrôle de secret cron selon le flux. Les routes publiques de fidélité utilisent un token public dédié.

**Limite de vérification.** Le comportement réel d’un déploiement Vercel et la correspondance avec le build courant ne sont pas démontrables localement.

## 10. Authentification et autorisations

**Fait confirmé.** Le frontend utilise Supabase Auth. Les API protégées valident un bearer via Supabase Auth ; les handlers Google sync/reply et KPI filtrent les données par utilisateur. Les cron Google et IA attendent un secret, avec un chemin admin explicite dans le handler IA.

**Risque P1.** Plusieurs Edge Functions versionnées ont `verify_jwt = false` (`google_*`, `post-reply-google`) ou une CORS permissive (`*`). Le code effectue ses propres contrôles dans certains cas, mais leur couverture effective dépend du secret et du déploiement distant. Une revue dédiée des points d’entrée Edge et de la configuration distante est requise avant de conclure à la sûreté multi-tenant.

**Limite de vérification.** Utilisateurs, rôles, JWT, configuration Auth, réinitialisations, fournisseurs OAuth et protections effectives : à confirmer à distance.

## 11. Supabase

### Migrations, tables et RPC

**Fait confirmé.** 95 migrations suivies créent notamment `google_connections`, `google_locations`, `google_reviews`, `review_replies`, `review_ai_replies`, `ai_jobs`, automatisations, alertes, rapports, équipes et fidélité. Les RPC incluent `claim_google_sync_connections`, `claim_ai_tag_candidates`, `claim_due_automation_workflows`, `claim_review_analyze_jobs`, `get_inbox_reviews`, `get_reviews_to_reply` et les RPC de fidélité.

### Grants, RLS et sécurité

**Fait confirmé.** Les migrations activent RLS sur 38 tables observées et comportent 270 occurrences RLS/policies/grants/security-definer. Les claims egress sont limités au rôle `service_role`; plusieurs RPC inbox sont explicitement accordées à `authenticated` et `service_role`; les RPC publics de fidélité sont explicitement cadrées par des grants/revokes.

**Limite de vérification.** Les migrations sont l’état attendu du dépôt, non la preuve de leur application. L’état distant des tables, fonctions, grants, policies, index, données et plans `EXPLAIN` est à confirmer.

### Types générés et écarts détectables

Voir le risque P1 de section 6 : les deux fichiers de types ne sont pas synchronisés et ne démontrent pas une génération depuis la migration head.

## 12. Edge Functions

**Fait confirmé.** Huit fonctions sont présentes ; `google_oauth_callback` renvoie volontairement HTTP 410 comme dépréciée. Les Edge Functions Google et post-reply sont parallèles aux routes Vercel. `generate-reply` et `post-reply-google` appellent respectivement OpenAI et Google ; `process-review-analyze` consomme la file IA via une clé interne.

**Risque P2.** La coexistence de deux chemins d’implémentation (Edge et Vercel) augmente le risque de dérive ; le code seul ne dit pas lequel est déployé ou utilisé.

## 13. Routes Vercel et traitements serveur

**Fait confirmé.** `vercel.json` route `/api/cron/*`, `/api/google/*` et `/api/reports/*`; les entrées KPI, avis, settings, équipe et Wallet existent séparément. Les handlers partagés couvrent sync Google, OAuth, réponse Google, crons IA/Google/rapports et génération de rapports.

**Limite de vérification.** Pas de test local Vercel ni d’appel HTTP : les méthodes, en-têtes et réponses ont seulement été inspectés statiquement.

## 14. Crons, tâches asynchrones et files de travail

**Fait confirmé.** Les routes cron connues sont `google/sync-replies`, `ai/tag-reviews`, `monthly-reports`. Les migrations/handlers implementent claims atomiques, `FOR UPDATE SKIP LOCKED`, limites de batch et métriques de durée ; `npm test` les contrôle statiquement.

**Contradiction à arbitrer.** README : Google cron toutes les 10 minutes. `docs/SUPABASE_EGRESS_AUDIT.md` : `0 * * * *` (horaire). Aucune configuration cron-job.org n’est versionnée ; aucune fréquence active n’est conclue.

## 15. Google Business Profile et OAuth

**Fait confirmé.** Le code contient OAuth start/callback, récupération d’établissements, synchronisation des avis et publication de réponses Google. Les scopes et endpoints Google sont présents dans les handlers et Edge Functions.

**Limite de vérification.** Consent screen, redirect URIs, credentials, scopes réellement consentis, refresh tokens, quota et synchronisations réelles : à confirmer sans lire de secret ni appeler Google.

## 16. OpenAI, Resend, Apple Wallet et intégrations externes

**Fait confirmé.** OpenAI est appelé pour génération/analyse, Resend pour équipe/rapports, et `passkit-generator` pour Wallet. Les intégrations externes sont construites côté serveur/Edge, avec variables de configuration nommées.

**Limite de vérification.** Configuration, délivrabilité, quotas, conformité, certificats Wallet et comportement réel de ces services : à confirmer à distance.

## 17. Variables d’environnement attendues

Inventaire par noms uniquement (code/config/docs, aucune valeur lue) :

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REPLY_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `INTERNAL_API_KEY`, `PROCESS_REVIEW_ANALYZE_SECRET`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APP_URL`, `APP_BASE_URL`, `VERCEL_URL`, `ALLOWED_ORIGINS`, `VITE_ADMIN_EMAILS`, `VITE_DEVELOPER_EMAILS` et variables de batch/timeout observées.

**Limite de vérification.** Présence, portée et valeurs dans les environnements : non consultées et à confirmer.

## 18. Gestion des erreurs, logs et observabilité

**Fait confirmé.** Environ 400 appels de log/erreur/réponse 4xx/5xx sont observables. Les APIs renvoient fréquemment un `requestId`; les crons exposent compteurs et durées. Le test egress vérifie notamment l’absence de log de `refresh_token` dans le cron Google.

**Risque P2.** La qualité de redaction, la rétention, l’agrégation et les alertes opérationnelles ne sont pas validées. Des messages d’erreur upstream sont parfois tronqués et journalisés ; leur contenu réel est inconnu sans inspection distante.

## 19. Sécurité, multi-tenant et exposition des données

**Fait confirmé.** Les migrations contiennent RLS, filtres `user_id`, grants spécifiques et fonctions `SECURITY DEFINER` avec `search_path` explicite. Les APIs inspectées authentifient l’utilisateur ou un secret avant les opérations privilégiées.

**Risque P1.** La sécurité effective ne peut pas être déclarée à partir des migrations seules : il faut vérifier les policies/grants actifs, la configuration Edge/Vercel et des scénarios inter-tenants sur un environnement autorisé. Les CORS permissives et `verify_jwt = false` observés justifient une revue prioritaire, pas une conclusion d’exploitation.

## 20. Déploiement, reproductibilité et rollback

**Fait confirmé.** `npm run build` est reproductible localement avec Node 20.19.6/npm 10.8.2 et la CI versionnée emploie Node 20. Les migrations egress documentent un rollback applicatif et les précautions de retrait SQL.

**Limite de vérification.** Déploiement Vercel, ordre build/migrations réel, artefacts, promotion, rollback réel et récupération de données : à confirmer. Aucun déploiement ni migration n’a été exécuté.

## 21. Fonctionnalités incomplètes, simulées ou non reliées

**Fait confirmé.** `src/pages/DeveloperConsole.tsx` contient des KPI, clients, alertes, santé et activité explicitement mockés ; son UI indique que plusieurs actions ne sont pas branchées. Billing contient « Bientôt disponible ». `Onboarding.tsx` contient des emplacements mockés ; `notifications.ts` utilise des notifications mockées en développement. `google_oauth_callback` est dépréciée.

**Risque P1.** Ces surfaces ne doivent pas être présentées comme opérations réelles sans décision produit et vérification de leurs routes d’accès. Le README ne délimite pas ce périmètre étendu.

## 22. Contradictions entre sources

| Sujet | Sources | État / impact |
| --- | --- | --- |
| Fréquence Google cron | README : 10 min ; audit egress : horaire | **À arbitrer.** Peut modifier charge, fraîcheur et coût ; aucune action effectuée. |
| Inventaire Edge Functions | README : 2 ; dépôt : 8 | **Fait confirmé :** README incomplet ; déploiement effectif inconnu. |
| Types DB | Client : `generated_reports`; serveur : absent | **Fait confirmé :** dérive locale à corriger dans un Goal dédié. |
| `.tmp-tests` | Script de clean ; fichiers suivis initialement | **Fait confirmé :** conflit d’hygiène ; restauré, sans correction. |

## 23. Registre des constats

| Type | Constat | Evidence |
| --- | --- | --- |
| Fait confirmé | Main/origin-main au hash exigé, arbre initial propre, branche audit créée. | Git local, hash `c30a475…e847`. |
| Fait confirmé | Lint/typecheck/tests/build locaux réussis ; 1 warning lint. | Section 4. |
| Fait confirmé | 95 migrations, 8 Edge Functions, 8 API Vercel, 12 handlers. | Inventaires `git ls-files`. |
| Risque P1 | Types DB client/serveur divergents et non synchronisés avec migrations récentes. | Section 6. |
| Risque P1 | Revue multi-tenant/Edge nécessaire avant affirmation de sûreté. | `supabase/functions/*/config.toml`, migrations et handlers. |
| Risque P2 | Documentation et surfaces mockées incomplètes pour le périmètre actuel. | README, DeveloperConsole, Billing, Onboarding. |
| Hypothèse | Les routes Vercel et handlers sont le chemin de production attendu. | `vercel.json`/code ; à confirmer par déploiement. |
| Limite de vérification | Services, secrets, CI, déploiement, migrations/RLS actifs et crons non consultés. | Restriction de Run R1. |

## 24. Risques P0 / P1 / P2

| Priorité | Risque | Décision / traitement requis |
| --- | --- | --- |
| P0 | Aucun P0 confirmé par la seule inspection locale. | Ne pas interpréter cela comme une validation de production. |
| P1 | Dérive des types Supabase ; types attendus incomplets. | Régénérer/valider les types contre un schéma autorisé, puis tester frontend/serveur. |
| P1 | Sécurité effective, RLS et Edge/Vercel non prouvées ; CORS/`verify_jwt=false` à examiner. | Goal sécurité avec accès lecture seule et tests inter-tenants autorisés. |
| P1 | Intégrations et crons critiques non testés sur environnement autorisé. | Goal de validation non mutante, runbook et observations. |
| P1 | Surfaces mockées/incomplètes accessibles dans le produit élargi. | Décision produit : masquer, documenter ou relier. |
| P2 | README incomplet et contradiction de fréquence cron. | Décision fondatrice puis documentation alignée. |
| P2 | Avertissements lint/build et script `.tmp-tests` fragile. | Correctifs techniques séparés et tests. |

## 25. Matrice réelle : critère → validation → Evidence

| Critère | Validation réelle | Evidence / résultat |
| --- | --- | --- |
| AC-01 | VAL-01 inventaire statique | Sections 3, 5, 9–17 ; composants et chemins listés. |
| AC-02 | VAL-02 revue de couverture | Cette matrice ; limites explicitement qualifiées. |
| AC-03 | VAL-03 traçabilité | Hash Git, chemins, commandes et registre section 23. |
| AC-04 | VAL-04 registre et priorisation | Section 24 ; aucun Goal correctif créé. |
| AC-05 | VAL-05 proposition soumise au fondateur | Verdict unique « non prêt », sections 1 et 28 ; revue fondatrice requise. |
| AC-06 | VAL-06 état Git et journal d’actions | Sections 29–30 ; seulement Goal et rapport modifiés. |

## 26. Futurs Goals correctifs proposés (non créés)

1. **Sécurité de production Supabase/Edge/Vercel** : vérifier RLS, grants, JWT, CORS, secrets et isolation inter-tenant sur accès autorisé.
2. **Régénération et contrat des types Supabase** : aligner les types client/serveur avec le schéma validé et ajouter une vérification CI.
3. **Validation opérationnelle Google/OAuth/crons** : arbitrer les schedules, tester le flux sans effet ou en environnement de test, mesurer logs/egress.
4. **Découpage produit et documentation** : inventorier les surfaces mockées/bêta, décider leur exposition et mettre README à jour.
5. **Qualité de build/test** : traiter warning ESLint, bundle, Browserslist et collision `.tmp-tests`.

## 27. Verdict final proposé

**Non prêt.** Cette proposition concerne l’usage quotidien fiable, non la capacité du code à compiler. Les validations locales et les garde-fous egress sont positifs, mais les dépendances qui portent l’authentification, les données, Google, IA, email, planification et déploiement ne sont pas vérifiées. Les risques P1 doivent être levés ou explicitement acceptés par le fondateur avant un verdict plus favorable.

## 28. Risques résiduels

État distant inconnu ; migrations, RLS/grants, déploiement et Edge Functions non confirmés ; intégrations externes non testées ; contradiction cron non arbitré ; fonctionnalités mockées potentiellement visibles ; taille de bundle et dette de test locales. Aucun de ces risques n’a été corrigé dans ce Run.

## 29. État Git initial et final

| Moment | État |
| --- | --- |
| Initial | `main`, propre ; `main` = `origin/main` = `c30a475…e847`. |
| Final | `audit/goal-001-egia-readiness`; seuls `goals/active/GOAL-001-egia-readiness-audit.md` et ce rapport doivent apparaître comme modifications durables. |

## 30. Actions interdites confirmées comme non exécutées

- Aucun commit, push, pull request, tag, déploiement, migration, cron ou endpoint externe exécuté.
- Aucune modification de produit, configuration, Supabase, secrets ou infrastructure.
- Aucun fichier `.env.local` ni valeur de secret lu ou rapporté.
- Aucun Goal correctif créé ; le Goal courant reste dans `goals/active/`.
