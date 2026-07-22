# GOAL-009 — Audit de réconciliation du binding Supabase RPC

## Statut et frontière

- **Prompt :** `PROMPT_VERSION=GOAL009_RECONCILIATION_V2`
- **Statut documentaire :** audit Engineering en cours (`Running`)
- **Baseline initiale obligatoire :**
  `84131b53043af124d09898540589dce3f2c0d003`
- **Production :** aucune mutation autorisée ou exécutée par GOAL-009

Cet audit réconcilie un correctif déjà fusionné et deux déploiements déjà
existants. Il ne transforme ni le Goal, ni une CI verte, ni des credentials
disponibles en autorisation de production. Toute future production exige un
Production Run ANES indépendant et explicitement autorisé par le Founder.

## Baseline et graphe Git

Les contrôles initiaux ont établi :

```text
main        = 84131b53043af124d09898540589dce3f2c0d003
origin/main = 84131b53043af124d09898540589dce3f2c0d003
remote main = 84131b53043af124d09898540589dce3f2c0d003
```

| Rôle | SHA | Sujet / relation |
| --- | --- | --- |
| Ancienne baseline | `8d1642d66bee166c19b60b9d6f34aa5ae359eb66` | parent historique du correctif, jamais baseline attendue de GOAL-009 |
| Commit source | `e4e4009cca0c7b53d2103ba6221181f3622561ae` | `fix: preserve Supabase RPC client binding`, parent `8d1642d...` |
| PR historique | `#48` | `fix: preserve Supabase RPC client binding`, état `MERGED` |
| Merge commit | `84131b53043af124d09898540589dce3f2c0d003` | sujet `fix: preserve Supabase RPC client binding (#48)`, parent `8d1642d...` |

La PR #48 a été fusionnée le `2026-07-22T10:07:56Z`. Son unique commit est le
commit source `e4e4009...`; le merge commit linéaire de `main` est `84131b5...`.

## Cause racine et correctif fusionné

L'ancienne implémentation détachait la méthode `supabaseAdmin.rpc` de son client.
Le SDK Supabase dépend du contexte de l'instance; l'appel détaché pouvait donc
évaluer `this` à `undefined` puis produire :

```text
Cannot read properties of undefined (reading 'rest')
```

Le correctif fusionné conserve le binding en appelant directement :

```ts
supabaseAdmin.rpc("claim_google_sync_connections", {
  p_limit: connectionBatch
})
```

Le test canonique contient à la fois une assertion positive sur cet appel direct
et une assertion négative interdisant l'extraction de `supabaseAdmin.rpc`. Sa
capacité adversariale doit encore être prouvée par une exécution isolée avant
`Review`.

## Périmètre applicatif historique figé

Le diff du commit source comporte exactement cinq fichiers :

| Fichier | Changement historique | État GOAL-009 |
| --- | --- | --- |
| `package.json` | commande du test | présent dans `main`, interdit de modification |
| `scripts/test-google-cron-rpc-binding.ts` | test de régression | présent dans `main`, interdit de modification |
| `server/_shared/database.types.ts` | type RPC | présent dans `main`, interdit de modification |
| `server/_shared/handlers/cron/google/sync-replies.ts` | appel lié | présent dans `main`, interdit de modification |
| `src/database.types.ts` | type RPC | présent dans `main`, interdit de modification |

Aucune migration et aucun lockfile ne font partie du correctif ou de la
réconciliation. Ils doivent rester inchangés.

## Validations de la PR historique

Le corps de la PR #48 consigne les validations locales suivantes :

- `npm ci`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:google-cron-rpc-binding`
- `npm run test:production-security`
- `git diff --check`

Sur GitHub, le run CI `29910618418` du commit source `e4e4009...` a terminé
`success`. Les étapes observées vertes incluent installation, validation et tests
de l'historique des migrations, bootstrap canonique, sécurité production,
GOAL-006, GOAL-007, GOAL-008, types Edge, lint et build. Le workflow distinct
`Migration History Guard` a aussi terminé `SUCCESS`.

Le test de binding n'était pas encore une étape permanente de la CI historique :
GOAL-009 corrige précisément cette lacune en ajoutant la commande existante à
`.github/workflows/ci.yml`, sans modifier le test.

## Chronologie des déploiements préexistants

### Preview historique

| Champ | Valeur passive observée |
| --- | --- |
| ID | `dpl_HpbzSLoXP7R3ECmzGQkEzwEZcbbY` |
| Création | `2026-07-22T10:05:59.570Z` |
| Prêt | `2026-07-22T10:07:18.663Z` |
| État | `READY` |
| Source | `git` |
| Branche | `fix/google-cron-rpc-binding` |
| SHA | `e4e4009cca0c7b53d2103ba6221181f3622561ae` |

### Production CLI historique

| Champ | Valeur passive observée |
| --- | --- |
| ID | `dpl_GCLNEGuqqJQjtQxpGkC4cjbxRX1b` |
| Création | `2026-07-22T10:09:03.124Z` |
| Prêt | `2026-07-22T10:10:32.568Z` |
| État | `READY` |
| Target | `production` |
| Source | `cli` |
| Branche métadonnée | `main` |
| SHA métadonné | `84131b53043af124d09898540589dce3f2c0d003` |
| Acteur d'exécution consigné | Codex |

Ces déploiements sont antérieurs à GOAL-009. Ils ne sont ni recréés, ni promus,
ni modifiés, ni supprimés, ni rollbackés pendant cette mission.

## Divergence de gouvernance préexistante

`PROD-RUN-001`, `PROD-RUN-002`, `PROD-RUN-003` et `PROD-RUN-004` sont tous
`blocked`. Aucun n'autorise le déploiement Production CLI ci-dessus. Cette
Production constitue donc une divergence de gouvernance préexistante.

La réconciliation la documente mais ne l'autorise pas rétroactivement. La
présence d'un déploiement `READY`, d'un correctif fusionné, de credentials ou
d'une CI verte n'altère pas cette conclusion.

## Contrôle runtime strictement passif

Les appels Vercel passifs `inspect`, API `GET` et `logs` ont confirmé les
métadonnées et recherché, depuis la mise en service :

- les événements de niveau `error` : aucun observé;
- les réponses `5xx` : une réponse 500 observée à
  `2026-07-22T10:18:25.933Z` sur `/api/cron/ai/tag-reviews`;
- la signature `Cannot read properties of undefined` : aucune observée.

Le 500 observé appartient au cron IA et non au chemin
`/api/cron/google/sync-replies`. Aucune erreur du binding corrigé n'est donc
observée. Cette conclusion est passive et limitée aux logs disponibles : elle
ne prouve pas une validation fonctionnelle complète. Aucun cron n'a été appelé
manuellement.

## Garde-fous ajoutés par GOAL-009

### Protection Vercel globale

`vercel.json` remplace la liste partielle de branches par :

```json
"git": {
  "deploymentEnabled": false
}
```

Tout le reste du fichier demeure inchangé. Ce réglage empêche tous les
déploiements Git automatiques, aussi bien les Preview des branches Engineering
que les déploiements automatiques issus d'une fusion dans `main`.

### Interdiction normative

`AGENTS.md` interdit toute invocation mutante de `vercel`, dont `vercel`,
`vercel deploy`, `vercel --prod`, `vercel promote`, `vercel rollback`, ainsi que
toute API ou tout outil équivalent, hors Production Run ANES explicitement
autorisé. Seule l'inspection passive reste admise. Credentials et CI verte ne
valent pas autorisation; un Goal Engineering ne déploie jamais.

### Gate CI permanent

`.github/workflows/ci.yml` exécute désormais :

```text
npm run test:google-cron-rpc-binding
```

Le script, sa déclaration `package.json` et les fichiers applicatifs restent
inchangés.

## Nettoyage local préalable autorisé

Le blocker initial était le fichier local non suivi
`scripts/test-google-cron-rpc-binding 2.ts`. Après autorisation Founder
explicite, les conditions ont été contrôlées immédiatement avant suppression :

- doublon toujours non suivi;
- fichier canonique suivi par Git;
- comparaison octet par octet : `IDENTICAL`;
- aucune autre différence locale;
- suppression du seul doublon;
- fichier canonique conservé et inchangé;
- dépôt propre après nettoyage.

Ce nettoyage de workspace n'est pas une modification applicative de GOAL-009 et
n'est pas une mutation distante.

## Validations GOAL-009

Les résultats seront consignés après exécution de la matrice obligatoire :

| Validation | Résultat |
| --- | --- |
| `npm ci` | en attente |
| `npm run test:google-cron-rpc-binding` | en attente |
| `npm test` | en attente |
| `npm run test:production-security` | en attente |
| `npm run test:migration-history` | en attente |
| `npm run typecheck` | en attente |
| `npm run build:server` | en attente |
| `npm run build` | en attente |
| `npm run lint` | en attente |
| `npm run test:goal-008` | en attente |
| `git diff --check` | en attente |
| détection adversariale de l'ancienne extraction | en attente |
| migrations, lockfile et cinq fichiers figés | en attente |
| secrets réels | en attente |

## Revues indépendantes

| Revue | Verdict |
| --- | --- |
| Runtime et capacité du test à détecter la régression | en attente |
| Chronologie Production et gouvernance sans autorisation rétroactive | en attente |
| CI et prévention de tous les déploiements Engineering | en attente |

## Risques résiduels

1. La validation fonctionnelle complète du cron Google reste absente parce que
   GOAL-009 interdit son appel; elle requerrait un Production Run distinct.
2. Les logs passifs peuvent ne pas couvrir des requêtes jamais exécutées ou une
   rétention expirée.
3. Le 500 du cron IA est hors périmètre et peut nécessiter un Goal séparé.
4. Le garde-fou versionné doit être fusionné pour protéger durablement `main`;
   tout nouveau déploiement pendant la livraison impose l'arrêt.

## État provisoire

Le correctif historique est réconcilié, les deux garde-fous de déploiement et le
gate CI sont préparés localement. GOAL-009 reste `Running` jusqu'aux validations,
aux trois verdicts `APPROVED`, à la livraison linéaire et aux contrôles finaux de
zéro nouveau Preview et zéro nouveau Production.
