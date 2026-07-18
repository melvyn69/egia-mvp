# GOAL-007 — Production Prerequisite Readiness Report

## Frontière

Ce rapport est un livrable Engineering non autorisant. Il ne crée ni ne nomme aucun Production Run, n'autorise aucune mutation distante et ne constate pas l'état réel de production. Une exécution exige un Production Prerequisite Run ANES indépendant et un Event Founder propre.

## Identité du candidat

- Goal source : `GOAL-007`.
- Statut attendu à la livraison : `Review`.
- Candidat applicatif : figé par le commit candidat GOAL-007 et référencé dans le Goal après gel.
- Candidat historique GOAL-002 `73c40836b58f5663e810de70a169c39ab9627745` : Evidence historique uniquement, non candidat au futur déploiement.
- Environnements préparés : Supabase `fhadiwkdznhuxtlgrwfd` / `egia-mvp`, Vercel `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`.

## Préconditions provisionnables

| Domaine | Contrat Engineering | Gate du futur Run |
| --- | --- | --- |
| Clé interne | Slots `A` et `B`, producteur sur slot actif exact, consommateur bi-slot, aucun fallback legacy. | Prépositionner uniquement le slot inactif; aucune activation. |
| Provisionnement | HTTPS direct, valeurs détenues dans le composant Keychain, sorties allowlistées, plan-first. | Event Founder, marqueur `GOAL007_PREREQUISITE_SECRET_APPLY_V1`, projets exacts et absence de déploiement concurrent. |
| Base | URL directe ou Supavisor session `5432`, TLS, base `postgres`; transaction `6543` refusée. | Accès passif validé puis injection limitée au processus exact. |
| Apple Wallet | Six entrées atomiques, chaîne et signature validées, clé chiffrée, seuil de renouvellement 30 jours. | Matériaux réels validés en mémoire dans le Prerequisite Run seulement. |
| Synthétique | Deux identités et deux tenants nouveaux par exécution; mode `prerequisite`; teardown et inventaire final. | Stack autorisée, préfixe `GOAL002_SYNTH`, aucun client réel, zéro résidu. |

Les six entrées Apple forment un ensemble indivisible : `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`, `APPLE_PASS_CERTIFICATE`, `APPLE_PASS_PRIVATE_KEY`, `APPLE_PASS_CERTIFICATE_PASSWORD`, `APPLE_WWDR_CERTIFICATE`. La racine Apple approuvée est un trust anchor public du validateur, pas une septième valeur secrète.

## Récupération préparée

- `NO_WRITES` : corriger le préflight, ne rien activer.
- `VERCEL_WRITTEN_NOT_CAPTURED` : aucun déploiement n'est autorisé; reprendre avec le même service Keychain ou supprimer les écritures selon le futur contrat.
- `SUPABASE_WRITTEN` : la valeur est immédiate mais inactive; reprendre avec le même service Keychain ou supprimer les écritures selon le futur contrat.
- Tout état `*_OUTCOME_UNKNOWN` : la présence ne prouve pas l'identité; relire le même service Keychain et réécrire idempotemment la valeur sur les deux plateformes, puis vérifier uniquement l'état inactif et non capturé.
- `captured by deployment` : état interdit dans un Prerequisite Run, arrêt fail-closed.
- Les six entrées Apple sont validées globalement puis écrites en un batch par plateforme. Après une issue inconnue, les deux batches complets sont réécrits depuis les six mêmes services Keychain; aucune restauration entrée par entrée.
- Toute fixture synthétique interrompue est récupérée par préfixe et TTL maximal de 24 heures, puis inventoriée à zéro.

## Risques résiduels Apple Wallet v0.1

- Aucun service de mise à jour distante du pass en v0.1.
- Aucune `expirationDate` métier en v0.1.
- Renouvellement obligatoire lorsque la validité restante passe sous 30 jours.
- Une compromission impose le remplacement coordonné des six entrées, sans restauration partielle.
- La reproduction et le retéléchargement restent serveur-only depuis les données métier et le set cryptographique cohérent.

## Gates restants

Avant toute mutation, le futur Run doit encore vérifier passivement les accès, portées, états distants, matériaux Apple réels, disponibilité du canal DB, absence de déploiement concurrent et autorisation fondatrice liée au contrat ANES. Le succès de ce rapport ne préjuge d'aucun de ces états distants.

## Verdict

`READY FOR A SEPARATELY AUTHORIZED PRODUCTION PREREQUISITE RUN`

Ce verdict n'est pas une autorisation de production.
