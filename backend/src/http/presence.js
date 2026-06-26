import { verifyGuestSession, isValidGuestId } from "../security/guestSession.js";
import { validateShareToken } from "../db/shareLinks.js";
import { getUserById } from "../db/index.js";
import { publicUserPresentation } from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import { sanitizeRoleColor } from "../security/sanitize.js";
import { publicLevelInfo } from "../db/userLevel.js";
import { normalizeChatRoleType } from "./chatMessages.js";
import { guestStageProfile } from "./guestBroadcast.js";
import { hasSessionOrShareToken } from "../security/access.js";
import { clientIp } from "../security/rateLimit.js";
import {
  listSitePresenceRoster,
  removeSitePresence,
  touchSitePresence,
} from "../presence/sitePresence.js";
import { publishPresenceRoster } from "./liveEvents.js";

const GUEST_ROLE_COLOR = "#c4b5fd";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function actorFromSession(session) {
  const user = getUserById(Number(session.user.id));
  if (!user) return null;
  const presentation = publicUserPresentation(user);
  const role = roleInfoForUser(user);
  const levelInfo = publicLevelInfo(user);
  return {
    actorId: String(session.user.id),
    displayName: presentation.displayName || user.username,
    avatar: presentation.avatar || null,
    avatarVariant: 0,
    coverIcon: 0,
    roleColor: sanitizeRoleColor(role.roleColor) || null,
    roleType: normalizeChatRoleType(user.role, false),
    level: levelInfo?.level ?? 1,
    isGuest: false,
  };
}

function actorFromGuest(body, link) {
  const guestId = String(body.guestId || "").trim();
  const guestName = String(body.guestName || "Guest").trim();
  const profile = guestStageProfile(`guest:${guestId}`, guestName, link.id);
  return {
    actorId: `guest:${guestId}`,
    displayName: profile.displayName || guestName || "Guest",
    avatar: null,
    avatarVariant: profile.avatarVariant ?? (Number(body.avatarVariant) || 0),
    coverIcon: profile.coverIcon ?? (Number(body.coverIcon) || 0),
    roleColor: GUEST_ROLE_COLOR,
    roleType: "guest",
    level: 0,
    isGuest: true,
  };
}

export function resolvePresenceActor(req, body, getAppSession) {
  const session = getAppSession(req);
  if (session?.user?.id) {
    const actor = actorFromSession(session);
    if (!actor) return { error: "Unauthorized", status: 401 };
    return { actor };
  }

  const shareToken = String(body.shareToken || "").trim();
  const guestId = String(body.guestId || "").trim();
  const guestSession = String(body.guestSession || "").trim();

  if (!shareToken || !guestId || !guestSession) {
    return { error: "Unauthorized", status: 401 };
  }
  if (!isValidGuestId(guestId) || !verifyGuestSession(guestSession, shareToken, guestId)) {
    return { error: "Invalid guest session", status: 403 };
  }
  const link = validateShareToken(shareToken);
  if (!link || link.link_kind !== "ui") {
    return { error: "Invalid share link", status: 403 };
  }

  return { actor: actorFromGuest(body, link) };
}

export async function handlePresenceRoutes(req, res, pathname, method, getAppSession) {
  if (pathname === "/api/presence/roster" && method === "GET") {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      json(res, 200, listSitePresenceRoster());
    } catch {
      json(res, 500, { error: "Failed to load presence roster" });
    }
    return true;
  }

  if (pathname === "/api/presence/heartbeat" && method === "POST") {
    try {
      const body = await readBody(req);
      const resolved = resolvePresenceActor(req, body, getAppSession);
      if (resolved.error) {
        json(res, resolved.status, { error: resolved.error });
        return true;
      }

      const clientId = String(body.clientId || "").trim();
      if (!clientId || clientId.length > 80) {
        json(res, 400, { error: "Invalid clientId" });
        return true;
      }

      if (body.leave === true) {
        removeSitePresence(clientId);
        publishPresenceRoster(listSitePresenceRoster());
        json(res, 200, { ok: true });
        return true;
      }

      touchSitePresence(clientId, resolved.actor, {
        listening: !!body.listening,
        clientIp: clientIp(req),
      });
      publishPresenceRoster(listSitePresenceRoster());
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  return false;
}
