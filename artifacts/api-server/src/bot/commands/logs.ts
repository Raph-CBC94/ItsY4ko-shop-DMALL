import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { getLogs } from "../store/dmLogs";

export const data = new SlashCommandBuilder()
  .setName("logs")
  .setDescription("Affiche les 3 derniers envois /dmall sur ce serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const entries = getLogs(guildId);

  if (entries.length === 0) {
    await interaction.reply({
      content: "📭 Aucun envoi `/dmall` enregistré sur ce serveur depuis le dernier démarrage du bot.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Derniers envois DM ALL")
    .setColor(Colors.Purple)
    .setTimestamp();

  for (const [i, entry] of entries.entries()) {
    const label = i === 0 ? "🕐 Dernier envoi" : i === 1 ? "🕑 Avant-dernier" : "🕒 Il y a 3 envois";
    const preview = entry.message.length > 80 ? entry.message.slice(0, 77) + "…" : entry.message;
    const cible = entry.targetRole ? `Rôle \`${entry.targetRole}\`` : "Tous les membres";
    const exclu = entry.excludedRole ? `\n🚫 Exclu : \`${entry.excludedRole}\`` : "";
    const ts = Math.floor(entry.timestamp.getTime() / 1000);

    embed.addFields({
      name: `${label} — <t:${ts}:R>`,
      value: [
        `👤 **Par :** <@${entry.executorId}> (${entry.executorTag})`,
        `🎯 **Cible :** ${cible}${exclu}`,
        `✅ **Envoyés :** ${entry.sent}  ❌ **Échecs :** ${entry.failed}`,
        `💬 **Message :** \`${preview}\``,
      ].join("\n"),
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
