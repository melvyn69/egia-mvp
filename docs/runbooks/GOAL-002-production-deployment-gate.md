# GOAL-002 — Gate de déploiement production

Ce runbook prépare uniquement un futur Run explicitement autorisé. Il ne
constitue pas une autorisation de mutation.

## Cibles exactes

- Supabase : projet `fhadiwkdznhuxtlgrwfd`, nom `egia-mvp`,
  environnement production.
- Vercel : projet `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT`, nom `egia`.
- Source : branche `main`, arbre propre, commit fusionné de la PR #35.

Toute divergence d'identité, de branche, de commit ou de projet arrête le Run.

## 0. Gate d'intégration Git préalable

Le préflight passif du `2026-07-16` confirme que le projet Vercel est connecté
au dépôt GitHub, que `main` est sa branche de production et qu'aucun gate
d'auto-déploiement n'est configuré. Dans cet état, un push de la branche PR
crée un Preview et une fusion vers `main` crée un déploiement Production.

Avant tout push du candidat, une autorisation fondatrice séparée doit permettre
uniquement l'ajout versionné suivant dans `vercel.json`, limité à la branche PR
et à `main` :

```json
{
  "git": {
    "deploymentEnabled": {
      "security/goal-002-production-validation": false,
      "main": false
    }
  }
}
```

Conserver ce gate pendant la fusion, puis vérifier passivement qu'aucun
déploiement Preview ou Production n'a été créé pour les nouveaux SHA. Toute
création de déploiement arrête le Run. Le déploiement Vercel de production
reste manuel et soumis au gate ci-dessous.

## 1. Préflight passif obligatoire

1. Vérifier que le ledger Supabase contient exactement une entrée
   `20260712120000_secure_claim_review_analyze_jobs` et aucune entrée
   `20260713073853_production_security_hardening`.
2. Exécuter localement le migration-history guard et le bootstrap plan-only.
   La chaîne prospective doit proposer uniquement
   `20260713073853_production_security_hardening.sql`.
3. Consigner `supabase --version` et exiger `2.67.1`, version déjà validée par
   le gate GOAL-005 pour le dry-run et le push transactionnel. Toute autre
   version exige une revalidation locale du dry-run avant ce Run.
4. Vérifier qu'un mécanisme de récupération récent est disponible
   (PITR ou sauvegarde), sans lancer de restauration.
5. Vérifier par nom et portée, sans lire les valeurs, les variables listées
   plus bas.
6. Vérifier que les objets exclusivement prospectifs sont tous absents avant
   le `db push`. Un objet présent sans entrée ledger indique une application
   partielle ou manuelle et arrête le Run :

```sql
select
  (to_regclass('public.security_rate_limits') is not null)::int
    as security_rate_limits_present,
  (to_regclass('public.loyalty_enrollment_requests') is not null)::int
    as loyalty_enrollment_requests_present,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_security_rate_limit',
        'finalize_loyalty_enrollment'
      )
  ) as prospective_functions_present,
  (
    select count(*)
    from pg_constraint
    where conname in (
      'loyalty_programs_scope_unique',
      'loyalty_members_scope_unique',
      'loyalty_members_program_scope_fk',
      'loyalty_visits_member_scope_fk',
      'loyalty_rewards_member_scope_fk',
      'wallet_passes_member_scope_fk'
    )
  ) as prospective_constraints_present;
```

7. Exécuter les requêtes passives suivantes. Chaque compteur doit être `0`.

### Assets de marque

```sql
with brand_rows as (
  select
    le.id,
    le.business_id,
    le.logo_path,
    le.logo_url,
    o.name as object_name,
    lower(coalesce(o.metadata ->> 'mimetype', '')) as mime_type,
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else null
    end as object_size
  from public.legal_entities le
  left join storage.objects o
    on o.bucket_id = 'brand-assets'
   and o.name = le.logo_path
)
select
  count(*) filter (
    where logo_path is null and nullif(btrim(logo_url), '') is not null
  ) as legacy_url_only,
  count(*) filter (
    where logo_path is not null
      and logo_path !~ (
        '^business/' || business_id::text ||
        '/legal_entities/' || id::text || '/logo\.(png|jpg|webp)$'
      )
  ) as noncanonical_path,
  count(*) filter (
    where logo_path is not null and object_name is null
  ) as missing_object,
  count(*) filter (
    where logo_path is not null
      and mime_type not in ('image/png', 'image/jpeg', 'image/webp')
  ) as unsupported_mime,
  count(*) filter (
    where logo_path is not null
      and (object_size is null or object_size > 3145728)
  ) as invalid_size
from brand_rows;
```

Si un compteur est non nul, ne déployer ni migration, ni Edge Function, ni
Vercel. Préparer un Run distinct autorisant la copie contrôlée des logos
historiques vers `brand-assets`, leur vérification binaire, la mise à jour
canonique de `logo_path`, puis rejouer ce préflight. Aucun fallback distant
`logo_url` ne doit être réintroduit.

### Intégrité relationnelle fidélité

```sql
select 'loyalty_visits' as relation, count(*) as violations
from public.loyalty_visits child
left join public.loyalty_members member
  on member.id = child.member_id
 and member.program_id = child.program_id
 and member.user_id = child.user_id
 and member.location_id = child.location_id
where member.id is null
union all
select 'loyalty_rewards', count(*)
from public.loyalty_rewards child
left join public.loyalty_members member
  on member.id = child.member_id
 and member.program_id = child.program_id
 and member.user_id = child.user_id
 and member.location_id = child.location_id
where member.id is null
union all
select 'wallet_passes', count(*)
from public.wallet_passes child
left join public.loyalty_members member
  on member.id = child.member_id
 and member.program_id = child.program_id
 and member.user_id = child.user_id
 and member.location_id = child.location_id
where member.id is null;
```

Vérifier également le scope membre → programme :

```sql
select count(*) as loyalty_member_program_scope_violations
from public.loyalty_members member
left join public.loyalty_programs program
  on program.id = member.program_id
 and program.user_id = member.user_id
 and program.location_id = member.location_id
where program.id is null;
```

Si une relation contient une violation, arrêter avant mutation. Une décision
fondatrice distincte devra choisir entre correction de données synthétiques
identifiées, désactivation de la capacité concernée ou investigation
complémentaire. Aucune suppression automatique n'est autorisée.

## 2. Mutations autorisables, ordre strict

1. Exécuter `supabase db push --linked --dry-run` depuis le commit approuvé.
   Le résultat doit contenir uniquement
   `20260713073853_production_security_hardening.sql`.
2. Exécuter `supabase db push --linked`, sans `--include-all`,
   `--include-seed`, `--include-roles` ni `migration repair`.
3. Relire le ledger et le catalogue avant tout déploiement applicatif.
4. Déployer les Edge Functions depuis le même commit, dans cet ordre :
   1. `supabase functions deploy process-review-analyze --project-ref fhadiwkdznhuxtlgrwfd --no-verify-jwt`;
   2. `supabase functions deploy generate-reply --project-ref fhadiwkdznhuxtlgrwfd`;
   3. `supabase functions deploy google_oauth_exchange --project-ref fhadiwkdznhuxtlgrwfd`;
   4. `supabase functions deploy google_oauth_start --project-ref fhadiwkdznhuxtlgrwfd`;
   5. `supabase functions deploy google_gbp_sync_locations --project-ref fhadiwkdznhuxtlgrwfd`;
   6. `supabase functions deploy google_gbp_sync_all --project-ref fhadiwkdznhuxtlgrwfd`;
   7. `supabase functions deploy post-reply-google --project-ref fhadiwkdznhuxtlgrwfd`.
   Après chaque commande, capturer l'ID/version. Le post-check doit établir
   `verify_jwt = true` pour les six fonctions utilisateur et
   `verify_jwt = false` uniquement pour `process-review-analyze`, dont
   `PROCESS_REVIEW_ANALYZE_SECRET` reste obligatoire.
5. Depuis le checkout propre du commit fusionné, vérifier que
   `.vercel/project.json` contient exactement
   `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`, capturer l'ID du déploiement
   production précédent, puis exécuter une construction distante unique avec
   `vercel deploy --prod --yes`. Capturer l'URL et l'ID retournés. Ne pas
   utiliser `vercel promote`, `--prebuilt` ni un artefact d'un autre commit.
6. Créer les deux comptes Auth synthétiques, les deux tenants, les lieux,
   programmes fidélité et données minimales portant le préfixe `GOAL002_SYNTH`.
   Ces fixtures sont conservées pour les vérifications répétables ; aucune
   suppression automatique n'est prévue dans ce Run.
7. Exécuter les parcours synthétiques autorisés ci-dessous. Ils peuvent créer
   uniquement des inscriptions, membres, Wallet, invitations, uploads,
   rapports et lignes d'Evidence rattachés aux fixtures `GOAL002_SYNTH`.
8. Ne modifier aucun cron, secret, variable, domaine ou autre configuration
   pendant ce Run, sauf autorisation explicite ajoutée au Founder Brief.

La migration précède le code : elle ferme immédiatement l'ancien RPC
d'inscription anonyme. Le parcours fidélité peut donc être temporairement
indisponible entre la migration et Vercel, mais aucune capacité ne peut être
émise sans preuve e-mail pendant cette fenêtre.

## 3. Variables requises — noms uniquement

### Supabase / Edge Functions — obligatoires

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `AUTOMATION_REPLY_URL` ou `APP_URL` ou `VERCEL_URL`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PROCESS_REVIEW_ANALYZE_SECRET`
- `INTERNAL_API_KEY`

### Supabase / Edge Functions — optionnelles ou avec défaut

- `ALLOWED_ORIGIN` : optionnelle si `APP_BASE_URL` est la bonne origine.
- `ALLOWED_ORIGINS` : optionnelle ; nécessaire pour toute origine autorisée
  absente de l'allowlist versionnée.
- `AI_USER_REQUESTS_PER_HOUR` : optionnelle, défaut applicatif `60`.

### Vercel — obligatoires

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRON_SECRET`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `INTERNAL_API_KEY`
- `APPLE_PASS_TYPE_IDENTIFIER`
- `APPLE_TEAM_IDENTIFIER`
- `APPLE_PASS_CERTIFICATE`
- `APPLE_PASS_PRIVATE_KEY`
- `APPLE_WWDR_CERTIFICATE`
- `APP_PUBLIC_URL` ou `APP_BASE_URL`

### Vercel — optionnelles ou avec défaut

- `OPENAI_MODEL`
- `OPENAI_REPLY_MODEL`
- `AI_USER_REQUESTS_PER_HOUR`
- `APPLE_PASS_CERTIFICATE_PASSWORD`

Une variable obligatoire absente, mal portée ou attachée à un autre projet
arrête le Run. Les valeurs ne sont jamais consignées dans les Evidence.

## 4. Vérifications post-migration

Avant les déploiements applicatifs, vérifier passivement :

- ledger : `20260713073853` présente une fois ;
- 43 tables `public`, toutes avec RLS ;
- 3 vues `security_invoker` ;
- 14 fonctions `SECURITY DEFINER`, toutes avec configuration fixée ;
- `join_loyalty_program`, `finalize_loyalty_enrollment` et
  `consume_security_rate_limit` exécutables seulement par `service_role` ;
- six contraintes de scope fidélité présentes et validées ;
- aucune mutation directe `authenticated` sur `wallet_passes`, et aucune
  insertion directe sur `loyalty_visits` ou mutation de `loyalty_rewards` ;
- bucket `brand-assets` privé, limite 3 Mio, MIME PNG/JPEG/WebP.

Toute divergence arrête le Run avant Edge/Vercel.

## 5. Tests synthétiques autorisables

Créer ou utiliser uniquement :

- deux comptes synthétiques dédiés `A` et `B` ;
- deux tenants synthétiques dédiés `Tenant A` et `Tenant B` ;
- deux lieux Google synthétiques ou mocks dédiés ;
- deux adresses de réception e-mail de test contrôlées ;
- aucune donnée, adresse ou identité client.

Parcours :

1. A lit ses données et ne lit/modifie aucune donnée de B.
2. A ne peut ni référencer le membre fidélité de B, ni obtenir son Wallet.
3. Une nouvelle adresse et une adresse membre existante reçoivent le même
   accusé avant vérification.
4. Avant clic e-mail : aucune carte, QR, code membre ou capacité Wallet.
5. Après clic : création pour la nouvelle adresse, récupération stable pour
   l'existante, puis jeton rejeté à la seconde utilisation.
6. Invitation : HTML inoffensif, domaine canonique, quotas `429`, acceptation
   impossible avec le mauvais compte.
7. OpenAI : quota partagé entre route Vercel et Edge Function, sans corps
   fournisseur ni identifiant métier dans les logs.
8. Upload : PNG/JPEG/WebP valide sous 3 Mio accepté ; type, signature ou taille
   invalide refusé.
9. Rapports/e-mails : logo CID et PDF présents, sans URL privée expirante.
10. Cron :
    - absence ou mauvais secret renvoie `403` pour les trois routes ;
    - succès uniquement pour
      `/api/cron/ai/tag-reviews?location_id=<GOAL002_SYNTH_LOCATION>` et
      `/api/cron/monthly-reports?run_for_user=<GOAL002_SYNTH_USER>` ;
    - `/api/cron/google/sync-replies` est vérifié passivement seulement. Une
      invocation valide pourrait réclamer des travaux globaux ou appeler
      Google pour des tenants réels et reste interdite sans autorisation
      fondatrice distincte.

Evidence : identifiants synthétiques redigés, horodatage, commit et deployment
IDs, statuts HTTP, compteurs SQL, en-têtes, captures sans token, et résultats
nouveau/existant. Aucun corps contenant une donnée ou un secret n'est exporté.

## 6. Conditions d'arrêt

- identité projet/commit différente ;
- dry-run proposant autre chose que la migration autorisée ;
- compteur asset ou fidélité non nul ;
- variable requise absente ou mauvaise portée ;
- migration non atomique, ledger inattendu, contrainte non validée ;
- erreur 5xx persistante, échec auth, fuite inter-tenant ou capacité avant
  vérification e-mail ;
- corps Google/OpenAI/Resend, token, secret ou donnée métier dans une réponse
  ou un log ;
- déploiements Edge et Vercel provenant de commits différents.

## 7. Récupération

- Si le `db push` échoue : arrêter. La migration PostgreSQL doit rester
  atomique ; ne pas réparer le ledger et ne pas exécuter de SQL partiel.
- Après migration réussie, ne jamais restaurer les grants publics historiques,
  désactiver RLS, retirer les contraintes de scope ou rendre `brand-assets`
  public.
- Si une Edge Function échoue : arrêter les suivantes et redéployer la version
  approuvée corrigée. Un retour à l'ancienne fonction n'est autorisé que pour
  rétablir le service sans rouvrir une capacité publique connue.
- Si Vercel échoue : utiliser le rollback Vercel vers le dernier déploiement
  stable, conserver la migration restrictive et considérer la fidélité
  publique indisponible jusqu'au roll-forward corrigé.
- Toute correction de donnée, secret, configuration, grant, policy ou fonction
  SQL après arrêt exige une nouvelle autorisation fondatrice.

## 8. Evidence de clôture

- commit `main` et PR #35 fusionnée ;
- dry-run exact puis ledger à 99 entrées ;
- inventaires RLS/vues/fonctions/grants/contraintes/bucket ;
- IDs des sept déploiements Edge et du déploiement Vercel, tous liés au même
  commit ;
- identifiants redigés des fixtures `GOAL002_SYNTH`, confirmation de leur
  rétention et absence de toute donnée client ;
- résultats des tests synthétiques A/B et fidélité one-shot ;
- vérification des en-têtes HTTP, cron, erreurs et logs redigés ;
- revue post-production indépendante sans P0/P1 ;
- déclaration explicite qu'aucun compte ou donnée client n'a été utilisé.
