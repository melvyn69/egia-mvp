# GOAL-007 — Production Deployment Execution Plan (Draft)

## Statut non exécutable

Ce brouillon remplace, pour tout futur déploiement, le plan historique GOAL-002. Il ne modifie pas l'Evidence historique, ne porte aucun identifiant officiel de Production Run et reste **NON EXÉCUTABLE** tant qu'un Production Prerequisite Run séparé n'a pas réussi, été vérifié et été clôturé conformément à ANES.

Il exige ensuite un Production Deployment Run ANES distinct, un nouvel Event Founder, le candidat GOAL-007 figé `2d341bbca3bb49bfa6d69b607d039ffc17079071` et des hashes recalculés. Le présent document n'est aucune autorisation.

## Préconditions supplémentaires obligatoires

- Evidence acceptée du Prerequisite Run : slot inactif cohérent sur les deux plateformes, set Apple complet, canal DB validé et zéro résidu synthétique.
- Candidat GOAL-007 inchangé et descendants exclusivement documentaires.
- `INTERNAL_API_KEY_ACTIVE_SLOT` identifie encore l'ancien slot sain avant activation.
- Consommateur Vercel bi-slot déployable avant l'activation du producteur.
- Recovery roll-forward et maintenance préparées; aucune réintroduction du nom legacy.

## Séquence préparatoire

1. Préflight passif et revue R4 `APPROVED FOR FIRST MUTATION`.
2. Snapshot puis suspension déterministe des quatre crons prévus par le contrat de déploiement.
3. Maintenance Vercel contrôlée et vérifiée.
4. Déploiement des safe-deny pré-migration selon le contrat versionné.
5. Application exclusive des migrations autorisées et classification de l'état SQL.
6. Safe-deny restantes et drain prévus.
7. Déploiement des sept Edge Functions finales depuis le candidat GOAL-007 figé.
8. Déploiement manuel Vercel du candidat GOAL-007.
9. Activation explicite du producteur en modifiant uniquement `INTERNAL_API_KEY_ACTIVE_SLOT` vers le slot prépositionné, puis vérification indirecte; cette étape ne fait jamais partie du Prerequisite Run.
10. Exécution `GOAL002_SYNTH postdeploy` avec de nouvelles identités, nouveaux credentials, nouveau préfixe et nouvel execution ID; le Run fournit explicitement la limite non secrète `GOAL002_SYNTH_AI_QUOTA_LIMIT`, `GOAL002_SYNTH_LOG_INSPECTOR_ENDPOINT` et le control token `GOAL002_SYNTH_LOG_INSPECTOR_TOKEN`, tous vérifiés au préflight, puis utilise l'adaptateur Production versionné. Le provider de logs ne retourne que le résumé redigé Vercel/Supabase Edge.
11. Réactivation et contrôle sans drift des crons, puis réactivation versionnée de `main` selon le contrat autorisé.
12. Déploiement automatique final, vérifications post-production, Evidence et revue R4; retrait ultérieur de l'ancien slot uniquement dans une opération séparément autorisée.

## Récupération

Après activation, aucun retour au secret legacy ni à un candidat vulnérable n'est autorisé. La récupération maintient maintenance, safe-deny ou crons suspendus selon l'état, restaure le nouveau release sécurisé ou applique un roll-forward versionné. Un slot partiel reste inactif; un slot capturé par un déploiement interdit toute assimilation à une simple écriture de prérequis.

## Conditions d'arrêt

Toute divergence de candidat, hash, environnement, migration, fonction, slot, nombre de déploiements, cron, test critique, teardown ou Evidence arrête le futur Run sans correction Engineering improvisée.
