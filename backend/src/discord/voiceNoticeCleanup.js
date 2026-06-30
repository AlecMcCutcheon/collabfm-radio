import { getSetting, setSetting } from "../db/index.js";
import { VOICE_STATION_SELECT_PREFIX } from "./voiceStationSelect.js";

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

export async function deleteCollabFmVoiceNoticesInChannel(
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
      if (!isCollabFmVoiceNoticeMessage(message)) continue;
      try {
        await message.delete();
        deleted += 1;
      } catch {}
    }
  } catch {}

  return deleted;
}

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
    const deleted = await deleteCollabFmVoiceNoticesInChannel(channel, {
      botId,
      exceptMessageId,
    });
    if (deleted > 0) {
      console.log(
        `🧹 Relay bot: removed ${deleted} stale now-playing message(s) in guild ${guildId} channel ${cid}`,
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
    deleted += await deleteCollabFmVoiceNoticesInChannel(channel, { botId });
  }
  if (deleted > 0) {
    console.log(
      `🧹 Relay bot: removed ${deleted} stale now-playing message(s) across guild ${guildId}`,
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
    `🧹 Relay bot: stale notice sweep (${deep ? "deep" : "targeted"}) — scanned ${scanned} guild(s), skipped ${skippedInVoice} in voice`,
  );
}
