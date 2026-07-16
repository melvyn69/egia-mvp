# GOAL-002 — Production Readiness Report

Date : `2026-07-16`

## 1. Verdict

`NOT READY`

Le dossier Engineering est réconcilié avec l’architecture ANES. Le verdict
passera à `READY FOR A SEPARATELY AUTHORIZED PRODUCTION RUN` seulement après
réexécution des validations, approbation des six revues indépendantes, CI
verte et vérification Git/Vercel finale du closeout.

## 2. Candidat figé

- **SHA applicatif immuable :**
  `73c40836b58f5663e810de70a169c39ab9627745`.
- **Relation avec `main` :** le candidat est un ancêtre de `main`. Les
  descendants autorisés après ce SHA sont limités à la documentation, aux
  protections Git/Vercel et à l’adaptation mécanique du test statique aux
  nouveaux chemins documentaires ; aucune modification applicative, migration,
  Edge Function, script opérationnel ou recovery n’est admise.
- **Frontières de contenu figées :** application React/Vercel, routes API,
  migrations Supabase, sept Edge Functions sécurisées, scripts opérationnels,
  tests et `recovery/goal-002`.
- **Migration de durcissement :**
  `e046c7de9b809c3a2ced550cba492ebeb94f66adfffbad6b29d150f71aab8404`.
- **Migration GOAL-006 :**
  `3ada406c1bc40d7d2c8b54961b61e9329025be2b9a89ec5cfb8eaabe74c44b87`.
- **Edge Functions sécurisées :**

  | Fonction | SHA-256 |
  | --- | --- |
  | `process-review-analyze` | `95ce83cecb10a77f179622bbc62aabd46514911dd4fa1c5096c1b07873b4f0d8` |
  | `generate-reply` | `020394ccf5f4888ef729fdd5f0e42018dfdcefe8550b7d03142bb5a3a252e21f` |
  | `post-reply-google` | `908fd9f805295f742f578706fc7fdea3fd5c48bc2211982e7ce599817150102e` |
  | `google_oauth_start` | `ff2373eb455e021569005c7649a37584c24e5b3ca4a3407429e790d13e7ecb96` |
  | `google_oauth_exchange` | `0a57d5125a3a1c27d2cff56f697d64addb5a995a6fe7bc0df1721db5af8c3596` |
  | `google_gbp_sync_locations` | `81d820e7f174d6dcfa5b82b9d95c1a8053a2912ce6d4c88bc83cd4b3b5f272e8` |
  | `google_gbp_sync_all` | `6f909e1a46d72c98888556d528122a1ddf7d25461e8cb86948c63e0a64ee42ac` |

Le diff final entre le candidat et `main` doit confirmer l’absence de
modification applicative dans tous les commits descendants documentaires.

## 3. Complétude Engineering

### Code et frontières de sécurité

- Authentification utilisateur par validation Supabase côté serveur.
- Autorisations tenant-scoped avant toute opération privilégiée.
- Refus IDOR sur avis, brouillons, membres, Wallet, lieux et invitations.
- RLS sur les tables applicatives exposées et vues `security_invoker`.
- RPC et fonctions `SECURITY DEFINER` avec `search_path` déterministe,
  révocations publiques et grants minimaux.
- Parcours fidélité indistinguable avant preuve d’e-mail, sans carte, QR,
  Wallet ou capacité membre avant consommation one-shot du jeton.

### Migrations

Ordre Engineering figé :

1. `20260713073853_production_security_hardening.sql`;
2. `20260716142352_fix_claim_ai_tag_candidates_digest.sql`.

La seconde migration qualifie `extensions.digest(text,text)`, fixe
`search_path=pg_catalog` et conserve `claim_ai_tag_candidates` réservé à
`service_role`.

### Edge Functions et backend

- Sept Edge Functions sécurisées.
- Sept variantes safe-deny fail-closed dans `recovery/goal-002`.
- Maintenance Vercel globale `503`.
- OAuth state consommé avant échange.
- Appels Google/OpenAI bornés, autorisés et nettoyés des corps d’erreur.
- Routes cron secret-only et action IA manuelle tenant-scoped.

### Scripts et récupération

- Migration runner à plan fermé et watchdog.
- Inspecteur de classification `BASELINE`, `ROLLED_BACK`, `HARDENING_ONLY`
  ou `COMMITTED`.
- Helper cron redigé et fail-closed.
- Probes safe-deny.
- Bootstrap canonique et migration-history guard.
- Récupération uniquement par maintien du nouveau périmètre sécurisé,
  maintenance, safe-deny ou roll-forward ; aucun ancien candidat vulnérable.

### Documentation

- Goal Engineering recadré.
- Matrice locale classée comme Evidence Engineering historique dans
  `audits/GOAL-002-engineering-compatibility-matrix.md`.
- Exactement deux artefacts de production actifs :
  ce rapport et
  `docs/production/GOAL-002-production-execution-plan.md`.

## 4. Validations

| Validation | Résultat du closeout |
| --- | --- |
| Migration-history guard | `PASSED` — 100 migrations, 5 collisions documentées, checksum baseline vérifié. |
| Bootstrap canonique plan-only et guardrails | `PASSED` — chaîne GOAL-003 → GOAL-002 → GOAL-006 et 10/10 guards. |
| Guardrails sécurité production | `PASSED` — 32/32 contrôles. |
| Guardrails GOAL-006 | `PASSED` — 10/10 contrôles SQL statiques. |
| Tests locaux | `PASSED` — garde-fous egress et suites ciblées. |
| Tests SQL isolés avec `ROLLBACK` | `PASSED` — probe GOAL-006 et test d’abus complet. |
| Matrices A/B et compatibilité synthétiques | `PASSED` — scénarios `baseline` puis `hardened` sur stack temporaire loopback distincte. |
| Tests adversariaux | `PASSED` — migration-history 29/29. |
| Helpers cron, safe-deny, runner et inspecteur | `PASSED` — self-tests redaction/drift, probe, plan fermé, timeout et classification. |
| Typecheck Node | `PASSED`. |
| Typecheck des Edge Functions | `PASSED` — sept sécurisées et sept safe-deny. |
| Lint | `PASSED` — 0 erreur ; warning préexistant `useCoachResult.ts:227`. |
| Build | `PASSED` — application et maintenance ; warnings bundle/Browserslist non bloquants. |
| Audit des dépendances complet et production | `PASSED` — 0 vulnérabilité. |
| Recherche de secrets | `PASSED` — aucune signature de credential serveur dans les fichiers suivis du périmètre. |
| CI GitHub | `PENDING` |
| `git diff --check` | `PASSED`. |

Toutes les validations sont locales, isolées ou passives. Aucun compte ou
datum client n’est utilisé.

## 5. Revues

| Revue indépendante | Verdict | Evidence |
| --- | --- | --- |
| Sécurité / data | `APPROVED` | Hashes, RLS, vues, RPC, grants, `SECURITY DEFINER`, isolation A/B et SQL avec `ROLLBACK` vérifiés. |
| Backend / produit | `APPROVED` | Routes, Edge, OAuth, OpenAI, crons, invitations, paramètres, assets et fidélité one-shot vérifiés. |
| Architecture ANES | `APPROVED` | Séparation, lifecycle, deux artefacts actifs et plan court conformes à ANES 005. |
| Cohérence Goal Engineering / Production Run | `APPROVED` | Scope, transitions, absence de `Done`/Founder Brief et matrice historique vérifiés. |
| Production-readiness Engineering | `APPROVED` | Provenance, hashes, ordre des migrations, recovery et préconditions futures vérifiés. |
| Documentation | `APPROVED` | Liens, renommages, titres, historique, AGENTS, README et harness vérifiés. |

## 6. État Git

- **Branche du closeout :** `docs/goal-002-engineering-closeout`.
- **Commit(s) :** `PENDING`.
- **Pull request :** `PENDING`.
- **CI :** `PENDING`.
- **Propreté :** à confirmer après intégration.
- **Protections Vercel héritées de `main` :**
  `security/goal-002-production-validation=false`,
  `codex/goal-006-fix-pgcrypto-digest=false`,
  `docs/goal-002-engineering-closeout=false` et `main=false`.
- **Dernier déploiement attendu inchangé :**
  `dpl_Fo9E1UgmyResT7kTm2WkE6tcxmCM`.

## 7. Préconditions d’un futur Production Run

- Goal Engineering accepté et `Done` selon ANES.
- Candidat `73c40836b58f5663e810de70a169c39ab9627745`
  inchangé.
- Production Readiness Report au verdict positif.
- Production Execution Plan inchangé.
- Projet Supabase, projet Vercel, dépôt GitHub et ordonnanceur explicitement
  identifiés.
- Présence et portée correctes des secrets requis, par nom seulement et sans
  lecture de valeur.
- Conditions d’arrêt, récupération, Evidence et payload d’autorisation
  définis dans un contrat Production Run ANES distinct.
- Autorisation explicite, datée et limitée du Founder.

Ce rapport ne contient et ne constitue aucune autorisation fondatrice.

## 8. Risques résiduels

- L’état réel de production n’est pas vérifié par ce closeout.
- Les deux migrations ne sont pas appliquées à distance.
- Les sept Edge Functions sécurisées ne sont pas déployées à distance.
- Le release Vercel sécurisé n’est pas déployé.
- Les crons, secrets, configurations, Auth, logs et données de production ne
  sont pas validés par des tests mutants.
- Les tests synthétiques distants et les Evidence post-production
  appartiennent exclusivement au futur Production Run.

Ces risques sont opérationnels. Ils ne remettent pas en cause la complétude
Engineering lorsque les validations et revues ci-dessus sont vertes.

## 9. Limite explicite

This report proves engineering readiness. It does not prove production execution or production success.
