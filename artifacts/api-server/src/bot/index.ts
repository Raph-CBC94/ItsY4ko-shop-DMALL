import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Collection,
  Events,
  ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../lib/logger";
import * as dmall from "./commands/dmall";

interface Command {
  data: { name: string; toJSON(): unknown };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(dmall.data.name, dmall);

async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST().setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON());

  logger.info({ count: body.length }, "Enregistrement des commandes slash...");
  await rest.put(Routes.applicationCommands(clientId), { body });
  logger.info("Commandes slash enregistrées avec succès.");
}

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN manquant — bot Discord non démarré.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Bot Discord connecté");
    try {
      await registerCommands(token, c.user.id);
    } catch (err) {
      logger.error({ err }, "Échec de l'enregistrement des commandes slash");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Erreur lors de l'exécution de la commande");
      const msg = { content: "❌ Une erreur est survenue lors de l'exécution de la commande.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => undefined);
      } else {
        await interaction.reply(msg).catch(() => undefined);
      }
    }
  });

  await client.login(token);
}
