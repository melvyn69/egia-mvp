# GOAL-008 — Production Prerequisite Execution Plan sans Apple Wallet

## Statut

Plan préparatoire non exécutable hors d’un Production Prerequisite Run ANES
indépendant explicitement autorisé. Il ne contient aucun identifiant officiel
de Run, n’active aucun slot, ne crée aucun credential Apple et n’autorise aucun
déploiement. GOAL-008 doit d’abord avoir été accepté en `Done` par un Event
Founder ultérieur; le futur Production Prerequisite Run exige ensuite son
propre Event Founder distinct. `Review` ne permet pas de créer ou d’autoriser
ce Run.

## Variante obligatoire

- Candidat figé : `fed08f9be3954084c036a26355225f184896ba31`.
- `APPLE_WALLET_ENABLED=false`.
- Les six variables `APPLE_*` de GOAL-007 sont hors du payload et hors de la
  checklist; elles ne sont jamais lues ou écrites.
- Cibles et identités autorisées : celles du futur Event Founder, avec données
  exclusivement `GOAL002_SYNTH`.

## Ordre exact du futur Run

1. **Préflight passif** — vérifier Event Founder, candidat, hashes, cibles,
   protections, absence de déploiement concurrent et sélection explicite de la
   variante sans Wallet.
2. **Gate Wallet sans secret** — vérifier uniquement que
   `APPLE_WALLET_ENABLED=false`; ne lire aucune des six entrées Apple et arrêter
   si la valeur est `true` ou invalide.
3. **Validation DB** — valider projet, TLS, base `postgres` et canal direct ou
   Supavisor session `5432`; refuser transaction `6543`.
4. **Protocole A/B** — générer et prépositionner uniquement le slot inactif
   selon le mécanisme GOAL-007, sans modifier `INTERNAL_API_KEY_ACTIVE_SLOT`.
5. **Création synthétique `prerequisite`** — créer de nouvelles identités,
   tenants et fixtures minimales avec un nouvel execution ID et le préfixe
   dédié; aucune donnée cliente.
6. **Validations** — prouver setup, ownership, isolation et absence de capacité
   métier avant activation; aucune génération ou validation de pass Apple.
7. **Teardown** — révoquer sessions et supprimer Storage, Database, Auth,
   mailbox et quotas synthétiques, en succès comme en interruption.
8. **Zéro résidu** — inventorier par execution ID et préfixe, exiger un total
   nul et rester fail-closed sinon.
9. **Evidence** — conserver uniquement statuts et classifications allowlistés,
   sans valeur, body distant, hash ou fingerprint de secret.

## Conditions d’arrêt

Arrêt immédiat sur flag Wallet `true` ou invalide, demande d’un credential
Apple, cible divergente, secret exposé, canal DB interdit, slot actif modifié,
donnée réelle requise, teardown incomplet, résidu non nul ou opération
supplémentaire nécessaire.

## Interdictions

Aucune écriture des six variables Apple. Aucune activation Apple Wallet.
Aucun Preview. Aucun déploiement Vercel ou Edge. Aucune migration. Aucun cron.
Aucun compte ni datum client. Aucun changement Engineering pendant le Run.
