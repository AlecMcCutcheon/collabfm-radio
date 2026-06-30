import { getSetting, setSetting } from "../db/index.js";

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

/** Delete recent messages authored by this bot in a text channel. */
export async function deleteBotMessagesInChannel(
  channel,
  { botId, exceptMessageId = null } = {},
) {
  if (!channel?.isTextBased?.() || !botId) return 0;

  let deleted = 0;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    for (const message of messages.values()) {
      if (message.author.id !== botId) continue;
      if (exceptMessageId && message.id === exceptMessageId) continue;
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
  { botId, exceptMessageId = null } = {},
) {
  const cid = String(channelId || "").trim();
  if (!cid || !botId || !client) return 0;

  try {
    const channel = await client.channels.fetch(cid);
    const deleted = await deleteBotMessagesInChannel(channel, {
      botId,
      exceptMessageId,
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

export async function scanGuildTextChannelsForStaleNotices(client, guildId, botId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !botId) return 0;

  let deleted = 0;
  try {
    await guild.channels.fetch();
  } catch {}

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.()) continue;
    deleted += await deleteBotMessagesInChannel(channel, { botId });
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
  { botId, botInVoice, deep = false } = {},
) {
  if (!guildId || !botId || botInVoice) return 0;

  let deleted = 0;
  const voice = getSetting("voiceBot", {});
  const channelId = voice.noticeChannels?.[String(guildId)];
  if (channelId) {
    deleted += await pruneNoticeChannel(client, guildId, channelId, { botId });
    if (deleted > 0) forgetNoticeChannel(guildId);
  }

  if (deep) {
    deleted += await scanGuildTextChannelsForStaleNotices(client, guildId, botId);
  }

  return deleted;
}

export async function pruneAllStaleVoiceNotices(
  client,
  { isBotInVoiceGuild, deep = false } = {},
) {
  const botId = client?.user?.id;
  if (!botId) return;

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
      deep,
    });
  }

  console.log(
    `🧹 Relay bot: bot message sweep (${deep ? "deep" : "targeted"}) — scanned ${scanned} guild(s), skipped ${skippedInVoice} in voice`,
  );
}
