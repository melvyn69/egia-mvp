# GOAL-002 — Validation de sécurité de production

## Résumé exécutif

**Statut du rapport : audit partiel interrompu par condition d’arrêt P0.** Le Run 1 d’audit distant passif R2 en production a confirmé passivement une voie privilégiée publiquement exécutable : `public.claim_review_analyze_jobs(integer, text, text)`. La fonction peut sélectionner des jobs en attente, les faire passer à `processing` et retourner leur identifiant et leur payload, alors que les filtres d’utilisateur et de localisation sont fournis par l’appelant.

Le P0 impose l’arrêt du Run. Aucune tentative d’exploitation n’a été effectuée. Le verdict provisoire obligatoire est **`non sûr`**. `GOAL-002` reste `Blocked` jusqu’à correction du P0 et vérification indépendante.

## Périmètre effectivement audité

- Environnement : production.
- Audit passif des métadonnées et configurations déployées accessibles pendant le Run : catalogue et privilèges Supabase, configuration Auth et Storage, inventaire Edge Functions, métadonnées de déploiement Vercel, groupes d’erreurs agrégés Vercel avec quelques exemples techniques redigés, visibilité du dépôt GitHub.
- Comparaison ponctuelle avec le commit de production `464b4392a4dfbf95302f76d233122dc83d73a8f1`.
- L’audit a été arrêté à la confirmation du P0 ; les contrôles restants ne sont pas conclusifs.

## Sources distantes consultées

| Source | Consultation passive | Portée observée |
| --- | --- | --- |
| Supabase production | Oui | Métadonnées de fonctions, propriétaires, `search_path`, grants, RLS/policies, Auth et Storage. |
| Vercel production | Oui | Métadonnées de déploiement, groupes d’erreurs agrégés et quelques exemples techniques redigés. |
| GitHub | Oui | Visibilité du dépôt et alignement du commit de production. |

## P0 confirmé — voie privilégiée publiquement exécutable

### Fait confirmé

La fonction suivante est déployée en production :

`public.claim_review_analyze_jobs(p_limit integer, p_user_id text, p_location_id text)`

Les métadonnées et la définition déployée observées établissent passivement les éléments suivants :

- la fonction est `SECURITY DEFINER` ;
- son propriétaire est `postgres` ;
- son `search_path` est `public` ;
- le privilège `EXECUTE` est accordé à `anon`, `authenticated` et `service_role` ;
- aucune vérification de `auth.uid()` ni de rôle n’est présente dans la fonction ;
- elle sélectionne des jobs `review_analyze` dont le statut est `pending`, avec `FOR UPDATE SKIP LOCKED` ;
- elle met les jobs retenus à `status = 'processing'` et renseigne `started_at = now()` ;
- elle retourne le `id` du job et son `payload` ;
- les filtres `p_user_id` et `p_location_id` sont contrôlés par l’appelant.

### Qualification

- **Priorité : P0.**
- **Nature :** voie privilégiée publiquement exécutable.
- **Impact établi par définition et grants :** une mutation distante est possible sans authentification ; le `payload` peut être exposé.
- **Verdict :** `non sûr`.

Cette qualification est établie sans invocation de la fonction : la définition déployée et les grants actifs suffisent à constater la voie d’exécution et ses capacités.

## Constats secondaires

| Priorité / type | Constat | Qualification et limite |
| --- | --- | --- |
| Contrôle positif | Toutes les tables publiques observées ont RLS activée. | RLS activée ne suffit pas à conclure sur les chemins `SECURITY DEFINER`, les grants ou l’isolation effective ; contrôle passif partiel. |
| P1 | `ai_run_history`, `google_oauth_states` et `review_ai_replies_audit` ont RLS activée sans policy observée. | À examiner après correction du P0 : aucun accès n’a été testé, donc l’exposition effective n’est pas établie par ce constat seul. |
| P1 | Les Edge Functions `generate-reply`, `post-reply-google` et `process-review-analyze` sont déployées avec `verify_jwt = false`. | Contrôles compensatoires non validés jusqu’au bout du Run ; aucune fonction n’a été invoquée. |
| P1 | Plusieurs fonctions `SECURITY DEFINER` sont exécutables par `anon`. | Risque de privilège excessif ; elles ne sont pas classées P0 sans preuve explicite de capacité critique équivalente. |
| P2 | La protection Supabase contre les mots de passe compromis est désactivée. | Dette de durcissement Auth ; aucune compromission n’a été démontrée. |
| P2 | Le bucket public `brand-assets` est listable. | Exposition de métadonnées/objets publics à apprécier selon le contenu autorisé ; aucun objet ni donnée n’a été lu. |
| P2 | Le dépôt GitHub est actuellement public. | Exposition de code et de configuration versionnée ; aucun secret n’est déduit ou rapporté. |
| Contrôle positif / limite | Le déploiement Vercel de production est aligné sur `464b4392a4dfbf95302f76d233122dc83d73a8f1`. | Alignement de provenance seulement ; il ne valide pas les configurations distantes ni l’absence de risque. |
| P2 | Des groupes d’erreurs agrégés Vercel indiquent des erreurs de quota egress Supabase et des erreurs Google `invalid_grant`. | Quelques exemples techniques redigés étaient inclus ; aucun export complet de logs n’a été effectué et aucun payload métier, secret, jeton ou donnée utilisateur n’a été lu. Risque de disponibilité/intégration. |

## Actions interdites confirmées comme non exécutées

- Aucune invocation de `public.claim_review_analyze_jobs` ni d’une autre fonction, Edge Function, route, cron ou endpoint de production.
- Aucun payload métier, secret, jeton, donnée utilisateur, objet Storage ou identité n’a été lu.
- Aucune mutation n’a été effectuée par l’audit : ni DDL, DCL, DML, modification de grant, de RLS, de configuration, de migration, de secret, d’identité ou de déploiement.
- Aucun test inter-tenant actif, aucune tentative d’exploitation et aucun accès distant supplémentaire n’ont été effectués après la confirmation du P0.

## Matrice partielle — critère → validation → Evidence

| Critère | Validation | Evidence | État |
| --- | --- | --- | --- |
| AC-01 — migrations | VAL-01 | Historique distant des migrations Supabase observé jusqu’à `20260711120000_supabase_egress_guardrails`. | Partiel — historique distant consulté, mais comparaison exhaustive noms/hashes avec le dépôt non finalisée avant l’arrêt P0. |
| AC-02 — tables, RLS, policies, grants | VAL-02 | RLS activée sur les tables publiques observées ; trois tables sans policy observée. | Partiel. |
| AC-03 — `SECURITY DEFINER` et privilèges | VAL-03 | P0 : définition, propriétaire, `search_path` et grants de `claim_review_analyze_jobs`. | Échec critique. |
| AC-04 — isolation inter-tenant | VAL-04 | Aucun compte/tenant de test et aucun accès aux données réelles. | Non concluant — limite de vérification. |
| AC-05 — rôles et Auth | VAL-05 | Absence de garde `auth.uid()`/rôle dans le P0 ; protection contre mots de passe compromis désactivée. | Partiel, bloqué par P0. |
| AC-06 — Edge Functions | VAL-06 | Trois fonctions déployées avec `verify_jwt = false`. | Partiel ; contrôles compensatoires non vérifiés. |
| AC-07 — Vercel, routes et crons | VAL-07 | Alignement du déploiement et catégories de logs Vercel observés. | Partiel. |
| AC-08 — secrets et logs | VAL-08 | Groupes d’erreurs agrégés Vercel consultés avec quelques exemples techniques redigés ; aucun export complet de logs, payload métier, secret, jeton ou donnée utilisateur lu. | Partiel. |
| AC-09 — écarts déployé/versionné | VAL-09 | Commit Vercel aligné ; paramètres et grants distants observés. | Partiel. |
| AC-10 — rapport et priorisation | VAL-10 | Présent rapport partiel, P0 et verdict unique. | Partiel ; Run arrêté. |
| AC-11 — non-mutation | VAL-11 | Journal du Run : audit passif, sans invocation ni accès aux données. | Confirmé. |

## Verdict provisoire et condition de reprise

**Verdict provisoire obligatoire : `non sûr`.**

La reprise de `GOAL-002` exige d’abord la correction du P0, puis une vérification indépendante de cette correction. Aucun passage à `Review` ou `Done` ne peut intervenir avant cette vérification.
