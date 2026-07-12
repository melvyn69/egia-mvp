# GOAL-003 — Sécuriser la réclamation des jobs `review_analyze`

## Métadonnées

- **ID :** `GOAL-003`
- **Statut :** `Done`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-12`
- **Date de clôture :** `2026-07-12`
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

Le Run 3 autorisé le `2026-07-12` a été arrêté avant toute DDL : le préflight passif a révélé une collision de version entre l’historique distant et les migrations locales à `20260219130000`. Le diagnostic est délégué à `GOAL-004`; aucune reprise directe du déploiement n’est autorisée.

GOAL-004 est désormais `Done` et GOAL-005 a établi une stratégie hybride approuvée, sans réparation de l’historique de production. Le fondateur a autorisé le `2026-07-12` un nouveau Run 3 strictement limité au préflight passif, au passage `Blocked → Ready → Running`, à l’application de la migration `20260712120000_secure_claim_review_analyze_jobs.sql` et aux vérifications passives post-production. Le préflight de reprise est conforme, mais le Run a été arrêté avant mutation : l’outil Supabase `apply_migration` disponible ne permet pas d’imposer la version `20260712120000` et créerait une nouvelle entrée distante orpheline. GOAL-003 est donc de nouveau `Blocked` jusqu’à autorisation d’un mécanisme qui préserve exactement la version locale.

Le fondateur a ensuite autorisé explicitement un `supabase db push --linked --dry-run`, puis le push réel uniquement si GOAL-003 est l’unique migration proposée sous la version `20260712120000`. Le dry-run du `2026-07-12` satisfait exactement cette condition. GOAL-003 passe donc `Blocked → Ready → Running` avant le second préflight et la mutation contrôlée.

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

- Le Goal est `Done`. Le mécanisme corrigé `db push --linked` a appliqué uniquement `20260712120000_secure_claim_review_analyze_jobs.sql` après deux préflights identiques et un dry-run exact. Les Evidence post-production sont conformes, la vérification indépendante finale a rendu `APPROVED FOR FOUNDER CLOSURE` et le fondateur a autorisé la clôture documentaire le `2026-07-12`.
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
| `GOAL-004` — diagnostic de l’historique Supabase | satisfaite — `Done` | Cinq collisions et une migration locale seule établies ; GOAL-005 requis puis créé. |
| `GOAL-005` — réconciliation de l’historique Supabase | satisfaite pour le gate — `Running` | Stratégie hybride, manifeste, baseline, validateur, runbook et bootstrap isolé approuvés. |
| Revue indépendante Work | satisfaite avant production | Verdict `APPROVED FOR PRODUCTION GATE`; revue post-déploiement encore requise avant toute clôture. |
| Autorisation fondatrice avant mutation de production | satisfaite pour ce Run 3 | Autorisation du `2026-07-12`, limitée à la migration et aux vérifications décrites dans le gate. |
| Mécanisme exact de déploiement Supabase | exécuté conformément | Le dry-run a proposé uniquement GOAL-003, le second préflight est resté identique, puis `supabase db push --linked` a appliqué cette seule migration sous `20260712120000`. |
| Accès Supabase contrôlé pour déploiement et vérification | utilisé conformément aux Runs 3 et 4 | Migration unique appliquée et métadonnées post-production vérifiées ; aucune donnée applicative ni valeur secrète lue. |

## Décisions fondatrices consignées pour `Draft → Ready`

1. **Rôle minimal approuvé :** `service_role confirmé comme rôle minimal`. `supabase/functions/process-review-analyze/index.ts` utilise un client construit avec `SERVICE_ROLE_KEY`; `/api/cron/ai/tag-reviews` passe par `api/cron/[...slug].ts` puis `server/_shared/handlers/cron/ai/tag-reviews.ts`, qui utilise `SUPABASE_SERVICE_ROLE_KEY`. Aucun chemin légitime local utilisant `anon` ou `authenticated` n’a été identifié. La vérification post-production est restée strictement statique sur ces chemins : aucune valeur de clé n’a été lue et aucune configuration secrète n’est affirmée.
2. **Rollback approuvé :** restauration minimale du fonctionnement du worker et des seuls grants serveur strictement nécessaires ; interdiction absolue de rétablir `EXECUTE` à `PUBLIC`, `anon` ou `authenticated`; vérification des grants et du worker après rollback ; arrêt immédiat si le service ne peut être rétabli sans rouvrir l’exposition publique.
3. **Mécanisme de déploiement approuvé :** correctif sous forme de migration Supabase versionnée. Après les autorisations fondatrices distinctes, le Run 3 a utilisé `supabase db push --linked`, précédé d’un dry-run exact et de deux préflights identiques. Aucun déploiement automatique, secret affiché ou autre migration n’a été impliqué.
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
- L’environnement cible est production, car le P0 confirmé concerne production. Le correctif a été appliqué sous forme de migration versionnée par `supabase db push --linked`, après autorisation explicite, dry-run exact et second préflight conforme.
- La vérification post-déploiement a lu passivement la définition, le propriétaire, le `search_path`, l’empreinte du corps et les grants de la signature, sans aucune lecture de `ai_jobs` ni de payload.

## Evidence locales du Run 1

| Élément | Evidence locale / résultat | État |
| --- | --- | --- |
| Migration corrective | `supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql` : `REVOKE EXECUTE` à `PUBLIC`, `anon` et `authenticated`, puis `GRANT EXECUTE` à `service_role`, sur la signature exacte. Aucun corps de fonction, paramètre ou retour n’est modifié. | Créée localement au Run 1 ; application de production documentée séparément ci-dessous. |
| Chemins serveur légitimes | `supabase/functions/process-review-analyze/index.ts` utilise `SERVICE_ROLE_KEY`; `api/cron/[...slug].ts` route vers `server/_shared/handlers/cron/ai/tag-reviews.ts`, qui utilise `SUPABASE_SERVICE_ROLE_KEY`. Le test ne détecte aucun autre appel canonique local à la RPC. | Confirmé localement. |
| Test de non-régression | `scripts/test-claim-review-analyze-jobs-security.mjs`. | Renforcé et relancé avec succès : 28 contrôles, incluant les variantes `int`/`int4`, `GRANT ALL`, `GRANT ALL PRIVILEGES`, listes de rôles, identifiants/rôles cités, rôle non approuvé, grant commenté, commentaire inter-token, plusieurs statements, bloc dollar-quoted et chaînes contenant des marqueurs de commentaire ; les contrôles TypeScript excluent aussi commentaires et chaînes leurres. |
| Commandes exécutées | `node scripts/test-claim-review-analyze-jobs-security.mjs`; `git diff --check`; `git diff --no-index --check /dev/null` pour chacun des trois artifacts non suivis ; `npm run lint`; `npm run typecheck`; `npm test`. | Test ciblé (28 contrôles), `git diff --check`, les trois contrôles `--no-index --check`, typecheck et test existant réussis. Les commandes `--no-index` retournent `1` uniquement parce qu’un diff existe, sans diagnostic `--check`. Lint : 0 erreur, 1 warning préexistant `react-hooks/exhaustive-deps` dans `src/services/coach/useCoachResult.ts:227`. |
| Sécurité d’exécution | Aucun accès Supabase, Vercel ou GitHub distant, aucune lecture de secret, aucune invocation RPC/endpoint, aucune donnée utilisateur, aucun déploiement ni application de migration. | Confirmé pour ce Run local. |

À la clôture du Run 1 local, les Evidence de production restaient en attente. Elles sont désormais complétées ci-dessous pour l’application, le ledger, la signature, l’empreinte du corps, les grants et les chemins serveur statiques ; la revue indépendante finale et la proposition concernant `GOAL-002` restent en attente.

## Evidence du Run 3 — préflight arrêté

- **Projet Supabase :** `fhadiwkdznhuxtlgrwfd` ; nom observé : `egia-mvp` ; état observé : `ACTIVE_HEALTHY`.
- **Migration ciblée :** `20260712120000_secure_claim_review_analyze_jobs` ; absente de l’historique distant au préflight.
- **Collision constatée :** la production associe la version `20260219130000` à `drop_alerts_unique_rule_per_review`, alors que le dépôt associe la même version à `supabase/migrations/20260219130000_ai_jobs_queue.sql`.
- **Absence de mutation :** aucune DDL, DML, migration, fonction, permission, RLS, configuration, donnée ou secret n’a été modifié ; aucune RPC, Edge Function, route ou cron n’a été invoqué.
- **Décision :** la migration corrective GOAL-003 n’a pas été appliquée. `GOAL-003` ne peut pas reprendre directement depuis `Blocked`; après résolution de `GOAL-004` sans changement matériel de son contrat, il devra passer `Blocked → Ready`, et un nouveau Run 3 nécessitera une nouvelle autorisation fondatrice.

## Evidence du Run 3 relancé — préflight conforme avant mutation

- **Projet confirmé :** `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.
- **Migration locale immuable :** `20260712120000_secure_claim_review_analyze_jobs.sql`, SHA-256 `a0cefdffdd4283d92f7a0e5b331f10c8474807a29824c5e0a77869e4ef55b491`, identique au manifeste canonique.
- **Historique distant :** 97 entrées, les cinq collisions documentées par GOAL-004 et GOAL-005 sont présentes sous leurs noms distants attendus, et `20260712120000` est absente.
- **Fonction avant correction :** une seule signature `public.claim_review_analyze_jobs(integer, text, text)`, arguments nommés attendus, retour `TABLE(id uuid, payload jsonb)`, propriétaire `postgres`, `SECURITY DEFINER`, `search_path=public`.
- **Grants avant correction :** ACL directe `EXECUTE` pour `PUBLIC`, `postgres` et `service_role`; privilège effectif présent pour `anon`, `authenticated` et `service_role`, conforme au P0 validé.
- **Portée des lectures :** métadonnées d’identité, historique et catalogue uniquement ; aucune ligne métier, payload, donnée utilisateur, valeur secrète, RPC, fonction, route, cron ou endpoint n’a été lu ou invoqué.
- **Condition d’arrêt déclenchée :** le MCP `apply_migration` ne possède aucun paramètre de version et génère son propre timestamp distant. L’appliquer aurait produit une entrée `REMOTE_ONLY` au lieu de `20260712120000`, en contradiction directe avec le manifeste et le gate.
- **Alternatives non exécutées :** `supabase db push`, `supabase migration repair`, écriture manuelle du ledger et application SQL directe sans ledger sont toutes hors de l’autorisation reçue.
- **Absence de mutation :** aucun appel à `apply_migration`, aucune DCL, DDL, DML, migration, réparation ou modification distante n’a été effectué.
- **Revue indépendante :** `APPROVED FOR COMMIT`; l’arrêt, les statuts, l’absence de mutation et la recommandation `db push --linked --dry-run` puis push réel conditionnel sont approuvés.

## Evidence du Run 3 relancé — dry-run lié exact

- **CLI et lien :** Supabase CLI 2.67.1, projet lié `fhadiwkdznhuxtlgrwfd`; aucun mot de passe, token ou chaîne de connexion n’a été lu ou affiché.
- **Commande autorisée :** `supabase db push --linked --dry-run`, code de sortie `0`.
- **Plan retourné :** une seule migration, `20260712120000_secure_claim_review_analyze_jobs.sql`; aucun autre fichier, seed, rôle, repair ou flag supplémentaire.
- **Absence de mutation :** le dry-run indique explicitement que les migrations ne sont pas poussées ; le ledger et les grants restent inchangés à cette étape.

## Evidence du Run 3 relancé — application et postflight conformes

- **Second préflight :** projet `fhadiwkdznhuxtlgrwfd` / `egia-mvp` toujours `ACTIVE_HEALTHY`; `main`, `origin/main` et `HEAD` au SHA autorisé `05c29d8d557c2338417ee4f99c06e1b98a5f798b`; checksum migration inchangé `a0cefdffdd4283d92f7a0e5b331f10c8474807a29824c5e0a77869e4ef55b491`; historique encore à 97 entrées et grants pré-correction identiques.
- **Application :** `supabase db push --linked`, sans `--include-all`, `--include-seed`, `--include-roles` ni autre flag ; confirmation limitée à l’unique fichier `20260712120000_secure_claim_review_analyze_jobs.sql`; code de sortie `0`.
- **Ledger après application :** 98 entrées, avec une unique nouvelle entrée `20260712120000` / `secure_claim_review_analyze_jobs`; aucune autre entrée créée.
- **Fonction inchangée :** une seule signature `public.claim_review_analyze_jobs(integer, text, text)`, mêmes arguments nommés, retour `TABLE(id uuid, payload jsonb)`, propriétaire `postgres`, `SECURITY DEFINER`, `search_path=public`; empreinte du corps identique avant/après, MD5 `507ffaa9b4d88569b6e9124c1c0770b8`.
- **Grants après application :** ACL directe `EXECUTE` uniquement pour `postgres` et `service_role`; aucun grant `PUBLIC`; privilège effectif `false` pour `anon` et `authenticated`, `true` pour `service_role`.
- **Chemins serveur :** le test statique 28/28 confirme toujours `SERVICE_ROLE_KEY` pour `process-review-analyze`, `SUPABASE_SERVICE_ROLE_KEY` pour le cron `ai/tag-reviews` et l’absence d’appel via le client bearer utilisateur. Aucune RPC, Edge Function, route, cron ou endpoint n’a été invoqué.
- **Données et secrets :** aucune ligne applicative, payload, donnée utilisateur, valeur de secret, token, mot de passe ou chaîne de connexion n’a été lue ou affichée.
- **État après verdict fondateur :** GOAL-003 passe `Review → Done` le `2026-07-12`; GOAL-002 reste `Blocked`, GOAL-004 reste `Done` et GOAL-005 reste `Running`. Cette clôture n’autorise aucune nouvelle opération de production.

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

- Le premier essai a été arrêté avant toute DDL le `2026-07-12` à cause de la collision d’historique à `20260219130000`.
- GOAL-004 et le gate GOAL-005 sont désormais satisfaits ; le fondateur a autorisé la reprise et les transitions `Blocked → Ready → Running`.
- Après l’arrêt du mécanisme `apply_migration`, une nouvelle autorisation a permis le dry-run lié exact, le second préflight identique et l’application de la seule migration GOAL-003. GOAL-003 reste `Running` pendant la vérification indépendante finale.

### Run 4 — Vérification post-déploiement

- Vérifier passivement le ledger, les grants, la signature, l’empreinte du corps et la configuration de la fonction. — **réalisé, conforme**
- Vérifier statiquement le chemin serveur autorisé, sans donnée réelle ni invocation publique. — **réalisé, 28/28**
- Produire des Evidence redigées et obtenir la revue indépendante finale avant proposition concernant `GOAL-002`. — **réalisé — `APPROVED FOR FOUNDER CLOSURE`**

## Autorisations Git

- **Run 1 autorisé :** branche dédiée `fix/goal-003-secure-claim-review-jobs`, modification de la migration corrective et des tests strictement nécessaires, sans fichier hors scope.
- **Toujours interdit sans autorisation ultérieure :** commit, push, pull request, fusion, modification hors scope, réécriture d’historique et force-push.
- **Interdit sans décision ultérieure :** toute modification hors scope, réécriture d’historique, force-push et création de Goal secondaire non explicitement autorisé.

## Autorisations d’environnement

- **Run 1 autorisé :** lectures locales, migration et tests locaux strictement nécessaires ; aucune connexion distante, aucun déploiement, aucune mutation de production et aucun accès à une valeur secrète.
- **Run 3 :** repris le `2026-07-12` avec autorisation explicite de `db push --linked`; dry-run, second préflight et application unique réalisés conformément.
- **Run 4 :** lecture passive post-déploiement et vérification statique des workers réalisées ; aucune RPC ni donnée applicative.

## Conditions d’arrêt

- Le chemin serveur légitime n’est pas identifié.
- Le service dépend directement de `anon` ou `authenticated` pour appeler la fonction.
- La poursuite exige de lire une valeur secrète, un jeton, une donnée utilisateur ou un payload métier.
- La migration n’est pas réversible, idempotente ou suffisamment comprise.
- Un changement hors scope est nécessaire.
- Le worker légitime échoue ou ne peut pas être validé avec le rôle proposé.
- La définition locale diffère de manière imprévue de la production.
- L’historique distant des migrations entre en collision avec une version locale ou ne permet pas de relier de façon fiable les objets au contrat versionné.
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
- Work a rendu sa revue indépendante finale et le fondateur a autorisé la clôture de GOAL-003 ; toute reprise de `GOAL-002` demeure une décision séparée ;
- aucun autre composant hors scope n’a été modifié sans Goal et autorisation distincts.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-12` | N/A → `Draft` | Codex | Création du contrat de remédiation du P0 de `GOAL-002` ; aucune branche, exécution, modification produit, migration, test, accès distant, commit, push, PR ou déploiement n’est réalisé. |
| `2026-07-12` | `Draft` → `Ready` | Fondateur (Melvyn) | Rôle minimal service_role, rollback, validations et mécanisme de déploiement contrôlé approuvés ; Run 1 local autorisé. |
| `2026-07-12` | `Ready` → `Running` | Fondateur (Melvyn) | Run 1 local autorisé : migration corrective et tests de non-régression, sans accès distant ni déploiement. |
| `2026-07-12` | `Running` → `Blocked` | Fondateur (Melvyn) | Run 3 arrêté avant toute DDL : collision entre l’historique distant Supabase et les migrations locales à la version 20260219130000. GOAL-004 requis avant toute reprise du déploiement. |
| `2026-07-12` | `Blocked` → `Ready` | Fondateur (Melvyn) | GOAL-004 clôturé, stratégie GOAL-005 intégrée, tests et revue indépendante approuvés ; préflight de reprise conforme et Run 3 de production explicitement autorisé. |
| `2026-07-12` | `Ready` → `Running` | Codex | Run 3 relancé dans le périmètre autorisé : migration unique puis vérifications passives, sans opération hors scope. |
| `2026-07-12` | `Running` → `Blocked` | Codex | Arrêt avant mutation : `apply_migration` génère une version distante et ne peut pas inscrire exactement `20260712120000`; les mécanismes alternatifs ne sont pas autorisés. |
| `2026-07-12` | `Blocked` → `Ready` | Fondateur (Melvyn) | Autorisation explicite du mécanisme `db push --linked`; préflight passif et dry-run exact limités à GOAL-003 réussis. |
| `2026-07-12` | `Ready` → `Running` | Codex | Dry-run conforme : seule `20260712120000_secure_claim_review_analyze_jobs.sql` est proposée sous la version attendue ; second préflight puis push contrôlé engagés. |
| `2026-07-12` | `Running` → `Review` | Codex | Migration unique appliquée et postflight conforme ; test 28/28 et validateur réussis ; revue indépendante finale `APPROVED FOR FOUNDER CLOSURE`. Soumis au fondateur pour décision de clôture. |
| `2026-07-12` | `Review` → `Done` | Fondateur (Melvyn) | Verdict final accepté et clôture documentaire autorisée. GOAL-002 reste `Blocked`, GOAL-004 reste `Done`, GOAL-005 reste `Running`; aucune nouvelle opération de production n’est autorisée. |

## Readiness Check

| Point | État | Evidence / commentaire |
| --- | --- | --- |
| Identité, valeur business et P0 source | oui | P0 et objectif de réduction de privilège sont rattachés à `GOAL-002` et son rapport. |
| Scope et hors-scope | oui | Correction ciblée sur une fonction, ses grants et son chemin serveur ; surfaces P1/P2 exclues. |
| Chemin d’appel légitime exact | oui — local | Deux appels directs établis : `process-review-analyze` et `/api/cron/ai/tag-reviews`; leurs fichiers et rôles sont consignés dans l’analyse locale. |
| Rôle minimal requis | oui — approuvé et vérifié statiquement | `service_role` est le seul rôle effectif autorisé après migration ; les deux clients versionnés utilisent les variables serveur attendues, sans lecture de leur valeur. |
| Stratégie de rollback | oui — approuvée | Restauration minimale du worker et des grants serveur, jamais d’accès public par défaut ; arrêt obligatoire si ce principe ne suffit pas. |
| Validations de non-régression | oui — exécutées | Test 28/28 exécuté au Run 1 et après production ; validateur d’historique également réussi. |
| Mécanisme de déploiement autorisé | oui — exécuté sous contrôle | Dry-run exact, second préflight puis migration unique appliquée sous `20260712120000`, sans automatisation ni flag supplémentaire. |
| Risque, gates et autorités | oui | R3, autorisations fondatrices, arrêts successifs, reprise contrôlée, Evidence post-production, revue indépendante finale et décision de clôture sont tracés. |

**Résultat : production conforme, Goal `Done`.** Le ledger, la signature, le corps, les grants et les chemins serveur statiques satisfont le contrat. La revue indépendante finale a rendu `APPROVED FOR FOUNDER CLOSURE` et le fondateur a autorisé `Review → Done`.

## Livraison et clôture

- **Artifacts livrés :** contrat `Done`, migration appliquée sous sa version exacte, test 28/28, stratégie GOAL-005, deux préflights conformes, dry-run exact, Evidence post-production redigées, verdict indépendant final et décision fondatrice de clôture.
- **Décisions encore nécessaires :** décision séparée sur la reprise de GOAL-002 ; elle n’est pas incluse dans la clôture de GOAL-003.
- **État de `GOAL-002` :** demeure `Blocked`; aucune reprise n’est proposée avant correction vérifiée et revue indépendante.
- **Décision de clôture :** fondateur — `Review → Done` autorisé le `2026-07-12`; aucune nouvelle opération Supabase ou de production autorisée.
