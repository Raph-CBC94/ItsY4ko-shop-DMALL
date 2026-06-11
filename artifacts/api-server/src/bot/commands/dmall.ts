import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  Role,
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
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ Tu dois être **administrateur** pour utiliser cette commande.",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "❌ Cette commande ne fonctionne que dans un serveur.", ephemeral: true });
    return;
  }

  const message = interaction.options.getString("message", true);
  const targetRole = interaction.options.getRole("role") as Role | null;

  await interaction.deferReply({ ephemeral: true });

  try {
    await guild.members.fetch();
  } catch (err) {
    logger.error({ err }, "Impossible de récupérer les membres");
    await interaction.editReply("❌ Impossible de récupérer la liste des membres. Vérifie les intents du bot.");
    return;
  }

  const members = guild.members.cache.filter((m: GuildMember) => {
    if (m.user.bot) return false;
    if (targetRole) return m.roles.cache.has(targetRole.id);
    return true;
  });

  if (members.size === 0) {
    const noTarget = targetRole
      ? `Aucun membre humain trouvé avec le rôle **${targetRole.name}**.`
      : "Aucun membre humain trouvé sur ce serveur.";
    await interaction.editReply(`⚠️ ${noTarget}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setDescription(`📨 Envoi en cours vers **${members.size}** membre(s)${targetRole ? ` (rôle : ${targetRole.name})` : ""}…`)
    .setColor(Colors.Blue);

  await interaction.editReply({ embeds: [embed] });

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

  const resultEmbed = new EmbedBuilder()
    .setTitle("✅ Envoi terminé")
    .addFields(
      { name: "Cible", value: targetRole ? `Rôle @${targetRole.name}` : "Tous les membres", inline: true },
      { name: "✅ Envoyés", value: String(sent), inline: true },
      { name: "❌ Échecs", value: String(failed), inline: true },
    )
    .setColor(failed === 0 ? Colors.Green : Colors.Orange)
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed] });
}
