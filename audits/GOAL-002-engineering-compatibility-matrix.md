# GOAL-002 — Matrice de compatibilité de production

Date : `2026-07-16`

Cette matrice a été vérifiée exclusivement sur la stack Supabase locale
loopback, reconstruite par le bootstrap canonique GOAL-005. Les deux tenants,
deux utilisateurs, deux lieux, deux avis et deux programmes fidélité portent
des identifiants synthétiques dédiés. Aucun projet, compte ou datum distant
n'a été consulté ou muté.

## Verdict

Le déploiement progressif sans fenêtre n'est pas sûr. Ni `cb82cc...` ni
`7fad679...` ne constituent un rollback autorisé après la migration :

- `cb82cc...` dépend de grants retirés et délivre une capacité fidélité avant
  preuve e-mail sur la base actuelle ;
- `7fad679...` exige les primitives SQL de la migration et conserve une
  régression produit : ses boutons manuels d'analyse IA appellent le cron avec
  un JWT utilisateur et reçoivent `403`.

La stratégie retenue est une fenêtre contrôlée, suivie d'un roll-forward vers
le correctif enfant de `7fad679...`. La fenêtre est protégée par deux artefacts
prévalidés : maintenance Vercel globale et sept Edge Functions safe-deny.

## Matrice exacte

| État | Application / backend | Résultat fidélité | Crons et fonctions | Compatibilité |
| --- | --- | --- | --- | --- |
| 1 | `cb82cc5495...` + base actuelle | `join_loyalty_program` anonyme réussit et retourne immédiatement membre, QR et Wallet. | Le cron IA accepte soit `CRON_SECRET`, soit un JWT admin. Les autres routes planifiées utilisent leur contrat historique; `/api/reports/automations` distingue secret global et JWT utilisateur tenant-scoped. | Fonctionnel, mais vulnérable et non acceptable. |
| 2 | `cb82cc5495...` + `20260713073853`, avant `20260716142352` | L'ancien RPC anonyme est refusé. Les lectures anciennes de `legal_entities.logo_url` sont refusées. Aucune capacité fidélité ne fuit. | `claim_ai_tag_candidates` conserve sa résolution `digest` défectueuse. `process-review-analyze` reste obligatoirement safe-deny; aucune ancienne fonction privilégiée n'est un rollback autorisé. | État `HARDENING_ONLY`, incompatible et fail-closed. Acceptable uniquement derrière maintenance jusqu'au roll-forward GOAL-006. |
| 3 | `cb82cc5495...` + base actuelle + sept nouvelles Edge Functions | Le frontend ancien continue son RPC fidélité vulnérable tant que la migration n'est pas appliquée. | `generate-reply` sécurisé échoue en `503` car `consume_security_rate_limit` est absent. Les deux OAuth doivent être basculées ensemble après un drain de dix minutes. Les cinq autres fonctions sont compatibles avec le schéma actuel, mais cet état mixte n'est pas un steady state autorisé. | Transition seulement, sous maintenance et bornée. |
| 4 | `7fad67914...` + base actuelle | `/api/loyalty/join` échoue en `503` avant tout e-mail, membre ou Wallet car le quota SQL est absent. | Les boutons manuels IA appellent encore `/api/cron/ai/tag-reviews` avec un JWT utilisateur et reçoivent `403`. | Incompatible ; aucun déploiement de cet état n'est autorisé. |
| 5 | `7fad67914...` + les deux migrations + sept nouvelles Edge Functions | Nouvelle/existante reçoivent le même `202`; aucune capacité avant preuve; création/récupération après preuve; replay rejeté. | `claim_ai_tag_candidates` est corrigée et les crons secret-only sont compatibles, mais les boutons manuels IA restent cassés. | Sécurité compatible, produit non approuvé. Le release final doit être le correctif enfant. |
| 6 | Release réconcilié GOAL-002 + GOAL-006 + les deux migrations + sept Edge sécurisées | Même comportement one-shot validé que l'état 5. | L'action manuelle passe par `/api/reviews?action=queue_analysis`; le claim IA utilise `extensions.digest`; les crons globaux restent réservés à `CRON_SECRET`. | Seul état final autorisable. |

## États intermédiaires de production

| État intermédiaire | Durée maximale | Fidélité | Crons / OAuth / Edge | Détection d'incompatibilité |
| --- | ---: | --- | --- | --- |
| Production actuelle, avant gate | aucune mutation | Ancien comportement vulnérable encore présent. | Vérification passive des quatre cibles cron-job.org exactes, sans les invoquer. | Préflight passif seulement. |
| Quatre crons suspendus | 2 min | Comportement applicatif inchangé. | L'API cron-job.org applique uniquement `enabled=false`, dans l'ordre Google, IA, automatisations, rapports; aucune configuration Vercel/Supabase n'est modifiée. | Exactement une tâche `POST` en timezone `Europe/Paris` par URL et schedule observés; snapshot redigé + hash immuable; aucune tâche active. |
| Maintenance Vercel active, backend actuel | 2 min avant début du safe-deny | Toute nouvelle navigation et toute route Vercel renvoient `503`; un bundle frontend déjà chargé peut encore appeler directement Supabase. | Les crons cron-job.org reçoivent `503`; les anciennes Edge restent présentes très brièvement. | HTTP `/`, `/api/loyalty/join` et les quatre routes cron attendues = `503`, `Retry-After: 120`. |
| Maintenance + cinq Edge critiques safe-deny, base actuelle | 5 min | L'ancien RPC anonyme existe encore, mais aucun nouveau frontend n'est servi. | `process-review-analyze`, `generate-reply`, `post-reply-google`, `google_oauth_start`, `google_oauth_exchange` = `503`; aucun nouvel état OAuth. | Statut `503` et code `GOAL002_SAFE_DENY` pour chacune. |
| Maintenance + migration de durcissement seule | état nominal transitoire; 8 min max si récupération | L'ancien RPC est fermé; aucune capacité avant preuve possible. | État `HARDENING_ONLY`; `process-review-analyze` reste safe-deny et le claim IA n'est pas autorisé. | Ledger `20260713073853`, invariants de durcissement et vecteur GOAL-006 préflight; seul le roll-forward vers `20260716142352` est permis. |
| Maintenance + deux migrations | 5 min de post-check | L'ancien frontend reste bloqué; le backend one-shot et les frontières SQL sont prêts. | Crons toujours `503`; `claim_ai_tag_candidates` qualifié, borné et service-role-only. | Deux ledgers, `search_path=pg_catalog`, `extensions.digest`, ACL et probe SQL `GOAL002_SYNTH`. |
| Maintenance + sept Edge safe-deny + base durcie | jusqu'à expiration du drain OAuth, 10 min depuis le safe-deny OAuth | Fermée sauf via le futur parcours vérifié, qui n'est pas encore servi. | Tous les appels Edge mutateurs renvoient `503`; crons `503`. | Aucun nouvel état OAuth; attente de dix minutes complètes. |
| Maintenance + sept Edge sécurisées + base durcie | 14 min maximum | Backend compatible avec le parcours one-shot. | Déploiement et vérification d'une fonction à la fois; le reste demeure safe-deny. | Version/`verify_jwt`, `401/403/405`, absence de `500` et probes synthétiques sans fournisseur réel. |
| Release correctif actif | 10 min de smoke tests | Nouvelle/existante indistinguables avant e-mail; capacités après preuve seulement. | Action IA manuelle tenant-scoped; les quatre crons restent suspendus jusqu'à leur reprise contrôlée un par un. | HTTP, A/B, quotas, logs redigés, compteurs SQL et absence de fuite inter-tenant. |

L'ordre safe-deny est unique : cinq fonctions privilégiées/fournisseur/OAuth
avant migration, puis `google_gbp_sync_locations` et `google_gbp_sync_all`
après le post-check de migration. Le Run attend exactement trois déploiements
Vercel Production : maintenance, release sécurisé manuel, puis réactivation
Git automatique.

La durée maximale d'indisponibilité Vercel est de 49 minutes si l'unique
roll-forward `HARDENING_ONLY` est requis. La pause cron maximale, suspension
et reprise contrôlée incluses, est de 59 minutes. Une
étape qui dépasse son plafond ne déclenche jamais un rollback ancien :
maintenance et safe-deny restent actifs pendant le diagnostic ou le
roll-forward.

## Evidence locale reproductible

Baseline locale :

```bash
npx tsx scripts/test-goal-002-compatibility-matrix.ts baseline
```

Résultat attendu :

```json
{
  "old_app_current_db": "compatible_but_insecure_immediate_capability",
  "new_app_current_db": "fail_closed_503_missing_security_primitives",
  "manual_ai": "tenant_scoped_queue",
  "cron": "secret_only",
  "recovery_artifacts": "503_fail_closed"
}
```

Après application locale, dans l'ordre, de
`20260713073853_production_security_hardening.sql` puis
`20260716142352_fix_claim_ai_tag_candidates_digest.sql` :

```bash
npx tsx scripts/test-goal-002-compatibility-matrix.ts hardened
```

Résultat attendu :

```json
{
  "old_app_hardened_db": "functionally_incompatible_fail_closed",
  "new_app_hardened_db": "compatible_verified_email_before_capability",
  "existing_member_disclosure": "indistinguishable_before_email_proof",
  "manual_ai": "tenant_scoped_queue",
  "cron": "secret_only",
  "recovery_artifacts": "503_fail_closed"
}
```

Le test SQL d'abus complet s'exécute ensuite avec `ROLLBACK`. Le typage Deno
porte sur les sept fonctions sécurisées et les sept variantes safe-deny.

## Point d'arrêt et première mutation

- Dernier point exact où un arrêt sans récupération est possible : après le
  préflight passif, la construction locale des trois artefacts, la validation
  de leur provenance et le dry-run Supabase, immédiatement avant la suspension
  des quatre tâches cron-job.org.
- Première mutation matérielle de production : suspension des quatre tâches
  cron-job.org identifiées par leur URL et leur schedule exacts.
- À partir de cette mutation, `cb82cc...`, `7fad679...` sans correctif et toute
  ancienne Edge Function sont interdits comme récupération.

## Hotfix de récupération disponible

Le hotfix est versionné et ne restaure aucune capacité vulnérable :

1. `recovery/goal-002/vercel-maintenance`
   - une fonction répond `503` à toute route ;
   - API en JSON générique, interface en HTML statique ;
   - `Cache-Control: no-store`, `Retry-After: 120`;
   - aucun accès Supabase, secret métier ou fournisseur.
2. `recovery/goal-002/edge-safe-deny`
   - sept fonctions portant exactement les noms de production ;
   - `OPTIONS 204`, toute autre méthode `503 GOAL002_SAFE_DENY`;
   - aucun client Supabase, aucun RPC, aucun appel Google/OpenAI ;
   - paramètres `verify_jwt` identiques au contrat sécurisé.

Le roll-forward déterministe conserve ces artefacts. Avant le release sécurisé,
il permet seulement l'unique seconde migration depuis `HARDENING_ONLY`. Après
le release, une erreur conserve le nouveau code et les safe-deny; un hotfix ou
un deployment supplémentaire exige une nouvelle autorisation. Il ne modifie ni
RLS, ni grants, ni policies, ni données et ne réintroduit jamais une ancienne
version.
