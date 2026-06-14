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
import { addLog } from "../store/dmLogs";

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
      .setDescription("Rôle cible (facultatif) — seuls les membres de ce rôle reçoivent le DM.")
      .setRequired(false),
  )
  .addRoleOption((option) =>
    option
      .setName("exclure")
      .setDescription("Rôle à exclure (facultatif) — les membres de ce rôle ne reçoivent PAS le DM.")
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
  const excludeRoleId = interaction.options.getRole("exclure")?.id ?? undefined;

  // 2. Acquitter l'interaction IMMÉDIATEMENT avant tout appel API
  await interaction.deferReply({ ephemeral: true });

  // 3. Récupère le guild (cache ou API)
  let guild: Guild;
  try {
    const fetched = interaction.guild ?? await interaction.client.guilds.fetch(guildId);
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

  // 4. Résolution du rôle cible si fourni
  let resolvedRole: Role | null = null;
  if (roleId) {
    try {
      resolvedRole = await guild.roles.fetch(roleId);
      if (!resolvedRole) {
        await interaction.editReply("❌ Le rôle cible est introuvable sur ce serveur.");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, roleId }, "Impossible de résoudre le rôle cible");
      await interaction.editReply(`❌ Impossible de résoudre le rôle cible : \`${msg}\``);
      return;
    }
  }

  // 5. Résolution du rôle exclu si fourni
  let excludedRole: Role | null = null;
  if (excludeRoleId) {
    try {
      excludedRole = await guild.roles.fetch(excludeRoleId);
      if (!excludedRole) {
        await interaction.editReply("❌ Le rôle à exclure est introuvable sur ce serveur.");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, excludeRoleId }, "Impossible de résoudre le rôle exclu");
      await interaction.editReply(`❌ Impossible de résoudre le rôle à exclure : \`${msg}\``);
      return;
    }
  }

  // 6. Récupère tous les membres
  try {
    await guild.members.fetch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Impossible de récupérer les membres");

    // Rate-limit Discord (opcode 8) — extraire le délai et afficher un message propre
    const rateLimitMatch = msg.match(/Retry after ([\d.]+) seconds?/i);
    if (rateLimitMatch) {
      const seconds = Math.ceil(parseFloat(rateLimitMatch[1]));
      await interaction.editReply(`⏳ **Cooldown actif** — Discord limite les requêtes membres.\nRéessaie dans **${seconds} seconde${seconds > 1 ? "s" : ""}**.`);
      return;
    }

    // Problème d'intent
    if (msg.toLowerCase().includes("intent") || msg.toLowerCase().includes("privileged")) {
      await interaction.editReply("❌ Impossible de récupérer les membres.\n\nVérifie que **Server Members Intent** est activé dans le portail développeur Discord.");
      return;
    }

    await interaction.editReply(`❌ Impossible de récupérer les membres : \`${msg}\``);
    return;
  }

  const members = guild.members.cache.filter((m: GuildMember) => {
    if (m.user.bot) return false;
    if (resolvedRole && !m.roles.cache.has(resolvedRole.id)) return false;
    if (excludedRole && m.roles.cache.has(excludedRole.id)) return false;
    return true;
  });

  if (members.size === 0) {
    await interaction.editReply("⚠️ Aucun membre humain ne correspond aux critères (cible / exclusion).");
    return;
  }

  // Description de la cible pour les messages
  const targetDesc = resolvedRole ? `rôle **${resolvedRole.name}**` : "tous les membres";
  const excludeDesc = excludedRole ? ` (excl. **${excludedRole.name}**)` : "";

  // 7. Envoi en cours
  const progressEmbed = new EmbedBuilder()
    .setDescription(`📨 Envoi en cours vers **${members.size}** membre(s) — ${targetDesc}${excludeDesc}…`)
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

  // 8. Enregistrement dans les logs
  const executor = interaction.user;
  addLog(guildId, {
    executorId: executor.id,
    executorTag: executor.tag ?? executor.username,
    message,
    targetRole: resolvedRole?.name ?? null,
    excludedRole: excludedRole?.name ?? null,
    sent,
    failed,
    timestamp: new Date(),
  });

  // 9. Rapport final
  const resultEmbed = new EmbedBuilder()
    .setTitle("✅ Envoi terminé")
    .addFields(
      { name: "Cible", value: resolvedRole ? `Rôle ${resolvedRole.name}` : "Tous les membres", inline: true },
      { name: "✅ Envoyés", value: String(sent), inline: true },
      { name: "❌ Échecs", value: String(failed), inline: true },
    )
    .setColor(failed === 0 ? Colors.Green : Colors.Orange)
    .setTimestamp();

  if (excludedRole) {
    resultEmbed.addFields({ name: "🚫 Exclus", value: `Rôle ${excludedRole.name}`, inline: true });
  }

  await interaction.editReply({ embeds: [resultEmbed] });
}
