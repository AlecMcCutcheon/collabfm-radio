import fs from "fs";
import { getAppSession } from "../auth/routes.js";
import { canUserBroadcastV2 } from "../bridge.js";
import { mintWsRelayToken } from "../radio/wsTokenMint.js";
import {
  getBroadcasterProfile,
  resolveAvatarFile,
  saveBroadcasterAvatar,
  updateBroadcasterProfile,
} from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import { getUserById } from "../db/index.js";
import { publishPresenceRoster, publishProfileChanged } from "./liveEvents.js";
import {
  listSitePresenceRoster,
  updateSitePresenceActorProfile,
} from "../presence/sitePresence.js";
import { refreshChatTypingForActor } from "../chat/chatTypingPublish.js";
import { rejectExtensionOnWebBroadcasterRoute } from "../security/broadcastClient.js";
import { hasSessionOrShareToken } from "../security/access.js";

const WEB_BROADCASTER_LABEL = "Web UI";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function requireAuthenticatedSession(req, res) {
  const session = getAppSession(req);
  if (!session?.user?.id) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

async function requireBroadcasterSession(req, res) {
  const session = await requireAuthenticatedSession(req, res);
  if (!session) return null;
  const allowed = await canUserBroadcastV2(session.user.id);
  if (!allowed) {
    json(res, 403, { error: "Forbidden" });
    return null;
  }
  return session;
}
function publishBroadcasterProfileUpdate(userId, profile) {
  const user = getUserById(Number(userId));
  const role = user ? roleInfoForUser(user) : null;
  updateSitePresenceActorProfile(String(userId), {
    displayName: profile?.displayName,
    avatar: profile?.avatarUrl ?? null,
    roleColor: role?.roleColor ?? null,
    roleType: user?.role,
    level: profile?.level?.level,
  });
  publishPresenceRoster(listSitePresenceRoster());
  publishProfileChanged({
    userId: String(userId),
    isGuest: false,
    profile,
  });
  refreshChatTypingForActor(String(userId), {
    displayName: profile?.displayName,
    avatar: profile?.avatarUrl ?? null,
    roleType: user?.role,
    isGuest: false,
  });
}

export async function handleBroadcasterRoutes(req, res, pathname, method, getSession = getAppSession) {
  const avatarMatch = pathname.match(/^\/api\/avatars\/(\d+)$/);
  if (avatarMatch && method === "GET") {
    if (!hasSessionOrShareToken(req, getSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const file = resolveAvatarFile(Number(avatarMatch[1]));
    if (!file) {
      json(res, 404, { error: "Not found" });
      return true;
    }
    res.writeHead(200, {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=300",
    });
    fs.createReadStream(file.filePath).pipe(res);
    return true;
  }

  if (!pathname.startsWith("/api/broadcaster")) return false;

  if (pathname === "/api/broadcaster/ws-token" && (method === "POST" || method === "GET")) {
    if (rejectExtensionOnWebBroadcasterRoute(req, res, json)) return true;
    const session = await requireBroadcasterSession(req, res);
    if (!session) return true;
    json(res, 200, {
      ...mintWsRelayToken(Number(session.user.id), 90 * 1000, WEB_BROADCASTER_LABEL),
      label: WEB_BROADCASTER_LABEL,
    });
    return true;
  }

  if (pathname === "/api/broadcaster/profile" && method === "GET") {
    const session = await requireAuthenticatedSession(req, res);
    if (!session) return true;
    const profile = getBroadcasterProfile(Number(session.user.id));
    json(res, 200, { profile });
    return true;
  }

  if (pathname === "/api/broadcaster/profile" && method === "PUT") {
    const session = await requireAuthenticatedSession(req, res);
    if (!session) return true;
    try {
      const body = await readBody(req);
      const profile = updateBroadcasterProfile(Number(session.user.id), {
        displayName: body.displayName,
        bio: body.bio,
        genres: body.genres,
      });
      publishBroadcasterProfileUpdate(session.user.id, profile);
      json(res, 200, { profile });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/broadcaster/profile/avatar" && method === "POST") {
    const session = await requireAuthenticatedSession(req, res);
    if (!session) return true;
    try {
      const body = await readBody(req);
      const data = String(body.data || "");
      const mimeType = String(body.mimeType || "image/png");
      if (!data) {
        json(res, 400, { error: "Image data required" });
        return true;
      }
      const buffer = Buffer.from(data, "base64");
      const profile = saveBroadcasterAvatar(Number(session.user.id), buffer, mimeType);
      publishBroadcasterProfileUpdate(session.user.id, profile);
      json(res, 200, { profile });
      return true;
    } catch (e) {
      json(res, 400, { error: e.message || "Upload failed" });
      return true;
    }
  }

  return false;
}
