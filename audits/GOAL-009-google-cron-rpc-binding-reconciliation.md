# GOAL-009 — Audit de réconciliation du binding Supabase RPC

## Statut et frontière

- **Prompt :** `PROMPT_VERSION=GOAL009_RECONCILIATION_V2`
- **Statut documentaire :** audit Engineering soumis à `Review`
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
et une assertion négative interdisant l'extraction de `supabaseAdmin.rpc`. Dans
une copie temporaire isolée du candidat, l'ancienne extraction a été réintroduite
et le test a échoué exactement sur l'assertion exigeant l'appel direct. La copie
temporaire a ensuite été supprimée; le dépôt principal est resté propre.

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

| Validation | Résultat |
| --- | --- |
| `npm ci` | `PASS` — 443 paquets installés depuis le lockfile |
| `npm run test:google-cron-rpc-binding` | `PASS` — binding, no-candidate, erreur RPC et `CRON_SECRET` |
| `npm test` | `PASS` — garde-fous egress Supabase |
| `npm run test:production-security` | `PASS` — 32 contrôles |
| `npm run test:migration-history` | `PASS` — 100 migrations, cinq collisions documentées, checksum baseline vérifié |
| `npm run typecheck` | `PASS` |
| `npm run build:server` | `PASS` |
| `npm run build` | `PASS` — avertissement de taille de chunk non bloquant |
| `npm run lint` | `PASS` — zéro erreur, un avertissement préexistant `react-hooks/exhaustive-deps` |
| `npm run test:goal-008` | `PASS` |
| `git diff --check` | `PASS` |
| détection adversariale de l'ancienne extraction | `PASS` — test rouge attendu sur l'assertion d'appel direct |
| migrations, lockfile et cinq fichiers figés | `PASS` — blob/tree IDs identiques à `84131b5...` |
| secrets réels | `PASS` — test sécurité et scan du diff sans littéral de credential |

La cohérence RPC est confirmée : la migration
`20260711120000_supabase_egress_guardrails.sql` expose
`claim_google_sync_connections(p_limit int default 5)`, accorde l'exécution au
`service_role`, les deux fichiers de types exposent `p_limit?: number`, et
l'appel fournit `p_limit: connectionBatch` borné.

## Revues indépendantes

| Revue | Verdict |
| --- | --- |
| Runtime et capacité du test à détecter la régression | `APPROVED` — cause reproduite, appel direct et détection de l'ancien source confirmés |
| Chronologie Production et gouvernance sans autorisation rétroactive | `APPROVED` — chronologie et quatre Runs `blocked` confirmés, aucune autorisation rétroactive |
| CI et prévention de tous les déploiements Engineering | `APPROVED` — garde-fou global, règle normative, gate CI et scope confirmés |

Les trois revues ont été conduites indépendamment en lecture seule et n'ont
produit ni modification locale, ni action distante.

## Candidat figé

Le premier commit `bbaeabb...` contient déjà le garde-fou Vercel global,
`AGENTS.md` et le Goal en `Ready`, avant tout push. Le dernier commit contenant
les trois fichiers de contrôle `vercel.json`, `.github/workflows/ci.yml` et
`AGENTS.md`, donc le candidat figé, est :

```text
4e249c63c6c338939080fb91daa3f8525b0801af
```

Après ce SHA, seuls le Goal et le présent audit peuvent évoluer.

## Risques résiduels

1. La validation fonctionnelle complète du cron Google reste absente parce que
   GOAL-009 interdit son appel; elle requerrait un Production Run distinct.
2. Les logs passifs peuvent ne pas couvrir des requêtes jamais exécutées ou une
   rétention expirée.
3. Le 500 du cron IA est hors périmètre et peut nécessiter un Goal séparé.
4. Le garde-fou versionné doit être fusionné pour protéger durablement `main`;
   tout nouveau déploiement pendant la livraison impose l'arrêt.

## État de livraison

La PR #49 a été ouverte depuis
`governance/goal-009-rpc-reconciliation` vers `main`. Son head
`76a6819c6bd014e6186e8e00dec90d5388f2384d` ne contient, après le candidat, que
les deux documents GOAL-009. Les checks PR suivants ont terminé `SUCCESS` :

- CI `29913429387`, incluant le nouveau gate de binding;
- Migration History Guard `29913429406`.

La PR #49 a été fusionnée par squash linéaire le `2026-07-22T10:52:46Z`. Le SHA
matériel intégré est :

```text
b21beab4a6227be20084325ef70d00448da5d071
```

Le run CI post-fusion `29913594099` a terminé `success`; son étape
`Test Google cron Supabase RPC binding` a réussi. Après push, ouverture de PR,
fusion et CI post-fusion, la liste Vercel reste inchangée : son déploiement le
plus récent demeure la Production CLI préexistante
`dpl_GCLNEGuqqJQjtQxpGkC4cjbxRX1b`. GOAL-009 a donc créé zéro Preview et zéro
Production.

La branche `governance/goal-009-rpc-reconciliation` a été supprimée localement
et à distance après synchronisation de `main`. Le présent descendant ne modifie
que les deux documents GOAL-009 afin d'intégrer cette Evidence de livraison;
aucun fichier du candidat n'évolue après `4e249c6...`.

Le correctif historique est réconcilié, les validations sont vertes, les trois
revues sont `APPROVED`, et les protections Engineering sont intégrées. Les
contrôles passifs n'observent aucune nouvelle mutation Vercel ou Supabase.
GOAL-009 reste `Review`; aucune transition `Review → Done` ni aucune autorisation
de production n'est accordée.
