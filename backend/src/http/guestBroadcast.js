import {
  getShareLinkById,
  validateShareToken,
  validateGuestBroadcasterLink,
} from "../db/shareLinks.js";
import { mintGuestBroadcastWsToken } from "../radio/wsTokenMint.js";
import { verifyGuestSession, isValidGuestId } from "../security/guestSession.js";
import {
  deleteGuestDisplayNamesForShareLink,
  getGuestProfileFromDb,
  getLatestGuestProfileForGuestId,
  upsertGuestProfile,
} from "../db/guestDisplayNames.js";
import { publishPresenceRoster, publishProfileChanged } from "./liveEvents.js";
import {
  listSitePresenceRoster,
  updateSitePresenceActorProfile,
} from "../presence/sitePresence.js";
import { refreshChatTypingForActor } from "../chat/chatTypingPublish.js";
import { rejectExtensionOnWebBroadcasterRoute } from "../security/broadcastClient.js";

const guestProfileCache = new Map();

let syncGuestProfileToRelay = null;

function guestProfileCacheKey(shareLinkId, guestId) {
  return `${Number(shareLinkId)}:${String(guestId || "").trim()}`;
}

export function sanitizeGuestDisplayName(name) {
  const cleaned = String(name || "Guest")
    .trim()
    .replace(/\s+/g, "")
    .replace(/undefined/gi, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return cleaned || "Guest";
}

function normalizeGuestProfileFields(fields = {}) {
  const out = {};
  if (fields.displayName != null) {
    out.displayName = sanitizeGuestDisplayName(fields.displayName);
  }
  if (fields.avatarVariant != null) {
    out.avatarVariant = fields.avatarVariant;
  }
  if (fields.coverIcon != null) {
    out.coverIcon = fields.coverIcon;
  }
  return out;
}

/** Called from bot.js to push profile updates onto live relay connections. */
export function setGuestRelayDisplaySync(fn) {
  syncGuestProfileToRelay = fn;
}

/** Drop in-memory profiles for a share link (DB rows removed via shareLinks revoke hook). */
export function purgeGuestDisplayNamesForShareLink(shareLinkId) {
  const linkId = Number(shareLinkId);
  if (!Number.isFinite(linkId) || linkId <= 0) return;
  deleteGuestDisplayNamesForShareLink(linkId);
  const prefix = `${linkId}:`;
  for (const key of [...guestProfileCache.keys()]) {
    if (key.startsWith(prefix)) {
      guestProfileCache.delete(key);
    }
  }
}

export function publishGuestProfile(shareLinkId, guestId, fields = {}) {
  const linkId = Number(shareLinkId);
  const id = String(guestId || "").trim();
  if (!Number.isFinite(linkId) || linkId <= 0 || !id || !isValidGuestId(id)) return null;
  const normalized = normalizeGuestProfileFields(fields);
  if (!Object.keys(normalized).length) return getPublishedGuestProfile(linkId, id);

  const profile = upsertGuestProfile(linkId, id, normalized);
  if (!profile) return null;

  guestProfileCache.set(guestProfileCacheKey(linkId, id), profile);
  syncGuestProfileToRelay?.(id, profile);
  updateSitePresenceActorProfile(`guest:${id}`, {
    displayName: profile.displayName,
    avatarVariant: profile.avatarVariant,
    coverIcon: profile.coverIcon,
  });
  publishPresenceRoster(listSitePresenceRoster());
  publishProfileChanged({
    userId: `guest:${id}`,
    isGuest: true,
    profile,
  });
  refreshChatTypingForActor(`guest:${id}`, {
    displayName: profile.displayName,
    avatarVariant: profile.avatarVariant,
    coverIcon: profile.coverIcon,
    isGuest: true,
    roleType: "guest",
  });
  return profile;
}

export function publishGuestDisplayName(shareLinkId, guestId, guestName) {
  return publishGuestProfile(shareLinkId, guestId, { displayName: guestName });
}

export function getPublishedGuestProfile(shareLinkId, guestId) {
  const linkId = Number(shareLinkId);
  const id = String(guestId || "").trim();
  if (!Number.isFinite(linkId) || linkId <= 0 || !id || !isValidGuestId(id)) return null;
  const cacheKey = guestProfileCacheKey(linkId, id);
  const cached = guestProfileCache.get(cacheKey);
  if (cached) return cached;
  const fromDb = getGuestProfileFromDb(linkId, id);
  if (fromDb) guestProfileCache.set(cacheKey, fromDb);
  return fromDb;
}

export function getPublishedGuestDisplayName(shareLinkId, guestId) {
  return getPublishedGuestProfile(shareLinkId, guestId)?.displayName ?? null;
}

export function guestStageProfile(userId, fallback, shareLinkId = null) {
  const uid = String(userId || "");
  if (!uid.startsWith("guest:")) {
    return {
      displayName: fallback,
      avatarVariant: 0,
      coverIcon: 0,
    };
  }
  const guestId = uid.slice(6);
  let profile = null;
  if (shareLinkId != null) {
    profile = getPublishedGuestProfile(shareLinkId, guestId);
  } else {
    profile = getLatestGuestProfileForGuestId(guestId);
  }
  return {
    displayName: sanitizeGuestDisplayName(profile?.displayName || fallback),
    avatarVariant: profile?.avatarVariant ?? 0,
    coverIcon: profile?.coverIcon ?? 0,
  };
}

export function guestStageDisplayName(userId, fallback, shareLinkId = null) {
  return guestStageProfile(userId, fallback, shareLinkId).displayName;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleGuestProfilePublish(req, res, body) {
  const shareToken = String(body.shareToken || "").trim();
  const guestId = String(body.guestId || "").trim();
  const guestSession = String(body.guestSession || "").trim();
  const guestName = String(body.guestName || "").trim();
  if (!shareToken || !guestId || !guestName || !guestSession) {
    json(res, 400, { error: "shareToken, guestId, guestName, and guestSession required" });
    return true;
  }
  if (!isValidGuestId(guestId) || !verifyGuestSession(guestSession, shareToken, guestId)) {
    json(res, 403, { error: "Invalid guest session" });
    return true;
  }
  const link = validateShareToken(shareToken);
  if (!link || link.link_kind !== "ui") {
    json(res, 403, { error: "Invalid or expired share link" });
    return true;
  }
  const profile = publishGuestProfile(link.id, guestId, {
    displayName: guestName,
    avatarVariant: body.avatarVariant,
    coverIcon: body.coverIcon,
  });
  json(res, 200, {
    ok: true,
    displayName: profile?.displayName ?? sanitizeGuestDisplayName(guestName),
    avatarVariant: profile?.avatarVariant ?? 0,
    coverIcon: profile?.coverIcon ?? 0,
  });
  return true;
}

export async function handleGuestBroadcastRoutes(req, res, pathname, method) {
  if (!pathname.startsWith("/api/guest-broadcast")) return false;

  if (pathname === "/api/guest-broadcast/ws-token" && method === "POST") {
    if (rejectExtensionOnWebBroadcasterRoute(req, res, json)) return true;
    try {
      const body = await readBody(req);
      const shareToken = String(body.shareToken || "").trim();
      const guestId = String(body.guestId || "").trim();
      const guestSession = String(body.guestSession || "").trim();
      const guestName = String(body.guestName || "").trim().replace(/\s+/g, "").slice(0, 32);
      if (!shareToken || !guestId || !guestName || !guestSession) {
        json(res, 400, { error: "shareToken, guestId, guestName, and guestSession required" });
        return true;
      }
      if (!isValidGuestId(guestId) || !verifyGuestSession(guestSession, shareToken, guestId)) {
        json(res, 403, { error: "Invalid guest session" });
        return true;
      }
      const link = validateGuestBroadcasterLink(shareToken);
      if (!link) {
        json(res, 403, { error: "Invalid or expired guest broadcaster link" });
        return true;
      }
      publishGuestProfile(link.id, guestId, {
        displayName: guestName,
        avatarVariant: body.avatarVariant,
        coverIcon: body.coverIcon,
      });
      json(res, 200, {
        ...mintGuestBroadcastWsToken(guestId, guestName, link.id, 90 * 1000, body.deviceLabel),
        label: typeof body.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 64) : "Web UI",
      });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (
    (pathname === "/api/guest-broadcast/display-name" ||
      pathname === "/api/guest-broadcast/profile") &&
    method === "POST"
  ) {
    try {
      const body = await readBody(req);
      return await handleGuestProfilePublish(req, res, body);
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  return false;
}

export function resolveGuestMetadataAuth(req, body) {
  const shareToken = String(body?.shareToken || "").trim();
  const guestId = String(body?.guestId || "").trim();
  const guestSession = String(body?.guestSession || "").trim();
  if (!shareToken || !guestId || !guestSession) return null;
  if (!verifyGuestSession(guestSession, shareToken, guestId)) return null;
  const link = validateGuestBroadcasterLink(shareToken);
  if (!link) return null;
  return { authUserId: `guest:${guestId}`, link };
}

/** Extension guest broadcasters authenticate via share link + guest ID (same as ws-token). */
export function resolveExtensionGuestMetadataAuth(body) {
  const shareToken = String(body?.shareToken || "").trim();
  const guestId = String(body?.guestId || "").trim();
  if (!shareToken || !guestId || !isValidGuestId(guestId)) return null;
  const link = validateGuestBroadcasterLink(shareToken);
  if (!link) return null;
  return { authUserId: `guest:${guestId}`, link };
}

export async function isGuestBroadcasterUserId(userId, tokenPayload) {
  const id = String(userId || "");
  if (!id.startsWith("guest:")) return false;
  if (!tokenPayload?.guestShareId) return false;
  const link = getShareLinkById(Number(tokenPayload.guestShareId));
  if (!link || link.guest_mode !== "guest_broadcaster" || link.revoked) return false;
  if (link.expires_at != null && link.expires_at < Date.now()) return false;
  return !!validateShareToken(link.token);
}
