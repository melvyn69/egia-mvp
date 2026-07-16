# GOAL-006 — Diagnostic et Evidence

## Verdict technique

La cause exacte est la combinaison suivante :

1. `pgcrypto` est installée dans le schéma `extensions`;
2. la RPC privilégiée impose `search_path=public`;
3. les deux appels à `digest` sont non qualifiés.

La résolution échoue avant que le littéral `'sha256'` de type initial
`unknown` puisse être converti vers `text`. L'extension et sa signature
`extensions.digest(text,text)` sont présentes; aucun déplacement d'extension
ni élargissement du `search_path` n'est nécessaire.

## Correctif

La migration prospective GOAL-006 :

- vérifie la présence de `extensions.digest(text,text)`;
- recrée uniquement `public.claim_ai_tag_candidates(integer,text,text)`;
- fixe `search_path=pg_catalog`;
- qualifie et type explicitement les deux appels à
  `extensions.digest(text,text)`;
- conserve le claim atomique `FOR UPDATE SKIP LOCKED`, le plafond `1..20`,
  les filtres et le retour;
- maintient `SECURITY DEFINER`;
- révoque `PUBLIC`, `anon`, `authenticated` et accorde seulement
  `service_role`.

Cette forme évite de faire confiance à `public`, `extensions` ou au
`search_path` de l'appelant dans une fonction privilégiée.

## Validations

| Validation | Résultat |
| --- | --- |
| Reproduction locale avant correctif | `digest(text, unknown) does not exist`. |
| Inventaire local | `pgcrypto` dans `extensions`; signature `digest(text,text)` présente. |
| Test statique GOAL-006 | `10/10` réussi et ajouté à la CI. |
| Test SQL transactionnel et abus | Réussi sur Supabase local : appel effectif, hash, filtre localisation, contenu inchangé/modifié, plafond 20, refus `anon`/`authenticated` et schéma attaquant; `ROLLBACK` final. |
| Lint SQL local | Aucun défaut dans les schémas `extensions` et `public`. |
| Migration-history et bootstrap | 100 migrations, 5 collisions documentées, baseline vérifiée; chaîne prospective GOAL-003 → GOAL-002 → GOAL-006; adversarial `29/29`, bootstrap guards `10/10`. |
| Tests projet et sécurité | `npm test`, sécurité production `30/30`, types Edge et `git diff --check` réussis. |
| Qualité et build | Typecheck, build et audits npm complets/production réussis; 0 vulnérabilité. Un warning lint React Hooks préexistant hors scope demeure dans `useCoachResult.ts:227`. |
| Revue indépendante | Première revue `CHANGES REQUIRED`, exigences intégrées; revue finale `APPROVED`, aucune demande ouverte. |
| Mutation distante | Aucune. |

## Verdict de revue

`APPROVED FOR MERGE`.

La revue indépendante confirme :

- la qualification des deux appels `extensions.digest`;
- le `search_path=pg_catalog`;
- la conservation de la signature et du claim atomique;
- les ACL limitées au propriétaire et à `service_role`;
- la résistance à un homonyme attaquant dans le chemin de l'appelant;
- l'absence de modification de baseline, migration gelée ou extension.

## Compatibilité et récupération

La migration est additive au ledger et remplace la définition sans changer sa
signature. `CREATE OR REPLACE FUNCTION` conserve les dépendances et le
propriétaire; les ACL attendues sont réappliquées explicitement.

GOAL-006 n'autorise pas son application en production. Une future application
doit rester intégrée au gate GOAL-002. En cas d'échec avant application,
aucune récupération distante n'est nécessaire. Après une future application,
la récupération sûre est un roll-forward qui conserve la qualification
`extensions.digest` et les révocations publiques; l'ancienne définition
défaillante ne doit pas être restaurée.

## Clôture fondatrice

GOAL-006 est clôturé `Done` le `2026-07-16`.

- PR #37 fusionnée en fast-forward;
- SHA intégré dans `main` :
  `1bb8048d643369d6f880bb72563426c1da2878c1`;
- CI de la PR et du push `main` entièrement verte;
- revue indépendante finale `APPROVED`;
- dépôt propre après suppression de la branche;
- aucun déploiement Vercel créé après le gate;
- aucune mutation Supabase, Edge Function, cron-job.org, secret, fixture ou
  donnée de production.

GOAL-002 reste `Blocked`. Son prochain Founder Brief doit autoriser
explicitement les deux migrations suivantes, sans en intercaler une autre :

1. `20260713073853_production_security_hardening.sql`;
2. `20260716142352_fix_claim_ai_tag_candidates_digest.sql`.

La deuxième migration est un roll-forward fonctionnel et de sécurité de la
première chaîne prospective. Après application de la première migration,
aucune récupération ne doit restaurer la définition non qualifiée de
`claim_ai_tag_candidates`, élargir son `search_path` ou rendre ses droits
publics.
