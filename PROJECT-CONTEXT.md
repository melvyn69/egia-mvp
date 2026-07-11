# Project Context — EGIA

> **Statut :** contexte opérationnel ANES initial.
> **Établi le :** `2026-07-11`, à partir du contenu versionné et de la configuration locale du dépôt. Il décrit le réel observable dans le dépôt ; il ne constitue pas un audit de préparation ni une preuve de l'état des services distants.

## Périmètre produit durable

EGIA est une application web destinée à centraliser l'exploitation d'avis Google Business Profile : connexion Google, synchronisation des établissements et avis, traitement dans une inbox, préparation de réponses assistées par IA et publication de réponses sur Google. Cette mission est décrite dans `README.md` et corroborée par les routes, les handlers et les migrations du dépôt.

Le code expose aussi des surfaces pour l'analytique, le coaching, les automatisations et alertes, les rapports, la gestion d'équipe, les paramètres d'entreprise, la fidélité et une Apple Wallet pass. Leur présence dans le code n'établit pas à elle seule leur niveau de finition ni leur disponibilité en production.

## Utilisateurs ciblés

- Utilisateurs authentifiés qui connectent un ou plusieurs établissements Google et gèrent leurs avis ; ce rôle est confirmé par les flux Google, les tables à `user_id` et les routes protégées.
- Membres d'équipe et personnes invitées ; les pages et l'API d'invitation/équipe sont présentes.
- Visiteurs du parcours public de fidélité ; une route `/loyalty/join/:publicToken` est présente.

La définition métier complète des personas, des offres, des droits par rôle et du périmètre commercial est **À confirmer** : aucune spécification produit canonique distincte n'a été trouvée.

## Fonctionnalités observables dans le dépôt

- Authentification Supabase et callback d'authentification dans le frontend.
- Connexion OAuth Google, import/synchronisation des établissements et des avis Google Business Profile.
- Inbox d'avis, filtres, brouillons/réponses IA et publication de réponses Google.
- Analytics, rapports (dont rendu PDF), alertes, automatisations, paramètres, équipe/invitations, concurrence, coaching et fidélité : routes, composants et/ou handlers correspondants sont présents.
- Tâches planifiées côté handlers : synchronisation Google, analyse IA et rapports mensuels ; les automatismes de rapports sont aussi appelés via l'API de rapports.

La couverture fonctionnelle effective, les parcours réellement reliés et la disponibilité de chaque écran sont **À confirmer** par le Goal d'audit.

## Stack technique réelle

| Couche | Éléments observés |
| --- | --- |
| Frontend | React `19`, TypeScript, Vite `7`, React Router, TanStack React Query, Tailwind CSS. |
| API serveur | Fonctions Vercel TypeScript dans `api/`; handlers partagés dans `server/_shared/`. |
| Données et identité | Supabase : Postgres, Auth, Storage, Realtime et migrations SQL dans `supabase/migrations/`. |
| Edge Functions | Fonctions Deno/Supabase dans `supabase/functions/`. |
| Génération et documents | OpenAI est référencé par les handlers ; `pdf-lib`, Puppeteer Core et Chromium sont des dépendances de rendu PDF. |
| Outillage | npm, Node.js, ESLint, TypeScript, GitHub Actions ; Node 20 est utilisé par la CI. |

Les versions et dépendances exactes sont définies par `package.json` et `package-lock.json`.

## Architecture actuelle

```text
Navigateur React/Vite
  ├─ client Supabase (JWT utilisateur, PostgREST, Edge Functions)
  └─ routes /api/* Vercel
       └─ handlers TypeScript partagés
            ├─ Supabase (client utilisateur ou service role côté serveur)
            ├─ Google Business Profile / OAuth
            ├─ OpenAI, Resend et rendu PDF selon le flux
            └─ tâches cron Google, IA et rapports

Supabase
  ├─ Auth, Postgres, RLS, Storage et Realtime
  ├─ migrations versionnées
  └─ Edge Functions Deno historiques ou parallèles aux routes Vercel
```

Les routes catch-all Vercel portent notamment les familles Google, cron, KPI et rapports. `server/_shared_dist/` est une sortie générée utilisée par plusieurs routes API ; `npm run build` construit d'abord les sources partagées. Cette sortie est ignorée par Git et ne doit pas devenir une source de vérité éditable.

## Environnements et déploiement

- Développement frontend : `npm run dev` sert Vite sur `http://localhost:5173`.
- Les routes `/api/*` ne sont pas exécutées par Vite seul ; le `README.md` indique d'utiliser Vercel local ou un déploiement de preview pour les parcours de bout en bout.
- Configuration locale Supabase : `supabase/config.toml` définit API, base, Studio, Auth, Storage et Realtime locaux. Le `project_id` local est `egia-mvp`.
- Hébergement Vercel : `vercel.json` route les familles cron, Google et rapports, puis sert l'application SPA. L'existence, les réglages et les environnements du projet Vercel distant sont **À confirmer**.
- Production, previews, domaine canonique et mécanisme effectif de promotion sont **À confirmer**. Certains Edge Functions contiennent `https://egia-six.vercel.app` parmi leurs origines autorisées, sans que cela prouve que cette URL est l'environnement de production courant.

## Supabase

- Les migrations SQL versionnées sont la source locale de vérité du schéma, des fonctions RPC, des index, des grants et des politiques RLS attendus.
- `src/database.types.ts` et `server/_shared/database.types.ts` sont les types TypeScript de base de données présents dans le dépôt ; le script `sync:db-types` copie le premier vers le second.
- Les tables visibles dans la documentation et/ou les types incluent notamment `google_connections`, `google_locations`, `google_reviews`, `review_replies`, `review_ai_replies`, `ai_jobs`, `cron_state`, `business_settings`, `business_memory`, les entités légales, équipes, alertes, automatisations et rapports.
- La configuration locale active RLS et Auth ; les migrations contiennent des politiques RLS. Leur application et leur état sur le projet Supabase distant sont **À confirmer**.
- Aucun identifiant de projet Supabase distant, aucune valeur de secret et aucun état de base distante ne sont consignés ici.

## Edge Functions

Les Edge Functions présentes sont : `generate-reply`, `post-reply-google`, `process-review-analyze`, `google_oauth_start`, `google_oauth_exchange`, `google_oauth_callback`, `google_gbp_sync_all` et `google_gbp_sync_locations`.

`google_oauth_callback` répond explicitement qu'il est déprécié et renvoie vers `google_oauth_start` et `google_oauth_exchange`. Le niveau de déploiement, l'appel effectif et le statut de maintenance de chaque Edge Function sont **À confirmer**. Les routes Vercel constituent aussi un chemin parallèle pour les flux Google et cron.

## Intégrations externes

| Intégration | Usage observable | État opérationnel |
| --- | --- | --- |
| Google Business Profile / OAuth | Connexion, établissements, avis et réponses. | À confirmer. |
| Supabase | Auth, données, fonctions, stockage et temps réel. | À confirmer pour le projet distant. |
| OpenAI | Génération/analyse de réponses et traitements IA. | À confirmer. |
| Resend | Envoi d'invitations d'équipe via `api/team.ts`. | À confirmer. |
| cron-job.org | Planification externe documentée des routes cron. | À confirmer : aucune configuration de planification distante n'est versionnée. |
| Apple Wallet | Génération de pass via `api/loyalty/apple-pass.ts` et dépendance `passkit-generator`. | À confirmer. |

## Git, CI et livraison

- Dépôt Git principal : `git@github.com:melvyn69/egia-mvp.git` (`origin`).
- Branche inspectée lors de la création de ce contexte : `main` ; dernier commit observé : `780f22c`.
- Une CI GitHub Actions déclenchée sur les pull requests et les pushes vers `main` et `release/*` exécute `npm ci`, `npm run lint` et `npm run build` avec Node 20.
- La branche `release/v0.1-stable` et le tag `v0.1-inbox-sync-stable` sont documentés dans le README. Leur existence et leur rôle actuel sont **À confirmer** lors de l'audit Git.
- Les règles de branchement, d'approbation de PR, de protection de branche, de déploiement automatique et de rollback distant sont **À confirmer**.

## Sources de vérité et documentation

| Source | Portée actuelle |
| --- | --- |
| `PROJECT-CONTEXT.md` | Contexte durable ANES de ce dépôt ; décrit les faits observés et leurs limites. |
| `goals/active/GOAL-001-egia-readiness-audit.md` | Contrat du premier audit ANES ; il ne remplace pas l'audit produit. |
| Code sous `src/`, `api/` et `server/_shared/` | Comportement applicatif et serveur actuellement versionné. |
| `package.json`, lockfile, TS/Vite/ESLint/Vercel config | Build, dépendances et routage déployable attendus. |
| `supabase/migrations/`, `supabase/config.toml`, fonctions et types | Schéma et comportements Supabase/Edge attendus dans le dépôt. |
| `.github/workflows/ci.yml` | Contrôles CI versionnés. |
| `README.md` et `docs/` | Procédures et contexte opérationnel ; à confronter au code et à la configuration pendant l'audit. |

`AGENTS.md` est absent du dépôt. Aucune policy permanente EGIA spécifique aux agents n'est donc versionnée à ce stade.

## Contraintes de sécurité

- `.env.local` est ignoré par Git. Les noms de variables locales montrent des secrets Supabase service-role, OAuth Google, OpenAI, Resend et cron ; leurs valeurs ne doivent ni être lues, ni copiées, ni incluses dans des rapports.
- Le frontend requiert `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Les opérations privilégiées sont attendues côté serveur/Edge Functions avec secret de service ; leur respect effectif doit être vérifié, non présumé.
- Les routes cron sont conçues pour contrôler `CRON_SECRET` ; leur protection réelle, leurs méthodes autorisées et les éventuelles voies alternatives doivent être auditées.
- Authentification, autorisations, multi-tenant, RLS, Storage, CORS, exposé des réponses d'erreur, journalisation et données personnelles sont dans le périmètre de sécurité du Goal GOAL-001.
- Aucun test ou audit ne doit révéler un secret, appeler un service externe avec effet, modifier des données, appliquer une migration ou déployer sans autorisation explicite.

## Éléments connus incomplets, instables ou à vérifier

- `docs/SUPABASE_EGRESS_AUDIT.md` documente des risques résiduels : requêtes de génération PDF encore dépendantes du contenu des avis, absence de filtre serveur Google par date de mise à jour, et impossibilité de confirmer l'application de migrations/`EXPLAIN` tant que Supabase est restreint.
- Le même document indique que les logs des Edge Functions historiques restent à nettoyer séparément ; cette affirmation est historique et doit être revalidée.
- Le README se présente comme un MVP v0.1 d'inbox Google, alors que le code expose un périmètre plus large. La couverture documentaire et l'état de ces fonctionnalités étendues sont **À confirmer**.
- L'état de santé des intégrations, de la CI distante, de Supabase, de Vercel et des cron externes ne peut pas être déduit du dépôt seul : **À confirmer**.

## Contradictions documentées à arbitrer

1. `README.md` recommande un cron Google toutes les 10 minutes ; `docs/SUPABASE_EGRESS_AUDIT.md` recommande pour la même route une fréquence horaire (`0 * * * *`). La fréquence effectivement configurée et la source décisionnelle applicable sont **À confirmer** avant toute modification ou réactivation.
2. Le README mentionne seulement `generate-reply` et `post-reply-google` dans sa vue backend, tandis que huit Edge Functions sont présentes. Le README est donc incomplet comme inventaire ; aucune conclusion sur les fonctions effectivement déployées ne doit en être tirée.

Cette contradiction n'empêche pas l'usage initial d'ANES : elle est explicitement couverte par les conditions d'arrêt du Goal d'audit. Elle ne justifie pas encore une modification de `AGENTS.md`.

## Limites de responsabilité : fondateur, Work et Codex

| Acteur | Responsabilité | Limite |
| --- | --- | --- |
| Fondateur | Priorités, arbitrages, validation produit et autorisations de livraison ou actions sensibles. | Ne délègue pas implicitement une décision produit, sécurité ou déploiement. |
| Work | Cadrage, comparaison des options, rédaction et revue des Goals/rapports, préparation des décisions. | Ne tranche pas seul une décision réservée au fondateur et ne modifie pas le dépôt. |
| Codex | Inspection du dépôt, exécution dans le Goal autorisé, validations, Evidence et préparation de livrables Git. | Ne change pas le produit, l'architecture, la sécurité, les sources de vérité, les données ou les environnements au-delà des autorisations ; il s'arrête face à une ambiguïté matérielle. |

Ces limites appliquent ANES Founder Edition ; elles ne prétendent pas décrire des rôles métiers propres à EGIA.

## Goals actifs

- `goals/active/GOAL-001-egia-readiness-audit.md` — `Draft` : établir l'état réel de préparation d'EGIA par un audit strictement en lecture seule.

## Historique Git

Git est la trace durable attendue des documents, changements, Evidence et livraisons. À la date de ce contexte, aucun historique de Goal ANES antérieur n'a été trouvé dans le dépôt. Les politiques de conservation des rapports, releases et déploiements distants sont **À confirmer**.
