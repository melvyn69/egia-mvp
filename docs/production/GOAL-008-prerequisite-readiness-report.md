# GOAL-008 — Production Prerequisite Readiness Report sans Apple Wallet

## Frontière

Ce rapport est un livrable Engineering non autorisant. Il ne crée, ne nomme et
n’autorise aucun Production Run, aucune mutation distante et aucun déploiement.
Une exécution future exige un Production Prerequisite Run ANES indépendant et
un Event Founder propre. La mission actuelle s’arrête à `Review` : aucun futur
Production Prerequisite Run ne peut être créé, autorisé ou exécuté avant un
Event Founder ultérieur acceptant explicitement GOAL-008 en `Done`.

## Variante de candidat

- Goal source : `GOAL-008`.
- Statut Engineering maximal de cette mission : `Review`.
- Candidat applicatif : `À_FIGER_GOAL_008`.
- Feature flag contractuel : `APPLE_WALLET_ENABLED=false`.
- GOAL-007 reste `Done`; son candidat et ses Evidence historiques ne sont pas modifiés.

## Verdict sur Apple Wallet

Lorsque `APPLE_WALLET_ENABLED=false`, Apple Wallet est explicitement absent du
périmètre du futur Run. Les six entrées suivantes ne sont ni requises, ni lues,
ni validées, ni écrites :

- `APPLE_PASS_PRIVATE_KEY`;
- `APPLE_PASS_CERTIFICATE_PASSWORD`;
- `APPLE_PASS_CERTIFICATE`;
- `APPLE_WWDR_CERTIFICATE`;
- `APPLE_PASS_TYPE_IDENTIFIER`;
- `APPLE_TEAM_IDENTIFIER`.

L’absence totale de ces six entrées est l’état attendu de la variante sans
Wallet et ne constitue ni un blocker, ni un warning de readiness, ni une raison
d’échec du futur Prerequisite Run.

## Préconditions restantes

| Domaine | Contrat Engineering | Gate du futur Run |
| --- | --- | --- |
| Clé interne | Protocole A/B GOAL-007, aucun fallback legacy. | Prépositionnement du seul slot inactif, sans activation. |
| Canal DB | Direct ou Supavisor session `5432`, TLS, base `postgres`; transaction `6543` refusée. | Validation passive et injection limitée au processus autorisé. |
| Synthétique | Identités et fixtures exclusivement synthétiques et neuves. | Setup, ownership, isolation, validations, teardown et zéro résidu. |
| Wallet désactivé | Flag `false`, route fail-closed, CTA absent. | Aucun credential Apple et aucune écriture `APPLE_*`. |

Le futur Prerequisite Run sans Wallet reste strictement limité au protocole de
clé A/B, au canal DB, aux identités et fixtures synthétiques, aux validations,
au teardown et à la preuve de zéro résidu.

## Gates de configuration

- `APPLE_WALLET_ENABLED` doit être absent ou égal exactement à `false`; le plan
  de la variante choisit explicitement `false` pour rendre la décision visible.
- Une valeur `true` ou invalide ne peut pas être corrigée pendant le Run : arrêt
  avant toute mutation et retour en Engineering.
- La recherche de variables doit vérifier les noms autorisés sans lire ou
  afficher leurs valeurs.
- Aucun test du futur Run ne doit demander un certificat, un compte Apple
  Developer, une passphrase, une clé ou un identifiant Apple.

## Activation ultérieure exclue

Toute activation future exige un compte Apple Developer actif, les six éléments
complets, la validation cryptographique GOAL-007, un nouveau Readiness Report,
un nouveau plan, un nouveau candidat si nécessaire, un Goal Engineering ou
d’activation accepté et un Production Run distinct explicitement autorisé.
L’ajout manuel de variables n’est jamais une activation autorisée.

## Verdict

`READY FOR A SEPARATELY AUTHORIZED PRODUCTION PREREQUISITE RUN WITH APPLE WALLET DISABLED`

Ce verdict n’est pas une autorisation de production.
