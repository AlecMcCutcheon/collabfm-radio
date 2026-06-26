import { getSetting } from "../db/index.js";

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "string") return null;
  try {
    const u = new URL(origin);
    return u.origin;
  } catch {
    return null;
  }
}

function allowedOriginsList() {
  const fromSettings = getSetting("allowedOrigins", null);
  const list = Array.isArray(fromSettings) ? fromSettings : ["*"];
  return list.map((o) => String(o).trim()).filter(Boolean);
}

/** Origins for the site as reached by this request (respects reverse-proxy headers). */
function requestSiteOrigins(req) {
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  if (!hostHeader) return [];

  const host = String(hostHeader).split(",")[0].trim();
  if (!host) return [];

  const xfProto = req.headers["x-forwarded-proto"];
  if (xfProto) {
    const proto = String(xfProto).split(",")[0].trim();
    if (proto === "http" || proto === "https") {
      return [`${proto}://${host}`];
    }
  }

  if (req.socket?.encrypted) {
    return [`https://${host}`];
  }

  return [`http://${host}`, `https://${host}`];
}

function originMatchesRequestSite(req, origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return requestSiteOrigins(req).some((site) => normalizeOrigin(site) === normalized);
}

function originInAllowlist(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = allowedOriginsList();
  if (allowed.includes("*")) return true;

  const extras = [];
  const publicBase = String(getSetting("publicBaseUrl", "") || "").trim();
  if (publicBase) extras.push(publicBase);

  return [...allowed, ...extras].some((entry) => normalizeOrigin(entry) === normalized);
}

function isChromeExtensionOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    return new URL(origin).protocol === "chrome-extension:";
  } catch {
    return false;
  }
}

/** Routes the broadcaster extension may POST to (Bearer or guest body auth at handler). */
function isExtensionMutationPath(pathname) {
  return (
    pathname === "/api/metadata" ||
    pathname.startsWith("/api/metadata") ||
    pathname === "/api/capabilities" ||
    pathname === "/api/ws-token" ||
    pathname.startsWith("/api/extension/")
  );
}

function requestBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function isExtensionClientRequest(req, pathname) {
  if (!isExtensionMutationPath(pathname)) return false;

  const rawOrigin = req.headers.origin;
  if (rawOrigin && String(rawOrigin).startsWith("chrome-extension://")) {
    return true;
  }

  const referer = req.headers.referer || req.headers.referrer;
  if (referer && String(referer).startsWith("chrome-extension://")) {
    return true;
  }

  if (requestBearerToken(req)) {
    return true;
  }

  return false;
}

/**
 * CSRF mitigation for cookie-authenticated mutating API requests.
 * Same-origin browser traffic (including behind OpenResty/nginx) is always allowed.
 */
export function isMutationOriginAllowed(req, pathname) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }
  if (pathname.startsWith("/api/extension/")) return true;
  if (pathname.startsWith("/api/listen/")) return true;
  if (pathname.startsWith("/api/guest-broadcast/")) return true;
  if (pathname.startsWith("/auth/oidc/")) return true;
  if (isExtensionClientRequest(req, pathname)) return true;

  const origin = normalizeOrigin(req.headers.origin);
  if (origin && isChromeExtensionOrigin(origin) && isExtensionMutationPath(pathname)) {
    return true;
  }

  if (origin) {
    if (originMatchesRequestSite(req, origin)) return true;
    return originInAllowlist(origin);
  }

  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return true;

  try {
    const refOrigin = new URL(String(referer)).origin;
    if (isChromeExtensionOrigin(refOrigin) && isExtensionMutationPath(pathname)) {
      return true;
    }
    if (originMatchesRequestSite(req, refOrigin)) return true;
    return originInAllowlist(refOrigin);
  } catch {
    return false;
  }
}
