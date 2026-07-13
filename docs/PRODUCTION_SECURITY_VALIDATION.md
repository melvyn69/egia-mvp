# Validation de sécurité de production — GOAL-002

Date de l’audit local : `2026-07-13`
Branche : `security/goal-002-production-validation`
Base de comparaison : `main` = `origin/main` = `cb82cc5495a8c298e5dc79fcf33d920609644330`
Commit correctif approfondi : `8044d85` (`security: close remaining tenant and oauth gaps`)

## Décision

Le **candidat local corrigé** ne conserve aucune vulnérabilité critique ou élevée connue dans le périmètre audité. Les contrôles statiques, HTTP locaux, SQL isolés, le typage Deno et Node, le build et l’audit des dépendances constituent des Evidence reproductibles.

La **production n’est pas certifiée** par ce rapport. Aucune migration, Edge Function, variable, configuration Supabase/Vercel ni donnée distante n’a été lue ou modifiée pendant ce Run. Les corrections de cette branche ne sont donc pas présumées déployées. Le verdict de production reste `non sûr` jusqu’au déploiement autorisé, puis à une vérification distante redigée et à des tests inter-tenant sur des comptes synthétiques autorisés.

## Périmètre et méthode

L’audit couvre l’authentification et les sessions, les autorisations et IDOR, RLS/RPC/grants/`SECURITY DEFINER`, les routes API et cron, le `service_role`, Google OAuth, OpenAI, les secrets et logs, Storage/uploads, les en-têtes HTTP/CORS/cache/Vercel et les dépendances.

Les opérations effectuées sont limitées au dépôt, à des appels de handlers locaux sans réseau métier et à une base PostgreSQL locale isolée créée depuis la baseline canonique. Les fixtures SQL sont exécutées dans une transaction terminée par `ROLLBACK`. La base locale existante n’a pas été réinitialisée. Aucun secret versionné ou distant n’a été lu ; seuls des identifiants factices réservés aux tests ont été utilisés.

Références de conception Supabase utilisées : [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Functions](https://supabase.com/docs/guides/database/functions), [configuration locale des Edge Functions](https://supabase.com/docs/guides/functions/function-configuration) et [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Vulnérabilités démontrées et corrections

| Gravité initiale | Constat démontré | Correction du candidat | État local |
| --- | --- | --- | --- |
| Critique | `process-review-analyze` acceptait un secret interne absent : sans configuration, un appel anonyme pouvait utiliser le `service_role` et réclamer/modifier la file globale. | Secret obligatoire et refus fail-closed avant création du client admin ou RPC ; méthode `POST` et JSON objet obligatoires ; erreurs d’amont neutralisées. | Corrigé et testé. |
| Critique | `ensure_user_profile(uuid,text)`, `SECURITY DEFINER`, était exécutable par `PUBLIC`, `anon` et `authenticated`, avec identifiant et e-mail contrôlés par l’appelant. | Révocation `PUBLIC`/`anon`/`authenticated`; accès réservé à `service_role`; wrapper `ensure_profile()` limité à l’utilisateur authentifié. | Corrigé et testé en SQL. |
| Élevée | `generate-reply` avait `verify_jwt = false`, acceptait la clé publique et décodait un JWT sans vérifier sa signature, permettant un abus anonyme des crédits OpenAI. | `verify_jwt = true`, validation `auth.getUser`, refus anonyme, entreprise liée à l’utilisateur, bornes de payload et CORS explicite. | Corrigé, typé et testé. |
| Élevée | `post-reply-google` pouvait recevoir un `reviewId` arbitraire et comptait sur Google pour rejeter un avis étranger. | Vérification préalable de `google_reviews.user_id` + `review_name` via le client utilisateur/RLS, avant refresh token et appel Google. | Corrigé et testé. |
| Élevée | Une nouvelle soumission publique fidélité avec l’e-mail d’un membre existant renvoyait son code membre, son QR et son jeton Wallet, et modifiait son prénom. | `join_loyalty_program` refuse désormais une inscription existante sans mutation ni restitution de capacités ; une première inscription reste fonctionnelle. | Corrigé et testé en SQL. |
| Élevée | L’acceptation d’une invitation d’équipe vérifiait le jeton mais pas que l’e-mail du compte authentifié correspondait à l’invitation. | Liaison obligatoire entre l’e-mail Auth normalisé et l’e-mail invité. | Corrigé et gardé par test. |
| Élevée | La policy permissive historique `cron_state_select_auth` utilisait `USING (true)` et permettait à tout compte authentifié de lire l’état cron de tous les tenants, malgré une seconde policy propriétaire. | Suppression de la policy large et recréation d’une unique policy `user_id = auth.uid()` ; fixtures A/B ajoutées. | Corrigé et testé depuis une base isolée neuve. |
| Élevée | La route de réponse Google mettait à jour un `draftReplyId` fourni par le client avec le `service_role` en filtrant seulement sur l’ID : un utilisateur pouvait marquer comme envoyé le brouillon d’un autre tenant. | La mutation admin exige désormais simultanément `id = draftReplyId` et `user_id = utilisateur authentifié`. | Corrigé et gardé par test statique/typecheck. |
| Élevée | `brand-assets` était observé public dans la baseline de production et l’upload acceptait taille, extension et contenu déclarés par le client. | Bucket privé, limite 5 Mio, MIME PNG/JPEG/WebP, signature binaire et extension canonique côté serveur. | Corrigé et testé. |
| Élevée | L’arbre npm contenait un avis `ws` de déni de service exploitable en production et plusieurs avis élevés de build. | Mises à jour compatibles et overrides ciblés sur les versions corrigées. | `npm audit` = 0, dépendances de production et ensemble complet. |
| Moyenne | Les callbacks/Edge OAuth et plusieurs handlers journalisaient URL avec `code`/`state`, préfixe JWT, corps Google/OpenAI/Resend ou renvoyaient des erreurs d’amont. | Journalisation structurée minimale (statut/type), corps annulés ou parsés sans réflexion, erreurs client génériques, URL Google limitée au chemin. | Corrigé et recherché statiquement. |
| Moyenne | L’état OAuth Vercel n’était consommé qu’après échange et pouvait rester réutilisable après une erreur d’amont. | Consommation atomiquement vérifiée avant l’échange de code ; un second callback est refusé. | Corrigé, typecheck réussi. |
| Moyenne | L’échange OAuth Edge lisait l’état puis ne le supprimait qu’en fin de parcours, permettant une réutilisation après erreur ou une course entre deux appels. | `UPDATE ... WHERE state/utilisateur/provider/expiration` consomme l’état avant tout appel Google et renvoie la connexion consommée. | Corrigé, typé et gardé par test. |
| Moyenne | Les fonctions Edge utilisateur avaient des configurations JWT incohérentes et certaines réponses CORS trop permissives. | `verify_jwt = true` pour toutes les fonctions utilisateur ; worker interne seul conservé sans JWT avec secret obligatoire ; origines explicites. | Corrigé et gardé par test. |
| Moyenne | Des fonctions Edge authentifiées acceptaient des corps et champs de prompt non bornés, permettant une amplification mémoire/coût, et les déclarations JWT canoniques manquaient pour deux fonctions. | Limite de corps, types stricts et bornes par champ/tableau ; toutes les fonctions sont déclarées explicitement dans le `supabase/config.toml` racine. | Corrigé, typé et testé. |
| Moyenne | Les fonctions SQL existantes héritaient de grants d’exécution larges par défaut, y compris triggers, analytics et RPC utilisateur anonymes. | Default privileges fermés ; grants existants révoqués selon le rôle ; `is_admin()` recréée avec `search_path` fixé ; workers/analytics réservés à `service_role`. | Corrigé et testé en SQL. |
| Moyenne | `api/settings` pouvait construire le client utilisateur avec la clé `service_role` en fallback. | Clé anonyme obligatoire pour le client utilisateur ; le client admin reste séparé derrière l’authentification et le scope métier. | Corrigé. |
| Moyenne | Aucun socle d’en-têtes global et aucune politique de cache API n’étaient déclarés dans Vercel. | `no-store` pour `/api`, HSTS, `nosniff`, anti-framing, referrer/permissions policy et CSP compatible avec Supabase et Google Fonts. | Corrigé et validé statiquement/build. |

## Authentification, sessions et autorisations

- Le navigateur ne reçoit que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, valeurs publiques attendues. Aucune référence frontend à OpenAI, au `service_role`, aux secrets Google, Resend ou cron n’est présente.
- Les routes serveur utilisent `auth.getUser()`/`requireUser()` ; le JWT est validé par Supabase. `requireUser()` fournit désormais l’identifiant et l’e-mail normalisé nécessaires à la liaison des invitations.
- Les listes `VITE_ADMIN_EMAILS` et `VITE_DEVELOPER_EMAILS` restent des contrôles d’affichage uniquement. Les opérations serveur admin passent par `user_roles`, `is_admin()` ou une allowlist serveur. Le test SQL prouve qu’un rôle authentifié normal obtient `false` et ne peut exécuter les RPC de worker/analytics.
- Les routes utilisant le `service_role` appliquent d’abord une authentification utilisateur, un secret cron/interne, un jeton Wallet aléatoire ou un scope explicite `user_id`/`business_id`/`location_id`. Le worker de réponse interne dérive l’utilisateur de la file réclamée et revalide l’avis avec le même utilisateur.
- Le bug `authUser.id` dans l’exécution manuelle des automations a été corrigé en `authUser.userId`, évitant un scope utilisateur indéfini sur une route admin.

La configuration Auth réellement déployée — fournisseurs, politique de mots de passe, durée de session, MFA, URLs autorisées et protection contre les mots de passe compromis — n’a pas été consultée et reste à vérifier après autorisation.

## RLS, RPC, grants et `SECURITY DEFINER`

L’inventaire du catalogue local corrigé compte **41 tables applicatives `public`**, toutes avec RLS activée, et **3 vues**, toutes avec `security_invoker = true`. Les policies de `google_connections`, `google_locations`, `google_reviews`, `business_settings`, rapports, équipes, fidélité et `cron_state` reposent sur `auth.uid() = user_id` ou sur la possession de l’entreprise. Les rôles `anon`, `authenticated` et `service_role` n’ont pas `CREATE` sur le schéma `public`.

Le registre local compte **12 fonctions `SECURITY DEFINER`** : chacune possède une configuration `search_path` fixée. Les droits `anon` sont limités aux deux capacités publiques de fidélité prévues ; les droits `authenticated` sont limités aux wrappers/procédures utilisateur prévus ; les fonctions de worker, de claim et d’administration restent réservées au `service_role`.

La migration `20260713073853_production_security_hardening.sql` :

- révoque les droits implicites des triggers et helpers internes ;
- réserve `ensure_user_profile`, les analytics KPI/IA et les fonctions de claim aux workers ;
- conserve `ensure_profile`, `is_admin`, inbox et réponse sous rôle authentifié avec RLS ;
- fixe `is_admin()` à `pg_catalog, public, auth` et toutes les nouvelles fonctions privilégiées ajoutées ici à un `search_path` déterministe ;
- révoque les default privileges de fonction pour `PUBLIC`, `anon` et `authenticated` afin d’éviter une régression sur les futures fonctions.

Le test SQL isolé prouve : anonyme sans ligne ; A voit A mais pas B ; A ne modifie pas B ; A ne lit ni ne modifie l’état cron de B ; l’établissement B est invisible ; A n’est pas admin ; `claim_review_analyze_jobs`, `ensure_user_profile` et les KPI serveur sont inaccessibles aux rôles normaux ; `service_role` conserve le seul accès worker requis. Il échoue aussi explicitement si une future table perd RLS, si une vue perd `security_invoker`, si une fonction privilégiée perd son `search_path`, si une policy cron large réapparaît ou si les allowlists d’exécution s’élargissent.

## Routes API, crons et Edge Functions

| Surface | Méthodes | Garde attendue | Evidence locale |
| --- | --- | --- | --- |
| `/api/cron/ai/tag-reviews` | `GET`, `POST` | secret cron ou JWT d’un admin serveur | anonyme/mauvais secret `401`, méthode invalide `405`. |
| `/api/cron/google/sync-replies` | `GET`, `POST` | secret cron obligatoire | anonyme/mauvais secret `403`, méthode invalide `405`. |
| `/api/cron/monthly-reports` | `POST` | secret cron obligatoire | anonyme/mauvais secret `403`, méthode invalide `405`. |
| `generate-reply` | `POST`, `OPTIONS` | gateway JWT + `auth.getUser` + entreprise propre + payload borné | assertions de code, `deno check`, config JWT. |
| `post-reply-google` | `POST`, `OPTIONS` | gateway JWT + avis propre + connexion Google propre + payload borné | assertions de propriété avant appels externes. |
| `google_oauth_start/exchange` et sync utilisateur | `POST`, `OPTIONS` | gateway JWT + validation utilisateur ; état consommé avant échange | configs JWT, ordre de consommation et `deno check`. |
| `process-review-analyze` | `POST`, `OPTIONS` | secret interne obligatoire, sans fallback | assertions d’ordre fail-closed et payload. |

Les handlers d’abus sont invoqués avec un secret factice ; aucun appel métier externe n’est atteint. Les logs et réponses capturés sont testés pour ne contenir ni le secret correct, ni les fausses clés Google/`service_role`.

## Google OAuth, OpenAI, secrets et logs

- L’état OAuth est aléatoire, expirant, lié à l’utilisateur et consommé une seule fois avant l’échange. Le routeur ne journalise plus la query contenant `code`/`state`.
- Les refresh/access tokens Google restent dans les handlers serveur/Edge et `google_connections`. Les erreurs Google sont réduites à un statut ou un code contrôlé ; les corps ne sont plus renvoyés par les chemins corrigés.
- Tous les appels OpenAI recensés sont dans `api/`, `server/_shared/` ou `supabase/functions/`. Le navigateur n’importe aucune clé OpenAI.
- Les erreurs OpenAI ne journalisent et ne renvoient plus le corps d’amont. Les prompts, réponses, JWT, refresh tokens et valeurs de secrets ne sont pas écrits par les chemins corrigés.
- Les noms de variables manquantes ne sont plus renvoyés sur les routes publiques corrigées ; les réponses sont `Server misconfigured` ou une erreur métier générique.

La recherche sur l’état courant versionné ne trouve aucune forme de credential serveur dans les fichiers suivis. La recherche historique redigée ne trouve qu’un ancien exemple JWT de rôle public `anon`, sans identité ni e-mail et non expiré : il est classé comme ancienne clé publiable, pas comme secret serveur. Sa valeur, le projet et tout identifiant associé ne sont ni reproduits ni exportés.

La présence et la portée des variables réellement configurées, les logs historiques, leur rétention et les éventuelles anciennes occurrences sensibles restent non vérifiés à distance.

## Storage, fichiers et HTTP

- `brand-assets` devient privé. L’API génère des URLs signées ; les uploads sont limités à 5 Mio et à trois formats dont la signature binaire est vérifiée.
- Le bucket de rapports reste privé et les URLs sont signées à durée limitée dans les handlers existants.
- Les API reçoivent `Cache-Control: no-store, max-age=0`. Le site déclare HSTS, `X-Content-Type-Options`, anti-framing, politiques de referrer/permissions et une CSP bornant scripts, connexions, objets et ancres.
- Les fonctions Edge utilisateur n’utilisent plus d’origine `*`. Le callback Edge déprécié conserve une réponse publique `410` sans donnée ni capacité.

## Evidence et commandes reproductibles

| Validation | Résultat du 2026-07-13 |
| --- | --- |
| `npm run test:production-security` | 14 contrôles réussis. |
| `supabase/tests/production_security_abuse.sql` après baseline + GOAL-003 + migration GOAL-002 | transaction complète réussie, `ROLLBACK`, dans la base isolée existante puis depuis une base isolée neuve `goal002_security_test_20260713_run3`. |
| `deno check` sur les sept Edge Functions modifiées | réussi. |
| `npm run lint` | réussi avec un warning React Hooks préexistant, sans erreur. |
| `npm run typecheck` | réussi. |
| `npm run test` | réussi. |
| validateur d’historique avec `--base origin/main` | réussi : 99 migrations, 5 collisions documentées, checksum baseline vérifié. |
| `npm run test:migration-history:adversarial` | 29/29 réussis. |
| canonical bootstrap plan-only + guardrails | chaîne prospective exacte GOAL-003 puis GOAL-002 ; 10/10 guardrails. |
| `npm run build` | réussi ; avertissements non bloquants sur Browserslist et la taille du bundle. |
| `npm audit --omit=dev` | 0 vulnérabilité. |
| `npm audit` | 0 vulnérabilité. |
| `git diff --check` | réussi après documentation. |
| recherche frontend des secrets serveur | aucune occurrence ; seules URL et clé anonyme Supabase sont attendues. |

## Matrice complète critère → validation → Evidence

| Critère | Validation | Evidence locale du Run 2 | État production / conclusion |
| --- | --- | --- | --- |
| AC-01 | VAL-01 | EV-01 — validateur d’historique, checksum de baseline et plan bootstrap canonique : 99 migrations, GOAL-003 puis GOAL-002. | **Non concluant en production** : historique distant non relu pendant ce Run. |
| AC-02 | VAL-02 | EV-02 — inventaire catalogue : 41/41 tables `public` avec RLS, 3/3 vues `security_invoker`, policy cron large absente, tests A/B. | **Non concluant en production** : le catalogue déployé peut diverger. |
| AC-03 | VAL-03 | EV-03 — 12/12 fonctions `SECURITY DEFINER` avec `search_path` fixé et allowlists `anon`/`authenticated` testées. | **Non concluant en production** : migration/grants déployés non vérifiés. |
| AC-04 | VAL-04 | EV-04 — base locale synthétique : anonyme refusé, A ne lit/modifie ni données ni état cron de B ; transaction annulée. | **Non concluant en production** : aucun compte/tenant synthétique distant autorisé. |
| AC-05 | VAL-05 | EV-05 — matrice locale de rôles, RPC sensibles réservées, usages `service_role` audités et IDOR brouillon corrigé. | **Partiel** : configuration Auth et rôles réellement déployés non consultés. |
| AC-06 | VAL-06 | EV-06 — inventaire des sept Edge Functions modifiées, six fonctions utilisateur en JWT, worker interne secret-only, callback déprécié, CORS et `deno check`. | **Non concluant en production** : versions et `verify_jwt` déployés non relus. |
| AC-07 | VAL-07 | EV-07 — inventaire local routes/cron, tests mauvais/absence de secret, méthodes et en-têtes Vercel contrôlés. | **Non concluant en production** : déploiement, rewrites et crons distants non vérifiés. |
| AC-08 | VAL-08 | EV-08 — recherche source/frontend et historique redigée ; aucun secret serveur courant, ancien JWT public `anon` seulement. | **Partiel** : noms/portées de variables, redaction et rétention des logs distants non vérifiés. |
| AC-09 | VAL-09 | EV-09 — base `origin/main` fixée, diff candidat et chaîne prospective documentés ; aucun état distant présumé. | **Limite explicite** : comparaison déployé/versionné à réaliser après autorisation. |
| AC-10 | VAL-10 | EV-10 — présent rapport : faits, correctifs, limites, P0/P1/P2, matrice et verdict unique `non sûr`. | **Partiel** : revue indépendante Work et verdict fondateur encore requis. |
| AC-11 | VAL-11 | EV-11 — Run 2 limité au dépôt, handlers locaux et bases isolées ; aucune lecture/mutation Supabase/Vercel distante, aucun merge, aucune donnée existante supprimée. | **Satisfait pour le Run local**, sans élargir la conclusion à la production. |

## Priorisation P0 / P1 / P2

| Priorité | État | Éléments |
| --- | --- | --- |
| P0 | **Ouvert pour la production, fermé dans le candidat.** | Le Run 1 a confirmé l’exécution publique de `claim_review_analyze_jobs`; GOAL-003 corrige le dépôt. Le Run 2 corrige en plus le worker sans secret obligatoire et `ensure_user_profile` publiquement exécutable. Sans preuve que ces corrections sont déployées, le P0 historique ne peut pas être déclaré clos en production. |
| P1 | **Fermé localement, ouvert par absence d’Evidence distante.** | Isolation `cron_state`, IDOR `draftReplyId` sous `service_role`, JWT/CORS Edge, OAuth one-shot, propriété avis/entreprise, grants/RLS, Storage privé, Auth déployée, crons, variables et logs. Le candidat a des contrôles reproductibles ; la production reste non démontrée. |
| P2 | **Résiduel déclaré.** | Possession de l’e-mail non prouvée avant inscription fidélité, revue de logs historiques, validation navigateur de la CSP et dette d’observabilité/configuration non critique. |

Futurs Goals proposés, sans création : (1) déploiement contrôlé et vérification distante redigée du candidat ; (2) durcissement Auth avec MFA/rate limits/protection mots de passe compromis ; (3) validation e-mail one-shot pour la fidélité ; (4) audit de rétention/redaction des logs historiques.

## Publication et CI

- Pull request brouillon : [#35 — security: validate production trust boundaries](https://github.com/melvyn69/egia-mvp/pull/35), vers `main`, sans fusion autonome.
- Le commit `8044d85` et le présent complément d’Evidence doivent être publiés sur cette même branche ; les contrôles GitHub/Vercel sont à relancer sur le nouveau head avant de considérer la publication vérifiée.

## Matrice des tests d’abus

| Exigence | Preuve |
| --- | --- |
| Accès anonyme refusé | RLS SQL = zéro avis ; cron et Edge protégés ; RPC sensibles sans privilège. |
| A incapable de lire ou modifier B | lecture B = zéro, mise à jour B = zéro ligne ; état cron B invisible et non modifiable par A. |
| Établissement étranger refusé | `google_locations` de B invisible à A ; `post-reply-google` exige avis propre. |
| Cron sans/mauvais secret refusé | appels locaux automatisés `401/403`. |
| Méthode/payload invalide refusé | `405` automatisé ; JSON objet, champs et bornes vérifiés dans les Edge Functions. |
| Rôle normal privé des fonctions admin/developer | `is_admin() = false` pour A ; RPC worker/KPI sans `EXECUTE`. |
| Aucun contournement métier par `service_role` | auth/secret/capability vérifié avant client admin ; scopes utilisateur/avis/brouillon explicites ; ordre gardé statiquement. |
| RPC sensibles protégées | catalogues de privilèges contrôlés pour `anon`, `authenticated`, `service_role`. |
| Aucun secret dans les erreurs | corps d’amont supprimés ; réponses/logs cron capturés sans secret factice ; recherche statique. |
| État OAuth non rejouable | consommation atomique avant tout appel Google, côté Vercel et Edge ; ordre contrôlé statiquement. |
| Amplification de payload refusée | corps et champs texte/tableaux bornés, types stricts, erreurs `400/413`. |

## Risques résiduels et actions requises

1. **Production non déployée/non vérifiée — bloquant pour `Done`.** Faire relire et fusionner la PR, puis appliquer la migration prospective par le gate GOAL-005 avec une autorisation explicite. Déployer les Edge Functions et Vercel depuis le commit approuvé.
2. **Vérification distante — bloquant pour `Done`.** Après autorisation, confirmer les hashes de déploiement, la migration appliquée, les grants/`search_path`, le bucket privé, `verify_jwt`, les en-têtes HTTP, la portée des variables et l’absence de secrets dans les logs récents.
3. **Tests de production synthétiques — bloquant pour la certification inter-tenant.** Utiliser deux comptes et deux tenants de test sans donnée réelle pour répéter les refus A/B et les rôles. Ne jamais utiliser des tenants clients.
4. **Auth Supabase — non concluant.** Vérifier politique de mot de passe, MFA, sessions, CAPTCHA/rate limits, URLs de redirection et fournisseurs.
5. **Fidélité publique — risque moyen accepté temporairement.** Les capacités existantes ne sont plus divulguées, mais l’inscription ne prouve pas encore la possession de l’e-mail et permet de distinguer une adresse déjà inscrite. Une validation par lien e-mail à usage unique est recommandée avant extension du programme.
6. **CSP — validation navigateur post-déploiement.** Vérifier la console CSP sur les parcours connexion, Supabase Realtime, Google OAuth, rapports et Wallet ; n’élargir une directive qu’avec Evidence d’un besoin précis.
7. **Logs historiques.** Rechercher et purger/faire expirer selon la politique les anciennes lignes susceptibles de contenir un préfixe JWT, une query OAuth ou un corps d’amont, sans exporter ces valeurs.

## Verdict final du Run local

**Candidat local : prêt pour revue et déploiement contrôlé.**
**Production : `non sûr` tant que le candidat n’est pas déployé et vérifié.**

GOAL-002 doit rester en cours/revue, jamais `Done`, jusqu’à la réalisation des actions 1 à 4 et à l’absence confirmée de vulnérabilité critique ou élevée dans l’environnement réellement déployé.
