import { ChatInputCommandInteraction, Client, Interaction, MessageFlags, REST, Routes } from "discord.js";
import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from "../config";
import * as commands from "./commands";

type Command = (
  interaction: ChatInputCommandInteraction,
  bot: AniDubBot,
) => Promise<void>;

export default class AniDubBot extends Client {
  private _commands: Map<string, Command> = new Map();

  constructor() {
    super({
      intents: []
    });

    this._init();
  }

  private async _handleInteraction(interaction: Interaction) {
    // Ignore non-slash-command interactions.
    if (!interaction.isChatInputCommand()) return;

    const incomingCommand = interaction as ChatInputCommandInteraction;

    const command = this._commands.get(incomingCommand.commandName);

    if (!command) {
      await interaction.reply({ content: "Unknown command", flags: [MessageFlags.Ephemeral] });
      return;
    }

    await command(incomingCommand, this);
  }

  private async _init() {
    this.once('ready', () => {
      this._updateCommands();
    });

    this.on('interactionCreate', (interaction) => {
      this._handleInteraction(interaction);
    });

    await this.login(DISCORD_TOKEN);

    console.log("AniDub Bot is running");
  }

  private async _updateCommands() {
    const rest = new REST().setToken(this.token!);

    const cmds = Object.entries(commands).map(([name, { command }]) => {
      return command.toJSON();
    });

    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
      body: cmds,
    });

    for (const [name, { command, execute }] of Object.entries(commands)) {
      this._commands.set(name, execute);
    }
  }
}