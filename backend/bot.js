// bot.js
import { Client, GatewayIntentBits, Partials } from "discord.js";
import crypto from "node:crypto";
import prism from "prism-media";
import fetch from "node-fetch";
import WebSocket, { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import {
  CONTENT_POLICY_MUTED_TITLE,
  CONTENT_POLICY_MUTED_ARTIST,
  isContentPolicyMutedMetadata,
  resolveContentPolicyForBroadcast,
} from "./src/http/contentPolicy.js";
import {
  initV2,
  isSetupComplete,
  getAppSession,
  tryHandleV2Request,
  getUserRoleInfoV2,
  canUserBroadcastV2,
  isUserAdminV2,
  canUserPromoteV2,
  hasWsToken,
  getWsTokenSecret,
  persistWsTokenToDb,
  verifyBroadcastDeviceFromRequest,
  setPartyEffectsContext,
  setLevelingContext,
} from "./src/bridge.js";
import { setBroadcastSessionLogContext } from "./src/http/broadcastSessionLog.js";
import { onDjSwitch, setStageShareContext } from "./src/radio/stageShareXp.js";
import { getUserById } from "./src/db/index.js";
import { touchUserVisit } from "./src/db/userActivity.js";
import { tryAwardApprovalXp, tryAwardRequestPlayXp } from "./src/db/userLevel.js";
import { bumpTrackSession, getTrackSessionId, heartCurrentTrackFromDiscord } from "./src/http/leveling.js";
import {
  beginBroadcastSession,
  endBroadcastSession,
  markSessionTrackFromRequest,
  updateSessionTrackAlbumArtByTitleArtist,
} from "./src/radio/broadcastSessionLog.js";
import { publicUserPresentation } from "./src/db/userProfile.js";
import {
  publishPcmFrame,
  configureStreamHub,
  registerBroadcasterRail,
  unregisterBroadcasterRail,
  setLiveRail,
  setStreamHubHandoffHandler,
  flushStreamHubForBroadcasterSwitch,
  wirePcmRelayOutputs,
  getLiveRailId,
  stopLiveMp3Publisher,
  setMp3BroadcastSessionActive,
} from "./src/radio/streamHub.js";
import {
  encodePcmRelayFrame,
  encodeLiveRailMessage,
  PCM_FRAME_BYTES as RELAY_PCM_FRAME_BYTES,
} from "./src/radio/pcmRelayProtocol.js";
import {
  publishBroadcastStatusChanged,
  publishBroadcastSessionLogChanged,
  publishChatChanged,
  publishPresenceRoster,
} from "./src/http/liveEvents.js";
import {
  listSitePresenceRoster,
  removeSitePresence,
  removeDiscordBotPresence,
  touchDiscordBotPresence,
  touchRelayPresence,
} from "./src/presence/sitePresence.js";
import { getLastfmApiKey, getIntegrationsConfig, isAllowedGifUrl } from "./src/settings/integrations.js";
import { isPrivateNetworkRemote, safeResolveUnderRoot } from "./src/security/network.js";
import { consumeRateLimit, clientIp } from "./src/security/rateLimit.js";
import { icecastStatusHeaders, staticFileHeaders } from "./src/security/httpHeaders.js";
import {
  allowsGuestHandlerAuthPost,
  allowsShareTokenApiRead,
  hasSessionOrShareToken,
} from "./src/security/access.js";
import { verifyGuestSession } from "./src/security/guestSession.js";
import {
  guestStageDisplayName,
  guestStageProfile,
  publishGuestDisplayName,
  publishGuestProfile,
  purgeGuestDisplayNamesForShareLink,
  setGuestRelayDisplaySync,
} from "./src/http/guestBroadcast.js";
import { setOnRevokeShareLink } from "./src/db/shareLinks.js";
import {
  countUnreadMessages,
  markChatReadForRecipient,
  purgeGuestReadStateForShareLink,
  recipientKeyForGuest,
  recipientKeyForUser,
} from "./src/chat/chatReadState.js";
import { isMutationOriginAllowed } from "./src/security/origin.js";
import { mirrorInternalSongInfo } from "./src/voice/internalSongMirror.js";
import { createRailPlaybackResolver } from "./src/voice/railPlaybackResolver.js";
import {
  handleProceduralTrackArtRoute,
  proceduralTrackArtPath,
} from "./src/art/proceduralTrackArt.js";
import { resolvePublicAlbumArtUrl } from "./src/http/publicBaseUrl.js";
import { loadAppConfig } from "./src/config/loadConfig.js";
import {
  issueBootstrapTokenOnStartup,
  printBootstrapBanner,
} from "./src/setup/bootstrapToken.js";
import { requireSetupOrAllow } from "./src/http/setup.js";
import {
  getAudioSettings,
  getLimitsSettings,
  onOperationalSettingsChanged,
  runDebugLogRetention,
  setOperationalDebugLogDir,
} from "./src/settings/operational.js";

// Load configuration (env vars WEB_PORT, WS_PORT, PCM_RELAY_PORT override config.json)
const BACKEND_ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = path.join(BACKEND_ROOT, "config.json");
let config;
try {
  config = loadAppConfig(CONFIG_PATH, BACKEND_ROOT);
  console.log(`✅ Configuration loaded from ${CONFIG_PATH}`);
  if (process.env.WEB_PORT || process.env.WS_PORT || process.env.PCM_RELAY_PORT) {
    console.log(
      `   Ports: web=${config.server.webPort} ws=${config.server.wsPort} pcmRelay=${config.server.pcmRelayPort}`,
    );
  }
} catch (error) {
  console.error(`❌ Failed to load config from ${CONFIG_PATH}:`, error.message);
  process.exit(1);
}

configureStreamHub({
  webStreamDelayMs: 0,
});

function discordFallbackOrigin() {
  if (!config.discord?.domain) return null;
  return `https://${String(config.discord.domain).replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

function publicAlbumArtUrl(url) {
  return resolvePublicAlbumArtUrl(url, discordFallbackOrigin());
}

function backendProceduralTrackArtUrl(title, artist) {
  return proceduralTrackArtPath(title, artist, 300);
}

function fallbackAlbumArtUrl(title, artist) {
  if (!title || !artist || isPlaceholderPlaybackTitle(title)) return null;
  return backendProceduralTrackArtUrl(title, artist);
}

function isUsableAlbumArtUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("/") ||
    text.startsWith("data:image/")
  );
}

/** Real cover art when present; otherwise procedural `/art/track` for this title/artist. */
function coalesceTrackAlbumArt(title, artist, albumArt) {
  if (isUsableAlbumArtUrl(albumArt)) return String(albumArt).trim();
  return fallbackAlbumArtUrl(title, artist);
}

setStreamHubHandoffHandler(() => {
  try {
    publishBroadcastStatusChanged("stream-handoff");
    debugLog("stream_hub_handoff_committed", { pcmHub: true, warmMp3Encoders: true });
  } catch {}
});

// NEW CODE - TESTING: Deep debug logger to file
const DEBUG_LOG_DIR = config.server.debugLogDir;
try { if (!fs.existsSync(DEBUG_LOG_DIR)) fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true }); } catch {}
const DEBUG_LOG_FILE = path.join(DEBUG_LOG_DIR, `stream-debug-${new Date().toISOString().replace(/[:.]/g,'-')}.log`);
let debugStream = null;
try { debugStream = fs.createWriteStream(DEBUG_LOG_FILE, { flags: 'a' }); } catch {}
function debugLog(event, data = {}) {
  try {
    const line = JSON.stringify({ t: Date.now(), iso: new Date().toISOString(), event, ...data }) + '\n';
    if (debugStream) debugStream.write(line);
  } catch {}
}

// Basic log retention runs after database init (see below).

// NEW CODE - TESTING: persistent storage directory (for sessions, etc.)
const STORAGE_DIR = config.server.storageDir;
try { if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true }); } catch {}
initV2({ storageDir: STORAGE_DIR, config });
setOperationalDebugLogDir(DEBUG_LOG_DIR);
try {
  runDebugLogRetention(DEBUG_LOG_DIR, getLimitsSettings().logRetentionCount);
} catch {}
onOperationalSettingsChanged(({ audio }) => {
  applyLiveAudioSettings(audio);
});

if (!isSetupComplete()) {
  try {
    const token = await issueBootstrapTokenOnStartup();
    if (token) printBootstrapBanner(token);
  } catch (err) {
    console.warn("[Setup] Bootstrap token generation failed:", err?.message || err);
  }
}

const RADIO_DEV = process.env.RADIO_DEV === "1" || process.env.NODE_ENV === "development";
const DEV_UI_ORIGIN = (process.env.RADIO_DEV_UI_ORIGIN || "http://127.0.0.1:5173").replace(/\/$/, "");

// -----------------
// DISCORD CONFIG
// -----------------
const TOKEN = config.discord?.botToken;

// -----------------
// DISCORD OAUTH CONFIG
// -----------------
const DISCORD_CLIENT_ID = config.discord?.clientId;
const DISCORD_CLIENT_SECRET = config.discord?.clientSecret;
const DISCORD_REDIRECT_URI = config.discord?.domain
  ? `https://${config.discord.domain}/auth/callback`
  : "";
const DISCORD_ANDROID_REDIRECT_URI = config.discord?.domain
  ? `https://${config.discord.domain}/oauth_callback`
  : "";
const DISCORD_INVITE_URL = config.discord?.inviteUrl || "";

// In-memory Discord sessions (persisted to storage on change)
const discordSessions = [];
const SESSIONS_FILE = path.join(STORAGE_DIR, 'discord_sessions.json');
function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(discordSessions, null, 2));
    debugLog('sessions_saved', { count: discordSessions.length });
  } catch (e) { try { debugLog('sessions_save_error', { message: e?.message || String(e) }); } catch {} }
}
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Only keep non-expired
        const now = Date.now();
        for (const s of arr) {
          if (s && s.token && s.expiresAt && s.expiresAt > now) discordSessions.push(s);
        }
        debugLog('sessions_loaded', { count: discordSessions.length });
      }
    }
  } catch (e) { try { debugLog('sessions_load_error', { message: e?.message || String(e) }); } catch {} }
}
loadSessions();

// Periodic cleanup of expired persisted data
function cleanupPersistence() {
  try {
    const now = Date.now();
    // Discord sessions
    let changed = false;
    for (let i = discordSessions.length - 1; i >= 0; i--) {
      if (!discordSessions[i]?.expiresAt || discordSessions[i].expiresAt <= now) {
        discordSessions.splice(i, 1);
        changed = true;
      }
    }
    if (changed) { try { saveSessions(); } catch {} }

    // WS tokens
    let pruned = 0;
    for (const [jti, meta] of Array.from(issuedWsTokens.entries())) {
      if (!meta?.exp || meta.exp <= now) { issuedWsTokens.delete(jti); pruned++; }
    }
    if (pruned > 0) { try { persistWsTokens(); } catch {} }

    // Last.fm cache (remove beyond TTL to keep file small)
    let lfPruned = 0;
    for (const [k, v] of Array.from(lastfmCredCache.entries())) {
      if (!v?.ts || (now - v.ts) > LASTFM_CACHE_TTL_MS) { lastfmCredCache.delete(k); lfPruned++; }
    }
    if (lfPruned > 0) { try { saveLastfmCache(); } catch {} }

    try { debugLog('cleanup_persistence', { sessions: discordSessions.length, wsTokens: issuedWsTokens.size, lastfmCache: lastfmCredCache.size }); } catch {}
  } catch {}
}
try { cleanupPersistence(); } catch {}
setInterval(() => { try { cleanupPersistence(); } catch {} }, 10 * 60 * 1000);

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  });
  return out;
}

function getDiscordSession(req) {
  if (isSetupComplete()) {
    const v2 = getAppSession(req);
    if (!v2) return null;
    const userRow = getUserById(Number(v2.user.id));
    const presentation = userRow ? publicUserPresentation(userRow) : null;
    return {
      token: v2.token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      user: {
        id: v2.user.id,
        username: v2.user.username,
        role: v2.user.role,
        displayName: presentation?.displayName || v2.user.username,
        avatar: presentation?.avatar || null,
      },
    };
  }
  // Check Bearer token first
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const bearer = auth.slice('Bearer '.length).trim();
    const now = Date.now();
    const s = discordSessions.find(s => s.token === bearer && s.expiresAt > now);
    if (s) return s;
  }
  // Check cookie
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['discord_session'];
  if (token) {
    const now = Date.now();
    const s = discordSessions.find(s => s.token === token && s.expiresAt > now);
    if (s) return s;
  }
  return null;
}

function requireAuthForApi(req, res) {
  const session = getDiscordSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  return session;
}

function serveJoinRequired(res, username, options = { showReturnButton: false }) {
  const body = `<!DOCTYPE html>
  <html lang="en"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Join Required</title>
  <style>
    body{background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#111827;border:1px solid #374151;border-radius:12px;padding:24px;max-width:560px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    h1{margin:0 0 10px;font-size:20px}
    p{margin:8px 0 0;line-height:1.5}
    .row{display:flex;gap:12px;margin-top:16px}
    a.btn,button.btn{display:inline-block;background:#5865F2;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;border:0;cursor:pointer}
    button.secondary{background:#374151}
    small{display:block;margin-top:8px;color:#9ca3af}
  </style></head>
  <body><div class="card">
    <h1>Access requires joining the Discord server</h1>
    <p>${username ? `Hi ${username}, ` : ''}you are authenticated with Discord, but you must join our server to access this site.</p>
    <p>Please join using this invite link, then return here and refresh:</p>
    <div class="row">
      <a class="btn" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener">Join Discord Server</a>
      ${options.showReturnButton ? `<button class=\"btn secondary\" onclick=\"(async()=>{try{await fetch('/api/join-debug',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:false})});location.href='/';}catch(e){alert('Failed to return to app');}})()\">Return to App</button>` : ''}
    </div>
  </div></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}
const CLIENT_ID = config.discord?.clientId;
const GUILD_ID = config.discord?.guildId;
const legacyRoles = config.roles || {
  admin: { id: "0", permissions: {} },
  moderator: { id: "0", permissions: {} },
  stagePass: { id: "0", permissions: {} },
};
const HOST_ROLE_ID = legacyRoles.admin.id;

// Centralized role configuration (legacy Discord auth only — unused after v2 setup)
const ROLE_CONFIG = {
  ADMIN_ROLE_ID: legacyRoles.admin.id,
  STAGE_PASS_ROLE_ID: legacyRoles.stagePass.id,
  MODERATOR_ROLE_ID: legacyRoles.moderator.id,
  PERMISSIONS: {
    [legacyRoles.admin.id]: {
      level: 'ADMIN',
      ...legacyRoles.admin.permissions
    },
    [legacyRoles.stagePass.id]: {
      level: 'STAGE_PASS',
      ...legacyRoles.stagePass.permissions
    },
    [legacyRoles.moderator.id]: {
      level: 'MODERATOR',
      ...legacyRoles.moderator.permissions
    }
  }
}

// WS token signing (short-lived tokens for relay auth)
let WS_TOKEN_SECRET = getWsTokenSecret();
const WS_TOKENS_FILE = path.join(STORAGE_DIR, 'ws_tokens.json');
let issuedWsTokens = new Map(); // jti -> { userId, exp }
try {
	if (fs.existsSync(WS_TOKENS_FILE)) {
		const raw = fs.readFileSync(WS_TOKENS_FILE, 'utf8');
		const obj = JSON.parse(raw);
		if (obj && typeof obj === 'object') {
			for (const k of Object.keys(obj)) issuedWsTokens.set(k, obj[k]);
		}
	}
} catch {}
function persistWsTokens() {
	try {
		const obj = {};
		for (const [k, v] of issuedWsTokens.entries()) obj[k] = v;
		fs.writeFileSync(WS_TOKENS_FILE, JSON.stringify(obj, null, 2));
		debugLog('ws_tokens_saved', { count: issuedWsTokens.size });
	} catch (e) { try { debugLog('ws_tokens_save_error', { message: e?.message || String(e) }); } catch {} }
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signWsToken(payload) {
  const json = JSON.stringify(payload);
  const body = base64url(json);
  const sig = crypto.createHmac('sha256', WS_TOKEN_SECRET).update(body).digest();
  const sigB64 = base64url(sig);
	// Track issued token meta
	try { if (payload && payload.jti) { issuedWsTokens.set(payload.jti, { userId: String(payload.userId), exp: payload.exp }); persistWsTokens(); if (isSetupComplete()) persistWsTokenToDb(payload.jti, Number(payload.userId), payload.exp); } } catch {}
  return `${body}.${sigB64}`;
}

function verifyWsToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = base64url(crypto.createHmac('sha256', WS_TOKEN_SECRET).update(body).digest());
  if (sig !== expected) return null;
  try {
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object') return null;
    if (payload.aud !== 'ws-relay') return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
		// Optional: check we issued it (persisted)
		if (!payload.jti || (!issuedWsTokens.has(payload.jti) && !(isSetupComplete() && hasWsToken(payload.jti)))) return null;
    return payload;
  } catch {
    return null;
	}
}

// Helper: determine if a Discord user has the host role (backward compatibility)
async function isUserHost(userId) {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return false;
    const member = await guild.members.fetch(String(userId));
    // Check if user has admin, stage pass, or moderator role (any host role)
    return !!member.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID) || 
           !!member.roles?.cache?.has(ROLE_CONFIG.STAGE_PASS_ROLE_ID) ||
           !!member.roles?.cache?.has(ROLE_CONFIG.MODERATOR_ROLE_ID);
  } catch {
    return false;
  }
}

// Helper: get user's role info and permissions
async function getUserRoleInfo(userId) {
  if (isSetupComplete()) {
    const user = getUserById(Number(userId));
    if (user) return getUserRoleInfoV2(userId);
  }
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return { level: null, permissions: {}, roleColor: null };
    
    const member = await guild.members.fetch(String(userId));
    if (!member) return { level: null, permissions: {}, roleColor: null };
    
    // Check which roles the user has and find the highest permission level
    const userRoles = Array.from(member.roles.cache.keys());
    let highestPerm = null;
    let userPermissions = {};
    let highestRoleId = null;
    
    // First pass: find the highest permission role
    // Role hierarchy: ADMIN > MODERATOR > STAGE_PASS
    const roleHierarchy = { 'ADMIN': 3, 'MODERATOR': 2, 'STAGE_PASS': 1 };
    
    for (const [roleId, config] of Object.entries(ROLE_CONFIG.PERMISSIONS)) {
      if (userRoles.includes(roleId)) {
        const currentLevel = roleHierarchy[config.level] || 0;
        const highestLevel = roleHierarchy[highestPerm?.level] || 0;
        
        // If this role has higher permissions than current highest, update
        if (!highestPerm || currentLevel > highestLevel) {
          highestPerm = config;
          userPermissions = config;
          highestRoleId = roleId;
        }
      }
    }
    
    // Second pass: get the color from the highest role
    let highestRoleColor = null;
    if (highestRoleId) {
      const discordRole = member.roles.cache.get(highestRoleId);
      if (discordRole && discordRole.color !== 0) {
        highestRoleColor = `#${discordRole.color.toString(16).padStart(6, '0')}`;
      }
    }
    
    const result = {
      level: highestPerm?.level || null,
      permissions: userPermissions,
      roleType: highestPerm?.level || null,
      roleColor: highestRoleColor
    };
    
    
    return result;
  } catch {
    return { level: null, permissions: {}, roleColor: null };
  }
}

// Helper: check if user can broadcast (has any host role)
async function canUserBroadcast(userId, tokenPayload = null) {
  const id = String(userId || "");
  if (id.startsWith("guest:")) {
    const { isGuestBroadcasterUserId } = await import("./src/http/guestBroadcast.js");
    return isGuestBroadcasterUserId(id, tokenPayload);
  }
  if (isSetupComplete()) return canUserBroadcastV2(userId);
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo.permissions.canBroadcast === true;
}

// Helper: check if user is admin (can do everything)
async function isUserAdmin(userId) {
  if (isSetupComplete()) return isUserAdminV2(userId);
  const roleInfo = await getUserRoleInfo(userId);
  return roleInfo.level === 'ADMIN';
}

// Helper: check if user can promote others (admin can always, stage pass needs to be active broadcaster)
async function canUserPromote(userId, isCurrentBroadcaster = false) {
  if (isSetupComplete()) return canUserPromoteV2(userId, isCurrentBroadcaster);
  const roleInfo = await getUserRoleInfo(userId);
  
  // Admin can always promote
  if (roleInfo.permissions.canPromoteUsers && roleInfo.permissions.canPromoteWhenInactive) {
    return true;
  }
  
  // Stage pass users can promote only when they are the current broadcaster
  if (roleInfo.permissions.canPromoteUsers && !roleInfo.permissions.canPromoteWhenInactive && isCurrentBroadcaster) {
    return true;
  }
  
  // Otherwise cannot promote
  return false;
}

// Message sync configuration
// Optional config.channels.syncChannelId — omit or set "None" to disable:
//   - Song info posting to Discord
//   - Discord-to-web chat bridging
//   - Web-to-Discord message syncing
//   - Song request embeds and voting
const rawSyncChannelId = config.channels?.syncChannelId;
const SYNC_CHANNEL_ID =
  rawSyncChannelId == null || rawSyncChannelId === "None" ? null : rawSyncChannelId;
const SYNC_ENABLED = SYNC_CHANNEL_ID !== null;
const discordIdToHashMap = new Map(); // In-memory: Discord ID -> hash

// -----------------
// Last.fm override state
// -----------------
const LASTFM_CACHE_TTL_MS = config.limits?.lastfmCacheTtlMs ?? 600_000;
const lastfmCredCache = new Map(); // hash -> { valid: boolean, ts: number }
const LASTFM_CACHE_FILE = path.join(STORAGE_DIR, 'lastfm_cache.json');
function saveLastfmCache() {
  try {
    const obj = {};
    for (const [k, v] of lastfmCredCache.entries()) obj[k] = v;
    fs.writeFileSync(LASTFM_CACHE_FILE, JSON.stringify(obj, null, 2));
    debugLog('lastfm_cache_saved', { count: lastfmCredCache.size });
  } catch (e) { try { debugLog('lastfm_cache_save_error', { message: e?.message || String(e) }); } catch {} }
}
function loadLastfmCache() {
  try {
    if (!fs.existsSync(LASTFM_CACHE_FILE)) return;
    const raw = fs.readFileSync(LASTFM_CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object' && typeof v.ts === 'number') {
          // keep entries; they expire at read time where we check TTL
          lastfmCredCache.set(k, v);
        }
      }
    }
    debugLog('lastfm_cache_loaded', { count: lastfmCredCache.size });
  } catch (e) { try { debugLog('lastfm_cache_load_error', { message: e?.message || String(e) }); } catch {} }
}
loadLastfmCache();
let currentLastfmOverride = null; // { user, apiKey, wsId }
let currentLastfmHash = null;
function hashLastfmCred(user, apiKey) {
  try {
    return crypto.createHash('sha1').update(`${user}|${apiKey}`).digest('hex');
  } catch { return `${user}|${apiKey}`; }
}
    

// Legacy Discord radio client (optional — disabled after v2 setup)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

function isDiscordRadioClientReady() {
  return client.isReady() && !!client.user;
}

let currentSong = "N/A";
let currentArtist = "N/A";
let streamMetadataDisabled = false;
let lastSongQueue = "";
let isBroadcasting = false; // Track if stream is actively broadcasting
// -----------------
// RELAY BOT (moved to standalone relay-bot.js)
// -----------------
// NOTE: The inline relay bot implementation (second Discord client in this
// process) caused shared voice connection conflicts with @discordjs/voice.
// The relay bot is now implemented in a separate process (relay-bot.js)
// which connects to a PCM relay exposed by this main server.

// Track song info messages in sync channel
let currentSongInfoMessage = null;
let currentPostedSong = null; // Track { title, artist } to prevent duplicate posts
const songInfoMessages = []; // Array of { messageId, timestamp }
// Map Discord request embed message id -> songKey
const discordRequestMsgIdToSongKey = new Map();

// -----------------
// BROADCAST STATUS
// -----------------
const broadcastStatus = {
  active: false,
  startTime: null,
  lastDisconnect: null,
  broadcasterUserId: null,
  broadcasterDisplayName: null,
};

// Stage / rail identity — must exist before HTTP server accepts requests.
const wsConnections = new Map();
let activeWsId = null;

function setContentPolicyMutedForUser(userId, muted) {
  const uid = String(userId);
  for (const info of wsConnections.values()) {
    if (String(info.userId) === uid) {
      info.contentPolicyMuted = !!muted;
      if (muted) {
        info.contentPolicyPending = false;
      }
    }
  }
}

function setContentPolicyPendingForUser(userId, pending) {
  const uid = String(userId);
  for (const info of wsConnections.values()) {
    if (String(info.userId) === uid) {
      info.contentPolicyPending = !!pending;
    }
  }
}

function isActiveRelayContentPolicyPending() {
  if (!activeWsId || !broadcastStatus.active) return false;
  return !!wsConnections.get(activeWsId)?.contentPolicyPending;
}

function unwrapPolicyMutedNativeMetadata(metadata) {
  if (!metadata) return null;
  if (!isContentPolicyMutedMetadata(metadata.title, metadata.artist)) {
    return metadata;
  }
  const rawTitle = String(metadata.rawTitle || "").trim();
  const rawArtist = String(metadata.rawArtist || "").trim();
  if (!rawTitle || !rawArtist) return null;
  return {
    title: rawTitle,
    artist: rawArtist,
    albumArt: metadata.rawAlbumArt ?? metadata.albumArt ?? null,
    timestamp: metadata.timestamp,
  };
}

function getRelayNativeMetadataForPolicy(authUserId, userWsId) {
  const railMeta = userWsId ? getStoredNativeMetadataByKey(nativeMetadataRailKey(userWsId)) : null;
  const railResolved = unwrapPolicyMutedNativeMetadata(railMeta);
  if (railResolved) return railResolved;

  const userMeta = getBestNativeMetadataForUser(authUserId);
  const userResolved = unwrapPolicyMutedNativeMetadata(userMeta);
  if (userResolved) return userResolved;

  return null;
}

function reapplyContentPolicyAfterCapabilitiesUpdate(authUserId, userWsId) {
  if (!userWsId || !broadcastStatus.active) {
    return { muted: false, deferred: false, decision: null, metadata: null };
  }

  const stored = getRelayNativeMetadataForPolicy(authUserId, userWsId);
  const wsInfo = wsConnections.get(userWsId);
  const policyInput = {
    source: wsInfo?.capabilities?.site || null,
    title: stored?.title ?? null,
    artist: stored?.artist ?? null,
  };

  const { decision, deferred, muted } = resolveContentPolicyForBroadcast(policyInput, {
    userId: authUserId,
    broadcasterName: broadcastStatus.broadcasterDisplayName,
  });

  setContentPolicyMutedForUser(authUserId, muted);
  setContentPolicyPendingForUser(authUserId, deferred && !muted);

  if (!stored?.title || !stored?.artist) {
    if (muted) {
      forceImmediateNowPlayingMetadata(
        CONTENT_POLICY_MUTED_TITLE,
        CONTENT_POLICY_MUTED_ARTIST,
        null,
      );
    } else if (!deferred) {
      clearPolicyMuteFromMetaState();
    }
    return { muted, deferred, decision, metadata: null };
  }

  const displayTitle = muted ? CONTENT_POLICY_MUTED_TITLE : stored.title;
  const displayArtist = muted ? CONTENT_POLICY_MUTED_ARTIST : stored.artist;
  const displayAlbumArt = muted ? null : stored.albumArt ?? null;
  const metadata = {
    title: displayTitle,
    artist: displayArtist,
    albumArt: coalesceTrackAlbumArt(displayTitle, displayArtist, displayAlbumArt),
    timestamp: Date.now(),
    sourceSite: wsInfo?.capabilities?.site ?? null,
    policyPending: deferred && !muted,
    ...(muted
      ? {
          rawTitle: stored.title,
          rawArtist: stored.artist,
          rawAlbumArt: stored.albumArt ?? null,
        }
      : {}),
  };

  storeNativeMetadataByKey(nativeMetadataRailKey(userWsId), metadata);

  if (muted) {
    forceImmediateNowPlayingMetadata(displayTitle, displayArtist, metadata.albumArt);
  } else if (!deferred) {
    forceImmediateNowPlayingMetadata(stored.title, stored.artist, stored.albumArt ?? null);
  }

  return { muted, deferred, decision, metadata };
}

function syncInternalSongMirror() {
  try {
    const art =
      currentSong && currentSong !== "N/A"
        ? lookupAlbumArtForLiveTrack(currentSong, currentArtist, { stored: true }) ||
          fallbackAlbumArtUrl(currentSong, currentArtist)
        : null;
    mirrorInternalSongInfo({
      title:
        currentSong &&
        currentSong !== "N/A" &&
        !isPlaceholderPlaybackTitle(currentSong)
          ? currentSong
          : null,
      artist:
        currentArtist && currentArtist !== "N/A" && !streamMetadataDisabled
          ? currentArtist
          : null,
      albumArtUrl: art,
      liveRailId: activeWsId,
      active: broadcastStatus.active,
      broadcasterDisplayName: broadcastStatus.broadcasterDisplayName,
    });
    if (
      activeWsId &&
      currentSong &&
      currentArtist &&
      !streamMetadataDisabled &&
      !isPlaceholderPlaybackTitle(currentSong)
    ) {
      setRailPlaybackSnapshot(activeWsId, {
        title: currentSong,
        artist: currentArtist,
        albumArt: art,
      });
    }
  } catch {}
}

function clearNowPlayingMetaState() {
  try {
    const metaState = globalThis.__metaState;
    if (!metaState) return;
    if (metaState.pendingTimer) {
      clearTimeout(metaState.pendingTimer);
      metaState.pendingTimer = null;
    }
    if (metaState.discordBotTimer) {
      clearTimeout(metaState.discordBotTimer);
      metaState.discordBotTimer = null;
    }
    metaState.pending = null;
    metaState.lastStabilized = null;
    metaState.lastPayload = null;
  } catch (error) {
    console.error("Failed to clear now playing meta state:", error.message);
  }
}

function clearPolicyMuteFromMetaState() {
  try {
    const metaState = globalThis.__metaState;
    if (!metaState) return;
    if (!isContentPolicyMutedMetadata(metaState.lastStabilized?.title, metaState.lastStabilized?.artist)) {
      return;
    }
    clearNowPlayingMetaState();
    console.log("📡 Cleared policy-muted now playing placeholder; awaiting fresh metadata");
  } catch (error) {
    console.error("Failed to clear policy mute meta state:", error.message);
  }
}

function purgeNativeMetadataForBroadcaster(userId, wsId = null) {
  if (userId != null) {
    const uid = String(userId);
    nativeMetadataStore = nativeMetadataStore.filter(
      (item) => item.key !== uid && !item.key.startsWith(`${uid}:`),
    );
  }
  if (wsId) {
    const railKey = nativeMetadataRailKey(wsId);
    nativeMetadataStore = nativeMetadataStore.filter((item) => item.key !== railKey);
    invalidateRailPlayback(wsId);
    const wsInfo = wsConnections.get(wsId);
    if (wsInfo) {
      wsInfo.trackTitle = null;
      wsInfo.trackArtist = null;
      wsInfo.trackAlbumArt = null;
      wsInfo.trackUpdatedAt = null;
    }
  }
}

function resetBroadcastNowPlayingState(userId, wsId = null) {
  purgeNativeMetadataForBroadcaster(userId, wsId);
  clearNowPlayingMetaState();
  currentSong = "N/A";
  currentArtist = "N/A";
  streamMetadataDisabled = false;
  console.log("📡 Broadcast now playing metadata reset");
}

function beginFreshBroadcastSession(wsId, userId) {
  resetBroadcastNowPlayingState(userId, wsId);
  const wsInfo = wsConnections.get(wsId);
  if (wsInfo) {
    const now = Date.now();
    wsInfo.metadataInvalidatedAt = now;
    wsInfo.broadcastSessionStartedAt = now;
    wsInfo.contentPolicyMuted = false;
    wsInfo.contentPolicyPending = false;
    wsInfo.capabilities = {
      supportsMediaControls: false,
      site: null,
      lastUpdated: now,
    };
  }
}

function invalidateMetadataForSiteChange(userWsId, authUserId = null) {
  if (userWsId) {
    const railKey = nativeMetadataRailKey(userWsId);
    nativeMetadataStore = nativeMetadataStore.filter((item) => item.key !== railKey);
    invalidateRailPlayback(userWsId);
    const wsInfo = wsConnections.get(userWsId);
    if (wsInfo) {
      wsInfo.trackTitle = null;
      wsInfo.trackArtist = null;
      wsInfo.trackAlbumArt = null;
      wsInfo.trackUpdatedAt = null;
    }
  }
  if (authUserId != null) {
    const uid = String(authUserId);
    nativeMetadataStore = nativeMetadataStore.filter(
      (item) => item.key !== uid && !item.key.startsWith(`${uid}:`),
    );
  }
  clearNowPlayingMetaState();
}

function isNowPlayingMetadataStale() {
  if (!activeWsId || !broadcastStatus.active) return false;
  const wsInfo = wsConnections.get(activeWsId);
  if (!wsInfo?.broadcastSessionStartedAt) return true;
  const staleAfter = Math.max(
    wsInfo.metadataInvalidatedAt || 0,
    wsInfo.broadcastSessionStartedAt || 0,
  );
  if (!staleAfter) return false;
  const native = getNativeMetadataForActiveRail();
  if (!native) return true;
  if (isContentPolicyMutedMetadata(native.title, native.artist)) {
    return false;
  }
  return native.timestamp <= staleAfter;
}

function shouldHoldNowPlayingForPolicy() {
  return isNowPlayingMetadataStale() || isActiveRelayContentPolicyPending();
}

function forceImmediateNowPlayingMetadata(title, artist, albumArt = null) {
  try {
    const displayTitle = String(title || "").trim();
    const displayArtist = String(artist || "").trim();
    if (!displayTitle || !displayArtist) return;

    const art = albumArt || fallbackAlbumArtUrl(displayTitle, displayArtist);
    if (typeof globalThis.__metaState === "undefined") {
      globalThis.__metaState = {
        lastStabilized: null,
        lastPayload: null,
        pending: null,
        pendingTimer: null,
        discordBotTimer: null,
      };
    }
    const metaState = globalThis.__metaState;
    if (metaState.pendingTimer) {
      clearTimeout(metaState.pendingTimer);
      metaState.pendingTimer = null;
    }
    if (metaState.discordBotTimer) {
      clearTimeout(metaState.discordBotTimer);
      metaState.discordBotTimer = null;
    }
    metaState.pending = null;

    const imageEntry = art
      ? [
          { size: "small", "#text": art },
          { size: "medium", "#text": art },
          { size: "large", "#text": art },
          { size: "extralarge", "#text": art },
        ]
      : [];

    metaState.lastPayload = {
      recenttracks: {
        track: [
          {
            name: displayTitle,
            artist: { "#text": displayArtist },
            "@attr": { nowplaying: "true" },
            image: imageEntry,
          },
        ],
      },
    };
    metaState.lastStabilized = {
      title: displayTitle,
      artist: displayArtist,
      albumArt: art || null,
      url: null,
    };

    updateDiscordBotFromMetadata(displayTitle, displayArtist, false, null);
    syncInternalSongMirror();
    if (isContentPolicyMutedMetadata(displayTitle, displayArtist)) {
      console.log(`🔇 Content policy mute: now playing set to "${displayTitle}" / "${displayArtist}"`);
    } else {
      console.log(`📡 Now playing updated immediately: "${displayTitle}" / "${displayArtist}"`);
    }
  } catch (error) {
    console.error("Failed to force immediate now playing metadata:", error.message);
  }
}

function lookupAlbumArtForLiveTrack(title, artist, { stored = false } = {}) {
  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  if (!trackTitle || !trackArtist) return null;
  const cacheKey = `${trackTitle}|||${trackArtist}`;
  const cached = albumArtCache.get(cacheKey);
  if (cached?.url && Date.now() - cached.timestamp < ALBUM_ART_CACHE_TTL_MS) {
    return stored ? cached.url : publicAlbumArtUrl(cached.url);
  }
  const stable = globalThis.__metaState?.lastStabilized;
  if (
    stable &&
    stable.title === trackTitle &&
    stable.artist === trackArtist &&
    stable.albumArt
  ) {
    return stored ? stable.albumArt : publicAlbumArtUrl(stable.albumArt);
  }
  const native = getNativeMetadataForActiveRail();
  if (
    native?.title === trackTitle &&
    native?.artist === trackArtist &&
    isUsableAlbumArtUrl(native.albumArt)
  ) {
    return stored ? native.albumArt : publicAlbumArtUrl(native.albumArt);
  }
  if (activeWsId) {
    const snapshot = getRailPlaybackSnapshot(activeWsId);
    if (
      snapshot?.title === trackTitle &&
      snapshot?.artist === trackArtist &&
      isUsableAlbumArtUrl(snapshot.albumArt)
    ) {
      return stored ? snapshot.albumArt : publicAlbumArtUrl(snapshot.albumArt);
    }
  }
  return null;
}

function guestApiSessionValid(data) {
  const shareToken = String(data?.shareToken || "");
  const guestId = String(data?.guestId || "");
  const guestSession = String(data?.guestSession || "");
  if (!shareToken || !guestId || !guestSession) return false;
  return verifyGuestSession(guestSession, shareToken, guestId);
}

// Debug flag to force displaying the join-required page even if in guild
let forceJoinDebug = false;

function setBroadcastActive(isActive) {
  const wasActive = broadcastStatus.active;
  setMp3BroadcastSessionActive(isActive);
  broadcastStatus.active = isActive;

  if (isActive) {
    if (!wasActive || !broadcastStatus.startTime) {
      broadcastStatus.startTime = new Date().toISOString();
      beginBroadcastSession(broadcastStatus.startTime);
    }
    if (!wasActive) {
      clearNowPlayingMetaState();
    }
    broadcastStatus.lastDisconnect = null;
    console.log("📡 Broadcast status: ACTIVE");

  } else {
    const endingUserId = broadcastStatus.broadcasterUserId;
    const endingWsId = activeWsId;
    broadcastStatus.lastDisconnect = new Date().toISOString();
    broadcastStatus.startTime = null;
    endBroadcastSession();
    console.log("📡 Broadcast status: IDLE");

    if (wasActive) {
      resetBroadcastNowPlayingState(endingUserId, endingWsId);
      try { flushStreamHubForBroadcasterSwitch(); } catch {}
      try { stopLiveMp3Publisher(); } catch {}
    }

    broadcastStatus.broadcasterUserId = null;
    broadcastStatus.broadcasterDisplayName = null;
  }
  syncInternalSongMirror();
  if (wasActive !== isActive) {
    publishBroadcastStatusChanged(isActive ? "active" : "idle");
  }
}

// -----------------
// MESSAGE SYNC HELPERS
// -----------------

// Standard hash function (matches backend)
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
}

// Seeded random function (XorShift algorithm - matches frontend exactly)
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

// Generate procedural username from hash (EXACT match with frontend)
function generateUsernameFromHash(ipHash) {
  // Generate a pronounceable-ish name from hash
  const consonants = 'bcdfghjklmnprstvwxyz';  // No 'q' or 'z'
  const vowels = 'aeiou';
  const seed = parseInt(ipHash.slice(0, 8), 16);
  const rand = seededRandom(seed);
  
  let name = '';
  for (let i = 0; i < 3; i++) {  // 3 pairs, not 4
    name += consonants[Math.floor(rand() * consonants.length)];
    name += vowels[Math.floor(rand() * vowels.length)];
  }
  
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Get display name for a hash (for Discord display)
async function getDisplayNameForHash(hash) {
  // If this is the special 'host' hash, try to resolve a member with HOST_ROLE_ID
  if (hash === "0266b2c6") {
    try {
      const guild = client.guilds.cache.get(GUILD_ID);
      if (guild) {
        const members = await guild.members.fetch();
        const hostMember = members.find(m => m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID));
        if (hostMember) return `<@${hostMember.id}>`;
      }
    } catch {}
  }
  
  // Check if hash matches a known Discord user
  for (const [discordId, userHash] of discordIdToHashMap) {
    if (userHash === hash) {
      return `<@${discordId}>`;
    }
  }
  
  // Regular web user - procedural name
  return generateUsernameFromHash(hash);
}

// Process message content - no mention processing, just return as-is
function processMessageContent(content, isFromDiscord) {
  return content;
}

// Get message author info for Discord display (now using Discord userId)
function getMessageAuthor(msg) {
  // Handle special system messages (isHost without userId)
  if (msg.isHost && !msg.userId) return { type: 'host', userId: null, name: 'Radio Host' };
  
  // Handle regular user messages with Discord userId
  if (msg.userId && msg.userId !== 'null' && msg.userId !== 'undefined') {
    return { type: 'discord', userId: String(msg.userId), name: msg.username || null };
  }
  
  // Fallback for messages without proper user info
  return { type: 'procedural', name: 'Listener' };
}

// Create Discord embed for a message
function createMessageEmbed(msg) {
  const author = getMessageAuthor(msg);
  
  const isRequest = msg.type === 'SYSTEM_REQUEST';
  
  if (isRequest) {
    // Extract song info from request message
    const match = msg.content.match(/<@([0-9]+)> requested "([^"]+)" by (.+)/) || msg.content.match(/\{([0-9]+)\} requested "([^"]+)" by (.+)/);
    if (match) {
      const [_, requesterHash, title, artist] = match;
      const songKey = getSongKey(title, artist);
      const request = requests[songKey];
      
      if (request) {
        const votePercentage = calculateVotePercentage(request);
        const upvotes = request.votes?.filter(v => v.vote === 1).length || 0;
        const downvotes = request.votes?.filter(v => v.vote === -1).length || 0;
        
        // Get requester display name
        const requesterName = getDisplayNameForHash(requesterHash);
        const displayName = requesterName.startsWith('<@') ? requesterName : `**${requesterName}**`;
        
        // Status-based colors and emojis
        const statusConfig = {
          requested: { emoji: '⏳', color: 0x3498DB, label: 'Requested' },
          approved: { emoji: '✅', color: 0x2ECC71, label: 'Approved' },
          denied: { emoji: '❌', color: 0xE74C3C, label: 'Denied' },
          playing: { emoji: '▶️', color: 0x9B59B6, label: 'Now Playing' }
        };
        
        const config = statusConfig[request.status] || statusConfig.requested;
        
        return {
          title: `🎵 Song Request - ${config.emoji} ${config.label}`,
          description: `${displayName} requested:\n**${title}**\nby ${artist}`,
          url: request.url,
          color: config.color,
          fields: [
            {
              name: '📊 Voting',
              value: `👍 ${upvotes}  👎 ${downvotes}  (${votePercentage}% approval)`,
              inline: false
            }
          ],
          footer: { text: `ID: ${msg.id}` }
        };
      }
    }
    
    // Fallback if we can't parse or find the request
    return {
      title: '🎵 Song Request',
      description: msg.content.replace(/\{[a-f0-9]+\}/, ''),
      color: 0x3498DB,
      footer: { text: `ID: ${msg.id}` }
    };
  }
  
  // Regular messages - process normally
  let processedContent = processMessageContent(msg.content, !!msg.discord);
  
  // Regular message
  const color = author.type === 'host' ? 0xFFD700 : // Gold for host
                author.type === 'discord' ? 0x5865F2 : // Discord blurple
                0x3498DB; // Blue for web users
  
  // Build username display (mentions work in description)
  let usernameDisplay = '';
  if (author.type === 'host') {
    usernameDisplay = `**${author.name}**`; // Radio Host (bold)
  } else if (author.type === 'discord') {
    usernameDisplay = `<@${author.userId}>`; // @DiscordUser mention
  } else {
    usernameDisplay = `**${author.name}**`; // Procedural name (bold)
  }
  
  return {
    title: '💬 Message',
    description: `${usernameDisplay} wrote: ${processedContent}`,
    color: color,
    footer: { text: `ID: ${msg.id}` }
  };
}

// Sync messages from database to Discord channel
async function syncMessagesToDiscord() {
  if (!SYNC_ENABLED || !isDiscordRadioClientReady()) return;
  try {
    const channel = await client.channels.fetch(SYNC_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    
    // Fetch recent Discord messages (limit 100)
    const discordMessages = await channel.messages.fetch({ limit: 100 });
    
    // Extract message IDs from embeds (format: "ID: {id}" in footer)
    const discordMessageIds = new Set();
    const discordMessageMap = new Map(); // messageId -> Discord message
    
    for (const [_, discordMsg] of discordMessages) {
      if (discordMsg.author.id === client.user.id && discordMsg.embeds.length > 0) {
        const footer = discordMsg.embeds[0].footer?.text;
        if (footer) {
          // Extract ID from format: "ID: {id}"
          const match = footer.match(/^ID: ([a-zA-Z0-9]+)$/);
          if (match) {
            const msgId = match[1];
            discordMessageIds.add(msgId);
            discordMessageMap.set(msgId, discordMsg);
          }
        }
      }
    }
    
    // Get current database message IDs
    const dbMessageIds = new Set(messages.map(m => m.id));
    
    // Update existing request messages if their data changed
    for (const msg of messages) {
      if (msg.type === 'SYSTEM_REQUEST' && discordMessageMap.has(msg.id)) {
        const discordMsg = discordMessageMap.get(msg.id);
        const newEmbed = createMessageEmbed(msg);
        
        // Check if embed needs updating (compare stringified versions)
        const currentEmbed = discordMsg.embeds[0];
        const embedChanged = JSON.stringify(currentEmbed) !== JSON.stringify(newEmbed);
        
        if (embedChanged) {
          try {
            await discordMsg.edit({ embeds: [newEmbed] });
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit safety
          } catch (err) {
            console.error('[Sync] Failed to update request embed:', err.message);
          }
        }
      }
    }
    
    // Delete Discord messages not in database
    for (const [msgId, discordMsg] of discordMessageMap) {
      if (!dbMessageIds.has(msgId)) {
        await discordMsg.delete();
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit safety
      }
    }
    
    // Find database messages not in Discord
    const missingMessages = messages.filter(m => !discordMessageIds.has(m.id));
    
    // Sort by timestamp (oldest first) to maintain order
    missingMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    // Create embeds for missing messages
    for (const msg of missingMessages) {
      const embed = createMessageEmbed(msg);
      const sent = await channel.send({ embeds: [embed] });
      // Track request embeds for reaction voting
      if (msg.type === 'SYSTEM_REQUEST') {
        try {
          const match = msg.content.match(/requested "([^"]+)" by (.+)/);
          if (match) {
            const [_, title, artist] = match;
            const songKey = getSongKey(title, artist);
            discordRequestMsgIdToSongKey.set(sent.id, songKey);
            await sent.react('👍');
            await sent.react('👎');
          }
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit safety
    }
    
  } catch (error) {
    console.error('[Sync] Failed to sync messages:', error.message);
  }
}

// Post or update "Now Playing" embed without recreating
async function postSongInfo(title, artist) {
  if (!SYNC_ENABLED || !isDiscordRadioClientReady()) return;
  try {
    console.log(`[Song Info] postSongInfo called with title: "${title}", artist: "${artist}"`);
    const invalidValues = ['N/A', 'null', 'undefined', '', null, undefined, 'Unknown Title', 'Unknown Artist'];
    if (invalidValues.includes(title) || invalidValues.includes(artist)) {
      console.log(`[Song Info] Skipping post due to invalid metadata - title: "${title}", artist: "${artist}"`);
      return;
    }

    // If song hasn't changed, just update timestamp and return
    const sameAsLast = currentPostedSong && currentPostedSong.title === title && currentPostedSong.artist === artist;
    console.log(`[Song Info] Same as last song: ${sameAsLast}, currentPostedSong:`, currentPostedSong);

    const channel = await client.channels.fetch(SYNC_CHANNEL_ID);
    console.log(`[Song Info] Channel fetched:`, channel ? 'success' : 'failed');
    if (!channel || !channel.isTextBased()) {
      console.log(`[Song Info] Channel is invalid or not text-based`);
      return;
    }

    // Build embed
    const embed = {
      title: '🎵 Now Playing',
      description: `**${title}**\nby ${artist}`,
      color: 0x1DB954,
      timestamp: new Date().toISOString(),
      footer: { text: 'Song Info' }
    };

    // Try to edit existing now playing message if we have or can find it
    let targetMsg = null;
    if (currentSongInfoMessage) {
      try { targetMsg = await channel.messages.fetch(currentSongInfoMessage); } catch {}
    }
    if (!targetMsg) {
      // Search recent bot messages for one with footer 'Song Info'
      try {
        const recent = await channel.messages.fetch({ limit: 50 });
        for (const [, m] of recent) {
          if (m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].footer?.text === 'Song Info') {
            targetMsg = m; currentSongInfoMessage = m.id; break;
          }
        }
      } catch {}
    }

    if (targetMsg) {
      // Update in place
      console.log(`[Song Info] Updating existing message ${targetMsg.id}`);
      try { 
        await targetMsg.edit({ embeds: [embed] }); 
        console.log(`[Song Info] Successfully updated message`);
      } catch (e) {
        console.error('[Song Info] Failed to edit message:', e.message);
      }
      currentPostedSong = { title, artist };
    } else {
      // Create once if none exists
      console.log(`[Song Info] Creating new message`);
      try {
        const sent = await channel.send({ embeds: [embed] });
        currentSongInfoMessage = sent.id;
        currentPostedSong = { title, artist };
        songInfoMessages.push({ messageId: sent.id, timestamp: Date.now() });
        console.log(`[Song Info] Successfully created new message ${sent.id}`);
      } catch (e) {
        console.error('[Song Info] Failed to send song info:', e.message);
      }
    }
  } catch (error) {
    console.error('[Song Info] Failed to post/update song info:', error.message);
  }
}

// Post disabled metadata info to Discord
async function postDisabledMetadataInfo(broadcasterName) {
  if (!SYNC_ENABLED || !isDiscordRadioClientReady()) return;
  try {
    const invalidValues = ['N/A', 'null', 'undefined', '', null, undefined];
    if (invalidValues.includes(broadcasterName)) broadcasterName = 'Someone';

    const channel = await client.channels.fetch(SYNC_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    // Build embed for disabled metadata
    const embed = {
      title: '🎵 Now Playing',
      description: `**${broadcasterName} is playing music**`,
      color: 0x1DB954,
      timestamp: new Date().toISOString(),
      footer: { text: 'Song Info' }
    };

    // Try to edit existing now playing message if we have or can find it
    let targetMsg = null;
    if (currentSongInfoMessage) {
      try { targetMsg = await channel.messages.fetch(currentSongInfoMessage); } catch {}
    }
    if (!targetMsg) {
      // Search recent bot messages for one with footer 'Song Info'
      try {
        const recent = await channel.messages.fetch({ limit: 50 });
        for (const [, m] of recent) {
          if (m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].footer?.text === 'Song Info') {
            targetMsg = m; currentSongInfoMessage = m.id; break;
          }
        }
      } catch {}
    }

    if (targetMsg) {
      // Update in place
      try { await targetMsg.edit({ embeds: [embed] }); } catch {}
      currentPostedSong = { title: `${broadcasterName} is playing music`, artist: '' };
    } else {
      // Create once if none exists
      try {
        const sent = await channel.send({ embeds: [embed] });
        currentSongInfoMessage = sent.id;
        currentPostedSong = { title: `${broadcasterName} is playing music`, artist: '' };
        songInfoMessages.push({ messageId: sent.id, timestamp: Date.now() });
      } catch (e) {
        console.error('[Song Info] Failed to send disabled metadata info:', e.message);
      }
    }
  } catch (error) {
    console.error('[Song Info] Failed to post disabled metadata info:', error.message);
  }
}

// Update Discord bot status and song info based on metadata
async function updateDiscordBotFromMetadata(title, artist, isDisabled = false, broadcasterName = null) {
  try {
    const invalidValues = ['N/A', 'null', 'undefined', '', null, undefined, 'Unknown Title', 'Unknown Artist'];
    
    // Check if we have valid metadata
    // Also treat the static Icecast-only placeholder as invalid
    if (!isDisabled && (invalidValues.includes(title) || invalidValues.includes(artist) || title === 'Music playing')) {
      try { debugLog('bot_skip_invalid', { title, artist }); } catch {}
      return;
    }
    
    // Determine what to display
    let displayTitle = title;
    let displayArtist = artist;
    
    if (isDisabled) {
      // Metadata disabled: show broadcaster name or fallback
      displayTitle = broadcasterName ? `${broadcasterName} is playing music` : 'Someone is playing music';
      displayArtist = '';
    }
    
    // Only update if the song has changed
    if (displayTitle !== currentSong || displayArtist !== currentArtist) {
      // Clean up any requests that were in "playing" status (song changed, so they're done)
      for (const [songKey, request] of Object.entries(requests)) {
        if (request.status === 'playing') {
          try { debugLog('request_mark_played_on_song_change', { title: request.title, artist: request.artist }); } catch {}
          markRequestPlayed(songKey, { source: 'metadata' });
        }
      }
      
      currentSong = displayTitle;
      currentArtist = displayArtist;
      streamMetadataDisabled = isDisabled;
      if (!isDisabled && displayTitle && displayArtist) {
        bumpTrackSession(displayTitle, displayArtist);
      }
      // Voice bot (relay-bot.js) reads metadata via internalSongMirror + /internal/song-info
      syncInternalSongMirror();
      if (!isDisabled && displayTitle && displayArtist) {
        try { debugLog('song_change', { title: displayTitle, artist: displayArtist }); } catch {}
        tryMatchAnyRequestToNowPlaying(displayTitle, displayArtist, { source: "metadata" });
      }
    }
    syncInternalSongMirror();
  } catch (error) {
    console.error('[Discord Bot Update] Failed to update Discord bot from metadata:', error.message);
  }
}

// Calculate vote percentage for a request
function calculateVotePercentage(request) {
  if (!request.votes || request.votes.length === 0) return 0;
  
  const upvotes = request.votes.filter(v => v.vote === 1).length;
  const totalVotes = request.votes.length;
  return Math.round((upvotes / totalVotes) * 100);
}

// -----------------
// LOOSE MATCH HELPERS (Now Playing detection)
// -----------------
function normalizeForMatch(str) {
  if (!str) return '';
  // Lowercase, strip common decorations and non-alphanumerics
  return String(str)
    .toLowerCase()
    .replace(/\(feat\.[^)]+\)/g, ' ')
    .replace(/\[(feat\.|ft\.|with)[^\]]+\]/g, ' ')
    .replace(/feat\.|ft\.|with/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsEitherWay(a, b) {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function isLooseSongMatch(reqTitle, reqArtist, curTitle, curArtist) {
  const rt = normalizeForMatch(reqTitle);
  const ra = normalizeForMatch(reqArtist);
  const ct = normalizeForMatch(curTitle);
  const ca = normalizeForMatch(curArtist);
  return containsEitherWay(rt, ct) && containsEitherWay(ra, ca);
}

// Send request DM to host with voting info
async function sendRequestDM(request, songKey) {
  try {
    // Find a member with admin role to DM
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const members = await guild.members.fetch();
    const hostMember = members.find(m => m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID));
    if (!hostMember) return;
    const user = await client.users.fetch(hostMember.id);
    
    const votePercentage = calculateVotePercentage(request);
    const upvotes = request.votes.filter(v => v.vote === 1).length;
    const downvotes = request.votes.filter(v => v.vote === -1).length;
    
    const embed = {
      title: '🎵 Song Request',
      description: `**${request.title}**\nby ${request.artist}`,
      url: request.url,
      color: 0x1DB954,
      fields: [
        {
          name: '📊 Voting',
          value: `👍 ${upvotes}  👎 ${downvotes}  (${votePercentage}% approval)`,
          inline: false
        }
      ],
      footer: { text: `Request ID: ${songKey}` }
    };
    
    const message = await user.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: 'Approve',
            custom_id: `approve_${songKey}`
          },
          {
            type: 2,
            style: 4,
            label: 'Deny',
            custom_id: `deny_${songKey}`
          }
        ]
      }]
    });
    
    request.dmMessageId = message.id;
  } catch (error) {
    console.error('[Request] Failed to send DM:', error.message);
  }
}

// Update request DM with new voting info
async function updateRequestDM(request, songKey) {
  try {
    if (!request.dmMessageId) return;
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const members = await guild.members.fetch();
    const hostMember = members.find(m => m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID));
    if (!hostMember) return;
    const user = await client.users.fetch(hostMember.id);
    const dmChannel = user.dmChannel || await user.createDM();
    const message = await dmChannel.messages.fetch(request.dmMessageId);
    
    const votePercentage = calculateVotePercentage(request);
    const upvotes = request.votes.filter(v => v.vote === 1).length;
    const downvotes = request.votes.filter(v => v.vote === -1).length;
    
    const embed = {
      title: '🎵 Song Request',
      description: `**${request.title}**\nby ${request.artist}`,
      url: request.url,
      color: 0x1DB954,
      fields: [
        {
          name: '📊 Voting',
          value: `👍 ${upvotes}  👎 ${downvotes}  (${votePercentage}% approval)`,
          inline: false
        }
      ],
      footer: { text: `Request ID: ${songKey}` }
    };
    
    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('[Request] Failed to update DM:', error.message);
  }
}

// Delete request DM
async function deleteRequestDM(messageId) {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const members = await guild.members.fetch();
    const hostMember = members.find(m => m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID));
    if (!hostMember) return;
    const user = await client.users.fetch(hostMember.id);
    const dmChannel = user.dmChannel || await user.createDM();
    const message = await dmChannel.messages.fetch(messageId);
    await message.delete();
  } catch (error) {
    // Message already deleted
  }
}

// Clean up song info messages older than 24 hours
async function cleanupOldSongInfo() {
  if (!SYNC_ENABLED) return;
  try {
    const channel = await client.channels.fetch(SYNC_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    // Fetch recent messages (limit 100) to find old song info
    const discordMessages = await channel.messages.fetch({ limit: 100 });
    
    for (const [messageId, message] of discordMessages) {
      // Check if this is a song info message (has "Song Info" footer)
      if (message.embeds.length > 0 && 
          message.embeds[0].footer && 
          message.embeds[0].footer.text === 'Song Info') {
        
        // Check age using message timestamp
        const messageAge = now - message.createdTimestamp;
        
        if (messageAge > twentyFourHours) {
          try {
            await message.delete();
            console.log(`[Song Info] Deleted old song info message (${Math.floor(messageAge / (60 * 60 * 1000))}h old)`);
          } catch (err) {
            // Message already deleted or not found
          }
          
          // Remove from tracking array if present
          const index = songInfoMessages.findIndex(m => m.messageId === messageId);
          if (index !== -1) {
            songInfoMessages.splice(index, 1);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('[Song Info] Failed to cleanup old song info:', error.message);
  }
}

function startMetadataPolling() {
  void fetchSongInfo().catch(() => {});
  setInterval(() => {
    void fetchSongInfo().catch(() => {});
  }, 10000);
  console.log("🎵 Song metadata polling started (for voice bot presence mirror)");

  try { if (metricsInterval) clearInterval(metricsInterval); } catch {}
  metricsInterval = setInterval(() => {
    try {
      const now = Date.now();
      const lastWsTs = wsLastMessageTs.get(activeWsId || 'unknown') || null;
      const msSinceActiveMsg = lastWsTs ? (now - lastWsTs) : null;
      const deltaMs = now - lastMetricsTs;
      const kbpsIn = deltaMs > 0 ? ((activeWsBytesIn * 8) / deltaMs) : 0;
      debugLog('metrics', {
        activeWsId,
        msSinceActiveMsg,
        kbpsIn,
        pcmBufferBytes: pcmWriteRemainder.length,
        adaptiveBufferThreshold,
        publisherBackpressure,
        lastDrainAgoMs: lastDrainTs ? (now - lastDrainTs) : null,
        pacerUnderrunCount,
        trimCount,
        keepaliveWriteCount,
        backpressureCount
      });
      activeWsBytesIn = 0;
      lastMetricsTs = now;
    } catch {}
  }, 2000);
}

// -----------------
// FETCH CURRENT SONG INFO (mirrored to voice bot via internalSongMirror)
// -----------------
async function fetchSongInfo() {
  try {
    const { getActiveListenerCount } = await import('./src/http/stream.js');
    const listeners = getActiveListenerCount();
    
    let newTitle = "N/A";
    let newArtist = "N/A";
    
    try {
      // OLD CODE - KEEP UNTIL CONFIRMED WORKING: Direct Last.fm fetching with overrides
      // ... removed in favor of backend-stabilized endpoint below ...

      // NEW CODE - Use backend-stabilized endpoint so bot inherits delay/artwork
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const lfRes = await fetch(`http://127.0.0.1:${config.server.webPort}/api/metadata`, { signal: controller.signal });
      clearTimeout(t);
      if (!lfRes.ok) throw new Error(`lastfm endpoint ${lfRes.status}`);
      const lastfmData = await lfRes.json();
      if (lastfmData && lastfmData.disabled) {
        // Metadata disabled: announce broadcaster only
        const name = lastfmData?.broadcaster?.displayName || lastfmData?.broadcaster?.userId || 'Someone';
        newTitle = `${name} is playing music`;
        newArtist = '';
        // Do not update Icecast metadata per-track; it's static
      } else {
        const native = getNativeMetadataForActiveRail();
        if (
          native?.title &&
          native?.artist &&
          broadcastStatus.active &&
          !isPlaceholderPlaybackTitle(native.title)
        ) {
          newTitle = native.title;
          newArtist = native.artist;
        } else {
          const track = lastfmData?.recenttracks?.track?.[0];
          if (track && track['@attr']?.nowplaying === 'true') {
            newTitle = track.name || "N/A";
            newArtist = track.artist?.['#text'] || track.artist || "N/A";
          } else {
            newTitle = currentSong || "N/A";
            newArtist = currentArtist || "N/A";
          }
        }
      }
    } catch (lastfmErr) {
      newTitle = currentSong || "N/A";
      newArtist = currentArtist || "N/A";
    }

    // Update broadcast status (true if source exists and has valid song info)
    const wasbroadcasting = isBroadcasting;
  const invalidValues = ['N/A', 'null', 'undefined', '', 'Unknown Title', 'Unknown Artist'];
    isBroadcasting = broadcastStatus.active &&
                     !invalidValues.includes(newTitle) && 
                     !invalidValues.includes(newArtist);

  // Do not update Icecast metadata here; static value is set once at publisher start

  // Skip fake transitions into invalid placeholders entirely
  const isValidTransition = !invalidValues.includes(newTitle) && !invalidValues.includes(newArtist);
  if (isValidTransition && (newTitle !== currentSong || newArtist !== currentArtist)) {
      // FIRST: Clean up any requests that were in "playing" status (song changed, so they're done)
      for (const [songKey, request] of Object.entries(requests)) {
        if (request.status === 'playing') {
          console.log(`[Request] Marking as played (song changed): ${request.title} by ${request.artist}`);
          markRequestPlayed(songKey, { source: 'metadata' });
        }
      }
      
      currentSong = newTitle;
      currentArtist = newArtist;
      streamMetadataDisabled = false;
      if (newTitle && newArtist) {
        bumpTrackSession(newTitle, newArtist);
      }
      
      // Voice bot (relay-bot.js) reads metadata via internalSongMirror + /internal/song-info
      await updateDiscordBotFromMetadata(currentSong, currentArtist, false, null);
      
      // Check if the NEW song matches any request and set it to "playing"
      // Check if the NEW song matches any request (auto-approve + mark playing when needed)
    const newSongKey = getSongKey(newTitle, newArtist);
    try { debugLog('song_change', { title: newTitle, artist: newArtist, key: newSongKey }); } catch {}
      
      // Debug: show all active requests
      if (Object.keys(requests).length > 0) {
        try {
          debugLog('request_active_list', {
            items: Object.keys(requests).map(key => {
              const [t, a] = key.split('|||');
              return { title: t, artist: a, status: requests[key].status };
            })
          });
        } catch {}
      }
      
      tryMatchAnyRequestToNowPlaying(newTitle, newArtist, { source: "metadata" });
    }

    syncInternalSongMirror();
    return { title: currentSong, artist: currentArtist, listeners };
  } catch (err) {
    console.log("Failed to fetch song info:", err.message);
    isBroadcasting = false;
    return { title: "N/A", artist: "N/A", listeners: 0 };
  }
}

/* LEGACY playRelayRadio reference — see relay-bot.js
async function playRelayRadio(voiceChannel) {
  try {
    const guildId = voiceChannel.guild.id;
    
    // Join the voice channel
    console.log(`🔗 Relay bot attempting to join voice channel ${voiceChannel.id} in guild ${guildId} (${voiceChannel.guild.name})`);
    
    // Ensure we're using the relay client's guild for the voice adapter
    const relayGuild = relayClient.guilds.cache.get(guildId);
    if (!relayGuild) {
      throw new Error(`Relay bot is not in guild ${guildId}`);
    }
    
    // Get the voice channel from the relay client's guild
    const relayVoiceChannel = relayGuild.channels.cache.get(voiceChannel.id);
    if (!relayVoiceChannel || !relayVoiceChannel.isVoiceBased()) {
      throw new Error(`Voice channel ${voiceChannel.id} not found in relay bot's guild`);
    }
    
    // CRITICAL: Only destroy OUR OWN existing connection for this guild
    // DO NOT use getVoiceConnection() as it returns ANY connection for the guild,
    // which could be the other bot's connection!
    const existingRelayConn = relayConnections.get(guildId);
    if (existingRelayConn && existingRelayConn.connection) {
      console.log(`   ⚠️ Relay bot: Found OUR existing connection for guild ${guildId}, destroying it first`);
      console.log(`   Existing connection state: ${existingRelayConn.connection.state.status}`);
      console.log(`   Existing connection channelId: ${existingRelayConn.connection.joinConfig?.channelId}`);
      try {
        existingRelayConn.connection.destroy();
        if (existingRelayConn.player) existingRelayConn.player.stop();
        if (existingRelayConn.buffered) existingRelayConn.buffered.end();
        if (existingRelayConn.onData && relayPcmBus) relayPcmBus.off('data', existingRelayConn.onData);
        relayConnections.delete(guildId);
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.log(`   Error destroying existing connection: ${err.message}`);
      }
    }
    
    console.log(`   Creating NEW connection using relay client's guild and voice adapter creator`);
    console.log(`   Relay bot user ID: ${relayClient.user.id}`);
    console.log(`   Relay guild ID: ${relayGuild.id}`);
    console.log(`   Voice channel ID: ${relayVoiceChannel.id}`);
    
    // Create a completely new connection with the relay bot's client context
    const connection = joinVoiceChannel({
      channelId: relayVoiceChannel.id,
      guildId: relayGuild.id, // Use relay guild ID explicitly
      adapterCreator: relayGuild.voiceAdapterCreator, // Use relay guild's adapter creator
    });
    
    console.log(`   ✅ Connection object created: ${connection.constructor.name}`);
    console.log(`   Connection joinConfig: channelId=${connection.joinConfig?.channelId}, guildId=${connection.joinConfig?.guildId}`);
    console.log(`   Connection state: ${connection.state.status}`);
    console.log(`   Connection object ID/reference: ${connection.constructor.name}@${connection.state?.status || 'unknown'}`);

    // Wait for connection to fully establish and bot to actually join the channel
    // Discord.js connection can be "ready" but bot might not be in channel yet
    let connected = false;
    const maxAttempts = 15; // Increase to 7.5 seconds
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = connection.state.status;
      console.log(`   Connection state check ${i + 1}/${maxAttempts}: ${status}`);
      
      if (status === 'ready' || status === 'signalling' || status === 'connecting') {
        // Check if bot is actually in the channel by verifying voice state
        try {
          const guild = relayClient.guilds.cache.get(guildId);
          if (guild) {
            // Force refresh the member to get latest voice state
            const botMember = await guild.members.fetch(relayClient.user.id, { force: true });
            const botVoiceChannelId = botMember.voice?.channelId;
            console.log(`   Voice state check: botMember exists=${!!botMember}, botVoiceChannelId=${botVoiceChannelId}, expected=${voiceChannel.id}`);
            
            // Also check main bot's voice state for comparison
            const mainBotGuild = client.guilds.cache.get(guildId);
            if (mainBotGuild) {
              try {
                const mainBotMember = await mainBotGuild.members.fetch(client.user.id);
                console.log(`   Main bot voice state: channelId=${mainBotMember.voice?.channelId}`);
              } catch {}
            }
            
            if (botMember && botVoiceChannelId === voiceChannel.id) {
              connected = true;
              console.log(`✅ Relay bot verified in voice channel ${voiceChannel.id}`);
              break;
            } else if (botMember && botVoiceChannelId) {
              console.log(`   ⚠️ Relay bot is in a different channel: ${botVoiceChannelId} (expected ${voiceChannel.id})`);
            } else if (botMember) {
              console.log(`   ⚠️ Relay bot member exists but not in any voice channel (status: ${status})`);
              // If connection is ready but bot isn't in channel, Discord might be blocking it
              // Check if main bot is in the same channel - Discord might not allow two bots
              if (i >= 5) { // After 2.5 seconds, check if main bot is blocking
                const mainBotGuild = client.guilds.cache.get(guildId);
                if (mainBotGuild) {
                  try {
                    const mainBotMember = await mainBotGuild.members.fetch(client.user.id);
                    if (mainBotMember.voice?.channelId === voiceChannel.id) {
                      console.log(`   ⚠️ Main bot is in the same channel - Discord may not allow two bots simultaneously`);
                    }
                  } catch {}
                }
              }
            }
          } else {
            console.log(`   ⚠️ Guild not found in relay client cache`);
          }
        } catch (err) {
          console.log(`   Voice state check error: ${err.message}`);
        }
      }
      
      if (status === 'disconnected' || status === 'destroyed') {
        console.error(`❌ Relay bot connection failed: ${status}`);
        connection.destroy();
        throw new Error(`Connection failed with status: ${status}`);
      }
    }
    
    if (!connected) {
      console.error(`❌ Relay bot failed to join voice channel after ${maxAttempts * 0.5} seconds`);
      console.error(`   Connection state: ${connection.state.status}`);
      console.error(`   This may indicate Discord is preventing the bot from joining, or a permissions issue`);
      connection.destroy();
      throw new Error('Bot did not join voice channel within timeout period. The main bot may need to leave first, or there may be a permissions issue.');
    }
    
    console.log(`✅ Relay bot connection fully established. State: ${connection.state.status}`);

    // Create a buffered stream for this specific server connection
    const bus = ensureRelayBus();
    const DISCORD_BUFFER_FRAMES = getAudioSettings().discordBufferFrames;
    const buffered = new PassThrough({ highWaterMark: PCM_FRAME_BYTES * (DISCORD_BUFFER_FRAMES + 200) });
    let started = false;
    const queue = [];
    
    // Create a data handler for this specific connection
    const onData = (frame) => {
      try {
        if (!started) {
          queue.push(Buffer.from(frame));
          if (queue.length >= DISCORD_BUFFER_FRAMES) {
            started = true;
            for (const f of queue) buffered.write(f);
            queue.length = 0;
          }
          return;
        }
        buffered.write(frame);
      } catch {}
    };
    
    // Add this connection's handler to the shared bus
    // Multiple handlers can listen to the same bus - each gets a copy of the data
    bus.on('data', onData);

    // Create audio player for this connection
    const player = createAudioPlayer();
    const resource = createAudioResource(buffered, { inputType: StreamType.Raw });
    player.play(resource);
    connection.subscribe(player);

    // Store connection info
    relayConnections.set(guildId, {
      connection,
      player,
      buffered,
      onData,
      guildId,
      channelId: voiceChannel.id
    });

    player.on(AudioPlayerStatus.Playing, () => {
      console.log(`🎶 Relay bot streaming to guild ${guildId} (${voiceChannel.guild.name})`);
    });
    
    const cleanup = () => {
      try {
        if (bus && onData) bus.off('data', onData);
        if (buffered) buffered.end();
        relayConnections.delete(guildId);
        console.log(`👋 Relay bot disconnected from guild ${guildId}. Remaining: ${relayConnections.size}`);
      } catch {}
    };
    
    player.on("error", e => {
      console.error(`❌ Relay player error (guild ${guildId}):`, e.message);
      cleanup();
    });
    
    player.on(AudioPlayerStatus.Idle, cleanup);
    
    // Handle connection state changes
    connection.on('stateChange', (oldState, newState) => {
      console.log(`🔗 Relay bot connection state change (guild ${guildId}): ${oldState.status} -> ${newState.status}`);
      if (newState.status === 'disconnected' || newState.status === 'destroyed') {
        console.log(`   Connection lost for guild ${guildId}, cleaning up...`);
        cleanup();
      } else if (newState.status === 'ready') {
        // Verify bot is actually in channel when state becomes ready
        try {
          const guild = relayClient.guilds.cache.get(guildId);
          if (guild) {
            const botMember = guild.members.cache.get(relayClient.user.id);
            if (botMember) {
              console.log(`   Bot voice state: channelId=${botMember.voice?.channelId}, expected=${voiceChannel.id}`);
              if (botMember.voice?.channelId !== voiceChannel.id) {
                console.error(`   ⚠️ WARNING: Bot voice state doesn't match expected channel!`);
              }
            }
          }
        } catch (err) {
          console.error(`   Error checking voice state: ${err.message}`);
        }
      }
    });

    console.log(`✅ Relay bot fully connected to ${voiceChannel.guild.name} (${guildId}). Total active servers: ${relayConnections.size}`);

  } catch (err) {
    console.error("❌ Failed to play relay radio:", err.message);
  }
}
*/

// -----------------
// RELAY BOT COMMAND HANDLER (moved to relay-bot.js)
// -----------------
/* OLD CODE - RELAY BOT COMMANDS (kept for reference)
relayClient.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  // Only handle interactions for this bot (relay bot) - check client instance
  if (interaction.client !== relayClient) return;

  const member = interaction.member;
  const voiceChannel = member.voice?.channel;

  if (interaction.commandName === "join") {
    // Check broadcast status before joining
    if (!broadcastStatus.active) {
      return interaction.reply("📡 No Hosts are broadcasting at the moment.");
    }

    if (!voiceChannel) return interaction.reply("❌ You must be in a voice channel!");
    
    console.log(`🔍 Relay bot /join command received for guild ${interaction.guildId}, channel ${voiceChannel.id}`);
    console.log(`   Bot user ID: ${relayClient.user.id}, Client ID from config: ${config.relayBot?.clientId}`);
    console.log(`   Voice channel name: ${voiceChannel.name}, Guild: ${voiceChannel.guild.name}`);
    
    // Verify we're getting the guild from the relay client
    const relayGuild = relayClient.guilds.cache.get(interaction.guildId);
    if (!relayGuild) {
      console.error(`❌ Relay bot not in guild ${interaction.guildId}`);
      return interaction.reply("❌ Bot is not properly connected to this server. Please re-invite the bot.");
    }
    console.log(`   Relay bot guild verified: ${relayGuild.name}`);
    
    // No need to check for main bot - Discord allows multiple bots in the same channel
    
    // Reply immediately to prevent interaction timeout, then join in background
    await interaction.deferReply();
    
    try {
      await playRelayRadio(voiceChannel);
      await interaction.editReply("📻 Connected and streaming audio!");
    } catch (err) {
      console.error(`❌ Relay bot /join failed:`, err.message);
      await interaction.editReply(`❌ Failed to join voice channel: ${err.message}`);
    }
  }

  if (interaction.commandName === "leave") {
    const guildId = interaction.guildId;
    console.log(`🔍 Relay bot /leave command received for guild ${guildId}`);
    console.log(`   Relay bot user ID: ${relayClient.user.id}`);
    console.log(`   Main bot user ID: ${client.user.id}`);
    console.log(`   Interaction client user ID: ${interaction.client.user.id}`);
    
    // Double-check this is actually the relay bot
    if (interaction.client.user.id !== relayClient.user.id) {
      console.error(`❌ CRITICAL: Relay bot /leave received but interaction is for wrong bot!`);
      return;
    }
    
    const existing = relayConnections.get(guildId);
    
    if (existing) {
      console.log(`👋 Relay bot leaving guild ${guildId} (connection exists)`);
      console.log(`   Main bot connection state: ${connection ? 'EXISTS' : 'null'}`);
      console.log(`   Relay connection state: ${existing.connection ? 'EXISTS' : 'null'}`);
      
      try {
        if (existing.connection) {
          console.log(`   Destroying relay connection for guild ${guildId}`);
          console.log(`   Relay connection object: ${existing.connection.constructor.name}, state: ${existing.connection.state?.status}`);
          console.log(`   Main bot connection object: ${connection ? connection.constructor.name : 'null'}, state: ${connection?.state?.status}`);
          console.log(`   Connection objects are same: ${existing.connection === connection}`);
          console.log(`   Connection object IDs: relay=${existing.connection.constructor.name}, main=${connection?.constructor.name}`);
          
          // Verify this is NOT the main bot's connection by checking the connection's internal state
          // Each connection should have a unique joinConfig
          const relayJoinConfig = existing.connection.joinConfig;
          const mainJoinConfig = connection?.joinConfig;
          console.log(`   Relay joinConfig channelId: ${relayJoinConfig?.channelId}`);
          console.log(`   Main joinConfig channelId: ${mainJoinConfig?.channelId}`);
          
          // If connections are the same object, that's a critical error
          if (existing.connection === connection) {
            console.error(`❌ CRITICAL ERROR: Relay connection object is the same as main bot connection!`);
            console.error(`   This should never happen - connections should be separate objects.`);
            console.error(`   Relay connection state: ${JSON.stringify(existing.connection.state)}`);
            console.error(`   Main connection state: ${JSON.stringify(connection?.state)}`);
            // Don't abort - just log and continue, but this indicates a serious bug
          }
          
          existing.connection.destroy();
        }
        if (existing.player) {
          console.log(`   Stopping relay player for guild ${guildId}`);
          console.log(`   Relay player object: ${existing.player.constructor.name}`);
          console.log(`   Main bot player object: ${player ? player.constructor.name : 'null'}`);
          console.log(`   Player objects are same: ${existing.player === player}`);
          
          // If players are the same object, that's a critical error
          if (existing.player === player) {
            console.error(`❌ CRITICAL ERROR: Relay player object is the same as main bot player!`);
            // Don't abort - just log and continue
          }
          
          existing.player.stop();
        }
        if (existing.buffered) existing.buffered.end();
        if (existing.onData && relayPcmBus) {
          console.log(`   Removing relay bus listener for guild ${guildId}`);
          relayPcmBus.off('data', existing.onData);
        }
      } catch (err) {
        console.error(`❌ Error during relay bot cleanup for guild ${guildId}:`, err.message);
      }
      relayConnections.delete(guildId);
      console.log(`✅ Relay bot left guild ${guildId}. Remaining active servers: ${relayConnections.size}`);
      console.log(`   Main bot connection after relay leave: ${connection ? 'STILL EXISTS' : 'null'}`);
      await interaction.reply("👋 Left the voice channel.");
    } else {
      console.log(`⚠️ Relay bot /leave: No connection found for guild ${guildId}. Active servers: ${Array.from(relayConnections.keys()).join(', ')}`);
      await interaction.reply("❌ I'm not in a voice channel in this server!");
    }
  }
});

// -----------------
// RELAY BOT VOICE STATE UPDATE
// -----------------
relayClient.on("voiceStateUpdate", async (oldState, newState) => {
  // Only handle voice state updates for the relay bot
  if (oldState.member?.id === relayClient.user.id) {
    const wasConnected = !!oldState.channelId;
    const isDisconnected = !newState.channelId;
    if (wasConnected && isDisconnected) {
      const guildId = oldState.guild.id;
      const existing = relayConnections.get(guildId);
      if (existing) {
        try {
          if (existing.player) existing.player.stop();
          if (existing.buffered) existing.buffered.end();
          if (existing.onData && relayPcmBus) relayPcmBus.off('data', existing.onData);
        } catch {}
        relayConnections.delete(guildId);
        console.log(`👋 Relay bot was disconnected from guild ${guildId}. Remaining active servers: ${relayConnections.size}`);
      }
    }
  }
});
*/

// -----------------
// LIQUIDSOAP / WEBSOCKET / HTML SERVERS
// -----------------
// REMOVED: Liquidsoap references - no longer used

// In-process stream hub (encode once, fan out to authenticated listeners)

const WEB_PORT = config.server.webPort;

// Broadcast status HTTP API
// In-memory message store (kept at top-level so it persists between requests)
let messages = [];
let requests = {}; // { "songKey": { title, artist, url, votes: [{ ipHash, host, discord, vote: 1/-1 }], status: "requested"/"approved"/"denied"/"playing", requestedAt, dmMessageId } }
let requestRateLimits = {}; // { "userId|||host": timestamp }
let lastfmSearchCache = {}; // { "query": { results: [...], timestamp } }
let albumArtCache = new Map(); // "title|||artist" -> { url: string, timestamp: number }
const ALBUM_ART_CACHE_TTL_MS = config.limits?.albumArtCacheTtlMs ?? 300_000;

function applySessionLogAlbumArt(title, artist, albumArt) {
  const art = String(albumArt || "").trim();
  if (!art || !title || !artist) return;
  const trackSessionId = updateSessionTrackAlbumArtByTitleArtist(title, artist, art);
  if (trackSessionId) {
    publishBroadcastSessionLogChanged({ trackSessionId, reason: "art" });
  }
}

function chatPingPayload(message) {
  if (!message) return null;
  const base = {
    id: message.id,
    userId: message.userId,
    timestamp: message.timestamp,
  };
  if (message.type === "gif" && message.gifUrl) {
    return { ...base, kind: "gif", gifUrl: String(message.gifUrl) };
  }
  if (message.type === "SYSTEM_REQUEST") {
    return {
      ...base,
      kind: "request",
      requestTitle: message.requestTitle ? String(message.requestTitle) : null,
      requestArtist: message.requestArtist ? String(message.requestArtist) : null,
    };
  }
  return { ...base, kind: "text" };
}

function finalizeChatMutation(reason = "changed", latestMessage = null) {
  if (messages.length > 100) messages = messages.slice(-100);
  const ping = latestMessage ? chatPingPayload(latestMessage) : null;
  const extra =
    ping && (reason === "message" || reason === "request")
      ? { latestMessage: ping }
      : {};
  publishChatChanged(reason, extra);
}

async function resolveChatReadContext(req, bodyData = null) {
  const session = getAppSession(req);
  if (session?.user?.id) {
    const userId = String(session.user.id);
    return {
      recipientKey: recipientKeyForUser(userId),
      viewerUserId: userId,
    };
  }

  const { validateShareToken } = await import("./src/db/shareLinks.js");
  const { shareTokenFromRequest } = await import("./src/security/access.js");
  const url = new URL(req.url, "http://localhost");
  const guestId = bodyData?.guestId ?? url.searchParams.get("guestId");
  const shareToken = bodyData?.shareToken ?? shareTokenFromRequest(req);
  const guestSession = bodyData?.guestSession ?? url.searchParams.get("guestSession");
  if (!guestId || !shareToken || !guestSession) return null;

  const link = validateShareToken(String(shareToken));
  if (!link || link.link_kind !== "ui") return null;

  if (!verifyGuestSession(String(guestSession), String(shareToken), String(guestId))) {
    return null;
  }

  const guestUserId = `guest:${String(guestId)}`;
  return {
    recipientKey: recipientKeyForGuest(String(shareToken), String(guestId)),
    viewerUserId: guestUserId,
  };
}

async function resolveChatReadContextForWrite(req, bodyData = null) {
  const session = getAppSession(req);
  if (session?.user?.id) {
    const userId = String(session.user.id);
    return {
      recipientKey: recipientKeyForUser(userId),
      viewerUserId: userId,
    };
  }

  if (!bodyData?.guestSession || !bodyData?.guestId || !bodyData?.shareToken) return null;
  if (
    !verifyGuestSession(
      String(bodyData.guestSession),
      String(bodyData.shareToken),
      String(bodyData.guestId),
    )
  ) {
    return null;
  }

  const { validateShareToken } = await import("./src/db/shareLinks.js");
  const link = validateShareToken(String(bodyData.shareToken));
  if (!link || link.link_kind !== "ui") return null;

  const guestUserId = `guest:${String(bodyData.guestId)}`;
  return {
    recipientKey: recipientKeyForGuest(String(bodyData.shareToken), String(bodyData.guestId)),
    viewerUserId: guestUserId,
  };
}

function publishCurrentPresenceRoster() {
  publishPresenceRoster(listSitePresenceRoster());
}

function refreshRelayPresence(wsId) {
  const info = wsConnections.get(wsId);
  if (!info?.presenceActor) return;
  touchRelayPresence(`relay:${wsId}`, info.presenceActor, {
    clientIp: info.remoteAddress ?? null,
  });
  if (info.userId && !String(info.userId).startsWith("guest:")) {
    touchUserVisit(info.userId, info.remoteAddress ?? null);
  }
}

// Native metadata storage system (array of websocket metadata)
let nativeMetadataStore = []; // Array of { key: string, metadata: { title: string, artist: string, albumArt?: string, timestamp: number } }
const lastLoggedNativeMetadataSig = new Map();
const lastLoggedStationMetadataSig = new Map();

function nativeMetadataContentSig(meta) {
  if (!meta) return "";
  return `${String(meta.title || "").trim()}\0${String(meta.artist || "").trim()}\0${meta.albumArt || ""}`;
}

function nativeMetadataUnchanged(existing, next) {
  return !!existing && nativeMetadataContentSig(existing) === nativeMetadataContentSig(next);
}

function logNativeMetadataOnce(key, message, meta) {
  const sig = nativeMetadataContentSig(meta);
  if (lastLoggedNativeMetadataSig.get(key) === sig) return false;
  lastLoggedNativeMetadataSig.set(key, sig);
  console.log(message);
  return true;
}

function logMetadataPostOutcome(kind, detail) {
  console.log(`📡 Metadata POST ${kind}: ${detail}`);
}

function describeAlbumArtForLog(value) {
  const text = String(value || "").trim();
  if (!text) return "art=none";
  let kind = "other";
  if (text.startsWith("data:image/")) kind = "data:image";
  else if (text.startsWith("blob:")) kind = "blob";
  else if (text.startsWith("https://")) kind = "https";
  else if (text.startsWith("http://")) kind = "http";
  else if (text.startsWith("/")) kind = "relative";

  let host = "";
  if (kind === "http" || kind === "https") {
    try {
      host = ` host=${new URL(text).hostname}`;
    } catch {}
  }

  return `art=${kind} len=${text.length}${host}`;
}

function logStationMetadataOnce(railId, station) {
  const sig = `${station?.title || ""}\0${station?.artist || ""}\0${station?.albumArtUrl || ""}\0${station?.active ? "1" : "0"}`;
  if (lastLoggedStationMetadataSig.get(railId) === sig) return;
  lastLoggedStationMetadataSig.set(railId, sig);

  if (station?.title && station?.artist) {
    console.log(
      `📡 Station metadata resolved rail=${railId} display="${station.displayName || ""}" track="${station.title}" / "${station.artist}" ${describeAlbumArtForLog(station.albumArtUrl)} live=${station.isLive ? "yes" : "no"}`,
    );
  } else {
    console.log(
      `📡 Station metadata missing rail=${railId} display="${station?.displayName || ""}" active=${station?.active ? "yes" : "no"} live=${station?.isLive ? "yes" : "no"}`,
    );
  }
}

function getBestNativeMetadataForUser(userId) {
  if (!userId) return null;

  const namedEntries = nativeMetadataStore.filter(
    (item) => item.key.startsWith(`${userId}:`) && item.metadata,
  );
  const unnamedEntry = nativeMetadataStore.find((item) => item.key === userId);

  let bestEntry = null;
  let bestTimestamp = 0;

  for (const entry of namedEntries) {
    if (entry.metadata.timestamp > bestTimestamp) {
      bestEntry = entry;
      bestTimestamp = entry.metadata.timestamp;
    }
  }

  if (unnamedEntry && unnamedEntry.metadata.timestamp > bestTimestamp) {
    bestEntry = unnamedEntry;
  }

  if (!bestEntry?.metadata) return null;

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (bestEntry.metadata.timestamp <= fiveMinutesAgo) return null;

  return bestEntry.metadata;
}

function getStoredNativeMetadataForUser(userId, broadcastName = null) {
  if (!userId) return null;

  const id = String(userId);
  const name = String(broadcastName || "").trim();

  if (name) {
    const exactKey = `${id}:${name}`;
    const exact = nativeMetadataStore.find((item) => item.key === exactKey);
    if (exact?.metadata) return exact.metadata;

    const nameLower = name.toLowerCase();
    const namedMatch = nativeMetadataStore
      .filter((item) => item.key.startsWith(`${id}:`) && item.metadata)
      .find((item) => item.key.slice(id.length + 1).toLowerCase() === nameLower);
    if (namedMatch?.metadata) return namedMatch.metadata;
  }

  const namedEntries = nativeMetadataStore.filter(
    (item) => item.key.startsWith(`${id}:`) && item.metadata,
  );
  const unnamedEntry = nativeMetadataStore.find((item) => item.key === id);

  let bestEntry = null;
  let bestTimestamp = 0;

  for (const entry of namedEntries) {
    if (entry.metadata.timestamp > bestTimestamp) {
      bestEntry = entry;
      bestTimestamp = entry.metadata.timestamp;
    }
  }

  if (unnamedEntry && unnamedEntry.metadata.timestamp > bestTimestamp) {
    bestEntry = unnamedEntry;
  }

  return bestEntry?.metadata ?? null;
}

function isPlaceholderPlaybackTitle(title) {
  const text = String(title || "").trim();
  if (!text || text === "N/A") return true;
  if (text === "Someone is playing music" || text === "Music playing") return true;
  return / is playing music$/i.test(text);
}

function metadataPayloadIsPolicyMuted(payload) {
  try {
    const raw = payload?.recenttracks?.track;
    const track = Array.isArray(raw) ? raw[0] : raw;
    if (!track) return false;
    const title = track.name;
    const artist =
      typeof track.artist === "string" ? track.artist : track.artist?.["#text"];
    return isContentPolicyMutedMetadata(title, artist);
  } catch {
    return false;
  }
}

function activeBroadcastWaitingMetadataPayload() {
  return {
    recenttracks: { track: [] },
    waiting: true,
    broadcaster: {
      userId: broadcastStatus.broadcasterUserId || null,
      displayName: broadcastStatus.broadcasterDisplayName || null,
    },
  };
}

function contentPolicyMutedNowPlayingPayload() {
  return {
    recenttracks: {
      track: [
        {
          name: CONTENT_POLICY_MUTED_TITLE,
          artist: { "#text": CONTENT_POLICY_MUTED_ARTIST },
          "@attr": { nowplaying: "true" },
          image: [],
        },
      ],
    },
  };
}

function isActiveRelayContentPolicyMuted() {
  if (!activeWsId) return false;
  return !!wsConnections.get(activeWsId)?.contentPolicyMuted;
}

function nativeMetadataRailKey(wsId) {
  return `rail:${String(wsId || "").trim()}`;
}

function getStoredNativeMetadataByKey(key) {
  if (!key) return null;
  const entry = nativeMetadataStore.find((item) => item.key === key);
  if (!entry?.metadata) return null;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (entry.metadata.timestamp <= fiveMinutesAgo) return null;
  return entry.metadata;
}

function storeNativeMetadataByKey(key, metadata) {
  if (!key || !metadata) return;
  const existingIndex = nativeMetadataStore.findIndex((item) => item.key === key);
  if (existingIndex >= 0) {
    nativeMetadataStore[existingIndex].metadata = metadata;
  } else {
    nativeMetadataStore.push({ key, metadata });
  }
}

function getStoredNativeMetadataForRail(wsId) {
  if (!wsId) return null;
  const byRail = getStoredNativeMetadataByKey(nativeMetadataRailKey(wsId));
  if (byRail) return byRail;

  const info = wsConnections.get(wsId);
  if (!info?.userId) return null;
  const broadcastName = String(info.broadcastName || info.displayName || "").trim() || null;
  return getStoredNativeMetadataForUser(info.userId, broadcastName);
}

function resolveWsIdForMetadataPost(userId, { railId = null, broadcastName = null } = {}) {
  const postRailId = String(railId || "").trim();
  if (postRailId) {
    const railInfo = wsConnections.get(postRailId);
    if (railInfo && String(railInfo.userId) === String(userId)) {
      return postRailId;
    }
  }
  return resolveWsIdForUser(userId, {
    preferActive: false,
    broadcastName: broadcastName?.trim() || null,
  });
}

function resolveBroadcasterRailContext() {
  if (activeWsId && wsConnections.has(activeWsId)) {
    const info = wsConnections.get(activeWsId);
    return { wsId: activeWsId, userId: String(info.userId), info };
  }

  const broadcasterId = broadcastStatus.broadcasterUserId;
  if (!broadcasterId) return null;

  for (const [wsId, info] of wsConnections.entries()) {
    if (String(info.userId) === String(broadcasterId)) {
      return { wsId, userId: String(info.userId), info };
    }
  }

  return { wsId: null, userId: String(broadcasterId), info: null };
}

function getNativeMetadataForActiveRail() {
  const ctx = resolveBroadcasterRailContext();
  if (!ctx?.userId) return null;

  const { wsId, userId, info } = ctx;

  if (info?.contentPolicyPending) {
    return null;
  }

  const resolveStoredForDisplay = (stored) => {
    if (!stored?.title || !stored?.artist) return null;
    if (stored.policyPending) return null;
    if (info?.contentPolicyMuted) {
      if (isContentPolicyMutedMetadata(stored.title, stored.artist)) {
        return stored;
      }
      return null;
    }
    if (
      isContentPolicyMutedMetadata(stored.title, stored.artist) &&
      !info?.contentPolicyMuted
    ) {
      return unwrapPolicyMutedNativeMetadata(stored) || stored;
    }
    const currentSite = info?.capabilities?.site ?? null;
    if (stored.sourceSite && currentSite && stored.sourceSite !== currentSite) {
      return null;
    }
    if (info?.metadataInvalidatedAt && stored.timestamp <= info.metadataInvalidatedAt) {
      return null;
    }
    if (info?.broadcastSessionStartedAt && stored.timestamp <= info.broadcastSessionStartedAt) {
      return null;
    }
    return stored;
  };

  if (wsId) {
    const storedByRail = resolveStoredForDisplay(getStoredNativeMetadataForRail(wsId));
    if (storedByRail && !isPlaceholderPlaybackTitle(storedByRail.title)) {
      return storedByRail;
    }
  }

  const storedByUser = resolveStoredForDisplay(getStoredNativeMetadataForUser(userId));
  if (storedByUser && !isPlaceholderPlaybackTitle(storedByUser.title)) {
    if (broadcastStatus.active) return storedByUser;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (storedByUser.timestamp > fiveMinutesAgo) return storedByUser;
  }

  if (wsId) {
    const snapshot = getRailPlaybackSnapshot(wsId);
    if (
      snapshot?.title &&
      snapshot?.artist &&
      !isPlaceholderPlaybackTitle(snapshot.title)
    ) {
      return {
        title: snapshot.title,
        artist: snapshot.artist,
        albumArt: snapshot.albumArt ?? null,
        timestamp: snapshot.updatedAt || Date.now(),
      };
    }

    if (
      info?.trackTitle &&
      info.trackArtist &&
      !isPlaceholderPlaybackTitle(info.trackTitle)
    ) {
      return {
        title: info.trackTitle,
        artist: info.trackArtist,
        albumArt: info.trackAlbumArt ?? null,
        timestamp: info.trackUpdatedAt || Date.now(),
      };
    }
  }

  const stable = globalThis.__metaState?.lastStabilized;
  if (
    stable?.title &&
    stable?.artist &&
    !isPlaceholderPlaybackTitle(stable.title)
  ) {
    return {
      title: stable.title,
      artist: stable.artist,
      albumArt: stable.albumArt ?? null,
      timestamp: Date.now(),
    };
  }

  return null;
}

let resolveRailPlayback = async (railId) => ({
  railId,
  displayName: null,
  title: null,
  artist: null,
  albumArtUrl: null,
  active: false,
  isLive: false,
});
let invalidateRailPlayback = () => {};

function initRailPlaybackResolver() {
  const resolver = createRailPlaybackResolver({
    getWsConnections: () => wsConnections,
    getActiveWsId: () => activeWsId,
    getCurrentSong: () => currentSong,
    getCurrentArtist: () => currentArtist,
    getStoredNativeMetadataForUser,
    getStoredNativeMetadataForRail: (wsId) => getStoredNativeMetadataForRail(wsId),
    getRailPlaybackSnapshot: (wsId) => getRailPlaybackSnapshot(wsId),
    getLiveStabilizedMetadata: () => globalThis.__metaState?.lastStabilized ?? null,
    lookupAlbumArt: (title, artist, hint) => {
      if (isUsableAlbumArtUrl(hint)) return publicAlbumArtUrl(hint);
      const trackTitle = String(title || "").trim();
      const trackArtist = String(artist || "").trim();
      if (!trackTitle || !trackArtist) return null;
      const cacheKey = `${trackTitle}|||${trackArtist}`;
      const cached = albumArtCache.get(cacheKey);
      if (cached?.url && Date.now() - cached.timestamp < ALBUM_ART_CACHE_TTL_MS) {
        return publicAlbumArtUrl(cached.url);
      }
      const stable = globalThis.__metaState?.lastStabilized;
      if (
        stable &&
        stable.title === trackTitle &&
        stable.artist === trackArtist &&
        isUsableAlbumArtUrl(stable.albumArt)
      ) {
        return publicAlbumArtUrl(stable.albumArt);
      }
      return publicAlbumArtUrl(fallbackAlbumArtUrl(trackTitle, trackArtist));
    },
  });
  resolveRailPlayback = resolver.resolveRailPlayback;
  invalidateRailPlayback = resolver.invalidateRail;
}

function setWsTrackMetadata(wsId, title, artist, albumArt = null) {
  if (!wsId) return;
  const info = wsConnections.get(wsId);
  if (!info) return;
  info.trackTitle = title ?? null;
  info.trackArtist = artist ?? null;
  info.trackAlbumArt = albumArt ?? null;
  info.trackUpdatedAt = Date.now();
  invalidateRailPlayback(wsId);
}

const railPlaybackByWsId = new Map();

function setRailPlaybackSnapshot(wsId, { title, artist, albumArt } = {}) {
  if (!wsId) return;
  const trackTitle = title ?? null;
  const trackArtist = artist ?? null;
  const resolvedArt = coalesceTrackAlbumArt(trackTitle, trackArtist, albumArt);
  railPlaybackByWsId.set(wsId, {
    title: trackTitle,
    artist: trackArtist,
    albumArt: resolvedArt,
    updatedAt: Date.now(),
  });
  setWsTrackMetadata(wsId, trackTitle, trackArtist, resolvedArt);
}

function setRailPlaybackSnapshotsForUser(userId, metadata, preferredWsId = null) {
  const touched = new Set();

  if (preferredWsId) {
    setRailPlaybackSnapshot(preferredWsId, metadata);
    touched.add(preferredWsId);
    return touched;
  }

  for (const [wsId, info] of wsConnections.entries()) {
    if (String(info.userId) !== String(userId)) continue;
    setRailPlaybackSnapshot(wsId, metadata);
    touched.add(wsId);
  }

  return touched;
}

function getRailPlaybackSnapshot(wsId) {
  return railPlaybackByWsId.get(wsId) ?? null;
}

function backfillRailPlaybackFromNativeStore(wsId, userId, broadcastName) {
  try {
    const meta =
      getStoredNativeMetadataForRail(wsId) ??
      getStoredNativeMetadataForUser(userId, broadcastName) ??
      getBestNativeMetadataForUser(userId);
    if (!meta?.title || !meta?.artist) return;
    storeNativeMetadataByKey(nativeMetadataRailKey(wsId), meta);
    const existing = getRailPlaybackSnapshot(wsId);
    const existingTs = existing?.updatedAt || 0;
    const metaTs = meta.timestamp || 0;
    if (!existing?.title || metaTs >= existingTs) {
      setRailPlaybackSnapshot(wsId, {
        title: meta.title,
        artist: meta.artist,
        albumArt: meta.albumArt,
      });
    }
  } catch {}
}

initRailPlaybackResolver();

function logRelayConnectSummary({
  remoteAddress,
  wsId,
  userId,
  displayName,
  broadcastName,
  hasLastfm,
  becameActive,
}) {
  const lines = [
    "📻 Extension relay connected",
    `   client: ${remoteAddress || "unknown"}`,
    `   wsId: ${wsId}`,
    `   user: ${userId}${displayName ? ` (${displayName})` : ""}`,
    `   device label: ${broadcastName || "—"}`,
    `   last.fm: ${hasLastfm ? "yes" : "no"}`,
    `   stream: ${becameActive ? "ACTIVE — on air" : "standby"}`,
  ];
  console.log(lines.join("\n"));
}
// Key format: "userId" or "userId:broadcasterName" for named broadcasters

// Helper: Create song key
function getSongKey(title, artist) {
  return `${title}|||${artist}`;
}

const playingRequestCleanupTimers = new Map();
const PLAYING_REQUEST_CLEANUP_MS = 2 * 60 * 1000;

function schedulePlayingRequestCleanup(songKey, title, artist) {
  clearPlayingRequestCleanup(songKey);
  const timer = setTimeout(() => {
    playingRequestCleanupTimers.delete(songKey);
    const req = requests[songKey];
    if (!req || req.status !== "playing") return;
    const playedSource = req.playingSource === "metadata" ? "metadata" : "timeout";
    markRequestPlayed(songKey, { source: playedSource });
  }, PLAYING_REQUEST_CLEANUP_MS);
  playingRequestCleanupTimers.set(songKey, timer);
}

function clearPlayingRequestCleanup(songKey) {
  const timer = playingRequestCleanupTimers.get(songKey);
  if (timer) {
    clearTimeout(timer);
    playingRequestCleanupTimers.delete(songKey);
  }
}

function buildSongRequestApiMeta(request, songKey) {
  const upvotes = request.votes?.filter((v) => v.vote === 1).length ?? 0;
  const downvotes = request.votes?.filter((v) => v.vote === -1).length ?? 0;
  const total = request.votes?.length ?? 0;
  return {
    songKey,
    title: request.title,
    artist: request.artist,
    url: request.url,
    status: request.status,
    votesUp: upvotes,
    votesDown: downvotes,
    approvalPct: total ? Math.round((upvotes / total) * 100) : 0,
  };
}

function canModerateSongRequestsForUser(userId, roleInfo) {
  if (!roleInfo?.permissions?.canApproveRequests) return false;
  if (roleInfo.permissions.canPromoteWhenInactive) return true;
  return String(broadcastStatus.broadcasterUserId) === String(userId);
}

function isValidNowPlayingTitleArtist(title, artist) {
  const invalidValues = ["N/A", "null", "undefined", "", "Unknown Title", "Unknown Artist", "Music playing"];
  return !!(title && artist && !invalidValues.includes(title) && !invalidValues.includes(artist));
}

function requestMatchesDetectedSong(req, songKey, detectedTitle, detectedArtist) {
  const exactKey = getSongKey(detectedTitle, detectedArtist);
  return songKey === exactKey || isLooseSongMatch(req.title, req.artist, detectedTitle, detectedArtist);
}

function metadataApproveRequest(songKey) {
  const req = requests[songKey];
  if (!req || req.status !== "requested") return false;
  req.status = "approved";
  const approverId = broadcastStatus.broadcasterUserId
    ? String(broadcastStatus.broadcasterUserId)
    : null;
  if (approverId) {
    tryAwardApprovalXp({ songKey, request: req, approverUserId: approverId });
  }
  return true;
}

/** Auto-approve (if needed) then mark playing when request matches on-air metadata. */
function tryMatchRequestToNowPlaying(songKey, detectedTitle, detectedArtist, { source = "metadata" } = {}) {
  const req = requests[songKey];
  if (!req || req.status === "denied" || req.status === "played") return false;
  if (!isValidNowPlayingTitleArtist(detectedTitle, detectedArtist)) return false;
  if (!requestMatchesDetectedSong(req, songKey, detectedTitle, detectedArtist)) return false;

  const wasRequested = req.status === "requested";
  if (wasRequested) {
    metadataApproveRequest(songKey);
  }

  if (req.status === "approved") {
    markRequestPlaying(songKey, req.title, req.artist, { source });
    try {
      debugLog("request_match_now_playing", {
        songKey,
        title: req.title,
        artist: req.artist,
        prevStatus: wasRequested ? "requested" : "approved",
        autoApproved: wasRequested,
      });
    } catch {}
    return true;
  }

  return req.status === "playing";
}

function tryMatchAnyRequestToNowPlaying(detectedTitle, detectedArtist, { source = "metadata" } = {}) {
  if (!isValidNowPlayingTitleArtist(detectedTitle, detectedArtist)) return false;
  const directKey = getSongKey(detectedTitle, detectedArtist);
  if (requests[directKey] && tryMatchRequestToNowPlaying(directKey, detectedTitle, detectedArtist, { source })) {
    return true;
  }
  for (const key of Object.keys(requests)) {
    if (key === directKey) continue;
    if (tryMatchRequestToNowPlaying(key, detectedTitle, detectedArtist, { source })) return true;
  }
  return false;
}

function markRequestPlaying(songKey, title, artist, { source = "manual" } = {}) {
  if (!requests[songKey]) return;
  const req = requests[songKey];
  if (source === "metadata" && req.status !== "approved" && req.status !== "playing") return;
  req.status = "playing";
  req.playingSource = source;
  if (source === "metadata") {
    req.djUserId = String(broadcastStatus.broadcasterUserId || "");
  }
  schedulePlayingRequestCleanup(songKey, title, artist);

  const matchesNowPlaying = requestMatchesDetectedSong(
    req,
    songKey,
    currentSong,
    currentArtist,
  );
  const trackId = markSessionTrackFromRequest({
    songKey,
    title: matchesNowPlaying ? currentSong : title,
    artist: matchesNowPlaying ? currentArtist : artist,
    trackSessionId: matchesNowPlaying ? getTrackSessionId() : null,
  });
  if (trackId) {
    publishBroadcastSessionLogChanged({ trackSessionId: trackId, reason: "request" });
  }
}

function tryMatchApprovedRequestToNowPlaying(songKey) {
  if (!requests[songKey]) return;
  tryMatchRequestToNowPlaying(songKey, currentSong, currentArtist, { source: "metadata" });
}

function markRequestPlayed(songKey, { source = "manual" } = {}) {
  if (!requests[songKey]) return;
  const req = requests[songKey];
  clearPlayingRequestCleanup(songKey);
  req.status = "played";
  req.playedSource = source;
  if (!req.djUserId && broadcastStatus.broadcasterUserId) {
    req.djUserId = String(broadcastStatus.broadcasterUserId);
  }

  const matchesNowPlaying = requestMatchesDetectedSong(
    req,
    songKey,
    currentSong,
    currentArtist,
  );
  const trackId = markSessionTrackFromRequest({
    songKey,
    title: req.title,
    artist: req.artist,
    trackSessionId: matchesNowPlaying ? getTrackSessionId() : null,
  });
  if (trackId) {
    publishBroadcastSessionLogChanged({ trackSessionId: trackId, reason: "request" });
  }

  tryAwardRequestPlayXp({
    songKey,
    request: req,
    broadcasterUserId: broadcastStatus.broadcasterUserId,
  });
}

// -----------------
// ICECAST METADATA UPDATE
// -----------------
// REMOVED: updateIcecastMetadataSong - metadata is now embedded in the stream via FFmpeg
// The static "Music playing" metadata is set once at publisher start and never changes
// This eliminates the 400 "Source does not exist" errors during startup

// Combined web server (API + HTML)
function resolveStaticDir() {
  const candidates = [
    path.join(BACKEND_ROOT, "dist"),
    path.join(BACKEND_ROOT, "../frontend/dist"),
  ];
  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (fs.existsSync(path.join(resolved, "index.html"))) return resolved;
  }
  return path.resolve(candidates[1]);
}
const STATIC_DIR = resolveStaticDir();

function sendInternalJson(res, payload, statusCode = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    Connection: "close",
  });
  res.end(body);
}

http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  const ALLOWED_ORIGINS = config.server.allowedOrigins;

  if (handleProceduralTrackArtRoute(req, res, pathname, getAppSession)) {
    return;
  }

  // Internal-only song info endpoint for trusted callers (e.g. relay bot)
  // This bypasses Discord auth but only responds to private network clients.
  if (pathname === "/internal/song-info") {
    const remote = req.socket.remoteAddress || "";

    if (!isPrivateNetworkRemote(remote)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    const native = getNativeMetadataForActiveRail();
    const resolvedTitle =
      native?.title &&
      native?.artist &&
      broadcastStatus.active &&
      !isPlaceholderPlaybackTitle(native.title)
        ? native.title
        : currentSong &&
            currentSong !== "N/A" &&
            !isPlaceholderPlaybackTitle(currentSong)
          ? currentSong
          : null;
    const resolvedArtist =
      native?.title &&
      native?.artist &&
      broadcastStatus.active &&
      !isPlaceholderPlaybackTitle(native.title)
        ? native.artist
        : currentArtist && currentArtist !== "N/A" && !streamMetadataDisabled
          ? currentArtist
          : null;

    const art = isUsableAlbumArtUrl(native?.albumArt)
      ? publicAlbumArtUrl(native.albumArt)
      : publicAlbumArtUrl(
          lookupAlbumArtForLiveTrack(resolvedTitle, resolvedArtist) ||
            fallbackAlbumArtUrl(resolvedTitle, resolvedArtist),
        );
    sendInternalJson(res, {
      title: resolvedTitle,
      artist: resolvedArtist,
      albumArtUrl: art,
      liveRailId: activeWsId,
      active: broadcastStatus.active,
      broadcasterDisplayName: broadcastStatus.broadcasterDisplayName,
      stageCount: listSitePresenceRoster().stageCount ?? 0,
      stageLimit: getLimitsSettings().maxStageUsers,
    });
    return;
  }

  if (pathname === "/internal/discord-track-heart" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (!isPrivateNetworkRemote(remote)) {
      sendInternalJson(res, { error: "Forbidden" }, 403);
      return;
    }

    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const discordUserId = String(body.discordUserId || "").trim();
      if (!discordUserId) {
        sendInternalJson(res, { error: "discordUserId required" }, 400);
        return;
      }
      const result = heartCurrentTrackFromDiscord(discordUserId);
      if (!result.ok) {
        sendInternalJson(res, { error: result.error || "Failed" }, 400);
        return;
      }
      sendInternalJson(res, result);
    } catch {
      sendInternalJson(res, { error: "Invalid JSON" }, 400);
    }
    return;
  }

  if (pathname === "/internal/voice-stations") {
    const remote = req.socket.remoteAddress || "";

    if (!isPrivateNetworkRemote(remote)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    try {
      const stations = Array.from(wsConnections.entries())
        .map(([wsId, info]) => ({
          wsId,
          displayName: String(info.displayName || info.broadcastName || "DJ").trim() || "DJ",
          isLive: wsId === activeWsId,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      sendInternalJson(res, {
        liveRailId: activeWsId || null,
        stations,
      });
    } catch (err) {
      console.error("❌ /internal/voice-stations failed:", err?.message || err);
      sendInternalJson(res, { error: "Failed to list stations", liveRailId: null, stations: [] }, 500);
    }
    return;
  }

  if (pathname === "/internal/station-metadata") {
    const remote = req.socket.remoteAddress || "";

    if (!isPrivateNetworkRemote(remote)) {
      sendInternalJson(res, { error: "Forbidden" }, 403);
      return;
    }

    try {
      const railsParam = urlObj.searchParams.get("rails") || "";
      const logSource = String(urlObj.searchParams.get("logSource") || "").trim() || null;
      const railIds = [
        ...new Set(
          railsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];

      if (logSource) {
        for (const railId of railIds) {
          const info = wsConnections.get(railId);
          const snapshot = getRailPlaybackSnapshot(railId);
          const native = getStoredNativeMetadataForRail(railId);
          console.log(
            `📡 /internal/station-metadata [${logSource}] rail=${railId} ws=${info ? "connected" : "missing"} user=${info?.userId || "—"} display="${info?.displayName || ""}" snapshot=${JSON.stringify(snapshot)} native=${JSON.stringify(native ? { title: native.title, artist: native.artist, albumArt: describeAlbumArtForLog(native.albumArt) } : null)}`,
          );
        }
      }

      const stations = await Promise.all(railIds.map((railId) => resolveRailPlayback(railId)));
      stations.forEach((station, index) => {
        logStationMetadataOnce(railIds[index], station);
      });

      const responseBody = { stations };
      if (logSource) {
        console.log(
          `📡 /internal/station-metadata [${logSource}] response rails=[${railIds.join(",")}]: ${JSON.stringify(responseBody)}`,
        );
      }

      sendInternalJson(res, responseBody);
    } catch (err) {
      console.error("❌ /internal/station-metadata failed:", err?.message || err);
      if (!res.headersSent) {
        sendInternalJson(res, { error: "Failed to resolve station metadata", stations: [] }, 500);
      }
    }
    return;
  }

  if (pathname === "/internal/voice-presence") {
    const remote = req.socket.remoteAddress || "";

    if (!isPrivateNetworkRemote(remote)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (body.removed) {
      removeDiscordBotPresence(body.connectionId || body.id);
    } else {
      const guildId = String(body.guildId || "").trim();
      if (!guildId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "guildId required" }));
        return;
      }
      touchDiscordBotPresence(body.connectionId || `voice:${guildId}`, {
        guildId,
        guildName: body.guildName,
        channelId: body.channelId,
        channelName: body.channelName,
        botName: body.botName,
        connectedAt: body.connectedAt,
        stationMode: body.stationMode,
        stationRailId: body.stationRailId,
        stationLabel: body.stationLabel,
      });
    }

    publishCurrentPresenceRoster();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (await tryHandleV2Request(req, res, pathname, req.method, config)) return;

  // CORS headers (restricted) - only for API endpoints
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin) && (req.url.startsWith('/api/') || req.url.startsWith('/auth/'))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (origin && origin.startsWith('chrome-extension://') &&
             (req.url.startsWith('/api/extension') ||
              req.url === '/api/ws-token' ||
              req.url === '/api/capabilities' ||
              req.url === '/api/metadata' ||
              req.url.startsWith('/api/metadata?'))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS" && req.url.startsWith('/api/')) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (
    (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) &&
    !isMutationOriginAllowed(req, pathname)
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return;
  }

  // API endpoints (prefixed with /api/)
  if (req.url.startsWith('/api/')) {
    const apiUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const apiPath = apiUrl.pathname;
    const streamToken = apiUrl.searchParams.get('token');
    const isTokenStream = apiPath === '/api/stream' && !!streamToken;
    const isListenInfo = /^\/api\/listen\/[^/]+$/.test(apiPath);
    const isListenStream = /^\/api\/listen\/[^/]+\/stream$/.test(apiPath);
    const isSessionStream = apiPath === "/api/stream";
    const isPublicGuestRead =
      req.method === "GET" &&
      (isListenInfo ||
        apiPath === "/api/branding" ||
        apiPath === "/api/branding/visualizer");
    const allowsGuestPostAtHandler = allowsGuestHandlerAuthPost(req, apiPath);
    const allowsShareTokenRead = allowsShareTokenApiRead(req, getAppSession, apiPath);
    const isInternalLoopbackRead =
      req.method === "GET" &&
      isPrivateNetworkRemote(req.socket?.remoteAddress || "") &&
      (apiPath === "/api/metadata" ||
        apiPath.startsWith("/api/metadata") ||
        apiPath === "/api/lastfm" ||
        apiPath.startsWith("/api/lastfm") ||
        apiPath === "/api/broadcast-status" ||
        apiPath === "/api/status-json.xsl" ||
        apiPath === "/api/art/track" ||
        apiPath === "/art/track");

    if (!isTokenStream && !isListenStream && !isSessionStream) {
      res.setHeader("Content-Type", "application/json");
    }
    const deviceAuthHeader = (req.headers.authorization || req.headers.Authorization || '').startsWith('Bearer ');
    const allowsDeviceBearer =
      deviceAuthHeader &&
      (apiPath === '/api/metadata' ||
        apiPath === '/api/capabilities' ||
        apiPath === '/api/ws-token');
    if (
      !isTokenStream &&
      !isListenStream &&
      !isListenInfo &&
      !allowsDeviceBearer &&
      !isPublicGuestRead &&
      !allowsGuestPostAtHandler &&
      !allowsShareTokenRead &&
      !isInternalLoopbackRead
    ) {
      const session = getDiscordSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    if (isSessionStream || isListenStream) {
      const { serveAuthenticatedStream } = await import("./src/http/stream.js");
      serveAuthenticatedStream(req, res, apiPath, getDiscordSession);
      return;
    }

    if (apiPath === "/api/broadcast-status") {
      const { getActiveListenerCount } = await import('./src/http/stream.js');
      res.writeHead(200);
      res.end(JSON.stringify({ ...broadcastStatus, listeners: getActiveListenerCount() }, null, 2));
      return;
    }

    // Host-only (by role): mint a short-lived WebSocket token for relay auth
    if (req.url === '/api/ws-token' && (req.method === 'POST' || req.method === 'GET')) {
      const { legacyWsTokenRequiresDeviceAuth, extensionPairingRequiredMessage } =
        await import('./src/security/broadcastClient.js');
      let userId = null;
      let device = null;
      device = verifyBroadcastDeviceFromRequest(req);
      if (legacyWsTokenRequiresDeviceAuth(req)) {
        if (!device) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: extensionPairingRequiredMessage() }));
          return;
        }
        userId = device.userId;
      } else if (device) {
        userId = device.userId;
      } else {
        const session = getDiscordSession(req);
        userId = session?.user?.id ?? null;
      }
      const canBroadcast = userId && await canUserBroadcast(userId);
      if (!canBroadcast) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      const ttlMs = 90 * 1000; // 90 seconds
      const payload = {
        userId: String(userId),
        aud: 'ws-relay',
        jti: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + ttlMs,
      };
      if (device?.label && String(device.label).trim()) {
        payload.deviceLabel = String(device.label).trim().slice(0, 64);
      }
      const token = signWsToken(payload);
      res.writeHead(200);
      res.end(JSON.stringify({ token, expiresInMs: ttlMs }));
      return;
    }

    // --- /api/users?ids=1,2,3 : resolve display names (guild nicknames) and avatar
    if (req.url.startsWith('/api/users') || apiPath === '/api/users') {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const idsParam = url.searchParams.get('ids') || '';
        const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
        const out = {};
        if (isSetupComplete()) {
          const { getUserById } = await import('./src/db/index.js');
          const { publicUserPresentation } = await import('./src/db/userProfile.js');
          for (const id of ids) {
            const user = getUserById(Number(id));
            if (!user) continue;
            const roleInfo = await getUserRoleInfo(id);
            const presentation = publicUserPresentation(user);
            out[id] = {
              displayName: presentation.displayName,
              username: presentation.username,
              avatar: presentation.avatar,
              roleColor: roleInfo.roleColor,
            };
          }
        } else {
          const guild = client.guilds.cache.get(GUILD_ID);
          if (guild && ids.length) {
            for (const id of ids) {
              try {
                const member = await guild.members.fetch(id);
                const user = member.user;
                const roleInfo = await getUserRoleInfo(id);
                
                out[id] = {
                  displayName: member.displayName || user.globalName || user.username,
                  username: user.username || null,
                  avatar: user.avatar || null,
                  roleColor: roleInfo.roleColor,
                };
              } catch {
                // Not found; skip
              }
            }
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to resolve users' }));
      }
      return;
    }

    // Admin-only: toggle/inspect join debug mode
    if (req.url === '/api/join-debug') {
      const session = getDiscordSession(req);
      const isAdmin = session && session.user && await isUserAdmin(session.user.id);
      if (!isAdmin) { res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return; }

      if (req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ enabled: forceJoinDebug }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            forceJoinDebug = !!data.enabled;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, enabled: forceJoinDebug }));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

  // (root proxies removed; use /api/status-json.xsl and /api/stream only)

  // (OAuth routes are handled outside the /api block below)

  // --- Server-side metadata stabilization and artwork enrichment state ---
  const STABILIZE_MS = 4000; // mirror frontend delay
  // Persist across requests within process
  if (typeof globalThis.__metaState === 'undefined') {
    globalThis.__metaState = {
      lastStabilized: null, // { title, artist, albumArt, url }
      lastPayload: null, // full JSON to return
      pending: null, // pending meta awaiting stabilization
      pendingTimer: null,
      discordBotTimer: null, // timer for early Discord bot updates
    };
  }
  const metaState = globalThis.__metaState;

  function isLastfmPlaceholder(url) {
    return !!(url && url.includes('2a96cbd8b46e442fc41c2b86b821562f'));
  }

  async function headOk(url) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000); // Reduced timeout from 5000ms to 2000ms
      const r = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(t);
      return r.ok;
    } catch { return false; }
  }

  async function searchMusicBrainzCover(title, artist) {
    try {
      if (!title || !artist || title === 'Unknown Title' || artist === 'Unknown Artist') return null;
      const q = `recording:"${encodeURIComponent(title)}" AND artist:"${encodeURIComponent(artist)}"`;
      const mbUrl = `https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=3`; // Reduced limit from 5 to 3
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4000); // Reduced timeout from 6000ms to 4000ms
      const res = await fetch(mbUrl, { headers: { 'User-Agent': 'CollabFM/1.0 (metadata resolver)' }, signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const data = await res.json();
      const recs = Array.isArray(data.recordings) ? data.recordings : [];
      const releases = [];
      for (const rec of recs) {
        if (!Array.isArray(rec.releases)) continue;
        for (const rel of rec.releases) {
          if (!rel?.id) continue;
          if (!releases.find(r => r.id === rel.id)) releases.push({ id: rel.id, title: rel.title || '' });
        }
      }
      // Limit to first 2 releases to reduce API calls
      for (const rel of releases.slice(0, 2)) {
        try {
          const caaUrl = `https://coverartarchive.org/release/${rel.id}/`;
          const r2 = await fetch(caaUrl, { signal: controller.signal }); // Add timeout to CAA request
          if (!r2.ok) continue;
          const cd = await r2.json();
          const image = (cd.images || []).find(img => img.front) || (cd.images || [])[0];
          if (!image) continue;
          const best = image.thumbnails?.['1200'] || image.thumbnails?.large || image.thumbnails?.['500'] || image.image;
          if (best && await headOk(best)) return best;
        } catch {}
      }
      return null;
    } catch { return null; }
  }

  async function resolveAlbumArt(title, artist, lastfmImages) {
    // Skip album art resolution for invalid titles/artists
    if (!title || !artist || title === 'Unknown Title' || artist === 'Unknown Artist') {
      return null;
    }

    // Check cache first
    const cacheKey = `${title}|||${artist}`;
    const cached = albumArtCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < ALBUM_ART_CACHE_TTL_MS) {
      return cached.url;
    }

    let result = null;

    // Prefer Last.fm non-placeholder if valid - limit to first few images to speed up
    if (Array.isArray(lastfmImages) && lastfmImages.length) {
      const imagesToCheck = lastfmImages.slice(-3); // Only check last 3 images (highest quality)
      for (let i = imagesToCheck.length - 1; i >= 0; i--) {
        const url = imagesToCheck[i]?.['#text'];
        if (url && !isLastfmPlaceholder(url)) {
          if (await headOk(url)) {
            result = url;
            break; // Found valid image, stop checking
          }
        }
      }
    }

    // Fallback to MusicBrainz + Cover Art Archive only if no Last.fm image found
    if (!result) {
      result = await searchMusicBrainzCover(title, artist);
    }

    if (result) {
      albumArtCache.set(cacheKey, { url: result, timestamp: Date.now() });
    }

    // Clean up old cache entries periodically
    if (albumArtCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of albumArtCache.entries()) {
        if (now - value.timestamp > ALBUM_ART_CACHE_TTL_MS) {
          albumArtCache.delete(key);
        }
      }
    }

    return result;
  }

  // Unified metadata endpoint (formerly /api/lastfm). Keep /api/lastfm as alias.
  if (
    req.url === "/api/metadata" || req.url.startsWith("/api/metadata?") ||
    req.url === "/api/lastfm" || req.url.startsWith("/api/lastfm?")
  ) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userParam = url.searchParams.get('user');
      const keyParam = url.searchParams.get('api_key');
      const limit = url.searchParams.get('limit') || '1';

      // Handle POST requests for native metadata submission
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const postData = JSON.parse(body);
            let authUserId = null;
            let isExtensionMetadataPost = false;
            let guestShareLinkId = null;
            const device = verifyBroadcastDeviceFromRequest(req);
            if (device) {
              authUserId = device.userId;
              isExtensionMetadataPost = true;
            } else {
              const { extensionClientBlocksSessionFallback, extensionPairingRequiredMessage } =
                await import('./src/security/broadcastClient.js');
              const { resolveGuestMetadataAuth, resolveExtensionGuestMetadataAuth } =
                await import('./src/http/guestBroadcast.js');
              const extGuest = resolveExtensionGuestMetadataAuth(postData);
              if (extGuest) {
                authUserId = extGuest.authUserId;
                guestShareLinkId = extGuest.link?.id ?? null;
                isExtensionMetadataPost = true;
              } else if (extensionClientBlocksSessionFallback(req)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: extensionPairingRequiredMessage() }));
                return;
              } else {
                const appSession = getAppSession(req);
                if (appSession?.user?.id) {
                  authUserId = appSession.user.id;
                } else {
                  const webGuest = resolveGuestMetadataAuth(req, postData);
                  if (webGuest) {
                    authUserId = webGuest.authUserId;
                    guestShareLinkId = webGuest.link?.id ?? null;
                  } else {
                    const session = getDiscordSession(req);
                    if (!session || !session.user) {
                      res.writeHead(401, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: 'Unauthorized' }));
                      return;
                    }
                    authUserId = session.user.id;
                  }
                }
              }
            }

            if (postData.guestName && String(authUserId).startsWith("guest:") && guestShareLinkId) {
              publishGuestProfile(guestShareLinkId, String(authUserId).slice(6), {
                displayName: postData.guestName,
                avatarVariant: postData.avatarVariant,
                coverIcon: postData.coverIcon,
              });
            }

            const { title, artist, albumArt, broadcasterName } = postData;

            // Validate required fields
            if (!title || !artist || typeof title !== 'string' || typeof artist !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Title and artist are required' }));
              return;
            }

            const {
              resolveContentPolicyForBroadcast,
            } = await import('./src/http/contentPolicy.js');
            const wsIdForPolicy = resolveWsIdForMetadataPost(authUserId, {
              railId: postData.railId || postData.wsId || null,
              broadcastName: broadcasterName?.trim() || null,
            });
            const wsForPolicy = wsIdForPolicy ? wsConnections.get(wsIdForPolicy) : null;
            const policySource =
              wsForPolicy?.capabilities?.site ||
              postData.source ||
              postData.site ||
              null;
            const policyInput = {
              source: policySource,
              artist: artist.trim(),
              title: title.trim(),
            };
            const {
              decision: policyDecision,
              deferred: policyDeferred,
              muted: policyMuted,
            } = resolveContentPolicyForBroadcast(
              policyInput,
              {
                userId: authUserId,
                broadcasterName: broadcasterName?.trim() || null,
              },
            );
            setContentPolicyMutedForUser(authUserId, policyMuted);
            setContentPolicyPendingForUser(authUserId, policyDeferred && !policyMuted);

            let displayTitle = title.trim();
            let displayArtist = artist.trim();
            let displayAlbumArt = albumArt;
            if (policyMuted) {
              displayTitle = CONTENT_POLICY_MUTED_TITLE;
              displayArtist = CONTENT_POLICY_MUTED_ARTIST;
              displayAlbumArt = null;
            }

            let userWsId = resolveWsIdForMetadataPost(authUserId, {
              railId: postData.railId || postData.wsId || null,
              broadcastName: broadcasterName?.trim() || null,
            });

            if (!userWsId && !isExtensionMetadataPost) {
              logMetadataPostOutcome(
                "rejected",
                `no relay for user ${authUserId}`,
              );
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No active websocket connection found' }));
              return;
            }

            // Check if this websocket has Last.fm credentials (if so, ignore POST data)
            const activeWs = wsConnections.get(activeWsId);
            const hasLastfmCreds = activeWs && activeWs.ws && activeWs.ws._lastfm && 
                                 activeWs.ws._lastfm.user && activeWs.ws._lastfm.apiKey;

            if (hasLastfmCreds && !isExtensionMetadataPost) {
              // User has Last.fm credentials, ignore POST metadata (extension posts always win)
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Last.fm credentials present, ignoring POST metadata' }));
              return;
            }

            // Create storage key: userId or userId:broadcasterName
            const userId = authUserId;
            const storageKey = broadcasterName && broadcasterName.trim() 
              ? `${userId}:${broadcasterName.trim()}` 
              : userId;

            // Store native metadata with smart routing
            const existingIndex = nativeMetadataStore.findIndex(item => item.key === storageKey);
            const existingMeta = existingIndex >= 0 ? nativeMetadataStore[existingIndex].metadata : null;
            const metadata = {
              title: displayTitle,
              artist: displayArtist,
              albumArt: coalesceTrackAlbumArt(displayTitle, displayArtist, displayAlbumArt),
              timestamp: Date.now(),
              sourceSite: policySource || null,
              policyPending: policyDeferred && !policyMuted,
              ...(policyMuted
                ? {
                    rawTitle: title.trim(),
                    rawArtist: artist.trim(),
                    rawAlbumArt: albumArt ?? null,
                  }
                : {}),
            };
            const unchanged = nativeMetadataUnchanged(existingMeta, metadata);
            const priorMuted =
              isContentPolicyMutedMetadata(existingMeta?.title, existingMeta?.artist) ||
              isContentPolicyMutedMetadata(
                globalThis.__metaState?.lastStabilized?.title,
                globalThis.__metaState?.lastStabilized?.artist,
              ) ||
              isActiveRelayContentPolicyMuted();

            storeNativeMetadataByKey(storageKey, metadata);

            const userIdKey = String(userId);
            const unnamedIndex = nativeMetadataStore.findIndex((item) => item.key === userIdKey);
            if (unnamedIndex >= 0) {
              nativeMetadataStore[unnamedIndex].metadata = { ...metadata };
            } else {
              nativeMetadataStore.push({ key: userIdKey, metadata: { ...metadata } });
            }

            // Smart routing: If this is a named broadcaster, also update any unnamed entries for this user
            if (broadcasterName && broadcasterName.trim()) {
              const unnamedKey = userIdKey;
              const namedUnnamedIndex = nativeMetadataStore.findIndex((item) => item.key === unnamedKey);
              if (namedUnnamedIndex >= 0) {
                const unnamedExisting = nativeMetadataStore[namedUnnamedIndex].metadata;
                if (!nativeMetadataUnchanged(unnamedExisting, metadata)) {
                  logNativeMetadataOnce(
                    `route:${userId}`,
                    `📡 Smart routing: Updated unnamed entry for user ${userId} with metadata from broadcaster "${broadcasterName}"`,
                    metadata,
                  );
                }
              }
            }

            if (!unchanged) {
              logMetadataPostOutcome(
                "stored",
                `user=${userId} key=${storageKey} track="${displayTitle}" / "${displayArtist}" ${describeAlbumArtForLog(metadata.albumArt)}${userWsId ? ` ws=${userWsId}` : " (relay pending)"}${policyDeferred ? " (policy-pending)" : ""}${policyMuted ? " (policy-muted)" : ""}`,
              );
              logNativeMetadataOnce(
                storageKey,
                `📡 Native metadata stored for key=${storageKey}: ${displayTitle} by ${displayArtist} (${describeAlbumArtForLog(metadata.albumArt)})${policyDeferred ? " [policy-pending]" : ""}${policyMuted ? " [policy-muted]" : ""}`,
                metadata,
              );
              if (metadata.albumArt && !policyDeferred) {
                applySessionLogAlbumArt(metadata.title, metadata.artist, metadata.albumArt);
              }
            } else if (policyMuted) {
              logMetadataPostOutcome(
                "stored",
                `user=${userId} key=${storageKey} track="${displayTitle}" / "${displayArtist}" (policy-muted, unchanged)`,
              );
            }

            if (!userWsId) {
              userWsId = resolveWsIdForMetadataPost(authUserId, {
                railId: postData.railId || postData.wsId || null,
                broadcastName: broadcasterName?.trim() || null,
              });
            }
            if (userWsId) {
              storeNativeMetadataByKey(nativeMetadataRailKey(userWsId), metadata);
              const wsForStore = wsConnections.get(userWsId);
              if (
                wsForStore?.metadataInvalidatedAt &&
                metadata.timestamp > wsForStore.metadataInvalidatedAt &&
                metadata.sourceSite &&
                metadata.sourceSite === wsForStore.capabilities?.site
              ) {
                delete wsForStore.metadataInvalidatedAt;
              }
            }

            const touchedRailIds = policyDeferred
              ? new Set()
              : setRailPlaybackSnapshotsForUser(
                  userId,
                  {
                    title: metadata.title,
                    artist: metadata.artist,
                    albumArt: metadata.albumArt,
                  },
                  userWsId,
                );
            if (!policyDeferred) {
              for (const railId of touchedRailIds) {
                invalidateRailPlayback(railId);
              }
            }

            const activeInfo = activeWsId ? wsConnections.get(activeWsId) : null;
            const postsToActiveRail =
              (activeWsId && touchedRailIds.has(activeWsId)) ||
              (activeInfo && String(activeInfo.userId) === String(userId)) ||
              (broadcastStatus.active &&
                String(broadcastStatus.broadcasterUserId) === String(userId));

            if (policyMuted && broadcastStatus.active) {
              forceImmediateNowPlayingMetadata(displayTitle, displayArtist, metadata.albumArt);
            } else if (postsToActiveRail && !policyDeferred) {
              if (isUsableAlbumArtUrl(metadata.albumArt)) {
                albumArtCache.set(`${metadata.title.trim()}|||${metadata.artist.trim()}`, {
                  url: metadata.albumArt,
                  timestamp: Date.now(),
                });
              }
              if (priorMuted) {
                forceImmediateNowPlayingMetadata(metadata.title, metadata.artist, metadata.albumArt);
              } else {
                updateDiscordBotFromMetadata(metadata.title, metadata.artist, false, null);
                syncInternalSongMirror();
              }
            }

            // Clean up old entries (older than 5 minutes)
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            nativeMetadataStore = nativeMetadataStore.filter(item => 
              item.metadata.timestamp > fiveMinutesAgo
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: policyDeferred ? 'Metadata stored (policy pending)' : 'Metadata stored',
              muted: policyMuted,
              deferred: policyDeferred,
              policy: policyMuted || policyDeferred ? policyDecision : undefined,
            }));
          } catch (error) {
            console.error('Error parsing POST metadata:', error.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      const DEFAULT_LF_USER = getIntegrationsConfig(config).lastfmDefaultUser;
      const DEFAULT_LF_KEY = getLastfmApiKey(config);

      // Choose candidate creds: query -> current WS override (if not known-bad) -> defaults
      let user = userParam || null;
      let apiKey = keyParam || null;
      let usedOverride = false;
      let hasValidWsOverride = false;

      // Check if there's an active WebSocket with Last.fm credentials
      if (currentLastfmOverride && currentLastfmOverride.user && currentLastfmOverride.apiKey && currentLastfmOverride.wsId === activeWsId) {
        const h = hashLastfmCred(currentLastfmOverride.user, currentLastfmOverride.apiKey);
        const cached = lastfmCredCache.get(h);
        const isCachedBad = cached && cached.valid === false && (Date.now() - cached.ts) < LASTFM_CACHE_TTL_MS;
        
        // Mark as valid override if it exists and isn't cached as bad
        hasValidWsOverride = true;
        
        if ((!user || !apiKey) && !isCachedBad) {
          user = user || currentLastfmOverride.user;
          apiKey = apiKey || currentLastfmOverride.apiKey;
          usedOverride = true;
        }
      }

      // Check if there's a valid active WebSocket with Last.fm credentials (even if cached as bad)
      // This prevents metadata from being disabled when switching between connections
      const activeWs = wsConnections.get(activeWsId);
      const activeWsHasLastfm = activeWs && activeWs.ws && activeWs.ws._lastfm && activeWs.ws._lastfm.user && activeWs.ws._lastfm.apiKey;

      // If currentLastfmOverride is for a different websocket but activeWS has Last.fm credentials, use those
      if (!hasValidWsOverride && activeWsHasLastfm && (!user || !apiKey)) {
        user = user || activeWs.ws._lastfm.user;
        apiKey = apiKey || activeWs.ws._lastfm.apiKey;
        usedOverride = true;
        hasValidWsOverride = true;
        console.log(`📡 Using active WS Last.fm credentials: user=${user} wsId=${activeWsId}`);
      }

      // Native metadata from extension (active broadcaster rail)
      let nativeMetadata = getNativeMetadataForActiveRail();
      if (nativeMetadata && shouldHoldNowPlayingForPolicy()) {
        nativeMetadata = null;
      }
      if (nativeMetadata) {
        logNativeMetadataOnce(
          `use:active:${activeWsId}`,
          `📡 Using native metadata for active rail ${activeWsId}: ${nativeMetadata.title} by ${nativeMetadata.artist}`,
          nativeMetadata,
        );
      }

      // If no Last.fm data AND no native metadata, treat as disabled (idle only)
      if (!nativeMetadata && !user && !apiKey && !hasValidWsOverride && !activeWsHasLastfm) {
        if (broadcastStatus.active) {
          if (isActiveRelayContentPolicyMuted()) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(contentPolicyMutedNowPlayingPayload()));
            return;
          }
          if (shouldHoldNowPlayingForPolicy()) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(activeBroadcastWaitingMetadataPayload()));
            return;
          }
          if (metaState.lastPayload) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(metaState.lastPayload));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(activeBroadcastWaitingMetadataPayload()));
          return;
        }

        updateDiscordBotFromMetadata(null, null, true, broadcastStatus.broadcasterDisplayName);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          disabled: true,
          broadcaster: {
            userId: broadcastStatus.broadcasterUserId || null,
            displayName: broadcastStatus.broadcasterDisplayName || null
          }
        }));
        return;
      }

      user = user || DEFAULT_LF_USER;
      apiKey = apiKey || DEFAULT_LF_KEY;

      async function fetchLastfm(u, k) {
        const LASTFM_URL = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${u}&api_key=${k}&format=json&limit=${limit}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000); // Reduced timeout from 5000ms to 4000ms
        const response = await fetch(LASTFM_URL, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || data.error || !data.recenttracks) return null;
        return data;
      }

      // Prefer fresh extension metadata over Last.fm when broadcasting from the extension
      let data = null;
      let usingNativeMetadata = false;

      if (nativeMetadata) {
        usingNativeMetadata = true;
        data = {
          recenttracks: {
            track: [{
              name: nativeMetadata.title,
              artist: { '#text': nativeMetadata.artist },
              '@attr': { nowplaying: 'true' },
              image: nativeMetadata.albumArt ? [
                { size: 'small', '#text': nativeMetadata.albumArt },
                { size: 'medium', '#text': nativeMetadata.albumArt },
                { size: 'large', '#text': nativeMetadata.albumArt },
                { size: 'extralarge', '#text': nativeMetadata.albumArt }
              ] : []
            }]
          }
        };
      } else if (user && apiKey && (hasValidWsOverride || activeWsHasLastfm)) {
        // Try chosen creds; if chosen were override and fail, fall back to defaults
        data = await fetchLastfm(user, apiKey);
        if (!data && usedOverride) {
          const h = hashLastfmCred(user, apiKey);
          lastfmCredCache.set(h, { valid: false, ts: Date.now() });
          try { saveLastfmCache(); } catch {}
          user = DEFAULT_LF_USER;
          apiKey = DEFAULT_LF_KEY;
          data = await fetchLastfm(user, apiKey);
        }
      }

      if (!data) {
        // Serve last good payload if available; avoid regressing UI
        if (metaState.lastPayload) {
          console.log('📡 /api/lastfm fallback: returning last stabilized payload (fetch failed)');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(metaState.lastPayload));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Failed to fetch Last.fm data" }));
        return;
      }

      const maskedKey = apiKey && apiKey.length > 8 ? `${apiKey.slice(0,4)}...${apiKey.slice(-4)}` : '****';
      if (!usingNativeMetadata) {
        console.log(`📡 /api/metadata using user=${user} key=${maskedKey}`);
      }

      // Extract current track
      const track = data?.recenttracks?.track?.[0] || null;
      let title = 'Unknown Title';
      let artist = 'Unknown Artist';
      let trackUrl = undefined;
      let lastfmImages = [];
      if (track && track['@attr']?.nowplaying === 'true') {
        title = track.name || title;
        artist = (track.artist && (track.artist['#text'] || track.artist)) || artist;
        if (track.url) trackUrl = track.url;
        if (Array.isArray(track.image)) lastfmImages = track.image;
      }
      // If no current track, serve last stabilized payload to avoid clearing UI unnecessarily
      if (!track || track['@attr']?.nowplaying !== 'true') {
        if (metaState.lastPayload) {
          console.log('📡 /api/lastfm: no nowplaying track; returning last stabilized payload');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(metaState.lastPayload));
          return;
        }
      }

      let immediateArt = null;

      if (usingNativeMetadata && nativeMetadata?.albumArt) {
        immediateArt = nativeMetadata.albumArt;
      }

      // Check cache after native metadata so extension artwork can replace stale fallback art.
      if (title && artist && title !== 'Unknown Title' && artist !== 'Unknown Artist') {
        const cacheKey = `${title}|||${artist}`;
        const cached = albumArtCache.get(cacheKey);
        if (!immediateArt && cached && (Date.now() - cached.timestamp) < ALBUM_ART_CACHE_TTL_MS) {
          immediateArt = cached.url;
        }
      }

      // Also check if we have a valid Last.fm image that's not a placeholder (immediate check)
      if (!immediateArt && Array.isArray(lastfmImages) && lastfmImages.length) {
        // Find the largest non-placeholder image without making external calls
        for (let i = lastfmImages.length - 1; i >= 0; i--) {
          const url = lastfmImages[i]?.['#text'];
          if (url && !isLastfmPlaceholder(url)) {
            immediateArt = url; // Use it immediately without validation call
            break;
          }
        }
      }

      if (!immediateArt) {
        immediateArt = fallbackAlbumArtUrl(title, artist);
      }

      logNativeMetadataOnce(
        `serve-art:${title}:${artist}`,
        `📡 /api/metadata artwork selected for ${title} by ${artist}: ${describeAlbumArtForLog(immediateArt)} source=${usingNativeMetadata && nativeMetadata?.albumArt ? "extension" : immediateArt?.includes("/art/track") ? "procedural" : "cache-or-lastfm"}`,
        { title, artist, albumArt: immediateArt },
      );

      // Build initial payload with immediate album art (no external calls)
      let out = JSON.parse(JSON.stringify(data));
      if (track && immediateArt) {
        const imgArr = [
          { size: 'small', '#text': immediateArt },
          { size: 'medium', '#text': immediateArt },
          { size: 'large', '#text': immediateArt },
          { size: 'extralarge', '#text': immediateArt },
        ];
        if (out.recenttracks?.track?.[0]) out.recenttracks.track[0].image = imgArr;
      }

      // Start background album art resolution (non-blocking)
      // This will improve the album art later if needed, but won't delay the response
      if (title && artist && title !== 'Unknown Title' && artist !== 'Unknown Artist') {
        const cacheKey = `${title}|||${artist}`;
        const cached = albumArtCache.get(cacheKey);
        
        // Only resolve if not cached or Last.fm provided placeholder images
        const hasPlaceholders = Array.isArray(lastfmImages) && lastfmImages.some(img => 
          img?.['#text'] && isLastfmPlaceholder(img['#text'])
        );
        
        // For native metadata, only resolve if no album art was provided and no usable cache exists
        const shouldResolveArt = !usingNativeMetadata ? 
          (!cached || hasPlaceholders) : 
          (!cached?.url && (!nativeMetadata || !nativeMetadata.albumArt));
        
        if (shouldResolveArt) {
          resolveAlbumArt(title, artist, lastfmImages).then(finalArt => {
            if (finalArt && finalArt !== immediateArt) {
              // Update the stable state with better album art if found
              const currentStable = metaState.lastStabilized;
              if (currentStable && 
                  currentStable.title === title && 
                  currentStable.artist === artist) {
                metaState.lastStabilized = { ...currentStable, albumArt: finalArt };
                // Update the payload as well
                if (metaState.lastPayload && metaState.lastPayload.recenttracks?.track?.[0]) {
                  const imgArr = [
                    { size: 'small', '#text': finalArt },
                    { size: 'medium', '#text': finalArt },
                    { size: 'large', '#text': finalArt },
                    { size: 'extralarge', '#text': finalArt },
                  ];
                  metaState.lastPayload.recenttracks.track[0].image = imgArr;
                }
                applySessionLogAlbumArt(title, artist, finalArt);
                if (broadcastStatus.broadcasterUserId) {
                  setRailPlaybackSnapshotsForUser(
                    broadcastStatus.broadcasterUserId,
                    { title, artist, albumArt: finalArt },
                    activeWsId,
                  );
                }
                syncInternalSongMirror();
                console.log(`📡 Background album art resolved: ${title} by ${artist}`);
              }
            }
          }).catch(error => {
            console.error('Background album art resolution failed:', error.message);
          });
        }
      }

      // Stabilization logic: delay ANY change (title, artist, or albumArt) by STABILIZE_MS
      const current = metaState.lastStabilized; // may be null
      const newMeta = { title, artist, albumArt: immediateArt || null, url: trackUrl || null };
      const anyChanged = !!(current && (
        current.title !== newMeta.title ||
        current.artist !== newMeta.artist ||
        String(current.albumArt || '') !== String(newMeta.albumArt || '')
      ));
      const nativeArtUpgrade = !!(
        current &&
        usingNativeMetadata &&
        nativeMetadata?.albumArt &&
        current.title === newMeta.title &&
        current.artist === newMeta.artist &&
        String(current.albumArt || '') !== String(newMeta.albumArt || '')
      );
      const firstEmission = !current && (newMeta.title !== 'Unknown Title' || newMeta.artist !== 'Unknown Artist' || !!newMeta.albumArt);

      // Helper to update stabilized immediately
      const commitNow = () => {
        metaState.lastStabilized = { title, artist, albumArt: immediateArt || null, url: trackUrl || null };
        metaState.lastPayload = out;
        if (immediateArt) {
          applySessionLogAlbumArt(title, artist, immediateArt);
        }
        // Clear any pending Discord bot timer since we're updating immediately
        if (metaState.discordBotTimer) {
          try { clearTimeout(metaState.discordBotTimer); } catch {}
          metaState.discordBotTimer = null;
        }
        // Trigger Discord bot update when metadata is committed - only if we have valid metadata
        if (title && artist && title !== 'Unknown Title' && artist !== 'Unknown Artist') {
          updateDiscordBotFromMetadata(title, artist, false, null);
        }
      };

      if (firstEmission) {
        commitNow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }

      if (nativeArtUpgrade) {
        commitNow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }

      if (usingNativeMetadata && title === CONTENT_POLICY_MUTED_TITLE) {
        commitNow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }

      const leavingPolicyMute = !!(
        current &&
        current.title === CONTENT_POLICY_MUTED_TITLE &&
        newMeta.title !== CONTENT_POLICY_MUTED_TITLE
      );

      if (leavingPolicyMute) {
        commitNow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }

      if (anyChanged) {
        // If the same pending meta is already queued, do not reset the timer
        const samePending = !!(metaState.pending &&
          metaState.pending.title === newMeta.title &&
          metaState.pending.artist === newMeta.artist &&
          String(metaState.pending.albumArt || '') === String(newMeta.albumArt || ''));

        if (!samePending) {
          metaState.pending = { ...newMeta, out };
          
          // Clear existing timers
          if (metaState.pendingTimer) { try { clearTimeout(metaState.pendingTimer); } catch {} }
          if (metaState.discordBotTimer) { try { clearTimeout(metaState.discordBotTimer); } catch {} }
          
          // Set up early Discord bot update (2 seconds sooner than endpoint stabilization)
          const DISCORD_BOT_UPDATE_MS = STABILIZE_MS - 2000; // 4 seconds instead of 6
          metaState.discordBotTimer = setTimeout(() => {
            try {
              if (metaState.pending && metaState.pending.title && metaState.pending.artist && 
                  metaState.pending.title !== 'Unknown Title' && metaState.pending.artist !== 'Unknown Artist') {
                console.log(`[Discord Bot] Early update after ${DISCORD_BOT_UPDATE_MS}ms: ${metaState.pending.title} by ${metaState.pending.artist}`);
                updateDiscordBotFromMetadata(metaState.pending.title, metaState.pending.artist, false, null);
              }
            } catch {}
          }, DISCORD_BOT_UPDATE_MS);
          
          // Set up endpoint stabilization timer
          metaState.pendingTimer = setTimeout(() => {
            try {
              if (metaState.pending) {
                metaState.lastStabilized = { title: metaState.pending.title, artist: metaState.pending.artist, albumArt: metaState.pending.albumArt, url: metaState.pending.url };
                metaState.lastPayload = metaState.pending.out;
                if (metaState.pending.albumArt) {
                  applySessionLogAlbumArt(
                    metaState.pending.title,
                    metaState.pending.artist,
                    metaState.pending.albumArt,
                  );
                }
                // Clear Discord bot timer when endpoint stabilizes
                if (metaState.discordBotTimer) {
                  try { clearTimeout(metaState.discordBotTimer); } catch {}
                  metaState.discordBotTimer = null;
                }
                metaState.pending = null;
                metaState.pendingTimer = null;
              }
            } catch {}
          }, STABILIZE_MS);
        }

        if (shouldHoldNowPlayingForPolicy()) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(activeBroadcastWaitingMetadataPayload()));
          return;
        }

        // Serve the last stabilized payload if available; else serve current
        const payload = metaState.lastPayload || out;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      // No change: return last stabilized payload if present to avoid redundant UI updates
      if (shouldHoldNowPlayingForPolicy()) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(activeBroadcastWaitingMetadataPayload()));
        return;
      }
      if (metaState.lastPayload) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metaState.lastPayload));
        return;
      }
      // If no prior payload, commit current and return
      commitNow();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Failed to fetch Last.fm data", message: err.message }));
    }
    return;
  }

  // --- /api/capabilities (store extension capabilities) ---
  if (req.url === '/api/capabilities') {
    // Handle POST requests for extension capability updates
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const postData = JSON.parse(body);
          let authUserId = null;
          let guestShareLinkId = null;
          const device = verifyBroadcastDeviceFromRequest(req);
          if (device) {
            authUserId = device.userId;
            touchUserVisit(device.userId, clientIp(req));
          } else {
            const { extensionClientBlocksSessionFallback, extensionPairingRequiredMessage } =
              await import('./src/security/broadcastClient.js');
            const { resolveGuestMetadataAuth, resolveExtensionGuestMetadataAuth } =
              await import('./src/http/guestBroadcast.js');
            const extGuest = resolveExtensionGuestMetadataAuth(postData);
            if (extGuest) {
              authUserId = extGuest.authUserId;
              guestShareLinkId = extGuest.link?.id ?? null;
            } else if (extensionClientBlocksSessionFallback(req)) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: extensionPairingRequiredMessage() }));
              return;
            } else {
              const appSession = getAppSession(req);
              if (appSession?.user?.id) {
                authUserId = appSession.user.id;
              } else {
                const guestAuth = resolveGuestMetadataAuth(req, postData);
                if (guestAuth) {
                  authUserId = guestAuth.authUserId;
                  guestShareLinkId = guestAuth.link?.id ?? null;
                } else {
                  const session = getDiscordSession(req);
                  if (!session || !session.user) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                    return;
                  }
                  authUserId = session.user.id;
                }
              }
            }
          }

          if (postData.guestName && String(authUserId).startsWith("guest:") && guestShareLinkId) {
            publishGuestProfile(guestShareLinkId, String(authUserId).slice(6), {
              displayName: postData.guestName,
              avatarVariant: postData.avatarVariant,
              coverIcon: postData.coverIcon,
            });
          }

          const userWsId = resolveWsIdForMetadataPost(authUserId, {
            railId: postData.railId || postData.wsId || null,
            broadcastName: (postData.broadcasterName || device || "").trim() || null,
          });

          if (!userWsId) {
            logMetadataPostOutcome(
              "rejected",
              `capabilities — no relay for user ${authUserId}`,
            );
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No active websocket connection found' }));
            return;
          }

          const { supportsMediaControls, site, broadcasterName } = postData;

          const wsInfo = wsConnections.get(userWsId);
          const previousSite = wsInfo?.capabilities?.site ?? null;
          const newSite = site || null;
          const siteChanged = !!wsInfo && previousSite !== newSite;

          if (wsInfo) {
            if (siteChanged) {
              wsInfo.metadataInvalidatedAt = Date.now();
              invalidateMetadataForSiteChange(userWsId, authUserId);
              console.log(
                `📡 Capabilities site changed ${previousSite ?? "(none)"} → ${newSite ?? "(none)"}; stale metadata cleared`,
              );
            }
            wsInfo.capabilities = {
              supportsMediaControls: !!supportsMediaControls,
              site: newSite,
              lastUpdated: Date.now(),
            };
            console.log(`📡 Capabilities updated for wsId ${userWsId}:`, wsInfo.capabilities);
          }

          const policyResult = reapplyContentPolicyAfterCapabilitiesUpdate(authUserId, userWsId);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Capabilities stored',
            muted: policyResult.muted,
            deferred: policyResult.deferred,
            policy: policyResult.muted || policyResult.deferred ? policyResult.decision : undefined,
          }));
        } catch (error) {
          console.error('Error parsing POST capabilities:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // GET request - return current capabilities
    const session = requireAuthForApi(req, res);
    if (!session) return;

    const userWsId = Array.from(wsConnections.entries())
      .find(([wsId, info]) => info.userId === String(session.user.id))?.[0];

    const capabilities = userWsId ? wsConnections.get(userWsId)?.capabilities : null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      capabilities: capabilities || { supportsMediaControls: false, site: null }
    }));
    return;
  }

  // --- /api/media-control (send media control commands to extensions) ---
  if (req.url === '/api/media-control') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const postData = JSON.parse(body);
          const { targetUserId, action, shareToken, guestId } = postData;

          if (!targetUserId || !action) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'targetUserId and action are required' }));
            return;
          }

          let fromUserId = null;

          if (shareToken && guestId) {
            const { validateGuestBroadcasterLink } = await import('./src/db/shareLinks.js');
            const link = validateGuestBroadcasterLink(String(shareToken).trim());
            if (!link) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid or expired guest broadcaster link' }));
              return;
            }
            if (!guestApiSessionValid(postData)) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid guest session' }));
              return;
            }
            const guestUserIdStr = `guest:${String(guestId).trim()}`;
            if (String(targetUserId) !== guestUserIdStr) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Guests may only control their own broadcast' }));
              return;
            }
            if (String(broadcastStatus.broadcasterUserId) !== guestUserIdStr) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not the active guest broadcaster' }));
              return;
            }
            fromUserId = guestUserIdStr;
          } else {
            const session = getDiscordSession(req);
            if (!session || !session.user) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }

            const isAdmin = await isUserAdmin(session.user.id);
            const isActiveBroadcaster =
              activeWsId && wsConnections.get(activeWsId)?.userId === String(session.user.id);

            if (!isAdmin && !isActiveBroadcaster) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Insufficient permissions' }));
              return;
            }
            fromUserId = session.user.id;
          }

          const targetWsId = Array.from(wsConnections.entries())
            .find(([wsId, info]) => info.userId === String(targetUserId))?.[0];

          if (!targetWsId) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Target user not connected' }));
            return;
          }

          const wsInfo = wsConnections.get(targetWsId);
          const supportsMediaControls = wsInfo?.capabilities?.supportsMediaControls;

          if (!supportsMediaControls) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Target extension does not support media controls' }));
            return;
          }

          try {
            const ws = wsInfo.ws;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'media_control',
                action: action,
                timestamp: Date.now(),
                fromUserId,
              }));

              console.log(`🎮 Media control "${action}" sent to user ${targetUserId} (wsId: ${targetWsId})`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Command sent' }));
            } else {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'WebSocket connection not available' }));
            }
          } catch (error) {
            console.error('Failed to send media control command:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to send command' }));
          }
        } catch (error) {
          console.error('Error parsing POST media control:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // --- /api/relay-connections (list all authorized connections) ---
  if (apiPath === '/api/relay-connections') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    if (!hasSessionOrShareToken(req, getAppSession)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      let resolveProfile = null;
      let getLatestDeviceLabel = null;
      if (isSetupComplete()) {
        const { getUserById } = await import('./src/db/index.js');
        const { publicUserPresentation } = await import('./src/db/userProfile.js');
        const { roleInfoForUser } = await import('./src/auth/permissions.js');
        const { getLatestDeviceLabelForUser } = await import('./src/db/broadcastDevices.js');
        getLatestDeviceLabel = getLatestDeviceLabelForUser;
        resolveProfile = (userId) => {
          const user = getUserById(Number(userId));
          if (!user) return null;
          return {
            ...publicUserPresentation(user),
            roleColor: roleInfoForUser(user).roleColor,
          };
        };
      }

      // Get all connections and sort by newest first (newest at top)
      const list = Array.from(wsConnections.entries())
        .map(([wsId, info]) => {
          const profile = resolveProfile ? resolveProfile(info.userId) : null;
          const broadcastName =
            info.broadcastName?.trim() ||
            (getLatestDeviceLabel ? getLatestDeviceLabel(Number(info.userId)) : null) ||
            null;
          const guestProfile = String(info.userId).startsWith("guest:")
            ? guestStageProfile(
                info.userId,
                info.displayName || String(info.userId).slice(6) || "Guest",
                info.guestShareId ?? null,
              )
            : null;
          return {
            wsId,
            userId: info.userId,
            displayName: guestProfile?.displayName ?? info.displayName,
            avatar: profile?.avatar ?? null,
            roleColor:
              String(info.userId).startsWith("guest:")
                ? "#c4b5fd"
                : profile?.roleColor ?? null,
            bio: guestProfile ? null : profile?.bio ?? null,
            genres: guestProfile ? [] : profile?.genres ?? [],
            guestAvatarVariant: guestProfile?.avatarVariant ?? 0,
            guestCoverIcon: guestProfile?.coverIcon ?? 0,
            broadcastName,
            connectedAt: info.connectedAt,
            isActive: wsId === activeWsId,
            capabilities: info.capabilities || { supportsMediaControls: false, site: null },
          };
        })
        .sort((a, b) => {
          // Sort by newest connectedAt first
          return new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime();
        });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ activeWsId, connections: list }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list connections' }));
    }
    return;
  }

  // --- /api/host-members (v2: enrich relay-connected users from DB profiles)
  if (apiPath === '/api/host-members') {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    if (isSetupComplete()) {
      try {
        const { getUserById } = await import('./src/db/index.js');
        const { publicUserPresentation } = await import('./src/db/userProfile.js');
        const { roleInfoForUser } = await import('./src/auth/permissions.js');
        const userIds = [
          ...new Set(
            Array.from(wsConnections.values())
              .map((info) => String(info.userId))
              .filter(Boolean),
          ),
        ];
        const hosts = userIds
          .map((userId) => {
            if (String(userId).startsWith("guest:")) {
              const conn = Array.from(wsConnections.values()).find(
                (info) => String(info.userId) === String(userId),
              );
              const profile = guestStageProfile(
                userId,
                conn?.displayName || String(userId).slice(6) || "Guest",
                conn?.guestShareId ?? null,
              );
              return {
                userId: String(userId),
                displayName: profile.displayName,
                avatar: null,
                roleColor: "#c4b5fd",
                guestAvatarVariant: profile.avatarVariant,
                guestCoverIcon: profile.coverIcon,
              };
            }
            const user = getUserById(Number(userId));
            if (!user) return null;
            const presentation = publicUserPresentation(user);
            return {
              userId,
              displayName: presentation.displayName || user.username,
              avatar: presentation.avatar,
              roleColor: roleInfoForUser(user).roleColor,
              bio: presentation.bio,
              genres: presentation.genres,
              level: presentation.level,
            };
          })
          .filter(Boolean);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hosts }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list host members' }));
      }
      return;
    }
    const session = requireAuthForApi(req, res);
    if (!session) return;
    try {
      const guild = client.guilds.cache.get(GUILD_ID);
      if (!guild) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Guild not available' }));
        return;
      }

      // OLD CODE - KEEP UNTIL CONFIRMED WORKING
      /*
      // Get all host role members first
      const members = await guild.members.fetch();
      const allHosts = [];
      for (const m of members.values()) {
        try {
          // Exclude bots even if they have host roles
          const isBot = !!m.user?.bot;
          if (!isBot && (m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.STAGE_PASS_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.MODERATOR_ROLE_ID))) {
            const roleInfo = await getUserRoleInfo(m.id);
            allHosts.push({
              userId: m.id,
              displayName: (m.displayName || m.user?.username || m.user?.tag || String(m.id)),
              avatar: m.user?.avatar || null,
              roleColor: roleInfo.roleColor,
            });
          }
        } catch {}
      }
      
      // Get top 7 most recently connected users (active + ghosts)
      const top7Users = getTop7UsersForStage();
      
      // Filter to only include users who have host roles
      const top7Hosts = top7Users
        .filter(user => allHosts.some(host => host.userId === user.userId))
        .map(user => {
          const hostInfo = allHosts.find(h => h.userId === user.userId);
          return {
            userId: user.userId,
            displayName: user.displayName || hostInfo?.displayName || String(user.userId),
            avatar: hostInfo?.avatar || null,
            roleColor: hostInfo?.roleColor || null,
          };
        });
      */

      // NEW CODE - TESTING: keep this endpoint fast by returning cached results immediately
      // and refreshing the cache in the background using a full guild scan.

      // Static cache so the endpoint can always respond quickly
      if (!global._hostMembersCache) {
        global._hostMembersCache = {
          hosts: [],
          updatedAt: 0,
          refreshing: false,
        };
      }

      const CACHE_TTL_MS = 30_000; // keep data for 30 seconds
      const now = Date.now();
      const cache = global._hostMembersCache;

      // Helper to kick off a background refresh without blocking the HTTP response
      const refreshInBackground = () => {
        if (cache.refreshing) return;
        cache.refreshing = true;

        (async () => {
          try {
            const freshTop7 = getTop7UsersForStage();
            const freshHosts = [];

            if (Array.isArray(freshTop7) && freshTop7.length > 0) {
              for (const user of freshTop7) {
                const userId = user?.userId ? String(user.userId) : null;
                if (!userId) continue;

                let member = guild.members.cache.get(userId);
                try {
                  if (!member) {
                    // Fetch only this specific member instead of the entire guild
                    member = await guild.members.fetch(userId);
                  }
                } catch {
                  // If we can't fetch this member quickly, skip them rather than hanging anything
                  continue;
                }

                if (!member || member.user?.bot) continue;

                const hasHostRole =
                  member.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID) ||
                  member.roles?.cache?.has(ROLE_CONFIG.STAGE_PASS_ROLE_ID) ||
                  member.roles?.cache?.has(ROLE_CONFIG.MODERATOR_ROLE_ID);

                if (!hasHostRole) continue;

                let roleInfo = null;
                try {
                  roleInfo = await getUserRoleInfo(member.id);
                } catch {
                  // If role info fails, still return the member without a roleColor
                }

                let profileExtras = { bio: null, genres: [], level: null };
                try {
                  const { getUserById } = await import('./src/db/index.js');
                  const { publicUserPresentation } = await import('./src/db/userProfile.js');
                  const userRow = getUserById(Number(member.id));
                  if (userRow) {
                    const presentation = publicUserPresentation(userRow);
                    profileExtras = {
                      bio: presentation.bio,
                      genres: presentation.genres,
                      level: presentation.level,
                    };
                  }
                } catch {}

                freshHosts.push({
                  userId: member.id,
                  displayName:
                    user.displayName ||
                    member.displayName ||
                    member.user?.username ||
                    member.user?.tag ||
                    String(member.id),
                  avatar: member.user?.avatar || null,
                  roleColor: roleInfo?.roleColor || null,
                  bio: profileExtras.bio,
                  genres: profileExtras.genres,
                  level: profileExtras.level,
                });
              }
            }

            cache.hosts = freshHosts;
            cache.updatedAt = Date.now();
          } finally {
            cache.refreshing = false;
          }
        })();
      };

      // If cache is empty or stale, trigger a background refresh
      const isStale = !Array.isArray(cache.hosts) || (now - cache.updatedAt) > CACHE_TTL_MS;
      if (isStale) {
        refreshInBackground();
      }

      // Always respond quickly with whatever we have (even if it's currently empty).
      const top7Hosts = Array.isArray(cache.hosts) ? cache.hosts : [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hosts: top7Hosts }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list host members' }));
    }
    return;
  }

  // --- /api/switch?wsId=... (current broadcaster or admin can switch) ---
  if (req.url.startsWith('/api/switch')) {
    const session = requireAuthForApi(req, res);
    if (!session) return;
    
    // Check if user can promote (admin always, stage pass only when active)
    const isCurrentBroadcaster = broadcastStatus.broadcasterUserId && String(session.user?.id) === String(broadcastStatus.broadcasterUserId);
    const canPromote = await canUserPromote(session.user?.id, isCurrentBroadcaster);
    
    if (!canPromote) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only current broadcaster or admin can switch' }));
      return;
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const targetWsId = url.searchParams.get('wsId');
      if (!targetWsId || !wsConnections.has(targetWsId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid wsId' }));
        return;
      }
      if (activeWsId === targetWsId) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Already active', broadcastStatus }));
        return;
      }
      const previousBroadcasterUserId = broadcastStatus.broadcasterUserId;
      // Switch pipeline: set active first to prevent old feed from reattaching
      activeWsId = targetWsId;
      try { debugLog('api_switch', { activeWsId }); } catch {}
      resetLiveSilenceState();
      const info = wsConnections.get(targetWsId);
      broadcastStatus.broadcasterUserId = info.userId;
      broadcastStatus.broadcasterDisplayName = info.displayName;
      publishBroadcastStatusChanged("switch");
      // Update Last.fm override to target connection (or clear if none)
      try {
        const targetWs = info.ws;
        if (targetWs && targetWs._lastfm && targetWs._lastfm.user && targetWs._lastfm.apiKey) {
          currentLastfmOverride = { user: targetWs._lastfm.user, apiKey: targetWs._lastfm.apiKey, wsId: targetWsId };
          const h = hashLastfmCred(currentLastfmOverride.user, currentLastfmOverride.apiKey);
          // Reset validity for this pair to try once
          lastfmCredCache.set(h, { valid: true, ts: Date.now() - LASTFM_CACHE_TTL_MS - 1 });
          try { saveLastfmCache(); } catch {}
        } else {
          currentLastfmOverride = null;
        }
      } catch {}
      switchLiveBroadcaster(targetWsId);

      // Clear metadata stabilization state to force fresh metadata fetch for new websocket
      try {
        if (typeof globalThis.__metaState !== 'undefined') {
          globalThis.__metaState.lastStabilized = null;
          globalThis.__metaState.lastPayload = null;
          globalThis.__metaState.pending = null;
          if (globalThis.__metaState.pendingTimer) {
            clearTimeout(globalThis.__metaState.pendingTimer);
            globalThis.__metaState.pendingTimer = null;
          }
          if (globalThis.__metaState.discordBotTimer) {
            clearTimeout(globalThis.__metaState.discordBotTimer);
            globalThis.__metaState.discordBotTimer = null;
          }
        }
      } catch {}
      
      if (isSetupComplete()) {
        try {
          onDjSwitch({
            initiatorUserId: session.user?.id,
            previousBroadcasterUserId,
            newBroadcasterUserId: info.userId,
            newWsId: targetWsId,
            wasCurrentBroadcaster: isCurrentBroadcaster,
          });
        } catch {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, activeWsId, broadcastStatus }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Switch failed' }));
    }
    return;
  }

    // Simple deterministic hash function (returns hex string)
    function hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
      }
      // Convert to hex
      return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
    }
    
    // --- /api/search endpoint ---
    if (apiPath === "/api/search") {
      const params = new URLSearchParams(apiUrl.search);
      const track = params.get('track');
      const artist = params.get('artist');
      const page = parseInt(params.get('page') || '1');
      
      // Track is required, artist is optional
      if (!track) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Missing required 'track' parameter" }));
        return;
      }

      const lastfmApiKey = getLastfmApiKey(config);
      if (!lastfmApiKey) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "Last.fm API key not configured. Add it in Admin → System → Integrations." }));
        return;
      }
      
      // Build Last.fm query
      let query = `track=${encodeURIComponent(track)}`;
      if (artist) query += `&artist=${encodeURIComponent(artist)}`;
      
      // Cache key
      const cacheKey = `${track || ''}|||${artist || ''}`;
      
      // Check cache (5 min expiry)
      if (lastfmSearchCache[cacheKey] && Date.now() - lastfmSearchCache[cacheKey].timestamp < 300000) {
        const cached = lastfmSearchCache[cacheKey];
        const start = (page - 1) * 50;
        const end = start + 50;
        const pageResults = cached.results.slice(start, end);
        
        res.writeHead(200);
        res.end(JSON.stringify({ results: pageResults, total: cached.results.length, page }));
        return;
      }
      
      // Fetch from Last.fm (500 results)
      const lastfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&${query}&limit=500&api_key=${lastfmApiKey}&format=json`;
      
      try {
        const lastfmResponse = await fetch(lastfmUrl);
        const data = await lastfmResponse.json();
        
        const results = data.results?.trackmatches?.track || [];
        const resultsArray = Array.isArray(results) ? results : [results];
        
        // Cache results
        lastfmSearchCache[cacheKey] = { results: resultsArray, timestamp: Date.now() };
        
        // Return first page
        const start = (page - 1) * 50;
        const end = start + 50;
        const pageResults = resultsArray.slice(start, end);
        
        res.writeHead(200);
        res.end(JSON.stringify({ results: pageResults, total: resultsArray.length, page }));
        return;
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to fetch from Last.fm" }));
        return;
      }
    }
    
    // --- /api/requests endpoint ---
    if (apiPath === "/api/requests") {
      if (!hasSessionOrShareToken(req, getAppSession)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(requests));
      return;
    }
    
    // --- /api/chat/unread and /api/chat/read ---
    if (apiPath === "/api/chat/unread" || apiPath === "/api/chat/read") {
      const guestReadPost = apiPath === "/api/chat/read" && req.method === "POST";
      if (!guestReadPost && !hasSessionOrShareToken(req, getAppSession)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      if (apiPath === "/api/chat/unread" && req.method === "GET") {
        (async () => {
          const ctx = await resolveChatReadContext(req);
          if (!ctx) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }
          const unreadCount = countUnreadMessages(messages, ctx.recipientKey, ctx.viewerUserId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ unreadCount }));
        })();
        return;
      }

      if (apiPath === "/api/chat/read" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          let data = null;
          try {
            data = body ? JSON.parse(body) : {};
          } catch {
            data = {};
          }
          const ctx = await resolveChatReadContextForWrite(req, data);
          if (!ctx) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }
          const lastReadAt = markChatReadForRecipient(ctx.recipientKey, messages);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, lastReadAt, unreadCount: 0 }));
        });
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // --- /api/messages endpoint ---
    if (apiPath === "/api/messages") {
      if (req.method === "GET") {
        if (!hasSessionOrShareToken(req, getAppSession)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        (async () => {
          try {
            const { enrichChatMessagesForApi, findRequestUserVote } = await import("./src/http/chatMessages.js");
            const { validateShareToken } = await import("./src/db/shareLinks.js");
            const { shareTokenFromRequest } = await import("./src/security/access.js");

            let viewerContext = null;
            let guestShareLinkId = null;
            const session = getAppSession(req);
            if (session?.user?.id) {
              const isHost = await isUserHost(session.user.id);
              viewerContext = { userId: String(session.user.id), isHost };
            } else {
              const guestId = apiUrl.searchParams.get("guestId");
              const token = shareTokenFromRequest(req);
              if (guestId && token) {
                const link = validateShareToken(String(token));
                if (link?.link_kind === "ui") {
                  guestShareLinkId = link.id;
                  viewerContext = { userId: `guest:${String(guestId)}`, isHost: false };
                }
              }
            }

            const enriched = await enrichChatMessagesForApi(messages, {
              getUserRoleInfo,
              viewerContext,
              guestShareLinkId,
              getSongRequestForMessage: (msg) => {
                let key = msg.songKey;
                if (!key && msg.requestTitle && msg.requestArtist) {
                  key = getSongKey(msg.requestTitle, msg.requestArtist);
                }
                if (!key && msg.content) {
                  const match = String(msg.content).match(/requested "([^"]+)" by (.+)$/);
                  if (match) key = getSongKey(match[1], match[2].trim());
                }
                if (!key || !requests[key]) return null;
                const meta = buildSongRequestApiMeta(requests[key], key);
                if (viewerContext) {
                  meta.requestUserVote = findRequestUserVote(requests[key].votes, viewerContext);
                }
                return meta;
              },
            });
            res.writeHead(200);
            res.end(JSON.stringify(enriched, null, 2));
          } catch {
            res.writeHead(200);
            res.end(JSON.stringify(messages, null, 2));
          }
        })();
        return;
      }
    
      if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
          let data;
          try {
            data = JSON.parse(body);
          } catch (e) {
            data = null;
          }
          try {
            // Fallback: allow plain text bodies to post a message
            if (!data && typeof body === 'string' && body.trim().length > 0) {
              const session = getDiscordSession(req);
              if (!session) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
              const content = body.trim();
              const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              const { buildChatAuthorFromUserId } = await import('./src/http/chatMessages.js');
              const author = await buildChatAuthorFromUserId(session.user.id, getUserRoleInfo, {
                username: session.user?.username,
                displayName: session.user?.displayName,
                avatar: session.user?.avatar || null,
                role: session.user?.role,
              });
              messages.push({
                id: newId,
                content,
                ...author,
                isHost: false,
                timestamp: Date.now(),
              });
              finalizeChatMutation("message", messages[messages.length - 1]);
              res.writeHead(201);
              res.end(JSON.stringify({ success: true }));
              return;
            }
            if (!data) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }
            
            
            
            const { content, action, type, gifUrl, targetId, title, artist, url, songKey: bodySongKey, vote, shareToken, guestId, guestName, guestSession } = data;

            const { validateShareToken } = await import('./src/db/shareLinks.js');

            function guestShareLink() {
              if (!shareToken || !guestId || !guestName || !guestSession) return null;
              if (!verifyGuestSession(String(guestSession), String(shareToken), String(guestId))) return null;
              const link = validateShareToken(String(shareToken));
              if (!link || link.link_kind !== 'ui') return null;
              return link;
            }

            function enforceGuestChatRateLimit() {
              const ip = clientIp(req);
              const rl = consumeRateLimit(`guest-chat:${ip}:${shareToken}`, { windowMs: 60 * 1000, max: 20 });
              if (!rl.allowed) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Rate limited', retryAfterMs: rl.retryAfterMs }));
                return false;
              }
              return true;
            }

            function sanitizeGuestName(name) {
              const trimmed = String(name).trim().replace(/\s+/g, '').slice(0, 32);
              return trimmed || 'Guest';
            }

            // Guest GIF (share-link UI)
            if (!action && type === "gif" && gifUrl && shareToken && guestId && guestName) {
              const link = guestShareLink();
              if (!link) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or expired share link' }));
                return;
              }
              if (!enforceGuestChatRateLimit()) return;
              if (!isAllowedGifUrl(gifUrl)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid GIF URL' }));
                return;
              }
              publishGuestDisplayName(link.id, guestId, guestName);
              const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              const { guestChatAuthor } = await import('./src/http/chatMessages.js');
              messages.push({
                id: newId,
                type: "gif",
                gifUrl: String(gifUrl),
                content: typeof content === "string" ? content.trim().slice(0, 200) : "",
                ...guestChatAuthor(guestId, sanitizeGuestName(guestName)),
                guestShareLinkId: link.id,
                isHost: false,
                timestamp: Date.now(),
              });
              finalizeChatMutation("message", messages[messages.length - 1]);
              res.writeHead(201);
              res.end(JSON.stringify({ success: true }));
              return;
            }

            // Guest chat (share-link UI visitors — browser-local identity)
            if (!action && content && typeof content === 'string' && shareToken && guestId && guestName) {
              const link = guestShareLink();
              if (!link) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or expired share link' }));
                return;
              }
              if (!enforceGuestChatRateLimit()) return;
              publishGuestDisplayName(link.id, guestId, guestName);
              const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              const { guestChatAuthor } = await import('./src/http/chatMessages.js');
              messages.push({
                id: newId,
                content,
                ...guestChatAuthor(guestId, sanitizeGuestName(guestName)),
                guestShareLinkId: link.id,
                isHost: false,
                timestamp: Date.now(),
              });
              finalizeChatMutation("message", messages[messages.length - 1]);
              res.writeHead(201);
              res.end(JSON.stringify({ success: true }));
              return;
            }

            // Guest song request
            if (action === 'request' && shareToken && guestId && guestName) {
              const link = guestShareLink();
              if (!link) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or expired share link' }));
                return;
              }
              if (!enforceGuestChatRateLimit()) return;
              publishGuestDisplayName(link.id, guestId, guestName);
              const guestLabel = sanitizeGuestName(guestName);
              const userId = `guest:${String(guestId)}`;
              const rateLimitKey = `${userId}|||GUEST`;
              if (requestRateLimits[rateLimitKey] && Date.now() - requestRateLimits[rateLimitKey] < 120000) {
                const remaining = 120000 - (Date.now() - requestRateLimits[rateLimitKey]);
                res.writeHead(429);
                res.end(JSON.stringify({ error: "Rate limited", remainingMs: remaining }));
                return;
              }
              for (const [_, req] of Object.entries(requests)) {
                if (req.status === 'requested' && req.votes.some(v => v.userId === userId)) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "You already have a pending request" }));
                  return;
                }
              }
              const songKey = getSongKey(title, artist);
              if (!requests[songKey]) {
                requests[songKey] = {
                  title,
                  artist,
                  url,
                  votes: [],
                  status: 'requested',
                  requestedAt: Date.now(),
                  dmMessageId: null,
                  requesterUserId: userId,
                };
                await sendRequestDM(requests[songKey], songKey);
              }
              requests[songKey].votes.push({ userId, host: false, vote: 1 });
              await updateRequestDM(requests[songKey], songKey);
              const msgId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              messages.push({
                id: msgId,
                content: `🎵 ${guestLabel} requested "${title}" by ${artist}`,
                type: 'SYSTEM_REQUEST',
                userId,
                songKey,
                requestTitle: title,
                requestArtist: artist,
                isGuest: true,
                isHost: false,
                guestShareLinkId: link.id,
                timestamp: Date.now()
              });
              requestRateLimits[rateLimitKey] = Date.now();
              finalizeChatMutation("request", messages[messages.length - 1]);
              tryMatchRequestToNowPlaying(songKey, currentSong, currentArtist, { source: "metadata" });
              res.writeHead(201);
              res.end(JSON.stringify({
                success: true,
                messageId: msgId,
                songKey,
                title,
                artist,
                status: requests[songKey].status,
              }));
              return;
            }

            // Guest vote on song request
            if (action === 'vote' && shareToken && guestId && guestName) {
              const link = guestShareLink();
              if (!link) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or expired share link' }));
                return;
              }
              if (!enforceGuestChatRateLimit()) return;
              publishGuestDisplayName(link.id, guestId, guestName);
              const userId = `guest:${String(guestId)}`;
              const songKey = getSongKey(title, artist);
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              const existingVote = requests[songKey].votes.find((v) => v.userId === userId);
              if (existingVote) {
                existingVote.vote = vote;
              } else {
                requests[songKey].votes.push({ userId, host: false, vote });
              }
              await updateRequestDM(requests[songKey], songKey);
              publishChatChanged("request");
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }

            // Guest broadcaster: approve/deny / manual status while live
            if (
              (action === "approve-request" ||
                action === "deny-request" ||
                action === "mark-request-playing" ||
                action === "mark-request-played") &&
              shareToken &&
              guestId &&
              guestSession
            ) {
              const link = guestShareLink();
              if (!link) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or expired share link' }));
                return;
              }
              if (!verifyGuestSession(guestSession, shareToken, guestId)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid guest session' }));
                return;
              }
              if (String(broadcastStatus.broadcasterUserId) !== `guest:${String(guestId)}`) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Only the live guest broadcaster can moderate requests' }));
                return;
              }
              const { songKey } = data;
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              const req = requests[songKey];
              if (action === 'approve-request') {
                requests[songKey].status = 'approved';
                tryAwardApprovalXp({ songKey, request: req, approverUserId: `guest:${guestId}` });
                tryMatchApprovedRequestToNowPlaying(songKey);
              } else if (action === 'mark-request-playing') {
                if (req.status !== 'approved') {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "Only approved requests can be marked playing" }));
                  return;
                }
                markRequestPlaying(songKey, req.title, req.artist);
              } else if (action === 'mark-request-played') {
                if (req.status !== 'playing') {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "Only playing requests can be marked played" }));
                  return;
                }
                markRequestPlayed(songKey);
              } else {
                requests[songKey].status = 'denied';
                setTimeout(() => {
                  const deniedReq = requests[songKey];
                  if (!deniedReq || deniedReq.status !== 'denied') return;
                  delete requests[songKey];
                  messages = messages.filter((m) => {
                    if (m.type !== 'SYSTEM_REQUEST') return true;
                    return !(m.content.includes(`"${deniedReq.title}"`) && m.content.includes(`by ${deniedReq.artist}`));
                  });
                  publishChatChanged("request");
                }, 5 * 60 * 1000);
              }
              publishChatChanged("request");
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }
    
            // Get session and user role info
            const session = getDiscordSession(req);
            if (!session || !session.user) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }
            
            const roleInfo = await getUserRoleInfo(session.user.id);
            const isHost = await isUserHost(session.user.id);

            // Authenticated GIF message
            if (!action && type === "gif" && typeof gifUrl === "string") {
              if (!isAllowedGifUrl(gifUrl)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Invalid GIF URL" }));
                return;
              }
              const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              const { buildChatAuthorFromUserId } = await import('./src/http/chatMessages.js');
              const author = await buildChatAuthorFromUserId(session.user.id, getUserRoleInfo, {
                username: session.user?.username,
                displayName: session.user?.displayName,
                avatar: session.user?.avatar || null,
                role: session.user?.role,
              });
              messages.push({
                id: newId,
                type: "gif",
                gifUrl: String(gifUrl),
                content: typeof content === "string" ? content.trim().slice(0, 200) : "",
                ...author,
                isHost: isHost,
                timestamp: Date.now(),
              });
              finalizeChatMutation("message", messages[messages.length - 1]);
              res.writeHead(201);
              res.end(JSON.stringify({ success: true }));
              return;
            }
    
            // ✅ Song Request actions
            if (action === 'request') {
              const userId = String(session.user.id);
              
              // Check rate limit (2 minutes)
              const rateLimitKey = `${userId}|||${roleInfo.level}`;
              if (requestRateLimits[rateLimitKey] && Date.now() - requestRateLimits[rateLimitKey] < 120000) {
                const remaining = 120000 - (Date.now() - requestRateLimits[rateLimitKey]);
                res.writeHead(429);
                res.end(JSON.stringify({ error: "Rate limited", remainingMs: remaining }));
                return;
              }
              
              // Check if user already has pending request
              for (const [_, req] of Object.entries(requests)) {
                if (req.status === 'requested' && req.votes.some(v => v.userId === userId && v.host === isHost)) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "You already have a pending request" }));
                  return;
                }
              }
              
              const songKey = getSongKey(title, artist);
              
              // Add to existing request or create new
              if (!requests[songKey]) {
                requests[songKey] = {
                  title,
                  artist,
                  url,
                  votes: [],
                  status: 'requested',
                  requestedAt: Date.now(),
                  dmMessageId: null,
                  requesterUserId: userId,
                };
                
                // Send DM to host
                await sendRequestDM(requests[songKey], songKey);
              }
              
              // Add user's vote (default +1 for requester)
              requests[songKey].votes.push({ userId, host: isHost, vote: 1 });
              
              // Update DM with new vote count
              await updateRequestDM(requests[songKey], songKey);
              
              // Create request message
              const msgId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
              messages.push({
                id: msgId,
                content: `🎵 <@${session.user.id}> requested "${title}" by ${artist}`,
                type: 'SYSTEM_REQUEST',
                userId: String(session.user.id),
                songKey,
                requestTitle: title,
                requestArtist: artist,
                isHost: isHost,
                timestamp: Date.now()
              });
              finalizeChatMutation("request", messages[messages.length - 1]);
              
              requestRateLimits[rateLimitKey] = Date.now();
              
              tryMatchRequestToNowPlaying(songKey, currentSong, currentArtist, { source: "metadata" });

              res.writeHead(200);
              res.end(JSON.stringify({
                success: true,
                messageId: msgId,
                songKey,
                title,
                artist,
                status: requests[songKey].status,
              }));
              return;
            }
            
            if (action === 'vote') {
              const userId = String(session.user.id);
              const songKey = getSongKey(title, artist);
              
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              
              // Update or add vote
              const existingVote = requests[songKey].votes.find(v => v.userId === userId && v.host === isHost);
              if (existingVote) {
                existingVote.vote = vote;
              } else {
                requests[songKey].votes.push({ userId, host: isHost, vote });
              }
              
              // Update DM with new vote count
              await updateRequestDM(requests[songKey], songKey);
              publishChatChanged("request");
              
              res.writeHead(200);
              res.end(JSON.stringify({ success: true }));
              return;
            }
            
            if (action === 'cancel-request') {
              const userId = String(session.user.id);
              const songKey = getSongKey(title, artist);
              
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              
              // Only requester can cancel
              const userVote = requests[songKey].votes.find(v => v.userId === userId && v.host === isHost);
              if (!userVote) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Not your request" }));
                return;
              }
              
              // Delete Discord DM if exists
              if (requests[songKey]?.dmMessageId) {
                await deleteRequestDM(requests[songKey].dmMessageId);
              }
              
              // Delete from requests
              delete requests[songKey];
              
              // Remove from messages
              messages = messages.filter(m => {
                if (m.type !== 'SYSTEM_REQUEST') return true;
                return !(m.content.includes(`"${title}"`) && m.content.includes(`by ${artist}`));
              });
              publishChatChanged("request");
              
              res.writeHead(200);
              res.end(JSON.stringify({ success: true }));
              return;
            }
            
            // Host-only: Approve request
            if (action === 'approve-request') {
              const userId = String(session.user.id);
              if (!canModerateSongRequestsForUser(userId, roleInfo)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only the live broadcaster or admin can approve requests" }));
                return;
              }
              
              const { songKey } = data;
              
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              
              requests[songKey].status = 'approved';
              tryAwardApprovalXp({
                songKey,
                request: requests[songKey],
                approverUserId: userId,
              });
              tryMatchApprovedRequestToNowPlaying(songKey);
              publishChatChanged("request");
              
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }

            // Host-only: Mark request playing (manual, when auto-match missed)
            if (action === 'mark-request-playing') {
              const userId = String(session.user.id);
              if (!canModerateSongRequestsForUser(userId, roleInfo)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only the live broadcaster or admin can update request status" }));
                return;
              }

              const { songKey } = data;

              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }

              const req = requests[songKey];
              if (req.status !== 'approved') {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Only approved requests can be marked playing" }));
                return;
              }

              markRequestPlaying(songKey, req.title, req.artist);
              publishChatChanged("request");

              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }

            // Host-only: Mark request played (manual completion)
            if (action === 'mark-request-played') {
              const userId = String(session.user.id);
              if (!canModerateSongRequestsForUser(userId, roleInfo)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only the live broadcaster or admin can update request status" }));
                return;
              }

              const { songKey } = data;

              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }

              if (requests[songKey].status !== 'playing') {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Only playing requests can be marked played" }));
                return;
              }

              markRequestPlayed(songKey);
              publishChatChanged("request");

              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }
            
            // Host-only: Deny request
            if (action === 'deny-request') {
              const userId = String(session.user.id);
              if (!canModerateSongRequestsForUser(userId, roleInfo)) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only the live broadcaster or admin can deny requests" }));
                return;
              }
              
              const { songKey } = data;
              
              if (!requests[songKey]) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Request not found" }));
                return;
              }
              
              const deniedTitle = requests[songKey].title;
              const deniedArtist = requests[songKey].artist;
              requests[songKey].status = 'denied';
              
              // Auto-cleanup denied requests after 5 minutes
              setTimeout(() => {
                const req = requests[songKey];
                if (!req || req.status !== 'denied') return;
                console.log(`[Request] Auto-cleaning up denied request: ${req.title} by ${req.artist}`);
                delete requests[songKey];
                messages = messages.filter(m => {
                  if (m.type !== 'SYSTEM_REQUEST') return true;
                  return !(m.content.includes(`"${deniedTitle}"`) && m.content.includes(`by ${deniedArtist}`));
                });
                publishChatChanged("request");
              }, 5 * 60 * 1000);
              publishChatChanged("request");
              
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, songKey, status: requests[songKey].status }));
              return;
            }
    
            // ✅ Admin-only actions (message management)
            if (action === "delete" && targetId) {
              if (!roleInfo.permissions.canDeleteMessages) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only admin can delete messages" }));
                return;
              }
                // Find the message first to check if it's a request
                const messageToDelete = messages.find(m => m.id === targetId);
                
                const beforeCount = messages.length;
                messages = messages.filter(m => m.id !== targetId);
                const deleted = messages.length < beforeCount;
                if (deleted) publishChatChanged("message");
                
                // If it was a request message, clean up the associated request
                if (messageToDelete && messageToDelete.content.startsWith('🎵') && messageToDelete.content.includes('requested')) {
                  const match = messageToDelete.content.match(/requested "([^"]+)" by (.+)/);
                  if (match) {
                    const [_, title, artist] = match;
                    const songKey = getSongKey(title, artist);
                    
                    if (requests[songKey]) {
                      console.log(`[Request] Deleting request via message deletion: ${title} by ${artist}`);
                      
                      // Delete Discord DM if exists
                      if (requests[songKey].dmMessageId) {
                        await deleteRequestDM(requests[songKey].dmMessageId);
                      }
                      
                      // Remove from requests
                      delete requests[songKey];
                    }
                  }
                }
    
                res.writeHead(200);
                res.end(JSON.stringify({
                  success: true,
                  action: "delete",
                  deleted,
                  remaining: messages.length,
                }));
                return;
              }
    
            if (action === "clear") {
              if (!roleInfo.permissions.canClearMessages) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: "Only admin can clear messages" }));
                return;
              }
              
              // Clear all request-related Discord DMs
              for (const [songKey, request] of Object.entries(requests)) {
                if (request.dmMessageId) {
                  await deleteRequestDM(request.dmMessageId);
                }
              }
              
              // Clear all requests
              requests = {};
              console.log('[Request] Cleared all requests due to message clear');
              
              messages = [];
              publishChatChanged("message");
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, action: "clear", cleared: true }));
              return;
            }
            
            // If user provided an unrecognized action and they're not admin
            if (action && !roleInfo.permissions.canDeleteMessages && !roleInfo.permissions.canClearMessages) {
              res.writeHead(403);
              res.end(JSON.stringify({ error: "Insufficient permissions" }));
              return;
            }
    
            // 🔹 Normal message posting (now trusts Discord session only)
            if (!content || typeof content !== 'string') {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "Missing content" }));
              return;
            }
            const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
            const { buildChatAuthorFromUserId } = await import('./src/http/chatMessages.js');
            const author = await buildChatAuthorFromUserId(session.user.id, getUserRoleInfo, {
              username: session.user?.username,
              displayName: session.user?.displayName,
              avatar: session.user?.avatar || null,
              role: session.user?.role,
            });
            messages.push({
              id: newId,
              content,
              ...author,
              isHost: isHost,
              timestamp: Date.now(),
            });
    
            finalizeChatMutation("message", messages[messages.length - 1]);
    
            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON", message: err.message }));
          }
        });
        return;
      }
    }
        
    // --- /api/auth endpoint ---
    
    // REMOVE legacy host auth
    
    // --- /api/validate endpoint ---
    // REMOVE legacy validate endpoint

    // Proxy: Icecast status JSON under /api
    if (apiPath === "/api/status-json.xsl") {
      try {
        const { buildStreamStatusJson } = await import('./src/radio/streamHub.js');
        const payload = buildStreamStatusJson({
          title: currentSong,
          artist: currentArtist,
          active: broadcastStatus.active,
        });
        res.writeHead(200, icecastStatusHeaders());
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: "Status unavailable", message: err.message }));
      }
      return;
    }

    // Authenticated in-process stream — handled early in this block (and via tryHandleV2Request)
    
    // API endpoint not found
  res.writeHead(404);
    res.end(JSON.stringify({ error: "API endpoint not found" }));
    return;
  }

  // OAuth routes (outside /api) — before setup, send login attempts to bootstrap wizard
  if (!isSetupComplete() && (req.url === '/auth/login' || req.url.startsWith('/auth/login?') || req.url === '/auth/login/')) {
    res.writeHead(302, { Location: '/setup' });
    res.end();
    return;
  }

  // OLD CODE - KEEP UNTIL CONFIRMED WORKING: legacy Discord OAuth login when setup incomplete
  // if (!isSetupComplete() && (req.url === '/auth/login' || req.url.startsWith('/auth/login?') || req.url === '/auth/login/')) {
  //   const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&response_type=code&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&scope=identify%20guilds`;
  //   res.writeHead(302, { Location: authorizeUrl });
  //   res.end();
  //   return;
  // }

  // NEW CODE - SITE OAUTH CALLBACK (restored). Uses DISCORD_REDIRECT_URI (/auth/callback)
  if (!isSetupComplete() && (req.url === '/auth/callback' || req.url.startsWith('/auth/callback?') || req.url === '/auth/callback/')) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err || !code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('OAuth error');
            return;
          }
    
      const body = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      });
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      if (!tokenRes.ok) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Token exchange failed');
            return;
          }
      const tokenJson = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      const tokenType = tokenJson.token_type || 'Bearer';

      const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `${tokenType} ${accessToken}` } });
      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `${tokenType} ${accessToken}` } });
      if (!userRes.ok || !guildsRes.ok) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Failed to fetch user or guilds');
        return;
      }
      const user = await userRes.json();
      const guilds = await guildsRes.json();
      const inGuild = Array.isArray(guilds) && guilds.some(g => g.id === GUILD_ID);
      if (!inGuild) {
        const jrPath = path.join(STATIC_DIR, 'join-required.html');
        if (fs.existsSync(jrPath)) {
          const nameParam = encodeURIComponent(user?.username || '');
          res.writeHead(302, { Location: `/join-required${nameParam ? `?name=${nameParam}` : ''}` });
          res.end();
        } else {
          serveJoinRequired(res, user?.username);
        }
        return;
      }

      const sessionToken = generateSessionToken();
      const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
      discordSessions.push({ token: sessionToken, expiresAt, user, scopes: ['identify','guilds'] });
      try { saveSessions(); } catch {}
      const cookie = `discord_session=${sessionToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${12*60*60}`;
      res.writeHead(302, { 'Set-Cookie': cookie, Location: '/' });
      res.end();
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('OAuth processing error');
    }
    return;
  }

  // NOTE: '/oauth_callback' for the Android app is handled below by the HTML page that deep-links back to the app

  if (!isSetupComplete() && (req.url === '/auth/logout' || req.url.startsWith('/auth/logout?') || req.url === '/auth/logout/')) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['discord_session'];
    if (token) {
      const idx = discordSessions.findIndex(s => s.token === token);
      if (idx !== -1) {
        discordSessions.splice(idx, 1);
        try { saveSessions(); } catch {}
      }
    }
    res.writeHead(302, { 'Set-Cookie': 'discord_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None', Location: '/auth/login' });
    res.end();
      return;
    }
    
  if (!isSetupComplete() && (req.url === '/auth/status' || req.url.startsWith('/auth/status?') || req.url === '/auth/status/')) {
    const session = getDiscordSession(req);
    if (!session) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ authenticated: false })); return; }
    
    const isHost = await isUserHost(session.user?.id);
    const roleInfo = await getUserRoleInfo(session.user?.id);
    const canBroadcast = await canUserBroadcast(session.user?.id);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      authenticated: true, 
      isHost, 
      canBroadcast,
      roleInfo: {
        level: roleInfo.level,
        roleType: roleInfo.roleType,
        permissions: roleInfo.permissions,
        roleColor: roleInfo.roleColor
      },
      user: { id: session.user?.id, username: session.user?.username, avatar: session.user?.avatar } 
    }));
        return;
  }

  // Android app OAuth login - separate from main site OAuth
  if (req.url === '/auth/android-login' || req.url.startsWith('/auth/android-login')) {
    const androidRedirectUri = DISCORD_ANDROID_REDIRECT_URI;
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&response_type=code&redirect_uri=${encodeURIComponent(androidRedirectUri)}&scope=identify%20guilds`;
    res.writeHead(302, { Location: authorizeUrl });
    res.end();
    return;
  }

  // Android app session creation endpoint
  if (req.url === '/auth/create-session' || req.url.startsWith('/auth/create-session')) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { discord_access_token, user } = data;

        if (!discord_access_token || !user) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing discord_access_token or user data' }));
          return;
        }

        // Verify the Discord access token by getting user info
        const discordResponse = await fetch('https://discord.com/api/users/@me', {
          headers: { 'Authorization': `Bearer ${discord_access_token}` }
        });

        if (!discordResponse.ok) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid Discord access token' }));
          return;
        }

        const discordUser = await discordResponse.json();
        
        // Verify the user matches what was sent
        if (discordUser.id !== user.id || discordUser.username !== user.username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User data mismatch' }));
          return;
        }

        // Create a session token using your existing system
        const sessionToken = generateSessionToken();
        const expiresAt = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
        
        // Add to your existing discordSessions array
        discordSessions.push({ 
          token: sessionToken, 
          expiresAt, 
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar
          }, 
          scopes: ['identify','guilds'] 
        });
        try { saveSessions(); } catch {}
        
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Set-Cookie': `discord_session=${sessionToken}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None`
        });
        res.end(JSON.stringify({ 
          session_token: sessionToken,
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar
          }
        }));

      } catch (error) {
        console.error('Error creating session:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // Android app OAuth callback page
  if (req.url === '/oauth_callback' || req.url.startsWith('/oauth_callback')) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Android Broadcaster OAuth Callback</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
        }
        .icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        p {
            color: #666;
            margin-bottom: 30px;
        }
        .button {
            background: #5865F2;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
        }
        .button:hover {
            background: #4752C4;
        }
        .loading {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📱</div>
        <h1>Android Broadcaster</h1>
        <p id="status">Processing Discord authentication...</p>
        <div class="loading" id="loading">
            <div style="width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #5865F2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
        <button class="button" id="openApp" style="display: none;">Open Android Broadcaster</button>
    </div>

    <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>

    <script>
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const state = urlParams.get('state');

        const statusEl = document.getElementById('status');
        const loadingEl = document.getElementById('loading');
        const openAppEl = document.getElementById('openApp');

        if (error) {
            statusEl.textContent = \`Authentication failed: \${error}\`;
            loadingEl.style.display = 'none';
            openAppEl.style.display = 'inline-block';
            openAppEl.textContent = 'Try Again';
            openAppEl.onclick = () => window.location.href = '/auth/login';
        } else if (code) {
            statusEl.textContent = 'Authentication successful!';
            loadingEl.style.display = 'block';
            
            // Try to open the Android app
            const appUrl = \`androidbroadcaster://oauth/callback?code=\${code}&state=\${state || ''}\`;
            
            // Attempt to open the app
            window.location.href = appUrl;
            
            // Show fallback after a delay
            setTimeout(() => {
                loadingEl.style.display = 'none';
                openAppEl.style.display = 'inline-block';
                openAppEl.onclick = () => {
                    window.location.href = appUrl;
                };
            }, 2000);
        } else {
            statusEl.textContent = 'No authentication code received';
            loadingEl.style.display = 'none';
            openAppEl.style.display = 'inline-block';
            openAppEl.textContent = 'Try Again';
            openAppEl.onclick = () => window.location.href = '/auth/login';
        }
    </script>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
        return;
      }
    
  // Pre-setup: v2 bootstrap — serve /setup and assets; no legacy Discord session gate.
  if (!isSetupComplete()) {
    if (!requireSetupOrAllow(pathname)) {
      const isStaticAsset = pathname.match(/\.(js|css|png|webp|ico|svg|woff2?|woff|ttf|map)$/i);
      if (!pathname.startsWith("/internal/") && !isStaticAsset) {
        res.writeHead(302, { Location: "/setup" });
        res.end();
        return;
      }
    }
  }

  // OLD CODE - KEEP UNTIL CONFIRMED WORKING: legacy Discord auth gate blocked /setup before v2 bootstrap
  // if (!isSetupComplete() && !req.url.startsWith('/auth')) {
  //   const session = getDiscordSession(req);
  //   if (!session) { res.writeHead(302, { Location: '/auth/login' }); res.end(); return; }
  //   if (forceJoinDebug && await isUserAdmin(session.user?.id)) {
  //     const jrPath = path.join(STATIC_DIR, 'join-required.html');
  //     if (fs.existsSync(jrPath)) {
  //       res.writeHead(200, { 'Content-Type': 'text/html' });
  //       fs.createReadStream(jrPath).pipe(res);
  //     } else {
  //       serveJoinRequired(res, session?.user?.username, { showReturnButton: true });
  //     }
  //       return;
  //     }
  // }
  // In dev, don't serve the stale frontend/dist build from the API port.
  if (RADIO_DEV && req.method === "GET") {
    const uiPath = pathname;
    const backendOnly =
      uiPath.startsWith("/api/") ||
      uiPath.startsWith("/auth/") ||
      uiPath.startsWith("/internal/") ||
      uiPath.startsWith("/assets/");
    if (!backendOnly) {
      res.writeHead(302, { Location: `${DEV_UI_ORIGIN}${req.url}` });
      res.end();
      return;
    }
  }
  const compressibleStaticExts = new Set([".html", ".js", ".css", ".svg", ".json"]);
  const compressedFileStream = (acceptEncoding, ext) => {
    if (!compressibleStaticExts.has(ext)) return null;
    if (/\bbr\b/.test(acceptEncoding)) return { encoding: "br", stream: zlib.createBrotliCompress() };
    if (/\bgzip\b/.test(acceptEncoding)) return { encoding: "gzip", stream: zlib.createGzip() };
    return null;
  };

  // Serve files
  const serveFile = (p) => {
    if (!fs.existsSync(p)) return false;
    const ext = path.extname(p).toLowerCase();
    const headers = staticFileHeaders(ext);
    if (ext === ".html") {
      headers["Permissions-Policy"] = 'keyboard-map=(self "https://challenges.cloudflare.com")';
    }
    const compressed = compressedFileStream(String(req.headers["accept-encoding"] || ""), ext);
    if (compressed) {
      headers["Content-Encoding"] = compressed.encoding;
      headers["Vary"] = "Accept-Encoding";
    }
    res.writeHead(200, headers);
    const fileStream = fs.createReadStream(p);
    if (compressed) {
      fileStream.pipe(compressed.stream).pipe(res);
    } else {
      fileStream.pipe(res);
    }
    return true;
  };

  // Try to serve from React build directory first
  let filePath;
  if (req.url === "/setup" || req.url === "/setup/") {
    filePath = path.join(STATIC_DIR, "index.html");
    if (serveFile(filePath)) return;
  } else if (req.url === "/broadcaster" || req.url === "/broadcaster/") {
    filePath = path.join(STATIC_DIR, "index.html");
    if (serveFile(filePath)) return;
  } else if (req.url.startsWith("/listen/")) {
    filePath = path.join(STATIC_DIR, "index.html");
    if (serveFile(filePath)) return;
  } else if (req.url === "/" || req.url === "/index.html") {
    filePath = path.join(STATIC_DIR, "index.html");
    if (serveFile(filePath)) return;
  } else if (req.url === "/join-required" || req.url === "/join-required.html") {
    filePath = path.join(STATIC_DIR, "join-required.html");
    // Inject username if provided via query param for nicer greeting
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const name = url.searchParams.get('name') || '';
        const hydrated = raw.replace('</head>', name ? `<script>window.__JOIN_NAME__=${JSON.stringify(name)}</script></head>` : '</head>');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(hydrated);
        return;
      } catch {}
    }
    if (serveFile(filePath)) return;
  } else if (req.url.startsWith("/assets/")) {
    filePath = safeResolveUnderRoot(STATIC_DIR, req.url);
    if (filePath && serveFile(filePath)) return;
      } else {
    // Attempt direct file mapping in STATIC_DIR (e.g., /profile.webp)
    filePath = safeResolveUnderRoot(STATIC_DIR, req.url);
    if (filePath && serveFile(filePath)) return;
  }

  // Fallback: serve legacy root files (for backwards compatibility)
  if (req.url === "/" || req.url === "/index.html") {
    if (serveFile(path.resolve("./index.html"))) return;
  } else if (req.url.startsWith("/assets/")) {
    const assetRel = req.url.replace(/^\/assets\//, "");
    const legacyAsset = safeResolveUnderRoot(path.resolve("./assets"), assetRel);
    if (legacyAsset && serveFile(legacyAsset)) return;
  } else if (req.url === "/profile.webp") {
    if (serveFile(path.resolve("./profile.webp"))) return;
  }

  // SPA fallback to index.html if file not found (supports client-side routing)
  if (serveFile(path.join(STATIC_DIR, "index.html"))) return;
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}).listen(WEB_PORT, "0.0.0.0", () => {
  syncInternalSongMirror();
  startMetadataPolling();
  console.log(`🌐 Combined web server running at http://0.0.0.0:${WEB_PORT}`);
  if (RADIO_DEV) {
    console.log(`🧪 Dev UI redirect: browser pages on :${WEB_PORT} → ${DEV_UI_ORIGIN}`);
  }
  console.log(`📡 API endpoints: /api/broadcast-status, /api/lastfm, /api/messages, /api/search, /api/requests`);
  console.log(`🖼️ Cover art: /art/track (SVG)`);
  console.log(`📄 Static files: /, /index.html, /assets/*, /profile.webp`);
});

// WebSocket relay server
const relayWSS = new WebSocketServer({
  port: config.server.wsPort,
  host: "0.0.0.0",
  // Enable permessage-deflate (max compression; accepts higher CPU to reduce upstream bytes)
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 64 * 1024,
      memLevel: 9,
      level: 9,
    },
    zlibInflateOptions: {
      chunkSize: 64 * 1024,
    },
    // Allow context takeover (better ratio across messages at higher memory per connection)
    clientNoContextTakeover: false,
    serverNoContextTakeover: false,
    serverMaxWindowBits: 15,
    concurrencyLimit: 20,
    threshold: 0 // try to compress all frames
  },
  // Disable token subprotocol entirely; always use query token on 'connection'
  handleProtocols: (protocols, request) => {
    try {
      const hostProto = protocols.find(p => p === 'host-ws');
      return hostProto || undefined;
    } catch { return undefined; }
  }
});
console.log(`🛰️ Browser relay running on ws://0.0.0.0:${config.server.wsPort} (proxy maps wss://.../relay)`);
let hostRelayConnections = 0; // number of authorized host-role relay connections
// Track all authorized WS connections (wsConnections declared above with broadcastStatus)

function resolveWsIdForUser(userId, { preferActive = false, broadcastName = null } = {}) {
  const id = String(userId);
  const name = String(broadcastName || "").trim();
  const nameLower = name.toLowerCase();

  const matchesUser = (info) => String(info.userId) === id;
  const matchesBroadcastName = (info) => {
    if (!name) return true;
    const wsName = String(info.broadcastName || info.displayName || "").trim();
    return wsName.toLowerCase() === nameLower;
  };

  if (name) {
    for (const [wsId, info] of wsConnections.entries()) {
      if (matchesUser(info) && matchesBroadcastName(info)) return wsId;
    }
    if (preferActive && activeWsId) {
      const active = wsConnections.get(activeWsId);
      if (active && matchesUser(active)) return activeWsId;
    }
  } else if (preferActive && activeWsId) {
    const active = wsConnections.get(activeWsId);
    if (active && matchesUser(active)) return activeWsId;
  }

  for (const [wsId, info] of wsConnections.entries()) {
    if (matchesUser(info)) return wsId;
  }
  return null;
}

// User tracking system for stage management
function getMaxStageUsers() {
  return getLimitsSettings().maxStageUsers;
}
const USER_TRACKING_FILE = path.join(STORAGE_DIR, 'user_tracking.json');

// Load user tracking data
let userTracking = {};
try {
  if (fs.existsSync(USER_TRACKING_FILE)) {
    const data = fs.readFileSync(USER_TRACKING_FILE, 'utf8');
    userTracking = JSON.parse(data);
  }
} catch (err) {
  console.log("Failed to load user tracking data:", err.message);
  userTracking = {};
}

// Save user tracking data to file
function saveUserTracking() {
  try {
    fs.writeFileSync(USER_TRACKING_FILE, JSON.stringify(userTracking, null, 2));
  } catch (err) {
    console.log("Failed to save user tracking data:", err.message);
  }
}

// Update user's last connection timestamp
function updateUserLastSeen(userId, isConnected = true, displayName = null) {
  const now = new Date().toISOString();
  if (!userTracking[userId]) {
    userTracking[userId] = { lastConnectedAt: null, displayName: null };
  }
  if (isConnected) {
    userTracking[userId].lastConnectedAt = now;
  }
  if (displayName) {
    userTracking[userId].displayName = displayName;
  }
  saveUserTracking();
}

setPartyEffectsContext({
  getBroadcastStatus: () => broadcastStatus,
  getUserRoleInfo: getUserRoleInfoV2,
});

setLevelingContext({
  getBroadcastStatus: () => broadcastStatus,
  getCurrentSong: () => ({ title: currentSong, artist: currentArtist }),
  isMetadataDisabled: () => streamMetadataDisabled,
  getAlbumArtForTrack: (title, artist) => {
    const trackTitle = String(title || "").trim();
    const trackArtist = String(artist || "").trim();
    if (!trackTitle || !trackArtist) return null;
    const cacheKey = `${trackTitle}|||${trackArtist}`;
    const cached = albumArtCache.get(cacheKey);
    if (cached?.url && (Date.now() - cached.timestamp) < ALBUM_ART_CACHE_TTL_MS) {
      return cached.url;
    }
    const stable = globalThis.__metaState?.lastStabilized;
    if (
      stable &&
      stable.title === trackTitle &&
      stable.artist === trackArtist &&
      stable.albumArt
    ) {
      return stable.albumArt;
    }
    return null;
  },
});

setBroadcastSessionLogContext({
  getBroadcastStatus: () => broadcastStatus,
});

setStageShareContext({
  getBroadcastState: () => ({
    broadcasterUserId: broadcastStatus.broadcasterUserId,
    activeWsId,
  }),
});

setGuestRelayDisplaySync((guestId, profile) => {
  const userId = `guest:${guestId}`;
  const label = profile?.displayName ?? String(profile || "Guest");
  for (const info of wsConnections.values()) {
    if (String(info.userId) === userId) {
      info.displayName = label;
      if (profile && typeof profile === "object") {
        info.guestAvatarVariant = profile.avatarVariant ?? 0;
        info.guestCoverIcon = profile.coverIcon ?? 0;
      }
    }
  }
  updateUserLastSeen(userId, true, label);
  if (String(broadcastStatus.broadcasterUserId) === userId) {
    broadcastStatus.broadcasterDisplayName = label;
    publishBroadcastStatusChanged("broadcaster-profile");
  }
});

setOnRevokeShareLink((shareLinkId) => {
  purgeGuestDisplayNamesForShareLink(shareLinkId);
  purgeGuestReadStateForShareLink(shareLinkId);
});

// Populate user tracking with all host role users (up to 8)
async function populateUserTrackingWithHosts() {
  // OLD CODE - KEEP UNTIL CONFIRMED WORKING
  /*
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.log("Guild not available for user tracking population");
      return;
    }
    
    const members = await guild.members.fetch();
    const hostUsers = [];
    
    members.forEach(m => {
      try {
        // Exclude bots even if they have host roles
        const isBot = !!m.user?.bot;
        if (!isBot && (m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.STAGE_PASS_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.MODERATOR_ROLE_ID))) {
          hostUsers.push({
            userId: m.id,
            displayName: (m.displayName || m.user?.username || m.user?.tag || String(m.id)),
          });
        }
      } catch {}
    });
    
    // Sort alphabetically by displayName for consistent ordering when no connection history
    hostUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    
    // Limit to 7 users and ensure they're in userTracking
    const limitedHostUsers = hostUsers.slice(0, getMaxStageUsers());
    let hasUpdates = false;
    
    for (const host of limitedHostUsers) {
      if (!userTracking[host.userId]) {
        userTracking[host.userId] = { 
          lastConnectedAt: null, // null means never connected
          displayName: host.displayName 
        };
        hasUpdates = true;
      } else if (!userTracking[host.userId].displayName) {
        // Update displayName if missing
        userTracking[host.userId].displayName = host.displayName;
        hasUpdates = true;
      }
    }
    
    if (hasUpdates) {
      saveUserTracking();
      console.log(`📝 Populated user tracking with ${limitedHostUsers.length} host users`);
    }
  } catch (err) {
    console.log("Failed to populate user tracking with host users:", err.message);
  }
  */

  // NEW CODE - TESTING: keep userTracking fresh based on a full guild scan,
  // but leave /api/host-members ordering to getTop7UsersForStage.
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.log("Guild not available for user tracking population");
      return;
    }
    
    const members = await guild.members.fetch();
    const hostUsers = [];
    
    members.forEach(m => {
      try {
        // Exclude bots even if they have host roles
        const isBot = !!m.user?.bot;
        if (!isBot && (m.roles?.cache?.has(ROLE_CONFIG.ADMIN_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.STAGE_PASS_ROLE_ID) || m.roles?.cache?.has(ROLE_CONFIG.MODERATOR_ROLE_ID))) {
          hostUsers.push({
            userId: m.id,
            displayName: (m.displayName || m.user?.username || m.user?.tag || String(m.id)),
          });
        }
      } catch {}
    });
    
    // Sort alphabetically by displayName for consistent ordering when no connection history
    hostUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    
    // Limit to 7 users and ensure they're in userTracking
    const limitedHostUsers = hostUsers.slice(0, getMaxStageUsers());
    let hasUpdates = false;
    
    for (const host of limitedHostUsers) {
      if (!userTracking[host.userId]) {
        userTracking[host.userId] = { 
          lastConnectedAt: null, // null means never connected
          displayName: host.displayName 
        };
        hasUpdates = true;
      } else if (!userTracking[host.userId].displayName) {
        // Update displayName if missing
        userTracking[host.userId].displayName = host.displayName;
        hasUpdates = true;
      }
    }
    
    if (hasUpdates) {
      saveUserTracking();
      console.log(`📝 Populated user tracking with ${limitedHostUsers.length} host users`);
    }
  } catch (err) {
    console.log("Failed to populate user tracking with host users:", err.message);
  }
}

// Get top 7 most recently connected users for stage display
function getTop7UsersForStage() {
  try {
    // Get all users with their last connection times
    const allUsers = [];
    
    // Add active WebSocket connections
    for (const [wsId, info] of wsConnections.entries()) {
      allUsers.push({
        userId: info.userId,
        displayName: info.displayName,
        lastConnectedAt: info.connectedAt,
        isConnected: true,
        wsId: wsId,
        isActive: wsId === activeWsId
      });
    }
    
    // Add ghost users (hosts who aren't currently connected)
    const connectedUserIds = new Set(Array.from(wsConnections.values()).map(info => info.userId));
    
    for (const [userId, tracking] of Object.entries(userTracking)) {
      if (!connectedUserIds.has(userId)) {
        // This is a ghost user - someone who has connected before OR never connected but has host role
        const lastConnectedAt = tracking.lastConnectedAt || '1900-01-01T00:00:00.000Z'; // Use very old date for never connected users
        
        allUsers.push({
          userId: userId,
          displayName: tracking.displayName,
          lastConnectedAt: lastConnectedAt,
          isConnected: false,
          wsId: null,
          isActive: false
        });
      }
    }
    
    // Sort by most recent connection first (newest at top)
    // Users who have never connected (1900-01-01) should be sorted alphabetically at the end
    allUsers.sort((a, b) => {
      const timeA = new Date(a.lastConnectedAt).getTime();
      const timeB = new Date(b.lastConnectedAt).getTime();
      
      // If both users have never connected, sort alphabetically by displayName
      const neverConnectedA = timeA === new Date('1900-01-01T00:00:00.000Z').getTime();
      const neverConnectedB = timeB === new Date('1900-01-01T00:00:00.000Z').getTime();
      
      if (neverConnectedA && neverConnectedB) {
        return (a.displayName || '').localeCompare(b.displayName || '');
      }
      
      // If one has never connected, put them at the end
      if (neverConnectedA && !neverConnectedB) return 1;
      if (!neverConnectedA && neverConnectedB) return -1;
      
      // Both have connection history, sort by most recent first
      return timeB - timeA; // Descending order (newest first)
    });
    
    // Return only top 7
    return allUsers.slice(0, getMaxStageUsers());
  } catch (err) {
    console.log("Error getting top 7 users for stage:", err.message);
    return [];
  }
}

// Active pipeline (single ffmpeg), restarted on switch
let ffmpegProc = null; // publisher (single encoder to Icecast)
let pipelineDecided = false;
let headBuffers = [];
let headLen = 0;
const HEAD_BUFFER_TARGET = 2048; // bytes to accumulate before (re)starting pipeline
// NEW CODE - TESTING: Track current format and ensure PCM alignment
let currentIsWebM = null; // true for WebM/Opus, false for raw PCM, null when undecided
let pcmWriteRemainder = Buffer.alloc(0);

// NEW ARCHITECTURE: per-WS decoders → single publisher encoder
const wsDecoders = new Map(); // wsId -> { proc, stdin, stdout }
const railDecoderListeners = new Map(); // wsId -> { source, listener }
let currentDecoderSource = null; // Readable (live Discord path)
let currentDecoderListener = null; // function (live Discord path)
let publisherLastWriteTs = 0;
let publisherKeepalive = null;
let publisherBackpressure = false;
// NEW CODE - TESTING: paced PCM writer to smooth bursts and add small buffer
let pcmPacerInterval = null;
const PCM_FRAME_BYTES = 3840; // 20ms @ 48kHz stereo s16le
let liveAudioSettings = getAudioSettings();
let MAX_BUFFER_MS = liveAudioSettings.pcmMaxBufferMs;
let MAX_BUFFER_BYTES = PCM_FRAME_BYTES * Math.max(1, Math.floor(MAX_BUFFER_MS / 20));
// RESEARCH-BASED: Adaptive jitter buffer with initial buffering
let adaptiveBufferThreshold = MAX_BUFFER_BYTES;
const MIN_ADAPTIVE_BUFFER = PCM_FRAME_BYTES * 50; // Increased to 1000ms minimum for better stability
let MAX_ADAPTIVE_BUFFER = PCM_FRAME_BYTES * Math.max(150, Math.floor(MAX_BUFFER_MS / 20) * 2); // Up to double the base buffer size
// RESEARCH-BASED: Initial buffer requirement before starting playback (optimized based on logs)
const INITIAL_BUFFER_REQUIREMENT = PCM_FRAME_BYTES * 3; // 60ms initial buffer (reduced from 100ms for lower latency)
let initialBufferFilled = false;
// Debug-throttle timestamps
let lastKeepaliveLogTs = 0;
let lastPacerUnderRunLogTs = 0;
let lastTrimLogTs = 0;
let lastBackpressureLogTs = 0;
let lastBackpressureRecoverLogTs = 0;
let lastDrainTs = 0;
let lastAdaptiveReduceTs = 0; // Throttle adaptive threshold reduction
let pacerUnderrunCount = 0;
let trimCount = 0;
let keepaliveWriteCount = 0;
let backpressureCount = 0;
// Silence detection for audio resumption handling
let isInSilence = false;
let lastAudioActivityTs = Date.now();
let silenceStartTs = 0;
let lastAudioResumeRefreshTs = 0;
let consecutiveSilentChunks = 0;
let consecutiveAudioChunks = 0;
function getSilenceDebounceChunks() {
  return liveAudioSettings.silenceDebounceChunks;
}
function getAudioDebounceChunks() {
  return liveAudioSettings.audioDebounceChunks;
}
function applyLiveAudioSettings(audio) {
  liveAudioSettings = audio;
  MAX_BUFFER_MS = audio.pcmMaxBufferMs;
  MAX_BUFFER_BYTES = PCM_FRAME_BYTES * Math.max(1, Math.floor(MAX_BUFFER_MS / 20));
  MAX_ADAPTIVE_BUFFER = PCM_FRAME_BYTES * Math.max(150, Math.floor(MAX_BUFFER_MS / 20) * 2);
  adaptiveBufferThreshold = MAX_BUFFER_BYTES;
  if (audioWorker?.postMessage) {
    audioWorker.postMessage({ type: "update_config", config: audio });
  }
}
// Industry-standard buffer management uses smart frame skipping
// NEW CODE - TESTING: rate-limit noisy per-WS decoder backpressure logs
const lastDecoderBpLogTs = new Map(); // wsId -> ts
const wsLastMessageTs = new Map(); // wsId -> last message ts
let metricsInterval = null;
let activeWsBytesIn = 0;
let lastMetricsTs = Date.now();

// RESEARCH-BASED: Audio processing worker thread for CPU optimization
let audioWorker = null;
let audioWorkerReady = false;
let audioDataSentCount = 0;
// REMOVED: icecastMetaInitTimer variables - no longer needed

// REMOVED: scheduleDefaultIcecastMetadataRetries - no longer needed
// Static metadata is embedded in the stream at publisher start

function initializeAudioWorker() {
  if (audioWorker) return;
  
  try {
    const workerPath = './audio-processor-worker.js';
    audioWorker = new Worker(workerPath, {
      workerData: {
        workerId: 'audio-main',
        PCM_MAX_BUFFER_MS: liveAudioSettings.pcmMaxBufferMs,
        PCM_MIN_BUFFER_MS: liveAudioSettings.pcmMinBufferMs,
        PCM_INITIAL_BUFFER_MS: 0,
        PCM_UNDERRUN_HOLD_MS: 0,
      }
    });
    
    audioWorker.on('message', (message) => {
      switch (message.type) {
        case 'started':
          audioWorkerReady = true;
          audioDataSentCount = 0; // Reset counter
          // file-only; avoid console noise
          try { debugLog('worker_started', {}); } catch {}
          // Static metadata is embedded in stream; no API calls needed
          break;
          
        case 'stopped':
          audioWorkerReady = false;
          try { debugLog('worker_stopped', {}); } catch {}
          break;
          
        case 'metrics':
          // Forward metrics for logging
          try { debugLog('worker_metrics', message.data); } catch {}
          break;
          
        case 'pcm_frame': {
          try {
            const buf = Buffer.isBuffer(message.data) ? message.data : Buffer.from(message.data);
            publishPcmFrame(buf, message.railId);
          } catch {}
          break;
        }
        case 'worker_log': {
          try {
            // Only write to file; avoid console noise
            debugLog(message.event || 'worker_log', message.data || {});
          } catch {}
          break;
        }
      }
    });
    
    audioWorker.on('error', (error) => {
      console.error('❌ Audio worker error:', error);
      audioWorkerReady = false;
    });
    
    audioWorker.on('exit', (code) => {
      if (code !== 0) {
        console.log(`⚠️ Audio worker exited with code ${code}`);
      }
      audioWorkerReady = false;
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize audio worker:', error.message);
  }
}

function sendAudioDataToWorker(pcmData, railId) {
  if (!audioWorker || !Buffer.isBuffer(pcmData) || pcmData.length === 0 || !railId) return;
  if (!audioWorkerReady) {
    ensurePublisher();
    if (!audioWorkerReady) return;
  }
  try {
    audioWorker.postMessage({
      type: 'pcm_data',
      railId,
      data: Buffer.from(pcmData),
    });
    audioDataSentCount++;
  } catch (error) {
    console.error('❌ Failed to send data to audio worker:', error.message);
  }
}

function startAudioWorker() {
  if (audioWorker && !audioWorkerReady) {
    try {
      audioWorker.postMessage({ type: 'start' });
    } catch (error) {
      console.error('❌ Failed to start audio worker:', error.message);
    }
  }
}

function stopAudioWorker() {
  if (audioWorker && audioWorkerReady) {
    try {
      audioWorker.postMessage({ type: 'stop' });
    } catch (error) {
      console.error('❌ Failed to stop audio worker:', error.message);
    }
  }
}

function resetAudioWorkerBuffer() {
  // Per-rail workers no longer reset on switch — each rail stays warm independently.
}

function ensureBroadcasterRail(railId) {
  if (!railId) return;
  registerBroadcasterRail(railId);
  if (!audioWorker) {
    initializeAudioWorker();
  }
  if (audioWorker) {
    startAudioWorker();
    try {
      audioWorker.postMessage({ type: 'ensure_rail', railId });
    } catch {}
  }
}

function removeBroadcasterRail(railId) {
  if (!railId) return;
  unregisterBroadcasterRail(railId);
  if (audioWorker) {
    try {
      audioWorker.postMessage({ type: 'remove_rail', railId });
    } catch {}
  }
  const attached = railDecoderListeners.get(railId);
  if (attached) {
    try {
      attached.source.off('data', attached.listener);
    } catch {}
    railDecoderListeners.delete(railId);
  }
}

function switchLiveBroadcaster(wsId) {
  if (!wsId) return;
  ensureBroadcasterRail(wsId);
  setLiveRail(wsId);
  try { debugLog('live_rail_switched', { wsId }); } catch {}
}

// Silence detection function for PCM data
function isPCMSilence(pcmBuffer, threshold = liveAudioSettings.silenceThreshold) {
  try {
    if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length < 4) return false;
    
    // For 16-bit signed PCM, check if most samples are near zero
    let sum = 0;
    let count = 0;
    for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
      // Read 16-bit signed little-endian sample
      const sample = pcmBuffer.readInt16LE(i);
      sum += Math.abs(sample);
      count++;
    }
    
    const average = sum / count;
    // Normalize by 16-bit range (32768)
    const normalizedLevel = average / 32768;
    return normalizedLevel < threshold;
  } catch {
    return false;
  }
}

// PCM relay → TCP :4100 for relay-bot.js (Discord voice bot)
let pcmRelayForwardedBytes = 0;
let pcmRelayForwardLogTs = 0;
const pcmRelayPendingBySocket = new WeakMap();
const PCM_RELAY_SOCKET_MAX_PENDING = 500;

function flushPcmRelaySocket(sock) {
  const pending = pcmRelayPendingBySocket.get(sock);
  if (!pending?.length || !sock || sock.destroyed) return;

  while (pending.length > 0) {
    const frame = pending[0];
    try {
      const ok = sock.write(frame);
      pcmRelayForwardedBytes += frame.length;
      pending.shift();
      if (!ok) {
        sock.once("drain", () => flushPcmRelaySocket(sock));
        break;
      }
    } catch (err) {
      console.error("❌ PCM relay write error:", err.message);
      pcmRelayPendingBySocket.delete(sock);
      try { sock.destroy(); } catch {}
      pcmRelayClients.delete(sock);
      break;
    }
  }

  if (!pending.length) pcmRelayPendingBySocket.delete(sock);
}

function forwardPcmRelayPacket(packet) {
  if (!Buffer.isBuffer(packet) || packet.length === 0 || !pcmRelayClients.size) return;

  for (const sock of Array.from(pcmRelayClients)) {
    if (!sock || sock.destroyed) {
      pcmRelayClients.delete(sock);
      continue;
    }

    const pending = pcmRelayPendingBySocket.get(sock);
    if (pending?.length) {
      if (pending.length >= PCM_RELAY_SOCKET_MAX_PENDING) {
        pending.shift();
      }
      pending.push(packet);
      flushPcmRelaySocket(sock);
      continue;
    }

    try {
      const ok = sock.write(packet);
      if (!ok) {
        const queue = [packet];
        pcmRelayPendingBySocket.set(sock, queue);
        sock.once("drain", () => flushPcmRelaySocket(sock));
      } else {
        pcmRelayForwardedBytes += packet.length;
      }
    } catch (err) {
      console.error("❌ PCM relay write error:", err.message);
      pcmRelayClients.delete(sock);
      try { sock.destroy(); } catch {}
    }
  }

  if (pcmRelayForwardedBytes > 0 && Date.now() - pcmRelayForwardLogTs > 15000) {
    pcmRelayForwardLogTs = Date.now();
    console.log(`🔊 PCM relay forwarded ${pcmRelayForwardedBytes} bytes to ${pcmRelayClients.size} client(s)`);
    pcmRelayForwardedBytes = 0;
  }
}

function forwardTaggedPcmToRelay(railId, frame) {
  if (!Buffer.isBuffer(frame) || frame.length !== RELAY_PCM_FRAME_BYTES) return;
  try {
    forwardPcmRelayPacket(encodePcmRelayFrame(railId, frame));
  } catch (err) {
    console.error("❌ PCM relay encode error:", err?.message || err);
  }
}

function forwardLiveRailToRelay(liveRailId) {
  try {
    forwardPcmRelayPacket(encodeLiveRailMessage(liveRailId));
  } catch (err) {
    console.error("❌ PCM relay live-rail encode error:", err?.message || err);
  }
}

function sendLiveRailSnapshotToRelayClient(sock) {
  if (!sock || sock.destroyed) return;
  try {
    const packet = encodeLiveRailMessage(getLiveRailId());
    sock.write(packet);
  } catch (err) {
    console.error("❌ PCM relay live-rail snapshot error:", err?.message || err);
  }
}

/** @deprecated raw PCM relay — use forwardTaggedPcmToRelay */
function forwardPcmFrameToRelay(frame) {
  if (!Buffer.isBuffer(frame) || frame.length !== PCM_FRAME_BYTES || !pcmRelayClients.size) return;

  const outbound = Buffer.from(frame);

  for (const sock of Array.from(pcmRelayClients)) {
    if (!sock || sock.destroyed) {
      pcmRelayClients.delete(sock);
      continue;
    }

    const pending = pcmRelayPendingBySocket.get(sock);
    if (pending?.length) {
      if (pending.length >= PCM_RELAY_SOCKET_MAX_PENDING) {
        pending.shift();
      }
      pending.push(outbound);
      flushPcmRelaySocket(sock);
      continue;
    }

    try {
      const ok = sock.write(outbound);
      if (!ok) {
        const queue = [outbound];
        pcmRelayPendingBySocket.set(sock, queue);
        sock.once("drain", () => flushPcmRelaySocket(sock));
      } else {
        pcmRelayForwardedBytes += outbound.length;
      }
    } catch (err) {
      console.error("❌ PCM relay write error:", err.message);
      try { sock.destroy(); } catch {}
      pcmRelayClients.delete(sock);
    }
  }

  const now = Date.now();
  if (pcmRelayForwardedBytes > 0 && now - pcmRelayForwardLogTs > 15000) {
    pcmRelayForwardLogTs = now;
    console.log(`🔊 PCM relay forwarded ${pcmRelayForwardedBytes} bytes to ${pcmRelayClients.size} client(s)`);
    pcmRelayForwardedBytes = 0;
  }
}

function forwardPcmToRelayClients(chunk) {
  if (!chunk || !pcmRelayClients.size) return;

  let remainder = chunk;
  while (remainder.length >= PCM_FRAME_BYTES) {
    const frame = remainder.subarray(0, PCM_FRAME_BYTES);
    remainder = remainder.subarray(PCM_FRAME_BYTES);
    forwardPcmFrameToRelay(frame);
  }
}

// PCM relay server (for external relay-bot.js processes)
const PCM_RELAY_PORT = config.server.pcmRelayPort || 4100;
const pcmRelayClients = new Set(); // Set<net.Socket>

function startPcmRelayServer() {
  try {
    const server = net.createServer((socket) => {
      try { socket.setNoDelay(true); } catch {}
      console.log("🔊 PCM relay client connected");
      pcmRelayClients.add(socket);
      sendLiveRailSnapshotToRelayClient(socket);

      socket.on("close", () => {
        pcmRelayClients.delete(socket);
        console.log("🔊 PCM relay client disconnected");
      });

      socket.on("error", (err) => {
        console.error("❌ PCM relay client error:", err.message);
        pcmRelayClients.delete(socket);
        try { socket.destroy(); } catch {}
      });
    });

    server.listen(PCM_RELAY_PORT, "0.0.0.0", () => {
      console.log(`🔊 PCM relay server listening on 0.0.0.0:${PCM_RELAY_PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start PCM relay server:", err.message);
  }
}

// Ensure PCM relay server starts once at bootstrap
try { startPcmRelayServer(); } catch {}

wirePcmRelayOutputs(
  (railId, frame) => forwardTaggedPcmToRelay(railId, frame),
  (liveRailId) => forwardLiveRailToRelay(liveRailId),
);
forwardLiveRailToRelay(getLiveRailId());
console.log("🔊 Broadcast hub: worker PCM → tagged relay (all rails) + per-rail MP3 (delay post-encode)");

function ensurePublisher() {
  // RESEARCH-BASED: Use worker thread for audio processing instead of direct FFmpeg
  // Ensure the worker is started; do not return early when not ready
  
  try {
    // Initialize worker if not already done
    if (!audioWorker) {
      initializeAudioWorker();
    }
    
    // Start the worker (it will handle FFmpeg internally)
    if (audioWorker && !audioWorkerReady) {
      startAudioWorker();
    }
    
    // Keep a dummy reference for compatibility
    ffmpegProc = { dummy: true };
  } catch (e) {
    console.error('❌ Failed to start publisher ffmpeg:', e.message);
  }
}

function resetLiveSilenceState() {
  isInSilence = false;
  lastAudioActivityTs = Date.now();
  silenceStartTs = 0;
  consecutiveSilentChunks = 0;
  consecutiveAudioChunks = 0;
}

function attachRailPcmFeed(wsId, outStream) {
  try {
    if (!outStream || !wsId) return;
    if (railDecoderListeners.has(wsId)) return;
    ensurePublisher();
    ensureBroadcasterRail(wsId);

    const listener = (chunk) => {
      try {
        if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;

        const connection = wsConnections.get(wsId);
        const payload = connection?.contentPolicyMuted ? Buffer.alloc(chunk.length) : chunk;
        sendAudioDataToWorker(payload, wsId);
      } catch {}
    };

    outStream.on('data', listener);
    railDecoderListeners.set(wsId, { source: outStream, listener });

    if (wsId === activeWsId) {
      currentDecoderSource = outStream;
      currentDecoderListener = listener;
    }

    if (!audioWorker) {
      initializeAudioWorker();
    }
    if (audioWorker) {
      startAudioWorker();
    }
    try { debugLog('rail_pcm_attached', { wsId }); } catch {}
  } catch {}
}

function attachActiveDecoderFromId(wsId) {
  try {
    const st = wsDecoders.get(wsId);
    if (st && st.stdout) attachRailPcmFeed(wsId, st.stdout);
  } catch {}
}

function stopFfmpeg(reason = 'switch') {
  try {
    // Keep the audio worker (publisher) running to maintain continuous stream (silence when idle)
    // Do NOT stop the worker here; only detach decoder and reset buffer states
    
    // Clean up legacy FFmpeg if it exists
    if (ffmpegProc && !ffmpegProc.dummy) {
      try { ffmpegProc.stdin.end(); } catch {}
      try { ffmpegProc.kill(); } catch {}
    }
    
    // Detach live Discord pointer only — per-rail listeners stay attached for other broadcasters
    currentDecoderSource = null;
    currentDecoderListener = null;
    resetLiveSilenceState();
  } catch {}
  
  ffmpegProc = null;
  pipelineDecided = false;
  headBuffers = [];
  headLen = 0;
  currentIsWebM = null;
  pcmWriteRemainder = Buffer.alloc(0);
  publisherBackpressure = false;
  // RESEARCH-BASED: Reset all buffer state when pipeline stops
  adaptiveBufferThreshold = MAX_BUFFER_BYTES;
  lastAdaptiveReduceTs = 0;
  initialBufferFilled = false;
  try { if (pcmPacerInterval) { clearInterval(pcmPacerInterval); pcmPacerInterval = null; } } catch {}
  try { if (publisherKeepalive) { clearInterval(publisherKeepalive); publisherKeepalive = null; } } catch {}
  console.log(`🧯 Pipeline stopped (${reason})`);
  try { debugLog('pipeline_stop', { reason }); } catch {}
}

relayWSS.on("connection", (ws, req) => {
  try { debugLog('ws_connection_start', { remote: req.socket?.remoteAddress || null, url: req.url }); } catch {}
  
  // Parse broadcast name early, before user registration
  try {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const bcastName = url.searchParams.get('broadcast_name');
    if (typeof bcastName === 'string' && bcastName.length > 0) {
      try {
        // Try to decode as base64 first, fallback to regular URI decoding
        let decodedName;
        try {
          // Attempt base64 decode first (new format)
          const decodedBytes = Buffer.from(bcastName, 'base64');
          decodedName = decodeURIComponent(decodedBytes.toString('utf8'));
        } catch {
          // Fallback to old format (URI decoding)
          decodedName = decodeURIComponent(bcastName);
        }
        ws._broadcastName = decodedName.slice(0, 64);
      } catch {
        // Final fallback - use raw value
        ws._broadcastName = bcastName.slice(0, 64);
      }
    }
  } catch (e) { 
    // Ignore parsing errors
  }
  
  // Fallback: validate token from query string if not provided in subprotocols
  try {
      const url = new URL(req.url, `ws://${req.headers.host}`);
      const t = url.searchParams.get('token');
      const valid = verifyWsToken(t);
      if (!valid) { try { ws.close(1008, 'Unauthorized'); } catch {} return; }
    // After verifying token, ensure the associated user can broadcast
    canUserBroadcast(valid.userId, valid).then(async canBroadcast => {
      if (!canBroadcast) { try { ws.close(1008, 'Forbidden'); } catch {} return; }
      
      // Check WebSocket connection limit (8 max)
      if (wsConnections.size >= getMaxStageUsers()) {
        console.log(`🚫 WS connection limit reached (${getMaxStageUsers()}), rejecting new connection from userId=${valid.userId}`);
        try { ws.close(1013, 'Connection limit reached'); } catch {}
        return;
      }
      
      ws._hostAuthorized = true;
      hostRelayConnections++;
      setBroadcastActive(hostRelayConnections > 0);
      // Register connection and set broadcaster ONLY if becoming active
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        let displayName = null;
        if (String(valid.userId).startsWith('guest:')) {
          displayName = valid.displayName || String(valid.userId).slice(6) || 'Guest';
        } else if (isSetupComplete()) {
          try {
            const { getUserById } = await import('./src/db/index.js');
            const { publicDisplayName } = await import('./src/db/userProfile.js');
            const user = getUserById(Number(valid.userId));
            displayName = publicDisplayName(user);
          } catch {}
        } else if (guild) {
          try {
            const member = await guild.members.fetch(String(valid.userId));
            displayName = member?.displayName || member?.user?.globalName || member?.user?.username || null;
          } catch {}
        }
        const wsId = valid.jti || crypto.randomBytes(8).toString('hex');
        ws._wsId = wsId;
        // Optional broadcast_name query parameter (or device label from WS token)
        let broadcastName = null;
        try {
          // Prefer name captured earlier on ws._broadcastName
          if (ws._broadcastName) {
            broadcastName = ws._broadcastName;
          } else if (valid.deviceLabel && String(valid.deviceLabel).trim()) {
            broadcastName = String(valid.deviceLabel).trim().slice(0, 64);
          } else {
            const qUrl = new URL(req.url, `ws://${req.headers.host}`);
            const bn = qUrl.searchParams.get('broadcast_name');
            if (bn) {
              try {
                // Try to decode as base64 first, fallback to regular URI decoding
                let decodedName;
                try {
                  // Attempt base64 decode first (new format)
                  const decodedBytes = Buffer.from(bn, 'base64');
                  decodedName = decodeURIComponent(decodedBytes.toString('utf8'));
                } catch {
                  // Fallback to old format (URI decoding)
                  decodedName = decodeURIComponent(bn);
                }
                broadcastName = decodedName.slice(0, 64);
              } catch {
                // Final fallback - use raw value
                broadcastName = bn.slice(0, 64);
              }
            }
          }
        } catch {}
        const userIdStr = String(valid.userId);
        let guestAvatarVariant = 0;
        let guestCoverIcon = 0;
        let relayAvatar = null;
        let relayRoleColor = null;
        let relayRoleType = userIdStr.startsWith("guest:") ? "guest" : "broadcaster";
        let relayLevel = 0;
        if (userIdStr.startsWith("guest:")) {
          const profile = guestStageProfile(userIdStr, displayName, valid.guestShareId ?? null);
          displayName = profile.displayName;
          guestAvatarVariant = profile.avatarVariant;
          guestCoverIcon = profile.coverIcon;
        } else if (isSetupComplete()) {
          try {
            const user = getUserById(Number(userIdStr));
            const presentation = publicUserPresentation(user);
            const role = await getUserRoleInfo(userIdStr);
            relayAvatar = presentation?.avatar ?? null;
            relayRoleColor = role?.roleColor ?? null;
            relayRoleType = user?.role ?? "broadcaster";
            relayLevel = presentation?.level?.level ?? 1;
          } catch {}
        }
        const relayPresenceActor = {
          actorId: userIdStr,
          displayName,
          avatar: relayAvatar,
          avatarVariant: guestAvatarVariant,
          coverIcon: guestCoverIcon,
          roleColor: userIdStr.startsWith("guest:") ? "#c4b5fd" : relayRoleColor,
          roleType: relayRoleType,
          level: relayLevel,
          isGuest: userIdStr.startsWith("guest:"),
        };

        const relayIp = clientIp(req);
        wsConnections.set(wsId, {
          ws,
          userId: userIdStr,
          displayName,
          connectedAt: new Date().toISOString(),
          broadcastName,
          guestShareId: valid.guestShareId ?? null,
          guestAvatarVariant,
          guestCoverIcon,
          presenceActor: relayPresenceActor,
          remoteAddress: relayIp,
        });

        try {
          ws.send(JSON.stringify({
            type: "relay_session",
            wsId,
            railId: wsId,
            timestamp: Date.now(),
          }));
        } catch {}
        
        // Update user tracking for stage management
        updateUserLastSeen(userIdStr, true, displayName);
        touchRelayPresence(`relay:${wsId}`, relayPresenceActor, {
          clientIp: relayIp,
        });
        if (!userIdStr.startsWith("guest:")) {
          touchUserVisit(userIdStr, relayIp, { force: true });
        }
        publishCurrentPresenceRoster();
        
        const becameActive = !activeWsId;
        // If no active WS yet, promote this connection to active and set broadcaster info
        if (becameActive) {
          activeWsId = wsId;
          broadcastStatus.broadcasterUserId = userIdStr;
          broadcastStatus.broadcasterDisplayName = displayName;
          beginFreshBroadcastSession(wsId, userIdStr);
          publishBroadcastStatusChanged("broadcaster");
          ensureBroadcasterRail(wsId);
          setLiveRail(wsId);
          try { debugLog('active_ws_set', { wsId: activeWsId, userId: broadcastStatus.broadcasterUserId }); } catch {}
          // Update Last.fm override based on active WS
          if (ws._lastfm && ws._lastfm.user && ws._lastfm.apiKey) {
            currentLastfmOverride = { user: ws._lastfm.user, apiKey: ws._lastfm.apiKey, wsId: activeWsId };
            try {
              const h = hashLastfmCred(ws._lastfm.user, ws._lastfm.apiKey);
              lastfmCredCache.set(h, { valid: true, ts: Date.now() - LASTFM_CACHE_TTL_MS - 1 });
            } catch {}
          } else {
            currentLastfmOverride = null;
          }
        }

        logRelayConnectSummary({
          remoteAddress: relayIp,
          wsId,
          userId: String(valid.userId),
          displayName,
          broadcastName,
          hasLastfm: !!(ws._lastfm?.user && ws._lastfm?.apiKey),
          becameActive,
        });
        try { debugLog('ws_registered', { wsId, userId: String(valid.userId), displayName, becameActive }); } catch {}
      } catch {}
    }).catch((e) => { try { debugLog('ws_auth_error', { message: e?.message || String(e) }); } catch {}; try { ws.close(1011, 'Error'); } catch {} });
  } catch {}
  try { debugLog('ws_handshake', { remote: req.socket.remoteAddress }); } catch {}

  // OLD CODE - KEEP UNTIL CONFIRMED WORKING
  // const ffmpeg = spawn("/usr/bin/ffmpeg", [
  //   "-f", "webm",
  //   "-i", "pipe:0",
  //   "-c:a", "libopus",
  //   "-b:a", "128k",
  //   "-content_type", "application/ogg",
  //   "-f", "ogg",
  //   `icecast://source:password@host:port/path`,
  // ]);

  // NEW CODE - TESTING: Dynamically detect input (WebM vs raw PCM)
  // Per-connection state is now global for active pipeline; per-WS will feed only if active

  // REMOVED: startFfmpegArgs and attachFfmpegHandlers functions - no longer used

  // --- 💓 Heartbeat setup ---
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const heartbeatInterval = setInterval(() => {
    if (!ws.isAlive) {
      console.log("💀 Stale WebSocket detected, terminating this WS...");
      try { ws.terminate(); } catch {}
      clearInterval(heartbeatInterval);
      return;
    }

    ws.isAlive = false;
    if (ws._hostAuthorized && ws._wsId) {
      refreshRelayPresence(ws._wsId);
    }
    try { ws.ping(); } catch {}
  }, 10000); // 10 seconds

  // --- FFmpeg event handling will be attached after ffmpeg is spawned ---

  // Capture Last.fm params from initial request URL for this connection
  try {
    // req.url may be something like "/?token=...&lastfm_user=...&lastfm_key=..."
    const url = new URL(req.url.startsWith('ws') ? req.url : `ws://${req.headers.host}${req.url}`);
    const lfUser = url.searchParams.get('lastfm_user');
    const lfKey = url.searchParams.get('lastfm_key');
    const bcastName = url.searchParams.get('broadcast_name');
    const qToken = url.searchParams.get('token');
    try { if (ws._wsId) debugLog('ws_query', { wsId: ws._wsId, tokenPresent: !!qToken, hasLastfm: !!(lfUser && lfKey) }); } catch {}
    try {
      console.log(`🔍 WS query: lastfm=${lfUser ? "yes" : "no"} broadcast_name=${bcastName ? "(present)" : "—"}`);
    } catch (e) { try { debugLog('ws_lastfm_parse_error', { message: e?.message || String(e) }); } catch {} }
    if (lfUser && lfKey) {
      const userDec = decodeURIComponent(lfUser);
      const keyDec = decodeURIComponent(lfKey);
      ws._lastfm = { user: userDec, apiKey: keyDec };
      const maskedKey = keyDec && keyDec.length > 8 ? `${keyDec.slice(0,4)}...${keyDec.slice(-4)}` : '****';
      console.log(`🎛️ Last.fm WS override: user=${userDec} key=${maskedKey}`);
      // Set current override and reset validity cache for new creds
      const h = hashLastfmCred(userDec, keyDec);
      // Only adopt immediately if this WS is the active one; otherwise wait for switch
      if (activeWsId && ws._wsId && ws._wsId === activeWsId) {
        currentLastfmOverride = { user: userDec, apiKey: keyDec, wsId: ws._wsId };
      }
      currentLastfmHash = h;
    }
    // Broadcast name already parsed earlier, no need to parse again
  } catch (e) { try { debugLog('ws_query_parse_error', { message: e?.message || String(e) }); } catch {} }

  ws.on("message", data => {
    const now = Date.now();
    try {
      debugLog('ws_message', { wsId: ws._wsId || null, bytes: Buffer.isBuffer(data) ? data.length : -1 });
      wsLastMessageTs.set(ws._wsId || 'unknown', now);
      if (ws._wsId === activeWsId) activeWsBytesIn += Buffer.isBuffer(data) ? data.length : 0;
    } catch {}
    // Handle text messages (commands, metadata, etc.)
    if (!Buffer.isBuffer(data)) {
      try {
        const text = data && data.toString ? data.toString() : '';

        // Handle broadcast name setting
        if (text.startsWith('broadcast_name=')) {
          const name = text.slice('broadcast_name='.length).trim().slice(0,64);
          if (name) ws._broadcastName = name;
          return;
        }

        // Handle JSON commands from frontend
        try {
          const command = JSON.parse(text);
          if (command.type === 'media_control' && command.action) {
            console.log(`🎮 Media control command received for wsId ${wsId}:`, command.action);

            // Forward the command to the extension via WebSocket
            // The extension will receive this and simulate keyboard events
            try {
              ws.send(JSON.stringify({
                type: 'media_control',
                action: command.action,
                timestamp: Date.now()
              }));
              console.log(`📡 Media control "${command.action}" forwarded to extension`);
            } catch (sendError) {
              console.error('Failed to send media control to extension:', sendError);
            }
            return;
          }
        } catch (jsonError) {
          // Not JSON, continue with audio processing
        }
      } catch {}
    }

    // Continue with audio data processing...
    if (!ws._hostAuthorized) return;
    const wsId = ws._wsId;
    if (!wsId) return;

    let st = wsDecoders.get(wsId);
    if (!st) {
      st = { detected: false, head: [], headLen: 0, proc: null, stdin: null, stdout: null, isWebM: null, bytesIn: 0, bytesOut: 0, lastOutTs: 0 };
      wsDecoders.set(wsId, st);
    }

    if (!st.detected) {
      st.head.push(data);
      st.headLen += data.length;
      if (st.headLen >= 32) {
        const head = Buffer.concat(st.head, st.headLen);
        const isWebM = head[0] === 0x1A && head[1] === 0x45 && head[2] === 0xDF && head[3] === 0xA3;
        st.isWebM = isWebM;
        // RESEARCH-BASED: Spawn per-WS decoder with improved buffering settings
        try {
          const args = isWebM
            ? ["-re", "-f", "webm", "-i", "pipe:0", "-bufsize", "64k", "-rtbufsize", "32k", "-async", "1", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"]
            : ["-re", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", "pipe:0", "-bufsize", "64k", "-async", "1", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"];
        st.proc = spawn("/usr/bin/ffmpeg", args);
          st.stdin = st.proc.stdin;
          st.stdout = st.proc.stdout;
        try {
          st.proc.stderr.on('data', (c) => { try { debugLog('decoder_stderr', { wsId, line: c.toString() }); } catch {} });
          st.proc.on('exit', (code, signal) => { try { debugLog('decoder_exit', { wsId, code, signal }); } catch {} });
        } catch {}
        } catch (e) {
          console.error('❌ Failed to start per-WS decoder:', e.message);
          return;
        }
        // feed head to decoder stdin
        try { st.stdin.write(head); } catch {}
        st.head = []; st.headLen = 0;
        st.detected = true;
        attachRailPcmFeed(wsId, st.stdout);
        return;
      }
      return;
    }

    try {
      st.bytesIn += Buffer.isBuffer(data) ? data.length : 0;
      if (st.stdin) {
        if (ws.bufferedAmount > 64 * 1024) {
          const lastTs = lastDecoderBpLogTs.get(wsId) || 0;
          if (Date.now() - lastTs > 2000) {
            try { debugLog('ws_backpressure_skip', { wsId, bufferedAmount: ws.bufferedAmount }); } catch {}
            lastDecoderBpLogTs.set(wsId, Date.now());
          }
          return;
        }

        const ok = st.stdin.write(data);
        if (!ok) {
          const lastTs = lastDecoderBpLogTs.get(wsId) || 0;
          if (Date.now() - lastTs > 1000) {
            try { debugLog('decoder_stdin_backpressure', { wsId }); } catch {}
            lastDecoderBpLogTs.set(wsId, Date.now());
          }
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log("🌐 Browser extension disconnected");
    try { debugLog('ws_close', { wsId: ws._wsId || null }); } catch {}
    clearInterval(heartbeatInterval);
    // If the closing socket was active, stop pipeline; otherwise leave pipeline running
    try {
      if (ws._wsId && ws._wsId === activeWsId) {
        if (isSetupComplete()) {
          try {
            onDjSwitch({ wasCurrentBroadcaster: false });
          } catch {}
        }
        const closingWsId = ws._wsId;
        let promotedWsId = null;
        for (const [wsId, info] of wsConnections.entries()) {
          if (ws._wsId && ws._wsId === wsId) continue;
          promotedWsId = wsId;
          activeWsId = wsId;
          broadcastStatus.broadcasterUserId = info.userId;
          broadcastStatus.broadcasterDisplayName = info.displayName;
          publishBroadcastStatusChanged("auto-promote");
          try { debugLog('active_ws_promoted_on_close', { wsId: activeWsId, userId: info.userId }); } catch {}
          try {
            const promotedWs = info.ws;
            if (promotedWs && promotedWs._lastfm && promotedWs._lastfm.user && promotedWs._lastfm.apiKey) {
              currentLastfmOverride = { user: promotedWs._lastfm.user, apiKey: promotedWs._lastfm.apiKey, wsId: activeWsId };
              const h = hashLastfmCred(promotedWs._lastfm.user, promotedWs._lastfm.apiKey);
              lastfmCredCache.set(h, { valid: true, ts: Date.now() - LASTFM_CACHE_TTL_MS - 1 });
            } else {
              currentLastfmOverride = null;
            }
          } catch {}
          console.log(`🟢 Auto-promoted active WS: wsId=${activeWsId}`);
          resetLiveSilenceState();
          switchLiveBroadcaster(activeWsId);
          try {
            if (typeof globalThis.__metaState !== 'undefined') {
              globalThis.__metaState.lastStabilized = null;
              globalThis.__metaState.lastPayload = null;
              globalThis.__metaState.pending = null;
              if (globalThis.__metaState.pendingTimer) {
                clearTimeout(globalThis.__metaState.pendingTimer);
                globalThis.__metaState.pendingTimer = null;
              }
              if (globalThis.__metaState.discordBotTimer) {
                clearTimeout(globalThis.__metaState.discordBotTimer);
                globalThis.__metaState.discordBotTimer = null;
              }
            }
          } catch {}
          break;
        }
        if (!promotedWsId) {
          stopFfmpeg('active ws closed');
          activeWsId = null;
          currentLastfmOverride = null;
          broadcastStatus.broadcasterUserId = null;
          broadcastStatus.broadcasterDisplayName = null;
          publishBroadcastStatusChanged("broadcaster-cleared");
          try { debugLog('active_ws_cleared_on_close'); } catch {}
        }
      }
    } catch {}
    if (ws._hostAuthorized) {
      hostRelayConnections = Math.max(0, hostRelayConnections - 1);
      setBroadcastActive(hostRelayConnections > 0);
    }
    // Remove from registry and update user tracking
    try { 
      if (ws._wsId) { 
        const connectionInfo = wsConnections.get(ws._wsId);
        if (connectionInfo) {
          // Update user tracking - user is no longer connected
          updateUserLastSeen(connectionInfo.userId, false);
        }
        removeSitePresence(`relay:${ws._wsId}`);
        publishCurrentPresenceRoster();
        wsConnections.delete(ws._wsId);

        removeBroadcasterRail(ws._wsId);
        const dec = wsDecoders.get(ws._wsId);
        if (dec?.proc) {
          try { dec.stdin?.end(); } catch {}
          try { dec.proc.kill(); } catch {}
        }
        wsDecoders.delete(ws._wsId);
        
        console.log(`🔌 WS removed: wsId=${ws._wsId}`);
      } 
    } catch {}
  });

  ws.on("error", err => {
    console.error("⚠️ WebSocket error:", err.message);
    try { debugLog('ws_error', { wsId: ws._wsId || null, message: err?.message || String(err) }); } catch {}
    clearInterval(heartbeatInterval);
    // If the errored socket was active, stop pipeline; otherwise leave pipeline running
    try {
      if (ws._wsId && ws._wsId === activeWsId) {
        if (isSetupComplete()) {
          try {
            onDjSwitch({ wasCurrentBroadcaster: false });
          } catch {}
        }
        stopFfmpeg('active ws error');
        activeWsId = null;
      }
    } catch {}
    if (ws._hostAuthorized) {
      hostRelayConnections = Math.max(0, hostRelayConnections - 1);
      setBroadcastActive(hostRelayConnections > 0);
    }
    try { 
      if (ws._wsId) { 
        const connectionInfo = wsConnections.get(ws._wsId);
        if (connectionInfo) {
          // Update user tracking - user is no longer connected
          updateUserLastSeen(connectionInfo.userId, false);
        }
        removeSitePresence(`relay:${ws._wsId}`);
        publishCurrentPresenceRoster();
        wsConnections.delete(ws._wsId);
        
        console.log(`🔌 WS removed (error): wsId=${ws._wsId}`); 
      } 
    } catch {}
  });
});

// Old separate HTML server removed - now handled by combined web server above

// -----------------
// BOT LOGIN
// -----------------
// Handle button clicks in DMs for song requests
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  const [action, ...keyParts] = interaction.customId.split('_');
  const songKey = keyParts.join('_'); // Handle song keys with underscores
  
  if (action === 'approve' || action === 'deny') {
    // Only host (by role) can approve/deny via Discord
    const isHost = await isUserHost(interaction.user.id);
    if (!isHost) {
      await interaction.reply({ content: '❌ Only the host (role) can approve/deny requests.', ephemeral: true });
    return;
  }

    if (!requests[songKey]) {
      await interaction.reply({ content: '❌ Request not found', ephemeral: true });
      return;
    }
    
    // Process approval/denial directly (no HTTP auth needed)
    try {
      if (!requests[songKey]) {
        await interaction.reply({ content: '❌ Request not found', ephemeral: true });
        return;
      }
      const request = requests[songKey];
      if (action === 'approve') {
        requests[songKey].status = 'approved';
        tryAwardApprovalXp({
          songKey,
          request,
          approverUserId: String(interaction.user.id),
        });
        tryMatchApprovedRequestToNowPlaying(songKey);
      } else if (action === 'deny') {
        requests[songKey].status = 'denied';
        setTimeout(() => {
          if (requests[songKey]?.status === 'denied') {
            try { delete requests[songKey]; } catch {}
            // Also remove associated SYSTEM_REQUEST message
            messages = messages.filter(m => {
              if (m.type !== 'SYSTEM_REQUEST') return true;
              return !(m.content.includes(`"${request.title}"`) && m.content.includes(`by ${request.artist}`));
            });
            publishChatChanged("request");
          }
        }, 5 * 60 * 1000);
      }
      publishChatChanged("request");
      
      // Recalculate embed fields
      const votePercentage = calculateVotePercentage(request);
      const upvotes = request.votes.filter(v => v.vote === 1).length;
      const downvotes = request.votes.filter(v => v.vote === -1).length;
      
      // Keep the embed but update it to show status
      const embed = {
        title: `🎵 Song Request - ${action === 'approve' ? '✅ Approved' : '❌ Denied'}`,
        description: `**${request.title}**\nby ${request.artist}`,
        url: request.url,
        color: action === 'approve' ? 0x2ECC71 : 0xE74C3C, // Green or Red
        fields: [
          {
            name: '📊 Voting',
            value: `👍 ${upvotes}  👎 ${downvotes}  (${votePercentage}% approval)`,
            inline: false
          }
        ],
        footer: { text: `Request ID: ${songKey}` }
      };
      
      // Update message - keep embed, remove buttons
      await interaction.update({
        embeds: [embed],
        components: []
      });
    } catch (error) {
      console.error('[Request] Error processing approval/denial:', error);
      await interaction.reply({ content: '⚠️ An error occurred.', ephemeral: true });
    }
  }
});

// Auto-relay Discord messages from sync channel into site chat
client.on('messageCreate', async (m) => {
  if (!SYNC_ENABLED) return;
  try {
    if (m.author?.bot) return;
    if (m.channelId !== SYNC_CHANNEL_ID) return;
    const content = (m.content || '').trim();
    if (!content) return;
    const newId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
    messages.push({
      id: newId,
      content,
      userId: String(m.author.id),
      username: m.author.username || null,
      avatar: m.author.avatar || null,
      isHost: false, // Regular user message, not a system message
      timestamp: Date.now(),
    });
    finalizeChatMutation("message", messages[messages.length - 1]);
    try { await m.delete(); } catch {}
  } catch {}
});

// Handle reaction-based voting on request embeds
async function handleReactionChange(reaction, user, isAdd) {
  if (!SYNC_ENABLED) return;
  try {
    if (!reaction.message || reaction.message.channelId !== SYNC_CHANNEL_ID) return;
    const emoji = reaction.emoji?.name;
    if (emoji !== '👍' && emoji !== '👎') return;
    if (user?.bot) return;
    const discordMsgId = reaction.message.id;
    const songKey = discordRequestMsgIdToSongKey.get(discordMsgId);
    if (!songKey || !requests[songKey]) return;
    const userId = String(user.id);
    const isHost = await isUserHost(user.id);
    const voteVal = emoji === '👍' ? 1 : -1;
    const arr = requests[songKey].votes;
    const existing = arr.find(v => v.userId === userId && v.host === isHost);
    if (isAdd) {
      if (existing) existing.vote = voteVal; else arr.push({ userId, host: isHost, vote: voteVal });
    } else {
      const idx = arr.findIndex(v => v.userId === userId && v.host === isHost);
      if (idx !== -1) arr.splice(idx, 1);
    }
    // Update DM
    await updateRequestDM(requests[songKey], songKey);
    // Update the embed in place
    try {
      const channel = await client.channels.fetch(SYNC_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const msg = await channel.messages.fetch(discordMsgId);
        const req = requests[songKey];
        const votePercentage = calculateVotePercentage(req);
        const upvotes = req.votes.filter(v => v.vote === 1).length;
        const downvotes = req.votes.filter(v => v.vote === -1).length;
        const embed = {
          title: `🎵 Song Request - ${req.status === 'approved' ? '✅ Approved' : req.status === 'denied' ? '❌ Denied' : req.status === 'playing' ? '▶️ Now Playing' : '⏳ Requested'}`,
          description: `**${req.title}**\nby ${req.artist}`,
          url: req.url,
          color: req.status === 'approved' ? 0x2ECC71 : req.status === 'denied' ? 0xE74C3C : req.status === 'playing' ? 0x9B59B6 : 0x3498DB,
          fields: [{ name: '📊 Voting', value: `👍 ${upvotes}  👎 ${downvotes}  (${votePercentage}% approval)`, inline: false }],
          footer: { text: `ID: ${discordMsgId}` }
        };
        await msg.edit({ embeds: [embed] });
      }
    } catch {}
  } catch {}
}

client.on('messageReactionAdd', async (reaction, user) => handleReactionChange(reaction, user, true));
client.on('messageReactionRemove', async (reaction, user) => handleReactionChange(reaction, user, false));

// RESEARCH-BASED: Initialize audio worker at startup for CPU optimization
try { 
  initializeAudioWorker();
  // Start worker pacer immediately so Icecast stays alive with silence when idle
  try { startAudioWorker(); } catch {}
  console.log('🎵 Audio worker initialized and start requested for continuous stream');
} catch (error) {
  console.error('❌ Failed to initialize audio worker:', error.message);
}

// Discord voice bot is relay-bot.js (Admin → Discord voice bot). No in-process Discord client here.
console.log("[v2] In-process Discord client disabled — voice bot runs via relay-bot.js");