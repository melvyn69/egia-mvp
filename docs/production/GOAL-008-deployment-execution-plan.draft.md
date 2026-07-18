# GOAL-008 — Production Deployment Execution Plan sans Apple Wallet (Draft)

## Statut non exécutable

Ce brouillon remplace le plan GOAL-007 pour la seule variante sans Apple Wallet.
Il ne modifie aucune Evidence historique, ne porte aucun identifiant officiel
de Production Run et reste **NON EXÉCUTABLE** tant qu’un Production Prerequisite
Run séparé n’a pas réussi et qu’un nouveau Production Deployment Run ANES avec
Event Founder propre n’a pas été explicitement autorisé.

La mission GOAL-008 actuelle s’arrête à `Review`. Aucun Production Prerequisite
Run ou Production Deployment Run ne peut être créé, autorisé ou exécuté avant
un Event Founder ultérieur acceptant GOAL-008 en `Done`; chaque futur Run exige
ensuite un Event Founder distinct.

Le candidat GOAL-008 est `À_FIGER_GOAL_008`. Le présent document n’est aucune
autorisation de production.

## Préconditions supplémentaires

- Evidence acceptée du Prerequisite Run sans Wallet : protocole A/B et canal DB
  valides, teardown réussi et zéro résidu.
- `APPLE_WALLET_ENABLED=false`; aucune des six entrées Apple n’a été écrite.
- Candidat GOAL-008 inchangé et descendants exclusivement documentaires.
- Recovery roll-forward et maintenance préparées selon le contrat autorisé.

## Séquence préparatoire du futur Run

1. Préflight passif et revue R4 `APPROVED FOR FIRST MUTATION`.
2. Vérification non sensible de `APPLE_WALLET_ENABLED=false`, sans lecture des
   six entrées Apple.
3. Exécution des étapes de maintenance, safe-deny, migrations et fonctions
   strictement listées par l’Event Founder du futur Run.
4. Déploiement manuel du candidat GOAL-008 avec Wallet désactivé.
5. Activation explicite du seul slot A/B prévu; aucune activation Wallet.
6. Exécution `GOAL002_SYNTH postdeploy` avec de nouvelles identités et fixtures.
7. Vérification des fonctionnalités principales : authentification,
   isolation, Google, fidélité non-Wallet et parcours QR selon le payload.
8. Vérification de la route Wallet : statut `404`, code strict
   `APPLE_WALLET_DISABLED`, aucune donnée de configuration interne.
9. Vérification frontend : aucun bouton, lien ou CTA Apple Wallet actif et
   aucune promesse Wallet visible; le parcours fidélité QR reste fonctionnel.
10. Vérification qu’aucune des six variables Apple n’a été écrite pendant le
    Run, sans en lire ou publier les valeurs.
11. Teardown synthétique, preuve de zéro résidu, réactivation contrôlée des
    composants explicitement prévus, Evidence et revue R4 finale.

## Activation Apple interdite

Le futur Run ne peut pas transformer cette variante en variante Wallet. Une
activation exige un nouveau Goal accepté, un compte Apple Developer actif, les
six éléments complets, validation cryptographique, nouveau Readiness Report,
nouveau plan, nouveau candidat si nécessaire et Production Run distinct
explicitement autorisé. Un ajout manuel de variables est une divergence et
déclenche l’arrêt.

## Récupération et conditions d’arrêt

La récupération suit exclusivement le roll-forward versionné du futur Run.
Toute divergence de candidat, hash, flag, environnement, migration, fonction,
slot, nombre de déploiements, test critique, CTA Wallet, teardown ou Evidence
arrête le Run sans correction Engineering improvisée.
