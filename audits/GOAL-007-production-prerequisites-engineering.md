# GOAL-007 — Rapport Engineering des prérequis de production

## Synthèse

GOAL-007 transforme les prérequis manuels bloquants en composants versionnés, bornés et testables sans mutation distante. L'Engineering reste séparé des futurs Prerequisite et Deployment Runs ANES. Aucun ID de Run, Event Founder ou état réel de production n'est créé par ce rapport.

## Protocole A/B

Le producteur Edge lit `INTERNAL_API_KEY_ACTIVE_SLOT`, accepte uniquement `A` ou `B`, valide le slot exact et échoue avant tout appel externe. Le consommateur Vercel accepte tout slot A/B non vide et valide, compare avec `timingSafeEqual`, refuse l'en-tête absent et ne lit jamais `INTERNAL_API_KEY`. Les contrôles tenant et business existants restent après cette frontière interne.

La rotation est volontairement décomposée : prépositionnement inactif sur Vercel et Supabase, déploiement du consommateur bi-slot, activation explicite du producteur, vérification indirecte, retrait ultérieur de l'ancien slot. Aucune de ces activations n'appartient au Prerequisite Run.

## Provisionnement et zéro-copie

`scripts/lib/goal007-secret-provisioner.mjs` fournit le plan, les états partiels, les timeouts, l'allowlist de cibles et de noms et un transport injectable pour tests locaux. `scripts/goal007-keychain-provisioner.swift` est le composant macOS qui matérialise les valeurs : il lit secret et control tokens via Security.framework, effectue lui-même les deux requêtes HTTPS vers les projets exacts et ne renvoie qu'un statut JSON allowlisté. Le parent ne passe que marqueur, services, comptes et nom de variable; aucune valeur n'est placée dans argv, fichier ou child process.

Les états de récupération sont `NO_WRITES`, `VERCEL_WRITTEN_NOT_CAPTURED`, `SUPABASE_WRITTEN` et les variantes explicites `*_OUTCOME_UNKNOWN`. Une issue connue peut reprendre uniquement la cible manquante. Après toute issue inconnue, la présence ne prouve jamais l'identité de la valeur : le même service Keychain réécrit idempotemment la valeur complète sur Vercel et Supabase, puis le futur Run vérifie seulement l'état inactif et non capturé. Un état Vercel déjà capturé par un déploiement est refusé. Le POST Vercel utilise l'upsert officiel pour rendre les rotations A/B répétables. Les tests sur vrais serveurs locaux et le self-test Swift couvrent les deux ordres, codes HTTP, body malicieux, coupure réseau, timeout, interruption, reprise et sorties sans refléter la canarie.

Les six entrées Apple utilisent un chemin batch distinct : validation globale obligatoire, un batch Vercel et un batch Supabase. Après une issue inconnue, les six valeurs sont relues depuis les mêmes services Keychain et les deux batches complets sont réécrits idempotemment. Le bridge Swift porte le même contrat, un timeout de dix secondes et un operation ID aléatoire.

## Canal DB

`scripts/lib/goal007-db-channel.mjs` consomme puis retire `SUPABASE_DB_URL` de l'environnement du processus. Il n'accepte que le projet `fhadiwkdznhuxtlgrwfd`, la base `postgres`, TLS `require`/`verify-ca`/`verify-full`, le direct `db.<ref>.supabase.co:5432` ou Supavisor session `*.pooler.supabase.com:5432` avec utilisateur `postgres.<ref>`. Le port transaction `6543`, les projets, utilisateurs, bases et ports divergents sont refusés. L'inspecteur ne sort que sa classification existante et des codes redigés.

## Apple Wallet

Le runtime exige les six entrées distinctes, une clé privée chiffrée RSA d'au moins 2048 bits correspondant au certificat, les identifiants Pass Type et Team, et une signature par WWDR; toute erreur devient un code générique. Le pass fixe `sharingProhibited=true` et reste générable depuis le serveur.

Le préflight local vérifie PEM, passphrase, correspondance clé/certificat, force RSA, DN exact, dates, seuil 30 jours, valeur et criticité des extensions Key Usage/EKU/AKI/Apple Pass Type, égalité AKI/SKI, chaîne leaf→WWDR→une des trois racines Apple épinglées par fingerprint SHA-256, signature, hashes du manifeste, CMS/PKCS#7 détaché, `pass.json`, QR et MIME. Les vérifications ZIP et CMS restent en mémoire ou en pipes, sans fichier de matériau. Les tests sont synthétiques et leur répertoire temporaire est supprimé; rien de réel n'est lu.

Risques v0.1 acceptés : pas de service de mise à jour distante, pas d'expiration métier. Le renouvellement est déclenché sous 30 jours. Une compromission requiert le remplacement coordonné des six entrées; aucune restauration partielle.

## Runner synthétique

`scripts/goal002-synth.mjs` refuse toute cible non autorisée et toute voie `SUPABASE_ACCESS_TOKEN`; localement il exige loopback, et le chemin futur exige le projet exact et un marqueur propre au mode. Le service role sert seulement au setup, inventaire et teardown. Les utilisateurs A/B opèrent avec des JWT ordinaires. Chaque mode crée un execution ID, deux e-mails préfixés, deux mots de passe et un préfixe neufs. Une mailbox locale ou un provider HTTPS one-shot fournit consommation, timeout, nettoyage et inventaire.

`prerequisite` prouve setup, ownership, isolation minimale, programme fidélité désactivé, aucune capacité Wallet, teardown et zéro résidu. `postdeploy` recrée un jeu distinct et branche une mailbox one-shot. Son adaptateur Production versionné borne les cibles exactes, utilise exclusivement les JWT A/B pour les assertions et réserve le service role au setup et au teardown. L'absence de membre pour l'e-mail synthétique avant preuve, combinée à la FK `wallet_passes.member_id NOT NULL` vers `loyalty_members`, prouve qu'aucune capacité Wallet ne peut exister. Les quotas fidélité synthétiques emploient un préfixe accepté seulement après validation du JWT et de l'`app_metadata`; ils restent ainsi inventoriables sans dépendre de l'IP vue par Vercel. L'adaptateur prépare aussi le quota IA synthétique et exécute les 23 probes métier et sécurité. Ces probes sont testées sur transports locaux simulés et ne sont pas exécutées contre une cible distante pendant GOAL-007.

Le `finally` révoque globalement les sessions et prouve le refus des anciens refresh tokens, supprime Storage, Database, demandes d'enrôlement, buckets de rate limit préplanifiés ou préfixés et Auth, vide la mailbox distante par préfixe, puis inventorie le préfixe et échoue si une suppression ou le total final diverge. L'Auth est conservée comme index de récupération si Storage ou Database échoue. Les chemins Storage sont persistés avant upload et les clés de quotas avant création des buckets. Le provider HTTPS d'inspection des logs n'accepte qu'un execution ID et un timestamp et ne retourne qu'un résumé Vercel/Supabase Edge; le runner exige zéro correspondance sensible et zéro 5xx inattendu. Le cleanup TTL est paginé et reconstruit l'inventaire depuis les métadonnées synthétiques. Les exécutions locales isolées finales `b8f7edca-77e9-4e36-8f15-d93bd54c834a` (`prerequisite`) et `5d092006-05ed-4921-b35f-efac5f46365f` (`postdeploy`) ont terminé avec `teardown=true` et `residueCount=0`; A a lu son asset et B a été refusé.

## Absence de migration et frontière de livraison

Aucun fichier de migration, schéma ou recovery historique n'est modifié. La baseline canonique GOAL-005 et les migrations existantes ont été rejouées sur une stack locale isolée; les deux modes du runner y ont réussi. Les plans produits sont préparatoires et non autorisants. `PROD-RUN-001`, GOAL-002 et leurs Evidence restent immuables.

## Candidat

Le candidat applicatif GOAL-007 est figé au SHA `2d341bbca3bb49bfa6d69b607d039ffc17079071`. Tout descendant autorisé est exclusivement documentaire. Ce SHA inclut la gestion portable et fail-closed de la fermeture anticipée des pipes OpenSSL constatée par la CI Linux; la revue Apple a reconfirmé `APPROVED`.

## Validations finales

- Tests existants, sécurité production et GOAL-006 : verts (`32` contrôles sécurité, `10/10` GOAL-006).
- GOAL-007 : A/B `24/24`, DB `13/13`, provisioner `53/53`, Apple `33/33`, lifecycle `41/41`, probes postdeploy `23/23`, quotas synthétiques `5/5`.
- Migration history `100` migrations et adversarial `29/29`; bootstrap canonique et garde-fous `10/10`.
- Typechecks Node et Edge, build application et build maintenance : verts.
- Lint : zéro erreur; un warning préexistant hors périmètre dans `src/services/coach/useCoachResult.ts`.
- Audits complet et production : zéro vulnérabilité; recherches credentials et usage actif du nom legacy : propres; `git diff --check` : vert.
- Stack Supabase locale isolée : deux modes verts et inventaires finaux nuls. Aucune cible distante n'a été mutée.

## Revues indépendantes

| Domaine | Verdict |
| --- | --- |
| Architecture et protocole A/B | `APPROVED` |
| Sécurité des secrets et zéro-copie | `APPROVED` |
| Supabase/Auth/Database/Storage | `APPROVED` |
| Apple Wallet | `APPROVED` |
| Runner synthétique et teardown | `APPROVED` |
| Séparation Engineering / Prerequisite Run / Deployment Run | `APPROVED` |
