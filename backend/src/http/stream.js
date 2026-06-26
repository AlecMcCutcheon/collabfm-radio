import { getAppSession } from "../auth/routes.js";
import { validateShareToken, touchShareLink } from "../db/shareLinks.js";
import {
  getActiveListenerCount,
  subscribeToStream,
  buildStreamStatusJson,
  isStreamPublishing,
} from "../radio/streamHub.js";

export { getActiveListenerCount, buildStreamStatusJson, isStreamPublishing };

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function tokenFromRequest(req, pathname) {
  const url = new URL(req.url || "/", "http://localhost");
  const q = url.searchParams.get("token");
  if (q) return q;
  const m = pathname.match(/^\/api\/listen\/([^/]+)\/stream$/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

export function resolveStreamAccess(req, pathname, getSession = getAppSession) {
  const session = getSession(req);
  if (session) {
    return {
      allowed: true,
      meta: {
        userId: session.user.id,
        username: session.user.username,
        via: "session",
      },
    };
  }

  const token = tokenFromRequest(req, pathname);
  if (!token) return { allowed: false };

  const link = validateShareToken(token);
  if (!link) return { allowed: false };

  touchShareLink(token);
  return {
    allowed: true,
    meta: {
      shareToken: token,
      linkKind: link.link_kind,
      label: link.label,
      via: "share",
    },
  };
}

export function isStreamPath(pathname) {
  return pathname === "/api/stream" || /^\/api\/listen\/[^/]+\/stream$/.test(pathname);
}

export function serveAuthenticatedStream(req, res, pathname, getSession = getAppSession) {
  const access = resolveStreamAccess(req, pathname, getSession);
  if (!access.allowed) {
    res.writeHead(401, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Authentication required");
    return false;
  }
  subscribeToStream(res, access.meta);
  return true;
}

export function patchStatusJsonWithListenerCount(rawText) {
  try {
    const data = JSON.parse(rawText);
    const count = getActiveListenerCount();
    const source = data?.icestats?.source;
    if (source) {
      const apply = (entry) => {
        if (entry && typeof entry === "object") entry.listeners = count;
      };
      if (Array.isArray(source)) source.forEach(apply);
      else apply(source);
    }
    return JSON.stringify(data);
  } catch {
    return rawText;
  }
}
