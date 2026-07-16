# GOAL-002 — Production Execution Plan

## Candidat

`73c40836b58f5663e810de70a169c39ab9627745`

## Environnements ciblés

- Supabase Production : `fhadiwkdznhuxtlgrwfd` / `egia-mvp`
- Vercel Production : `prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT` / `egia`
- GitHub : `melvyn69/egia-mvp`
- Ordonnanceur Production : cron-job.org

## Ordre des opérations

1. Snapshot redigé et suspension des quatre crons.
2. Déploiement Vercel Production nº 1 : maintenance globale `503`.
3. Déploiement des cinq safe-deny pré-migration.
4. Application de `20260713073853_production_security_hardening.sql`.
5. Application de `20260716142352_fix_claim_ai_tag_candidates_digest.sql`.
6. Déploiement des deux safe-deny Google GBP et drain OAuth.
7. Déploiement des sept Edge Functions sécurisées.
8. Déploiement Vercel Production nº 2 du candidat figé.
9. Exécution des tests `GOAL002_SYNTH`.
10. Réactivation inchangée des quatre crons.
11. Réactivation versionnée de `git.deploymentEnabled.main`, CI et fusion.
12. Déploiement Vercel Production nº 3 automatique et vérifications finales.
