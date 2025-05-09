import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type AniDubBot from "..";
import { CLIENT_ID, REDIRECT_URL } from "../../config";
import { User } from "../../database/User";

const linkUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URL}&response_type=code`;

const command = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Get a link to connect your AniList account")
  .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.BotDM);

const execute = async (interaction: ChatInputCommandInteraction, bot: AniDubBot) => {
  // Check if the user is already linked
  const existingUser = await User.findOne({ where: { discordId: interaction.user.id } });

  if (existingUser?.accessToken) {
    await interaction.reply({ flags: [MessageFlags.Ephemeral], content: "Your account is already linked." });
    return;
  }

  // Create a new user now so we can link them to the interaction.
  // Prevents people from linking to discord accounts they don't own.
  if (!existingUser) {
    await User.create({
      discordId: interaction.user.id,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  }

  const customLink = `${linkUrl}&state=${interaction.user.id}`;

  await interaction.reply({ flags: [MessageFlags.Ephemeral], content: `Link your account at ${customLink}` });
}

export {
  command,
  execute,
};