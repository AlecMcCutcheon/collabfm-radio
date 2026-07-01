import { getAppSession } from "../auth/routes.js";
import { permissionsForRole } from "../auth/permissions.js";
import {
  canCreateGuestBroadcasterLinks,
  countActiveShareLinksForUser,
  createShareLink,
  defaultTtlFromOptions,
  enrichShareLink,
  guestBroadcasterTtlOptionsForRole,
  listenerLinkTtlOptionsForRole,
  listShareLinksForUser,
  MAX_ACTIVE_SHARE_LINKS_PER_USER,
  resolveTtlForCreate,
  revokeShareLink,
  userOwnsShareLink,
} from "../db/shareLinks.js";
import { resolvePublicBaseUrl } from "./publicBaseUrl.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sessionRole(session) {
  return session?.user?.role || "listener";
}

function canCreateShareLinks(session) {
  if (!session?.user) return false;
  return permissionsForRole(sessionRole(session)).canCreateShareLinks === true;
}

function shareLinkOptionsPayload(role) {
  return {
    listenerTtlOptions: listenerLinkTtlOptionsForRole(role),
    guestBroadcasterTtlOptions: guestBroadcasterTtlOptionsForRole(role),
    canCreateGuestBroadcaster: canCreateGuestBroadcasterLinks(role),
    maxLinks: MAX_ACTIVE_SHARE_LINKS_PER_USER,
  };
}

export async function handleUserShareLinkRoutes(req, res, pathname, method) {
  if (!pathname.startsWith("/api/share-links")) return false;

  const session = getAppSession(req);
  if (!session?.user) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const userId = Number(session.user.id);
  const role = sessionRole(session);
  const base = resolvePublicBaseUrl(req);

  if (pathname === "/api/share-links" && method === "GET") {
    if (!canCreateShareLinks(session)) {
      return json(res, 403, { error: "Share links are not available for this account" });
    }
    const links = listShareLinksForUser(userId).map((row) => enrichShareLink(row, base));
    return json(res, 200, {
      links,
      ...shareLinkOptionsPayload(role),
    });
  }

  if (pathname === "/api/share-links" && method === "POST") {
    if (!canCreateShareLinks(session)) {
      return json(res, 403, { error: "Share links are not available for this account" });
    }
    try {
      const body = await readBody(req);
      if (countActiveShareLinksForUser(userId) >= MAX_ACTIVE_SHARE_LINKS_PER_USER) {
        return json(res, 429, {
          error: `You can have at most ${MAX_ACTIVE_SHARE_LINKS_PER_USER} active share links. Revoke one first.`,
        });
      }
      const guestMode = body.guestMode === "guest_broadcaster" ? "guest_broadcaster" : "listener";
      if (guestMode === "guest_broadcaster" && !canCreateGuestBroadcasterLinks(role)) {
        return json(res, 403, { error: "Guest broadcaster links require broadcaster or admin role" });
      }
      const ttl = resolveTtlForCreate({ role, guestMode, ttl: body.ttl });
      const link = createShareLink({
        label: body.label ? String(body.label).trim() : null,
        linkKind: "ui",
        guestMode,
        ttl,
        createdBy: userId,
        creatorRole: role,
      });
      return json(res, 201, { link: enrichShareLink(link, base) });
    } catch (e) {
      return json(res, 400, { error: e.message || "Invalid request" });
    }
  }

  const delMatch = pathname.match(/^\/api\/share-links\/(\d+)$/);
  if (delMatch && method === "DELETE") {
    if (!canCreateShareLinks(session)) {
      return json(res, 403, { error: "Share links are not available for this account" });
    }
    const linkId = Number(delMatch[1]);
    if (!userOwnsShareLink(userId, linkId)) {
      return json(res, 404, { error: "Link not found" });
    }
    revokeShareLink(linkId);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not found" });
}
