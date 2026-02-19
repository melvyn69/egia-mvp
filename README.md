# EGIA MVP — Inbox Avis (Google) + Génération + Réponses

Ce repo contient le MVP EGIA : synchronisation des avis Google Business Profile, inbox de traitement, génération de réponses (IA) et envoi des réponses sur Google.

## ✅ Ce qui fonctionne (v0.1 stable)
- Sync des avis Google (pagination) → Supabase `google_reviews`
- Affichage Inbox (filtres statut + lieu)
- Génération de réponse via Edge Function `generate-reply`
- Sauvegarde de brouillon dans `review_replies`
- Envoi de la réponse sur Google via Edge Function `post-reply-google`
- Historique des réponses / brouillons
- Mapping des lieux via `google_locations.location_title`

Tag stable : `v0.1-inbox-sync-stable`
Branche stable : `release/v0.1-stable`

---

## Architecture (haut niveau)

### Frontend (Vercel)
- App React + TypeScript
- Page principale : `src/pages/Inbox.tsx`
- Interaction Supabase :
  - `supabase.auth.getSession()` pour récupérer le JWT user
  - lecture tables (PostgREST)
  - appels Edge Functions (`supabase.functions.invoke`)

### Backend (Supabase)
- Postgres (tables + RLS)
- Auth (Google login via Supabase)
- Edge Functions :
  - `generate-reply`
  - `post-reply-google`
- DB migrations : `supabase/migrations/*`

### API Sync (Vercel route)
- Endpoint : `POST /api/google/gbp/reviews/sync`
- Vérifie le JWT Supabase
- Charge `google_locations` de l’utilisateur
- Pour chaque location :
  - appelle l’API Google Reviews (pagination)
  - mappe les champs
  - upsert dans `google_reviews`

### Cron Sync (source of truth)
- Endpoint : `POST /api/cron/google/sync-replies`
- Protégé par secret (header `Authorization: Bearer <CRON_SECRET>` ou `?secret=...`)
- Synchronise les replies Google → `google_reviews` + `review_replies`
- Recommandé: cron-job.org toutes les 10 minutes

---

## Modèle de données (tables principales)

### `google_locations`
Stocke les lieux Google d’un utilisateur.
Champs typiques :
- `user_id`
- `account_resource_name` (ex: `accounts/1085...`)
- `location_resource_name` (ex: `locations/1116...`)
- `location_title` (nom lisible)

### `google_reviews`
Stocke les avis Google synchronisés.
Champs typiques :
- `user_id`
- `review_id` (id Google si dispo)
- `review_name` (NOT NULL)
- `location_id` (ex: `locations/...`)
- `location_name` (NOT NULL, default `''`)
- `author_name`, `rating`, `comment`
- `create_time`, `update_time`
- `status` : `new | reading | replied | archived`
- (optionnel) `raw` jsonb (recommandé)

### `review_replies`
Stocke brouillons et réponses envoyées.
- `review_id` (référence `google_reviews.id`)
- `reply_text`

---

## Maintenance
- `npm run clean:weirdfiles -- --dry-run` (prévisualise les fichiers “-X/-H” à la racine)
- `npm run clean:weirdfiles` (supprime ces fichiers à la racine)
- `status`: `draft | sent`
- `created_at`, `sent_at`

### `business_settings` / `business_memory`
Contexte IA :
- `business_id` (UUID)
- signature, tone/length par défaut
- mémoire active (notes)

⚠️ Important : `business_id` est un UUID. Le frontend doit envoyer un UUID (pas `locations/...`).

---

## Installation locale

### Prérequis
- Node.js
- Supabase CLI
- Un projet Supabase configuré
- Variables d’environnement (Vercel/local)

### Install
```bash
npm install
npm run dev
```

## Demo checklist (Google onboarding)

1. Connecte-toi dans l'app puis ouvre `/connect`.
2. Clique `Lancer la connexion Google`.
3. Clique `Importer mes etablissements`.
4. Verifie la progression par etablissement et les erreurs eventuelles.
5. Si besoin, clique `Retry failed` (relance uniquement les etablissements en erreur).

Commandes utiles:

```bash
# Smoke onboarding (locations + sync 1 location + logs runs)
BASE_URL=http://localhost:3000 JWT=<jwt_supabase_user> npm run smoke:google-onboarding

# (optionnel) forcer une location
BASE_URL=http://localhost:3000 JWT=<jwt_supabase_user> LOCATION_ID=locations/123 npm run smoke:google-onboarding
```

## Debug SQL (reviews to reply / drafts)

Important: l'éditeur SQL Supabase n'injecte pas `$1/$2` dans une requête ad-hoc. Les placeholders fonctionnent dans une FUNCTION/RPC.

Requête debug (valeurs littérales) pour lister les reviews à traiter:

```sql
select
  gr.id,
  gr.user_id,
  gr.location_id,
  gr.review_id,
  gr.comment,
  gr.owner_reply,
  gr.create_time,
  gr.update_time
from public.google_reviews gr
where gr.user_id = '00000000-0000-0000-0000-000000000000'::uuid
  and gr.location_id = 'locations/1111111111111111111'
  and nullif(btrim(coalesce(gr.comment, '')), '') is not null
  and nullif(btrim(coalesce(gr.owner_reply, '')), '') is null
  and coalesce(gr.create_time, gr.update_time, gr.created_at) >= now() - interval '180 days'
  and not exists (
    select 1
    from public.review_ai_replies rar
    where rar.review_id = gr.id
      and coalesce(rar.mode, 'draft') = 'draft'
      and coalesce(rar.status, 'draft') in ('draft', 'queued', 'processing', 'generating')
  )
  and not exists (
    select 1
    from public.ai_jobs aj
    where aj.type = 'review_analyze'
      and coalesce(aj.payload->>'review_id', '') = gr.id::text
      and coalesce(aj.payload->>'location_id', '') = coalesce(gr.location_id, '')
      and aj.status in ('queued', 'pending', 'processing', 'generating')
  )
order by coalesce(gr.update_time, gr.create_time, gr.created_at) desc, gr.id desc
limit 20;
```

Contrôle direct `google_reviews` (location + owner_reply manquant):

```sql
select
  count(*) as missing_owner_reply_total
from public.google_reviews
where location_id = 'locations/1116485163914248460'
  and (owner_reply is null or btrim(owner_reply) = '');
```

Si votre schéma utilise `location_resource_name` au lieu de `location_id`, utilisez:

```sql
select
  count(*) as missing_owner_reply_total
from public.google_reviews
where location_resource_name = 'locations/1116485163914248460'
  and (owner_reply is null or btrim(owner_reply) = '');
```

Exemple d'appel RPC:

```sql
select *
from public.get_reviews_to_reply(
  p_location_id := 'locations/1111111111111111111',
  p_limit := 20,
  p_lookback_days := 180,
  p_user_id := '00000000-0000-0000-0000-000000000000'::uuid,
  p_review_id := null
);
```

Exemple d'appel inbox listing:

```sql
select *
from public.get_inbox_reviews(
  'locations/1116485163914248460',
  50,
  false,
  180
);
```

Exemple d'appel génération (éligibles uniquement):

```sql
select *
from public.get_reviews_to_reply(
  'locations/1116485163914248460',
  50,
  180
);
```

Breakdown debug (missing_owner_reply_total / already_has_draft / eligible_to_generate):

```sql
with inbox as (
  select *
  from public.get_inbox_reviews(
    'locations/1116485163914248460',
    500,
    false,
    180
  )
)
select 'missing_owner_reply_total' as metric, count(*)::bigint as value from inbox
union all
select 'already_has_draft' as metric, count(*)::bigint as value from inbox where has_draft
union all
select 'eligible_to_generate' as metric, count(*)::bigint as value from inbox where is_eligible_to_generate;
```

Vérifier qu'il n'y a pas de doublons de drafts:

```sql
select
  review_id,
  mode,
  count(*) as row_count
from public.review_ai_replies
group by review_id, mode
having count(*) > 1;
```

Vérifier une liste ciblée de reviews:

```sql
select *
from public.get_reviews_to_reply(
  p_location_id := 'locations/1111111111111111111',
  p_limit := 50,
  p_lookback_days := 180,
  p_user_id := '00000000-0000-0000-0000-000000000000'::uuid,
  p_review_id := null
)
where review_pk::text in (
  '77f24fce-0000-0000-0000-000000000000',
  'f2565d0e-0000-0000-0000-000000000000',
  '1086485f-0000-0000-0000-000000000000'
);
```

## Cron-job.org

Créer un job POST:
- URL: `https://<votre-domaine>/api/cron/google/sync-replies?secret=<CRON_SECRET>`
- Fréquence: toutes les 10 minutes

Générer un secret:
```bash
openssl rand -hex 24
```

Test local:
```bash
curl -i -X POST "http://localhost:3000/api/cron/google/sync-replies?secret=<CRON_SECRET>"
```

Settings Module – Architecture & Features (V1)
1) Vue d’ensemble de l’architecture
Frontend : React + TypeScript (pages Settings, sous-pages Entreprise / Mon Profil)
Backend : Vercel Serverless Functions, un seul endpoint /api/settings
Supabase : Auth, DB, Storage
Principe clé : routing par action dans /api/settings (pattern action-based)
2) Rôle de /api/settings
Endpoint unique pour toutes les opérations Settings V1
Chaque action est identifiée via action (query ou body)
Permet de limiter la surface API et respecter les limites Vercel Hobby
3) Convention API (obligatoire)
Action obligatoire sur chaque appel :
GET /api/settings?action=...
POST /api/settings avec body { action: "..." }
Réponse standard :
{ "ok": true, "data": { ... }, "requestId": "..." }
Erreur standard :
{ "ok": false, "error": { "message": "...", "code": "..." }, "requestId": "..." }
requestId : présent sur toutes les réponses pour corrélation logs
4) Features implémentées (V1)
4.1 Mon Profil
Lecture profil via action=profile_get
Mise à jour du nom via action=profile_update
Provider Google : affichage informatif, pas de gestion mot de passe côté EGIA
Fallback si team_members absent :
Profil dérivé du JWT (email + full_name si dispo)
4.2 Entreprise / Entités légales
Listing : action=legal_entities_list
Création / mise à jour : action=legal_entities_upsert / alias legal_entities_update
Définition par défaut : action=legal_entities_set_default
Suppression : action=legal_entities_delete
Refus si entité par défaut unique
4.3 Upload logo
Upload côté serveur uniquement : action=legal_entities_logo_upload
Service role obligatoire pour Storage
Preview via signed URL (durée courte, côté frontend)
5) Sécurité
Client Supabase user : utilisé pour lire le contexte auth (email, provider)
Client Supabase admin : réservé au backend, service-role uniquement
Storage : upload via backend pour éviter RLS sur Storage côté frontend
Évitement RLS frontend : aucune écriture directe dans Storage depuis le client
6) Observabilité & Debug
requestId systématique dans les réponses
Logs Vercel : scope + requestId + erreurs Supabase
Logs Supabase :
Postgres : erreurs RLS, contraintes
Storage : erreurs d’upload, droits insuffisants
7) Versioning
Tag : settings-v1-stable
Objectif : stabilité fonctionnelle et surface API minimale
8) Notes de design importantes
team_members.first_name stocke le nom complet
last_name volontairement non utilisé (colonne absente)
Endpoint unique /api/settings pour limiter les fonctions Vercel et garder un contrat stable
