// relay-bot.js — Discord voice bot (Admin → Discord voice bot credentials)
// /join, /leave, /station; per-channel now-playing embeds + simple global presence.

import { Client, GatewayIntentBits, SlashCommandBuilder, Partials, ActivityType } from "discord.js";
import { GatewayOpcodes } from "discord-api-types/v10";
import { randomUUID } from "node:crypto";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import fetch from "node-fetch";
import { initDatabase, getSetting, setSetting, isGuildWhitelisted } from "./src/db/index.js";
import { registerVoiceBotCommands } from "./src/discord/registerVoiceCommands.js";
import { ensureDefaultSettings, getVoiceBotConfig } from "./src/settings/runtime.js";
import { ensureOperationalSettings, getAudioSettings } from "./src/settings/operational.js";
import { readInternalSongMirror } from "./src/voice/internalSongMirror.js";
import { resolvePublicAlbumArtUrl } from "./src/http/publicBaseUrl.js";
import { getBrandingSettings } from "./src/http/branding.js";
import {
  buildVoiceNowPlayingEmbed,
  voiceNoticeSnapshot,
} from "./src/discord/voiceNowPlayingEmbed.js";
import {
  buildVoiceHeartButtonRow,
  parseVoiceHeartCustomId,
} from "./src/discord/voiceHeartButton.js";
import {
  buildVoiceStationSelectRow,
  parseVoiceStationSelectCustomId,
  voiceStationMenuKey,
} from "./src/discord/voiceStationSelect.js";
import {
  deleteCollabFmVoiceNoticesInChannel,
  findCollabFmVoiceNoticeMessage,
  forgetNoticeChannel,
  pruneAllStaleVoiceNotices,
  rememberNoticeChannel,
} from "./src/discord/voiceNoticeCleanup.js";
import { isVoiceMessageCleanupEnabled } from "./src/voice/voiceMessageCleanupSettings.js";
import {
  PcmRelayDecoder,
  MAIN_STATION_ID,
  PCM_FRAME_BYTES,
} from "./src/radio/pcmRelayProtocol.js";
import { loadAppConfig } from "./src/config/loadConfig.js";

// -----------------
// CONFIG
// -----------------
const BACKEND_ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = path.join(BACKEND_ROOT, "config.json");
let config;
try {
  config = loadAppConfig(CONFIG_PATH, BACKEND_ROOT);
  console.log(`✅ Voice bot configuration loaded from ${CONFIG_PATH}`);
} catch (err) {
  console.error(`❌ Voice bot failed to load config from ${CONFIG_PATH}:`, err.message);
  process.exit(1);
}

const STORAGE_DIR = config.server?.storageDir || path.join(BACKEND_ROOT, "local/storage");
initDatabase(STORAGE_DIR);
ensureDefaultSettings(config);
ensureOperationalSettings(config);

function touchVoiceBotHeartbeat() {
  try {
    const current = getSetting("voiceBot", {});
    setSetting("voiceBot", {
      ...current,
      lastHeartbeat: Date.now(),
      processRunning: true,
    });
  } catch {}
}

function voiceConnectionPayload(guildId, info) {
  const stationMode = info?.stationMode === "dj" ? "dj" : "main";
  return {
    id: `voice:${guildId}`,
    guildId: String(guildId),
    guildName: info.guildName || "Discord server",
    channelId: String(info.channelId || ""),
    channelName: info.channelName || "Voice channel",
    botName: client.user?.username || "Discord bot",
    connectedAt: info.connectedAt ?? Date.now(),
    lastSeen: Date.now(),
    stationMode,
    stationRailId: stationMode === "dj" ? String(info?.stationRailId || "") || null : null,
    stationLabel: info ? stationLabelForEntry(info) : "Main station",
  };
}

function persistVoiceBotConnections() {
  try {
    const current = getSetting("voiceBot", {});
    const activeConnections = [...relayConnections.entries()].map(([guildId, info]) =>
      voiceConnectionPayload(guildId, info),
    );
    setSetting("voiceBot", {
      ...current,
      activeConnections,
      lastHeartbeat: Date.now(),
      processRunning: true,
    });
  } catch {}
}

async function notifyMainServerVoicePresence(guildId, info, { removed = false } = {}) {
  if (!WEB_PORT) return;

  const payload = removed
    ? { removed: true, connectionId: `voice:${guildId}` }
    : voiceConnectionPayload(guildId, info);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(`http://${BROADCAST_API_HOST}:${WEB_PORT}/internal/voice-presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (!MANAGED_VOICE_BOT) {
      console.warn(`⚠️ Relay bot: failed to notify voice presence (${guildId}):`, err.message);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function clearVoiceBotHeartbeat() {
  try {
    const current = getSetting("voiceBot", {});
    setSetting("voiceBot", {
      ...current,
      processRunning: false,
      activeConnections: [],
    });
  } catch {}
}

process.on("SIGTERM", () => {
  clearVoiceBotHeartbeat();
  process.exit(0);
});
process.on("SIGINT", () => {
  clearVoiceBotHeartbeat();
  process.exit(0);
});

function loadVoiceCredentials() {
  const voice = getVoiceBotConfig(config);
  return { botToken: voice.botToken, clientId: voice.clientId, enabled: voice.enabled !== false };
}

let RELAY_TOKEN = "";
let RELAY_CLIENT_ID = "";
const PCM_RELAY_PORT = config.server?.pcmRelayPort || 4100;
const MANAGED_VOICE_BOT = process.env.VOICE_BOT_MANAGED === "1";
const PCM_RELAY_HOST =
  process.env.PCM_RELAY_HOST || (MANAGED_VOICE_BOT ? "127.0.0.1" : "collabfm");
const BROADCAST_API_HOST =
  process.env.BROADCAST_API_HOST || (MANAGED_VOICE_BOT ? "127.0.0.1" : "collabfm");
const WEB_PORT = config.server?.webPort;

// Audio format must match main server PCM bus (see pcmRelayProtocol.js)
const PCM_FRAME_BYTES_LOCAL = PCM_FRAME_BYTES;

function discordRelayJoinBufferFrames() {
  const audio = getAudioSettings();
  const bufferMs = Number(audio.discordRelayBufferMs);
  if (Number.isFinite(bufferMs) && bufferMs > 0) {
    return Math.min(20, Math.max(8, Math.floor(bufferMs / 20)));
  }
  return Math.min(20, Math.max(8, Math.floor(Number(audio.discordBufferFrames) || 40)));
}

function defaultGuildStation() {
  return {
    stationMode: "main",
    stationRailId: null,
    stationLabel: "Main station",
  };
}

function stationLabelForEntry(entry) {
  return entry?.stationLabel || (entry?.stationMode === "main" ? "Main station" : "DJ station");
}

// -----------------
// DISCORD CLIENT
// -----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// Track per-guild connections
const relayConnections = new Map(); // guildId -> { connection, player, buffered, onData }

// Discord may emit a brief "left channel" voice state while dragging between channels.
const VOICE_MOVE_GRACE_MS = 2000;
const pendingVoiceDisconnects = new Map(); // guildId -> timeout
const intentionalVoiceLeaves = new Set(); // guildId
const voiceJoinInProgress = new Set(); // guildId — /join until first now-playing sync
const noticeSyncLocks = new Map(); // guildId — serialize embed send/edit per guild

function destroyRelayMedia(entry) {
  if (!entry) return;
  try {
    if (entry.connection) {
      entry.connection.removeAllListeners("stateChange");
      entry.connection.destroy();
    }
    if (entry.player) entry.player.stop();
    if (entry.buffered) entry.buffered.end();
  } catch {}
}

function botVoiceChannel(guildId) {
  return client.guilds.cache.get(guildId)?.members.me?.voice?.channel ?? null;
}

function isGuildProtectedFromCleanup(guildId) {
  if (!guildId) return false;
  if (voiceJoinInProgress.has(guildId)) return true;
  if (relayConnections.has(guildId)) return true;
  return !!botVoiceChannel(guildId);
}

function cancelPendingVoiceDisconnect(guildId) {
  const pending = pendingVoiceDisconnects.get(guildId);
  if (!pending) return;
  clearTimeout(pending);
  pendingVoiceDisconnects.delete(guildId);
}

function removeRelayConnection(
  guildId,
  { notify = true, reason = "disconnect", intentional = false } = {},
) {
  cancelPendingVoiceDisconnect(guildId);
  const existing = relayConnections.get(guildId);
  if (!existing) return;

  if (intentional) intentionalVoiceLeaves.add(guildId);
  destroyRelayMedia(existing);
  void cleanupGuildVoiceNotices(guildId, existing);

  relayConnections.delete(guildId);
  persistVoiceBotConnections();
  if (notify) void notifyMainServerVoicePresence(guildId, null, { removed: true });
  void updatePresenceFromBroadcastStatus();
  console.log(`👋 Relay bot disconnected from guild ${guildId} (${reason}). Remaining: ${relayConnections.size}`);
}

async function cleanupGuildVoiceNotices(guildId, entry = null) {
  if (!isVoiceMessageCleanupEnabled()) return;

  const existing = entry || relayConnections.get(guildId);
  const botId = client.user?.id;
  if (!botId) return;

  if (existing?.noticeMessageId) {
    await deleteVoiceNotice(existing);
    existing.noticeMessageId = null;
    existing.lastNoticeSnapshot = null;
  }

  const voice = getSetting("voiceBot", {});
  const channelId =
    existing?.noticeTextChannelId || voice.noticeChannels?.[String(guildId)] || null;
  if (!channelId) {
    forgetNoticeChannel(guildId);
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    await deleteCollabFmVoiceNoticesInChannel(channel, {
      botId,
      guildProtected: false,
      minAgeMs: 0,
    });
  } catch {}

  forgetNoticeChannel(guildId);
}

async function leaveVoiceGuild(guildId) {
  if (!relayConnections.has(guildId)) return false;

  intentionalVoiceLeaves.add(guildId);

  try {
    const me = client.guilds.cache.get(guildId)?.members?.me;
    if (me?.voice?.channelId) {
      await me.voice.disconnect();
    }
  } catch {}

  removeRelayConnection(guildId, { reason: "/leave", intentional: true });
  return true;
}

function scheduleVoiceDisconnect(guildId, reason = "voice leave") {
  cancelPendingVoiceDisconnect(guildId);
  const timer = setTimeout(() => {
    pendingVoiceDisconnects.delete(guildId);
    if (botVoiceChannel(guildId)) return;
    removeRelayConnection(guildId, { reason });
  }, VOICE_MOVE_GRACE_MS);
  pendingVoiceDisconnects.set(guildId, timer);
}

function updateRelayConnectionChannel(guildId, voiceState) {
  const existing = relayConnections.get(guildId);
  if (!existing) return false;

  const newChannel = voiceState.channel;
  existing.channelId = voiceState.channelId;
  existing.channelName = newChannel?.name || "Voice channel";
  existing.guildName = voiceState.guild?.name || existing.guildName;

  persistVoiceBotConnections();
  void notifyMainServerVoicePresence(guildId, existing);
  console.log(
    `🔀 Relay bot moved to #${existing.channelName} in ${existing.guildName} (guild ${guildId})`,
  );
  return true;
}

// -----------------
// PRESENCE + PER-CHANNEL NOW PLAYING EMBEDS
// -----------------
let lastGlobalPresenceSnapshot = null;
let lastPresenceTrackKey = null;
let lastSongInfoFetchErrorAt = 0;

const PRESENCE_TEXT_MAX = 128;

function truncatePresenceText(text, maxLen = PRESENCE_TEXT_MAX) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function buildGlobalPresenceActivity(status) {
  if (!status?.active) {
    return {
      snapshot: "inactive:waiting",
      activity: {
        name: "Custom Status",
        type: ActivityType.Custom,
        state: "Waiting for broadcast",
      },
    };
  }

  const title = normalizePlaybackText(status?.title);
  const artist = normalizePlaybackText(status?.artist);
  const stageCount = Math.max(0, Math.floor(Number(status?.stageCount) || 0));

  const name = title ? truncatePresenceText(title) : truncatePresenceText("On air");

  const stateParts = [];
  if (artist) stateParts.push(artist);
  stateParts.push("LIVE");
  if (stageCount > 0) {
    stateParts.push(`${stageCount} on stage`);
  }
  const state = truncatePresenceText(stateParts.join(" · "));

  const trackKey = `${title || ""}\0${artist || ""}`;
  if (trackKey !== lastPresenceTrackKey) {
    lastPresenceTrackKey = trackKey;
  }

  const activity = {
    name,
    type: ActivityType.Listening,
    state,
  };

  return {
    snapshot: [name, state, String(stageCount)].join("\0"),
    activity,
  };
}

function collectDjStationRailIds() {
  const railIds = new Set();
  for (const entry of relayConnections.values()) {
    if (entry.stationMode === "dj" && entry.stationRailId) {
      railIds.add(entry.stationRailId);
    }
  }
  return [...railIds];
}

function collectMetadataRailIds(stationsPayload) {
  const railIds = new Set(collectDjStationRailIds());
  for (const station of stationsPayload?.stations || []) {
    if (station?.wsId) railIds.add(station.wsId);
  }
  if (stationsPayload?.liveRailId) {
    railIds.add(stationsPayload.liveRailId);
  }
  return [...railIds];
}

function stationLabelKey(value) {
  return String(value || "").trim().toLowerCase();
}

function stationByLabelMap(stationsPayload) {
  const byLabel = new Map();
  for (const station of stationsPayload?.stations || []) {
    const key = stationLabelKey(station?.displayName);
    if (key && !byLabel.has(key)) byLabel.set(key, station);
  }
  return byLabel;
}

function reconcileDjStationRailIds(stationsPayload) {
  const stations = stationsPayload?.stations || [];
  if (!stations.length) return;

  const currentRailIds = new Set(stations.map((station) => station.wsId).filter(Boolean));
  const byLabel = stationByLabelMap(stationsPayload);
  let changed = false;

  for (const entry of relayConnections.values()) {
    if (entry.stationMode !== "dj") continue;
    if (entry.stationRailId && currentRailIds.has(entry.stationRailId)) continue;

    const match = byLabel.get(stationLabelKey(entry.stationLabel));
    if (!match?.wsId) continue;

    entry.stationRailId = match.wsId;
    entry.lastNoticeSnapshot = null;
    changed = true;
  }

  if (changed) persistVoiceBotConnections();
}

function normalizePlaybackText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "n/a" || lower === "unknown" || lower === "unknown title" || lower === "unknown artist") {
    return null;
  }
  return trimmed;
}

function listenRailIdForEntry(entry, liveRailId) {
  if (entry.stationMode === "dj" && entry.stationRailId) return entry.stationRailId;
  return liveRailId;
}

function playbackInfoForEntry(entry, mainStatus, stationByRail, stationByLabel, liveRailId) {
  const railId = listenRailIdForEntry(entry, liveRailId);
  const isMain = entry.stationMode !== "dj";
  const station =
    (railId ? stationByRail.get(railId) : null) ??
    (!isMain ? stationByLabel.get(stationLabelKey(entry.stationLabel)) : null) ??
    null;
  const followsLiveRail = isMain || (railId != null && railId === liveRailId);

  const title =
    normalizePlaybackText(station?.title) ??
    (followsLiveRail ? normalizePlaybackText(mainStatus?.title) : null);
  const artist =
    normalizePlaybackText(station?.artist) ??
    (followsLiveRail ? normalizePlaybackText(mainStatus?.artist) : null);
  const albumArtUrl =
    station?.albumArtUrl ?? (followsLiveRail ? mainStatus?.albumArtUrl : null) ?? null;
  const url = station?.url ?? (followsLiveRail ? mainStatus?.url : null) ?? null;
  const licenseUrl =
    station?.licenseUrl ?? (followsLiveRail ? mainStatus?.licenseUrl : null) ?? null;
  const licenseType =
    station?.licenseType ?? (followsLiveRail ? mainStatus?.licenseType : null) ?? null;
  const sourceLabel =
    station?.sourceLabel ?? (followsLiveRail ? mainStatus?.sourceLabel : null) ?? null;
  const sourceSite =
    station?.sourceSite ?? (followsLiveRail ? mainStatus?.sourceSite : null) ?? null;

  return {
    stationLabel: isMain
      ? "Main station"
      : entry.stationLabel || station?.displayName || "DJ station",
    djName: isMain
      ? normalizePlaybackText(mainStatus?.broadcasterDisplayName) ?? station?.displayName ?? null
      : station?.displayName || entry.stationLabel || null,
    title,
    artist,
    albumArtUrl,
    url,
    licenseUrl,
    licenseType,
    sourceLabel,
    sourceSite,
    broadcastActive: isMain ? !!mainStatus?.active : !!station && station.active !== false,
    isLive: station?.isLive ?? (railId != null && railId === liveRailId),
  };
}

function createNoticeSessionState({ textChannelId = null, newNoticeSession = false, existing = null } = {}) {
  if (newNoticeSession) {
    return {
      noticeTextChannelId: textChannelId || existing?.noticeTextChannelId || null,
      noticeMessageId: null,
      noticeSessionId: randomUUID(),
      lastNoticeSnapshot: null,
    };
  }

  if (existing) {
    return {
      noticeTextChannelId: existing.noticeTextChannelId ?? null,
      noticeMessageId: existing.noticeMessageId ?? null,
      noticeSessionId: existing.noticeSessionId ?? randomUUID(),
      lastNoticeSnapshot: existing.lastNoticeSnapshot ?? null,
    };
  }

  return {
    noticeTextChannelId: textChannelId || null,
    noticeMessageId: null,
    noticeSessionId: randomUUID(),
    lastNoticeSnapshot: null,
  };
}

async function deleteVoiceNotice(entry) {
  if (!entry?.noticeTextChannelId || !entry?.noticeMessageId) return;

  try {
    const channel = await client.channels.fetch(entry.noticeTextChannelId);
    if (!channel?.isTextBased?.()) return;
    const message = await channel.messages.fetch(entry.noticeMessageId);
    await message.delete();
  } catch {}
}

async function syncGuildVoiceNotice(guildId, entry, mainStatus, stationByRail, stationsPayload) {
  const prev = noticeSyncLocks.get(guildId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  noticeSyncLocks.set(guildId, chain);

  try {
    await prev;
    await syncGuildVoiceNoticeInner(guildId, entry, mainStatus, stationByRail, stationsPayload);
  } finally {
    release();
    if (noticeSyncLocks.get(guildId) === chain) {
      noticeSyncLocks.delete(guildId);
    }
  }
}

async function syncGuildVoiceNoticeInner(
  guildId,
  entry,
  mainStatus,
  stationByRail,
  stationsPayload,
) {
  if (!entry?.noticeTextChannelId) return;

  const liveRailId = stationsPayload?.liveRailId ?? null;
  const playback = playbackInfoForEntry(
    entry,
    mainStatus,
    stationByRail,
    stationByLabelMap(stationsPayload),
    liveRailId,
  );
  const stationKey = `${entry.stationMode || "main"}:${entry.stationRailId || "main"}`;
  const menuKey = voiceStationMenuKey(stationsPayload, entry);
  const branding = getBrandingSettings();
  const snapshot = voiceNoticeSnapshot(
    playback,
    menuKey,
    stationKey,
    branding.radioDisplayName,
  );
  if (snapshot === entry.lastNoticeSnapshot && entry.noticeMessageId) {
    return;
  }

  const embed = buildVoiceNowPlayingEmbed({
    stationLabel: playback.stationLabel,
    djName: playback.djName,
    title: playback.title,
    artist: playback.artist,
    broadcastActive: playback.broadcastActive,
    isLive: playback.isLive,
    radioDisplayName: branding.radioDisplayName,
    albumArtUrl: playback.albumArtUrl,
    url: playback.url,
    licenseUrl: playback.licenseUrl,
    licenseType: playback.licenseType,
    sourceLabel: playback.sourceLabel,
    sourceSite: playback.sourceSite,
  });
  const components = [
    buildVoiceStationSelectRow({
      guildId,
      sessionId: entry.noticeSessionId,
      stationsPayload,
      entry,
    }),
  ];
  if (playback.broadcastActive && playback.title) {
    components.push(
      buildVoiceHeartButtonRow({
        guildId,
        sessionId: entry.noticeSessionId,
        enabled: true,
      }),
    );
  }

  const payload = { embeds: [embed], components };

  try {
    const channel = await client.channels.fetch(entry.noticeTextChannelId);
    if (!channel?.isTextBased?.()) return;

    rememberNoticeChannel(guildId, entry.noticeTextChannelId);

    const botId = client.user?.id;

    if (entry.noticeMessageId) {
      try {
        const message = await channel.messages.fetch(entry.noticeMessageId);
        await message.edit(payload);
        entry.lastNoticeSnapshot = snapshot;
        return;
      } catch (err) {
        if (err?.code !== 10008) throw err;
        entry.noticeMessageId = null;
      }
    }

    if (botId) {
      const existingNotice = await findCollabFmVoiceNoticeMessage(channel, botId);
      if (existingNotice) {
        entry.noticeMessageId = existingNotice.id;
        await existingNotice.edit(payload);
        entry.lastNoticeSnapshot = snapshot;
        return;
      }
    }

    const message = await channel.send(payload);
    entry.noticeMessageId = message.id;
    entry.lastNoticeSnapshot = snapshot;
  } catch (err) {
    console.warn(
      `⚠️ Relay bot: failed to sync now-playing embed (guild ${guildId}):`,
      err?.message || err,
    );
  }
}

async function refreshAllVoiceNotices(mainStatus, stationByRail, stationsPayload) {
  for (const [guildId, entry] of relayConnections.entries()) {
    await syncGuildVoiceNotice(guildId, entry, mainStatus, stationByRail, stationsPayload);
  }
}

async function fetchStationMetadata(railIds, { logSource = null } = {}) {
  if (!railIds.length || !WEB_PORT) return [];

  const params = new URLSearchParams();
  params.set("rails", railIds.join(","));
  if (logSource) params.set("logSource", logSource);

  const url = `http://${BROADCAST_API_HOST}:${WEB_PORT}/internal/station-metadata?${params.toString()}`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", Connection: "close" },
      });
      const text = await res.text();
      if (!res.ok) {
        if (logSource) {
          console.warn(
            `📡 [${logSource}] /internal/station-metadata HTTP ${res.status} rails=[${railIds.join(",")}] body=${text}`,
          );
        }
        return [];
      }
      let data = {};
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Invalid JSON (${text.slice(0, 120)}): ${parseErr?.message || parseErr}`);
      }
      const stations = Array.isArray(data?.stations) ? data.stations : [];
      if (logSource) {
        console.log(
          `📡 [${logSource}] relay-bot received station-metadata rails=[${railIds.join(",")}]: ${JSON.stringify({ stations })}`,
        );
      }
      return stations;
    } catch (err) {
      const retryable = /premature close|ECONNRESET|socket hang up|aborted/i.test(
        String(err?.message || err),
      );
      if (logSource && attempt >= maxAttempts) {
        console.warn(
          `📡 [${logSource}] /internal/station-metadata fetch failed rails=[${railIds.join(",")}] attempt=${attempt}/${maxAttempts}:`,
          err?.message || err,
        );
      }
      if (!retryable || attempt >= maxAttempts) {
        if (railIds.length > 1) {
          const merged = [];
          for (const railId of railIds) {
            const one = await fetchStationMetadata([railId], { logSource });
            merged.push(...one);
          }
          return merged;
        }
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  return [];
}

async function logDiscordStationSelection({
  logSource,
  guildId,
  resolved,
  stationsPayload = null,
}) {
  const payload = stationsPayload || (await fetchVoiceStations());
  const liveRailId = payload?.liveRailId ?? null;
  const listenRailId =
    resolved.mode === "dj" ? resolved.railId : liveRailId;

  if (!listenRailId) {
    console.log(
      `📡 [${logSource}] guild=${guildId} selected="${resolved.label}" mode=${resolved.mode} — no rail id to query`,
    );
    return;
  }

  const selectedMeta = await fetchStationMetadata([listenRailId], { logSource });

  const entry = relayConnections.get(guildId);
  if (!entry) return;

  const stationMeta = await fetchStationMetadata(collectMetadataRailIds(payload));
  const stationByRail = new Map(stationMeta.map((station) => [station.railId, station]));
  if (!stationByRail.has(listenRailId) && selectedMeta[0]) {
    stationByRail.set(listenRailId, selectedMeta[0]);
  }
  let mainStatus = null;
  try {
    mainStatus = await fetchInternalSongInfo();
  } catch {}

  const playback = playbackInfoForEntry(
    entry,
    mainStatus,
    stationByRail,
    stationByLabelMap(payload),
    liveRailId,
  );

  console.log(
    `📡 [${logSource}] guild=${guildId} discord embed playback selected="${resolved.label}" listenRail=${listenRailId}: ${JSON.stringify(playback)}`,
  );
}

async function fetchInternalSongInfo() {
  if (WEB_PORT) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(
        `http://${BROADCAST_API_HOST}:${WEB_PORT}/internal/song-info`,
        { signal: controller.signal },
      );
      if (res.ok) return await res.json();
    } catch (err) {
      if (!MANAGED_VOICE_BOT) throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (MANAGED_VOICE_BOT) {
    const mirrored = readInternalSongMirror();
    if (!mirrored) return null;
    return {
      ...mirrored,
      albumArtUrl: resolvePublicAlbumArtUrl(mirrored.albumArtUrl) ?? mirrored.albumArtUrl ?? null,
    };
  }

  if (!WEB_PORT) {
    throw new Error("WEB_PORT not set in config.server.webPort");
  }

  return null;
}

async function postInternalDiscordTrackHeart(discordUserId) {
  if (!WEB_PORT) return { ok: false, error: "Radio server unavailable" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `http://${BROADCAST_API_HOST}:${WEB_PORT}/internal/discord-track-heart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ discordUserId: String(discordUserId) }),
        signal: controller.signal,
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "Request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function logSongInfoFetchError(err) {
  const now = Date.now();
  if (now - lastSongInfoFetchErrorAt < 60_000) return;
  lastSongInfoFetchErrorAt = now;
  console.error(`⚠️ Relay bot: Failed to fetch internal song info:`, err.message);
}

function buildGatewayPresenceActivity(activity) {
  const gatewayActivity = {
    type: activity.type ?? ActivityType.Listening,
    name: activity.name,
  };
  if (activity.state) gatewayActivity.state = activity.state;
  if (activity.url) gatewayActivity.url = activity.url;
  return gatewayActivity;
}

function applyDiscordPresence(activity) {
  const packet = {
    status: "online",
    afk: false,
    since: 0,
    activities: activity?.name ? [buildGatewayPresenceActivity(activity)] : [],
  };
  client.ws.broadcast({ op: GatewayOpcodes.PresenceUpdate, d: packet });
}

async function updatePresenceFromBroadcastStatus() {
  if (!WEB_PORT && !MANAGED_VOICE_BOT) {
    console.error("⚠️ Relay bot: WEB_PORT not set in config.server.webPort; cannot update presence.");
    return;
  }

  try {
    const mainStatus = await fetchInternalSongInfo();
    const presence = buildGlobalPresenceActivity(mainStatus);

    let stationsPayload = { liveRailId: null, stations: [] };
    try {
      stationsPayload = await fetchVoiceStations();
    } catch {}
    reconcileDjStationRailIds(stationsPayload);

    const railIds = collectMetadataRailIds(stationsPayload);
    const stationMeta = railIds.length ? await fetchStationMetadata(railIds) : [];
    const stationByRail = new Map(stationMeta.map((station) => [station.railId, station]));

    if (presence.snapshot !== lastGlobalPresenceSnapshot) {
      lastGlobalPresenceSnapshot = presence.snapshot;
      try {
        applyDiscordPresence(presence.activity);
        console.log(
          `🎧 Relay bot presence set: Listening to ${presence.activity.name || "…"}${presence.activity.state ? ` — ${presence.activity.state}` : ""}`,
        );
      } catch (err) {
        console.error("❌ Relay bot: Failed to set presence:", err.message);
      }
    }

    await refreshAllVoiceNotices(mainStatus, stationByRail, stationsPayload);
  } catch (err) {
    logSongInfoFetchError(err);
  }
}

// -----------------
// PCM RELAY CLIENT (from main server)
// -----------------
let pcmSocket = null;
let pcmReconnectTimer = null;
let pcmFramesDelivered = 0;
let pcmFrameLogTs = 0;
let lastPcmReceivedAt = 0;
let currentLiveRailId = null;

const pcmRelayDecoder = new PcmRelayDecoder({
  onPcmFrame: (railId, frame) => queueTaggedPcmForVoice(railId, frame),
  onLiveRail: (railId) => {
    currentLiveRailId = railId || null;
  },
});

const PCM_FRAME_MS = 20;
/** @type {Map<string, { queue: Buffer[], started: boolean }>} */
const railPacedQueues = new Map();
let pacedVoiceTimer = null;
let pacedVoiceNextAt = 0;

function pacedVoiceMaxDepth() {
  return Math.max(discordRelayJoinBufferFrames() * 2, 30);
}

function getRailPaceState(railId) {
  let state = railPacedQueues.get(railId);
  if (!state) {
    state = { queue: [], started: false };
    railPacedQueues.set(railId, state);
  }
  return state;
}

function railHasSubscribers(railId) {
  for (const entry of relayConnections.values()) {
    if (frameMatchesGuildStation(railId, entry)) return true;
  }
  return false;
}

function frameMatchesGuildStation(railId, entry) {
  if (!entry) return false;
  if (entry.stationMode === "main") {
    return !!currentLiveRailId && railId === currentLiveRailId;
  }
  if (entry.stationMode === "dj") {
    return !!entry.stationRailId && railId === entry.stationRailId;
  }
  return false;
}

function dispatchTaggedPcmToVoiceConnections(railId, frame) {
  pcmFramesDelivered++;
  const now = Date.now();
  if (now - pcmFrameLogTs > 15000) {
    pcmFrameLogTs = now;
    console.log(`🔊 Relay bot delivered ${pcmFramesDelivered} PCM frames (${PCM_FRAME_BYTES_LOCAL} bytes each)`);
    pcmFramesDelivered = 0;
  }

  for (const entry of relayConnections.values()) {
    if (!frameMatchesGuildStation(railId, entry)) continue;
    try {
      entry.onFrame(frame);
    } catch {}
  }
}

function pacedVoiceOutputTick() {
  const minFrames = discordRelayJoinBufferFrames();

  for (const [railId, state] of railPacedQueues) {
    if (!railHasSubscribers(railId)) {
      state.queue.length = 0;
      state.started = false;
      continue;
    }

    if (!state.started) {
      if (state.queue.length < minFrames) continue;
      state.started = true;
    }

    if (state.queue.length > 0) {
      dispatchTaggedPcmToVoiceConnections(railId, state.queue.shift());
    } else {
      dispatchTaggedPcmToVoiceConnections(railId, Buffer.alloc(PCM_FRAME_BYTES_LOCAL));
    }
  }

  for (const [railId, state] of railPacedQueues) {
    if (!railHasSubscribers(railId) && state.queue.length === 0 && !state.started) {
      railPacedQueues.delete(railId);
    }
  }
}

function queueTaggedPcmForVoice(railId, frame) {
  if (!railHasSubscribers(railId)) return;

  lastPcmReceivedAt = Date.now();
  const state = getRailPaceState(railId);
  state.queue.push(Buffer.from(frame));
  while (state.queue.length > pacedVoiceMaxDepth()) {
    state.queue.shift();
  }
  schedulePacedVoiceOutput();
}
function schedulePacedVoiceOutput() {
  if (pacedVoiceTimer) return;
  const now = Date.now();
  if (!pacedVoiceNextAt) pacedVoiceNextAt = now;
  pacedVoiceNextAt += PCM_FRAME_MS;
  const delay = Math.max(0, Math.min(PCM_FRAME_MS * 2, pacedVoiceNextAt - Date.now()));
  pacedVoiceTimer = setTimeout(() => {
    pacedVoiceTimer = null;
    pacedVoiceOutputTick();
    schedulePacedVoiceOutput();
  }, delay);
}

function resetPacedVoiceOutput() {
  railPacedQueues.clear();
  if (pacedVoiceTimer) {
    clearTimeout(pacedVoiceTimer);
    pacedVoiceTimer = null;
  }
  pacedVoiceNextAt = 0;
  pcmRelayDecoder.reset();
}

function ingestPcmFromRelay(chunk) {
  if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;
  pcmRelayDecoder.ingest(chunk);
}

function connectPcmRelay() {
  if (pcmSocket) {
    try { pcmSocket.destroy(); } catch {}
    pcmSocket = null;
  }
  if (pcmReconnectTimer) {
    clearTimeout(pcmReconnectTimer);
    pcmReconnectTimer = null;
  }

  console.log(`🔗 Relay bot connecting to PCM relay at ${PCM_RELAY_HOST}:${PCM_RELAY_PORT} ...`);
  const sock = net.createConnection({ host: PCM_RELAY_HOST, port: PCM_RELAY_PORT }, () => {
    console.log("✅ Relay bot connected to PCM relay");
    pcmSocket = sock;
    try { sock.setNoDelay(true); } catch {}
  });

  sock.on("data", (chunk) => {
    try {
      ingestPcmFromRelay(chunk);
    } catch (err) {
      console.error("❌ Relay PCM ingest error:", err.message);
    }
  });

  sock.on("error", (err) => {
    console.error("❌ Relay PCM socket error:", err.message);
  });

  sock.on("close", () => {
    console.log("⚠️ Relay PCM socket closed, will retry in 3s...");
    pcmSocket = null;
    resetPacedVoiceOutput();
    currentLiveRailId = null;
    pcmReconnectTimer = setTimeout(connectPcmRelay, 3000);
  });
}

connectPcmRelay();

setInterval(() => {
  if (!relayConnections.size || !lastPcmReceivedAt) return;
  if (Date.now() - lastPcmReceivedAt < 12_000) return;
  console.warn("⚠️ [relay-bot] PCM stream stale — reconnecting to main server");
  lastPcmReceivedAt = Date.now();
  try { pcmSocket?.destroy(); } catch {}
}, 15_000);

// -----------------
// AUDIO STREAMING
// -----------------
function createRelayFrameHandler(buffered) {
  const startupFrames = discordRelayJoinBufferFrames();
  let started = false;
  const startupQueue = [];
  const pendingWrites = [];

  function flushPending() {
    while (pendingWrites.length > 0) {
      const frame = pendingWrites[0];
      try {
        if (!buffered.write(frame)) {
          buffered.once("drain", flushPending);
          return;
        }
        pendingWrites.shift();
      } catch {
        pendingWrites.length = 0;
        return;
      }
    }
  }

  const handler = (frame) => {
    try {
      const buf = Buffer.from(frame);
      if (!started) {
        startupQueue.push(buf);
        if (startupQueue.length >= startupFrames) {
          started = true;
          for (const f of startupQueue) pendingWrites.push(f);
          startupQueue.length = 0;
          flushPending();
        }
        return;
      }
      pendingWrites.push(buf);
      flushPending();
    } catch {}
  };

  handler.reset = () => {
    started = false;
    startupQueue.length = 0;
    pendingWrites.length = 0;
  };

  return handler;
}

async function fetchVoiceStations() {
  if (!WEB_PORT) {
    return { liveRailId: null, stations: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `http://${BROADCAST_API_HOST}:${WEB_PORT}/internal/voice-stations`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json", Connection: "close" },
      },
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function mainStationAutocompleteChoices() {
  return [{ name: "Main station (follow live DJ)", value: MAIN_STATION_ID }];
}

function buildStationChoices(stationsPayload, query = "") {
  const q = String(query || "").trim().toLowerCase();
  const choices = [
    {
      name: "Main station (follow live DJ)",
      value: MAIN_STATION_ID,
    },
  ];

  for (const station of stationsPayload?.stations || []) {
    const name = station.isLive
      ? `${station.displayName} (live now)`
      : station.displayName;
    choices.push({
      name: String(name || "DJ").slice(0, 100),
      value: station.wsId,
    });
  }

  if (!q) return choices;
  return choices.filter((choice) => choice.name.toLowerCase().includes(q));
}

function resolveStationSelection(value, stationsPayload) {
  if (value === MAIN_STATION_ID) {
    return { ok: true, mode: "main", railId: null, label: "Main station" };
  }

  const match = (stationsPayload?.stations || []).find((station) => station.wsId === value);
  if (!match) {
    return { ok: false, error: "That DJ is not on stage right now." };
  }

  return {
    ok: true,
    mode: "dj",
    railId: match.wsId,
    label: match.displayName || "DJ",
  };
}

function applyGuildStation(guildId, { mode, railId, label }) {
  const entry = relayConnections.get(guildId);
  if (!entry) return false;

  entry.stationMode = mode;
  entry.stationRailId = railId;
  entry.stationLabel = label;
  entry.lastNoticeSnapshot = null;

  const targetRailId = mode === "dj" ? railId : currentLiveRailId;
  if (targetRailId) {
    const state = getRailPaceState(targetRailId);
    state.queue.length = 0;
    state.started = false;
  }

  entry.onFrame.reset?.();
  persistVoiceBotConnections();
  void notifyMainServerVoicePresence(guildId, entry);
  void updatePresenceFromBroadcastStatus();
  return true;
}

function botIsStreamingInGuild(guildId) {
  return !!relayConnections.get(guildId) && !!botVoiceChannel(guildId);
}

async function playRelayRadio(
  voiceChannel,
  { forceMainStation = false, textChannelId = null, newNoticeSession = false } = {},
) {
  const guildId = voiceChannel.guild.id;
  voiceJoinInProgress.add(guildId);

  try {
    const existing = relayConnections.get(guildId);
    const preservedStation = forceMainStation
      ? defaultGuildStation()
      : existing
        ? {
            stationMode: existing.stationMode || "main",
            stationRailId: existing.stationRailId || null,
            stationLabel: existing.stationLabel || "Main station",
          }
        : defaultGuildStation();
    const noticeState = createNoticeSessionState({
      textChannelId,
      newNoticeSession,
      existing,
    });
    if (textChannelId) {
      rememberNoticeChannel(guildId, textChannelId);
    }

    if (existing) {
      destroyRelayMedia(existing);
      relayConnections.delete(guildId);
      persistVoiceBotConnections();
    }

    console.log(`🔗 Relay bot joining voice channel ${voiceChannel.id} in guild ${guildId} (${voiceChannel.guild.name})`);
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    const joinBufferFrames = discordRelayJoinBufferFrames();
    const buffered = new PassThrough({ highWaterMark: PCM_FRAME_BYTES * (joinBufferFrames + 100) });
    const onFrame = createRelayFrameHandler(buffered);

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: "play",
        maxMissedFrames: 250,
      },
    });

    connection.subscribe(player);

    const resource = createAudioResource(buffered, {
      inputType: StreamType.Raw,
      silencePaddingFrames: 10,
    });
    player.play(resource);

    relayConnections.set(guildId, {
      connection,
      player,
      buffered,
      onFrame,
      guildId,
      channelId: voiceChannel.id,
      channelName: voiceChannel.name,
      guildName: voiceChannel.guild.name,
      connectedAt: Date.now(),
      stationMode: preservedStation.stationMode,
      stationRailId: preservedStation.stationRailId,
      stationLabel: preservedStation.stationLabel,
      noticeTextChannelId: noticeState.noticeTextChannelId,
      noticeMessageId: noticeState.noticeMessageId,
      noticeSessionId: noticeState.noticeSessionId,
      lastNoticeSnapshot: noticeState.lastNoticeSnapshot,
    });
    persistVoiceBotConnections();
    void notifyMainServerVoicePresence(guildId, relayConnections.get(guildId));
    await updatePresenceFromBroadcastStatus();

    player.on(AudioPlayerStatus.Playing, () => {
      console.log(`🎶 Relay bot streaming to guild ${guildId} (${voiceChannel.guild.name})`);
    });

    player.on("error", (e) => {
      console.error(`❌ Relay player error (guild ${guildId}):`, e.message);
      removeRelayConnection(guildId, { reason: "player error" });
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.warn(`⚠️ Relay player went idle in guild ${guildId} — stream may have stalled`);
    });

    connection.on("stateChange", (oldState, newState) => {
      console.log(`🔗 Relay connection state (guild ${guildId}): ${oldState.status} -> ${newState.status}`);
      if (newState.status !== VoiceConnectionStatus.Destroyed) return;

      if (intentionalVoiceLeaves.has(guildId)) {
        intentionalVoiceLeaves.delete(guildId);
        return;
      }

      const existing = relayConnections.get(guildId);
      if (!existing || existing.connection !== connection) return;

      const channel = botVoiceChannel(guildId);
      if (channel) {
        console.log(`🔁 Relay bot rebuilding stream after voice connection reset (guild ${guildId})`);
        void playRelayRadio(channel);
        return;
      }

      scheduleVoiceDisconnect(guildId, "connection destroyed");
    });
  } catch (err) {
    console.error("❌ Failed to play relay radio:", err.message);
    throw err;
  } finally {
    voiceJoinInProgress.delete(guildId);
  }
}

// -----------------
// SLASH COMMANDS
// -----------------
function voiceBotRegistrationGuildIds() {
  return [...client.guilds.cache.keys()].map(String);
}

let relayCommandSyncPromise = null;

async function registerRelayCommands() {
  if (relayCommandSyncPromise) return relayCommandSyncPromise;

  relayCommandSyncPromise = (async () => {
    const creds = loadVoiceCredentials();
    if (!creds.clientId || !creds.botToken) return;
    const commands = [
    new SlashCommandBuilder()
      .setName("join")
      .setDescription("🎵 Join your voice channel on Main station (live DJ)"),
    new SlashCommandBuilder()
      .setName("leave")
      .setDescription("👋 Disconnect the bot from the voice channel"),
    new SlashCommandBuilder()
      .setName("station")
      .setDescription("📻 Switch station — use after /join (bot must be in voice)")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Main station or a DJ on stage")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  ].map((cmd) => cmd.toJSON());

  const guildIds = voiceBotRegistrationGuildIds();

  try {
    console.log(
      `📝 Syncing Discord voice bot slash commands (${guildIds.length} guild(s))...`,
    );
    await registerVoiceBotCommands({
      clientId: creds.clientId,
      botToken: creds.botToken,
      commands,
      guildIds,
    });
    console.log("✅ Discord voice bot slash commands synced");
  } catch (err) {
    console.error("❌ Failed to register relay bot commands:", err.message);
  }
  })();

  try {
    await relayCommandSyncPromise;
  } finally {
    relayCommandSyncPromise = null;
  }
}

async function isGuildAllowed(guildId) {
  try {
    return isGuildWhitelisted(guildId);
  } catch (err) {
    console.error("⚠️ Relay bot: whitelist check failed:", err.message);
    return false;
  }
}

function isUnknownInteraction(err) {
  return err?.code === 10062;
}

async function safeDeferReply(interaction) {
  try {
    await interaction.deferReply();
    return true;
  } catch (err) {
    if (isUnknownInteraction(err)) {
      console.warn("Discord interaction expired before deferReply");
      return false;
    }
    throw err;
  }
}

async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply(content);
    }
  } catch (err) {
    if (!isUnknownInteraction(err)) {
      console.error("Discord interaction reply failed:", err.message);
    }
  }
}

client.on("error", (err) => {
  console.error("Discord client error:", err?.message || err);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    const parsed = parseVoiceStationSelectCustomId(interaction.customId);
    if (!parsed) return;

    try {
      const entry = relayConnections.get(parsed.guildId);
      if (!entry || entry.noticeSessionId !== parsed.sessionId) {
        await interaction.reply({
          content: "This station picker is no longer active. Use `/join` to start a new session.",
          ephemeral: true,
        });
        return;
      }

      if (!(await isGuildAllowed(parsed.guildId))) {
        await interaction.reply({
          content: "❌ This server is not authorized for the radio voice bot.",
          ephemeral: true,
        });
        return;
      }

      if (!botIsStreamingInGuild(parsed.guildId)) {
        await interaction.reply({
          content: "❌ I'm not in a voice channel here. Use `/join` first.",
          ephemeral: true,
        });
        return;
      }

      const value = interaction.values[0];
      const payload = await fetchVoiceStations();
      const resolved = resolveStationSelection(value, payload);
      if (!resolved.ok) {
        await interaction.reply({
          content: `❌ ${resolved.error}`,
          ephemeral: true,
        });
        return;
      }

      await interaction.deferUpdate();
      applyGuildStation(parsed.guildId, resolved);
      entry.lastNoticeSnapshot = null;
      await logDiscordStationSelection({
        logSource: "discord-station-dropdown",
        guildId: parsed.guildId,
        resolved,
        stationsPayload: payload,
      });
      await updatePresenceFromBroadcastStatus();
    } catch (err) {
      console.warn("⚠️ Station select menu failed:", err?.message || err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "⚠️ Could not switch station. Try again in a few seconds.",
            ephemeral: true,
          });
        }
      } catch {}
    }
    return;
  }

  if (interaction.isButton()) {
    const parsed = parseVoiceHeartCustomId(interaction.customId);
    if (!parsed) return;

    try {
      const entry = relayConnections.get(parsed.guildId);
      if (!entry || entry.noticeSessionId !== parsed.sessionId) {
        await interaction.reply({
          content: "This heart button is no longer active. Use `/join` to start a new session.",
          ephemeral: true,
        });
        return;
      }

      if (!(await isGuildAllowed(parsed.guildId))) {
        await interaction.reply({
          content: "❌ This server is not authorized for the radio voice bot.",
          ephemeral: true,
        });
        return;
      }

      if (!botIsStreamingInGuild(parsed.guildId)) {
        await interaction.reply({
          content: "❌ I'm not in a voice channel here. Use `/join` first.",
          ephemeral: true,
        });
        return;
      }

      const result = await postInternalDiscordTrackHeart(interaction.user.id);
      if (!result.ok) {
        await interaction.reply({
          content: `❌ ${result.error || "Could not heart this track."}`,
          ephemeral: true,
        });
        return;
      }

      const trackLabel =
        result.title && result.artist
          ? `**${result.title}** by ${result.artist}`
          : result.title
            ? `**${result.title}**`
            : "this track";
      const content = result.duplicate
        ? `You've already hearted ${trackLabel}.`
        : `❤️ Hearted ${trackLabel}!`;
      await interaction.reply({ content, ephemeral: true });
    } catch (err) {
      console.warn("⚠️ Voice heart button failed:", err?.message || err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "⚠️ Could not heart this track. Try again in a few seconds.",
            ephemeral: true,
          });
        }
      } catch {}
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "station") return;
    if (!botIsStreamingInGuild(interaction.guildId)) {
      try {
        await interaction.respond([]);
      } catch {}
      return;
    }
    try {
      const payload = await fetchVoiceStations();
      const query = interaction.options.getFocused();
      const choices = buildStationChoices(payload, query);
      await interaction.respond(choices.slice(0, 25));
    } catch (err) {
      console.warn("⚠️ Station autocomplete fetch failed:", err?.message || err);
      try {
        await interaction.respond(mainStationAutocompleteChoices());
      } catch {}
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (interaction.commandName === "station") {
      const guildId = interaction.guildId;
      if (!botIsStreamingInGuild(guildId)) {
        await safeReply(
          interaction,
          "❌ I'm not in a voice channel here yet. Use `/join` first — you'll start on **Main station**, then use `/station` to switch.",
        );
        return;
      }

      const deferred = await safeDeferReply(interaction);
      if (!deferred) return;

      if (guildId && !(await isGuildAllowed(guildId))) {
        await safeReply(
          interaction,
          "❌ This server is not authorized for the radio voice bot. Ask the radio admin to whitelist your server.",
        );
        return;
      }

      const value = interaction.options.getString("name", true);
      try {
        const payload = await fetchVoiceStations();
        const resolved = resolveStationSelection(value, payload);
        if (!resolved.ok) {
          await safeReply(interaction, `❌ ${resolved.error}`);
          return;
        }

        applyGuildStation(guildId, resolved);
        await logDiscordStationSelection({
          logSource: "discord-station-command",
          guildId,
          resolved,
          stationsPayload: payload,
        });
        await updatePresenceFromBroadcastStatus();
        await safeReply(
          interaction,
          resolved.mode === "main"
            ? "📻 Switched to **Main station** — following the live DJ."
            : `📻 Switched to **${resolved.label}**'s station.`,
        );
      } catch (err) {
        logSongInfoFetchError(err);
        await safeReply(
          interaction,
          "⚠️ Could not reach the radio server. Try again in a few seconds.",
        );
      }
      return;
    }

    if (interaction.commandName === "join") {
      if (!voiceChannel) {
        await safeReply(interaction, "❌ You must be in a voice channel!");
        return;
      }

      const deferred = await safeDeferReply(interaction);
      if (!deferred) return;

      const guildId = interaction.guildId;
      if (guildId && !(await isGuildAllowed(guildId))) {
        await safeReply(
          interaction,
          "❌ This server is not authorized for the radio voice bot. Ask the radio admin to whitelist your server.",
        );
        return;
      }

      let broadcastActive = false;

      try {
        const songStatus = await fetchInternalSongInfo();
        if (songStatus) {
          broadcastActive = !!songStatus.active;
        }
      } catch (err) {
        logSongInfoFetchError(err);
        if (String(err.message).includes("ECONNREFUSED") || err.name === "AbortError") {
          await safeReply(
            interaction,
            "⚠️ Radio server is still starting up, please try again in a few seconds.",
          );
          return;
        }
      }

      try {
        await playRelayRadio(voiceChannel, {
          forceMainStation: true,
          textChannelId: interaction.channelId,
          newNoticeSession: true,
        });

        await safeReply(
          interaction,
          broadcastActive
            ? "📻 Joined on **Main station** (live DJ). Use `/station` to listen to a specific DJ instead."
            : "📻 Joined on **Main station**. I'll play when someone goes live. Use `/station` afterward to pick a DJ feed.",
        );
      } catch (err) {
        await safeReply(interaction, `❌ Failed to join voice channel: ${err.message}`);
      }
      return;
    }

    if (interaction.commandName === "leave") {
      const guildId = interaction.guildId;
      const existing = relayConnections.get(guildId);
      if (existing) {
        try {
          await leaveVoiceGuild(guildId);
        } catch (err) {
          console.error(`❌ Relay bot leave cleanup error (guild ${guildId}):`, err.message);
        }
        await safeReply(interaction, "👋 Left the voice channel.");
      } else {
        await safeReply(interaction, "❌ I'm not in a voice channel in this server!");
      }
    }
  } catch (err) {
    if (!isUnknownInteraction(err)) {
      console.error("Discord interaction handler error:", err?.message || err);
    }
    await safeReply(interaction, "❌ Something went wrong handling that command.");
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (oldState.member?.id !== client.user.id) return;

  const guildId = oldState.guild.id;
  const wasConnected = !!oldState.channelId;
  const isConnected = !!newState.channelId;
  const movedChannel =
    wasConnected && isConnected && oldState.channelId !== newState.channelId;
  const leftVoice = wasConnected && !isConnected;
  const joinedVoice = !wasConnected && isConnected;

  if (movedChannel || joinedVoice) {
    cancelPendingVoiceDisconnect(guildId);
  }

  if (movedChannel) {
    if (!updateRelayConnectionChannel(guildId, newState)) {
      const channel = newState.channel;
      if (channel) void playRelayRadio(channel);
    }
    return;
  }

  if (leftVoice) {
    scheduleVoiceDisconnect(guildId, "voice state left");
    return;
  }

  if (joinedVoice) {
    if (updateRelayConnectionChannel(guildId, newState)) return;
    const channel = newState.channel;
    if (channel && !relayConnections.has(guildId)) {
      void playRelayRadio(channel);
    }
  }
});

client.on("guildCreate", async (guild) => {
  if (!(await isGuildAllowed(guild.id))) return;
  try {
    await registerRelayCommands();
  } catch (err) {
    console.warn(`⚠️ Voice bot command sync failed for guild ${guild.id}:`, err.message);
  }
});

client.once("clientReady", async () => {
  touchVoiceBotHeartbeat();
  const creds = loadVoiceCredentials();
  console.log(`🔗 Discord voice bot logged in as ${client.user.tag} (ID: ${client.user.id})`);
  if (creds.clientId) {
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${creds.clientId}&permissions=36700160&scope=bot%20applications.commands`;
    console.log(`🔗 Bot invite URL: ${inviteUrl}`);
    console.log("   Invite this bot to whitelisted servers, then use /join and /station in a voice channel.");
  }
  await registerRelayCommands();

  setTimeout(() => {
    void pruneAllStaleVoiceNotices(client, {
      isGuildProtected: isGuildProtectedFromCleanup,
    });
  }, 8000);

  void updatePresenceFromBroadcastStatus();
  setInterval(updatePresenceFromBroadcastStatus, 5000);
  setInterval(() => {
    void pruneAllStaleVoiceNotices(client, {
      isGuildProtected: isGuildProtectedFromCleanup,
    });
  }, 5 * 60 * 1000);
  setInterval(() => {
    touchVoiceBotHeartbeat();
    persistVoiceBotConnections();
  }, 30000);
});

let loginAttempted = false;

function tryLoginVoiceBot() {
  const creds = loadVoiceCredentials();
  if (!creds.enabled) {
    console.log("⏸️ Discord voice bot is disabled in Admin settings.");
    setTimeout(tryLoginVoiceBot, 30000);
    return;
  }
  if (!creds.botToken || !creds.clientId) {
    console.log("⏳ Discord voice bot not configured. Set Application ID and Bot Token in Admin → Discord bot.");
    setTimeout(tryLoginVoiceBot, 30000);
    return;
  }
  const stored = getSetting("voiceBot", {});
  if (!stored.verified?.at) {
    console.log("⏳ Discord voice bot credentials not verified. Use Admin → Discord bot → Verify credentials.");
    setTimeout(tryLoginVoiceBot, 30000);
    return;
  }
  if (loginAttempted && creds.botToken === RELAY_TOKEN && creds.clientId === RELAY_CLIENT_ID) {
    return;
  }
  RELAY_TOKEN = creds.botToken;
  RELAY_CLIENT_ID = creds.clientId;
  loginAttempted = true;
  client.login(RELAY_TOKEN).catch((err) => {
    console.error("❌ Discord voice bot failed to login:", err.message);
    loginAttempted = false;
    setTimeout(tryLoginVoiceBot, 30000);
  });
}

tryLoginVoiceBot();
setInterval(tryLoginVoiceBot, 60000);


