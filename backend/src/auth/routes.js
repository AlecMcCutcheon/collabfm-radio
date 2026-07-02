import {
  createLocalUser,
  createSession,
  deleteSession,
  getSession,
  getSetting,
  getUserById,
  getUserByUsername,
  resolveUserForLocalLogin,
  promoteSessionToFull,
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
import {
  SESSION_SCOPE_FULL,
  SESSION_SCOPE_TOTP_SETUP,
  SESSION_SCOPE_TOTP_SETUP_OPTIONAL,
  SESSION_SCOPE_TOTP_VERIFY,
  TOTP_SETUP_TTL_MS,
  TOTP_VERIFY_TTL_MS,
  beginTotpSetupForUser,
  confirmTotpSetupForUser,
  userExemptFrom2faEnforcement,
  userNeedsMandatoryTotpSetup,
  userShouldPromptOptionalTotpSetup,
  userNeedsTotpVerify,
  verifyUserTotpLogin,
} from "./totp.js";
import { permissionsForRole, roleInfoForUser } from "./permissions.js";
import { avatarUrlForUserId, publicDisplayName } from "../db/userProfile.js";
import { touchUserVisit } from "../db/userActivity.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { verifyTurnstileToken, publicTurnstileSiteKey } from "../security/turnstile.js";
import { normalizeOidcConfig } from "./oidcUser.js";
import { getRegistrationSettings } from "../settings/registration.js";
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

function sessionFromRow(row, token) {
  return {
    token,
    scope: row.scope || SESSION_SCOPE_FULL,
    loginMethod: row.login_method === "oidc" ? "oidc" : "local",
    user: {
      id: String(row.user_id),
      username: row.username,
      role: row.role,
      authSource: row.auth_source,
    },
  };
}

/** Any session scope (full or pending 2FA). */
export function getAuthSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.radio_session;
  if (!token) return null;
  const row = getSession(token);
  if (!row) return null;
  if ((row.scope || SESSION_SCOPE_FULL) === SESSION_SCOPE_FULL) {
    touchUserVisit(row.user_id, clientIp(req));
  }
  return sessionFromRow(row, token);
}

/** Full authenticated session only — used by most API routes. */
export function getAppSession(req) {
  const session = getAuthSession(req);
  if (!session || session.scope !== SESSION_SCOPE_FULL) return null;
  return session;
}

export function createScopedSession(req, res, userId, scope, ttlMs, loginMethod = "local") {
  const token = generateSessionToken();
  createSession(token, userId, Date.now() + ttlMs, scope, loginMethod);
  touchUserVisit(userId, clientIp(req), { force: true });
  res.setHeader("Set-Cookie", setSessionCookieHeader(token, isSecureRequest(req)));
  return getUserById(userId);
}

function createUserSession(req, res, userId, loginMethod = "local") {
  return createScopedSession(
    req,
    res,
    userId,
    SESSION_SCOPE_FULL,
    SESSION_TTL_MS,
    loginMethod,
  );
}

function loginSuccessPayload(user) {
  const perms = permissionsForRole(user.role);
  return {
    authenticated: true,
    user: { username: user.username, role: user.role },
    permissions: perms,
  };
}

export function finishFullLogin(req, res, user) {
  createUserSession(req, res, user.id);
  return loginSuccessPayload(user);
}

function clearAuthCookie(res, req) {
  res.setHeader("Set-Cookie", clearSessionCookie(isSecureRequest(req)));
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

  const userRow = getUserById(Number(session.user.id));
  if (session.scope !== SESSION_SCOPE_FULL) {
    const pending2fa =
      session.scope === SESSION_SCOPE_TOTP_SETUP
        ? "setup"
        : session.scope === SESSION_SCOPE_TOTP_SETUP_OPTIONAL
          ? "setup_optional"
          : "verify";
    return {
      authenticated: false,
      pending2fa,
      canSkip2faSetup: session.scope === SESSION_SCOPE_TOTP_SETUP_OPTIONAL,
      user: {
        id: session.user.id,
        username: userRow?.username ?? session.user.username,
        displayName: publicDisplayName(userRow) || session.user.username,
      },
      permissions: {},
      oidcAvailable: oidc.enabled === true,
    };
  }

  const roleInfo = roleInfoForUser({ role: session.user.role });
  const perms = roleInfo.permissions;
  const oidcCfg = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
  const sessionLoginMethod = session.loginMethod === "oidc" ? "oidc" : "local";
  return {
    authenticated: true,
    sessionLoginMethod,
    ssoNickname:
      sessionLoginMethod === "oidc" && oidcCfg.providerNickname
        ? oidcCfg.providerNickname
        : null,
    user: {
      id: session.user.id,
      username: userRow?.username ?? session.user.username,
      displayName: publicDisplayName(userRow) || session.user.username,
      avatar: avatarUrlForUserId(session.user.id),
      authSource: userRow?.auth_source ?? session.user.authSource,
      hasPassword: !!(userRow?.password_hash && String(userRow.password_hash).trim()),
    },
    hybridUsersEnabled: oidcCfg.hybridUsersEnabled === true,
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
    const registration = getRegistrationSettings();
    return json(res, 200, {
      local: true,
      oidc: oidc.enabled === true,
      registrationEnabled: registration.enabled === true,
      turnstileSiteKey: publicTurnstileSiteKey(),
      ssoNickname:
        oidc.enabled === true && normalized.providerNickname
          ? normalized.providerNickname
          : null,
    });
  }

  if (pathname === "/auth/status" && method === "GET") {
    const session = getAuthSession(req);
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
      const identifier = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!identifier || !password) return json(res, 400, { error: "Username and password required" });

      if (
        isSetupComplete() &&
        isRecoveryActive() &&
        identifier.toLowerCase() === BOOTSTRAP_USERNAME.toLowerCase()
      ) {
        const ok = await verifyRecoveryToken(password);
        if (!ok) return json(res, 401, { error: "Invalid credentials" });
        const admin = getFirstAdminUser();
        if (!admin) return json(res, 503, { error: "No admin account found" });
        clearRecoveryMode();
        const payload = finishFullLogin(req, res, admin);
        return json(res, 200, { ...payload, recoveryLogin: true });
      }

      const user = resolveUserForLocalLogin(identifier);
      if (!user || !user.enabled) return json(res, 401, { error: "Invalid credentials" });
      if (user.auth_source === "oidc" && !user.password_hash) {
        return json(res, 401, { error: "Use SSO for this account" });
      }
      if (user.auth_source !== "local" && user.auth_source !== "oidc") {
        return json(res, 401, { error: "Use SSO for this account" });
      }
      if (!user.password_hash) return json(res, 401, { error: "Invalid credentials" });
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return json(res, 401, { error: "Invalid credentials" });

      if (userNeedsTotpVerify(user)) {
        createScopedSession(req, res, user.id, SESSION_SCOPE_TOTP_VERIFY, TOTP_VERIFY_TTL_MS);
        return json(res, 200, {
          requires2fa: true,
          pending2fa: "verify",
          user: { username: user.username, role: user.role },
        });
      }
      if (userNeedsMandatoryTotpSetup(user)) {
        createScopedSession(req, res, user.id, SESSION_SCOPE_TOTP_SETUP, TOTP_SETUP_TTL_MS);
        return json(res, 200, {
          requires2faSetup: true,
          pending2fa: "setup",
          user: { username: user.username, role: user.role },
        });
      }
      if (userShouldPromptOptionalTotpSetup(user)) {
        createScopedSession(
          req,
          res,
          user.id,
          SESSION_SCOPE_TOTP_SETUP_OPTIONAL,
          TOTP_SETUP_TTL_MS,
        );
        return json(res, 200, {
          requires2faSetup: true,
          optional2faSetup: true,
          pending2fa: "setup_optional",
          user: { username: user.username, role: user.role },
        });
      }

      return json(res, 200, finishFullLogin(req, res, user));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === "/auth/local/2fa/verify" && method === "POST") {
    try {
      const rl = consumeRateLimit(`2fa:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 20 });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
      }
      const session = getAuthSession(req);
      if (!session || session.scope !== SESSION_SCOPE_TOTP_VERIFY) {
        return json(res, 401, { error: "Unauthorized" });
      }
      const user = getUserById(Number(session.user.id));
      if (!user) return json(res, 401, { error: "Unauthorized" });
      const body = await readBody(req);
      const result = await verifyUserTotpLogin(user, {
        code: body.code,
        backupCode: body.backupCode,
      });
      if (result && typeof result === "object" && result.error) {
        return json(res, 400, { error: result.error });
      }
      if (!result) return json(res, 401, { error: "Invalid authentication code" });
      promoteSessionToFull(session.token);
      return json(res, 200, loginSuccessPayload(user));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === "/auth/local/2fa/setup/skip" && method === "POST") {
    const session = getAuthSession(req);
    if (!session || session.scope !== SESSION_SCOPE_TOTP_SETUP_OPTIONAL) {
      return json(res, 401, { error: "Unauthorized" });
    }
    const user = getUserById(Number(session.user.id));
    if (!user || !userExemptFrom2faEnforcement(user)) {
      return json(res, 403, { error: "Forbidden" });
    }
    promoteSessionToFull(session.token);
    return json(res, 200, loginSuccessPayload(user));
  }

  if (pathname === "/auth/local/2fa/setup/begin" && method === "GET") {
    const session = getAuthSession(req);
    if (
      !session ||
      (session.scope !== SESSION_SCOPE_TOTP_SETUP &&
        session.scope !== SESSION_SCOPE_TOTP_SETUP_OPTIONAL &&
        session.scope !== SESSION_SCOPE_FULL)
    ) {
      return json(res, 401, { error: "Unauthorized" });
    }
    const user = getUserById(Number(session.user.id));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const setup = await beginTotpSetupForUser(user);
    return json(res, 200, {
      qrDataUrl: setup.qrDataUrl,
      secret: setup.secret,
      uri: setup.uri,
    });
  }

  if (pathname === "/auth/local/2fa/setup/confirm" && method === "POST") {
    try {
      const rl = consumeRateLimit(`2fa:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 20 });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
      }
      const session = getAuthSession(req);
      if (
        !session ||
        (session.scope !== SESSION_SCOPE_TOTP_SETUP &&
          session.scope !== SESSION_SCOPE_TOTP_SETUP_OPTIONAL &&
          session.scope !== SESSION_SCOPE_FULL)
      ) {
        return json(res, 401, { error: "Unauthorized" });
      }
      const user = getUserById(Number(session.user.id));
      if (!user) return json(res, 401, { error: "Unauthorized" });
      const body = await readBody(req);
      const result = await confirmTotpSetupForUser(user, body.code);
      if (result.error) return json(res, result.status, { error: result.error });
      const wasPending = session.scope !== SESSION_SCOPE_FULL;
      if (wasPending) {
        promoteSessionToFull(session.token);
      }
      return json(res, 200, {
        ...(wasPending ? loginSuccessPayload(result.user) : { ok: true }),
        backupCodes: result.backupCodes,
      });
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === "/auth/logout" && (method === "POST" || method === "GET")) {
    const session = getAuthSession(req);
    let redirectTarget = "/";

    if (session?.loginMethod === "oidc") {
      const normalized = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
      if (normalized.logoutUrl) {
        redirectTarget = normalized.logoutUrl;
      }
    }

    if (session?.token) deleteSession(session.token);
    clearAuthCookie(res, req);
    if (method === "GET") return redirect(res, redirectTarget);
    return json(res, 200, {
      ok: true,
      redirect: redirectTarget === "/" ? null : redirectTarget,
      sessionLoginMethod: session?.loginMethod === "oidc" ? "oidc" : "local",
    });
  }

  if (pathname === "/auth/oidc/login" && method === "GET") {
    if (!oidc.enabled) return json(res, 404, { error: "OIDC not enabled" });
    const { handleOidcLogin } = await import("./oidc.js");
    return await handleOidcLogin(req, res, oidc);
  }

  if (pathname === "/auth/oidc/callback" && method === "GET") {
    if (!oidc.enabled) return json(res, 404, { error: "OIDC not enabled" });
    const { handleOidcCallback } = await import("./oidc.js");
    return handleOidcCallback(req, res, oidc, createUserSession, getAppSession);
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
