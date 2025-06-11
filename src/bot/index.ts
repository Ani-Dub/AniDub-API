import {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from "../config";
import * as commands from "./commands";

// Discord.js type for command execution
type Command = (
  interaction: ChatInputCommandInteraction,
  bot: AniDubBot
) => Promise<void>;

/**
 * AniDub Bot operates in a user's DMs and handles slash commands.
 * It links a Discord user to their Anilist account, allowing the bot
 * to check their lists for any new anime releases, and notify the user.
 */
export default class AniDubBot extends Client {
  private _commands: Map<string, Command> = new Map();

  constructor() {
    // Initialize the client with no intents, as this bot only uses interactions.
    super({
      intents: [],
    });

    this._init();
  }

  /**
   * Handles incoming interactions, specifically slash commands.
   * @param interaction The interaction received from Discord.
   */
  private async _handleInteraction(interaction: Interaction) {
    // Ignore non-slash-command interactions.
    if (!interaction.isChatInputCommand()) return;

    const incomingCommand = interaction as ChatInputCommandInteraction;

    const command = this._commands.get(incomingCommand.commandName);

    if (!command) {
      await interaction.reply({
        content: "Unknown command",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await command(incomingCommand, this);
  }

  /**
   * Initializes the bot by setting up event listeners and logging in.
   */
  private async _init() {
    // Tell Discord what commands this bot supports when it starts.
    this.once("ready", () => {
      this._updateCommands();
    });

    // Listen for interactions and handle them.
    this.on("interactionCreate", (interaction) => {
      this._handleInteraction(interaction);
    });

    await this.login(DISCORD_TOKEN);

    console.log("AniDub Bot is running");
  }

  /**
   * Updates the bot's commands in Discord.
   * This is done by sending the command definitions to Discord's API.
   */
  private async _updateCommands() {
    // Token will already be set by the login method.
    const rest = new REST().setToken(this.token!);

    // Get all commands in JSON format.
    const cmds = Object.entries(commands).map(([name, { command }]) => {
      console.log(`Registering command: ${name}`);
      return command.toJSON();
    });

    // Send the commands to Discord's API.
    const res = await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
      body: cmds,
    });

    // Store the command execution functions in a Map for easy access.
    for (const [name, { command, execute }] of Object.entries(commands)) {
      this._commands.set(name, execute);
    }

    console.log("Commands updated successfully");
  }
}
