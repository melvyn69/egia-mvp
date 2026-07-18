# GOAL-008 — Audit Engineering Apple Wallet optionnel

## Synthèse

GOAL-008 rend Apple Wallet optionnel, serveur-only et désactivé par défaut.
EGIA peut fonctionner sans compte Apple Developer ni matériau cryptographique
Apple. Le runtime échoue fermé avant toute lecture Apple ou tout accès Supabase,
le frontend masque la capacité et les contrats de futurs Runs excluent les six
credentials de la variante désactivée.

`Production réelle : hors-scope — Production Run ANES indépendant requis.`

## Architecture implémentée

- `APPLE_WALLET_ENABLED` accepte exactement `true` ou `false`.
- Absent, `false`, vide ou invalide : `appleWalletEnabled=false`.
- Les six entrées Apple ne sont lues que sur le chemin exact `true`.
- `true` avec set absent, partiel ou cryptographiquement invalide reste
  désactivé fail-closed.
- `true` avec set synthétique valide conserve clé chiffrée RSA ≥ 2048 bits,
  correspondance clé/certificat, identifiants exacts, validité et chaîne WWDR.
- `sharingProhibited=true` reste invariant.

Le gate est appliqué avant toute requête Supabase, import dynamique de
`passkit-generator`, génération de pass ou réponse révélant la configuration.

## Contrats API et frontend

La route `/api/loyalty/apple-pass` répond `404` avec le code stable
`APPLE_WALLET_DISABLED` et le message générique `Capability not available`
lorsque Wallet est absent, faux, invalide ou incomplet. Elle n’expose ni nom de
variable manquante, ni présence de secret, ni détail cryptographique.

`GET /api/capabilities` expose uniquement
`data.appleWalletEnabled: boolean`. Le frontend ne lit ni le flag brut, ni les
six secrets. Le tableau de fidélité n’affiche l’état Wallet que lorsque la
capacité est active; l’écran de validation rend le CTA seulement si le booléen
public vaut `true`. Lorsque Wallet est désactivé, le composant retourne `null` :
aucun bouton cassé, aucun lien vers la route et aucune promesse “bientôt”. Le QR
EGIA et le reste du parcours fidélité restent indépendants.

## Matrice des critères

| Critère | Evidence Engineering | État avant gel |
| --- | --- | --- |
| AC-01 | Tests flag absent et `false`; valeur par défaut désactivée. | Satisfait |
| AC-02 | Configuration vide compile et teste sans aucune des six entrées. | Satisfait |
| AC-03 | Test handler : `404 / APPLE_WALLET_DISABLED`, payload stable. | Satisfait |
| AC-04 | Lecteur instrumenté : seul `APPLE_WALLET_ENABLED` est lu sur les chemins désactivés. | Satisfait |
| AC-05 | Rendu SSR du CTA désactivé strictement vide; textes trompeurs supprimés. | Satisfait |
| AC-06 | QR et vérification fidélité restent hors du composant Wallet; suite de régression verte. | Satisfait |
| AC-07 | Set X.509 synthétique valide active le gate; les 33 tests GOAL-007 restent verts. | Satisfait |
| AC-08 | Capability publique booléenne; scans statiques sans nom de secret frontend. | Satisfait |
| AC-09 | Readiness et plans GOAL-008 excluent explicitement les six entrées. | Satisfait |
| AC-10 | Section d’activation future et nouveau Goal/Run obligatoires. | Satisfait |
| AC-11 | Suites, types, lint, builds et audits locaux verts; CI reste gate de fusion. | Satisfait sous gate CI |
| AC-12 | Tests locaux et matériaux synthétiques; aucune cible distante mutée. | Satisfait |
| AC-13 | Aucun Event Founder ou Production Run créé ou autorisé. | Satisfait |
| AC-14 | Candidat `fed08f9be3954084c036a26355225f184896ba31`; descendants uniquement documentaires. | Satisfait |

## Tests Engineering

- États absent, `false`, `true` valide synthétique, `true` partiel, `true`
  cryptographiquement invalide et valeurs de flag invalides.
- Non-lecture des six entrées sur tous les chemins désactivés.
- Route désactivée, payload non sensible et API de capacité faux/vrai.
- Rendu frontend sans CTA puis avec CTA lorsque la capability simulée est active.
- Présence indépendante du QR et absence des textes trompeurs.
- Non-régression GOAL-007, typechecks, lint, builds, audits dépendances,
  migration-history guard, secret scan et CI GitHub.

## Revues indépendantes

| Domaine | Verdict |
| --- | --- |
| Architecture et feature gating | `APPROVED` |
| Sécurité et Apple Wallet | `APPROVED` |
| Frontend et parcours fidélité | `APPROVED` |
| Séparation Engineering / futurs Production Runs | `APPROVED` |

La revue frontend a détecté puis fait corriger le guide et CTA Wallet statiques
de la page d’aide. La revue de séparation a détecté puis fait expliciter la gate
ANES : GOAL-008 doit être accepté en `Done` par un Event Founder ultérieur avant
la création de tout Run, puis chaque Run exige son Event Founder distinct. Les
deux domaines ont été relus et approuvés après correction.

## Résultats de validation avant gel

- GOAL-008 : états du flag, non-lecture, route, capability, frontend et X.509
  synthétique verts.
- GOAL-007 complet : A/B `24/24`, DB `13/13`, provisioner `53/53`, Apple
  `33/33`, lifecycle `41/41`, probes `23/23`, rate limit `5/5`.
- Sécurité production `32/32`, egress, historique migrations `100`, adversarial
  `29/29` et bootstrap `10/10` verts.
- Typechecks application, serveur et Edge, build frontend/backend et lint verts;
  un warning React préexistant hors périmètre reste sans erreur.
- Audits dépendances complet et production : zéro vulnérabilité.
- `git diff --check` : vert.

## Frontière et candidat

Aucun fichier GOAL-007 historique n’est réécrit, aucune migration n’est ajoutée,
aucun secret réel n’est utilisé et aucune mutation Vercel, Supabase, cron ou
donnée distante n’est exécutée. Aucun Production Run n’est créé ou autorisé.
GOAL-008 reste `Review` dans cette mission; aucun futur Prerequisite ou
Deployment Run ne peut être créé avant son acceptation explicite en `Done` par
un Event Founder ultérieur, puis un Event Founder distinct propre à chaque Run.

Le candidat complet code/tests/artefacts est figé au SHA
`fed08f9be3954084c036a26355225f184896ba31`. Après ce SHA, seuls les documents,
le Goal et les Evidence peuvent changer. Le diff descendant est contrôlé avant
push puis après fusion.
