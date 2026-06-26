import {
  createLocalUser,
  createSession,
  deleteSession,
  getSession,
  getSetting,
  getUserById,
  getUserByUsername,
  setSetting,
} from "../db/index.js";
import {
  clearSessionCookie,
  generateSessionToken,
  hashPassword,
  parseCookies,
  SESSION_TTL_MS,
  setSessionCookieHeader,
  verifyPassword,
} from "./session.js";
import { permissionsForRole, roleInfoForUser } from "./permissions.js";
import { avatarUrlForUserId, publicDisplayName } from "../db/userProfile.js";
import { touchUserVisit } from "../db/userActivity.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { verifyTurnstileToken, publicTurnstileSiteKey } from "../security/turnstile.js";
import { normalizeOidcConfig } from "./oidcUser.js";
import { clearBootstrapToken, clearRecoveryMode, BOOTSTRAP_USERNAME, getFirstAdminUser, isRecoveryActive, verifyRecoveryToken } from "../setup/bootstrapToken.js";
import { isSetupComplete } from "../db/index.js";

function isSecureRequest(req) {
  if (req.headers["x-forwarded-proto"] === "https") return true;
  return false;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
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

export function getAppSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.radio_session;
  if (!token) return null;
  const row = getSession(token);
  if (!row) return null;
  touchUserVisit(row.user_id, clientIp(req));
  return {
    token,
    user: {
      id: String(row.user_id),
      username: row.username,
      role: row.role,
      authSource: row.auth_source,
    },
  };
}

function createUserSession(req, res, userId) {
  const token = generateSessionToken();
  createSession(token, userId, Date.now() + SESSION_TTL_MS);
  touchUserVisit(userId, clientIp(req), { force: true });
  res.setHeader("Set-Cookie", setSessionCookieHeader(token, isSecureRequest(req)));
  return getUserById(userId);
}

export function authStatusPayload(session) {
  const oidc = getSetting("oidc", { enabled: false });
  if (!session) {
    return {
      authenticated: false,
      user: null,
      permissions: {},
      oidcAvailable: oidc.enabled === true,
    };
  }
  const roleInfo = roleInfoForUser({ role: session.user.role });
  const perms = roleInfo.permissions;
  const userRow = getUserById(Number(session.user.id));
  return {
    authenticated: true,
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: publicDisplayName(userRow) || session.user.username,
      avatar: avatarUrlForUserId(session.user.id),
    },
    canBroadcast: perms.canBroadcast === true,
    isHost: perms.canBroadcast === true || session.user.role === "admin",
    roleInfo: {
      level: roleInfo.level === "ADMIN" ? 3 : roleInfo.level === "BROADCASTER" ? 2 : 1,
      roleType: session.user.role,
      permissions: perms,
      roleColor: roleInfo.roleColor,
    },
    permissions: perms,
    oidcAvailable: oidc.enabled === true,
  };
}

export async function handleAuthRoutes(req, res, pathname, method) {
  const oidc = getSetting("oidc", { enabled: false });

  if (pathname === "/auth/methods" && method === "GET") {
    const normalized = normalizeOidcConfig(oidc);
    return json(res, 200, {
      local: true,
      oidc: oidc.enabled === true,
      turnstileSiteKey: publicTurnstileSiteKey(),
      ssoNickname:
        oidc.enabled === true && normalized.providerNickname
          ? normalized.providerNickname
          : null,
    });
  }

  if (pathname === "/auth/status" && method === "GET") {
    const session = getAppSession(req);
    return json(res, 200, authStatusPayload(session));
  }

  if (pathname === "/auth/local/login" && method === "POST") {
    try {
      const rl = consumeRateLimit(`login:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 12 });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many login attempts", retryAfterMs: rl.retryAfterMs });
      }
      const body = await readBody(req);
      const turnstile = await verifyTurnstileToken(
        body.turnstileToken,
        clientIp(req),
      );
      if (!turnstile.ok) {
        return json(res, 403, { error: turnstile.error || "Verification failed" });
      }
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) return json(res, 400, { error: "Username and password required" });

      if (
        isSetupComplete() &&
        isRecoveryActive() &&
        username.toLowerCase() === BOOTSTRAP_USERNAME.toLowerCase()
      ) {
        const ok = await verifyRecoveryToken(password);
        if (!ok) return json(res, 401, { error: "Invalid credentials" });
        const admin = getFirstAdminUser();
        if (!admin) return json(res, 503, { error: "No admin account found" });
        clearRecoveryMode();
        createUserSession(req, res, admin.id);
        const perms = permissionsForRole(admin.role);
        return json(res, 200, {
          authenticated: true,
          user: { username: admin.username, role: admin.role },
          permissions: perms,
          recoveryLogin: true,
        });
      }

      const user = getUserByUsername(username);
      if (!user || !user.enabled) return json(res, 401, { error: "Invalid credentials" });
      if (user.auth_source !== "local") return json(res, 401, { error: "Use SSO for this account" });
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return json(res, 401, { error: "Invalid credentials" });
      createUserSession(req, res, user.id);
      const perms = permissionsForRole(user.role);
      return json(res, 200, {
        authenticated: true,
        user: { username: user.username, role: user.role },
        permissions: perms,
      });
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === "/auth/logout" && (method === "POST" || method === "GET")) {
    const session = getAppSession(req);
    let redirectTarget = "/";

    if (session?.user?.id) {
      const user = getUserById(Number(session.user.id));
      if (user?.auth_source === "oidc") {
        const normalized = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
        if (normalized.logoutUrl) {
          redirectTarget = normalized.logoutUrl;
        }
      }
    }

    if (session?.token) deleteSession(session.token);
    res.setHeader("Set-Cookie", clearSessionCookie(isSecureRequest(req)));
    if (method === "GET") return redirect(res, redirectTarget);
    return json(res, 200, { ok: true, redirect: redirectTarget === "/" ? null : redirectTarget });
  }

  if (pathname === "/auth/oidc/login" && method === "GET") {
    if (!oidc.enabled) return json(res, 404, { error: "OIDC not enabled" });
    const { handleOidcLogin } = await import("./oidc.js");
    return await handleOidcLogin(req, res, oidc);
  }

  if (pathname === "/auth/oidc/callback" && method === "GET") {
    if (!oidc.enabled) return json(res, 404, { error: "OIDC not enabled" });
    const { handleOidcCallback } = await import("./oidc.js");
    return handleOidcCallback(req, res, oidc, createUserSession);
  }

  return false;
}

export { mapRoleFromOidcGroups, provisionOidcUser } from "./oidcUser.js";

export async function createBootstrapAdmin({ username, password, publicBaseUrl, allowedOrigins }) {
  const hash = await hashPassword(password);
  const user = createLocalUser({ username, passwordHash: hash, role: "admin" });
  if (publicBaseUrl) setSetting("publicBaseUrl", publicBaseUrl);
  if (allowedOrigins) setSetting("allowedOrigins", allowedOrigins);
  setSetting("oidc", { enabled: false });
  clearBootstrapToken();
  clearRecoveryMode();
  return user;
}
