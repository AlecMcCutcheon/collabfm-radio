import { validateShareToken } from "../db/shareLinks.js";

export function shareTokenFromRequest(req) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    return url.searchParams.get("shareToken") || url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}

/** GET routes that accept session cookie or valid UI share token (query param). */
export const SHARE_TOKEN_READ_API_PATHS = new Set([
  "/api/messages",
  "/api/chat/unread",
  "/api/host-members",
  "/api/users/public-profile",
  "/api/relay-connections",
  "/api/requests",
  "/api/party-effects",
  "/api/presence/roster",
  "/api/chat/typing",
  "/api/broadcast-status",
  "/api/metadata",
  "/api/lastfm",
  "/api/status-json.xsl",
  "/api/search",
  "/api/art/track",
  "/art/track",
]);

export function isShareTokenReadablePath(apiPath) {
  if (SHARE_TOKEN_READ_API_PATHS.has(apiPath)) return true;
  if (apiPath.startsWith("/api/metadata")) return true;
  if (apiPath.startsWith("/api/lastfm")) return true;
  if (apiPath.startsWith("/api/search")) return true;
  if (/^\/api\/avatars\/\d+$/.test(apiPath)) return true;
  return false;
}

/** POST routes that authenticate guest/session/device in the route handler (not at the API gate). */
export const GUEST_HANDLER_AUTH_POST_PATHS = new Set([
  "/api/messages",
  "/api/chat/read",
  "/api/media-control",
  "/api/metadata",
  "/api/capabilities",
  "/api/party-effects",
  "/api/presence/heartbeat",
  "/api/chat/typing",
]);

/** Session cookie OR valid UI share token (query param). */
export function hasSessionOrShareToken(req, getAppSession) {
  if (getAppSession(req)) return true;
  const token = shareTokenFromRequest(req);
  if (!token) return false;
  const link = validateShareToken(String(token));
  return !!link && link.link_kind === "ui";
}

export function allowsShareTokenApiRead(req, getAppSession, apiPath) {
  return (
    req.method === "GET" &&
    isShareTokenReadablePath(apiPath) &&
    hasSessionOrShareToken(req, getAppSession)
  );
}

export function allowsGuestHandlerAuthPost(req, apiPath) {
  return req.method === "POST" && GUEST_HANDLER_AUTH_POST_PATHS.has(apiPath);
}
