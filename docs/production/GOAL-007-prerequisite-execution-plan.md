# GOAL-007 — Production Prerequisite Execution Plan

## Statut

Plan préparatoire court et non exécutable hors d'un Production Prerequisite Run ANES indépendant explicitement autorisé. Il ne contient aucun identifiant officiel de Run, n'active aucun slot et n'autorise aucun déploiement.

## Cibles bornées

- Supabase : `fhadiwkdznhuxtlgrwfd` / `egia-mvp`.
- Vercel : `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`.
- Données : identités, tenants et objets exclusivement `GOAL002_SYNTH`.

## Ordre exact

1. **Préflight passif** — vérifier l'autorisation ANES, les cibles, l'absence de déploiement concurrent, les noms et portées attendus et le statut inactif du slot choisi; aucune valeur n'est affichée.
2. **Validation Apple** — charger les six entrées dans le composant autorisé et exécuter en mémoire le validateur cryptographique complet, y compris chaîne, identifiants, validité supérieure ou égale à 30 jours et pass synthétique signé.
3. **Validation DB** — valider le projet, TLS, la base `postgres` et un canal direct ou Supavisor session `5432`; refuser explicitement transaction `6543`.
4. **Génération et prépositionnement d'un slot inactif** — générer CSPRNG dans le composant Keychain, écrire le même slot inactif sur Vercel Production-next-deployment et Supabase Edge, sans modifier `INTERNAL_API_KEY_ACTIVE_SLOT`.
5. **Écritures Apple** — après le marqueur de préflight réussi, écrire le set complet des six entrées en un batch Vercel puis un batch Supabase; sur issue inconnue, relire les mêmes six services Keychain et réécrire idempotemment les deux batches complets. Aucune restauration entrée par entrée n'est autorisée.
6. **Création synthétique en mode `prerequisite`** — créer deux utilisateurs ordinaires, deux tenants et les fixtures minimales avec un nouvel execution ID et le préfixe dédié.
7. **Vérifications de setup** — prouver ownership, isolation de base et absence de capacité métier ou Wallet avant activation.
8. **Teardown** — révoquer les sessions, supprimer Storage, Database et Auth, et vider la mailbox contrôlée, y compris après interruption.
9. **Preuve de zéro résidu** — inventorier par execution ID et préfixe; exiger un total nul, sinon rester fail-closed et appliquer la récupération TTL.
10. **Evidence** — conserver uniquement les classifications et statuts allowlistés, sans valeur, body distant, hash ou fingerprint de secret.

## Conditions d'arrêt

Arrêt immédiat sur cible ou contrat divergent, secret exposé, set Apple incomplet, canal DB interdit, slot déjà capturé par un déploiement, activation observée, donnée non synthétique requise, teardown incomplet, résidu non nul ou opération supplémentaire nécessaire.

## Interdictions

Aucune activation de slot. Aucun Preview. Aucun déploiement Vercel ou Edge. Aucune migration. Aucun cron. Aucun compte ni datum client. Aucun changement Engineering pendant le Run.
