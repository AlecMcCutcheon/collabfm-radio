import { REST, Routes } from "discord.js";

/** ApplicationCommandType.PrimaryEntryPoint — leftover from Discord Activity apps. */
const PRIMARY_ENTRY_POINT = 4;

export const VOICE_BOT_COMMAND_NAMES = ["join", "leave", "station"];

async function listCommands(rest, clientId, guildId = null) {
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  return rest.get(route);
}

async function deleteCommand(rest, clientId, cmd, guildId = null) {
  const route = guildId
    ? Routes.applicationGuildCommand(clientId, guildId, cmd.id)
    : Routes.applicationCommand(clientId, cmd.id);
  await rest.delete(route);
  const scope = guildId ? `guild ${guildId}` : "global";
  console.log(`🗑️ Deleted ${scope} command "${cmd.name}" (${cmd.id})`);
}

async function purgeCommands(rest, clientId, guildId = null) {
  try {
    const existing = await listCommands(rest, clientId, guildId);
    for (const cmd of existing) {
      if (!guildId && cmd.type === PRIMARY_ENTRY_POINT) {
        await deleteCommand(rest, clientId, cmd, null);
        continue;
      }
      await deleteCommand(rest, clientId, cmd, guildId);
    }
  } catch (err) {
    const scope = guildId ? `guild ${guildId}` : "global";
    console.warn(`⚠️ Could not purge ${scope} voice bot commands:`, err.message);
  }
}

/**
 * Sync voice-bot slash commands.
 * Purges all existing global + guild commands, then registers join/leave/station per guild.
 */
export async function registerVoiceBotCommands({ clientId, botToken, commands, guildIds = [] }) {
  const rest = new REST({ version: "10" }).setToken(botToken);
  const commandNames = commands.map((cmd) => cmd.name).join(", ");
  const uniqueGuildIds = [...new Set(guildIds.map(String).filter(Boolean))];

  await purgeCommands(rest, clientId, null);

  for (const guildId of uniqueGuildIds) {
    await purgeCommands(rest, clientId, guildId);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`✅ Voice bot commands for guild ${guildId}: ${commandNames}`);
  }

  if (!uniqueGuildIds.length) {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Voice bot global commands (no guilds yet): ${commandNames}`);
  }
}
