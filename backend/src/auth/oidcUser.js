import { listOidcGroupMappings, getDb, getUserById, getUserByOidcSubject, getUserByUsername } from "../db/index.js";

export const OIDC_USERNAME_SOURCES = ["sub", "preferred_username", "name", "email"];

function normalizeLogoutUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    /* ignore invalid URLs */
  }
  return "";
}

export function mapRoleFromOidcGroups(groups) {
  const mappings = listOidcGroupMappings();
  const rank = { admin: 3, broadcaster: 2, listener: 1 };
  let best = "listener";
  let bestRank = 0;
  const groupSet = new Set((groups || []).map(String));
  for (const m of mappings) {
    if (groupSet.has(m.oidc_group)) {
      const r = rank[m.role] || 0;
      if (r > bestRank) {
        bestRank = r;
        best = m.role;
      }
    }
  }
  return best;
}

export function normalizeOidcConfig(oidc = {}) {
  const usernameFrom = OIDC_USERNAME_SOURCES.includes(oidc.usernameFrom)
    ? oidc.usernameFrom
    : "sub";
  return {
    ...oidc,
    usernameFrom,
    linkByNameMatch: oidc.linkByNameMatch === true,
    hybridUsersEnabled: oidc.hybridUsersEnabled === true,
    providerNickname: String(oidc.providerNickname || "").trim().slice(0, 32),
    logoutUrl: normalizeLogoutUrl(oidc.logoutUrl),
  };
}

const OIDC_CONFIG_PERSIST_KEYS = [
  "issuer",
  "clientId",
  "clientSecret",
  "redirectUri",
  "scopes",
  "groupClaim",
  "logoutUrl",
  "usernameFrom",
  "linkByNameMatch",
  "hybridUsersEnabled",
  "providerNickname",
  "authorizationEndpoint",
  "tokenEndpoint",
  "jwksUri",
];

/** When OIDC is disabled, keep stored provider settings unless explicitly replaced. */
export function mergeOidcConfigUpdate(current = {}, incoming = {}) {
  const next = normalizeOidcConfig({
    ...current,
    ...incoming,
    enabled: incoming.enabled === true,
  });
  if (next.enabled === true) return next;

  for (const key of OIDC_CONFIG_PERSIST_KEYS) {
    const incomingValue = incoming[key];
    const hadExplicitEmpty =
      key in incoming && (incomingValue === "" || incomingValue == null);
    if (
      hadExplicitEmpty &&
      current[key] != null &&
      current[key] !== "" &&
      key !== "clientSecret"
    ) {
      next[key] = current[key];
    }
  }
  if (
    (incoming.clientSecret === "********" ||
      incoming.clientSecret === "" ||
      incoming.clientSecret == null) &&
    current.clientSecret
  ) {
    next.clientSecret = current.clientSecret;
  }
  return next;
}

function sanitizeUsername(raw) {
  const s = String(raw || "").trim().slice(0, 64);
  if (!s) return null;
  const cleaned = s
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || null;
}

export function normalizeEmailUsername(raw) {
  const email = String(raw || "").trim().toLowerCase().slice(0, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function extractOidcProfileClaims(claims = {}) {
  const profile = {};
  for (const key of ["sub", "email", "email_verified", "name", "preferred_username"]) {
    if (claims[key] != null && claims[key] !== "") profile[key] = claims[key];
  }
  return profile;
}

export function parseOidcProfileJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveEmailFromOidcProfile(user) {
  const profile = parseOidcProfileJson(user?.oidc_profile_json);
  const email = normalizeEmailUsername(profile?.email);
  return email;
}

function persistOidcProfile(userId, claims) {
  const profile = extractOidcProfileClaims(claims);
  if (!Object.keys(profile).length) return;
  getDb()
    .prepare("UPDATE users SET oidc_profile_json = ? WHERE id = ?")
    .run(JSON.stringify(profile), userId);
}

function resolveDisplayLabel(claims) {
  const label = String(claims.name || claims.preferred_username || "").trim();
  return label ? label.slice(0, 64) : null;
}

function resolveUsernameRaw(claims, usernameFrom) {
  const sub = String(claims.sub || "");
  switch (usernameFrom) {
    case "email":
      return normalizeEmailUsername(claims.email) || claims.preferred_username || sub;
    case "preferred_username":
      return claims.preferred_username || claims.email?.split("@")[0] || sub;
    case "name":
      return claims.name || claims.preferred_username || sub;
    case "sub":
    default:
      return sub;
  }
}

function resolveUsernameBase(claims, usernameFrom) {
  if (usernameFrom === "email") {
    const email = normalizeEmailUsername(claims.email);
    if (email) return email;
  }
  const raw = resolveUsernameRaw(claims, usernameFrom);
  if (usernameFrom === "email") {
    return sanitizeUsername(raw) || sanitizeUsername(String(claims.sub || ""));
  }
  return (
    sanitizeUsername(raw) ||
    sanitizeUsername(String(claims.sub || "")) ||
    `user-${String(claims.sub || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "oidc"}`
  );
}

function uniqueUsername(base) {
  let finalName = base;
  let n = 1;
  while (getUserByUsername(finalName)) {
    finalName = `${base.slice(0, Math.max(1, 60 - String(n).length))}${n++}`;
  }
  return finalName;
}

function findLocalUserForNameLink(claims) {
  const candidates = [
    claims.preferred_username,
    claims.name,
    claims.email?.split("@")[0],
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const sanitized = sanitizeUsername(candidate);
    for (const lookup of [sanitized, candidate].filter(Boolean)) {
      const user = getUserByUsername(lookup);
      if (user && user.auth_source === "local" && !user.oidc_subject) {
        return user;
      }
    }
  }
  return null;
}

export function syncOidcProfileOnLogin(user, claims) {
  if (!user) return user;
  if (user.oidc_subject || user.auth_source === "oidc") {
    persistOidcProfile(user.id, claims);
  }
  if (user.auth_source !== "oidc") return user;
  const label = resolveDisplayLabel(claims);
  if (!label || String(user.display_name || "").trim()) return getUserById(user.id);
  getDb().prepare("UPDATE users SET display_name = ? WHERE id = ?").run(label, user.id);
  return getUserById(user.id);
}

export function provisionOidcUser(claims, oidcConfig = {}) {
  const oidc = normalizeOidcConfig(oidcConfig);
  const subject = String(claims.sub);
  let user = getUserByOidcSubject(subject);
  if (user) return syncOidcProfileOnLogin(user, claims);

  const groupClaim = claims.groupClaim || oidc.groupClaim || "groups";
  const groups = claims.groups || claims[groupClaim] || [];
  const role = mapRoleFromOidcGroups(Array.isArray(groups) ? groups : [groups]);

  if (oidc.linkByNameMatch) {
    const linked = findLocalUserForNameLink(claims);
    if (linked && linked.role === "listener") {
      const displayLabel = resolveDisplayLabel(claims);
      getDb()
        .prepare(
          `UPDATE users SET oidc_subject = ?, role = ?, display_name = COALESCE(display_name, ?)
           WHERE id = ?`
        )
        .run(subject, role, displayLabel, linked.id);
      const linkedUser = getUserById(linked.id);
      return syncOidcProfileOnLogin(linkedUser, claims);
    }
  }

  const sub = String(claims.sub || "");
  const base = resolveUsernameBase(claims, oidc.usernameFrom);
  const finalName = uniqueUsername(base);
  const displayName = oidc.usernameFrom === "sub" ? resolveDisplayLabel(claims) : null;

  const result = getDb()
    .prepare(
      `INSERT INTO users (username, auth_source, oidc_subject, role, enabled, display_name)
       VALUES (?, 'oidc', ?, ?, 1, ?)`
    )
    .run(finalName, subject, role, displayName);
  const created = getUserById(result.lastInsertRowid);
  return syncOidcProfileOnLogin(created, claims);
}
