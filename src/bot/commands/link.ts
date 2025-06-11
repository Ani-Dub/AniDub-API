import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type AniDubBot from "..";
import { CLIENT_ID, REDIRECT_URL } from "../../config";
import { User } from "../../database/User";

// Create the slash command for linking AniList account.
// Can be used anywhere
const command = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Get a link to connect your AniList account")
  .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild);

const execute = async (
  interaction: ChatInputCommandInteraction,
  bot: AniDubBot
) => {
  // Check if the user is already linked
  const existingUser = await User.findOne({
    where: { discordId: interaction.user.id },
  });

  // If the user is already linked, inform them and exit.
  if (existingUser?.accessToken) {
    await interaction.reply({
      flags: [MessageFlags.Ephemeral],
      content: "Your account is already linked.",
    });
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

  const userLink = new URL("https://anilist.co/api/v2/oauth/authorize");

  userLink.searchParams.set("client_id", CLIENT_ID);
  userLink.searchParams.set("redirect_uri", REDIRECT_URL);
  userLink.searchParams.set("response_type", "code");

  // OAuth2 state allows us to pass custom information back to ourself from Anilist.
  userLink.searchParams.set("state", interaction.user.id);

  await interaction.reply({
    flags: [MessageFlags.Ephemeral],
    content: `Link your account at ${userLink.toString()}`,
  });
};

export { command, execute };
