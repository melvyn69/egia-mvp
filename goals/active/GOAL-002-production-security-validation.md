# GOAL-002 — La sécurité de production d’EGIA est établie par Evidence contrôlées

## Métadonnées

- **ID :** `GOAL-002`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-11`
- **Date de clôture :** `N/A`
- **Niveau de risque :** `R2` — le Run 2 autorise des corrections locales, une migration prospective non destructive, des tests d’abus locaux et une PR, sans mutation distante. Une revue indépendante Work, le déploiement explicitement autorisé et le verdict du fondateur restent requis avant clôture.

## Valeur business

Le fondateur dispose d’une conclusion vérifiable sur la capacité réelle d’EGIA à protéger les données et les droits des tenants dans les environnements autorisés. Cela évite de déduire la sûreté de production à partir des seules migrations et du code versionné, alors que RLS, grants, Auth, Edge Functions, Vercel, crons et secrets dépendent aussi de leur configuration déployée.

## Résultat attendu

Un rapport de sécurité vérifiable distingue les **faits confirmés**, les **risques**, les **limites de vérification** et les hypothèses résiduelles. Il établit, pour chaque environnement expressément autorisé, l’état réellement observable de Supabase, de RLS, des grants, des fonctions `SECURITY DEFINER`, de l’isolation multi-tenant, des Edge Functions, de Vercel, des secrets, de l’authentification, des autorisations, des journaux et de l’exposition des données.

Le rapport classe les constats en P0/P1/P2, contient une matrice complète `critère → validation → Evidence`, propose de futurs Goals correctifs sans les créer, et conclut exactement par l’un des verdicts suivants : `sûr pour usage contrôlé`, `sûr sous conditions` ou `non sûr`.

## Contexte

Le rapport de `GOAL-001` conclut que le code versionné comporte des garde-fous observables mais ne démontre pas l’état distant de Supabase, RLS/grants, Edge Functions, Vercel, Auth, crons ni des intégrations. Il relève notamment des fonctions Edge avec `verify_jwt = false` et/ou CORS permissif dans le dépôt, ainsi que des chemins parallèles Edge Functions et routes Vercel. Ces constats justifient une validation dédiée ; ils ne démontrent pas, à eux seuls, une vulnérabilité déployée.

L’environnement inclus est **production**. Le Run 1 d’audit distant passif R2 a été exécuté puis interrompu dès la confirmation passive d’un P0 sur une fonction `SECURITY DEFINER` publiquement exécutable. Un rapport partiel est produit ; le verdict provisoire obligatoire est `non sûr`. Le Goal est `Blocked` jusqu’à correction du P0 puis vérification indépendante. Aucun endpoint de production n’a été appelé, aucun test inter-tenant actif n’a été exécuté, aucun environnement n’a été modifié et seuls les artefacts documentaires autorisés sont modifiés dans le dépôt.

### Avenant fondateur — Run 2 du 2026-07-13

La directive fondatrice du `2026-07-13` reprend ce Goal après la clôture de GOAL-005 et remplace, pour le Run 2, les limitations devenues obsolètes du contrat initial. En cas de contradiction avec les sections historiques ci-dessous, le présent avenant prévaut.

- Les corrections locales d’écarts de sécurité démontrés, les tests d’abus, une migration prospective additive/restrictive, la documentation, une branche dédiée, des commits, un push et une pull request sont autorisés.
- Aucun accès, déploiement, test HTTP ou changement Supabase/Vercel distant n’est autorisé sans nouvel accord explicite. Aucun merge dans `main` n’est autorisé.
- Les tests peuvent utiliser uniquement des handlers locaux avec valeurs factices et une base PostgreSQL locale isolée issue de la baseline canonique, sans suppression de données ni réinitialisation de la base existante.
- La décision `Done` exige lint, typecheck, tests, build, audit de dépendances, contrôles de secrets, Evidence d’isolation A/B et absence de vulnérabilité critique/élevée dans la production réellement déployée. Une validation locale seule ne suffit pas.
- Le rapport principal du Run 2 est `docs/PRODUCTION_SECURITY_VALIDATION.md`. Le rapport `audits/GOAL-002-production-security-validation.md` demeure l’Evidence historique immuable du Run 1.

Le P0 historique `claim_review_analyze_jobs` a été corrigé et vérifié par GOAL-003. GOAL-005 a ensuite établi le gate de migration canonique. Le Run 2 passe donc `Blocked → Running`, audite l’état courant du dépôt et prépare un candidat correctif sans présumer son déploiement.

## Sources de vérité

| Source | Portée / règle applicable |
| --- | --- |
| `PROJECT-CONTEXT.md` | Contexte EGIA, inventaire connu, responsabilités et interdiction de lire les valeurs de secrets. |
| `goals/active/GOAL-001-egia-readiness-audit.md` | Contrat et état de clôture de l’audit de préparation précédent. |
| `audits/GOAL-001-egia-readiness-audit.md` | Constats locaux à confronter à l’état distant ; ne prouve pas celui-ci. |
| `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, `src/database.types.ts`, `server/_shared/database.types.ts` | État attendu versionné de Supabase, des fonctions, RLS, RPC et grants. |
| `src/`, `api/`, `server/_shared/`, `vercel.json`, `.github/workflows/ci.yml` | Authentification, autorisations, routes, crons, dépendances de déploiement et comportement attendu. |
| Console/API Supabase, Vercel, GitHub et, si nécessaire, ordonnanceur de cron **expressément autorisés** | Métadonnées et configuration réellement déployées ; leur accès doit être consigné par environnement. |
| `/Users/melvyn/Desktop/ANES/anes/docs/000-blueprint.md` | Invariants de contrats, Evidence et vérification. |
| `/Users/melvyn/Desktop/ANES/anes/docs/001-founder-edition.md` | Responsabilités du fondateur, de Work et de Codex. |
| `/Users/melvyn/Desktop/ANES/anes/docs/002-operating-model.md` | Qualification R2, gate de revue et conditions d’arrêt. |
| `/Users/melvyn/Desktop/ANES/anes/docs/003-goal-standard.md` | Contrat du Goal, Readiness Check, Evidence et transitions. |
| `/Users/melvyn/Desktop/ANES/anes/docs/004-governance-and-learning.md` | Gouvernance des contradictions et décisions. |
| `/Users/melvyn/Desktop/ANES/anes/templates/GOAL.md` | Structure de référence non normative, complétée par 003. |

Une capture, une console, un log ou une configuration distante ne peut établir que l’environnement, l’horodatage et la portée explicitement identifiés. Aucune source distante n’est présumée accessible ni identique au code versionné.

## Scope

- Comparer, sans mutation, l’état déployé de **production** à l’état versionné de Supabase, Edge Functions et Vercel, par les mécanismes lecture seule autorisés ne révélant aucune valeur secrète.
- Vérifier les migrations appliquées, tables exposées, RLS, policies actives, grants, propriétaires et fonctions `SECURITY DEFINER`, y compris leur `search_path`, droits d’exécution et rôle appelant lorsque la métadonnée est accessible.
- Identifier les tables applicatives sans RLS, les vues/RPC accessibles, les privilèges excessifs et la séparation effective entre `anon`, `authenticated`, `service_role` et rôles de base pertinents.
- Qualifier l’isolation inter-tenant à partir des policies, grants, fonctions et chemins d’accès déployés ; durant le premier Run, consigner `non concluant — limite de vérification` faute de comptes/tenants de test autorisés, sans tenter d’accès à des données réelles.
- Examiner l’Auth Supabase par configuration et métadonnées : fournisseurs activés, URLs de redirection, règles de session/MFA si configurées, liens d’administration, politique de mot de passe et paramètres d’inscription, sans consulter d’identités, jetons, e-mails ni données de session.
- Examiner la configuration et le déploiement des Edge Functions : inventaire, version/déploiement, `verify_jwt`, secrets par **nom seulement**, méthodes, contrôles internes, CORS et réponses d’erreur.
- Examiner les routes Vercel publiques/protégées, les réécritures, les déploiements concernés, la protection des routes cron, les variables d’environnement par nom et les écarts entre code versionné et configuration déployée.
- Examiner, par règles de redaction, schémas, échantillons de métadonnées et recherche de signatures sensibles autorisés, les journaux susceptibles d’exposer des données, sans exporter de messages bruts ni de contenu utilisateur.
- Le Run 1 a produit `audits/GOAL-002-production-security-validation.md` et ses Evidence redigées, puis a été arrêté par condition d’arrêt P0 ; il ne passe pas à `Review`.

## Hors-scope

- Corriger, refactorer, formater ou modifier le code, les migrations, les policies, les grants, les fonctions, les routes, les secrets, les configurations, les données ou l’infrastructure.
- Appliquer/rejouer une migration, exécuter du DDL/DCL/DML, modifier RLS/grants, redéployer, modifier une variable d’environnement, régénérer une clé, pivoter un secret, créer/supprimer un compte, réinitialiser un mot de passe ou modifier une configuration Auth.
- Lire, afficher, copier, télécharger, transmettre ou stocker la valeur d’un secret, d’un jeton, d’une clé privée, d’un mot de passe, d’un cookie, d’un en-tête `Authorization`, d’un refresh token ou d’une donnée personnelle.
- Exporter des données de production, consulter le contenu brut des avis, réponses, tokens OAuth, e-mails, journaux applicatifs ou traces contenant des identifiants ; tout échantillon est agrégé, redigé et limité aux métadonnées nécessaires.
- Déclencher un cron, un webhook, une synchronisation Google, une génération IA, un envoi d’e-mail, une réponse Google, un paiement, un endpoint ayant un effet externe ou une Edge Function non confirmée sans effet.
- Tester par force brute, fuzzing non borné, scan intrusif, déni de service, contournement d’authentification, injection destructive, création de charges malveillantes ou exfiltration volontaire.
- Créer un Goal correctif, un commit, un push, une pull request ou un déploiement ; la branche documentaire est encadrée par les autorisations Git.

## Contraintes

- Principe du moindre privilège : accès nominatif, temporaire, lecture seule et limité aux environnements, projets et surfaces listés dans l’autorisation fondatrice ; aucun compte partagé ni service role n’est remis à Codex.
- Les valeurs secrètes restent dans leur gestionnaire ou leur console. Seuls le **nom**, la présence/absence et la portée (`production`, preview, Edge Function, etc.) peuvent être vérifiés ou consignés ; toute valeur reste interdite.
- Les Evidence ne contiennent ni SQL de données réelles, ni valeurs de variables, ni URLs signées, ni identifiants de projet non publics, ni e-mails, ni IDs utilisateur/tenant, ni extraits de logs bruts. Elles utilisent des chemins, versions, hashes, compteurs, catégories et identifiants pseudonymisés (`tenant-A`, `user-B`).
- Le premier Run n’effectue aucun appel HTTP direct vers un endpoint de production, même en `GET`/`HEAD`/`OPTIONS`. Les seuls accès distants admis sont les consoles ou mécanismes de métadonnées lecture seule autorisés ; toute requête ambiguë est interdite.
- Aucun compte ni tenant de test n’est disponible au premier Run. Aucun test d’autorisation ou inter-tenant actif, ni aucune lecture de données réelles, ne peut être tenté ; cette limite est consignée dans VAL-04/EV-04.
- Toute différence code/déploiement est un fait à qualifier, jamais une correction implicite. Toute correction relève d’un Goal distinct.
- Les constats sont libellés **fait confirmé**, **risque**, **hypothèse** ou **limite de vérification** et sont datés, rattachés à un environnement pseudonymisé et à une Evidence.

## Accès requis et informations lisibles

| Système | Accès minimal requis | Informations autorisées en lecture | Informations interdites |
| --- | --- | --- | --- |
| Supabase — base et API | Rôle d’audit lecture seule sur les catalogues/métadonnées du ou des projets autorisés ; aucune capacité DDL/DML ni clé `service_role`. | Historique des migrations, schémas, tables/vues, RLS, policies, grants, rôles, propriétaires, définitions de fonctions/RPC et paramètres non secrets. | Lignes métier, données Auth, Storage, valeurs de secrets, jetons, clés, mots de passe, PII, contenu de JSON métier. |
| Supabase — Auth, Edge Functions et logs | Console/API lecture seule bornée à la configuration, inventaire, déploiement et règles de redaction. | Fournisseurs, URLs/paramètres non secrets, statut MFA/session si visible, noms de secrets, `verify_jwt`, CORS, versions, métadonnées et catégories/compteurs de logs. | Utilisateurs, sessions, jetons, liens magiques, secrets, payloads et messages de logs bruts. |
| Vercel | Membre lecture seule du projet et des déploiements autorisés. | Routes/réécritures, protection, métadonnées de déploiement, commit/source, noms et portée des variables, statut des crons/logs redigés. | Valeurs de variables, logs bruts contenant données ou en-têtes, domaines internes non nécessaires, jetons. |
| GitHub | Lecture seule du dépôt et de la provenance des commits/déploiements. | Hashes, branches, tags, CI, artefacts de configuration versionnés. | Secrets CI, variables protégées et tokens. |
| Ordonnanceur de cron, si distinct | Lecture seule limitée aux jobs EGIA autorisés, seulement si cet accès est effectivement disponible. | Nom, cible, méthode, planification, statut et mécanisme de protection déclaré. | URL contenant un secret, en-têtes, valeurs de secrets, historique de payload. |

## Tests autorisés et interdits

| Catégorie | Autorisé | Interdit |
| --- | --- | --- |
| Métadonnées Supabase | Requêtes de catalogue et interfaces lecture seule qui ne changent ni schéma, ni données, ni statistiques persistantes. | Toute commande DDL, DCL, DML, `EXPLAIN ANALYZE`, tâche de maintenance ou requête à effet de verrouillage non confirmée. |
| RLS et inter-tenant | Revue passive des métadonnées RLS, grants, fonctions et chemins d’accès ; consigner la limite VAL-04. | Tout accès aux données réelles, test avec compte/tenant, énumération d’IDs, balayage, `INSERT`/`UPDATE`/`DELETE`, création de tenants ou d’utilisateurs. |
| Routes/Edge Functions | Lecture de configuration et de métadonnées de déploiement autorisées, sans invoquer les routes/fonctions. | Tout appel HTTP direct vers un endpoint de production, y compris `GET`/`HEAD`/`OPTIONS`, ainsi que tout appel pouvant avoir un effet. |
| Auth et privilèges | Revue passive de la configuration et des barrières déclarées. | Création de compte, reset, changement de rôle, modification de claims, contournement de MFA, test de mots de passe, récupération de session ou test HTTP actif. |
| Logs et secrets | Vérifier les politiques de redaction, catégories, rétention et occurrences par signature autorisée ; noter seulement présence/absence et nombre. | Export, téléchargement ou affichage de lignes brutes ; recherche ou exposition de valeurs sensibles. |

## Dépendances

| Dépendance | État | Effet si absente |
| --- | --- | --- |
| Décision du fondateur : environnement inclus = production | satisfaite | Le périmètre distant est déterminé. |
| Décision du fondateur : accès lecture seule GitHub, Supabase et Vercel sans révélation de secrets | satisfaite | Les accès autorisés et leur limite sont déterminés ; leur mécanisme est utilisé seulement après `Ready`. |
| Ordonnanceur externe en lecture seule | conditionnelle, non bloquante | S’il n’est pas effectivement accessible en lecture seule, le rapport le note comme limite de vérification. |
| Deux comptes et deux tenants de test non sensibles | absente, non bloquante pour l’audit passif | VAL-04/EV-04 sont obligatoirement `non concluant — limite de vérification`; aucun substitut sur données réelles. |
| Appels HTTP actifs vers endpoints de production | explicitement interdits au premier Run | Les validations HTTP actives sont exclues ; la revue reste passive. |
| Méthode de collecte d’Evidence redigées et emplacement du rapport `audits/GOAL-002-production-security-validation.md` | satisfaite | Le Run autorisé produit le rapport sans valeur secrète ni donnée sensible. |
| Revue indépendante Work et autorité de verdict du fondateur | requise pour `Done`, non bloquante pour l’audit | Le Run a été arrêté par le P0 et le Goal reste `Blocked` ; aucune soumission à `Review` n’a eu lieu. |

## Décisions fondatrices requises avant `Draft → Ready`

1. **Décidé :** environnement inclus : production.
2. **Décidé :** accès GitHub, Supabase et Vercel lecture seule, uniquement via des mécanismes qui ne révèlent aucune valeur secrète ; ordonnanceur externe seulement s’il est effectivement accessible en lecture seule.
3. **Décidé :** aucun appel HTTP actif vers les endpoints de production et aucun test inter-tenant actif pendant le premier Run ; aucun compte/tenant de test n’est disponible.
4. **Décidé :** secrets limités au nom, à la présence et à la portée ; leurs valeurs sont toujours interdites.
5. **Décidé :** rapport attendu : `audits/GOAL-002-production-security-validation.md`.
6. **Décidé :** branche documentaire autorisée après passage à `Ready` ; commit, push et PR soumis à autorisation après revue.
7. **Décidé :** Work réalise la revue indépendante ; le Fondateur (Melvyn) rend le verdict final.

## Critères d’acceptation

| ID | Critère observable | Validation associée | Evidence attendue |
| --- | --- | --- | --- |
| AC-01 | Pour chaque environnement autorisé, les migrations appliquées et les écarts avec le répertoire `supabase/migrations/` sont établis ou explicitement limités. | VAL-01 | EV-01 |
| AC-02 | Les tables/vues applicatives, RLS, policies actives, grants et tables sans RLS sont inventoriés ; chaque exposition non justifiée est classée. | VAL-02 | EV-02 |
| AC-03 | Les fonctions `SECURITY DEFINER`, propriétaires, `search_path`, droits d’exécution et chemins d’appel accessibles sont contrôlés ; les privilèges excessifs sont classés. | VAL-03 | EV-03 |
| AC-04 | L’isolation inter-tenant reste une exigence critique ; faute de comptes/tenants de test autorisés, le premier Run la qualifie `non concluant — limite de vérification` à partir de sa revue passive, sans accéder à des données réelles. | VAL-04 | EV-04 |
| AC-05 | La séparation `anon` / `authenticated` / `service_role`, les usages de service role et la configuration Auth déployée sont établis sans lecture de secrets ni de données utilisateurs. | VAL-05 | EV-05 |
| AC-06 | L’inventaire déployé des Edge Functions, leurs paramètres `verify_jwt`, leurs contrôles applicatifs, CORS et les fonctions à risque sont comparés au code versionné. | VAL-06 | EV-06 |
| AC-07 | Les routes Vercel publiques et protégées, les réécritures, la protection des crons et les endpoints pouvant élever les privilèges sont vérifiés ou limités explicitement. | VAL-07 | EV-07 |
| AC-08 | La présence des secrets par nom, leur portée et les protections de redaction des logs sont vérifiées sans jamais exposer leurs valeurs ou des données sensibles. | VAL-08 | EV-08 |
| AC-09 | Les différences entre code versionné, migrations attendues et configuration/déploiement distant sont enregistrées comme faits, risques ou limites, sans correction. | VAL-09 | EV-09 |
| AC-10 | Le rapport final produit les faits confirmés, risques, limites, P0/P1/P2, la matrice complète et un verdict unique selon les règles définies. | VAL-10 | EV-10 |
| AC-11 | Aucun accès du Goal n’a modifié une donnée, une configuration, un secret, une identité, un environnement ou le produit ; le premier Run n’a effectué aucun appel endpoint ni test inter-tenant actif. | VAL-11 | EV-11 |

## Validations

| ID | Procédure | Résultat attendu | Responsable |
| --- | --- | --- | --- |
| VAL-01 | Lire l’historique distant des migrations et le comparer aux noms/hashes versionnés ; ne pas appliquer ni réparer. | État par migration : appliquée, absente, divergente ou non vérifiable. | Codex |
| VAL-02 | Lire les catalogues/policies/grants des objets applicatifs, puis comparer aux migrations ; détecter RLS désactivée/absente. | Inventaire redigé par objet et exposition justifiée, risquée ou non vérifiable. | Codex |
| VAL-03 | Lire les définitions et privilèges des fonctions `SECURITY DEFINER` sans exécuter les fonctions. | Chaque fonction est classée avec propriétaire, `search_path`, rôle exécuteur et risque. | Codex, revue Work |
| VAL-04 | Ne pas exécuter de contrôle inter-tenant actif pendant le premier Run : relire passivement policies, grants, fonctions et chemins d’accès, puis consigner l’absence de comptes/tenants de test. | `non concluant — limite de vérification` ; aucun accès à des données réelles ni test endpoint n’est tenté. | Codex, revue Work |
| VAL-05 | Lire l’usage versionné/déployé du service role et la configuration Auth autorisée, sans session de test ni appel endpoint. | Aucune voie non justifiée de privilège élevé ; les limites Auth sont explicites. | Codex |
| VAL-06 | Lire l’inventaire/paramètres Edge distants et comparer fichiers `config.toml`/code, sans invoquer de fonction ou endpoint. | Chaque fonction `verify_jwt = false` ou CORS permissif a un contrôle compensatoire confirmé, un risque ou une limite. | Codex, revue Work |
| VAL-07 | Lire Vercel/routage/cron sans appel endpoint ni déclenchement, puis examiner méthode déclarée, authentification et exposition configurée. | Routes publiques, protégées, cron et voies d’élévation sont classées ou limitées explicitement. | Codex |
| VAL-08 | Lire les noms/portées de secrets et métadonnées de redaction/rétention ; effectuer une recherche de signatures seulement sur sorties masquées autorisées. | Aucune valeur sensible n’est visible ; toute redaction absente ou log exposant est classé. | Codex |
| VAL-09 | Relier chaque élément distant à son commit, migration ou fichier source ; qualifier tout écart. | Tableau déployé/versionné, daté, sans extrapolation. | Codex |
| VAL-10 | Revoir le rapport, la priorisation, les limites et la matrice complète. | Verdict unique et reproductible ; futurs Goals proposés, non créés. | Work, puis fondateur |
| VAL-11 | Vérifier journal d’actions, accès utilisés, état Git avant/après chaque Run et absence d’opération mutante ou d’appel endpoint. | Preuve de non-mutation, sans appel endpoint ni test inter-tenant actif au premier Run. | Codex, puis fondateur |

## Evidence attendues

| ID | Evidence à produire ou référencer | Critère couvert |
| --- | --- | --- |
| EV-01 | Tableau redigé des migrations par environnement, avec date, source et écart versionné. | AC-01 |
| EV-02 | Inventaire redigé tables/vues → RLS/policy/grant, incluant les absences et justifications. | AC-02 |
| EV-03 | Registre redigé des fonctions `SECURITY DEFINER` et de leurs privilèges/configurations pertinentes. | AC-03 |
| EV-04 | Registre de limite : absence de comptes/tenants de test, revue passive effectuée, résultat `non concluant — limite de vérification`, et confirmation qu’aucune donnée réelle n’a été accédée. | AC-04 |
| EV-05 | Matrice des rôles, usages de service role, Auth et barrières de routes, sans jeton ni identité. | AC-05 |
| EV-06 | Inventaire Edge Functions → version/configuration déployée → `verify_jwt` → CORS → contrôle compensatoire. | AC-06 |
| EV-07 | Inventaire Vercel/cron redigé : route, méthode, public/protégé, mécanisme de garde et résultat. | AC-07 |
| EV-08 | Inventaire de secrets par nom/portée et contrôle de redaction/rétention par statut ou compteur. | AC-08 |
| EV-09 | Tableau des écarts code/migrations/configuration/déploiement, daté et sourcé. | AC-09 |
| EV-10 | Rapport `audits/GOAL-002-production-security-validation.md` avec faits, risques, limites, P0/P1/P2, matrice et verdict. | AC-10 |
| EV-11 | Journal redigé des accès/actions et état Git avant/après ; déclaration de non-mutation, d’absence d’appel endpoint et d’absence de test inter-tenant actif au premier Run. | AC-11 |

## Règles de verdict et de priorisation

- **P0 :** exposition inter-tenant confirmée, escalade de privilège, accès public/non authentifié à des données sensibles, contournement effectif d’un contrôle critique, secret exposé, ou endpoint à effet accessible sans garde suffisante. Verdict obligatoire : `non sûr` jusqu’à correction vérifiée.
- **P1 :** contrôle critique incomplet ou divergent (RLS, grant, `SECURITY DEFINER`, Auth, `verify_jwt = false`, CORS, cron, service role, route Vercel) sans exploitation confirmée, ou limite empêchant de démontrer sa sûreté. Verdict possible : `sûr sous conditions` uniquement si aucune P0 n’existe, les mesures compensatoires sont confirmées et le fondateur accepte explicitement les conditions ; sinon `non sûr`.
- **P2 :** dette de configuration, documentation, observabilité ou durcissement sans exposition critique démontrée. Elle reste documentée, avec un Goal correctif proposé si nécessaire.
- **`sûr pour usage contrôlé` :** impossible tant que VAL-04 est `non concluant — limite de vérification`. Il exige aussi tous les autres contrôles critiques concluants, aucune P0/P1 ouverte et l’acceptation de Work puis du fondateur.
- **`sûr sous conditions` :** possible uniquement si aucune P0 n’est trouvée, si tous les autres contrôles critiques sont concluants, si la limite VAL-04 et les risques P1/P2 résiduels sont précisément bornés avec des mesures compensatoires vérifiables, et si le fondateur les accepte explicitement.
- **`non sûr` :** au moins une P0, une élévation/exposition non résolue, ou une absence de preuve matérielle qui interdit le niveau d’usage envisagé. Les futurs Goals correctifs sont alors proposés, sans exécution.

## Responsabilités

| Acteur | Responsabilités | Limites |
| --- | --- | --- |
| Fondateur | A décidé l’environnement de production, les accès lecture seule et les interdits du premier Run ; il accorde/révoque les accès, accepte les risques et rend le verdict final. | Ne délègue pas implicitement une exception de sécurité, un accès secret, une mutation, un test inter-tenant actif ou un verdict de production. |
| Work | Vérifie que le contrat, la matrice, les priorités, les limites et le verdict proposé sont cohérents ; réalise la revue indépendante R2 et prépare les décisions/correctifs. | Ne crée pas de correctif, ne modifie pas les environnements et ne rend pas seul le verdict réservé au fondateur. |
| Codex | Exécute uniquement les lectures et contrôles explicitement autorisés, protège les données/secret, consigne les Evidence redigées et s’arrête à toute divergence. | Ne lit pas de valeur secrète, ne modifie rien, ne choisit pas l’environnement ou le verdict, et ne contourne pas une limite d’accès. |

## Autorisations Git

- **Modifier les fichiers dans le scope :** après passage à `Ready`, autorisé uniquement pour `goals/active/GOAL-002-production-security-validation.md` et `audits/GOAL-002-production-security-validation.md` ; produit et configuration interdits.
- **Créer une branche :** autorisé après passage à `Ready`, uniquement pour une branche documentaire dédiée à ce Goal.
- **Créer des commits :** interdit, sauf autorisation fondatrice ultérieure après revue Work.
- **Pousser une branche :** interdit, sauf autorisation fondatrice ultérieure après revue Work.
- **Créer une pull request :** interdit, sauf autorisation fondatrice ultérieure après revue Work.
- **Actions explicitement interdites :** modification hors des artefacts d’audit autorisés, réécriture d’historique, force-push, création de Goals correctifs, toute modification de `AGENTS.md` ou de source de vérité sans décision versionnée.

## Autorisations d’environnement

- **Premier Run autorisé :** audit distant passif R2 en production, en lecture seule via GitHub, Supabase et Vercel ; ordonnanceur externe seulement si l’accès lecture seule est effectivement disponible.
- **Appels et tests interdits au premier Run :** aucun appel HTTP direct vers un endpoint de production, aucune invocation Edge Function/route/cron, aucune mutation et aucun test inter-tenant actif.
- **Déploiement, migrations, modifications de configuration, gestion des secrets, création d’identités et exécution de crons :** interdits.
- **Approbateur requis :** Fondateur avant tout accès distant ; Work pour la revue indépendante avant `Done`.
- **Retour arrière :** N/A pour l’audit en lecture seule. Si une action proposée demande un retour arrière, elle est hors-scope et doit devenir un Goal correctif distinct.

## Conditions d’arrêt

- Environnement, accès, endpoint, compte de test, secret ou méthode non explicitement autorisé.
- Nécessité de voir une valeur secrète, un jeton, une identité, une donnée utilisateur, un log brut ou toute information interdite pour poursuivre.
- Test possiblement mutant, endpoint ambigu, effet externe potentiel, création d’un log/d’une trace durable non approuvée, ou absence de garantie d’innocuité d’une requête.
- Suspicion ou confirmation de P0 : stopper les tests d’exploitation, préserver uniquement l’Evidence minimale redigée, alerter immédiatement le fondateur et attendre ses instructions.
- Contradiction entre code, configuration déployée, source de vérité ou décisions fondatrices ; ne pas arbitrer ni corriger seul.
- Écart qui exige une modification de produit, d’architecture, de politique, de configuration, de données, de secret ou de déploiement.
- Validation impossible, Evidence insuffisante, ou risque réel supérieur à R2 ; retourner Work/fondateur pour recadrage.

## Définition de Done

Le Goal est `Done` seulement lorsque :

- les décisions fondatrices consignées ont été appliquées et le Readiness Check a été validé avant tout accès distant ;
- les critères AC-01 à AC-11 sont satisfaits, ou les limites sont explicitement évaluées selon les règles de verdict sans masquer un risque ;
- les validations VAL-01 à VAL-11 ont des résultats traçables et les Evidence EV-01 à EV-11 sont disponibles, redigées et examinées ;
- aucun secret, donnée sensible, valeur de configuration ou identifiant réel n’est exposé dans les Artifacts ;
- aucun environnement, donnée, identité, secret, configuration ou produit n’a été modifié, et le premier Run est démontré sans appel endpoint ni test inter-tenant actif ;
- le rapport de sécurité contient les faits confirmés, risques, limites, P0/P1/P2, matrice et futurs Goals correctifs proposés sans les créer ;
- Work a rendu une revue indépendante `accepté` et le fondateur a choisi/accepté un unique verdict ;
- les autorisations Git et d’environnement ont été respectées, les risques résiduels sont déclarés, puis la date de clôture et la décision sont consignées.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-11` | N/A → `Draft` | Codex | Création puis révision du contrat ; aucun Run, audit, accès distant, lecture de secret ou modification d’environnement n’est lancé. |
| `2026-07-11` | `Draft` → `Ready` | Fondateur (Melvyn) | Readiness Check validé ; audit distant passif R2 autorisable dans un Run ultérieur. |
| `2026-07-11` | `Ready` → `Running` | Fondateur (Melvyn) | Run 1 d’audit distant passif R2 autorisé. |
| `2026-07-11` | `Running` → `Blocked` | Work | P0 confirmé sur une fonction SECURITY DEFINER publiquement exécutable ; Run arrêté conformément aux conditions d’arrêt. |
| `2026-07-13` | `Blocked` → `Running` | Fondateur (Melvyn) | GOAL-003 et GOAL-005 terminés ; Run 2 local correctif, tests d’abus, branche/commits/push/PR autorisés, sans accès ni mutation distante. |

## Readiness Check

| Point 003 | État | Evidence / commentaire |
| --- | --- | --- |
| Identité, valeur business et résultat observable | oui | Métadonnées, valeur business et résultat attendu sont définis. |
| Sources accessibles, cohérentes et suffisantes | oui | Sources versionnées identifiées ; production et mécanismes lecture seule GitHub/Supabase/Vercel autorisés, sans accès distant avant le lancement d’un Run. |
| Scope, hors-scope et décisions nécessaires | oui | Production, accès, secrets, rapport, Git, revue et interdits du premier Run sont décidés. |
| Dépendances | oui | L’ordonnanceur est conditionnel et non bloquant ; l’absence de comptes/tenants borne uniquement VAL-04 comme limite de vérification. |
| Risque, gates et autorisations | oui | R2, audit passif, branche documentaire après `Ready`, revue Work et verdict Fondateur sont définis. |
| Critères, validations et Evidence | oui | AC-01 à AC-11, VAL-01 à VAL-11 et EV-01 à EV-11 sont reliés. |
| Conditions d’arrêt et Done | oui | Conditions et autorités de revue/clôture explicites. |

**Résultat : Readiness Check du Run 2 validé par l’avenant fondateur.** Le Run local peut corriger et vérifier le candidat ; la production distante reste hors accès et empêche `Done` jusqu’à autorisation, déploiement et vérification.

## Livraison et clôture

- **Artifacts livrés :** Evidence historique Run 1 `audits/GOAL-002-production-security-validation.md`; rapport du candidat Run 2 `docs/PRODUCTION_SECURITY_VALIDATION.md`; migration restrictive ; 14 contrôles statiques/HTTP locaux ; test SQL d’abus et d’invariants catalogue rejoué depuis une base isolée neuve.
- **Matrice réelle critère → validation → Evidence :** AC-01 à AC-11 sont reliés explicitement à VAL-01 à VAL-11 et EV-01 à EV-11 dans `docs/PRODUCTION_SECURITY_VALIDATION.md`; état déployé, Auth distante et tests synthétiques en production restent non conclus.
- **Correctifs approfondis :** commit `8044d85` — policy `cron_state` inter-tenant supprimée, mutation de brouillon `service_role` liée au propriétaire, état OAuth Edge consommé atomiquement, déclarations JWT racine complétées et payloads bornés.
- **Risques résiduels :** le candidat n’est pas déployé ; la migration/grants, les Edge Functions, Vercel, Auth, variables et logs de production ne sont pas vérifiés. Le P0 historique ne peut donc pas être fermé en production. L’inscription fidélité publique ne vérifie pas encore la possession de l’e-mail, sans divulguer désormais les capacités existantes.
- **Verdict provisoire obligatoire :** candidat local prêt pour revue ; production `non sûr` jusqu’au déploiement et à la vérification autorisés.
- **Décision de clôture :** Goal `Running`; date de clôture : `N/A`. Ne pas passer `Done` sans Evidence distante et revue indépendante.
