import { getSetting, setSetting } from "../db/index.js";
import { VOICE_STATION_SELECT_PREFIX } from "./voiceStationSelect.js";
import {
  getVoiceMessageCleanupSettings,
  isVoiceMessageCleanupEnabled,
} from "../voice/voiceMessageCleanupSettings.js";

export function isCollabFmVoiceNoticeMessage(message) {
  if (!message?.author?.bot) return false;
  const embed = message.embeds?.[0];
  if (!embed || embed.title !== "Now Playing") return false;

  const hasStationSelect = (message.components || []).some((row) =>
    (row.components || []).some((component) =>
      String(component.customId || "").startsWith(VOICE_STATION_SELECT_PREFIX),
    ),
  );
  if (hasStationSelect) return true;
  return embed.footer?.text === "Switch station ↓";
}

function isVoiceSlashReplyMessage(message) {
  if (!message?.author?.bot) return false;
  return !isCollabFmVoiceNoticeMessage(message);
}

export function shouldDeleteBotMessageForCleanup(message, targets) {
  if (targets === "off") return false;
  if (targets === "all") return true;
  if (targets === "sync_embed") return isCollabFmVoiceNoticeMessage(message);
  if (targets === "slash_replies") return isVoiceSlashReplyMessage(message);
  return false;
}

export function rememberNoticeChannel(guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid) return;
  const voice = getSetting("voiceBot", {});
  setSetting("voiceBot", {
    ...voice,
    noticeChannels: { ...(voice.noticeChannels || {}), [gid]: cid },
  });
}

export function forgetNoticeChannel(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const voice = getSetting("voiceBot", {});
  if (!voice.noticeChannels?.[gid]) return;
  const noticeChannels = { ...voice.noticeChannels };
  delete noticeChannels[gid];
  setSetting("voiceBot", { ...voice, noticeChannels });
}

/** Delete bot messages in a text channel that match the configured cleanup target. */
export async function deleteBotMessagesInChannel(
  channel,
  { botId, exceptMessageId = null, targets = null } = {},
) {
  if (!channel?.isTextBased?.() || !botId) return 0;

  const cleanupTargets = targets ?? getVoiceMessageCleanupSettings().targets;
  if (cleanupTargets === "off") return 0;

  let deleted = 0;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    for (const message of messages.values()) {
      if (message.author.id !== botId) continue;
      if (exceptMessageId && message.id === exceptMessageId) continue;
      if (!shouldDeleteBotMessageForCleanup(message, cleanupTargets)) continue;
      try {
        await message.delete();
        deleted += 1;
      } catch {}
    }
  } catch {}

  return deleted;
}

/** @deprecated Use deleteBotMessagesInChannel */
export const deleteCollabFmVoiceNoticesInChannel = deleteBotMessagesInChannel;

export async function pruneNoticeChannel(
  client,
  guildId,
  channelId,
  { botId, exceptMessageId = null, targets = null } = {},
) {
  const cid = String(channelId || "").trim();
  if (!cid || !botId || !client) return 0;

  try {
    const channel = await client.channels.fetch(cid);
    const deleted = await deleteBotMessagesInChannel(channel, {
      botId,
      exceptMessageId,
      targets,
    });
    if (deleted > 0) {
      console.log(
        `🧹 Relay bot: removed ${deleted} bot message(s) in guild ${guildId} channel ${cid}`,
      );
    }
    return deleted;
  } catch {
    return 0;
  }
}

export async function scanGuildTextChannelsForStaleNotices(
  client,
  guildId,
  botId,
  { targets = null } = {},
) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !botId) return 0;

  let deleted = 0;
  try {
    await guild.channels.fetch();
  } catch {}

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.()) continue;
    deleted += await deleteBotMessagesInChannel(channel, { botId, targets });
  }
  if (deleted > 0) {
    console.log(
      `🧹 Relay bot: removed ${deleted} bot message(s) across guild ${guildId}`,
    );
    forgetNoticeChannel(guildId);
  }
  return deleted;
}

export async function pruneStaleVoiceNoticesForGuild(client, guildId, { botId, botInVoice } = {}) {
  const settings = getVoiceMessageCleanupSettings();
  if (!botId || botInVoice || !isVoiceMessageCleanupEnabled(settings)) return 0;

  let deleted = 0;
  const voice = getSetting("voiceBot", {});
  const channelId = voice.noticeChannels?.[String(guildId)];

  if (channelId) {
    deleted += await pruneNoticeChannel(client, guildId, channelId, {
      botId,
      targets: settings.targets,
    });
    if (deleted > 0 && settings.scope === "remembered") {
      forgetNoticeChannel(guildId);
    }
  }

  if (settings.scope === "all_channels") {
    deleted += await scanGuildTextChannelsForStaleNotices(client, guildId, botId, {
      targets: settings.targets,
    });
  }

  return deleted;
}

export async function pruneAllStaleVoiceNotices(client, { isBotInVoiceGuild } = {}) {
  const settings = getVoiceMessageCleanupSettings();
  const botId = client?.user?.id;
  if (!botId) return;

  if (!isVoiceMessageCleanupEnabled(settings)) {
    return;
  }

  const voice = getSetting("voiceBot", {});
  const noticeChannels = voice.noticeChannels || {};
  const guildIds = new Set([
    ...Object.keys(noticeChannels),
    ...client.guilds.cache.keys(),
  ]);

  let scanned = 0;
  let skippedInVoice = 0;

  for (const guildId of guildIds) {
    const inVoice = isBotInVoiceGuild ? isBotInVoiceGuild(guildId) : false;
    if (inVoice) {
      skippedInVoice += 1;
      continue;
    }
    scanned += 1;
    await pruneStaleVoiceNoticesForGuild(client, guildId, {
      botId,
      botInVoice: false,
    });
  }

  console.log(
    `🧹 Relay bot: message cleanup (${settings.targets}, ${settings.scope}) — scanned ${scanned} guild(s), skipped ${skippedInVoice} in voice`,
  );
}
