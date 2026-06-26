import { validateShareToken } from "../db/shareLinks.js";

export function shareTokenFromRequest(req) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    return url.searchParams.get("shareToken") || url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}

/** GET routes that accept a valid UI share token (listener or guest broadcaster). */
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
]);

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
    SHARE_TOKEN_READ_API_PATHS.has(apiPath) &&
    hasSessionOrShareToken(req, getAppSession)
  );
}

export function allowsGuestHandlerAuthPost(req, apiPath) {
  return req.method === "POST" && GUEST_HANDLER_AUTH_POST_PATHS.has(apiPath);
}
