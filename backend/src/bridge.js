import crypto from "crypto";
import { initDatabase, isSetupComplete, pruneExpiredSessions, getUserById, hasWsToken, persistWsToken, getSetting, setSetting } from "./db/index.js";
import { getAppSession, handleAuthRoutes } from "./auth/routes.js";
import { handleSetupRoutes, requireSetupOrAllow } from "./http/setup.js";
import { handleAdminRoutes, handlePublicDiscordRoutes } from "./http/admin.js";
import { handleListenRoutes } from "./http/listen.js";
import { handleExtensionRoutes } from "./http/extension.js";
import { handleBroadcasterRoutes } from "./http/broadcaster.js";
import { handleGuestBroadcastRoutes } from "./http/guestBroadcast.js";
import { handleUserShareLinkRoutes } from "./http/userShareLinks.js";
import { handleBrandingRoutes } from "./http/branding.js";
import { handleGiphyRoutes } from "./http/giphy.js";
import { handleLiveEventsRoutes } from "./http/liveEvents.js";
import { handlePartyEffectsRoutes, setPartyEffectsContext } from "./http/partyEffects.js";
import { handleLevelingRoutes, setLevelingContext } from "./http/leveling.js";
import {
  handleBroadcastSessionLogRoutes,
  setBroadcastSessionLogContext,
} from "./http/broadcastSessionLog.js";
import { handlePublicUserRoutes } from "./http/publicUser.js";
import { handlePresenceRoutes } from "./http/presence.js";
import { handleChatTypingRoutes } from "./http/chatTyping.js";
import { handleContentPolicyRoutes } from "./http/contentPolicy.js";
import { serveAuthenticatedStream, isStreamPath } from "./http/stream.js";
export { verifyBroadcastDeviceFromRequest } from "./db/broadcastDevices.js";
export { setPartyEffectsContext } from "./http/partyEffects.js";
export { setLevelingContext } from "./http/leveling.js";
import {
  roleInfoForUser,
  canUserBroadcast as permCanBroadcast,
  isUserAdmin as permIsAdmin,
  canUserPromote as permCanPromote,
} from "./auth/permissions.js";
import { ensureDefaultSettings } from "./settings/runtime.js";
import { ensureOperationalSettings } from "./settings/operational.js";
import { ensureIntegrationsSettings } from "./settings/integrations.js";
import { ensureContentPolicySettings } from "./settings/contentPolicy.js";
import { maybeAutoStartManagedVoiceBot } from "./voice/voiceBotManager.js";
import { pruneOrphanBroadcastDevices } from "./db/broadcastDevices.js";
import { purgeExpiredShareLinks } from "./db/shareLinks.js";
import { isMutationOriginAllowed } from "./security/origin.js";

let v2Ready = false;

export function initV2({ storageDir, config }) {
  initDatabase(storageDir);
  purgeExpiredShareLinks();
  ensureDefaultSettings(config || {});
  ensureOperationalSettings(config || {});
  ensureIntegrationsSettings(config || {});
  ensureContentPolicySettings();
  pruneExpiredSessions();
  setInterval(() => pruneExpiredSessions(), 60 * 60 * 1000);
  v2Ready = true;
  try {
    pruneOrphanBroadcastDevices();
  } catch (err) {
    console.warn("[Devices] Orphan cleanup skipped:", err?.message || err);
  }
  setTimeout(() => {
    try {
      maybeAutoStartManagedVoiceBot({ reason: "startup" });
    } catch (err) {
      console.warn("[VoiceBot] Auto-start skipped:", err?.message || err);
    }
  }, 1500);
}

export function isV2Ready() {
  return v2Ready;
}

export { isSetupComplete, getAppSession, hasWsToken };

export async function getUserRoleInfoV2(userId) {
  const user = getUserById(Number(userId));
  return roleInfoForUser(user);
}

export async function canUserBroadcastV2(userId) {
  return permCanBroadcast(userId, async (id) => getUserById(Number(id)));
}

export async function isUserAdminV2(userId) {
  return permIsAdmin(userId, async (id) => getUserById(Number(id)));
}

export async function canUserPromoteV2(userId, isCurrentBroadcaster) {
  return permCanPromote(userId, isCurrentBroadcaster, async (id) => getUserById(Number(id)));
}

export function getWsTokenSecret() {
  let secret = getSetting("wsTokenSecret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    setSetting("wsTokenSecret", secret);
  }
  return secret;
}

export function persistWsTokenToDb(jti, userId, exp) {
  persistWsToken(jti, userId, exp);
}

export async function tryHandleV2Request(req, res, pathname, method, configFile = {}) {
  if (!v2Ready) return false;

  if (
    (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) &&
    !isMutationOriginAllowed(req, pathname)
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return true;
  }

  const setupResult = await handleSetupRoutes(req, res, pathname, method);
  if (setupResult !== false) return true;

  const authResult = await handleAuthRoutes(req, res, pathname, method);
  if (authResult !== false) return true;

  if (method === "GET" && isStreamPath(pathname)) {
    serveAuthenticatedStream(req, res, pathname, getAppSession);
    return true;
  }

  const discordResult = await handlePublicDiscordRoutes(req, res, pathname, method);
  if (discordResult !== false) return true;

  const contentPolicyResult = await handleContentPolicyRoutes(req, res, pathname, method);
  if (contentPolicyResult !== false) return true;

  const adminResult = await handleAdminRoutes(req, res, pathname, method);
  if (adminResult !== false) return true;

  const listenResult = await handleListenRoutes(req, res, pathname, method, getAppSession);
  if (listenResult !== false) return true;

  const brandingResult = await handleBrandingRoutes(req, res, pathname, method);
  if (brandingResult !== false) return true;

  const shareLinksResult = await handleUserShareLinkRoutes(req, res, pathname, method);
  if (shareLinksResult !== false) return true;

  const extensionResult = await handleExtensionRoutes(req, res, pathname, method);
  if (extensionResult !== false) return true;

  const broadcasterResult = await handleBroadcasterRoutes(req, res, pathname, method, getAppSession);
  if (broadcasterResult !== false) return true;

  const guestBroadcastResult = await handleGuestBroadcastRoutes(req, res, pathname, method);
  if (guestBroadcastResult !== false) return true;

  const giphyResult = await handleGiphyRoutes(req, res, pathname, method, getAppSession, configFile);
  if (giphyResult !== false) return true;

  const liveEventsResult = await handleLiveEventsRoutes(req, res, pathname, method, getAppSession);
  if (liveEventsResult !== false) return true;

  const partyResult = await handlePartyEffectsRoutes(req, res, pathname, method, getAppSession);
  if (partyResult !== false) return true;

  const levelingResult = await handleLevelingRoutes(req, res, pathname, method, getAppSession);
  if (levelingResult !== false) return true;

  const sessionLogResult = await handleBroadcastSessionLogRoutes(req, res, pathname, method, getAppSession);
  if (sessionLogResult !== false) return true;

  const publicUserResult = await handlePublicUserRoutes(req, res, pathname, method, getAppSession);
  if (publicUserResult !== false) return true;

  const presenceResult = await handlePresenceRoutes(req, res, pathname, method, getAppSession);
  if (presenceResult !== false) return true;

  const chatTypingResult = await handleChatTypingRoutes(req, res, pathname, method, getAppSession);
  if (chatTypingResult !== false) return true;

  if (!requireSetupOrAllow(pathname)) {
    if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "setup_required", setupUrl: "/setup" }));
      return true;
    }
    if (!pathname.startsWith("/internal/") && !pathname.match(/\.(js|css|png|webp|ico|svg|woff2?)$/)) {
      res.writeHead(302, { Location: "/setup" });
      res.end();
      return true;
    }
  }

  return false;
}
