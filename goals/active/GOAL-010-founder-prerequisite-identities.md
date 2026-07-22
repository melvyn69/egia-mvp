# GOAL-010 — Rendre le runner prerequisite compatible avec les identités Founder et supprimer sa dépendance mailbox inutile

## Identité et statut

- **Prompt :** `PROMPT_VERSION=GOAL010_FOUNDER_PREREQUISITE_IDENTITIES_V1`
- **Statut :** `Review`
- **Date :** `2026-07-22`
- **Type :** correctif Engineering du runner synthétique prerequisite
- **Risque :** `R3` — identités Founder, Auth Admin, reprise, teardown et
  frontière prerequisite/postdeploy
- **Baseline EGIA :** `b4107cc3d907014db091d02bb3235f219cf10eb2`
- **Candidat historique :** `f0ebf95130c8c09e6b79820c5be4a993d42148a3`
- **Baseline ANES en lecture seule :**
  `46446dd31d7c5991ddb45953db1162579c2d879f`
- **Branche :** `engineering/goal-010-founder-prerequisite-identities`
- **Candidat applicatif figé :**
  `338066d7537c23e4b5208bed3456ac61566ebecd`

## Objet

Modifier exclusivement le runner synthétique afin que le mode Production
`prerequisite` consomme deux identités Founder explicites, fail-closed et sans
fuite, sans instancier de mailbox. Le mode `postdeploy` conserve ses identités
générées, son provider one-shot, son nettoyage et son contrôle de résidu.

Ce Goal ne contient aucune mutation de production. Il ne crée aucun Production
Run et n'autorise ni déploiement, ni appel applicatif, ni utilisateur distant.

## Cause racine

Le lanceur lit uniquement `GOAL002_SYNTH_EMAIL_DOMAIN`, ne consomme pas les
deux identités Founder et instancie `HttpsOneShotMailboxProvider` pour tous les
modes Production. Pourtant, `prerequisite` crée les comptes via Auth Admin avec
`email_confirm: true` et ne produit aucun effet mailbox.

## Scope autorisé

- `scripts/goal002-synth.mjs`
- `scripts/lib/goal002-synth-runner.mjs`
- `scripts/lib/goal002-supabase-local-adapter.mjs`
- `scripts/test-goal-007-synth-runner.mjs`
- le présent Goal et `audits/GOAL-010-founder-prerequisite-identities.md`

La CI exécute déjà le test via `npm run test:goal-007`; aucun changement du
workflow n'est requis. `package.json`, `package-lock.json`, `src/`, `server/`,
les migrations, `vercel.json` et `AGENTS.md` sont figés.

## Contrat prerequisite Production

- lire une seule fois `SUPABASE_TEST_EMAIL_A` et `SUPABASE_TEST_EMAIL_B` ;
- les supprimer immédiatement de `process.env` ;
- valider présence, format et distinction par codes stables non sensibles ;
- utiliser exactement A pour l'identité A et B pour l'identité B ;
- ne jamais journaliser, persister, dériver ou inclure ces valeurs dans un nom
  de ressource ;
- ne pas lire le domaine synthétique ni les paramètres mailbox ;
- ne pas instancier de provider mailbox ;
- conserver interruption, reprise, teardown et `residueCount=0`.

## Contrat postdeploy

Le mode `postdeploy` conserve les identités préfixées générées depuis son
domaine contrôlé, le provider mailbox HTTPS one-shot, la consommation unique,
le nettoyage déterministe et le contrôle de résidu.

## Protection des utilisateurs existants

Une adresse existante ne peut jamais être écrasée ou supprimée sur la seule
base de son e-mail. Toute récupération exige des métadonnées synthétiques
correspondant au préfixe et au mode de l'exécution. Sinon le runner échoue avec
un code non sensible.

## Canaux de contrôle hors scope

Le bridge GOAL-007 conserve ses canaux Keychain `VERCEL_API_TOKEN` et
`SUPABASE_ACCESS_TOKEN`. Leur absence actuelle est un prérequis opérationnel
futur, pas un échec de GOAL-010. Aucun token n'est créé, demandé ou lu ici.

## Critères de passage à Review

1. Les vingt scénarios contractuels sont couverts et verts.
2. Toutes les validations obligatoires sont vertes.
3. Aucun e-mail Founder n'apparaît dans les sorties ou fichiers.
4. Trois revues indépendantes rendent exactement `APPROVED`.
5. Le candidat applicatif est figé avant le descendant documentaire.
6. Aucun Preview, Production ou mutation distante n'est créé.

## Validation du scope

Les baselines, statuts et worktrees sont conformes. L'analyse confirme que les
quatre fichiers applicatifs autorisés suffisent : la CI exécute déjà le script
agrégé `test:goal-007`, le lockfile n'a pas à évoluer et aucune modification
ANES, runtime utilisateur, migration ou configuration de déploiement n'est
requise. Le Goal peut donc passer à `Ready`, puis `Running`.

## Implémentation finale

- Le lanceur consomme A/B une seule fois via l'environnement, supprime les
  deux entrées avant validation et n'émet que des codes stables.
- `prerequisite` utilise exactement les deux identités fournies et ignore
  entièrement la mailbox; `postdeploy` conserve les identités générées et le
  provider HTTPS one-shot.
- La récupération Founder exige le marqueur synthétique, le mode
  `prerequisite`, le côté A/B et un préfixe UUID valide. Toutes les collisions
  sont validées avant le premier nettoyage.
- Les interruptions laissant deux utilisateurs synthétiques sont récupérées à
  l'exécution suivante; une collision non synthétique arrête l'exécution sans
  suppression.
- Les valeurs A/B et mots de passe sont effacés des objets en mémoire en fin
  d'exécution et ne figurent ni dans l'Evidence ni dans les erreurs.

## Validation et revues

- Matrice GOAL-010 : `20/20`.
- Cycle synthétique historique : `41/41`.
- Toutes les commandes obligatoires sont vertes; le lint conserve uniquement
  l'avertissement historique `useCoachResult.ts:227` (zéro erreur).
- Sécurité Production : `32/32`; provisioner : `53/53`; bridge Keychain et
  canaux de contrôle inchangés.
- Revues indépendantes finales : identités/confidentialité `APPROVED`,
  prerequisite/postdeploy `APPROVED`, production/non-régression `APPROVED`.
- Candidat applicatif figé avant la transition `Running → Review`; le
  descendant documentaire portant cette transition est consigné dans l'audit
  à l'itération documentaire suivante.

## Journal de statut

| Date | Transition | Evidence |
| --- | --- | --- |
| `2026-07-22` | `N/A → Draft` | Goal créé sur la baseline obligatoire, scope R3 borné et séparation Engineering/production explicite. |
| `2026-07-22` | `Draft → Ready` | Baselines et dépendances conformes; quatre fichiers applicatifs et deux documents suffisent; CI existante couvre le test agrégé. |
| `2026-07-22` | `Ready → Running` | Implémentation locale autorisée, sans production, déploiement, appel distant ni nouveau Production Run. |
| `2026-07-22` | `Running → Review` | Candidat `338066d7537c23e4b5208bed3456ac61566ebecd` figé après validations intégrales et trois revues finales `APPROVED`; aucune mutation distante. |

GOAL-010 reste en `Review`. La transition `Review → Done` demeure hors scope et
requiert un verdict Founder séparé.
