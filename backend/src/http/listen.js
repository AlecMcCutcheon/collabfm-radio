import { validateShareToken } from "../db/shareLinks.js";
import { serveAuthenticatedStream } from "./stream.js";
import { getPublishedGuestProfile } from "./guestBroadcast.js";
import { isValidGuestId, mintGuestSession } from "../security/guestSession.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleListenRoutes(req, res, pathname, method, getSession) {
  const infoMatch = pathname.match(/^\/api\/listen\/([^/]+)$/);
  if (infoMatch && method === "GET") {
    const token = decodeURIComponent(infoMatch[1]);
    const link = validateShareToken(token);
    if (!link) {
      json(res, 404, { error: "Invalid or expired link" });
      return true;
    }
    let guestSession = null;
    let guestProfile = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const guestId = String(url.searchParams.get("guestId") || "").trim();
      if (guestId && isValidGuestId(guestId)) {
        guestSession = mintGuestSession(token, guestId);
        const profile = getPublishedGuestProfile(link.id, guestId);
        if (profile) {
          guestProfile = {
            displayName: profile.displayName,
            avatarVariant: profile.avatarVariant ?? 0,
            coverIcon: profile.coverIcon ?? 0,
          };
        }
      }
    } catch {
      /* ignore */
    }
    json(res, 200, {
      ok: true,
      linkKind: link.link_kind,
      guestMode: link.guest_mode || "listener",
      label: link.label,
      expiresAt: link.expires_at,
      guestSession,
      guestProfile,
      guestDisplayName: guestProfile?.displayName ?? null,
    });
    return true;
  }

  const streamMatch = pathname.match(/^\/api\/listen\/([^/]+)\/stream$/);
  if (streamMatch && method === "GET") {
    serveAuthenticatedStream(req, res, pathname, getSession);
    return true;
  }

  return false;
}
