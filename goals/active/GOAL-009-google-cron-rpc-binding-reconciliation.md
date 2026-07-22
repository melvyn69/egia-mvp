# GOAL-009 — Réconcilier le correctif du binding Supabase RPC déjà fusionné et verrouiller les déploiements Engineering

## Identité et statut

- **Prompt :** `PROMPT_VERSION=GOAL009_RECONCILIATION_V2`
- **Statut :** `Done`
- **Date :** `2026-07-22`
- **Date de clôture :** `2026-07-22`
- **Verdict Founder :** `APPROVED FOR REVIEW → DONE`
- **Type :** réconciliation Engineering et durcissement de gouvernance
- **Risque :** `R1` — changements de configuration, CI et documentation; aucune
  mutation de production
- **Baseline obligatoire :**
  `84131b53043af124d09898540589dce3f2c0d003`
- **Baseline de closeout :**
  `f0ebf95130c8c09e6b79820c5be4a993d42148a3`
- **Branche :** `governance/goal-009-rpc-reconciliation`

## Résultat attendu

Réconcilier le correctif du binding Supabase RPC déjà fusionné par la PR #48,
faire du test existant un gate CI permanent et empêcher globalement les
déploiements Git automatiques. Ce Goal ne réimplémente pas le correctif, ne
déploie rien et ne confère aucune autorisation rétroactive au déploiement de
production préexistant.

Le cycle Engineering autorisé par `GOAL009_RECONCILIATION_V2` était :

`Draft → Ready → Running → Review`

Le présent closeout `GOAL009_CLOSEOUT_V2` porte exclusivement sur la transition
documentaire `Review → Done`, désormais explicitement autorisée par le Founder.

## Baseline et chronologie historique

| Élément | Fait réconcilié |
| --- | --- |
| Ancienne baseline | `8d1642d66bee166c19b60b9d6f34aa5ae359eb66`, parent historique uniquement |
| Commit source | `e4e4009cca0c7b53d2103ba6221181f3622561ae` |
| PR | `#48`, `fix: preserve Supabase RPC client binding`, fusionnée |
| Merge commit et baseline actuelle | `84131b53043af124d09898540589dce3f2c0d003` |
| État initial vérifié | `main = origin/main = 84131b53043af124d09898540589dce3f2c0d003` |

La différence entre `8d1642d...` et `84131b5...` est attendue : elle est le
correctif déjà fusionné à réconcilier.

## Cause racine déjà corrigée

L'ancienne implémentation extrayait `supabaseAdmin.rpc` de son instance. L'appel
détaché perdait son contexte et pouvait échouer avec
`Cannot read properties of undefined (reading 'rest')`.

Le code fusionné appelle directement :

```ts
supabaseAdmin.rpc("claim_google_sync_connections", {
  p_limit: connectionBatch
})
```

Le correctif et son test ne sont pas réécrits par GOAL-009.

## Fichiers applicatifs figés

Les cinq fichiers introduits ou modifiés par le commit source sont présents dans
la baseline et doivent rester octet pour octet inchangés pendant ce Goal :

1. `package.json`
2. `scripts/test-google-cron-rpc-binding.ts`
3. `server/_shared/database.types.ts`
4. `server/_shared/handlers/cron/google/sync-replies.ts`
5. `src/database.types.ts`

Aucune migration ni aucun lockfile ne peut être modifié.

## Déploiements préexistants

| Cible | Déploiement | Source | Révision | État |
| --- | --- | --- | --- | --- |
| Preview | `dpl_HpbzSLoXP7R3ECmzGQkEzwEZcbbY` | Git, branche `fix/google-cron-rpc-binding` | `e4e4009cca0c7b53d2103ba6221181f3622561ae` | `READY` |
| Production | `dpl_GCLNEGuqqJQjtQxpGkC4cjbxRX1b` | Vercel CLI, branche `main`, acteur Codex | `84131b53043af124d09898540589dce3f2c0d003` | `READY` |

Ces deux déploiements existaient avant GOAL-009. La Production CLI n'a été
autorisée par aucun Production Run ANES. Elle constitue une divergence de
gouvernance préexistante, sans validation ni autorisation rétroactive.

GOAL-009 interdit tout redéploiement, promotion, rollback, suppression,
modification de déploiement et appel manuel du cron.

## Protections Engineering

- `vercel.json` définit globalement `git.deploymentEnabled=false` afin
  d'empêcher les Preview de branches Engineering et les déploiements
  automatiques après fusion dans `main`.
- `AGENTS.md` interdit les mutations Vercel hors Production Run ANES
  explicitement autorisé; credentials et CI verte ne valent pas autorisation.
- `.github/workflows/ci.yml` exécutera en permanence
  `npm run test:google-cron-rpc-binding` sans modifier le test.

## Contrôle runtime passif initial

L'inspection Vercel passive confirme la Production
`dpl_GCLNEGuqqJQjtQxpGkC4cjbxRX1b` à l'état `READY`, issue de la CLI et associée
à `84131b5...`. Depuis sa mise en service, aucune erreur contenant la signature
du défaut de binding et aucune entrée de niveau `error` n'ont été observées. Un
HTTP 500 distinct a été observé sur `/api/cron/ai/tag-reviews`; il ne concerne
pas le chemin Google réconcilié.

Cette absence d'erreur observée ne constitue pas une validation fonctionnelle
complète : aucun cron n'est appelé pendant GOAL-009.

## Validations et revues requises

Le passage à `Review` exige l'exécution verte de toutes les validations du
contrat, le contrôle des fichiers figés, du lockfile et des migrations, puis
trois verdicts indépendants `APPROVED` :

1. correctif runtime et capacité du test à détecter la régression;
2. chronologie Production et gouvernance sans autorisation rétroactive;
3. CI et prévention de tous les déploiements Engineering.

Le candidat est le dernier commit contenant `vercel.json`,
`.github/workflows/ci.yml` et `AGENTS.md`. Après ce candidat, seuls le présent
Goal et `audits/GOAL-009-google-cron-rpc-binding-reconciliation.md` peuvent
évoluer.

Le candidat figé est
`4e249c63c6c338939080fb91daa3f8525b0801af`. Toutes les validations obligatoires
sont vertes. L'essai adversarial isolé réintroduisant l'ancienne extraction
détachée échoue sur l'assertion d'appel direct, comme attendu. Les trois revues
indépendantes ont rendu `APPROVED` sans finding bloquant.

## Risques résiduels et conditions d'arrêt

- un appel réel du cron reste requis dans un futur Production Run pour une
  validation fonctionnelle complète;
- l'HTTP 500 distinct sur le cron IA doit être traité séparément s'il persiste;
- tout nouveau Preview ou déploiement après push impose l'arrêt sans fusion;
- toute modification d'un fichier applicatif, d'une migration ou du lockfile
  invalide le candidat;
- toute mutation Vercel ou Supabase est interdite dans ce Goal.

## Événements postérieurs avant closeout

La PR #51, `fix: stop inbox review replies request loop`, est postérieure à la
livraison de GOAL-009 et n'en fait pas partie :

| Rôle | SHA |
| --- | --- |
| Base | `bbe8b1e25041f6f848418d79364096a2a8fd27b8` |
| Head final | `d8b041f0dde71c2ac0a6f3f79ddc5fd1805e1a94` |
| Merge dans `main` | `f0ebf95130c8c09e6b79820c5be4a993d42148a3` |

Son objet fonctionnel était de supprimer la boucle React de chargement des
réponses, réduire les requêtes Supabase répétées et ajouter une couverture de
régression. Le code fusionné ne contient aucune migration ni mutation Supabase
distante. Ce correctif n'est ni audité ni réimplémenté par le présent closeout.

Trois déploiements liés à cette exécution Engineering sont survenus après la
livraison de GOAL-009 et avant son closeout :

| Type | Identifiant | Commit | Branche | Source / acteur | État |
| --- | --- | --- | --- | --- | --- |
| Preview Git | GitHub `5554243261`; Vercel `dpl_FW99fCLF3gmVF2rthrLyfT2Wqgf4` | `786df492ba61085b1ec8587fb9af7e6ef612ca49` | `fix/inbox-review-replies-request-loop` | Git | `READY` |
| Preview CLI | `dpl_66nJ32xzTbj3bE7CytBZQUuREEpS` | `d8b041f0dde71c2ac0a6f3f79ddc5fd1805e1a94` | `fix/inbox-review-replies-request-loop` | CLI / Codex | `READY` |
| Production CLI | `dpl_EvjmBfkskwVGmhRW2uiJag869c1W` | `f0ebf95130c8c09e6b79820c5be4a993d42148a3` | `main` | CLI / Codex | `READY` |

GOAL-009 lui-même a créé zéro Preview et zéro Production. Ces trois
déploiements ultérieurs ont été créés hors GOAL-009, sans Production Run ANES :
ils constituent des divergences de gouvernance postérieures et ne reçoivent
aucune autorisation rétroactive.

GOAL-009 a bien intégré les contrôles versionnés et normatifs prévus.
`git.deploymentEnabled=false` demeure présent dans la baseline actuelle, mais ne
bloque pas un déploiement CLI explicite. Les opérations CLI de Codex ont donc
enfreint l'interdiction d'`AGENTS.md`; le Preview Git de la PR #51 est une
divergence supplémentaire. Ces faits restent des risques opérationnels
résiduels, et non une autorisation de production.

## Définition de Done

La définition documentaire de `Done` est satisfaite : le correctif Supabase RPC
est réconcilié, son test est un gate CI permanent, les déploiements Git
automatiques sont désactivés dans la configuration versionnée et la règle
Engineering interdit les mutations Vercel hors Production Run ANES autorisé.
Cette définition porte sur la livraison et la formalisation des garde-fous, pas
sur l'impossibilité absolue qu'une exécution future les enfreigne.

Le déploiement Production CLI historique de GOAL-009 et les trois déploiements
postérieurs de la PR #51 restent non autorisés rétroactivement. Un futur appel
réel du cron Google demeure réservé à un Production Run indépendant et
explicitement autorisé. Le HTTP 500 distinct du cron IA reste hors scope.

## Journal de statut

| Date | Transition | Evidence |
| --- | --- | --- |
| `2026-07-22` | `N/A → Draft` | Mission de réconciliation V2 créée depuis la baseline `84131b5...`; aucune mutation de production. |
| `2026-07-22` | `Draft → Blocked` | Dépôt non propre : doublon local non suivi `scripts/test-google-cron-rpc-binding 2.ts`; arrêt avant modification. |
| `2026-07-22` | `Blocked → Ready` | Autorisation Founder explicite; doublon confirmé `IDENTICAL`, seul doublon supprimé, fichier canonique conservé et dépôt propre. |
| `2026-07-22` | `Ready → Running` | Premier commit `bbaeabb...` créé localement avec le garde-fou Vercel global, la règle normative et le contrat en `Ready`; lancement de la CI et de l'audit sans push ni déploiement. |
| `2026-07-22` | `Running → Review` | Matrice obligatoire verte, test adversarial probant, blobs applicatifs/migrations/lockfile inchangés, candidat `4e249c63c6c338939080fb91daa3f8525b0801af` figé et trois revues indépendantes `APPROVED`. |
| `2026-07-22` | `Review` maintenu | PR #49 fusionnée linéairement au SHA matériel `b21beab4a6227be20084325ef70d00448da5d071`; CI PR et post-fusion vertes, gate binding exécuté, zéro nouveau Preview/Production, branche de travail supprimée localement et à distance. |
| `2026-07-22` | `Review → Done` | Verdict Founder exact `APPROVED FOR REVIEW → DONE`; clôture documentaire depuis `f0ebf951...`, avec PR #51 et ses trois déploiements non autorisés consignés comme divergences postérieures. |

GOAL-009 est `Done`. Cette clôture ne crée aucun Production Run, n'autorise
aucune mutation de production et ne confère aucune autorisation rétroactive.
