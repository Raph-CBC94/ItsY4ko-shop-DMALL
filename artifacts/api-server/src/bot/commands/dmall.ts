import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  Role,
  Guild,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("dmall")
  .setDescription("Envoie un message privé à tous les membres du serveur (ou à ceux d'un rôle précis).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Le message à envoyer en DM.")
      .setRequired(true)
      .setMaxLength(1900),
  )
  .addRoleOption((option) =>
    option
      .setName("role")
      .setDescription("Rôle cible (facultatif). Sans ce paramètre, tous les membres reçoivent le DM.")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Vérifications synchrones (pas d'API) — avant tout
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ Tu dois être **administrateur** pour utiliser cette commande.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Cette commande ne fonctionne que dans un serveur.", ephemeral: true });
    return;
  }

  const message = interaction.options.getString("message", true);
  const roleId = interaction.options.getRole("role")?.id ?? undefined;

  // 2. Acquitter l'interaction IMMÉDIATEMENT avant tout appel API
  await interaction.deferReply({ ephemeral: true });

  // 3. Récupère le guild (cache ou API)
  let guild: Guild;
  try {
    const fetched = interaction.guild ?? await interaction.client.guilds.fetch(guildId);
    // guilds.fetch peut retourner OAuth2Guild (liste) — on force un fetch complet si nécessaire
    if (!("members" in fetched)) {
      guild = await interaction.client.guilds.fetch({ guild: guildId, force: true }) as Guild;
    } else {
      guild = fetched as Guild;
    }
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, guildId }, "Impossible de récupérer le guild");
    if (code === 10004) {
      await interaction.editReply("❌ Le bot n'est pas membre de ce serveur. Réinvite-le via le lien d'invitation, puis réessaie.");
    } else {
      await interaction.editReply(`❌ Impossible d'accéder au serveur : \`${msg}\``);
    }
    return;
  }

  // 4. Résolution du rôle si fourni
  let resolvedRole: Role | null = null;
  if (roleId) {
    try {
      resolvedRole = await guild.roles.fetch(roleId);
      if (!resolvedRole) {
        await interaction.editReply("❌ Le rôle spécifié est introuvable sur ce serveur.");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, roleId }, "Impossible de résoudre le rôle");
      await interaction.editReply(`❌ Impossible de résoudre le rôle : \`${msg}\``);
      return;
    }
  }

  // 5. Récupère tous les membres
  try {
    await guild.members.fetch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Impossible de récupérer les membres");
    await interaction.editReply(`❌ Impossible de récupérer les membres : \`${msg}\`\n\nVérifie que **Server Members Intent** est activé dans le portail développeur Discord.`);
    return;
  }

  const members = guild.members.cache.filter((m: GuildMember) => {
    if (m.user.bot) return false;
    if (resolvedRole) return m.roles.cache.has(resolvedRole!.id);
    return true;
  });

  if (members.size === 0) {
    const noTarget = resolvedRole
      ? `Aucun membre humain trouvé avec le rôle **${resolvedRole.name}**.`
      : "Aucun membre humain trouvé sur ce serveur.";
    await interaction.editReply(`⚠️ ${noTarget}`);
    return;
  }

  // 6. Envoi en cours
  const progressEmbed = new EmbedBuilder()
    .setDescription(`📨 Envoi en cours vers **${members.size}** membre(s)${resolvedRole ? ` (rôle : ${resolvedRole.name})` : ""}…`)
    .setColor(Colors.Blue);
  await interaction.editReply({ embeds: [progressEmbed] });

  let sent = 0;
  let failed = 0;

  for (const [, member] of members) {
    try {
      await member.send(message);
      sent++;
    } catch {
      failed++;
      logger.warn({ userId: member.user.id }, "DM non envoyé (DMs fermés ?)");
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 7. Rapport final
  const resultEmbed = new EmbedBuilder()
    .setTitle("✅ Envoi terminé")
    .addFields(
      { name: "Cible", value: resolvedRole ? `Rôle ${resolvedRole.name}` : "Tous les membres", inline: true },
      { name: "✅ Envoyés", value: String(sent), inline: true },
      { name: "❌ Échecs", value: String(failed), inline: true },
    )
    .setColor(failed === 0 ? Colors.Green : Colors.Orange)
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed] });
}
