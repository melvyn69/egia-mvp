# GOAL-004 — Diagnostic passif de l’historique des migrations Supabase

## Statut du rapport

- Goal : GOAL-004
- Run : Run 1 — diagnostic passif autorisé
- Projet vérifié : fhadiwkdznhuxtlgrwfd / egia-mvp / production
- Verdict de diagnostic : Goal correctif R3 requis avant toute reprise de GOAL-003.
- Limite : aucune mutation ni donnée applicative n’a été consultée.

## Périmètre et non-mutation

Le Run a passivement lu l’identité du projet, l’historique de migrations et les métadonnées système nécessaires au catalogue : noms et définitions techniques nécessaires, grants, états RLS, policies, fonctions, contraintes, index, triggers et autres métadonnées de schéma pertinentes. Il n’a lu aucune ligne de table applicative, aucun payload métier, contenu utilisateur, secret, jeton, valeur de variable d’environnement, ni donnée Auth ou Storage sensible. Aucune DDL, DML, DCL, application de migration, réparation d’historique, modification de grant, policy, fonction, RLS, contrainte, index, configuration ou historique de migration n’a été effectuée ; aucune RPC, Edge Function, route, cron ou endpoint n’a été invoqué.

## Identité du projet

Le projet distant retourné correspond exactement au contrat : identifiant fhadiwkdznhuxtlgrwfd, nom egia-mvp, état ACTIVE_HEALTHY, environnement production confirmé par l’autorisation fondatrice. Aucun autre projet, branche ou preview n’a été consulté.

## Inventaires

- Local : 98 fichiers SQL conformes sous supabase/migrations/.
- Distant : 97 entrées d’historique retournées par la lecture passive.
- Le service distant n’expose ni contenu SQL ni empreinte de contenu pour ces entrées. Une correspondance version/nom reste nominale.
- Anomalies locales préexistantes : 3 fichiers vides et 4 noms réutilisés sous des versions distinctes, décrits dans GOAL-004.

### Comparaison version par version

- MATCH_VERSION_NAME : 92
- VERSION_COLLISION : 5
- LOCAL_ONLY : 1
- REMOTE_ONLY : 0

| Version | Nom local | Nom distant | Classification |
| --- | --- | --- | --- |
| 20251228124145 | google_connections | google_connections | MATCH_VERSION_NAME |
| 20251228194500 | google_gbp_tables | google_gbp_tables | MATCH_VERSION_NAME |
| 20251228195500 | google_reviews | google_reviews | MATCH_VERSION_NAME |
| 20251231120000 | business_memory | business_memory | MATCH_VERSION_NAME |
| 20251231140000 | review_replies | review_replies | MATCH_VERSION_NAME |
| 20260101000000 | google_reviews_rls | google_reviews_rls | MATCH_VERSION_NAME |
| 20260101001000 | google_connections_oauth_state | google_connections_oauth_state | MATCH_VERSION_NAME |
| 20260105090000 | google_oauth_states | google_oauth_states | MATCH_VERSION_NAME |
| 20260105093000 | google_oauth_states_expires_at | google_oauth_states_expires_at | MATCH_VERSION_NAME |
| 20260106114914 | google_reviews_add_raw_jsonb | google_reviews_add_raw_jsonb | MATCH_VERSION_NAME |
| 20260106115555 | google_reviews_add_raw_jsonb | google_reviews_add_raw_jsonb | MATCH_VERSION_NAME |
| 20260106120512 | google_reviews_location_name_default | google_reviews_location_name_default | MATCH_VERSION_NAME |
| 20260107130000 | review_ai_insights | review_ai_insights | MATCH_VERSION_NAME |
| 20260115093000 | google_reviews_schema_hardening | google_reviews_schema_hardening | MATCH_VERSION_NAME |
| 20260116113628 | google_reviews_columns_align | google_reviews_columns_align | MATCH_VERSION_NAME |
| 20260116180000 | ai_tag_candidates_rpc | ai_tag_candidates_rpc | MATCH_VERSION_NAME |
| 20260116200000 | kpi_summary_rpc | kpi_summary_rpc | MATCH_VERSION_NAME |
| 20260116203000 | kpi_summary_filters | kpi_summary_filters | MATCH_VERSION_NAME |
| 20260116204500 | reviews_source_time_index | reviews_source_time_index | MATCH_VERSION_NAME |
| 20260201090000 | automations_mvp | automations_mvp | MATCH_VERSION_NAME |
| 20260201103000 | brand_voice | brand_voice | MATCH_VERSION_NAME |
| 20260201113000 | review_replies_history | review_replies_history | MATCH_VERSION_NAME |
| 20260201120000 | brand_voice_locations | brand_voice_locations | MATCH_VERSION_NAME |
| 20260201121000 | automation_workflows_location_ids | automation_workflows_location_ids | MATCH_VERSION_NAME |
| 20260201123000 | perf_indexes | perf_indexes | MATCH_VERSION_NAME |
| 20260201124000 | user_roles | user_roles | MATCH_VERSION_NAME |
| 20260201125500 | job_queue | job_queue | MATCH_VERSION_NAME |
| 20260201130000 | google_sync_last_synced | google_sync_last_synced | MATCH_VERSION_NAME |
| 20260201132000 | business_settings_active_locations | business_settings_active_locations | MATCH_VERSION_NAME |
| 20260201150000 | reports | reports | MATCH_VERSION_NAME |
| 20260201160000 | reports_render_mode | reports_render_mode | MATCH_VERSION_NAME |
| 20260201181000 | team_members | team_members | MATCH_VERSION_NAME |
| 20260214100000 | business_settings_monthly_report_enabled | business_settings_monthly_report_enabled | MATCH_VERSION_NAME |
| 20260214103000 | reports_rendered_emailed_at | reports_rendered_emailed_at | MATCH_VERSION_NAME |
| 20260214110000 | team_members_monthly_report_opt_in | team_members_monthly_report_opt_in | MATCH_VERSION_NAME |
| 20260214140000 | team_invitations | team_invitations | MATCH_VERSION_NAME |
| 20260214160000 | alerts | alerts | MATCH_VERSION_NAME |
| 20260214162000 | alerts_last_notified_at | alerts_last_notified_at | MATCH_VERSION_NAME |
| 20260215120000 | legal_entities | legal_entities | MATCH_VERSION_NAME |
| 20260215120500 | google_locations_legal_entity | google_locations_legal_entity | MATCH_VERSION_NAME |
| 20260215121000 | brand_assets_bucket | brand_assets_bucket | MATCH_VERSION_NAME |
| 20260215190000 | brand_voice_rls | brand_voice_rls | MATCH_VERSION_NAME |
| 20260215200000 | competitive_monitoring_settings | competitive_monitoring_settings | MATCH_VERSION_NAME |
| 20260215200500 | competitors | competitors | MATCH_VERSION_NAME |
| 20260215201500 | google_locations_coords | google_locations_coords | MATCH_VERSION_NAME |
| 20260215202000 | generated_reports | generated_reports | MATCH_VERSION_NAME |
| 20260215220147 | remote_schema | remote_schema | MATCH_VERSION_NAME |
| 20260215223247 | remote_schema | remote_schema | MATCH_VERSION_NAME |
| 20260216093653 | review_replies_unified | review_replies_unified | MATCH_VERSION_NAME |
| 20260218120000 | rls_automations_alerts | rls_automations_alerts | MATCH_VERSION_NAME |
| 20260218123000 | fix_security_definer_views | fix_security_definer_views | MATCH_VERSION_NAME |
| 20260218124000 | enable_rls_user_tables | enable_rls_user_tables | MATCH_VERSION_NAME |
| 20260218125000 | fix_cron_state_select | fix_cron_state_select | MATCH_VERSION_NAME |
| 20260218131000 | alerts_unique_workflow_review | alerts_unique_workflow_review | MATCH_VERSION_NAME |
| 20260218132000 | alerts_enrich | alerts_enrich | MATCH_VERSION_NAME |
| 20260219100000 | ai_run_history | ai_run_history | MATCH_VERSION_NAME |
| 20260219101000 | ai_run_history_enrich | ai_run_history_enrich | MATCH_VERSION_NAME |
| 20260219112000 | ai_run_history_duration | ai_run_history_duration | MATCH_VERSION_NAME |
| 20260219120000 | ai_run_history_rls | automation_rules_schema | VERSION_COLLISION |
| 20260219123000 | automation_rules_schema | fix_cron_state_rls | VERSION_COLLISION |
| 20260219124500 | fix_cron_state_rls | fix_cron_state_rls | MATCH_VERSION_NAME |
| 20260219130000 | ai_jobs_queue | drop_alerts_unique_rule_per_review | VERSION_COLLISION |
| 20260219133000 | drop_alerts_unique_rule_per_review | user_roles_is_admin | VERSION_COLLISION |
| 20260219140000 | user_profiles | user_profiles | MATCH_VERSION_NAME |
| 20260219141000 | business_settings_monthly_report_enabled | business_settings_monthly_report_enabled | MATCH_VERSION_NAME |
| 20260219143000 | monthly_report_email_guard | monthly_report_email_guard | MATCH_VERSION_NAME |
| 20260220120000 | review_ai_replies | review_ai_replies | MATCH_VERSION_NAME |
| 20260220123000 | user_profiles_rls | user_profiles_rls | MATCH_VERSION_NAME |
| 20260220130000 | ai_draft_runs | ai_draft_runs | MATCH_VERSION_NAME |
| 20260220143000 | ai_draft_runs_cooldown | ai_draft_runs_cooldown | MATCH_VERSION_NAME |
| 20260220144000 | user_profiles_grants | user_profiles_grants | MATCH_VERSION_NAME |
| 20260220145000 | user_profiles_user_id_unique | user_profiles_user_id_unique | MATCH_VERSION_NAME |
| 20260220146000 | user_profiles_rls_fix | user_profiles_rls_fix | MATCH_VERSION_NAME |
| 20260220150000 | user_profiles_trigger | user_profiles_trigger | MATCH_VERSION_NAME |
| 20260220151000 | ai_jobs_pending_idx | ai_jobs_pending_idx | MATCH_VERSION_NAME |
| 20260220152000 | claim_review_analyze_jobs | claim_review_analyze_jobs | MATCH_VERSION_NAME |
| 20260220153000 | claim_review_analyze_jobs_grants | claim_review_analyze_jobs_grants | MATCH_VERSION_NAME |
| 20260220154000 | fix_claim_review_analyze_jobs | fix_claim_review_analyze_jobs | MATCH_VERSION_NAME |
| 20260220155000 | review_replies_unified | review_replies_unified | MATCH_VERSION_NAME |
| 20260220160000 | google_sync_runs | google_sync_runs | MATCH_VERSION_NAME |
| 20260221103000 | review_ai_replies_identity_hash | review_ai_replies_identity_hash | MATCH_VERSION_NAME |
| 20260221121500 | brand_voice_unique_scope | brand_voice_unique_scope | MATCH_VERSION_NAME |
| 20260221133000 | reviews_to_reply_pipeline | reviews_to_reply_pipeline | MATCH_VERSION_NAME |
| 20260221152000 | inbox_reviews_rpc | inbox_reviews_rpc | MATCH_VERSION_NAME |
| 20260221173000 | fix_rpc_location_and_review_pk | fix_rpc_location_and_review_pk | MATCH_VERSION_NAME |
| 20260221191500 | fix_rpc_inbox_and_to_reply | fix_rpc_inbox_and_to_reply | MATCH_VERSION_NAME |
| 20260221193000 | remote_history_placeholder | fix_rpc_ai_jobs_user_filter | VERSION_COLLISION |
| 20260221194500 | fix_rpc_inbox_to_reply_definitive | fix_rpc_inbox_to_reply_definitive | MATCH_VERSION_NAME |
| 20260618181806 | loyalty_wallet | loyalty_wallet | MATCH_VERSION_NAME |
| 20260618182223 | fix_join_loyalty_program_wallet_conflict | fix_join_loyalty_program_wallet_conflict | MATCH_VERSION_NAME |
| 20260618190424 | loyalty_wallet_public_token_scan | loyalty_wallet_public_token_scan | MATCH_VERSION_NAME |
| 20260624202328 | dedupe_legacy_alerts | dedupe_legacy_alerts | MATCH_VERSION_NAME |
| 20260624202329 | alerts_unique_legacy_rule_review | alerts_unique_legacy_rule_review | MATCH_VERSION_NAME |
| 20260624202330 | operational_logs_retention_30d | operational_logs_retention_30d | MATCH_VERSION_NAME |
| 20260625125725 | secure_review_ai_replies_audit_rls | secure_review_ai_replies_audit_rls | MATCH_VERSION_NAME |
| 20260704213544 | approved_high_confidence_indexes | approved_high_confidence_indexes | MATCH_VERSION_NAME |
| 20260711120000 | supabase_egress_guardrails | supabase_egress_guardrails | MATCH_VERSION_NAME |
| 20260712120000 | secure_claim_review_analyze_jobs | — | LOCAL_ONLY |

### Collisions certaines

| Version | Local | Distant | Observation |
| --- | --- | --- | --- |
| 20260219120000 | ai_run_history_rls | automation_rules_schema | Même version, noms différents ; contenu distant non exposé. |
| 20260219123000 | automation_rules_schema | fix_cron_state_rls | Même version, noms différents ; contenu distant non exposé. |
| 20260219130000 | ai_jobs_queue | drop_alerts_unique_rule_per_review | Même version, noms différents ; contenu distant non exposé. |
| 20260219133000 | drop_alerts_unique_rule_per_review | user_roles_is_admin | Même version, noms différents ; contenu distant non exposé. |
| 20260221193000 | remote_history_placeholder | fix_rpc_ai_jobs_user_filter | Même version, noms différents ; contenu distant non exposé. |

### Entrées absentes

| Classification | Version | Nom |
| --- | --- | --- |
| LOCAL_ONLY | 20260712120000 | secure_claim_review_analyze_jobs |

La migration GOAL-003 20260712120000_secure_claim_review_analyze_jobs est LOCAL_ONLY : elle n’est pas appliquée. Cette absence ne répare ni ne masque les collisions antérieures, mais une application avec cette version ne résoudrait pas l’historique incohérent.

## Fiches des collisions

### Collision 20260219120000

#### Version

- Version : `20260219120000`
- Nom local : `ai_run_history_rls`
- Nom distant : `automation_rules_schema`
- Classification : `VERSION_COLLISION`

#### Effets locaux attendus

- Tables : aucune table créée ou supprimée ; `public.ai_run_history` est la table explicitement modifiée.
- Colonnes : aucun effet local explicite identifié dans cette catégorie.
- Contraintes : aucun effet local explicite identifié dans cette catégorie.
- Index : aucun effet local explicite identifié dans cette catégorie.
- Fonctions : aucun effet local explicite identifié dans cette catégorie.
- Triggers : aucun effet local explicite identifié dans cette catégorie.
- RLS : active RLS sur `public.ai_run_history`.
- Policies : supprime conditionnellement puis crée `ai_run_history_select`, policy `SELECT` pour `authenticated`, avec une condition fondée sur `public.user_roles`, `user_id` ou `meta->>'user_id'`.
- Grants : aucun effet local explicite identifié dans cette catégorie.
- Autres objets : aucun effet local explicite identifié dans cette catégorie.

#### Métadonnées distantes observées

Le Run 1 n’a consigné aucun objet de catalogue propre à `ai_run_history` ou à `automation_rules_schema` pour cette version. Le seul fait distant disponible est l’entrée d’historique passive nommée `automation_rules_schema`.

#### Attribution historique

`non déterminable`. Les noms divergent et le contenu SQL distant n’a pas été exposé ; l’absence de métadonnée spécifique relevée interdit d’attribuer les effets locaux ou un objet distant à cette version.

### Collision 20260219123000

#### Version

- Version : `20260219123000`
- Nom local : `automation_rules_schema`
- Nom distant : `fix_cron_state_rls`
- Classification : `VERSION_COLLISION`

#### Effets locaux attendus

- Tables : aucune table créée ou supprimée ; `public.automation_conditions` et `public.automation_actions` sont explicitement modifiées.
- Colonnes : ajoute conditionnellement `label text` et `value_jsonb jsonb` à `automation_conditions`, puis `action_type text`, `params jsonb` et `label text` à `automation_actions`.
- Contraintes : aucun effet local explicite identifié dans cette catégorie.
- Index : aucun effet local explicite identifié dans cette catégorie.
- Fonctions : aucun effet local explicite identifié dans cette catégorie.
- Triggers : aucun effet local explicite identifié dans cette catégorie.
- RLS : aucun effet local explicite identifié dans cette catégorie.
- Policies : aucun effet local explicite identifié dans cette catégorie.
- Grants : aucun effet local explicite identifié dans cette catégorie.
- Autres objets : met à jour les lignes existantes de `automation_actions` pour renseigner `action_type` depuis `type` et `params` depuis `config` lorsqu’elles sont nulles.

#### Métadonnées distantes observées

Le Run 1 n’a relevé ni colonne ni autre métadonnée de catalogue rattachable à cette version. L’historique passif indique uniquement le nom distant `fix_cron_state_rls`, sans définition SQL.

#### Attribution historique

`non déterminable`. Le Run 1 n’a pas collecté de métadonnée de catalogue propre à ces colonnes ou à leur transformation, et le nom distant ne constitue pas une preuve de contenu SQL.

### Collision 20260219130000

#### Version

- Version : `20260219130000`
- Nom local : `ai_jobs_queue`
- Nom distant : `drop_alerts_unique_rule_per_review`
- Classification : `VERSION_COLLISION`

#### Effets locaux attendus

- Tables : crée conditionnellement `public.ai_jobs`.
- Colonnes : `id`, `type`, `payload`, `status`, `created_at`, `started_at`, `finished_at` et `error` sur `public.ai_jobs`.
- Contraintes : clé primaire sur `id` ; aucun autre effet local explicite identifié dans cette catégorie.
- Index : crée conditionnellement `ai_jobs_status_created_at_idx` et l’index unique `ai_jobs_unique_review`.
- Fonctions : crée ou remplace `public.enqueue_ai_job_for_review()`.
- Triggers : remplace `trg_ai_jobs_on_google_reviews` ; crée conditionnellement `trg_ai_jobs_on_inbox_reviews` si `public.inbox_reviews` est une table.
- RLS : active RLS sur `public.ai_jobs`.
- Policies : aucun effet local explicite identifié dans cette catégorie.
- Grants : révoque tous les privilèges de `anon` et `authenticated`, puis accorde tous les privilèges à `service_role` sur `public.ai_jobs`.
- Autres objets : aucun effet local explicite identifié dans cette catégorie.

#### Métadonnées distantes observées

Le catalogue observé pendant le Run 1 indique que `public.ai_jobs` existe avec les huit colonnes attendues et RLS active ; `enqueue_ai_job_for_review()` et `claim_review_analyze_jobs(integer, text, text)` existent ; `trg_ai_jobs_on_google_reviews` existe alors que le trigger inbox n’est pas présent ; `ai_jobs_status_created_at_idx` existe. Deux policies et des métadonnées de grants de table, notamment pour `anon`, `authenticated`, `postgres` et `service_role`, ont été observées. L’index et la contrainte `alerts_unique_rule_per_review` sont absents. D’autres index observés peuvent provenir de migrations ultérieures.

#### Attribution historique

`ambiguë`. Ces effets de catalogue sont observés, mais le contenu SQL distant de cette version n’est pas exposé : les objets `ai_jobs` ont pu être créés ou modifiés sous une autre version, et l’absence de l’index ou contrainte alerts ne prouve pas la migration qui l’a produite.

### Collision 20260219133000

#### Version

- Version : `20260219133000`
- Nom local : `drop_alerts_unique_rule_per_review`
- Nom distant : `user_roles_is_admin`
- Classification : `VERSION_COLLISION`

#### Effets locaux attendus

- Tables : aucune table créée ou supprimée ; `public.alerts` est explicitement modifiée pour retirer une contrainte si elle existe.
- Colonnes : aucun effet local explicite identifié dans cette catégorie.
- Contraintes : supprime conditionnellement `alerts_unique_rule_per_review` de `public.alerts`.
- Index : supprime conditionnellement `public.alerts_unique_rule_per_review`.
- Fonctions : aucun effet local explicite identifié dans cette catégorie.
- Triggers : aucun effet local explicite identifié dans cette catégorie.
- RLS : aucun effet local explicite identifié dans cette catégorie.
- Policies : aucun effet local explicite identifié dans cette catégorie.
- Grants : aucun effet local explicite identifié dans cette catégorie.
- Autres objets : aucun effet local explicite identifié dans cette catégorie.

#### Métadonnées distantes observées

Le Run 1 a observé l’absence de l’index et de la contrainte `alerts_unique_rule_per_review`. Aucune autre métadonnée spécifique n’a été relevée pour relier cette absence à la collision ; le nom distant `user_roles_is_admin` provient de l’historique, non d’une définition SQL exposée.

#### Attribution historique

`ambiguë`. L’absence est une observation de catalogue compatible avec une suppression, mais elle n’établit ni le contenu SQL distant `user_roles_is_admin` ni la version qui a retiré l’objet.

### Collision 20260221193000

#### Version

- Version : `20260221193000`
- Nom local : `remote_history_placeholder`
- Nom distant : `fix_rpc_ai_jobs_user_filter`
- Classification : `VERSION_COLLISION`

#### Effets locaux attendus

- Tables : aucun effet local explicite identifié dans cette catégorie.
- Colonnes : aucun effet local explicite identifié dans cette catégorie.
- Contraintes : aucun effet local explicite identifié dans cette catégorie.
- Index : aucun effet local explicite identifié dans cette catégorie.
- Fonctions : aucun effet local explicite identifié dans cette catégorie.
- Triggers : aucun effet local explicite identifié dans cette catégorie.
- RLS : aucun effet local explicite identifié dans cette catégorie.
- Policies : aucun effet local explicite identifié dans cette catégorie.
- Grants : aucun effet local explicite identifié dans cette catégorie.
- Autres objets : le fichier local ne contient que des commentaires et n’exécute aucun changement de schéma.

#### Métadonnées distantes observées

Aucune fonction ni autre métadonnée de catalogue n’a été consignée pendant le Run 1 pour cette version. L’entrée d’historique passive `fix_rpc_ai_jobs_user_filter` est donc le seul élément distant disponible ici.

#### Attribution historique

`non déterminable`. Le fichier local est un placeholder sans effet SQL et le contenu distant n’est pas disponible ; le nom distant ne permet pas d’inférer une fonction ni son filtre utilisateur.

## Recherche sous une autre version

Les noms associés aux collisions révèlent des décalages de version :

- automation_rules_schema : local 20260219123000, distant 20260219120000 ;
- fix_cron_state_rls : local 20260219124500, distant sous 20260219123000 et 20260219124500 ;
- drop_alerts_unique_rule_per_review : local 20260219133000, distant 20260219130000 ;
- ai_jobs_queue, ai_run_history_rls, user_roles_is_admin, remote_history_placeholder et fix_rpc_ai_jobs_user_filter ne disposent pas d’une correspondance nominale alternative établie par les seuls inventaires.

Cette recherche ne fournit aucune preuve de contenu distant : elle établit seulement des correspondances ou absences de noms.

## Conclusion et recommandation

La divergence est plus large qu’une seule entrée : 5 collisions de version sont présentes, avec un décalage de noms autour de 20260219120000–20260219133000 et une collision supplémentaire à 20260221193000. Les métadonnées de catalogue confirment des objets, mais ne permettent pas d’attribuer de façon certaine leur provenance historique.

| Option | Description | Bénéfice | Risque | Préconditions | Impact sur les migrations futures | Réversibilité | Accès production requis | Décision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ne rien réparer | Conserver l’historique et les fichiers tels quels. | Aucun changement de production. | Les collisions persistent ; l’application de GOAL-003 reste non déterministe face à l’historique. | Aucune. | Les contrôles et déploiements ultérieurs restent ambigus. | Sans objet. | Non. | Écartée. |
| Appliquer seulement une migration prospective, y compris GOAL-003 | Ajouter ou appliquer une migration sans traiter les collisions. | Pourrait cibler un besoin isolé. | Ne réconcilie pas les versions divergentes et peut faire ignorer ou rejouer un effet attendu. | Historique cohérent démontré, ce qui n’est pas le cas. | L’ambiguïté demeure et se propage aux prochaines migrations. | Variable selon l’effet de la migration ; pas une réparation d’historique. | Oui. | Écartée. |
| Renommer prospectivement les fichiers locaux en collision | Modifier seulement les noms ou versions locales pour les rapprocher de l’historique distant. | Peut clarifier un inventaire local. | Ne prouve aucune équivalence de contenu et peut réécrire la signification locale des versions. | Correspondance de contenu démontrée version par version et revue indépendante. | Peut masquer la divergence au lieu de la résoudre. | Réversible dans Git, mais insuffisant pour l’historique de production. | Non pour le renommage seul. | Écartée. |
| Baselining contrôlé | Établir un point de référence explicite pour l’état connu. | Peut fournir une base contrôlée aux migrations futures. | Peut entériner des écarts non attribués ou faire sauter des effets attendus. | Inventaire et état de schéma déterministes, Evidence sauvegardées, contrat et autorisation distincts. | Redéfinit le point de départ des validations futures. | Difficile à inverser une fois l’historique de production modifié. | Oui. | Possible sous conditions. |
| Réparation contrôlée de l’historique Supabase | Corriger explicitement les entrées d’historique après cartographie déterministe. | Peut réaligner l’historique avec une réalité démontrée. | Risque élevé de marquer à tort une migration appliquée ou non appliquée. | Cartographie complète, préflight, sauvegarde des Evidence, plan de rollback, revue indépendante et autorisation fondatrice. | Peut restaurer une trajectoire de migration vérifiable. | Difficile ; dépend de sauvegardes et du plan approuvé. | Oui. | Possible sous conditions. |
| Stratégie hybride déterministe | Dans un Goal R3 distinct, choisir après préflight une combinaison minimale de cartographie, baselining ou réparation, et seulement les actions explicitement autorisées. | Évite d’imposer une stratégie sans Evidence suffisante. | Plus complexe et exige une gouvernance stricte. | Contrat R3, critères de décision, Evidence, plan de rollback, revue indépendante et autorisation fondatrice distincte. | Peut établir une trajectoire future contrôlée sans présumer du contenu passé. | Dépend de l’action retenue ; doit être définie avant toute mutation. | Oui si une étape choisie modifie la production. | Retenue. |

Recommandation unique : **Créer un Goal R3 dédié pour établir puis appliquer une stratégie déterministe de réconciliation de l’historique, avec préflight, sauvegarde des Evidence, plan de rollback, revue indépendante et autorisation fondatrice distincte.** GOAL-003 ne doit pas reprendre ni appliquer sa migration tant que cette stratégie n’est pas approuvée et vérifiée. Aucune stratégie précise ne doit être exécutée avant son propre contrat, sa revue et son autorisation ; aucune n’a été exécutée ici.

## Annexes — inventaires redigés

### Inventaire local complet

| Version | Nom | Chemin | Octets | SHA-256 exact | SHA-256 LF |
| --- | --- | --- | --- | --- | --- |
| 20251228124145 | google_connections | supabase/migrations/20251228124145_google_connections.sql | 1439 | 797df64e79eb0a9c00263234dc9f87eb9f00353226dfce5131c11ee8796355c1 | 797df64e79eb0a9c00263234dc9f87eb9f00353226dfce5131c11ee8796355c1 |
| 20251228194500 | google_gbp_tables | supabase/migrations/20251228194500_google_gbp_tables.sql | 2188 | b1cc4b4d50fb35d0fdc849844f91f0b698db26231b5c728d83cb3757c3956caa | b1cc4b4d50fb35d0fdc849844f91f0b698db26231b5c728d83cb3757c3956caa |
| 20251228195500 | google_reviews | supabase/migrations/20251228195500_google_reviews.sql | 623 | 5744693e690ece62404cb023a84d8a9d08c4b9a9a96492fc1e08c1f5b6c7fb0f | 5744693e690ece62404cb023a84d8a9d08c4b9a9a96492fc1e08c1f5b6c7fb0f |
| 20251231120000 | business_memory | supabase/migrations/20251231120000_business_memory.sql | 1518 | d4c4bca2e8416a921c0f0de08ce561577030aea882a73d4578970513335c5352 | d4c4bca2e8416a921c0f0de08ce561577030aea882a73d4578970513335c5352 |
| 20251231140000 | review_replies | supabase/migrations/20251231140000_review_replies.sql | 1113 | 2474c8c1065123b47bbf27602f268a8141cb92d9f2050bb93e79c42af0924116 | 2474c8c1065123b47bbf27602f268a8141cb92d9f2050bb93e79c42af0924116 |
| 20260101000000 | google_reviews_rls | supabase/migrations/20260101000000_google_reviews_rls.sql | 796 | ce49d3bdf7c7db3f19bbccfb344b925c347fc7227d7a0d8ebed9baae662828f3 | ce49d3bdf7c7db3f19bbccfb344b925c347fc7227d7a0d8ebed9baae662828f3 |
| 20260101001000 | google_connections_oauth_state | supabase/migrations/20260101001000_google_connections_oauth_state.sql | 247 | c7871085a2809dd2e1d159bc498fa131b3b5919674ef352c24e36c54be28efb2 | c7871085a2809dd2e1d159bc498fa131b3b5919674ef352c24e36c54be28efb2 |
| 20260105090000 | google_oauth_states | supabase/migrations/20260105090000_google_oauth_states.sql | 485 | a057ea9082e76d08a800d3cc31bb85f6274d9611f109f17a947eb55589a62386 | a057ea9082e76d08a800d3cc31bb85f6274d9611f109f17a947eb55589a62386 |
| 20260105093000 | google_oauth_states_expires_at | supabase/migrations/20260105093000_google_oauth_states_expires_at.sql | 90 | 9ec1a72cec449a74b23ca4bdd2a0af23e54c17fd125207c9a0be3b100bf73238 | 9ec1a72cec449a74b23ca4bdd2a0af23e54c17fd125207c9a0be3b100bf73238 |
| 20260106114914 | google_reviews_add_raw_jsonb | supabase/migrations/20260106114914_google_reviews_add_raw_jsonb.sql | 72 | c208b4a865e87e3179095d18f3ffd3efcdb8e44342e22fc277535d2d14dcff98 | c208b4a865e87e3179095d18f3ffd3efcdb8e44342e22fc277535d2d14dcff98 |
| 20260106115555 | google_reviews_add_raw_jsonb | supabase/migrations/20260106115555_google_reviews_add_raw_jsonb.sql | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 20260106120512 | google_reviews_location_name_default | supabase/migrations/20260106120512_google_reviews_location_name_default.sql | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 20260107130000 | review_ai_insights | supabase/migrations/20260107130000_review_ai_insights.sql | 2186 | bd50b726704987248ba63e5b7bfc541300ce9f19d9906da343013eb32a93013f | bd50b726704987248ba63e5b7bfc541300ce9f19d9906da343013eb32a93013f |
| 20260115093000 | google_reviews_schema_hardening | supabase/migrations/20260115093000_google_reviews_schema_hardening.sql | 969 | 35adf0618a1e1fe798dd1996211fbf0aedc7bc548953fb84378e4bcf86c9d44e | 35adf0618a1e1fe798dd1996211fbf0aedc7bc548953fb84378e4bcf86c9d44e |
| 20260116113628 | google_reviews_columns_align | supabase/migrations/20260116113628_google_reviews_columns_align.sql | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 20260116180000 | ai_tag_candidates_rpc | supabase/migrations/20260116180000_ai_tag_candidates_rpc.sql | 3340 | 45f1a87dc0879401299d0816cec119ddedfb74deabe3c1f68a6484da6be7b666 | 45f1a87dc0879401299d0816cec119ddedfb74deabe3c1f68a6484da6be7b666 |
| 20260116200000 | kpi_summary_rpc | supabase/migrations/20260116200000_kpi_summary_rpc.sql | 2451 | 39392b649c22af7a1949227ee3bc99c7f33eb921766537d86bbdb919449dd4fb | 39392b649c22af7a1949227ee3bc99c7f33eb921766537d86bbdb919449dd4fb |
| 20260116203000 | kpi_summary_filters | supabase/migrations/20260116203000_kpi_summary_filters.sql | 2655 | 67139b3f4496a47b5be69c1304ad184b766e6ebffd3b8ec1b6e4f2ca797f24ff | 67139b3f4496a47b5be69c1304ad184b766e6ebffd3b8ec1b6e4f2ca797f24ff |
| 20260116204500 | reviews_source_time_index | supabase/migrations/20260116204500_reviews_source_time_index.sql | 168 | 6647bd4610f3036bb2596b98098e33a66be73a7a65ae47aaccc68859dec7deef | 6647bd4610f3036bb2596b98098e33a66be73a7a65ae47aaccc68859dec7deef |
| 20260201090000 | automations_mvp | supabase/migrations/20260201090000_automations_mvp.sql | 9045 | c95fce4e66b02961035179d4ae92f580069c1daf82dd11982f00f53e17bb8704 | c95fce4e66b02961035179d4ae92f580069c1daf82dd11982f00f53e17bb8704 |
| 20260201103000 | brand_voice | supabase/migrations/20260201103000_brand_voice.sql | 2550 | a288b56d299b4c6e57bb618b2f2022f43e35b6587a4eaa9fe37859be1f2ce8c5 | a288b56d299b4c6e57bb618b2f2022f43e35b6587a4eaa9fe37859be1f2ce8c5 |
| 20260201113000 | review_replies_history | supabase/migrations/20260201113000_review_replies_history.sql | 970 | 9af7ad44714b54f93974b6b25611ead3dc9efcf73da5cdd70cee8789e008910c | 9af7ad44714b54f93974b6b25611ead3dc9efcf73da5cdd70cee8789e008910c |
| 20260201120000 | brand_voice_locations | supabase/migrations/20260201120000_brand_voice_locations.sql | 959 | 254de1558cd1e410f764848fe861ad05a0b796b973c72f8e55a59c7464e70c10 | 254de1558cd1e410f764848fe861ad05a0b796b973c72f8e55a59c7464e70c10 |
| 20260201121000 | automation_workflows_location_ids | supabase/migrations/20260201121000_automation_workflows_location_ids.sql | 93 | 75985e41fa13f0466d73532ad86bc0353f3368e7bd4d6a392648d5f5561d7c87 | 75985e41fa13f0466d73532ad86bc0353f3368e7bd4d6a392648d5f5561d7c87 |
| 20260201123000 | perf_indexes | supabase/migrations/20260201123000_perf_indexes.sql | 338 | 6bd2b934b989b9d493e098ad9d353334e63765ed8ce155a8baec7b87e36bb4cd | 6bd2b934b989b9d493e098ad9d353334e63765ed8ce155a8baec7b87e36bb4cd |
| 20260201124000 | user_roles | supabase/migrations/20260201124000_user_roles.sql | 3148 | 695e9deafa0f5d2876a82715cc925e7c6f15abdb8c007f64f42e026679ca68f8 | 695e9deafa0f5d2876a82715cc925e7c6f15abdb8c007f64f42e026679ca68f8 |
| 20260201125500 | job_queue | supabase/migrations/20260201125500_job_queue.sql | 1899 | 6d96e18f1531f05c98824773221a4985d5661bbb466b60ce77366c4387e75cff | 6d96e18f1531f05c98824773221a4985d5661bbb466b60ce77366c4387e75cff |
| 20260201130000 | google_sync_last_synced | supabase/migrations/20260201130000_google_sync_last_synced.sql | 185 | 125ad41161d0f29815cf4b358fd7b11f771e3a7c61f697d07a5dbad18d74abe4 | 125ad41161d0f29815cf4b358fd7b11f771e3a7c61f697d07a5dbad18d74abe4 |
| 20260201132000 | business_settings_active_locations | supabase/migrations/20260201132000_business_settings_active_locations.sql | 988 | 95ea8e50c54ea1da825545507236a1d06563bacd8ad8fc3249185acbc460cf75 | 95ea8e50c54ea1da825545507236a1d06563bacd8ad8fc3249185acbc460cf75 |
| 20260201150000 | reports | supabase/migrations/20260201150000_reports.sql | 3985 | 99c0b8f3a5fb6cd88a58c1526d1db9a1411ade3148a4306132a303e0a7f87f21 | 99c0b8f3a5fb6cd88a58c1526d1db9a1411ade3148a4306132a303e0a7f87f21 |
| 20260201160000 | reports_render_mode | supabase/migrations/20260201160000_reports_render_mode.sql | 186 | b5d749f47df9364e02e54d2073442b0d8bf309a767f09ede2d36e6634f27c3cd | b5d749f47df9364e02e54d2073442b0d8bf309a767f09ede2d36e6634f27c3cd |
| 20260201181000 | team_members | supabase/migrations/20260201181000_team_members.sql | 3588 | c017f17e4e66b4c97532b6c78220d393d01782b14b135f92530e358f5cd0b259 | c017f17e4e66b4c97532b6c78220d393d01782b14b135f92530e358f5cd0b259 |
| 20260214100000 | business_settings_monthly_report_enabled | supabase/migrations/20260214100000_business_settings_monthly_report_enabled.sql | 497 | 7b0210b3c502d2750fa751040d03188d14a164bfcbda62f24890b8056c536087 | 7b0210b3c502d2750fa751040d03188d14a164bfcbda62f24890b8056c536087 |
| 20260214103000 | reports_rendered_emailed_at | supabase/migrations/20260214103000_reports_rendered_emailed_at.sql | 183 | f9294e4eed6c083fc7048467ad52cee12647caacf8273acc4fb1c99d1f60fba7 | f9294e4eed6c083fc7048467ad52cee12647caacf8273acc4fb1c99d1f60fba7 |
| 20260214110000 | team_members_monthly_report_opt_in | supabase/migrations/20260214110000_team_members_monthly_report_opt_in.sql | 465 | cbceff4a43ade2f8ef0c650599a778ec8ae173c11a88f8ab705a15b5bd8efa59 | cbceff4a43ade2f8ef0c650599a778ec8ae173c11a88f8ab705a15b5bd8efa59 |
| 20260214140000 | team_invitations | supabase/migrations/20260214140000_team_invitations.sql | 3070 | c59f10b9e16812c706875a21f52951d044760a115add8f72b75095c889456e0d | c59f10b9e16812c706875a21f52951d044760a115add8f72b75095c889456e0d |
| 20260214160000 | alerts | supabase/migrations/20260214160000_alerts.sql | 760 | e13cd2e7fb8269fa30a5ead6438f7324f3f5a1f85b36bf3ad4182a1ce7456a2a | e13cd2e7fb8269fa30a5ead6438f7324f3f5a1f85b36bf3ad4182a1ce7456a2a |
| 20260214162000 | alerts_last_notified_at | supabase/migrations/20260214162000_alerts_last_notified_at.sql | 72 | fc9f01f313efad5f4a220b533eaac93d1a6495bf15dd19f7469613ff47fc1adc | fc9f01f313efad5f4a220b533eaac93d1a6495bf15dd19f7469613ff47fc1adc |
| 20260215120000 | legal_entities | supabase/migrations/20260215120000_legal_entities.sql | 2596 | 97ff04a2bbe445af42d979561a9bef9ee10ea2c6c159cfa6467a0cc07411dcbd | 97ff04a2bbe445af42d979561a9bef9ee10ea2c6c159cfa6467a0cc07411dcbd |
| 20260215120500 | google_locations_legal_entity | supabase/migrations/20260215120500_google_locations_legal_entity.sql | 370 | 91991b6c81689ded09b598a95f3f6762ee1624c057ace377abfa81dff30d17ce | 91991b6c81689ded09b598a95f3f6762ee1624c057ace377abfa81dff30d17ce |
| 20260215121000 | brand_assets_bucket | supabase/migrations/20260215121000_brand_assets_bucket.sql | 2664 | 39eff5d66210c2335ee258822949e473a6c08ac2bec6ff868c752e0ce4e6a088 | 39eff5d66210c2335ee258822949e473a6c08ac2bec6ff868c752e0ce4e6a088 |
| 20260215190000 | brand_voice_rls | supabase/migrations/20260215190000_brand_voice_rls.sql | 932 | 3b5278ae860179049e49482c36c8e997aa113f04191abafaa1ff28c8c03df687 | 3b5278ae860179049e49482c36c8e997aa113f04191abafaa1ff28c8c03df687 |
| 20260215200000 | competitive_monitoring_settings | supabase/migrations/20260215200000_competitive_monitoring_settings.sql | 333 | 521e780fc0d66155d170f53b0c69ee3ec49010345f6dd4ad3fedceb231091b20 | 521e780fc0d66155d170f53b0c69ee3ec49010345f6dd4ad3fedceb231091b20 |
| 20260215200500 | competitors | supabase/migrations/20260215200500_competitors.sql | 1611 | 1e315df2bd3132f8f2085a1933bf3ce13910b2f37d48a131e649554eb844098e | 1e315df2bd3132f8f2085a1933bf3ce13910b2f37d48a131e649554eb844098e |
| 20260215201500 | google_locations_coords | supabase/migrations/20260215201500_google_locations_coords.sql | 188 | ed238a96e2c45360505bf2d9648f13585e6c3087292e13cb8fd80777ca796cb6 | ed238a96e2c45360505bf2d9648f13585e6c3087292e13cb8fd80777ca796cb6 |
| 20260215202000 | generated_reports | supabase/migrations/20260215202000_generated_reports.sql | 629 | 237553e8620147d83ad88ec6021bd272622759cb853b6977e4e21acdeee9a14a | 237553e8620147d83ad88ec6021bd272622759cb853b6977e4e21acdeee9a14a |
| 20260215220147 | remote_schema | supabase/migrations/20260215220147_remote_schema.sql | 196 | b970b56ba45829ad960db4cfcaa43e69c0360ac2daf9cec37275143334baee4e | b970b56ba45829ad960db4cfcaa43e69c0360ac2daf9cec37275143334baee4e |
| 20260215223247 | remote_schema | supabase/migrations/20260215223247_remote_schema.sql | 172 | 846069bb488e4400153aa35ab3296905b52769a0feed4019272897484c4ca16a | 846069bb488e4400153aa35ab3296905b52769a0feed4019272897484c4ca16a |
| 20260216093653 | review_replies_unified | supabase/migrations/20260216093653_review_replies_unified.sql | 149 | a161f8b27ed4b8b21ec10d7cb5bc748474b48c24952eee181020e0d0c125ab3a | a161f8b27ed4b8b21ec10d7cb5bc748474b48c24952eee181020e0d0c125ab3a |
| 20260218120000 | rls_automations_alerts | supabase/migrations/20260218120000_rls_automations_alerts.sql | 3932 | 9e35b6726197692b64d91ec068ef9b9df3bfbf3d3baa7e7ee4be8b2d0928edcb | 9e35b6726197692b64d91ec068ef9b9df3bfbf3d3baa7e7ee4be8b2d0928edcb |
| 20260218123000 | fix_security_definer_views | supabase/migrations/20260218123000_fix_security_definer_views.sql | 1828 | 9f248420c4f2a046088eb09597344e359ca4b179211fd33d86a362a0a274ee1b | 9f248420c4f2a046088eb09597344e359ca4b179211fd33d86a362a0a274ee1b |
| 20260218124000 | enable_rls_user_tables | supabase/migrations/20260218124000_enable_rls_user_tables.sql | 2051 | 41406d7cd390e9cf5fb19f16e2503edc97763b0ef98d4549e8a733c754d957d6 | 41406d7cd390e9cf5fb19f16e2503edc97763b0ef98d4549e8a733c754d957d6 |
| 20260218125000 | fix_cron_state_select | supabase/migrations/20260218125000_fix_cron_state_select.sql | 403 | b34d11afd5583a86eba120d20d856e54cdf65859f2ffef13e38756017bab0a98 | b34d11afd5583a86eba120d20d856e54cdf65859f2ffef13e38756017bab0a98 |
| 20260218131000 | alerts_unique_workflow_review | supabase/migrations/20260218131000_alerts_unique_workflow_review.sql | 449 | 0a1da9779d34df6e523b10ccecbf2f723121c4a0c5551eb7f2e6919cba14f72d | 0a1da9779d34df6e523b10ccecbf2f723121c4a0c5551eb7f2e6919cba14f72d |
| 20260218132000 | alerts_enrich | supabase/migrations/20260218132000_alerts_enrich.sql | 812 | 04a1aac03f2d5ee259f6ef396faa22f94eab1f6faf0159847ca10ad5e640ce12 | 04a1aac03f2d5ee259f6ef396faa22f94eab1f6faf0159847ca10ad5e640ce12 |
| 20260219100000 | ai_run_history | supabase/migrations/20260219100000_ai_run_history.sql | 504 | c6b08e31642172256a5ab270c436aee7c061ab880fb89832f97093ac884f0b6d | c6b08e31642172256a5ab270c436aee7c061ab880fb89832f97093ac884f0b6d |
| 20260219101000 | ai_run_history_enrich | supabase/migrations/20260219101000_ai_run_history_enrich.sql | 1183 | 44ae71581888f3147984696c902dd5a6d6143a5b4d51bd72f86840c54d75d7e4 | 44ae71581888f3147984696c902dd5a6d6143a5b4d51bd72f86840c54d75d7e4 |
| 20260219112000 | ai_run_history_duration | supabase/migrations/20260219112000_ai_run_history_duration.sql | 446 | 1a910ad4315e6c7f5652c236b513ee275910a8d608f7ccfcacbfeeef468d7939 | 1a910ad4315e6c7f5652c236b513ee275910a8d608f7ccfcacbfeeef468d7939 |
| 20260219120000 | ai_run_history_rls | supabase/migrations/20260219120000_ai_run_history_rls.sql | 613 | db558bb724c54d7e4b648fee00df61b2f0d23ae8ba1d8ec83af9b7bf1f27eb72 | db558bb724c54d7e4b648fee00df61b2f0d23ae8ba1d8ec83af9b7bf1f27eb72 |
| 20260219123000 | automation_rules_schema | supabase/migrations/20260219123000_automation_rules_schema.sql | 1600 | c15a92f7d667f6bf8e93995b27f9e6b000d5c6e58eacaef9476c07d0aff526d4 | c15a92f7d667f6bf8e93995b27f9e6b000d5c6e58eacaef9476c07d0aff526d4 |
| 20260219124500 | fix_cron_state_rls | supabase/migrations/20260219124500_fix_cron_state_rls.sql | 2168 | 457aa8eb142864583d7a8d931ba08c31730292a4928d74d92af59cbc7a8529d2 | 457aa8eb142864583d7a8d931ba08c31730292a4928d74d92af59cbc7a8529d2 |
| 20260219130000 | ai_jobs_queue | supabase/migrations/20260219130000_ai_jobs_queue.sql | 2154 | 50733ccc4603c21f0378305f9d30b3f54f787f3e663e2a1b78af2aee3679f42e | 50733ccc4603c21f0378305f9d30b3f54f787f3e663e2a1b78af2aee3679f42e |
| 20260219133000 | drop_alerts_unique_rule_per_review | supabase/migrations/20260219133000_drop_alerts_unique_rule_per_review.sql | 145 | f94a5f52e6fdee93579e4834db8456060166766f73695f7e665fa1f6c0affab2 | f94a5f52e6fdee93579e4834db8456060166766f73695f7e665fa1f6c0affab2 |
| 20260219140000 | user_profiles | supabase/migrations/20260219140000_user_profiles.sql | 374 | 4aeb19befa7fe1830262decf57a413f4ffb60e7ee09a478cb21eb467118e31f6 | 4aeb19befa7fe1830262decf57a413f4ffb60e7ee09a478cb21eb467118e31f6 |
| 20260219141000 | business_settings_monthly_report_enabled | supabase/migrations/20260219141000_business_settings_monthly_report_enabled.sql | 185 | 585c6812842b31da702e6621afb0eee3f09fe940ce9af4b83f32d6230d9e48be | 585c6812842b31da702e6621afb0eee3f09fe940ce9af4b83f32d6230d9e48be |
| 20260219143000 | monthly_report_email_guard | supabase/migrations/20260219143000_monthly_report_email_guard.sql | 776 | 3951cec17fc8affcdcc445bf0c195f66b7f09340ad3e00d13b5dc5f9ccd8ed6d | 3951cec17fc8affcdcc445bf0c195f66b7f09340ad3e00d13b5dc5f9ccd8ed6d |
| 20260220120000 | review_ai_replies | supabase/migrations/20260220120000_review_ai_replies.sql | 857 | 0bf7972cd94734f1836295dab3e32222c7014635005325b00f9f5b2a7a18b6cc | 0bf7972cd94734f1836295dab3e32222c7014635005325b00f9f5b2a7a18b6cc |
| 20260220123000 | user_profiles_rls | supabase/migrations/20260220123000_user_profiles_rls.sql | 944 | bd5e0b68639f795144b55fd1be44a5c03e49fd34f831411a04117d409f82fa88 | bd5e0b68639f795144b55fd1be44a5c03e49fd34f831411a04117d409f82fa88 |
| 20260220130000 | ai_draft_runs | supabase/migrations/20260220130000_ai_draft_runs.sql | 974 | a62b2e32a02d410e6c8aaf4bd7ea8a01caad479016f405bada0d091c8c37ddb3 | a62b2e32a02d410e6c8aaf4bd7ea8a01caad479016f405bada0d091c8c37ddb3 |
| 20260220143000 | ai_draft_runs_cooldown | supabase/migrations/20260220143000_ai_draft_runs_cooldown.sql | 453 | ff344d4f775856e9a5c8ba6d52d5c5cdf5d5da9bd5a4c8dde55eb36fdb850408 | ff344d4f775856e9a5c8ba6d52d5c5cdf5d5da9bd5a4c8dde55eb36fdb850408 |
| 20260220144000 | user_profiles_grants | supabase/migrations/20260220144000_user_profiles_grants.sql | 556 | f62ad5838aea8acc4cb634cc815c20e74c661b98efc1888d2f9654df61fc89e5 | f62ad5838aea8acc4cb634cc815c20e74c661b98efc1888d2f9654df61fc89e5 |
| 20260220145000 | user_profiles_user_id_unique | supabase/migrations/20260220145000_user_profiles_user_id_unique.sql | 97 | f516e7eebbe753cedbb6bb09957d11e1c879c8915e3faac1227903c8dffbd223 | f516e7eebbe753cedbb6bb09957d11e1c879c8915e3faac1227903c8dffbd223 |
| 20260220146000 | user_profiles_rls_fix | supabase/migrations/20260220146000_user_profiles_rls_fix.sql | 1260 | c3b1e992323817bd33f831619b63c1085ac2d494cbc880d6eaf71620fdb830d2 | c3b1e992323817bd33f831619b63c1085ac2d494cbc880d6eaf71620fdb830d2 |
| 20260220150000 | user_profiles_trigger | supabase/migrations/20260220150000_user_profiles_trigger.sql | 2797 | 1ad7d5e06b3702e6db8092de2bcc841a02c2bd952f5f1d5c9bbfe5dab838b33d | 1ad7d5e06b3702e6db8092de2bcc841a02c2bd952f5f1d5c9bbfe5dab838b33d |
| 20260220151000 | ai_jobs_pending_idx | supabase/migrations/20260220151000_ai_jobs_pending_idx.sql | 107 | f451728ed4dee1a27f36255feb5ec39ec4f42364798bc68d2f17e83eeca2a050 | f451728ed4dee1a27f36255feb5ec39ec4f42364798bc68d2f17e83eeca2a050 |
| 20260220152000 | claim_review_analyze_jobs | supabase/migrations/20260220152000_claim_review_analyze_jobs.sql | 765 | af8d82a36b8e91bfd692ba5e0692c00e7100ad922a89ab4714738f4340360429 | af8d82a36b8e91bfd692ba5e0692c00e7100ad922a89ab4714738f4340360429 |
| 20260220153000 | claim_review_analyze_jobs_grants | supabase/migrations/20260220153000_claim_review_analyze_jobs_grants.sql | 192 | f7d62cf6d6e95bdf70ce8bd242680536dca4889e1f168f19e5774b7d2218034b | f7d62cf6d6e95bdf70ce8bd242680536dca4889e1f168f19e5774b7d2218034b |
| 20260220154000 | fix_claim_review_analyze_jobs | supabase/migrations/20260220154000_fix_claim_review_analyze_jobs.sql | 800 | 52246434a68de14595577a5b90e34593008b2973bf4eecdcd58014de58f927a3 | 52246434a68de14595577a5b90e34593008b2973bf4eecdcd58014de58f927a3 |
| 20260220155000 | review_replies_unified | supabase/migrations/20260220155000_review_replies_unified.sql | 1075 | c3b153f9e484f119e703d6484a922bb5558ce2294085f9d537eb1a8d0d9c3d7e | c3b153f9e484f119e703d6484a922bb5558ce2294085f9d537eb1a8d0d9c3d7e |
| 20260220160000 | google_sync_runs | supabase/migrations/20260220160000_google_sync_runs.sql | 2539 | 0b9200635227c37c6ce9b4d9d6bbb4d021532666f72c1818dc0c9f38ba33e38a | 0b9200635227c37c6ce9b4d9d6bbb4d021532666f72c1818dc0c9f38ba33e38a |
| 20260221103000 | review_ai_replies_identity_hash | supabase/migrations/20260221103000_review_ai_replies_identity_hash.sql | 697 | d748c9b26db58f0c23ca8f8d3af3b769d1bd455fb90696c71a7e70b352c3e40e | d748c9b26db58f0c23ca8f8d3af3b769d1bd455fb90696c71a7e70b352c3e40e |
| 20260221121500 | brand_voice_unique_scope | supabase/migrations/20260221121500_brand_voice_unique_scope.sql | 790 | c2493a238cbeb349db5161fec8fb85a11b209102c499d88f642c27490187875a | c2493a238cbeb349db5161fec8fb85a11b209102c499d88f642c27490187875a |
| 20260221133000 | reviews_to_reply_pipeline | supabase/migrations/20260221133000_reviews_to_reply_pipeline.sql | 3716 | 05d9fd3c6fabfbe9fad2b46cd14c15a25fabc06f6479637b37f3ff6036fc1b72 | 05d9fd3c6fabfbe9fad2b46cd14c15a25fabc06f6479637b37f3ff6036fc1b72 |
| 20260221152000 | inbox_reviews_rpc | supabase/migrations/20260221152000_inbox_reviews_rpc.sql | 3735 | b06b6bd3b29e35a88743bdfd4134adc417a969798b8c4cdc68db6e12bfd2cef2 | b06b6bd3b29e35a88743bdfd4134adc417a969798b8c4cdc68db6e12bfd2cef2 |
| 20260221173000 | fix_rpc_location_and_review_pk | supabase/migrations/20260221173000_fix_rpc_location_and_review_pk.sql | 12935 | ef6cd22fb48d85f15f07c3522a3646446cea42220e073458356d604805712824 | ef6cd22fb48d85f15f07c3522a3646446cea42220e073458356d604805712824 |
| 20260221191500 | fix_rpc_inbox_and_to_reply | supabase/migrations/20260221191500_fix_rpc_inbox_and_to_reply.sql | 7185 | 3e415c9b35148e5d4a31ced646cdaf4155adf0eea13eef6ac53fd52b8d6c83c6 | 3e415c9b35148e5d4a31ced646cdaf4155adf0eea13eef6ac53fd52b8d6c83c6 |
| 20260221193000 | remote_history_placeholder | supabase/migrations/20260221193000_remote_history_placeholder.sql | 562 | 3d96840638c706033e4c6e4a6e0b1bfd44843fe6b9b3a1e5db959487dc0b4e0c | 3d96840638c706033e4c6e4a6e0b1bfd44843fe6b9b3a1e5db959487dc0b4e0c |
| 20260221194500 | fix_rpc_inbox_to_reply_definitive | supabase/migrations/20260221194500_fix_rpc_inbox_to_reply_definitive.sql | 9891 | 52a5a6a89a98729eb6e72417512172335b45f6ff19898a42f68df93cf1a1ab5f | 52a5a6a89a98729eb6e72417512172335b45f6ff19898a42f68df93cf1a1ab5f |
| 20260618181806 | loyalty_wallet | supabase/migrations/20260618181806_loyalty_wallet.sql | 25414 | dc4e82dad2eb511384103bf72ff46b87969f93928446ea9e45a68691fc39e6a3 | dc4e82dad2eb511384103bf72ff46b87969f93928446ea9e45a68691fc39e6a3 |
| 20260618182223 | fix_join_loyalty_program_wallet_conflict | supabase/migrations/20260618182223_fix_join_loyalty_program_wallet_conflict.sql | 4111 | 3440e4ded50534dab256079d684def898faf2318252d9a733cd26b3456a64224 | 3440e4ded50534dab256079d684def898faf2318252d9a733cd26b3456a64224 |
| 20260618190424 | loyalty_wallet_public_token_scan | supabase/migrations/20260618190424_loyalty_wallet_public_token_scan.sql | 5599 | a9e40ca96ce0a2de3fc89ceeed1861f25dc46a9035bf175d6f885e07c70a9815 | a9e40ca96ce0a2de3fc89ceeed1861f25dc46a9035bf175d6f885e07c70a9815 |
| 20260624202328 | dedupe_legacy_alerts | supabase/migrations/20260624202328_dedupe_legacy_alerts.sql | 1355 | 39b63bc9b63df17f5e8b78e667fa746bba5e351e7bfb7bd18c1e56c62459adf5 | 39b63bc9b63df17f5e8b78e667fa746bba5e351e7bfb7bd18c1e56c62459adf5 |
| 20260624202329 | alerts_unique_legacy_rule_review | supabase/migrations/20260624202329_alerts_unique_legacy_rule_review.sql | 624 | a96b0fe63d86d239fe6feb40c03e02c676e4de05f28016a7177aaaa5ffe9c600 | a96b0fe63d86d239fe6feb40c03e02c676e4de05f28016a7177aaaa5ffe9c600 |
| 20260624202330 | operational_logs_retention_30d | supabase/migrations/20260624202330_operational_logs_retention_30d.sql | 2728 | 75b493357c62b0942da82f4d03c0d0354fe4154c9734e3dde09b99ed34840201 | 75b493357c62b0942da82f4d03c0d0354fe4154c9734e3dde09b99ed34840201 |
| 20260625125725 | secure_review_ai_replies_audit_rls | supabase/migrations/20260625125725_secure_review_ai_replies_audit_rls.sql | 4800 | 07a8aa811c463ca1b05022292f23340f5c63f01305cbcb0b2b1ec3aa2fe7f190 | 07a8aa811c463ca1b05022292f23340f5c63f01305cbcb0b2b1ec3aa2fe7f190 |
| 20260704213544 | approved_high_confidence_indexes | supabase/migrations/20260704213544_approved_high_confidence_indexes.sql | 1967 | e802eb2e3c609bf2e24c0204e239ac31ae74a03322d8a409b22a5e0cc1314410 | e802eb2e3c609bf2e24c0204e239ac31ae74a03322d8a409b22a5e0cc1314410 |
| 20260711120000 | supabase_egress_guardrails | supabase/migrations/20260711120000_supabase_egress_guardrails.sql | 7587 | 7535b250bb569f029ddf1f89bd907252259efbb57eabfc6b9ad4e4854a78e847 | 7535b250bb569f029ddf1f89bd907252259efbb57eabfc6b9ad4e4854a78e847 |
| 20260712120000 | secure_claim_review_analyze_jobs | supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql | 473 | a0cefdffdd4283d92f7a0e5b331f10c8474807a29824c5e0a77869e4ef55b491 | a0cefdffdd4283d92f7a0e5b331f10c8474807a29824c5e0a77869e4ef55b491 |

### Historique distant complet retourné

| Version | Nom | Présence |
| --- | --- | --- |
| 20251228124145 | google_connections | présente |
| 20251228194500 | google_gbp_tables | présente |
| 20251228195500 | google_reviews | présente |
| 20251231120000 | business_memory | présente |
| 20251231140000 | review_replies | présente |
| 20260101000000 | google_reviews_rls | présente |
| 20260101001000 | google_connections_oauth_state | présente |
| 20260105090000 | google_oauth_states | présente |
| 20260105093000 | google_oauth_states_expires_at | présente |
| 20260106114914 | google_reviews_add_raw_jsonb | présente |
| 20260106115555 | google_reviews_add_raw_jsonb | présente |
| 20260106120512 | google_reviews_location_name_default | présente |
| 20260107130000 | review_ai_insights | présente |
| 20260115093000 | google_reviews_schema_hardening | présente |
| 20260116113628 | google_reviews_columns_align | présente |
| 20260116180000 | ai_tag_candidates_rpc | présente |
| 20260116200000 | kpi_summary_rpc | présente |
| 20260116203000 | kpi_summary_filters | présente |
| 20260116204500 | reviews_source_time_index | présente |
| 20260201090000 | automations_mvp | présente |
| 20260201103000 | brand_voice | présente |
| 20260201113000 | review_replies_history | présente |
| 20260201120000 | brand_voice_locations | présente |
| 20260201121000 | automation_workflows_location_ids | présente |
| 20260201123000 | perf_indexes | présente |
| 20260201124000 | user_roles | présente |
| 20260201125500 | job_queue | présente |
| 20260201130000 | google_sync_last_synced | présente |
| 20260201132000 | business_settings_active_locations | présente |
| 20260201150000 | reports | présente |
| 20260201160000 | reports_render_mode | présente |
| 20260201181000 | team_members | présente |
| 20260214100000 | business_settings_monthly_report_enabled | présente |
| 20260214103000 | reports_rendered_emailed_at | présente |
| 20260214110000 | team_members_monthly_report_opt_in | présente |
| 20260214140000 | team_invitations | présente |
| 20260214160000 | alerts | présente |
| 20260214162000 | alerts_last_notified_at | présente |
| 20260215120000 | legal_entities | présente |
| 20260215120500 | google_locations_legal_entity | présente |
| 20260215121000 | brand_assets_bucket | présente |
| 20260215190000 | brand_voice_rls | présente |
| 20260215200000 | competitive_monitoring_settings | présente |
| 20260215200500 | competitors | présente |
| 20260215201500 | google_locations_coords | présente |
| 20260215202000 | generated_reports | présente |
| 20260215220147 | remote_schema | présente |
| 20260215223247 | remote_schema | présente |
| 20260216093653 | review_replies_unified | présente |
| 20260218120000 | rls_automations_alerts | présente |
| 20260218123000 | fix_security_definer_views | présente |
| 20260218124000 | enable_rls_user_tables | présente |
| 20260218125000 | fix_cron_state_select | présente |
| 20260218131000 | alerts_unique_workflow_review | présente |
| 20260218132000 | alerts_enrich | présente |
| 20260219100000 | ai_run_history | présente |
| 20260219101000 | ai_run_history_enrich | présente |
| 20260219112000 | ai_run_history_duration | présente |
| 20260219120000 | automation_rules_schema | présente |
| 20260219123000 | fix_cron_state_rls | présente |
| 20260219124500 | fix_cron_state_rls | présente |
| 20260219130000 | drop_alerts_unique_rule_per_review | présente |
| 20260219133000 | user_roles_is_admin | présente |
| 20260219140000 | user_profiles | présente |
| 20260219141000 | business_settings_monthly_report_enabled | présente |
| 20260219143000 | monthly_report_email_guard | présente |
| 20260220120000 | review_ai_replies | présente |
| 20260220123000 | user_profiles_rls | présente |
| 20260220130000 | ai_draft_runs | présente |
| 20260220143000 | ai_draft_runs_cooldown | présente |
| 20260220144000 | user_profiles_grants | présente |
| 20260220145000 | user_profiles_user_id_unique | présente |
| 20260220146000 | user_profiles_rls_fix | présente |
| 20260220150000 | user_profiles_trigger | présente |
| 20260220151000 | ai_jobs_pending_idx | présente |
| 20260220152000 | claim_review_analyze_jobs | présente |
| 20260220153000 | claim_review_analyze_jobs_grants | présente |
| 20260220154000 | fix_claim_review_analyze_jobs | présente |
| 20260220155000 | review_replies_unified | présente |
| 20260220160000 | google_sync_runs | présente |
| 20260221103000 | review_ai_replies_identity_hash | présente |
| 20260221121500 | brand_voice_unique_scope | présente |
| 20260221133000 | reviews_to_reply_pipeline | présente |
| 20260221152000 | inbox_reviews_rpc | présente |
| 20260221173000 | fix_rpc_location_and_review_pk | présente |
| 20260221191500 | fix_rpc_inbox_and_to_reply | présente |
| 20260221193000 | fix_rpc_ai_jobs_user_filter | présente |
| 20260221194500 | fix_rpc_inbox_to_reply_definitive | présente |
| 20260618181806 | loyalty_wallet | présente |
| 20260618182223 | fix_join_loyalty_program_wallet_conflict | présente |
| 20260618190424 | loyalty_wallet_public_token_scan | présente |
| 20260624202328 | dedupe_legacy_alerts | présente |
| 20260624202329 | alerts_unique_legacy_rule_review | présente |
| 20260624202330 | operational_logs_retention_30d | présente |
| 20260625125725 | secure_review_ai_replies_audit_rls | présente |
| 20260704213544 | approved_high_confidence_indexes | présente |
| 20260711120000 | supabase_egress_guardrails | présente |

## Evidence et limites

- Les empreintes locales portent sur les octets exacts et leur variante LF uniquement ; aucune empreinte distante n’est disponible.
- Les résultats de catalogue sont agrégés et ne contiennent aucune ligne de table applicative.
- Le rapport ne contient ni secret, ni token, ni valeur d’environnement, ni payload, ni donnée utilisateur.
- Une revue indépendante Work est requise avant toute décision de reprise ou tout Goal R3.
