# Audit egress Supabase — EGIA MVP

## 1. Cause racine

L'egress provenait principalement de traitements périodiques qui relisaient des ensembles très larges avant de filtrer en JavaScript. Les trois causes critiques étaient : toutes les connexions Google et jusqu'à 1 000 lieux à chaque synchronisation, l'historique complet des insights IA puis jusqu'à 2 500 avis pour chercher des candidats, et tous les utilisateurs d'automatisations avec jusqu'à 500 avis chacun. Un polling frontend relisait aussi `cron_state` toutes les 30 secondes.

## 2. Endpoints impliqués et gravité

| Gravité | Endpoint / source | Ancienne fréquence possible | Problème |
|---|---|---:|---|
| Critique | `POST /api/cron/google/sync-replies` | à chaque cron | toutes les connexions, 1 000 lieux, synchronisation générale redondante, lecture d'existence par avis |
| Critique | `POST /api/cron/ai/tag-reviews` | à chaque cron | comptes globaux, tous les insights, 2 000 couples lieu/utilisateur, pagination de 2 500 avis |
| Critique | `POST /api/reports/automations` | jusqu'à 2 fois/heure | tous les utilisateurs puis 500 avis/utilisateur, filtre du curseur en JavaScript |
| Élevé | `/api/cron/monthly-reports` | mensuel et appels manuels | N+1 par utilisateur et absence de garantie d'unicité concurrente |
| Moyen | `src/pages/Inbox.tsx` | toutes les 30 secondes par onglet | polling permanent du statut IA |
| Faible | routes interactives de rapports | à la demande | requêtes déjà à colonnes explicites, mais certaines listes restent à surveiller |

## 3. Requêtes corrigées

- `google_connections`: remplacé par `claim_google_sync_connections(5)`, atomique, éligible sur `active`, `next_sync_at` et `sync_status`.
- `google_locations`: limité à 25 et uniquement pour les utilisateurs réclamés.
- `google_reviews` Google: préchargement des 50 identités d'une page au lieu d'une lecture par avis.
- `job_queue`: claim plafonné à 50, `attempts < 5`, sans retour du `payload` JSON.
- candidats IA: `claim_ai_tag_candidates(10, version, location)` filtre et verrouille en SQL, maximum absolu 20.
- automatisations: `claim_due_automation_workflows(25)`, maximum 50; avis filtrés par `update_time > lastProcessed`, maximum 50.
- rapports mensuels: maximum absolu 20 utilisateurs et 50 lieux par utilisateur.

## 4. Ancien comportement

Une exécution sans travail pouvait tout de même transférer les connexions, lieux, insights ou avis existants. Les verrous IA basés sur lecture puis écriture n'étaient pas atomiques. Deux workers pouvaient sélectionner les mêmes jobs ou workflows. Le frontend interrogeait le statut IA 120 fois par heure pour quatre onglets ouverts.

## 5. Nouveau comportement

Une exécution sans candidat effectue un claim indexé et retourne HTTP 200 avec `processed: 0` et `reason: "no_candidates"`. Les claims utilisent `FOR UPDATE SKIP LOCKED` et changent l'état dans la même transaction. Chaque résumé de cron expose candidats, claims, lignes lues/traitées, écritures, échecs et durée; l'IA estime aussi les octets de texte manipulés.

## 6. Limites de batch

- connexions Google: défaut 5, maximum 10;
- lieux Google: 25; page Google et préchargement Supabase: 50;
- file générique: défaut 25, maximum 50, cinq tentatives;
- IA: défaut 10, maximum 20, y compris le paramètre HTTP;
- automatisations: défaut 25, maximum 50; avis: 50;
- rapports mensuels: défaut et maximum 20; lieux/utilisateur: 50.

## 7. Stratégie incrémentale et idempotence

Google utilise `last_synced_at`, `next_sync_at`, `sync_status`, `sync_claimed_at` et le curseur de page existant. L'API Business Profile v4 ne fournit pas de filtre `updatedMin` pour la liste d'avis; EGIA conserve donc un curseur de page, compare `updateTime` aux données locales préchargées et applique un backoff de six heures lorsqu'aucun avis n'est renvoyé, une heure sinon. Les tokens et avis complets ne sont pas journalisés.

L'IA calcule en SQL un SHA-256 du commentaire et de la note. Un avis n'est réclamé que si le hash, la version ou l'état le nécessite. `ai_tag_status`, `ai_tag_claimed_at`, `ai_tagged_at` et `ai_tag_version` rendent le traitement reprenable et idempotent.

Les automatisations avancent `next_run_at` de 30 minutes après traitement. Les alertes conservent leur upsert sur `(workflow_id, review_id, alert_type)`. Les rapports mensuels ont une unicité partielle `(user_id, from_date, to_date)` pour `last_month`.

## 8. Index ajoutés

- `google_connections_sync_due_idx` sur les connexions actives et au repos;
- `google_reviews_ai_due_idx` sur l'état IA et l'ordre source;
- `automation_workflows_due_idx` sur les workflows actifs à échéance;
- `reports_monthly_period_unique_idx` pour l'idempotence mensuelle.

Les index existants `job_queue_status_run_at_idx` et `ai_jobs_status_created_at_idx` sont réutilisés. Aucun index redondant n'est ajouté.

## 9. Fréquences cron à saisir dans cron-job.org

- Google — URL `/api/cron/google/sync-replies`, expression `0 * * * *` (toutes les heures).
- IA — URL `/api/cron/ai/tag-reviews`, expression `10 */2 * * *` (toutes les deux heures).
- Automatisations — URL `/api/reports/automations`, expression `20,50 * * * *` (toutes les 30 minutes, décalé).
- Rapports mensuels — URL `/api/cron/monthly-reports`, expression `0 6 1 * *` (premier jour du mois à 06:00).

Conserver la méthode POST et l'en-tête secret actuel. Ne pas placer le secret dans l'URL.

## 10. Surveillance après réactivation

1. Appliquer la migration, puis réactiver un seul cron à la fois.
2. Relever dans les logs structurés `rowsRead`, `processed`, `durationMs` et `approxBytes` pendant 24 heures.
3. Comparer quotidiennement l'egress du projet dans Supabase avec le nombre d'exécutions Vercel.
4. Vérifier qu'une période calme produit majoritairement `reason=no_candidates`.
5. Alerter si `rowsRead` atteint régulièrement une limite: cela indique un backlog, pas une raison d'augmenter le batch sans mesure.

## 11. Risques résiduels

La génération PDF lit encore les avis du mois sélectionné car elle a besoin du contenu pour le rapport; elle est bornée temporellement mais pas remplacée par une agrégation SQL. Google ne permet pas le filtrage serveur par date de mise à jour sur cet endpoint. L'application de la migration et les plans `EXPLAIN` ne sont pas vérifiables tant que Supabase est restreint; les index devront être confirmés sur une base restaurée ou réactivée. Les Edge Functions historiques ne sont pas les routes Vercel signalées, mais leurs logs de développement restent à nettoyer séparément.

## 12. Retour arrière

Revenir au commit précédent restaure les handlers. La migration est additive et peut rester en place sans modifier le métier. Pour un retrait explicite, supprimer d'abord les quatre fonctions RPC et les quatre index ajoutés, puis seulement les colonnes si elles sont vides et après sauvegarde. Ne jamais supprimer les données, tables ou politiques RLS. Les anciennes fréquences cron peuvent être remises après le rollback applicatif.
