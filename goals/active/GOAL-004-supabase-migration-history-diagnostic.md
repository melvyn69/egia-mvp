# GOAL-004 — Établir l’état fiable de l’historique des migrations Supabase

## Métadonnées

- **ID :** `GOAL-004`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-12`
- **Date de clôture :** `N/A`
- **Niveau de risque :** `R2` — diagnostic distant passif de production, limité aux métadonnées de migrations et de catalogue. Aucune mutation, donnée métier ou donnée utilisateur n’est autorisée. Toute correction éventuelle relèvera d’un Goal R3 séparé.

## Valeur business

Rétablir une source de vérité fiable sur l’historique des migrations afin d’éviter une application incorrecte, un historique Supabase incohérent ou une fausse validation de sécurité.

## Résultat attendu

Un rapport versionné, `audits/GOAL-004-supabase-migration-history-diagnostic.md`, établit précisément :

- la correspondance entre toutes les migrations locales et l’historique distant Supabase ;
- chaque version identique portant un nom ou un contenu différent ;
- les migrations présentes uniquement localement ou uniquement à distance ;
- les effets de schéma réellement présents pour les migrations en conflit ;
- la cause probable de la divergence lorsqu’elle peut être établie ;
- la procédure sûre recommandée pour rétablir la cohérence ;
- la décision indiquant si `GOAL-003` peut reprendre sans réparation de l’historique ou si un Goal correctif R3 est nécessaire.

## Contexte

Le préflight passif du Run 3 de `GOAL-003` a trouvé le projet `fhadiwkdznhuxtlgrwfd` (`egia-mvp`, `ACTIVE_HEALTHY`) et a confirmé que la migration corrective `20260712120000_secure_claim_review_analyze_jobs` n’était pas appliquée. Il a aussi révélé que la production associe la version `20260219130000` à `drop_alerts_unique_rule_per_review`, tandis que le dépôt contient `supabase/migrations/20260219130000_ai_jobs_queue.sql`. Le Run 3 a donc été arrêté avant toute DDL.

## Sources de vérité

| Source | Rôle |
| --- | --- |
| `supabase/migrations/` | Inventaire local, versions, noms, chemins et empreintes de contenu. |
| Historique distant Supabase du seul projet `fhadiwkdznhuxtlgrwfd` | Inventaire passif des versions et noms appliqués. |
| Catalogue PostgreSQL distant | Métadonnées des objets liés aux migrations en conflit, sans lecture de tables applicatives. |
| `goals/active/GOAL-003-secure-claim-review-analyze-jobs.md` | Contrat bloqué, Evidence du préflight et condition de reprise. |
| Work et fondateur | Autorisations de Run, revue indépendante et décision de correction éventuelle. |

## Méthode d’inventaire local déterministe

Le Run 1 produira un inventaire à partir de tous les fichiers SQL sous `supabase/migrations/`, triés par chemin relatif avec une collation stable (`LC_ALL=C`). Chaque nom doit satisfaire exactement la règle `^([0-9]{14})_(.+)\.sql$` : le premier groupe est la **version** numérique à 14 chiffres et le second le **nom** de migration. Pour chaque entrée conforme, le rapport conservera :

- version ; nom ; chemin relatif ; taille en octets ;
- SHA-256 des octets exacts du fichier ;
- SHA-256 d’une représentation de diagnostic où seules les séquences de fin de ligne CRLF (`\r\n`) sont normalisées en LF (`\n`). Cette seconde empreinte n’est jamais une preuve d’identité de contenu ; elle sert uniquement à isoler une différence de plateforme.

Les fichiers sont hachés sans les réécrire. L’inventaire est trié d’abord par version numérique puis par chemin, et contient le nombre total de fichiers examinés. L’analyse locale de préparation a trouvé 98 fichiers SQL conformes, aucune version dupliquée, aucun fichier hors format et aucun ordre non chronologique. Trois fichiers sont vides (`20260106115555_google_reviews_add_raw_jsonb.sql`, `20260106120512_google_reviews_location_name_default.sql`, `20260116113628_google_reviews_columns_align.sql`) : ils seront conservés dans l’inventaire et devront être confrontés à l’historique distant avant toute conclusion. Quatre noms sont réutilisés sous des versions différentes (`google_reviews_add_raw_jsonb`, `business_settings_monthly_report_enabled`, `remote_schema`, `review_replies_unified`) : ils seront signalés comme anomalies de nom à comparer, sans être assimilés à une collision de version.

Les anomalies sont traitées ainsi, sans renommer ni modifier de migration :

| Anomalie locale | Traitement requis |
| --- | --- |
| Fichier hors format | Exclure de toute correspondance automatique, lister le chemin et arrêter si son rôle de migration ne peut pas être écarté. |
| Plusieurs fichiers avec la même version | Émettre `LOCAL_DUPLICATE_VERSION` et arrêter la comparaison automatique de cette version. |
| Même nom sous plusieurs versions | Émettre `NAME_REUSED_DIFFERENT_VERSION`; comparer chaque version séparément. |
| Fichier vide | Lister taille et empreintes, puis arrêter si ce fichier est censé représenter une migration appliquée. |
| Version non chronologique | Lister le couple de chemins concerné et arrêter si l’ordre empêche une comparaison déterministe. |

## Comparaison avec l’historique distant

L’historique distant ne sera comparé qu’avec les champs passivement disponibles : version, nom, statut ou présence dans l’historique, et éventuelles métadonnées techniques exposées. Supabase ne doit pas être présumé exposer une empreinte ou le contenu SQL distant. Une égalité version/nom est donc une correspondance **nominale**, jamais une égalité de hash ou de contenu inférée.

| Classification | Règle déterministe |
| --- | --- |
| `MATCH_VERSION_NAME` | Une version existe localement et à distance avec le même nom ; correspondance nominale uniquement. |
| `VERSION_COLLISION` | La même version existe des deux côtés avec des noms différents ; collision certaine. |
| `LOCAL_ONLY` | Version présente localement, absente de l’historique distant complet. |
| `REMOTE_ONLY` | Version présente à distance, absente de l’inventaire local complet. |
| `LOCAL_DUPLICATE_VERSION` | Plusieurs fichiers locaux portent la même version, quelle que soit la présence distante. |
| `NAME_REUSED_DIFFERENT_VERSION` | Un même nom local apparaît sous plusieurs versions. |
| `REMOTE_METADATA_INSUFFICIENT` | Les champs distants requis, la pagination ou le statut de complétude ne permettent pas de classifier une version de manière fiable. |
| `CATALOG_EFFECT_AMBIGUOUS` | Le catalogue confirme ou infirme des objets, sans permettre de les attribuer avec certitude à une migration. |

Pour une même version, même nom signifie `MATCH_VERSION_NAME` et non contenu identique. Des noms différents signifient `VERSION_COLLISION`. Si le contenu distant n’est pas exposé, aucune égalité de hash n’est inventée. Les classifications doivent être calculées après vérification que l’historique distant est complet; sinon le Run s’arrête avec `REMOTE_METADATA_INSUFFICIENT`.

## Analyse des effets de schéma par catalogue

La collision `20260219130000` sera étudiée sans lire aucune table applicative. Pour `20260219130000_ai_jobs_queue.sql`, l’inventaire local identifiera table éventuelle, colonnes, contraintes, index, policies RLS, grants, fonctions et triggers attendus. Le Run 1 vérifiera seulement leur présence ou leurs propriétés via les métadonnées de catalogue nécessaires (`pg_catalog`, `information_schema` et vues système Supabase), sans requête sur des lignes applicatives.

Pour la migration distante nommée `20260219130000_drop_alerts_unique_rule_per_review`, le Run 1 recherchera les objets qui correspondent à ce nom et aux métadonnées passivement exposées. Son SQL exact ne sera pas supposé accessible : l’absence de définition implique une limite, non une reconstruction hypothétique.

Toute attribution migration → objet est explicitement qualifiée : **confirmée**, **probable**, **ambiguë** ou **non déterminable**. La présence d’un objet ne suffit jamais à établir quelle migration l’a créé. Sont interdits : lignes de table, payload, identité, donnée utilisateur, invocation de fonction et toute mutation.

## Evidence redigées

Le rapport peut contenir le projet par ID et nom, versions et noms de migrations, chemins locaux, empreintes locales, nombres de migrations, classifications de divergence, noms d’objets de schéma, définitions techniques strictement nécessaires de contraintes/grants/policies/fonctions après redaction, commandes ou requêtes de catalogue et résultats agrégés.

Le rapport ne doit jamais contenir de secret, jeton, valeur d’environnement, payload métier, contenu utilisateur, ligne de table applicative, email, identité ou identifiant personnel, export brut de logs, ni valeur sensible issue de Storage ou Auth.

## Scope

- Inventorier tous les fichiers de `supabase/migrations/` et extraire version, nom, chemin et empreinte de contenu.
- Lire passivement l’historique distant des migrations et comparer l’ensemble local/distant version par version.
- Identifier exhaustivement collisions, absences et divergences.
- Examiner spécifiquement `20260219130000_ai_jobs_queue.sql` localement et `20260219130000_drop_alerts_unique_rule_per_review` à distance.
- Rechercher dans les métadonnées de catalogue uniquement les effets de schéma de ces deux migrations, et toute application sous une autre version.
- Déterminer si la migration GOAL-003 peut être appliquée avec sa version actuelle sans masquer la divergence historique.
- Comparer, sans rien exécuter, les options : aucune réparation, nouvelle migration corrective, renommage local prospectif, baselining, ou réparation contrôlée de l’historique Supabase.
- Produire le rapport attendu et le faire revoir indépendamment par Work.

## Hors-scope

- Appliquer une migration, du DDL, DML ou DCL.
- Modifier `supabase_migrations.schema_migrations`, utiliser `supabase migration repair`, ou marquer une migration comme appliquée ou reverted.
- Renommer ou modifier une migration existante, créer une migration corrective, ou appliquer GOAL-003.
- Invoquer une RPC, Edge Function, route ou cron.
- Lire des lignes de tables applicatives, des secrets ou des données utilisateur.
- Corriger la divergence dans ce Goal.

## Critères d’acceptation, validations et Evidence

| ID | Critère observable | Validation | Evidence |
| --- | --- | --- | --- |
| AC-01 | Inventaire exhaustif local. | VAL-01 | EV-01 |
| AC-02 | Inventaire exhaustif distant. | VAL-02 | EV-02 |
| AC-03 | Comparaison version par version. | VAL-03 | EV-03 |
| AC-04 | Collisions exhaustivement listées. | VAL-04 | EV-04 |
| AC-05 | Migrations uniquement locales et uniquement distantes listées. | VAL-05 | EV-05 |
| AC-06 | État réel des objets liés à la collision établi par catalogue. | VAL-06 | EV-06 |
| AC-07 | Applications éventuelles sous une autre version recherchées. | VAL-07 | EV-07 |
| AC-08 | Impact sur GOAL-003 déterminé. | VAL-08 | EV-08 |
| AC-09 | Options de résolution comparées sans exécution. | VAL-09 | EV-09 |
| AC-10 | Recommandation unique ou limite explicitement non déterminable. | VAL-10 | EV-10 |
| AC-11 | Rapport revu indépendamment par Work. | VAL-11 | EV-11 |
| AC-12 | Absence totale de mutation distante. | VAL-12 | EV-12 |

| ID | Procédure | Résultat attendu |
| --- | --- | --- |
| VAL-01 | Scanner les noms et hacher localement chaque fichier de migration. | Version, nom, chemin et empreinte complets. |
| VAL-02 | Lire passivement l’historique du seul projet autorisé. | Version et nom distants complets, sans donnée métier. |
| VAL-03 à VAL-05 | Comparer les deux inventaires de façon déterministe. | Correspondances, collisions et absences explicites. |
| VAL-06 à VAL-07 | Interroger seulement le catalogue système nécessaire. | Présence/absence d’objets et de versions alternatives, sans lecture applicative. |
| VAL-08 à VAL-10 | Relier les constats aux options de reprise de GOAL-003. | Décision motivée, sans correction exécutée. |
| VAL-11 | Revue Work du rapport et des Evidence redigées. | Verdict de reprise ou de Goal R3 requis. |
| VAL-12 | Revoir le journal de commandes et les résultats. | Aucune mutation distante. |

| ID | Evidence attendue |
| --- | --- |
| EV-01 | Inventaire local redigé avec empreintes. |
| EV-02 | Inventaire distant redigé. |
| EV-03 | Tableau de comparaison version par version. |
| EV-04 | Liste exhaustive des collisions. |
| EV-05 | Listes local-seul et distant-seul. |
| EV-06 | Métadonnées de catalogue des objets en conflit. |
| EV-07 | Recherche des versions alternatives. |
| EV-08 | Analyse de l’impact sur GOAL-003. |
| EV-09 | Comparatif des options et risques. |
| EV-10 | Recommandation ou limite déclarée. |
| EV-11 | Revue indépendante Work. |
| EV-12 | Attestation de non-mutation distante. |

## Plan de Runs

### Run 1 — Diagnostic passif

1. Confirmer le projet exact. — **réalisé**
2. Produire l’inventaire local complet. — **réalisé**
3. Lire passivement l’historique distant complet. — **réalisé**
4. Comparer version par version. — **réalisé**
5. Arrêter si l’historique distant est partiel. — **non déclenché**
6. Identifier toutes les collisions et absences. — **réalisé**
7. Analyser les effets de catalogue liés aux divergences. — **réalisé, attribution partiellement ambiguë**
8. Rechercher les migrations potentiellement appliquées sous une autre version. — **réalisé**
9. Analyser l’impact sur GOAL-003. — **réalisé**
10. Produire le rapport. — **réalisé**
11. Ne proposer aucune correction avant la revue indépendante. — **respecté**

`supabase migration repair`, `db push`, `migration up`, SQL de mutation et tout changement d’historique sont interdits.

## Evidence du Run 1 passif

- Le projet vérifié correspond exactement à `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production, avec l’état observé `ACTIVE_HEALTHY`.
- L’inventaire local contient 98 migrations SQL conformes avec taille et empreintes SHA-256 exactes/LF; l’historique distant contient 97 entrées passivement retournées.
- La comparaison établit 92 `MATCH_VERSION_NAME`, 5 `VERSION_COLLISION`, 1 `LOCAL_ONLY` et aucun `REMOTE_ONLY`. La migration GOAL-003 `20260712120000_secure_claim_review_analyze_jobs` est `LOCAL_ONLY` et n’est donc pas appliquée.
- Les cinq collisions `20260219120000`, `20260219123000`, `20260219130000`, `20260219133000` et `20260221193000` disposent chacune d’une fiche : version, noms local/distant, effets locaux explicitement extraits, métadonnées réellement observées et attribution qualifiée sans inférer le SQL distant.
- Le catalogue confirme des effets liés à `ai_jobs` et l’absence de l’index/contrainte `alerts_unique_rule_per_review`, mais leur attribution à une migration précise reste `CATALOG_EFFECT_AMBIGUOUS` lorsque le contenu distant n’est pas exposé.
- Le rapport compare les options R3 (inaction, migration prospective seule, renommage local, baselining, réparation d’historique et stratégie hybride) selon leurs bénéfices, risques, préconditions, impact futur, réversibilité et besoin d’accès production.
- **Décision du Run 1 :** `Goal correctif R3 requis`. GOAL-003 ne peut pas reprendre ni appliquer sa migration tant qu’une stratégie de réconciliation de l’historique n’est pas approuvée et vérifiée.
- Les métadonnées système nécessaires ont été lues passivement : noms et définitions techniques, grants, états RLS, policies, fonctions, contraintes, index, triggers et autres propriétés de schéma. Aucune ligne de table applicative, payload métier, contenu utilisateur, secret, jeton, valeur d’environnement, ni donnée Auth ou Storage sensible n’a été lue.
- Aucune DDL, DML, DCL, application de migration, réparation d’historique, modification de grant, policy, fonction, RLS, contrainte, index, configuration ou historique de migration n’a été effectuée ; aucune RPC, Edge Function, route, cron ou endpoint n’a été invoqué.
- Contrôles locaux exécutés sans nouvel accès distant : recalcul du manifeste et des empreintes (98 entrées conformes), `git diff --check` et vérification whitespace du nouveau rapport.

### Run 2 — Revue indépendante

- Work revoit le rapport et la complétude des divergences.
- Verdict unique : `GOAL-003 peut reprendre`, `Goal correctif R3 requis` ou `diagnostic incomplet`.
- Aucune correction de production ne fait partie de GOAL-004.

## Conditions d’arrêt

- Historique distant incomplet ou inaccessible.
- Impossibilité de distinguer version, nom ou contenu.
- Besoin de lire des données métier ou d’exécuter une migration pour confirmer une hypothèse.
- Nécessité de modifier l’historique Supabase.
- Existence d’autres projets Supabase possibles.
- Divergence plus large que le périmètre prévu.
- Impossibilité de relier les objets de schéma aux migrations observées.

## Décisions fondatrices — projet et autorisation future

Le fondateur confirme que le seul projet autorisé pour le futur Run 1 est `fhadiwkdznhuxtlgrwfd`, nommé `egia-mvp`, en environnement **production**. Aucun autre projet, branche Supabase, environnement preview ou projet de staging n’est inclus. Le futur Run s’arrête immédiatement si l’identité du projet ne correspond plus exactement à ces trois éléments.

L’autorisation fondatrice explicite du Run 1 distant passif est accordée le `2026-07-12`, uniquement pour le projet confirmé, la lecture passive de l’historique des migrations et du catalogue nécessaire au diagnostic, sans donnée applicative ni mutation. Le Run s’arrête immédiatement en cas de projet ambigu, d’historique incomplet, de nécessité de lire une donnée applicative ou de mutation. Aucune autorisation de réparation, migration, DDL, DML, DCL, RPC, endpoint ou correction de production n’est accordée.

## Readiness Check

| Point | État | Blocker / Evidence |
| --- | --- | --- |
| Méthode d’empreintes locales | résolue | Règle de nom, octets exacts, SHA-256 normalisé LF et anomalies documentés. |
| Procédure de comparaison | résolue | Champs distants minimaux, classifications et limites de contenu définis. |
| Evidence redigées | résolue | Contenu autorisé, interdit et redaction définis. |
| Procédure de diagnostic | résolue | Ordre du Run 1, catalogue passif et conditions d’arrêt définis. |
| Projet concerné | validé | Seul `fhadiwkdznhuxtlgrwfd` / `egia-mvp` / production est autorisé pour le futur Run 1. |
| Run 1 passif | réalisé — revue Work requise | Périmètre limité au projet unique, à l’historique distant et au catalogue passif ; aucune mutation n’a été effectuée. |
| Mutation distante | interdite | Aucun DDL, DML, DCL, repair ou baselining n’est autorisé. |

**Résultat : Readiness Check validé.** Les méthodes d’inventaire, comparaison, catalogue passif, Evidence, AC/VAL/EV, scope, hors-scope et conditions d’arrêt sont validés, de même que le projet unique. GOAL-004 est `Running` pour le seul Run 1 passif autorisé; aucune mutation n’est permise.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-12` | N/A → `Draft` | Fondateur (Melvyn) | Diagnostic R2 créé à la suite du blocage préflight de GOAL-003; aucune mutation distante n’est autorisée. |
| `2026-07-12` | `Draft` → `Ready` | Fondateur (Melvyn) | Projet Supabase unique confirmé ; méthodes de comparaison, Evidence, AC/VAL/EV, limites et conditions d’arrêt validées. Le Run 1 distant passif reste soumis à une autorisation fondatrice séparée. |
| `2026-07-12` | `Ready` → `Running` | Fondateur (Melvyn) | Run 1 distant passif autorisé uniquement pour l’historique des migrations et le catalogue du projet `fhadiwkdznhuxtlgrwfd`, sans donnée applicative ni mutation. |

## Définition de Done

GOAL-004 est `Done` uniquement lorsque le rapport attendu est complet, les AC-01 à AC-12 sont couverts par des Evidence redigées, Work a rendu sa revue indépendante, et une décision explicite indique la condition de reprise de GOAL-003 ou la nécessité d’un Goal R3 correctif. Toute réparation reste hors-scope.
