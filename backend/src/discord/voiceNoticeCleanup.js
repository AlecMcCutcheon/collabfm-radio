import { getSetting, setSetting } from "../db/index.js";
import { VOICE_STATION_SELECT_PREFIX } from "./voiceStationSelect.js";
import {
  getVoiceMessageCleanupSettings,
  isVoiceMessageCleanupEnabled,
  resolveCleanupTargets,
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

export const VOICE_NOTICE_MIN_CLEANUP_AGE_MS = 60_000;

export function shouldDeleteBotMessageForCleanup(
  message,
  targets,
  { protectSyncEmbed = false, minAgeMs = 0 } = {},
) {
  if (minAgeMs > 0 && message?.createdTimestamp) {
    if (Date.now() - message.createdTimestamp < minAgeMs) return false;
  }
  if (protectSyncEmbed && isCollabFmVoiceNoticeMessage(message)) return false;

  if (targets === "off") return false;
  if (targets === "all") return true;
  if (targets === "sync_embed") return isCollabFmVoiceNoticeMessage(message);
  if (targets === "slash_replies") return isVoiceSlashReplyMessage(message);
  return false;
}

/** Reuse an existing now-playing embed instead of posting a duplicate. */
export async function findCollabFmVoiceNoticeMessage(channel, botId) {
  if (!channel?.isTextBased?.() || !botId) return null;

  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    for (const message of messages.values()) {
      if (message.author.id !== botId) continue;
      if (isCollabFmVoiceNoticeMessage(message)) return message;
    }
  } catch {}

  return null;
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
  {
    botId,
    exceptMessageId = null,
    targets = null,
    guildProtected = false,
    protectSyncEmbed = false,
    minAgeMs = VOICE_NOTICE_MIN_CLEANUP_AGE_MS,
  } = {},
) {
  if (!channel?.isTextBased?.() || !botId) return 0;

  const settings = getVoiceMessageCleanupSettings();
  const configuredTargets = targets ?? settings.targets;
  const cleanupTargets = resolveCleanupTargets(configuredTargets, { guildProtected });
  if (cleanupTargets === "off") return 0;

  const skipSyncEmbed = protectSyncEmbed || guildProtected;
  const exceptId = exceptMessageId ? String(exceptMessageId) : null;

  let deleted = 0;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    for (const message of messages.values()) {
      if (message.author.id !== botId) continue;
      if (exceptId && String(message.id) === exceptId) continue;
      if (
        !shouldDeleteBotMessageForCleanup(message, cleanupTargets, {
          protectSyncEmbed: skipSyncEmbed,
          minAgeMs,
        })
      ) {
        continue;
      }
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
  {
    botId,
    exceptMessageId = null,
    targets = null,
    guildProtected = false,
    protectSyncEmbed = false,
    minAgeMs = VOICE_NOTICE_MIN_CLEANUP_AGE_MS,
  } = {},
) {
  const cid = String(channelId || "").trim();
  if (!cid || !botId || !client) return 0;

  try {
    const channel = await client.channels.fetch(cid);
    const deleted = await deleteBotMessagesInChannel(channel, {
      botId,
      exceptMessageId,
      targets,
      guildProtected,
      protectSyncEmbed,
      minAgeMs,
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
  {
    targets = null,
    guildProtected = false,
    protectSyncEmbed = false,
    minAgeMs = VOICE_NOTICE_MIN_CLEANUP_AGE_MS,
  } = {},
) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !botId) return 0;

  let deleted = 0;
  try {
    await guild.channels.fetch();
  } catch {}

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.()) continue;
    deleted += await deleteBotMessagesInChannel(channel, {
      botId,
      targets,
      guildProtected,
      protectSyncEmbed,
      minAgeMs,
    });
  }
  if (deleted > 0) {
    console.log(
      `🧹 Relay bot: removed ${deleted} bot message(s) across guild ${guildId}`,
    );
    forgetNoticeChannel(guildId);
  }
  return deleted;
}

export async function pruneStaleVoiceNoticesForGuild(
  client,
  guildId,
  { botId, guildProtected = false } = {},
) {
  const settings = getVoiceMessageCleanupSettings();
  if (!botId || guildProtected || !isVoiceMessageCleanupEnabled(settings)) return 0;

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

export async function pruneAllStaleVoiceNotices(client, { isGuildProtected } = {}) {
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
  let skippedProtected = 0;

  for (const guildId of guildIds) {
    const protectedGuild = isGuildProtected ? isGuildProtected(guildId) : false;
    if (protectedGuild) {
      skippedProtected += 1;
      continue;
    }
    scanned += 1;
    await pruneStaleVoiceNoticesForGuild(client, guildId, {
      botId,
      guildProtected: false,
    });
  }

  console.log(
    `🧹 Relay bot: message cleanup (${settings.targets}, ${settings.scope}) — scanned ${scanned} guild(s), skipped ${skippedProtected} active session(s)`,
  );
}
