# GOAL-007 — Les prérequis de production EGIA sont provisionnables, vérifiables et réversibles sans exposition de secrets

## Métadonnées

- **ID :** `GOAL-007`
- **Statut :** `Done`
- **Propriétaire :** Fondateur (Melvyn)
- **Date de création :** `2026-07-18`
- **Date de clôture :** `2026-07-18`
- **Niveau de risque :** `R3` — Engineering de sécurité touchant les frontières Vercel, Supabase, Apple Wallet et les fixtures synthétiques ; six revues indépendantes obligatoires.

## Valeur business

EGIA possède un candidat permettant de préparer puis déployer la production sans activation partielle de secret, exposition de credentials ni fixtures synthétiques orphelines.

## Résultat attendu

Le protocole A/B, les helpers sécurisés, la validation Apple, l'accès DB borné, le runner synthétique et les artefacts de production sont versionnés, testés, revus et figés.

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

## Contexte

- `GOAL-002` reste `Done` et son candidat historique `73c40836b58f5663e810de70a169c39ab9627745` reste une Evidence historique.
- `PROD-RUN-001` reste définitivement `blocked`; son Event Founder, son payload, ses digests, ses Evidence et son verdict sont immuables.
- GOAL-007 ne crée, ne nomme et n'autorise aucun Production Run.
- Après acceptation fondatrice de GOAL-007, un Prerequisite Run et un Deployment Run ANES distincts exigeront chacun un Event Founder séparé.

## Sources de vérité

| Source | Portée / règle applicable |
| --- | --- |
| `AGENTS.md` | Un Goal EGIA ne contient jamais de mutation de production. |
| `/Users/melvyn/Desktop/ANES/anes/docs/005-production-run-standard.md` | Séparation Engineering / Production Run. |
| `/Users/melvyn/Desktop/ANES/anes/production-runs/preparation/` | Diagnostic préparatoire ayant établi le besoin de GOAL-007. |
| Autorisation fondatrice du `2026-07-18` | Architecture A/B, Apple Wallet v0.1, runner synthétique et séparation des futurs Runs. |

## Scope

- Remplacer le secret interne legacy par `INTERNAL_API_KEY_SLOT_A`, `INTERNAL_API_KEY_SLOT_B` et `INTERNAL_API_KEY_ACTIVE_SLOT` sans fallback actif.
- Créer un helper local de provisionnement HTTPS direct, zéro-copie, redigé, plan-first et récupérable.
- Borner et rediger l'injection de `SUPABASE_DB_URL` pour l'inspecteur et le runner autorisé.
- Durcir Apple Wallet et créer un validateur cryptographique local sur matériaux synthétiques.
- Créer le runner `GOAL002_SYNTH` à deux modes isolés `prerequisite` et `postdeploy`, avec teardown déterministe et preuve de zéro résidu.
- Produire les rapports Engineering et les plans non autorisants des deux futurs Runs.

## Hors-scope

- Toute mutation Vercel, Supabase, cron-job.org, secret, certificat ou donnée distante.
- Toute migration, modification de schéma ou déploiement.
- Tout compte, fixture ou datum de production.
- Tout Event Founder ou Production Run.
- Toute modification de `PROD-RUN-001`, de GOAL-002 ou de leurs Evidence historiques.

## Contraintes d'architecture

### Protocole A/B

- Le producteur sélectionne exclusivement `A` ou `B` selon `INTERNAL_API_KEY_ACTIVE_SLOT`, sans repli silencieux.
- Le consommateur accepte les deux slots non vides et n'accepte jamais `INTERNAL_API_KEY`.
- Les configurations absentes, vides, mal formées ou un slot actif autre que `A` ou `B` échouent fermées.
- Le prépositionnement d'un slot inactif n'active rien; l'activation explicite appartient uniquement à un futur Deployment Run.

### Apple Wallet v0.1

- `sharingProhibited=true` et les six entrées forment un ensemble atomique et cohérent.
- La validation cryptographique complète appartient au futur Prerequisite Run; un certificat avec moins de 30 jours restants est refusé.
- Aucun service de mise à jour distante et aucune `expirationDate` métier ne sont ajoutés en v0.1; ces limites sont des risques résiduels documentés.
- La génération ou le retéléchargement d'un pass doit rester reproductible depuis le serveur.

### Tests synthétiques

- `prerequisite` ne valide que setup, ownership, incapacité métier avant activation, teardown et zéro résidu.
- `postdeploy` recrée de nouvelles identités et fixtures avant les assertions métier et sécurité.
- Aucun identifiant, fixture, session, credential ou execution ID n'est transféré entre les deux modes ou futurs Runs.
- Chaque exécution utilise de nouveaux UUID, mots de passe et préfixes; le teardown s'exécute en succès comme en échec.

## Dépendances et Readiness Check

| Dépendance | État | Evidence / effet |
| --- | --- | --- |
| GOAL-002 | `Done` | Frontière Engineering / production et candidat historique figés. |
| PROD-RUN-001 | `blocked` immuable | Le diagnostic préparatoire est disponible sans réouvrir le Run. |
| Décisions A/B, Apple et runner | prêtes | Décisions fondatrices explicites et bornées. |
| Baseline EGIA | prête | `main=origin/main=6114e73d5f9e973ee5afb910fe56c05c631c0900`, dépôt propre avant Phase 0. |
| Baseline ANES | prête, lecture seule | `main=origin/main=6d44b940bc94fd6d51002b752032164973238fef`, dépôt propre, package préparatoire présent. |
| Autorisation Production | absente | Non nécessaire et explicitement hors-scope. |

Au terme du Readiness Check initial, le Goal était `Ready` : valeur, résultat, scope, hors-scope, architecture, dépendances, critères, validations, Evidence et conditions d'arrêt étaient explicites; aucune mutation distante n'était requise.

## Critères d'acceptation

| ID | Critère observable | Validation | Evidence attendue |
| --- | --- | --- | --- |
| AC-01 | Le protocole A/B est implémenté producteur et consommateur sans fallback legacy. | Tests unitaires et garde statique. | Rapport A/B et sorties redigées. |
| AC-02 | Un slot inactif est prépositionnable sans activation distincte. | Plans et tests de transitions partielles. | Matrice d'états A/B. |
| AC-03 | Le provisioner ne divulgue aucun secret par argv, fichier, environnement non autorisé, sortie, erreur ou child process. | Tests adversariaux locaux. | Rapport zéro-copie. |
| AC-04 | Les récupérations des écritures partielles sont déterministes. | Simulations Vercel/Supabase et interruptions. | Matrice de récupération. |
| AC-05 | Le canal DB accepte direct/session 5432 et refuse transaction 6543. | Tests de parsing, TLS, redaction et timeout. | Résultats du validateur DB. |
| AC-06 | Apple Wallet est fail-closed, `sharingProhibited=true`, avec validation crypto synthétique complète. | Tests runtime et préflight synthétiques. | Rapport Apple Wallet. |
| AC-07 | `GOAL002_SYNTH` gère A/B, deux tenants, setup, modes séparés, teardown et zéro résidu. | Stack Supabase locale isolée. | Rapport d'exécution local. |
| AC-08 | Aucune identité ou fixture n'est transférable entre futurs Runs. | Tests d'execution ID et inventaire. | Preuve d'isolation. |
| AC-09 | Erreurs et Evidence sont strictement redigées. | Canaries et recherche de fuite. | Rapport de redaction. |
| AC-10 | Les artefacts Prerequisite et Deployment sont séparés, précis et non autorisants. | Revue documentaire. | Plans et rapports versionnés. |
| AC-11 | Tous les tests locaux, statiques, adversariaux et d'intégration isolée sont verts. | Suite complète et CI. | Sorties et CI GitHub. |
| AC-12 | Aucune migration n'est nécessaire. | Diff et migration-history guard. | Liste de fichiers et guard vert. |
| AC-13 | Aucune mutation distante, aucun secret réel, compte réel ou donnée cliente ne sont utilisés. | Audit Git, secret scan et contrôle distant passif. | Evidence de non-mutation. |
| AC-14 | Le nouveau candidat est figé par un SHA applicatif exact; ses descendants sont documentaires uniquement. | Diff candidat vers `main`. | SHA et liste des fichiers descendants. |

## Validations obligatoires

- Tests existants et nouveaux tests A/B producteur/consommateur.
- Tests de comparaison, redaction et provisionnement adversarial.
- Tests DB, Apple synthétiques, runner A/B sur stack locale isolée, interruption, teardown et zéro résidu.
- Typechecks Node et Edge, lint, build application et maintenance.
- Audits dépendances complet et production, recherche de secrets et de noms legacy.
- Migration-history guard, `git diff --check` et CI GitHub complète.
- Six revues indépendantes : architecture A/B; secrets/zéro-copie; Supabase/Auth/DB/Storage; Apple Wallet; runner/teardown; séparation Engineering/Runs. Verdict requis : `APPROVED` pour chacune.

## Autorisations Git

- Créer et pousser `engineering/goal-007-production-prerequisites` : autorisé après intégration de sa protection Vercel.
- Modifier, tester, committer, ouvrir une PR et fusionner en fast-forward : autorisé dans le scope.
- Force-push : interdit.
- Après le commit candidat, seuls le Goal, les rapports, Evidence, documents et références au SHA figé peuvent changer.

## Autorisations de déploiement

`Production réelle : hors-scope — Production Run ANES indépendant requis`

- Preview, staging et production : interdits.
- Toute mutation distante : interdite.
- Retour arrière de production : N/A, aucune production ne doit être touchée.

## Conditions d'arrêt

- Migration ou décision produit supplémentaire nécessaire.
- Contrat zéro-copie, pass reproductible ou teardown déterministe impossible à démontrer.
- Valeur secrète dans une sortie ou un artefact.
- Revue autre que `APPROVED` ou contradiction ANES active.
- Mutation distante, Preview ou déploiement créé.
- Candidat modifié après son gel.

## Définition de Done

GOAL-007 Engineering est clôturé.

- Les critères AC-01 à AC-14 sont acceptés.
- Le candidat final reste figé au SHA `e6958b647d50c3690cb147a5df8eaa2fdf3136f9`.
- Le premier gel `198d82c0d9fad0134f8400d6c2e03ceec9d1eeb2` reste superseded et uniquement conservé comme Evidence historique.
- Les six revues indépendantes `APPROVED`, les validations locales et les CI GitHub sont acceptées.
- Les risques résiduels Apple Wallet v0.1 — absence de service de mise à jour distante et absence d'expiration métier — sont connus et acceptés pour ce candidat.
- Le Production Prerequisite Readiness Report et les plans Prerequisite et Deployment restent des entrées préparatoires non autorisantes.
- Toute production exige toujours un Production Prerequisite Run et un Production Deployment Run ANES séparés, chacun lié à un Event Founder distinct.

La clôture Engineering de GOAL-007 ne crée, n’autorise et n’exécute aucun Production Run.

## Journal de statut

| Date | Transition | Auteur | Raison / référence |
| --- | --- | --- | --- |
| `2026-07-18` | `N/A → Draft` | Codex | Création autorisée par le Founder; aucune mutation de production. |
| `2026-07-18` | `Draft → Ready` | Codex | Readiness Check complet : architecture et frontières figées, dépendances disponibles, validations et conditions d'arrêt vérifiables localement. |
| `2026-07-18` | `Ready → Running` | Codex | Début de l'implémentation Engineering locale après intégration des protections Vercel; aucune mutation distante. |
| `2026-07-18` | `Running → Review` | Codex | AC-01 à AC-14 satisfaits, validations Engineering locales vertes, six revues indépendantes `APPROVED` et candidat applicatif figé au SHA `e6958b647d50c3690cb147a5df8eaa2fdf3136f9`; CI GitHub et gel documentaire restent des gates de fusion. |
| `2026-07-18` | `Review → Done` | Fondateur (Melvyn) | Verdict fondateur APPROVED : PR #43 fusionnée en fast-forward au SHA 234726cd60626eb0322afc92cc5f605c641a5f54, CI PR et post-fusion vertes, AC-01 à AC-14 satisfaits, six revues indépendantes APPROVED, candidat applicatif final e6958b647d50c3690cb147a5df8eaa2fdf3136f9 figé et descendants exclusivement documentaires, sans Preview, déploiement ni mutation distante. |

## Livraison et clôture

- **Artifacts livrés :** protocole A/B, provisioner zéro-copie, canal DB borné, préflight Apple Wallet, runner `GOAL002_SYNTH`, tests, rapport de readiness et plans séparés.
- **Matrice critère → validation → Evidence :** `audits/GOAL-007-engineering-evidence-matrix.md`.
- **Candidat applicatif figé :** `e6958b647d50c3690cb147a5df8eaa2fdf3136f9`.
- **Gel superseded :** `198d82c0d9fad0134f8400d6c2e03ceec9d1eeb2` reste une Evidence historique du premier gel et n'est pas le candidat final.
- **Risques résiduels :** absence de service de mise à jour Apple Wallet v0.1 et absence d'expiration métier v0.1.
- **Verdict de revue :** six revues indépendantes `APPROVED` (A/B; secrets; Supabase; Apple Wallet; synthétique/teardown; séparation des Runs).
- **Décision de clôture :** verdict Founder `APPROVED`; transition `Review → Done` acceptée le `2026-07-18`, sans autorisation de production.
