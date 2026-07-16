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
| Test statique GOAL-006 | En attente d'exécution finale. |
| Test SQL transactionnel et abus | En attente d'exécution finale. |
| Migration-history et bootstrap | En attente d'exécution finale. |
| Tests projet, lint, typecheck, build | En attente d'exécution finale. |
| Revue indépendante | Première revue : `CHANGES REQUIRED`; exigences intégrées, revue finale requise. |
| Mutation distante | Aucune. |

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
