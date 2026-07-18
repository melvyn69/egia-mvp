# GOAL-007 — Matrice critère, validation et Evidence

| Critère | Validation Engineering | Evidence versionnée / attendue | État avant gel |
| --- | --- | --- | --- |
| AC-01 | Tests producteur/consommateur A/B et garde legacy. | Helpers partagés, 24 cas A/B, scan statique. | Satisfait |
| AC-02 | Plan inactif, test `activation=false`, refus état capturé. | Provisioner et plan Prerequisite. | Satisfait |
| AC-03 | Canarie, argv, réponses malicieuses, sorties allowlistées et self-test Swift. | 53 cas adversariaux, bridge Security.framework compilé et exécuté. | Satisfait |
| AC-04 | Deux ordres, batch Apple, upsert, timeout/interruption et issues inconnues. | Reprise connue par cible manquante; issue inconnue par réécriture complète depuis les mêmes services Keychain. | Satisfait |
| AC-05 | Parsing direct/session, TLS, nettoyage, watchdog et refus 6543. | 13 cas DB et inspecteur self-test. | Satisfait |
| AC-06 | Matériaux X.509 synthétiques, extensions sémantiques et archive pkpass. | 33 cas Apple, racines épinglées, manifeste/CMS/QR vérifiés. | Satisfait |
| AC-07 | Simulateur, adaptateur Production borné et stack Supabase locale canonique. | Lifecycle, 23 probes réelles simulées, sessions révoquées et deux modes isolés avec résidu nul. | Satisfait |
| AC-08 | Nouveaux UUID/credentials par mode et test d'interruption. | Execution IDs distincts et inventaires nuls. | Satisfait |
| AC-09 | Canaries et codes d'erreur bornés. | Secret scan, tests redaction, aucun body brut. | Satisfait |
| AC-10 | Revue des trois artefacts futurs Runs. | Readiness, plan Prerequisite, draft Deployment. | Satisfait |
| AC-11 | Suite, typechecks, lint, builds, audits, CI. | Rapport de validation final et CI GitHub. | À confirmer après gel |
| AC-12 | Diff et migration-history guard. | Zéro migration modifiée, guard vert. | Satisfait |
| AC-13 | Audit des appels et cibles; tests uniquement locaux. | Zéro mutation distante, zéro donnée réelle. | Satisfait |
| AC-14 | Commit candidat puis descendants documentaires. | SHA candidat et diff vers `main` final. | À renseigner après gel |

Le détail final des commandes, des six revues et du SHA figé sera enregistré après gel dans des modifications exclusivement documentaires.
