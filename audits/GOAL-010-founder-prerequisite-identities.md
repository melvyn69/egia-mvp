# Audit GOAL-010 — Identités Founder prerequisite

## État initial

- Baseline EGIA : `b4107cc3d907014db091d02bb3235f219cf10eb2`.
- Baseline ANES lue : `46446dd31d7c5991ddb45953db1162579c2d879f`.
- GOAL-002, GOAL-007, GOAL-008 et GOAL-009 : `Done`.
- PROD-RUN-001 à PROD-RUN-004 : `blocked`, inchangés.
- Dépôts propres et synchronisés avant création de la branche.
- Déploiement Vercel le plus récent avant GOAL-010 :
  `dpl_EvjmBfkskwVGmhRW2uiJag869c1W`; zéro état `BUILDING` ou `QUEUED`.

## Cause racine confirmée

Le lanceur Production ne consomme pas les deux identités Founder et construit
un provider mailbox même en `prerequisite`. Le runner génère A/B depuis un
domaine unique. Le chemin Auth Admin prerequisite utilise `email_confirm: true`
et ne produit aucun e-mail; la mailbox n'est requise que par `postdeploy`.

## Scope validé

La correction reste entièrement contenue dans les quatre fichiers applicatifs
autorisés et les deux documents GOAL-010. Le workflow CI appelle déjà
`npm run test:goal-007`, qui inclut `test:goal-007:synth`; aucune modification
CI, dépendance, migration ou runtime utilisateur n'est nécessaire.

## Implémentation

Le lanceur consomme les deux entrées Founder et les supprime immédiatement de
l'environnement. Présence, format et distinction sont validés sans inclure de
valeur ou de dérivé dans les erreurs. Le runner n'instancie et n'invoque aucune
mailbox en `prerequisite`. Le chemin `postdeploy` conserve le domaine contrôlé,
le provider TLS, la consommation one-shot, le nettoyage et le contrôle de
résidu.

La récupération d'une identité fixe vérifie toutes les collisions avant toute
suppression. Elle exige un utilisateur Auth marqué synthétique, mode
`prerequisite`, côté A/B et préfixe UUID synthétique valide. Un utilisateur
non synthétique entraîne `FOUNDER_EMAIL_ALREADY_IN_USE`, sans cleanup. Les
ressources auxiliaires Founder utilisent le domaine fixe non routable du
runner, jamais un domaine dérivé des identités.

## Matrice contractuelle — 20/20

1. deux identités explicites valides sont acceptées en prerequisite Production;
2. A est affectée à l'identité A;
3. B est affectée à l'identité B;
4. les deux variables sont supprimées après leur unique lecture;
5. Evidence et erreurs ne contiennent aucune identité ou dérivé;
6. A absente échoue fail-closed;
7. B absente échoue fail-closed;
8. une valeur partielle échoue fail-closed;
9. deux valeurs identiques sans distinction de casse échouent;
10. un format invalide échoue;
11. prerequisite n'instancie ni n'invoque le provider distant;
12. prerequisite n'exige ni endpoint ni token mailbox;
13. prerequisite ne produit aucun effet mailbox;
14. son teardown termine avec `residueCount=0`;
15. une interruption laisse deux résidus, puis la reprise les récupère et
    termine à zéro;
16. une collision non synthétique reste intacte et ne déclenche aucun cleanup;
17. postdeploy conserve la sélection obligatoire de la mailbox distante;
18. le runner postdeploy exerce le provider HTTPS dans l'ordre
    `consume → count → clear → count` et termine à zéro;
19. les identités postdeploy historiques restent générées et compatibles;
20. identités et mots de passe sont effacés de l'objet d'exécution et absents
    de l'Evidence.

Résultats : `GOAL-010 20/20`, lifecycle historique `41/41`.

## Validations finales

| Commande | Résultat |
| --- | --- |
| `npm ci` | PASS — 523 packages installés depuis le lockfile inchangé |
| `npm run test:goal-007:synth` | PASS — GOAL-010 `20/20`, lifecycle `41/41` |
| `npm run test:goal-007:provisioner` | PASS — `53/53` |
| `npm run test:goal-007:internal-key` | PASS — `24/24` |
| `npm run test:goal-007:db-channel` | PASS — `13/13` |
| `npm run test:goal-008` | PASS |
| `npm run test:google-cron-rpc-binding` | PASS |
| `npm run test:inbox-review-replies-loop` | PASS — `19/19` |
| `npm test` | PASS — egress guardrails |
| `npm run test:production-security` | PASS — `32/32` |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zéro erreur, un avertissement historique |
| `npm run build:server` | PASS |
| `npm run build` | PASS — avertissements non bloquants historiques |
| `git diff --check` | PASS |

Les artefacts `dist/` générés par la validation ont été retirés du workspace;
aucun fichier généré n'est conservé.

## Revues indépendantes finales

1. Identités et confidentialité : `APPROVED` — consommation/suppression A/B,
   redaction, validation atomique des collisions et protection stricte des
   utilisateurs non synthétiques confirmées.
2. Séparation prerequisite/postdeploy : `APPROVED` — zéro effet mailbox en
   prerequisite; séquence HTTPS one-shot intégrée et récupération résiduelle
   démontrées.
3. Production et non-régression : `APPROVED` — scope borné, suites vertes,
   bridge/tokens inchangés, aucune mutation distante.

## Canaux de contrôle

Le bridge versionné attend `VERCEL_API_TOKEN` et `SUPABASE_ACCESS_TOKEN` via
Keychain, lit lui-même les secrets et ne les place ni dans les arguments ni
dans l'environnement du processus parent. Ses self-tests `53/53` sont verts.
L'absence locale de ces deux services reste un prérequis opérationnel futur,
hors scope et non bloquant pour GOAL-010.

## Gel du candidat

- SHA candidat : à consigner après le commit applicatif final.
- SHA descendant documentaire : à consigner après la transition à `Review`.
- Diff candidat → descendant : devra contenir uniquement les deux documents
  GOAL-010.

## Mutations distantes

Aucune mutation Vercel, Supabase ou applicative n'est autorisée ni exécutée par
GOAL-010.
