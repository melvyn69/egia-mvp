# GOAL-002 — Candidat de sécurité production prêt pour un Production Run séparé

## Métadonnées

- **ID :** `GOAL-002`
- **Statut :** `Running`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-11`
- **Date de clôture Engineering :** `N/A`
- **Niveau de risque :** `R3`
- **Candidat applicatif figé :** `73c40836b58f5663e810de70a169c39ab9627745`

## Résultat attendu

Le candidat de sécurité production d’EGIA est entièrement implémenté, vérifié,
documenté, approuvé et figé, de sorte qu’un Production Run indépendant puisse
être créé ultérieurement sans nouvelle décision Engineering.

## Frontière architecturale

GOAL-002 est exclusivement un Goal Engineering. Il produit le code, les
migrations, les Edge Functions, les scripts, les tests, les revues, les
Evidence, le candidat figé, le Production Readiness Report et le Production
Execution Plan.

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

Un statut Engineering `Review` ou `Done` ne constitue jamais une autorisation
de production. Le Production Run futur sera un objet ANES indépendant, créé
seulement après acceptation du Goal Engineering et autorisation explicite du
Founder. Son résultat ne modifiera pas rétroactivement les Evidence ou le
statut Engineering de GOAL-002.

## Valeur business

EGIA dispose d’un candidat de sécurité reproductible et d’un dossier
Engineering vérifiable. La décision d’accepter cet Engineering est ainsi
séparée de la décision opérationnelle de modifier la production.

## Sources de vérité

| Source | Rôle |
| --- | --- |
| `/Users/melvyn/Desktop/ANES/anes/docs/000-blueprint.md` à `005-production-run-standard.md` | Architecture canonique Goal Engineering / Production Run. |
| `/Users/melvyn/Desktop/ANES/anes/templates/GOAL.md` | Structure canonique d’un Goal Engineering. |
| `audits/GOAL-002-production-security-validation.md` | Evidence historique immuable de l’audit initial interrompu sur P0. |
| `audits/GOAL-002-engineering-compatibility-matrix.md` | Evidence locale de compatibilité et de roll-forward, non contractuelle pour la production. |
| `docs/production/GOAL-002-production-readiness-report.md` | Synthèse active de la complétude Engineering. |
| `docs/production/GOAL-002-production-execution-plan.md` | Ordre opérationnel minimal destiné à un futur Production Run. |
| `supabase/migrations/`, `supabase/functions/`, `recovery/goal-002/`, `scripts/` | Candidat Engineering figé et mécanismes préparés. |
| `.github/workflows/`, `package.json`, `vercel.json` | Validations CI et protections contre un déploiement accidentel. |

## Dépendances

| Goal | Statut requis | Statut vérifié |
| --- | --- | --- |
| `GOAL-003` | `Done` | `Done` |
| `GOAL-004` | `Done` | `Done` |
| `GOAL-005` | `Done` | `Done` |
| `GOAL-006` | `Done` | `Done` |

## Scope Engineering

- Implémentation des frontières d’authentification et d’autorisation.
- Isolation multi-tenant, RLS, RPC, grants et fonctions privilégiées.
- Parcours fidélité avec preuve de possession de l’e-mail avant toute
  capacité membre.
- Routes Vercel, Edge Functions, OAuth Google, appels OpenAI, crons et
  traitements d’erreur.
- Deux migrations terminées et figées, dans cet ordre :
  1. `20260713073853_production_security_hardening.sql`;
  2. `20260716142352_fix_claim_ai_tag_candidates_digest.sql`.
- Safe-deny, maintenance, inspection, migration runner, cron helpers et
  récupération fail-closed.
- Tests locaux et isolés, contrôles adversariaux, CI et revues indépendantes.
- Production Readiness Report et Production Execution Plan.
- Gel du candidat applicatif
  `73c40836b58f5663e810de70a169c39ab9627745`.

## Hors-scope

- Application réelle d’une migration Supabase.
- Déploiement réel d’une Edge Function.
- Déploiement Preview ou Production Vercel.
- Suspension, reprise ou invocation réelle d’un cron.
- Modification distante d’un secret, d’une configuration, de RLS, de grants,
  de policies ou de fonctions.
- Fixture, compte, tenant ou donnée de production.
- Test mutant ou validation post-production.
- Verdict opérationnel de production.
- Autorisation ou création d’un Production Run.

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

## Candidat figé

Le candidat applicatif immuable est
`73c40836b58f5663e810de70a169c39ab9627745`.

Les descendants de closeout sont limités à la documentation, aux protections
Git/Vercel et à l’adaptation mécanique d’un test statique aux nouveaux chemins
documentaires. Ils ne peuvent modifier aucun fichier applicatif, migration,
Edge Function, script opérationnel ou artefact de récupération du candidat.
Toute modification de ce périmètre invalide le gel et exige un nouveau Goal
Engineering.

## Critères d’acceptation Engineering

| ID | Critère | Validation | Evidence |
| --- | --- | --- | --- |
| AC-01 | Les correctifs GOAL-003 à GOAL-006 sont intégrés. | Historique Git, migrations et guards. | Readiness Report, section Complétude. |
| AC-02 | Les deux migrations sont figées et strictement ordonnées. | Migration-history guard et bootstrap canonique. | Hashes et résultats de validation. |
| AC-03 | Les frontières sécurité et multi-tenant sont couvertes. | Tests sécurité, SQL d’abus et matrices A/B synthétiques locales. | Readiness Report, section Validations. |
| AC-04 | Les sept Edge Functions et les safe-deny sont typées et testées. | Typecheck Edge et guardrails. | Résultats de tests. |
| AC-05 | Les scripts de cron, inspection, migration et recovery sont fail-closed. | Self-tests locaux, dry-runs et revues. | Résultats de tests. |
| AC-06 | L’application compile sans erreur bloquante. | Tests, typecheck, lint et build. | CI et résultats locaux. |
| AC-07 | Les dépendances ne présentent aucune vulnérabilité bloquante connue. | Audits complet et production. | Résultats d’audit. |
| AC-08 | Les revues indépendantes requises sont approuvées. | Six revues distinctes. | Readiness Report, section Revues. |
| AC-09 | Les documents actifs séparent Engineering et Production Run. | Revue documentaire et recherche de contradictions. | Goal et deux artefacts actifs. |
| AC-10 | Aucun secret ni aucune mutation de production n’est introduit. | Recherche de secrets, diff et inventaires distants passifs. | État Git et dernier Deployment ID. |
| AC-11 | Le candidat applicatif reste identique. | Diff du candidat vers `main`. | Limite aux descendants documentaires/protection. |

## Définition de Review

GOAL-002 est prêt pour `Review` lorsque :

- le code est terminé ;
- GOAL-003, GOAL-004, GOAL-005 et GOAL-006 sont intégrés et `Done` ;
- les migrations, Edge Functions, scripts, safe-deny, cron helpers et
  recovery sont terminés et figés ;
- les tests locaux et isolés sont verts ;
- lint et typecheck sont verts, hors warning préexistant documenté ;
- le build est vert ;
- les audits de dépendances n’ont aucune vulnérabilité bloquante connue ;
- la CI est verte ;
- les revues sécurité/data, backend/produit, architecture ANES, cohérence
  Goal Engineering / Production Run, production-readiness Engineering et
  documentation sont `APPROVED` ;
- le Production Readiness Report et le Production Execution Plan sont à jour ;
- aucun secret n’est exposé ;
- le dépôt est propre ;
- le candidat applicatif figé reste
  `73c40836b58f5663e810de70a169c39ab9627745` ;
- aucune mutation de production n’a été exécutée.

La production non exécutée est un risque opérationnel résiduel appartenant au
futur Production Run. Elle ne constitue pas un critère Engineering manquant.

## Autorisations et contraintes du closeout

- Branche : `docs/goal-002-engineering-closeout`.
- Modifications autorisées : documentation, Goal, Evidence documentaires et
  `AGENTS.md`.
- `vercel.json` est hérité de `main` et ne doit pas être modifié pendant le
  closeout.
- Les protections `git.deploymentEnabled=false` de `main`,
  `security/goal-002-production-validation`,
  `codex/goal-006-fix-pgcrypto-digest` et
  `docs/goal-002-engineering-closeout` doivent rester présentes.
- Aucun force-push.
- Toute mutation distante, tout Preview ou tout déploiement Production arrête
  le closeout.

## Revues indépendantes requises

| Revue | Verdict |
| --- | --- |
| Sécurité / data | `APPROVED` |
| Backend / produit | `APPROVED` |
| Architecture ANES | `APPROVED` |
| Cohérence Goal Engineering / Production Run | `APPROVED` |
| Production-readiness Engineering | `APPROVED` |
| Documentation | `APPROVED` |

## Journal de statut

### Historique antérieur à la séparation architecturale

Les transitions antérieures consignent les Runs d’audit, de correction et de
pré-production qui utilisaient l’ancien modèle mélangeant parfois la clôture
Engineering et la preuve de production. Elles restent des faits historiques,
mais ne définissent plus le contrat actif de GOAL-002.

| Date | Transition historique | Motif synthétique |
| --- | --- | --- |
| `2026-07-11` | N/A → `Draft` → `Ready` → `Running` → `Blocked` | Audit initial puis arrêt P0. |
| `2026-07-13` | `Blocked` → `Running` → `Blocked` | Corrections locales puis attente d’un gate distinct. |
| `2026-07-13` | `Blocked` → `Ready` → `Running` → `Blocked` | Revue indépendante puis décision produit fidélité requise. |
| `2026-07-16` | `Blocked` → `Ready` → `Running` → `Blocked` | Décision fidélité intégrée puis gate Vercel requis. |
| `2026-07-16` | `Blocked` → `Ready` → `Running` → `Blocked` | Reprise après GOAL-006 puis attente du recadrage ANES. |

### Recadrage canonique Engineering

| Date | Transition | Auteur | Raison / Evidence |
| --- | --- | --- | --- |
| `2026-07-16` | `Running` → `Draft` | Codex | `Séparation architecturale entre Goal Engineering et Production Run.` |
| `2026-07-16` | `Draft` → `Ready` | Codex | Contrat Engineering, scope, critères, artefacts et protections Git/Vercel réconciliés avec ANES. |
| `2026-07-16` | `Ready` → `Running` | Codex | Closeout Engineering lancé sur la branche protégée, sans mutation de production. |

La transition `Running → Review` sera consignée uniquement après validations,
revues, CI, Evidence et propreté Git conformes. GOAL-002 ne passe pas à
`Done` dans cette mission.

## Readiness Check du closeout

| Point | État | Evidence |
| --- | --- | --- |
| Résultat Engineering observable | oui | Candidat figé et critères AC-01 à AC-11. |
| Dépendances | oui | GOAL-003 à GOAL-006 `Done`. |
| Scope / hors-scope | oui | Production entièrement exclue. |
| Artefacts | oui | Un Readiness Report et un Execution Plan séparés. |
| Risques et arrêts | oui | Invalidation du candidat, échec critique, revue non approuvée, contradiction ANES ou déploiement accidentel. |
| Protection Vercel | oui | Branche closeout et `main` désactivées dans `git.deploymentEnabled`. |

**Résultat :** le closeout Engineering du Goal peut s’exécuter. Aucune
autorisation de production n’en découle.
