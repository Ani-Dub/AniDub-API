import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Interaction,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from "../config";
import * as commands from "./commands";
import { Dub } from "../database/Dub";
import { UserDub } from "../database/UserDub";
import { User } from "../database/User";
import { fetchDubStatus } from "../lib/animeschedule";
import { syncUser } from "../lib";

type Command = (
  interaction: ChatInputCommandInteraction,
  bot: AniDubBot
) => Promise<void>;

/**
 * AniDubBot - Handles slash commands in Discord DMs for dub notifications.
 */
export default class AniDubBot extends Client {
  private readonly _commands = new Map<string, Command>();

  constructor() {
    super({ intents: [] });
    this._initialize();
  }

  // Initialize event listeners and login
  private async _initialize() {
    this.once("ready", () => {
      this._registerCommands();
      this._scheduleDailyDubCheck();
    });

    this.on("interactionCreate", this._handleInteraction.bind(this));

    await this.login(DISCORD_TOKEN);
    console.log("AniDub Bot is running");
  }

  // Handle slash command interactions
  private async _handleInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const command = this._commands.get(commandName);

    if (!command) {
      await interaction.reply({
        content: "Unknown command",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await command(interaction, this);
  }

  // Register slash commands with Discord API and store local handlers
  private async _registerCommands() {
    const rest = new REST().setToken(this.token!);
    const commandEntries = Object.entries(commands);

    const commandJSONs = commandEntries.map(([name, { command }]) => {
      console.log(`Registering command: ${name}`);
      return command.toJSON();
    });

    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
      body: commandJSONs,
    });

    commandEntries.forEach(([name, { execute }]) => {
      this._commands.set(name, execute);
    });

    console.log("Commands updated successfully");
  }

  // Sends a direct message to the specified Discord user
  public async sendDM(discordId: string, message: string) {
    try {
      const user = await this.users.fetch(discordId);
      await user?.send(message);
    } catch (error) {
      console.error(`Failed to send DM to ${discordId}:`, error);
    }
  }

  // Schedules a check at midnight and repeats it daily
  private _scheduleDailyDubCheck() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);

    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      this._checkDubsDaily();
      setInterval(this._checkDubsDaily.bind(this), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  // Checks the database for finished dubs and notifies users
  private async _checkDubsDaily() {
    await this._fetchNonReleasedDubs();

    const unfinishedDubs = await Dub.findAll({ where: { isReleasing: true } });

    const users = await User.findAll();

    for (const user of users) {
      await syncUser(user);
    }

    for (const dub of unfinishedDubs) {
      const media = {
        id: dub.anilistId,
        type: "ANIME" as const,
        title: { english: dub.name, romaji: dub.name },
        coverImage: { extraLarge: dub.coverImage },
        status: "RELEASING" as const,
        episodes: dub.totalEpisodes,
      };

      const updated = await fetchDubStatus(media);
      if (!updated) continue;

      if (dub.isReleasing && !updated.isReleasing) {
        await this._notifyUsersDubFinished(dub);
      }
    }
  }

  // Check for dubs that were not released at the time of adding and update their status.
  private async _fetchNonReleasedDubs() {
    const nonReleasedDubs = await Dub.findAll({
      where: { hasDub: false, isReleasing: false },
    });

    for (const dub of nonReleasedDubs) {
      const media = {
        id: dub.anilistId,
        type: "ANIME" as const,
        title: { english: dub.name, romaji: dub.name },
        coverImage: { extraLarge: dub.coverImage },
        status: "RELEASING" as const,
        episodes: dub.totalEpisodes,
      };

      await fetchDubStatus(media);
    }
  }

  // Notify all users tracking a specific dub that it has finished
  private async _notifyUsersDubFinished(dub: Dub) {
    const userDubs = await UserDub.findAll({ where: { dubId: dub.id } });

    const embed = new EmbedBuilder()
      .setTitle("🎉 Dub Completed!")
      .setDescription(
        `The dub for **${dub.name}** has officially finished airing.`
      )
      .setImage(dub.coverImage)
      .setURL("https://anilist.co/anime/" + dub.anilistId)
      .setColor(0x00bfff)
      .setTimestamp()
      .setFooter({
        text: "AniDub Notifications",
        iconURL: this.user?.displayAvatarURL() ?? undefined,
      });

    for (const userDub of userDubs) {
      const user = await User.findByPk(userDub.userId);

      if (user?.discordId) {
        try {
          const discordUser = await this.users.fetch(user.discordId);
          await discordUser.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Failed to send embed DM to ${user.discordId}:`, error);
        }
      }
    }
  }
}
