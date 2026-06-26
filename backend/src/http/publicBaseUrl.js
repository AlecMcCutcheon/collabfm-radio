import { getSetting } from "../db/index.js";

function isLocalHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

function publicBaseFromRequest(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return "";

  const hostStr = String(host).split(",")[0].trim();
  if (!hostStr) return "";

  const xfProto = req.headers["x-forwarded-proto"];
  let proto = "http";
  if (xfProto) {
    proto = String(xfProto).split(",")[0].trim() || "http";
  } else if (req.socket?.encrypted) {
    proto = "https";
  }

  return `${proto}://${hostStr}`.replace(/\/$/, "");
}

/** Admin-configured public site origin (no trailing slash). */
export function getConfiguredPublicBaseUrl() {
  const configured = String(getSetting("publicBaseUrl", "") || "")
    .trim()
    .replace(/\/+$/, "");
  if (!configured) return "";
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
}

function proceduralArtPathname(pathname) {
  const path = String(pathname || "");
  return path.startsWith("/art/track") || path.startsWith("/api/art/track");
}

/** Prefer the public /art/track path in absolute URLs (Discord + nginx-friendly). */
export function normalizeProceduralArtPublicUrl(url) {
  const text = String(url || "").trim();
  if (!text) return text;
  return text.replace(/\/api\/art\/track\b/g, "/art/track");
}

/**
 * Turn a stored art URL into an absolute public URL using the current admin setting.
 * Relative paths and stale absolute procedural URLs are re-resolved on every call.
 */
export function resolvePublicAlbumArtUrl(url, fallbackOrigin = null) {
  const text = String(url || "").trim();
  if (!text) return null;

  const origin = getConfiguredPublicBaseUrl() || fallbackOrigin || null;

  try {
    if (text.startsWith("http://") || text.startsWith("https://")) {
      const parsed = new URL(text);
      if (proceduralArtPathname(parsed.pathname) && origin) {
        const path = parsed.pathname.replace(/^\/api\/art\/track\b/, "/art/track");
        return `${origin}${path}${parsed.search}`;
      }
      return normalizeProceduralArtPublicUrl(text);
    }
  } catch {
    return text;
  }

  if (text.startsWith("/") && origin) {
    return normalizeProceduralArtPublicUrl(`${origin}${text}`);
  }

  return normalizeProceduralArtPublicUrl(text);
}

/** Public site origin for share links — prefers the URL the client used to reach the API. */
export function resolvePublicBaseUrl(req) {
  const fromRequest = publicBaseFromRequest(req);
  if (fromRequest && !isLocalHostname(new URL(fromRequest).hostname)) {
    return fromRequest;
  }

  const configured = getConfiguredPublicBaseUrl();
  if (configured) {
    try {
      if (!isLocalHostname(new URL(configured).hostname)) return configured;
    } catch {
      return configured;
    }
  }

  return fromRequest || configured || "";
}
