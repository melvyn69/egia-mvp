# GOAL-007 — Matrice critère, validation et Evidence

| Critère | Validation Engineering | Evidence versionnée / attendue | État avant gel |
| --- | --- | --- | --- |
| AC-01 | Tests producteur/consommateur A/B et garde legacy. | Helpers partagés, 24 cas A/B, scan statique. | Satisfait |
| AC-02 | Plan inactif, test `activation=false`, refus état capturé. | Provisioner et plan Prerequisite. | Satisfait |
| AC-03 | Canarie, argv, réponses malicieuses, sorties allowlistées et self-test Swift. | 53 cas adversariaux, bridge Security.framework compilé et exécuté. | Satisfait |
| AC-04 | Deux ordres, batch Apple, upsert, timeout/interruption et issues inconnues. | Reprise connue par cible manquante; issue inconnue par réécriture complète depuis les mêmes services Keychain. | Satisfait |
| AC-05 | Parsing direct/session, TLS, nettoyage, watchdog et refus 6543. | 13 cas DB et inspecteur self-test. | Satisfait |
| AC-06 | Matériaux X.509 synthétiques, extensions sémantiques et archive pkpass. | 33 cas Apple, racines épinglées, manifeste/CMS/QR vérifiés. | Satisfait |
| AC-07 | Simulateur, adaptateur Production borné et stack Supabase locale canonique. | Lifecycle `41/41`, 23 probes réelles simulées, sessions révoquées et deux modes isolés avec résidu nul. | Satisfait |
| AC-08 | Nouveaux UUID/credentials par mode et test d'interruption. | Execution IDs distincts et inventaires nuls. | Satisfait |
| AC-09 | Canaries et codes d'erreur bornés. | Secret scan, tests redaction, aucun body brut. | Satisfait |
| AC-10 | Revue des trois artefacts futurs Runs. | Readiness, plan Prerequisite, draft Deployment. | Satisfait |
| AC-11 | Suite, typechecks, lint, builds, audits, CI. | Validations locales vertes; CI GitHub est un gate obligatoire de fusion. | Satisfait sous gate CI |
| AC-12 | Diff et migration-history guard. | Zéro migration modifiée, guard vert. | Satisfait |
| AC-13 | Audit des appels et cibles; tests uniquement locaux. | Zéro mutation distante, zéro donnée réelle. | Satisfait |
| AC-14 | Commit candidat puis descendants documentaires. | Candidat `e6958b647d50c3690cb147a5df8eaa2fdf3136f9`; diff vers le descendant contrôlé avant fusion. | Satisfait |

Les six revues indépendantes ont rendu `APPROVED`; la revue Apple a reconfirmé son verdict après le correctif Linux minimal. Les exécutions locales isolées finales sont `75ae9b2b-a848-4b8a-9829-6f1fd6c504df` (`prerequisite`) et `401dbe1c-e3a3-41ff-a232-f34e731eaace` (`postdeploy`), chacune avec teardown vrai et zéro résidu. Aucun fichier applicatif, script, test opérationnel, Edge Function ou configuration ne peut changer après le candidat figé.
