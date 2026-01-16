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

