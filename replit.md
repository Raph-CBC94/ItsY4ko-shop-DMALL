# DM All — Bot Discord

Bot Discord avec la commande `/dmall` pour envoyer des messages privés en masse à tous les membres d'un serveur ou à ceux d'un rôle précis.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — démarre le serveur API + le bot Discord
- `pnpm run typecheck` — vérification TypeScript complète
- Required env: `DISCORD_BOT_TOKEN` — token du bot Discord (secret Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/bot/index.ts` — démarrage du client Discord, enregistrement des commandes
- `artifacts/api-server/src/bot/commands/dmall.ts` — logique de la commande `/dmall`
- `artifacts/api-server/src/index.ts` — point d'entrée, lance Express + le bot

## Architecture decisions

- Le bot est intégré au serveur Express existant — un seul process, démarrage en parallèle.
- Les commandes slash sont auto-enregistrées globalement au démarrage (`Routes.applicationCommands`).
- L'envoi DM est throttlé à 500 ms entre chaque membre pour respecter les rate limits Discord.
- Les DMs échoués (DMs fermés) sont comptabilisés mais n'interrompent pas l'envoi.
- La commande est protégée côté Discord (`setDefaultMemberPermissions(Administrator)`) ET vérifiée côté code.

## Product

- `/dmall message:<texte> [role:<rôle>]` — Envoie un DM à tous les membres (ou aux membres d'un rôle).
- Réservée aux administrateurs.
- Retourne un rapport d'envoi : nombre de DMs envoyés / échoués.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- L'intent `Server Members Intent` doit être activé dans le portail développeur Discord.
- Les commandes slash globales peuvent mettre jusqu'à 1 h à apparaître sur les nouveaux serveurs (en pratique quasi-instantané).
- Les membres avec les DMs désactivés comptent comme "échecs" — comportement normal.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
