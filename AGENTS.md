# Règle permanente EGIA

Un Goal EGIA ne contient jamais une mutation de production. Toute production exige un Production Run ANES indépendant et explicitement autorisé par le Founder.

Les agents doivent conserver cette séparation dans les Goals, rapports,
runbooks, Evidence, revues et décisions de statut.

## Interdiction des mutations Vercel depuis Engineering

Hors Production Run ANES indépendant et explicitement autorisé par le Founder,
l'invocation de `vercel` est interdite dès qu'elle peut produire une mutation.
Cette interdiction couvre notamment `vercel`, `vercel deploy`, `vercel --prod`,
`vercel promote`, `vercel rollback`, ainsi que toute API ou tout outil produisant
une mutation équivalente.

Seuls les appels strictement passifs d'inspection sont autorisés, par exemple la
lecture de métadonnées, d'états ou de logs, sans déclencher de requête
applicative. La disponibilité de credentials ne constitue jamais une
autorisation. Une CI verte ne constitue jamais une autorisation. Un Goal
Engineering ne peut jamais déployer.
