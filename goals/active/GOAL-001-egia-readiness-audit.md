# GOAL-001 — L'état réel de préparation d'EGIA est établi

## Métadonnées

- **ID :** `GOAL-001`
- **Statut :** `Done`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-11`
- **Date de clôture :** `2026-07-11`
- **Niveau de risque :** `R1` — audit strictement en lecture seule du dépôt et, seulement si un accès déjà autorisé est disponible, de métadonnées externes non mutantes. Les seuls artefacts durables permis sont le rapport d'audit et ses Evidence documentaires ; aucune correction produit n'est autorisée. Revue indépendante non requise par défaut selon ANES 002, mais le fondateur décide du passage à `Ready`, de la revue du rapport et de tout Goal correctif.

## Valeur business

Le fondateur dispose d'un rapport vérifiable de l'état réel d'EGIA avant d'investir dans des corrections ou de considérer l'application suffisamment fiable pour un usage quotidien. Les faits, risques, limites d'accès et priorités de correction sont distingués afin d'éviter qu'une hypothèse ou une documentation obsolète ne devienne une décision produit.

## Résultat attendu

Un rapport d'audit versionnable établit, à partir d'Evidence vérifiables, l'état réel observable d'EGIA : composants inspectés, cohérence documentation/code/configuration, constats, risques, hypothèses et limites de vérification. Il classe les risques P0/P1/P2, propose une liste ordonnée de futurs Goals correctifs sans les créer, et conclut par l'un des verdicts `prêt`, `prêt sous conditions` ou `non prêt` pour un usage quotidien fiable.

## Contexte

`PROJECT-CONTEXT.md` a été créé comme contexte durable initial. Le dépôt contient une application React/Vite, des routes Vercel, des handlers partagés, Supabase (migrations, configuration et Edge Functions), une CI GitHub Actions et des intégrations Google, OpenAI, Resend et Apple Wallet observables dans le code.

Le Readiness Check a été validé par le fondateur. Le Run 1 a été exécuté et son rapport est disponible dans `audits/GOAL-001-egia-readiness-audit.md`. Le Goal a été soumis à la revue fondatrice, désormais achevée ; le rapport n'est pas une correction et aucun Goal correctif n'est créé pendant ce Goal.

## Sources de vérité

| Source | Portée / règle applicable |
| --- | --- |
| `PROJECT-CONTEXT.md` | Contexte durable, faits observés, limites et contradictions initiales. |
| `README.md`, `docs/`, `package.json`, `vercel.json`, `.github/workflows/ci.yml` | Documentation, commandes, configuration de build/routage et CI à confronter au code. |
| `src/`, `api/`, `server/_shared/`, `server/_shared_dist/` | Frontend, routes, handlers et sortie générée effectivement présente. Les sources éditables priment sur la sortie générée. |
| `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, `src/database.types.ts` | État Supabase/Edge attendu dans le dépôt ; ne prouve pas l'état distant. |
| `.gitignore`, état Git, branches, tags, remote et historique Git | Structure, hygiène et reproductibilité du dépôt. |
| `/Users/melvyn/Desktop/ANES/anes/docs/000-blueprint.md` | Invariants d'ANES, Evidence et gouvernance par contrats. |
| `/Users/melvyn/Desktop/ANES/anes/docs/001-founder-edition.md` | Rôles fondateur, Work et Codex. |
| `/Users/melvyn/Desktop/ANES/anes/docs/002-operating-model.md` | Routage, risque, format d'audit et gates. |
| `/Users/melvyn/Desktop/ANES/anes/docs/003-goal-standard.md` | Contrat, Readiness Check, Evidence et états du Goal. |
| `/Users/melvyn/Desktop/ANES/anes/docs/004-governance-and-learning.md` | Autorité des sources et traitement des contradictions. |

Une console Supabase, Vercel, GitHub, Google, OpenAI, Resend, cron-job.org ou un gestionnaire de secrets n'est pas une source présumée accessible. Si une vérification nécessite l'une de ces sources, l'accès en lecture seule, sa portée et son résultat doivent être consignés ; son absence produit une limite ou un blocage, jamais une supposition.

## Scope

- Inspecter en lecture seule le dépôt, son état Git et les sources de vérité listées.
- Examiner la cohérence de la documentation, du code, de la configuration, des scripts et des artefacts générés présents.
- Examiner, sans les appliquer, les migrations, fonctions RPC visibles, politiques RLS, Edge Functions, routes API, mécanismes d'authentification/autorisation, variables d'environnement par nom, intégrations, cron, traitements asynchrones, logs et gestion d'erreurs.
- Exécuter uniquement les validations locales explicitement identifiées comme non mutantes pour les données et environnements ; relever les validations non exécutables et leur raison.
- Produire un rapport d’audit versionnable et ses références d’Evidence dans le dépôt. Le Run 1 a produit ce rapport dans `audits/GOAL-001-egia-readiness-audit.md`.

## Hors-scope

- Corriger, refactorer, formater ou modifier le produit, le code, les migrations, la base de données, les politiques RLS, Supabase, les secrets, l'infrastructure ou les intégrations.
- Déployer, appliquer une migration, appeler un endpoint ayant un effet, déclencher un cron, créer des données de test, supprimer des données ou modifier un environnement distant.
- Créer un Goal correctif, une branche, un commit, un push ou une pull request avant les autorisations correspondantes.
- Consulter, afficher ou copier la valeur d'un secret, d'un jeton, d'un mot de passe, d'une clé privée ou de données personnelles non nécessaires au constat.
- Décider que le produit est prêt sans les Evidence requises et sans la revue du fondateur applicable.

## Contraintes

- Toute constatation doit être étiquetée **fait confirmé**, **risque**, **hypothèse** ou **limite de vérification**, et référencer une Evidence localisable.
- Une information non confirmable depuis le dépôt ou une source accessible est notée `À confirmer` ; elle n'est jamais formulée comme un fait.
- Les contrôles de build, lint, typecheck et tests sont inventoriés avant exécution. Aucun contrôle susceptible de modifier des données, des environnements ou des secrets ne peut être exécuté.
- Le rapport couvre au minimum les domaines de ce Goal et conserve une matrice `critère → validation → Evidence` complétée avec les résultats réels.
- Aucun secret ou donnée sensible n'est inclus dans les logs, captures, commandes rapportées ou Evidence.
- Toute élévation de risque au-delà de `R1` suspend le Run concerné et impose recadrage du Goal.

## Dépendances

| Dépendance | État | Effet si absente |
| --- | --- | --- |
| Dépôt local et sources versionnées accessibles | prête | L'audit local ne peut pas commencer. |
| Validation du Readiness Check par le fondateur / Work | satisfaite | Run 1 exécuté ; rapport revu et accepté par le fondateur avec le verdict non prêt. |
| Accès lecture seule autorisé aux services distants, si nécessaire | À confirmer | Le rapport borne ses conclusions au dépôt et consigne la limitation. |
| Secrets nécessaires à une vérification distante | non requis par défaut | Ne pas les demander ni les utiliser ; constater la limite si la vérification est essentielle. |

## Critères d'acceptation

| ID | Critère observable | Validation associée | Evidence attendue |
| --- | --- | --- | --- |
| AC-01 | Le rapport inventorie les composants inspectés, y compris Git, documentation, code/configuration, Supabase, Edge Functions, cron, intégrations et déploiement. | VAL-01 | EV-01 |
| AC-02 | Le rapport contient une matrice complète `critère → validation → Evidence` couvrant au minimum tous les domaines obligatoires de ce Goal. | VAL-02 | EV-02 |
| AC-03 | Chaque conclusion est séparée entre fait confirmé, risque, hypothèse et limite de vérification ; chaque fait est traçable à une Evidence. | VAL-03 | EV-03 |
| AC-04 | Les risques empêchant un usage quotidien fiable sont classés P0, P1 ou P2, et les futurs Goals correctifs sont ordonnés sans être créés ni exécutés. | VAL-04 | EV-04 |
| AC-05 | Le rapport donne un verdict unique `prêt`, `prêt sous conditions` ou `non prêt`, avec justification, risques résiduels et périmètre de preuve. | VAL-05 | EV-05 |
| AC-06 | L'audit et ses Evidence respectent les limites R1 : aucune modification produit/données/Supabase/infrastructure, aucun déploiement, aucune création de branche/commit/push/PR sans autorisation ultérieure. | VAL-06 | EV-06 |

## Validations

| ID | Procédure ou commande | Résultat attendu | Responsable |
| --- | --- | --- | --- |
| VAL-01 | Parcours en lecture seule de l'arborescence, de Git, des entrées frontend/API, migrations, fonctions, scripts et configurations ; comparaison au rapport. | Chaque composant obligatoire est soit inventorié avec son chemin, soit marqué `À confirmer` avec la raison. | Codex |
| VAL-02 | Revue de complétude de la matrice du rapport contre les domaines obligatoires : cohérence docs/code/config, Git, qualité, commandes, auth, Supabase/RLS, secrets, Edge Functions, cron, intégrations, erreurs/observabilité, sécurité, déploiement et flux incomplets. | Aucun domaine obligatoire n'est absent ; toute non-vérification est explicitement qualifiée. | Codex, puis Work/fondateur |
| VAL-03 | Contrôle de traçabilité : échantillonner chaque fait et suivre son chemin/commande/log ; vérifier que les hypothèses et limites ne sont pas écrites comme des faits. | Chaque fait échantillonné est supporté ; aucune conclusion non prouvée n'est présentée comme confirmée. | Codex |
| VAL-04 | Revue des constats, critères P0/P1/P2 et dépendances entre corrections proposées. | Priorités, impact et Evidence sont explicites ; aucun Goal correctif n'est créé. | Work/fondateur |
| VAL-05 | Revue finale du rapport et de son périmètre de preuve par le fondateur. | Un seul verdict est retenu, sans masquer les limites ni les risques résiduels. | Fondateur |
| VAL-06 | Comparaison de l'état Git initial/final, journal des actions et vérification qu'aucun appel à effet ni déploiement n'a été exécuté. | Seuls les artefacts explicitement autorisés sont présents ; aucune action interdite n'est constatée. | Codex, puis fondateur |

## Evidence attendues

| ID | Evidence à produire ou référencer | Critère couvert |
| --- | --- | --- |
| EV-01 | Inventaire daté des chemins, configurations, commandes et systèmes inspectés dans le rapport. | AC-01 |
| EV-02 | Matrice réelle `AC → VAL → EV`, complétée avec les résultats, commandes et limitations. | AC-02 |
| EV-03 | Références de chemins, hashes Git, sorties de commandes non sensibles et captures de métadonnées autorisées, liées aux constats. | AC-03 |
| EV-04 | Registre des constats avec gravité P0/P1/P2 et proposition ordonnée de futurs Goals, sans fichier Goal créé. | AC-04 |
| EV-05 | Section de recommandation finale, périmètre audité et risques résiduels, avec verdict du fondateur. | AC-05 |
| EV-06 | État Git initial/final, journal des opérations et déclaration des actions interdites non exécutées. | AC-06 |

## Autorisations Git

- **Modifier les fichiers dans le scope :** interdit pour le produit ; autorisé uniquement pour le rapport d'audit versionnable et ses Evidence documentaires lors d'un Run ultérieur autorisé.
- **Créer une branche :** autorisé, uniquement pour porter le rapport lors d'un Run ultérieur confirmé par le fondateur.
- **Créer des commits :** soumis à autorisation ultérieure explicite du fondateur.
- **Pousser une branche :** soumis à autorisation ultérieure explicite du fondateur.
- **Créer une pull request :** soumis à autorisation ultérieure explicite du fondateur.
- **Actions explicitement interdites :** modification du produit, de la base ou de Supabase ; réécriture d'historique ; force-push ; création de Goals correctifs ; modification de `AGENTS.md` sans décision versionnée du fondateur.

## Autorisations de déploiement

- **Déploiement autorisé :** aucun.
- **Approbateur requis :** N/A — aucun déploiement n'est dans le scope.
- **Préconditions :** N/A — justification : toute interaction d'environnement est hors-scope, y compris les migrations, crons et endpoints à effet.
- **Retour arrière :** N/A — justification : aucun déploiement ou changement d'environnement autorisé.

## Conditions d'arrêt

- Décision produit, métier, sécurité, UX ou architecture nécessaire pour interpréter un constat ou décider de sa correction.
- Accès manquant à une source essentielle pour une conclusion demandée ; consigner la limitation et retourner Work/fondateur.
- Contradiction entre sources de vérité, notamment sur une règle active, une fréquence cron, un environnement ou une politique de sécurité ; ne pas arbitrer seul.
- Besoin d'exécuter une opération modifiant des données, des fichiers produit, un environnement, une migration, un cron ou une intégration externe.
- Secret requis mais indisponible, ou nécessité de consulter/révéler une valeur secrète pour progresser.
- Risque réel supérieur à `R1`, validation non fiable, ou action sensible non explicitement autorisée.

## Définition de Done

Le Goal est `Done` seulement lorsque :

- les critères AC-01 à AC-06 sont satisfaits ;
- les validations VAL-01 à VAL-06 sont concluantes ou une limite explicitement acceptée est consignée par l'autorité compétente ;
- les Evidence EV-01 à EV-06 sont disponibles, traçables et examinées ;
- le rapport d'audit est créé dans le dépôt conformément aux autorisations Git alors applicables, sans modification du produit ;
- la matrice réelle critère → validation → Evidence, les faits, risques, hypothèses, limites, P0/P1/P2, futurs Goals proposés et le verdict sont remis ;
- le fondateur a examiné la recommandation finale et rendu le verdict de revue applicable ;
- l'état Git et les actions interdites ont été vérifiés, les risques résiduels déclarés, puis la date de clôture et la décision sont consignées.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-11` | N/A → `Draft` | Codex | Création du contrat initial ; aucun audit n'est lancé. |
| `2026-07-11` | `Draft` → `Ready` | Fondateur (Melvyn) | Readiness Check validé ; contrat autorisé pour exécution ultérieure. |
| `2026-07-11` | `Ready` → `Running` | Codex | Run d’audit en lecture seule autorisé par le fondateur. |
| `2026-07-11` | `Running` → `Review` | Codex | Rapport d’audit produit ; soumis à la revue du fondateur. |
| `2026-07-11` | `Review` → `Done` | Fondateur (Melvyn) | Rapport accepté ; verdict non prêt ; futurs Goals correctifs requis. |

## Readiness Check

| Point 003 | État | Evidence / commentaire |
| --- | --- | --- |
| Identité, valeur business et résultat observable | oui | Métadonnées, valeur business et résultat attendu renseignés. |
| Sources accessibles, cohérentes et suffisantes | oui, pour l'audit de dépôt | Sources locales listées ; les sources distantes sont explicitement conditionnelles et ne sont pas présumées accessibles. |
| Scope, hors-scope et décisions nécessaires | oui | Audit lecture seule borné ; aucune décision produit n'est requise pour constater les limites. |
| Dépendances | oui | La validation formelle est satisfaite ; l'absence d'accès distant est traitée comme limite, pas comme permission d'inférer. |
| Risque, gates et autorisations | oui | R1 justifié ; Git et déploiement explicitement bornés. |
| Critères, validations et Evidence | oui | AC-01 à AC-06, VAL-01 à VAL-06 et EV-01 à EV-06 sont liés. |
| Conditions d'arrêt et Done | oui | Toutes les conditions demandées sont explicites, ainsi que l'autorité de clôture. |

**Résultat : Readiness Check validé par le fondateur ; Run 1 exécuté ; Goal soumis à `Review` pour revue fondatrice, désormais clôturée.**

## Livraison et clôture

- **Artifacts livrés :** `audits/GOAL-001-egia-readiness-audit.md`.
- **Matrice réelle critère → validation → Evidence :** présente dans la section 25 du rapport.
- **Risques résiduels :** état distant non vérifié ; RLS/grants, Edge/Vercel, intégrations, crons et surfaces mockées restant à traiter.
- **Verdict de revue :** `non prêt`, accepté par le fondateur.
- **Décision de clôture :** critères AC-01 à AC-06 acceptés dans le périmètre de preuve local ; limites distantes explicitement acceptées comme limites de vérification.
