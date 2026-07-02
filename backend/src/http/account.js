import { getAppSession } from "../auth/routes.js";
import { getUserById } from "../db/index.js";
import { publicUserPresentation } from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import {
  normalizeOidcConfig,
  resolveEmailFromOidcProfile,
} from "../auth/oidcUser.js";
import {
  applyHybridOidcPassword,
  hasPasswordHash,
} from "../auth/hybridPassword.js";
import { resetLocalAccountPassword } from "../auth/localPassword.js";
import {
  beginTotpSetupForUser,
  confirmTotpSetupForUser,
  disableTotpForUser,
  localLogin2faRequired,
  regenerateBackupCodesForUser,
  userExemptFrom2faEnforcement,
  userHasLocalPassword,
  userTotpEnabled,
} from "../auth/totp.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { publishPresenceRoster, publishProfileChanged } from "./liveEvents.js";
import {
  listSitePresenceRoster,
  updateSitePresenceActorProfile,
} from "../presence/sitePresence.js";
import { getSetting } from "../db/index.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
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

function accountSecurityPayload(user) {
  const oidc = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
  const hybridEnabled = oidc.hybridUsersEnabled === true;
  const email = resolveEmailFromOidcProfile(user);
  const hasPassword = hasPasswordHash(user);
  const isOidc = user.auth_source === "oidc";
  const isLocal = user.auth_source === "local";
  const canSetPassword =
    hybridEnabled && isOidc && !hasPassword;
  const canResetPassword =
    (hybridEnabled && isOidc && hasPassword) || (isLocal && hasPassword);
  const passwordResetRequiresCurrent = isLocal && hasPassword;
  const needsOidcVerification = canSetPassword && !email;
  const canManageTotp = userHasLocalPassword(user);
  const totpEnabled = userTotpEnabled(user);
  const enforced = localLogin2faRequired();
  const exempt = userExemptFrom2faEnforcement(user);

  return {
    hybridEnabled,
    authSource: user.auth_source,
    hasPassword,
    canSetPassword,
    canResetPassword,
    passwordResetRequiresCurrent,
    emailKnown: !!email,
    needsOidcVerification,
    oidcVerifyUrl: needsOidcVerification ? "/auth/oidc/login?intent=hybrid_verify" : null,
    ssoNickname: oidc.providerNickname || null,
    canManageTotp,
    totpEnabled,
    localLogin2faRequired: enforced,
    canDisableTotp: totpEnabled && (!enforced || exempt),
    totpExempt: exempt,
  };
}

function publishAccountProfileUpdate(user) {
  const presentation = publicUserPresentation(user);
  const roleInfo = roleInfoForUser(user);
  updateSitePresenceActorProfile(String(user.id), {
    displayName: presentation.displayName || user.username,
    avatar: presentation.avatar,
    roleColor: roleInfo.roleColor,
    roleType: user.role,
    level: presentation.level?.level,
  });
  publishPresenceRoster(listSitePresenceRoster());
  publishProfileChanged({
    userId: String(user.id),
    isGuest: false,
    profile: {
      userId: String(user.id),
      username: user.username,
      displayName: presentation.displayName || user.username,
      avatarUrl: presentation.avatar,
      bio: presentation.bio,
      genres: presentation.genres,
      level: presentation.level,
    },
  });
}

export async function handleAccountRoutes(req, res, pathname, method) {
  if (!pathname.startsWith("/api/account")) return false;

  const session = getAppSession(req);
  if (!session?.user?.id) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }

  const user = getUserById(Number(session.user.id));
  if (!user) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }

  if (pathname === "/api/account/security" && method === "GET") {
    json(res, 200, accountSecurityPayload(user));
    return true;
  }

  if (pathname === "/api/account/password" && method === "POST") {
    try {
      const rl = consumeRateLimit(`account-password:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 12,
      });
      if (!rl.allowed) {
        json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
        return true;
      }

      if (hasPasswordHash(user)) {
        json(res, 400, { error: "Password already set — use reset instead" });
        return true;
      }

      const body = await readBody(req);
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || body.password || "");
      if (!password || password !== confirmPassword) {
        json(res, 400, { error: "Passwords must match" });
        return true;
      }

      const result = await applyHybridOidcPassword(user, password, {
        requireEmailOnFile: true,
      });
      if (result.error) {
        json(res, result.status, { error: result.error });
        return true;
      }
      publishAccountProfileUpdate(result.user);
      json(res, 200, {
        ok: true,
        security: accountSecurityPayload(result.user),
        username: result.user.username,
      });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/account/password" && method === "PUT") {
    try {
      const rl = consumeRateLimit(`account-password:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 12,
      });
      if (!rl.allowed) {
        json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
        return true;
      }

      if (!hasPasswordHash(user)) {
        json(res, 400, { error: "No password set yet" });
        return true;
      }

      const body = await readBody(req);
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || "");
      if (!password || password !== confirmPassword) {
        json(res, 400, { error: "Passwords must match" });
        return true;
      }

      if (user.auth_source === "local") {
        const currentPassword = String(body.currentPassword || "");
        const result = await resetLocalAccountPassword(user, currentPassword, password);
        if (result.error) {
          json(res, result.status, { error: result.error });
          return true;
        }
        publishAccountProfileUpdate(result.user);
        json(res, 200, { ok: true, security: accountSecurityPayload(result.user) });
        return true;
      }

      const result = await applyHybridOidcPassword(user, password, {
        requireEmailOnFile: false,
      });
      if (result.error) {
        json(res, result.status, { error: result.error });
        return true;
      }
      publishAccountProfileUpdate(result.user);
      json(res, 200, { ok: true, security: accountSecurityPayload(result.user) });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/account/totp/setup/begin" && method === "POST") {
    if (!userHasLocalPassword(user)) {
      json(res, 400, { error: "Set a password before enabling 2FA" });
      return true;
    }
    const setup = await beginTotpSetupForUser(user);
    json(res, 200, {
      qrDataUrl: setup.qrDataUrl,
      secret: setup.secret,
      uri: setup.uri,
    });
    return true;
  }

  if (pathname === "/api/account/totp/confirm" && method === "POST") {
    try {
      const rl = consumeRateLimit(`account-totp:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 20,
      });
      if (!rl.allowed) {
        json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
        return true;
      }
      const body = await readBody(req);
      const result = await confirmTotpSetupForUser(user, body.code);
      if (result.error) {
        json(res, result.status, { error: result.error });
        return true;
      }
      json(res, 200, {
        ok: true,
        backupCodes: result.backupCodes,
        security: accountSecurityPayload(result.user),
      });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/account/totp" && method === "DELETE") {
    try {
      const rl = consumeRateLimit(`account-totp:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 20,
      });
      if (!rl.allowed) {
        json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
        return true;
      }
      const body = await readBody(req);
      const result = await disableTotpForUser(user, {
        code: body.code,
        backupCode: body.backupCode,
      });
      if (result.error) {
        json(res, result.status, { error: result.error });
        return true;
      }
      json(res, 200, { ok: true, security: accountSecurityPayload(result.user) });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/account/totp/backup-codes/regenerate" && method === "POST") {
    try {
      const rl = consumeRateLimit(`account-totp:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 12,
      });
      if (!rl.allowed) {
        json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
        return true;
      }
      const body = await readBody(req);
      const result = await regenerateBackupCodesForUser(user, body.code);
      if (result.error) {
        json(res, result.status, { error: result.error });
        return true;
      }
      json(res, 200, { ok: true, backupCodes: result.backupCodes });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  json(res, 404, { error: "Not found" });
  return true;
}
