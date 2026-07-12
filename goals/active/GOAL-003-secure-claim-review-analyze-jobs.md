# GOAL-003 — Sécuriser la réclamation des jobs `review_analyze`

## Métadonnées

- **ID :** `GOAL-003`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-12`
- **Date de clôture :** `N/A`
- **Niveau de risque proposé :** `R3` — correction d’un P0 de sécurité en production, impliquant potentiellement une fonction, ses grants et une migration. La validation distante, le déploiement et un rollback peuvent être nécessaires. Aucune exécution ne commence sans autorisation explicite du fondateur.

## Valeur business

Supprimer la possibilité pour un appelant non authentifié ou non autorisé de réclamer, modifier ou lire des jobs d’analyse.

## Résultat attendu

La fonction `public.claim_review_analyze_jobs(integer, text, text)` ne doit plus être exécutable par `anon` ni par un utilisateur `authenticated` ordinaire. Son usage légitime doit rester disponible uniquement pour le chemin serveur explicitement autorisé, dont le rôle minimal est établi pendant l’analyse.

Le correctif doit démontrer que la fonction ne peut pas fournir un payload ni faire passer un job de `pending` à `processing` par une invocation publique. Il ne présume pas que `service_role` est le rôle requis : ce point reste à déterminer à partir du chemin d’appel versionné et de la revue Work.

## Contexte

`GOAL-002` est `Blocked` à la suite de l’audit partiel documenté dans `audits/GOAL-002-production-security-validation.md`. Cet audit a confirmé passivement en production que `public.claim_review_analyze_jobs(p_limit integer, p_user_id text, p_location_id text)` est `SECURITY DEFINER`, détenue par `postgres`, avec `search_path=public` et exécutable par `anon`, `authenticated` et `service_role`.

La définition observée sélectionne des jobs `review_analyze` en attente, les réserve avec `FOR UPDATE SKIP LOCKED`, les met à `processing`, renseigne `started_at` et retourne leur `id` et leur `payload`. Les filtres utilisateur et localisation sont contrôlés par l’appelant ; aucune garde interne `auth.uid()` ou de rôle n’a été observée. Le P0 est établi passivement : aucune invocation, lecture de donnée utilisateur ou mutation n’a été réalisée par l’audit.

Ce Goal est un contrat de remédiation ciblé. Il ne modifie pas l’état de `GOAL-002` et ne constitue ni un audit général des fonctions `SECURITY DEFINER`, ni une autorisation de déployer.

## Sources de vérité

| Source | Rôle dans ce Goal |
| --- | --- |
| `goals/active/GOAL-002-production-security-validation.md` | État `Blocked`, conditions de reprise et règles de gouvernance du P0. |
| `audits/GOAL-002-production-security-validation.md` | Constat P0, définition déployée observée, grants et limites de l’audit interrompu. |
| `supabase/migrations/20260220152000_claim_review_analyze_jobs.sql` | Création locale initiale de la fonction. |
| `supabase/migrations/20260220153000_claim_review_analyze_jobs_grants.sql` | Grants locaux explicites : révocation à `anon`/`authenticated`, grant à `service_role`. |
| `supabase/migrations/20260220154000_fix_claim_review_analyze_jobs.sql` | Dernière définition locale versionnée de la fonction. |
| `supabase/functions/process-review-analyze/index.ts` | Appelant Edge Function direct, client créé avec `SERVICE_ROLE_KEY`. |
| `api/cron/[...slug].ts` et `server/_shared/handlers/cron/ai/tag-reviews.ts` | Route cron Vercel, garde d’entrée et appelant serveur direct, client créé avec `SUPABASE_SERVICE_ROLE_KEY`. |
| `supabase/config.toml`, `vercel.json`, `package.json` et `.github/workflows/ci.yml` | Configuration Edge, routage Vercel et mécanisme de migration/déploiement observable localement. |
| Work et fondateur | Revue indépendante, décisions de risque, autorisations de déploiement et de rollback. |

## Analyse locale du chemin d’appel

### Références directes et chaîne d’exécution

La recherche locale des références canoniques à `claim_review_analyze_jobs` trouve deux appelants directs versionnés. `server/_shared_dist/` est une sortie générée non suivie et n’est pas une troisième source canonique.

| Déclencheur / producteur | Handler ou worker | Client Supabase et RPC | Rôle attendu localement |
| --- | --- | --- | --- |
| Requête vers l’Edge Function `process-review-analyze` ; aucun appelant interne de cette Edge Function n’est trouvé dans le dépôt. | `supabase/functions/process-review-analyze/index.ts:113-154` traite la requête, crée `supabaseAdmin` et appelle `.rpc("claim_review_analyze_jobs", ...)`. La garde `x-process-secret` est conditionnelle à la présence de `PROCESS_REVIEW_ANALYZE_SECRET` (`:120-126`). | `getSupabaseAdmin` lit `SERVICE_ROLE_KEY` et crée le client (`:15-30`) ; l’appel RPC est à `:148-155`. | `service_role` attendu par le nom de clé, la création du client et le grant SQL local. La valeur réellement déployée n’est pas lisible localement. |
| Route Vercel `/api/cron/ai/tag-reviews`, routée par `vercel.json:4-8` vers `api/cron/[...slug].ts`. Le dispatcher associe `ai/tag-reviews` à `handleAiTagReviews` (`api/cron/[...slug].ts:1-10`). Les jobs sont aussi produits par les insertions `review_analyze` de `api/reviews.ts:916-924` et `:1423-1431`, sans appeler la RPC. | `server/_shared/handlers/cron/ai/tag-reviews.ts` accepte la route après secret cron ou contrôle administrateur (`:508-566`), puis réclame les jobs avec `.rpc("claim_review_analyze_jobs", ...)` (`:828-834`). | Le client singleton `supabaseAdmin` est créé avec `SUPABASE_SERVICE_ROLE_KEY` (`:97-116`), avant l’appel RPC. | `service_role` attendu explicitement. Même lorsqu’un bearer admin autorise l’entrée HTTP, la RPC est exécutée par ce client serveur, non par la session utilisateur. |

`supabase/config.toml:396-397` déclare `verify_jwt = false` pour `process-review-analyze`. Ce fait concerne l’exposition de l’Edge Function ; il ne crée pas un troisième rôle RPC ni ne justifie de conserver un grant public. Il confirme que le chemin Edge doit être examiné comme une dépendance opérationnelle du correctif, sans élargir ce Goal à sa remédiation complète.

### Conclusion sur le rôle minimal

**Conclusion obligatoire : `service_role confirmé comme rôle minimal`.** Dans le code versionné, les deux appelants directs de la RPC construisent un client avec une clé de rôle serveur (`SERVICE_ROLE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`) et la seule migration de grants explicite accorde l’exécution à `service_role`. Aucun appel direct depuis `src/` ou un client `anon`/session `authenticated` n’est trouvé.

Cette conclusion est limitée au contrat local : elle confirme le rôle minimal de l’architecture actuellement versionnée, pas la valeur ni le claim de la clé réellement déployée. La révocation à `anon` et `authenticated` ne doit donc pas casser ces deux chemins légitimes versionnés ; le comportement réel du worker restera à vérifier au Run 4 après déploiement autorisé.

### Contrat SQL local constaté

- La création locale initiale est `supabase/migrations/20260220152000_claim_review_analyze_jobs.sql:1-30`.
- La dernière définition locale est `supabase/migrations/20260220154000_fix_claim_review_analyze_jobs.sql:1-31`. Elle est `SECURITY DEFINER`, fixe `search_path = public`, sélectionne les jobs `review_analyze` `pending` avec `FOR UPDATE SKIP LOCKED`, les met à `processing` et retourne `id`/`payload`.
- Cette définition ne contient aucune garde interne `auth.uid()` ni de rôle. Une garde basée sur `auth.uid()` ne convient pas automatiquement à un appel `service_role` : le Run 1 doit évaluer une défense en profondeur compatible avec le worker plutôt que l’ajouter par défaut.
- `supabase/migrations/20260220153000_claim_review_analyze_jobs_grants.sql:1-2` révoque seulement `anon` et `authenticated`, puis accorde `EXECUTE` à `service_role`. Elle ne contient aucun `REVOKE ... FROM PUBLIC` ; l’état local ne démontre donc pas l’absence d’un grant `PUBLIC`.
- `SECURITY DEFINER` n’est pas justifié par le seul chemin local observé : les deux clients sont déjà de rôle serveur et `ai_jobs` est réservé à `service_role` dans `supabase/migrations/20260219130000_ai_jobs_queue.sql:19-22`. Sa conservation ou son retrait exige néanmoins une revue SQL Work, car le dépôt seul ne prouve pas l’ensemble des dépendances de privilèges.

## Scope

- Analyser le chemin d’appel versionné de `claim_review_analyze_jobs`.
- Faire approuver le rôle réellement nécessaire au chemin légitime : l’analyse locale confirme `service_role`, sous réserve d’une décision fondatrice ou de la création ultérieure d’un rôle serveur dédié.
- Créer, après autorisation du Run 1, une migration corrective idempotente.
- Révoquer `EXECUTE` à `PUBLIC`, `anon` et `authenticated`.
- Accorder explicitement `EXECUTE` uniquement au rôle nécessaire, une fois celui-ci identifié et approuvé.
- Conserver ou renforcer un `search_path` fixe.
- Ajouter une garde interne si elle apporte une défense en profondeur sans casser le chemin serveur légitime.
- Vérifier que le worker légitime continue à fonctionner avec le rôle autorisé.
- Ajouter des tests statiques ou SQL qui empêchent la régression des grants attendus.
- Déployer la migration uniquement selon une autorisation distincte du fondateur.
- Vérifier passivement après déploiement les grants et la définition, sans exposer de données.
- Produire les Evidence nécessaires pour proposer la reprise de `GOAL-002` à la revue indépendante.

## Hors-scope

- Corriger les autres fonctions `SECURITY DEFINER`.
- Corriger les Edge Functions avec `verify_jwt = false`.
- Modifier les RLS des autres tables.
- Traiter le bucket `brand-assets`.
- Changer la visibilité GitHub.
- Corriger Auth, Google OAuth, crons ou egress.
- Refactorer le système de jobs ou modifier le payload des jobs.
- Créer les Goals P1/P2 secondaires.
- Exploiter l’endpoint, invoquer la fonction publiquement, lire des données réelles ou conduire un audit distant non expressément autorisé.

## Contraintes

- Le Goal est `Running`. Le Run 1 local est en cours : branche dédiée, migration corrective idempotente et test de non-régression ont été produits ; seules les validations locales pertinentes sont autorisées. La production demeure non modifiée et les Runs 2, 3 et 4 restent soumis aux gates et autorisations distinctes du contrat.
- Le rôle minimal approuvé est `service_role`. Aucun grant ne doit être ajouté en dehors de la migration corrective autorisée au Run 1 et revue selon les gates du Goal ; un rôle serveur dédié ne peut pas être supposé sans décision ultérieure.
- Aucun secret, jeton, valeur de configuration, payload métier ou donnée utilisateur ne doit être lu, copié ni inscrit dans les Evidence.
- Toute validation distante est passive, limitée aux métadonnées nécessaires, redigée et ne peut commencer qu’au Run explicitement autorisé.
- Une correction qui exige un changement hors scope, un autre composant ou une sémantique différente du worker arrête le Run et revient à Work/fondateur.

## Dépendances

| Dépendance | État | Effet si absente |
| --- | --- | --- |
| `GOAL-002` et son rapport P0 | satisfaite | Le P0, son périmètre et les conditions de reprise sont traçables. |
| Identification exacte du ou des appelants légitimes | satisfaite localement | Deux appelants directs versionnés : Edge Function `process-review-analyze` et cron Vercel `ai/tag-reviews`. |
| Rôle minimal requis par le chemin légitime | approuvé | `service_role confirmé comme rôle minimal` ; aucun chemin légitime local `anon` ou `authenticated` n’a été identifié. |
| Méthode de rollback testable | approuvée | Restauration minimale du worker et des seuls grants serveur nécessaires, sans rétablissement d’accès public. |
| Tests de non-régression des grants | implémentés et exécutés localement | `scripts/test-claim-review-analyze-jobs-security.mjs` vérifie grants, signature, `SECURITY DEFINER`, `search_path`, appelants et absence de régression postérieure. |
| Revue indépendante Work | requise | Aucun déploiement ni proposition de reprise de `GOAL-002`. |
| Autorisation fondatrice avant mutation de production | requise | Run 3 interdit. |
| Mécanisme exact de déploiement Supabase | approuvé sous contrôle | Migration Supabase versionnée, accès Supabase contrôlé au Run 3 et outil Supabase contrôlé disponible au moment du Run ; aucune commande locale implicite ni automatisation de production. |
| Accès Supabase contrôlé pour déploiement et vérification | requis seulement aux Runs 3 et 4 | Déploiement et vérification distante impossibles. |

## Décisions fondatrices consignées pour `Draft → Ready`

1. **Rôle minimal approuvé :** `service_role confirmé comme rôle minimal`. `supabase/functions/process-review-analyze/index.ts` utilise un client construit avec `SERVICE_ROLE_KEY`; `/api/cron/ai/tag-reviews` passe par `api/cron/[...slug].ts` puis `server/_shared/handlers/cron/ai/tag-reviews.ts`, qui utilise `SUPABASE_SERVICE_ROLE_KEY`. Aucun chemin légitime local utilisant `anon` ou `authenticated` n’a été identifié. La présence effective de la bonne clé reste à vérifier seulement dans le Run distant autorisé concerné.
2. **Rollback approuvé :** restauration minimale du fonctionnement du worker et des seuls grants serveur strictement nécessaires ; interdiction absolue de rétablir `EXECUTE` à `PUBLIC`, `anon` ou `authenticated`; vérification des grants et du worker après rollback ; arrêt immédiat si le service ne peut être rétabli sans rouvrir l’exposition publique.
3. **Mécanisme de déploiement approuvé :** correctif sous forme de migration Supabase versionnée. Le Run 3 utilisera un accès Supabase contrôlé pour l’appliquer. Aucune commande locale implicite ni déploiement automatique n’est autorisé ; l’application de production exige une autorisation fondatrice distincte. La méthode exacte pourra être l’outil Supabase contrôlé disponible au Run 3 et aucun secret ne doit être affiché ou lu.
4. **Autorisation Run 1 :** création de branche dédiée, migration corrective idempotente, test de non-régression, inspection/adaptation locale des deux chemins serveur légitimes si nécessaire et exécution des tests locaux pertinents. Toute connexion distante, déploiement, changement de production, accès à un secret, commit, push ou PR reste interdit sans autorisation ultérieure.
5. **Gates suivants :** revue Work obligatoire avant le Run 3 ; accès Supabase contrôlé, créneau, migration ciblée et vérification passive nécessitent une autorisation explicite distincte du fondateur.

Les autorisations Git et environnement restent accordées Run par Run ; cette décision n’autorise que le Run 1 local.

## Critères d’acceptation

| ID | Critère observable | Validation associée | Evidence attendue |
| --- | --- | --- | --- |
| AC-01 | `anon` ne possède plus `EXECUTE` sur la signature corrigée. | VAL-01 | EV-01 |
| AC-02 | `authenticated` ne possède plus `EXECUTE` sur la signature corrigée. | VAL-02 | EV-02 |
| AC-03 | `PUBLIC` ne possède plus `EXECUTE` sur la signature corrigée. | VAL-03 | EV-03 |
| AC-04 | Seul le rôle serveur explicitement autorisé possède `EXECUTE`. | VAL-04 | EV-04 |
| AC-05 | La fonction reste `SECURITY DEFINER` uniquement si la justification documentée est acceptée. | VAL-05 | EV-05 |
| AC-06 | Le `search_path` de la fonction est explicitement fixé. | VAL-06 | EV-06 |
| AC-07 | Le chemin serveur légitime est identifié et validé avec son rôle minimal. | VAL-07 | EV-07 |
| AC-08 | Aucune invocation publique ne peut retourner un payload ni muter un job. | VAL-08 | EV-08 |
| AC-09 | La migration est idempotente et possède une stratégie de rollback revue. | VAL-09 | EV-09 |
| AC-10 | Un test de non-régression vérifie les grants attendus. | VAL-10 | EV-10 |
| AC-11 | L’état distant post-déploiement est vérifié passivement sans exposer de données. | VAL-11 | EV-11 |
| AC-12 | `GOAL-002` ne peut reprendre qu’après revue indépendante de la correction. | VAL-12 | EV-12 |

## Validations

| ID | Procédure | Résultat attendu | Responsable |
| --- | --- | --- | --- |
| VAL-01 | Examiner le SQL corrigé puis, au Run 4, les privilèges déployés de la signature. | Absence de `EXECUTE` pour `anon`. | Codex, revue Work |
| VAL-02 | Examiner le SQL corrigé puis, au Run 4, les privilèges déployés de la signature. | Absence de `EXECUTE` pour `authenticated`. | Codex, revue Work |
| VAL-03 | Examiner le SQL corrigé puis, au Run 4, les privilèges déployés de la signature. | Absence de `EXECUTE` pour `PUBLIC`. | Codex, revue Work |
| VAL-04 | Relier le grant explicite au chemin serveur identifié et à la décision fondatrice. | Un seul rôle nécessaire, explicitement autorisé, possède `EXECUTE`. | Codex, Work, fondateur |
| VAL-05 | Revoir la nécessité de `SECURITY DEFINER`, les alternatives et les effets du chemin serveur. | Conservation justifiée ou suppression documentée sans régression. | Codex, revue Work |
| VAL-06 | Lire la migration et, au Run 4, la configuration effective de la fonction. | `search_path` fixe et explicite. | Codex, revue Work |
| VAL-07 | Tracer l’appel versionné jusqu’au worker et valider le rôle minimal proposé. | Appelant légitime et méthode d’authentification/autorisation identifiés. | Codex, Work |
| VAL-08 | Utiliser uniquement une validation statique ou contrôlée autorisée démontrant l’absence de voie publique ; aucune invocation de production non autorisée. | Aucun rôle public ne peut obtenir payload ou mutation par cette fonction. | Codex, revue Work |
| VAL-09 | Revoir l’idempotence SQL et le plan de retour arrière avant toute production. | Migration rejouable selon le modèle retenu et rollback opérationnellement décrit. | Codex, Work, fondateur |
| VAL-10 | Exécuter les tests statiques ou SQL autorisés au Run 1. | Échec du test si un grant public réapparaît. | Codex, revue Work |
| VAL-11 | Après déploiement autorisé, lire passivement définition et grants sans données métier. | État distant conforme à AC-01 à AC-06. | Codex, revue Work |
| VAL-12 | Revoir le rapport de correction, le rollback et les Evidence post-déploiement. | Work formule une proposition de reprise ; seul le fondateur autorise la suite de `GOAL-002`. | Work, fondateur |

## Evidence attendues

| ID | Evidence à produire ou référencer | Critère couvert |
| --- | --- | --- |
| EV-01 | Extrait redigé de grant montrant la révocation à `anon`, plus vérification passive post-déploiement. | AC-01 |
| EV-02 | Extrait redigé de grant montrant la révocation à `authenticated`, plus vérification passive post-déploiement. | AC-02 |
| EV-03 | Extrait redigé de grant montrant la révocation à `PUBLIC`, plus vérification passive post-déploiement. | AC-03 |
| EV-04 | Registre du rôle serveur retenu, de sa justification et du grant explicite. | AC-04 |
| EV-05 | Décision de conservation ou retrait de `SECURITY DEFINER` et justification technique revue. | AC-05 |
| EV-06 | Définition redigée démontrant un `search_path` explicite. | AC-06 |
| EV-07 | Carte du chemin d’appel versionné et validation Work du rôle minimal. | AC-07 |
| EV-08 | Résultat de test statique/SQL autorisé établissant l’absence de voie publique, sans données réelles. | AC-08 |
| EV-09 | Migration, preuve d’idempotence et stratégie de rollback validée. | AC-09 |
| EV-10 | Résultat du test de non-régression des grants. | AC-10 |
| EV-11 | Registre passif post-déploiement : signature, propriétaire, `search_path`, grants et horodatage, sans données métier. | AC-11 |
| EV-12 | Revue indépendante Work et proposition documentée de reprise de `GOAL-002`. | AC-12 |

## Stratégie de rollback proposée

Le rollback ne sera défini en SQL et exécuté qu’après conception de la migration corrective, revue Work et autorisation fondatrice. La stratégie obligatoire est la suivante :

1. Préserver avant déploiement une Evidence redigée de la signature, de la définition, du `search_path` et des grants nécessaires au seul chemin serveur identifié.
2. Si et seulement si le worker légitime ne fonctionne plus après la migration approuvée, restaurer la définition précédente uniquement dans la mesure nécessaire pour rétablir ce worker ; ne pas restaurer une définition vulnérable par défaut si un ajustement ciblé suffit.
3. Restaurer exclusivement les grants nécessaires au rôle serveur validé. Ne jamais restaurer `EXECUTE` à `PUBLIC`, `anon` ou `authenticated` comme mécanisme de retour arrière.
4. Vérifier passivement après rollback la signature, le `search_path`, le caractère `SECURITY DEFINER` le cas échéant, les grants et le fonctionnement du chemin serveur autorisé avec les mécanismes de validation approuvés, sans lire de données métier.
5. Arrêter immédiatement le Run et escalader à Work/fondateur si le worker légitime ne fonctionne plus, si le rollback exige un grant public, si la définition réelle ne correspond pas à l’Evidence pré-déploiement ou si un autre composant hors scope doit changer.

## Validations locales de non-régression

Le Run 1 a créé et exécuté `scripts/test-claim-review-analyze-jobs-security.mjs`, sur le modèle de `scripts/test-egress-guardrails.mjs`, sans modifier `package.json` ni `.github/workflows/ci.yml`. Il utilise uniquement les modules Node standards et ne requiert ni secret, ni base locale, ni réseau. Son analyse SQL remplace les commentaires par un séparateur lexical sans altérer les chaînes ou blocs dollar-quoted, découpe les statements hors chaînes, normalise `int`/`integer`/`int4`, les identifiants cités et les listes de rôles ; son lexer TypeScript ignore commentaires et chaînes leurres avant les contrôles de code effectif.

| Test proposé | Source locale à analyser | Assertion attendue |
| --- | --- | --- |
| Grants publics absents | Migration corrective et toutes les migrations égales ou ultérieures touchant cette signature. | `PUBLIC` ne reçoit ni `EXECUTE` ni `ALL`, y compris si des commentaires séparent les tokens ou si la signature emploie `int4`; le test échoue à toute réintroduction. |
| Grant `anon` absent | Même périmètre SQL. | `anon` ne reçoit ni `EXECUTE` ni `ALL`, même dans une liste de rôles ou sous identifiant cité. |
| Grant `authenticated` absent | Même périmètre SQL. | `authenticated` ne reçoit ni `EXECUTE` ni `ALL`, même dans une liste de rôles ou sous identifiant cité. |
| Rôle minimal exclusif | Migration corrective et chaîne d’appel documentée ci-dessus. | Tout `GRANT EXECUTE`, `GRANT ALL` ou `GRANT ALL PRIVILEGES` sur la signature doit cibler exactement `service_role`, ou le rôle serveur explicitement approuvé s’il remplace cette décision. |
| `search_path` fixe | Définition canonique de fonction, que la migration corrective ne modifie pas. | La définition contient un `SET search_path` explicite et stable. |
| Chemin serveur légitime | `supabase/functions/process-review-analyze/index.ts`, `server/_shared/handlers/cron/ai/tag-reviews.ts` et `api/cron/[...slug].ts`. | Le lexer ignore commentaires et chaînes ; chaque appel direct effectif passe par un client de rôle serveur et aucun client bearer/session n’exécute la RPC. |
| Régression des grants | Analyse statique de tous les statements SQL de migrations égales ou postérieures pour cette signature. | Toute réintroduction de `EXECUTE` ou `ALL` à un rôle autre que le seul `service_role` échoue au test et exige revue Work. |

Une vérification SQL de catalogue, sans données métier, sera préparée pour le Run 4 afin de vérifier les privilèges effectifs et le `search_path` après déploiement. Elle ne sera ni écrite comme commande finale ni exécutée dans ce Draft.

## Mécanisme de déploiement établi localement

- Le véhicule de changement prévu est une migration Supabase versionnée dans `supabase/migrations/`; `supabase/config.toml:51-53` active les migrations et indique qu’elles sont utilisées lors d’un `db push` ou d’un `db reset`.
- Le dépôt ne contient ni script npm, ni workflow CI, ni procédure README qui exécute `supabase db push` vers production. `.github/workflows/ci.yml` ne lance que l’installation, le lint et le build ; aucun déploiement automatique n’est autorisé.
- L’environnement cible est production, car le P0 confirmé concerne production. Le correctif est approuvé sous forme de migration versionnée ; le Run 3 utilisera l’outil Supabase contrôlé disponible au moment du Run, avec accès contrôlé et autorisation fondatrice explicite distincte. Aucune commande locale implicite ne peut appliquer la migration.
- La vérification post-déploiement est techniquement possible par lecture passive des métadonnées Supabase : définition de la fonction, propriétaire, `search_path` et grants de la signature, sans aucune lecture de `ai_jobs` ni de payload. Cet accès reste soumis à autorisation distincte.

## Evidence locales du Run 1

| Élément | Evidence locale / résultat | État |
| --- | --- | --- |
| Migration corrective | `supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql` : `REVOKE EXECUTE` à `PUBLIC`, `anon` et `authenticated`, puis `GRANT EXECUTE` à `service_role`, sur la signature exacte. Aucun corps de fonction, paramètre ou retour n’est modifié. | Créée localement, non appliquée. |
| Chemins serveur légitimes | `supabase/functions/process-review-analyze/index.ts` utilise `SERVICE_ROLE_KEY`; `api/cron/[...slug].ts` route vers `server/_shared/handlers/cron/ai/tag-reviews.ts`, qui utilise `SUPABASE_SERVICE_ROLE_KEY`. Le test ne détecte aucun autre appel canonique local à la RPC. | Confirmé localement. |
| Test de non-régression | `scripts/test-claim-review-analyze-jobs-security.mjs`. | Renforcé et relancé avec succès : 28 contrôles, incluant les variantes `int`/`int4`, `GRANT ALL`, `GRANT ALL PRIVILEGES`, listes de rôles, identifiants/rôles cités, rôle non approuvé, grant commenté, commentaire inter-token, plusieurs statements, bloc dollar-quoted et chaînes contenant des marqueurs de commentaire ; les contrôles TypeScript excluent aussi commentaires et chaînes leurres. |
| Commandes exécutées | `node scripts/test-claim-review-analyze-jobs-security.mjs`; `git diff --check`; `git diff --no-index --check /dev/null` pour chacun des trois artifacts non suivis ; `npm run lint`; `npm run typecheck`; `npm test`. | Test ciblé (28 contrôles), `git diff --check`, les trois contrôles `--no-index --check`, typecheck et test existant réussis. Les commandes `--no-index` retournent `1` uniquement parce qu’un diff existe, sans diagnostic `--check`. Lint : 0 erreur, 1 warning préexistant `react-hooks/exhaustive-deps` dans `src/services/coach/useCoachResult.ts:227`. |
| Sécurité d’exécution | Aucun accès Supabase, Vercel ou GitHub distant, aucune lecture de secret, aucune invocation RPC/endpoint, aucune donnée utilisateur, aucun déploiement ni application de migration. | Confirmé pour ce Run local. |

Les Evidence et validations de production restent en attente : application de la migration, vérification distante des grants et de la clé configurée, vérification post-déploiement du worker et proposition de reprise de `GOAL-002`.

## Plan de Runs proposé

### Run 1 — Analyse et correctif local

- Utiliser le chemin local identifié : Edge Function `process-review-analyze` et cron Vercel `ai/tag-reviews`, tous deux appelants avec `service_role`.
- Migration corrective idempotente et test `scripts/test-claim-review-analyze-jobs-security.mjs` créés ; validations locales exécutées avec succès, à l’exception d’un warning lint préexistant consigné dans les Evidence.
- Révocation statiquement vérifiée à `PUBLIC`, `anon` et `authenticated`, grant exclusif au rôle approuvé, `search_path` et absence de nouvel appel client/session.
- Ne réaliser aucune connexion distante ni déploiement.
- Autorisations requises après `Ready` : branche documentaire/de correctif ciblée, modifications de migration et de tests, exécution de tests locaux explicitement approuvés.

### Run 2 — Revue indépendante

- Work revoit le correctif, le rôle proposé, le rollback et les validations.
- Ne réaliser aucune mutation distante.
- Toute ambiguïté sur le chemin légitime ou le rôle retourne au Run 1 ou au fondateur.

### Run 3 — Déploiement contrôlé

- Uniquement après autorisation explicite du fondateur.
- Appliquer la seule migration corrective approuvée en production, avec la stratégie de rollback validée.
- Ne réaliser aucun autre changement.

### Run 4 — Vérification post-déploiement

- Vérifier passivement les grants et la définition de la fonction.
- Vérifier le chemin serveur autorisé par les mécanismes approuvés, sans donnée réelle ni invocation publique.
- Produire des Evidence redigées et proposer la reprise de `GOAL-002` à Work puis au fondateur.

## Autorisations Git

- **Run 1 autorisé :** branche dédiée `fix/goal-003-secure-claim-review-jobs`, modification de la migration corrective et des tests strictement nécessaires, sans fichier hors scope.
- **Toujours interdit sans autorisation ultérieure :** commit, push, pull request, fusion, modification hors scope, réécriture d’historique et force-push.
- **Interdit sans décision ultérieure :** toute modification hors scope, réécriture d’historique, force-push et création de Goals secondaires.

## Autorisations d’environnement

- **Run 1 autorisé :** lectures locales, migration et tests locaux strictement nécessaires ; aucune connexion distante, aucun déploiement, aucune mutation de production et aucun accès à une valeur secrète.
- **Run 3 :** mutation de production uniquement avec autorisation fondatrice explicite, accès contrôlé et rollback approuvé.
- **Run 4 :** lecture passive post-déploiement uniquement, limitée aux métadonnées nécessaires et aux Evidence redigées.

## Conditions d’arrêt

- Le chemin serveur légitime n’est pas identifié.
- Le service dépend directement de `anon` ou `authenticated` pour appeler la fonction.
- La poursuite exige de lire une valeur secrète, un jeton, une donnée utilisateur ou un payload métier.
- La migration n’est pas réversible, idempotente ou suffisamment comprise.
- Un changement hors scope est nécessaire.
- Le worker légitime échoue ou ne peut pas être validé avec le rôle proposé.
- La définition locale diffère de manière imprévue de la production.
- Préserver le service impose de modifier d’autres composants, grants, RLS ou fonctions hors scope.
- L’autorisation de Run, de déploiement, de rollback ou de vérification est absente ou ambiguë.

## Définition de Done

Le Goal est `Done` seulement lorsque :

- les AC-01 à AC-12, leurs validations et leurs Evidence sont satisfaits et revus ;
- le rôle serveur minimal et le chemin d’appel légitime sont établis et approuvés ;
- les grants publics sont révoqués et le seul grant nécessaire est explicite ;
- la décision sur `SECURITY DEFINER` et le `search_path` fixe est justifiée ;
- la migration idempotente et son rollback ont été revus puis déployés avec les autorisations requises ;
- les tests de non-régression et la vérification passive post-déploiement sont concluants, sans exposition de données ;
- Work a rendu sa revue indépendante et le fondateur a autorisé la proposition de reprise de `GOAL-002` ;
- aucun autre composant hors scope n’a été modifié sans Goal et autorisation distincts.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-12` | N/A → `Draft` | Codex | Création du contrat de remédiation du P0 de `GOAL-002` ; aucune branche, exécution, modification produit, migration, test, accès distant, commit, push, PR ou déploiement n’est réalisé. |
| `2026-07-12` | `Draft` → `Ready` | Fondateur (Melvyn) | Rôle minimal service_role, rollback, validations et mécanisme de déploiement contrôlé approuvés ; Run 1 local autorisé. |
| `2026-07-12` | `Ready` → `Running` | Fondateur (Melvyn) | Run 1 local autorisé : migration corrective et tests de non-régression, sans accès distant ni déploiement. |

## Readiness Check

| Point | État | Evidence / commentaire |
| --- | --- | --- |
| Identité, valeur business et P0 source | oui | P0 et objectif de réduction de privilège sont rattachés à `GOAL-002` et son rapport. |
| Scope et hors-scope | oui | Correction ciblée sur une fonction, ses grants et son chemin serveur ; surfaces P1/P2 exclues. |
| Chemin d’appel légitime exact | oui — local | Deux appels directs établis : `process-review-analyze` et `/api/cron/ai/tag-reviews`; leurs fichiers et rôles sont consignés dans l’analyse locale. |
| Rôle minimal requis | oui — approuvé | `service_role confirmé comme rôle minimal` pour les deux clients versionnés ; la clé déployée reste à vérifier uniquement dans le Run distant autorisé concerné. |
| Stratégie de rollback | oui — approuvée | Restauration minimale du worker et des grants serveur, jamais d’accès public par défaut ; arrêt obligatoire si ce principe ne suffit pas. |
| Validations de non-régression | oui — approuvées | Test statique/SQL et emplacement probable définis ; création et exécution autorisées au seul Run 1. |
| Mécanisme de déploiement autorisé | oui — approuvé sous contrôle | Migration versionnée et outil Supabase contrôlé au Run 3, sans commande implicite ni automatisation ; autorisation de production distincte obligatoire. |
| Risque, gates et autorités | oui | R3, revue Work, gates de Run et autorisations fondatrices distinctes sont définis ; seul le Run 1 local est autorisé. |

**Résultat : Readiness Check validé.** Le rôle minimal, le rollback, les validations et le mécanisme de déploiement contrôlé sont approuvés. Le Goal est `Running`; le Run 1 local est en cours. Aucune transition vers `Review`, `Done` ou `Blocked` n’a eu lieu.

## Livraison et clôture

- **Artifacts livrés à ce stade :** contrat `Running`, migration locale `20260712120000_secure_claim_review_analyze_jobs.sql` et test local `scripts/test-claim-review-analyze-jobs-security.mjs`.
- **Décisions encore nécessaires :** autoriser séparément le Run 2, le Run 3 de production et le Run 4 ; revue Work du correctif, du rollback SQL concret et des Evidence du Run 1.
- **État de `GOAL-002` :** demeure `Blocked`; aucune reprise n’est proposée avant correction vérifiée et revue indépendante.
- **Décision de clôture :** `N/A` tant que les conditions de Done et les autorisations de Runs ne sont pas satisfaites.
