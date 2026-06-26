import { getSetting } from "../db/index.js";

const PRESENCE_TTL_MS = 30_000;
const DISCORD_BOT_CONNECTION_STALE_MS = 45_000;

/** @type {Map<string, object>} */
const clients = new Map();
const discordBotConnections = new Map();

function prunePresence(now = Date.now()) {
  let removed = false;
  for (const [clientId, entry] of clients) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) {
      clients.delete(clientId);
      removed = true;
    }
  }
  return removed;
}

export function pruneStaleSitePresence(now = Date.now()) {
  return prunePresence(now);
}

function toEntry(clientId, actor, { listening = false, source = "web", clientIp = null } = {}) {
  const now = Date.now();
  const isRelay = source === "relay";
  return {
    clientId,
    actorId: String(actor.actorId),
    displayName: String(actor.displayName || "Someone").slice(0, 64),
    avatar: actor.avatar ?? null,
    avatarVariant: Number(actor.avatarVariant) || 0,
    coverIcon: Number(actor.coverIcon) || 0,
    roleColor: actor.roleColor ?? null,
    roleType: String(actor.roleType || (actor.isGuest ? "guest" : "listener")),
    level: Number(actor.level) || 0,
    isGuest: !!actor.isGuest,
    listening: !isRelay && !!listening,
    online: true,
    onStage: isRelay,
    source,
    clientIp: clientIp ? String(clientIp).slice(0, 64) : null,
    lastSeen: now,
  };
}

export function touchSitePresence(clientId, actor, { listening = false, clientIp = null } = {}) {
  const id = String(clientId || "").trim();
  if (!id || !actor?.actorId) return null;

  const entry = toEntry(id, actor, { listening, source: "web", clientIp });
  clients.set(id, entry);
  prunePresence(entry.lastSeen);
  return entry;
}

export function touchRelayPresence(clientId, actor, { clientIp = null } = {}) {
  const id = String(clientId || "").trim();
  if (!id || !actor?.actorId) return null;

  const entry = toEntry(id, actor, { listening: false, source: "relay", clientIp });
  clients.set(id, entry);
  prunePresence(entry.lastSeen);
  return entry;
}

export function touchDiscordBotPresence(connectionId, fields = {}) {
  const id = String(connectionId || "").trim();
  if (!id) return null;
  const stationMode = fields.stationMode === "dj" ? "dj" : "main";
  const entry = {
    id,
    guildId: fields.guildId ? String(fields.guildId) : null,
    guildName: fields.guildName ? String(fields.guildName).slice(0, 100) : "Discord server",
    channelId: fields.channelId ? String(fields.channelId) : null,
    channelName: fields.channelName ? String(fields.channelName).slice(0, 100) : "Voice channel",
    botName: fields.botName ? String(fields.botName).slice(0, 64) : "Discord bot",
    connectedAt: fields.connectedAt ?? Date.now(),
    lastSeen: Date.now(),
    stationMode,
    stationRailId:
      stationMode === "dj" && fields.stationRailId
        ? String(fields.stationRailId)
        : null,
    stationLabel: fields.stationLabel
      ? String(fields.stationLabel).slice(0, 100)
      : stationMode === "dj"
        ? "DJ station"
        : "Main station",
  };
  discordBotConnections.set(id, entry);
  return entry;
}

export function removeDiscordBotPresence(connectionId) {
  discordBotConnections.delete(String(connectionId || "").trim());
}

export function removeSitePresence(clientId) {
  clients.delete(String(clientId || "").trim());
}

export function updateSitePresenceActorProfile(actorId, patch = {}) {
  const id = String(actorId || "").trim();
  if (!id) return false;

  let changed = false;
  for (const entry of clients.values()) {
    if (entry.actorId !== id) continue;
    if (patch.displayName != null) entry.displayName = String(patch.displayName || "Someone").slice(0, 64);
    if (patch.avatar !== undefined) entry.avatar = patch.avatar;
    if (patch.avatarVariant !== undefined) entry.avatarVariant = Number(patch.avatarVariant) || 0;
    if (patch.coverIcon !== undefined) entry.coverIcon = Number(patch.coverIcon) || 0;
    if (patch.roleColor !== undefined) entry.roleColor = patch.roleColor;
    if (patch.roleType != null) entry.roleType = String(patch.roleType || "listener");
    if (patch.level !== undefined) entry.level = Number(patch.level) || 0;
    changed = true;
  }
  return changed;
}

function toPublicMember(entry) {
  return {
    userId: entry.actorId,
    displayName: entry.displayName,
    avatar: entry.avatar,
    avatarVariant: entry.avatarVariant,
    coverIcon: entry.coverIcon,
    roleColor: entry.roleColor,
    roleType: entry.roleType,
    level: entry.level,
    isGuest: entry.isGuest,
    listening: !!entry.listening,
    online: !!entry.online,
    onStage: !!entry.onStage,
  };
}

function compareMembers(a, b) {
  const stageDiff = Number(!!b.onStage) - Number(!!a.onStage);
  if (stageDiff !== 0) return stageDiff;
  const listeningDiff = Number(!!b.listening) - Number(!!a.listening);
  if (listeningDiff !== 0) return listeningDiff;
  const levelDiff = (b.level ?? 0) - (a.level ?? 0);
  if (levelDiff !== 0) return levelDiff;
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

function sortMembers(list) {
  return list.sort(compareMembers);
}

function activeStoredDiscordBotConnections(now = Date.now()) {
  try {
    const voiceBot = getSetting("voiceBot", {});
    const connections = Array.isArray(voiceBot.activeConnections)
      ? voiceBot.activeConnections
      : [];
    return connections
      .filter((connection) => now - Number(connection.lastSeen || 0) <= DISCORD_BOT_CONNECTION_STALE_MS)
      .map((connection) => {
        const stationMode = connection.stationMode === "dj" ? "dj" : "main";
        return {
          id: String(connection.id || `${connection.guildId}:${connection.channelId}`),
          guildId: connection.guildId ? String(connection.guildId) : null,
          guildName: connection.guildName ? String(connection.guildName) : "Discord server",
          channelId: connection.channelId ? String(connection.channelId) : null,
          channelName: connection.channelName ? String(connection.channelName) : "Voice channel",
          botName: connection.botName ? String(connection.botName) : "Discord bot",
          connectedAt: connection.connectedAt ?? Number(connection.lastSeen || now),
          lastSeen: Number(connection.lastSeen || now),
          stationMode,
          stationRailId:
            stationMode === "dj" && connection.stationRailId
              ? String(connection.stationRailId)
              : null,
          stationLabel: connection.stationLabel
            ? String(connection.stationLabel)
            : stationMode === "dj"
              ? "DJ station"
              : "Main station",
        };
      });
  } catch {
    return [];
  }
}

function listDiscordBotConnections(now = Date.now()) {
  for (const [id, connection] of discordBotConnections) {
    if (now - Number(connection.lastSeen || 0) > DISCORD_BOT_CONNECTION_STALE_MS) {
      discordBotConnections.delete(id);
    }
  }

  const byId = new Map();
  for (const connection of activeStoredDiscordBotConnections(now)) {
    byId.set(connection.id, connection);
  }
  for (const connection of discordBotConnections.values()) {
    byId.set(connection.id, connection);
  }
  return [...byId.values()].sort((a, b) =>
    String(a.guildName || "").localeCompare(String(b.guildName || ""), undefined, { sensitivity: "base" }),
  );
}

/** Bots on main/live follow the global broadcast; DJ-pinned bots are a separate side channel. */
function isMainStationDiscordBot(connection) {
  return connection?.stationMode !== "dj";
}

export function listSitePresenceRoster() {
  const now = Date.now();
  prunePresence(now);

  const byActor = new Map();

  for (const entry of clients.values()) {
    const existing = byActor.get(entry.actorId);
    if (!existing) {
      byActor.set(entry.actorId, { ...entry });
      continue;
    }
    existing.listening = existing.listening || entry.listening;
    existing.online = existing.online || entry.online;
    existing.onStage = existing.onStage || entry.onStage;
    if (entry.lastSeen >= existing.lastSeen) {
      existing.displayName = entry.displayName;
      existing.avatar = entry.avatar;
      existing.avatarVariant = entry.avatarVariant;
      existing.coverIcon = entry.coverIcon;
      existing.roleColor = entry.roleColor;
      existing.roleType = entry.roleType;
      existing.level = entry.level;
      existing.isGuest = entry.isGuest;
      existing.lastSeen = entry.lastSeen;
      existing.source = entry.source;
    }
  }

  const listening = [];
  const online = [];
  const stage = [];
  for (const entry of byActor.values()) {
    const member = toPublicMember(entry);
    if (entry.onStage) stage.push(member);
    if (entry.listening) listening.push(member);
    if (entry.online) online.push(member);
  }

  const stageCount = stage.length;
  const botConnections = listDiscordBotConnections(now);
  const botConnectionCount = botConnections.length;
  const mainStationBotCount = botConnections.filter(isMainStationDiscordBot).length;
  const onlineCount = online.length;
  const listeningCount = listening.length + mainStationBotCount;

  sortMembers(stage);
  sortMembers(listening);
  sortMembers(online);

  return {
    stage,
    listening,
    online,
    botConnections,
    listeningCount,
    onlineCount,
    totalCount: byActor.size + botConnectionCount,
    stageCount,
    botConnectionCount,
    mainStationBotCount,
  };
}

function collectIpsForActor(actorId) {
  const ips = new Set();
  const id = String(actorId || "").trim();
  if (!id) return ips;
  for (const entry of clients.values()) {
    if (entry.actorId === id && entry.clientIp) ips.add(entry.clientIp);
  }
  return ips;
}

function collectOnStageIps() {
  const ips = new Set();
  for (const entry of clients.values()) {
    if (entry.onStage && entry.clientIp) ips.add(entry.clientIp);
  }
  return ips;
}

export function guestIpMatchesOnStage(guestActorId) {
  if (!String(guestActorId || "").startsWith("guest:")) return false;
  const guestIps = collectIpsForActor(guestActorId);
  if (!guestIps.size) return false;
  const stageIps = collectOnStageIps();
  for (const ip of guestIps) {
    if (stageIps.has(ip)) return true;
  }
  return false;
}
