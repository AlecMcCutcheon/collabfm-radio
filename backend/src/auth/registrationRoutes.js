import { createLocalUser, getUserByUsername, isLoginEmailAvailable, updateUser } from "../db/index.js";
import {
  approveRegistrationRequest,
  createRegistrationRequest,
  denyRegistrationRequest,
  decryptRegistrationToken,
  encryptRegistrationToken,
  findActiveRegistrationRequestByEmail,
  generateRegistrationToken,
  getRegistrationRequestById,
  getRegistrationRequestByTokenHash,
  hashRegistrationToken,
  listRegistrationRequests,
  markRegistrationRequestActivated,
  deleteRegistrationRequest,
  regenerateRegistrationRequestToken,
} from "../db/registrationRequests.js";
import {
  getRegistrationSettings,
  publicRegistrationConfig,
  registrationSettingsAdminPayload,
  resetRegistrationSettingsToDefaults,
  saveRegistrationSettings,
  summarizeRegistrationAnswers,
  validateRegistrationAnswers,
  buildCountryVerification,
} from "../settings/registration.js";
import { hashPassword } from "./session.js";
import { BOOTSTRAP_USERNAME } from "../setup/bootstrapToken.js";
import { createScopedSession, finishFullLogin } from "./routes.js";
import {
  SESSION_SCOPE_TOTP_SETUP,
  SESSION_SCOPE_TOTP_SETUP_OPTIONAL,
  TOTP_SETUP_TTL_MS,
  userNeedsMandatoryTotpSetup,
  userShouldPromptOptionalTotpSetup,
} from "./totp.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { verifyTurnstileToken } from "../security/turnstile.js";
import { lookupIpGeolocation, isLocalOrPrivateIp } from "../security/geoLookup.js";

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
      } catch {
        reject(new Error("Invalid request"));
      }
    });
    req.on("error", () => reject(new Error("Invalid request")));
  });
}

function normalizeInputToken(token) {
  return String(token || "").trim().toUpperCase();
}

function registrationDisabled(res) {
  return json(res, 403, { error: "Registration is not available" });
}

function publicRequestPayload(request, settings) {
  return {
    id: request.id,
    email: request.email,
    displayName: request.displayName || null,
    status: request.status,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    denyReason: request.denyReason,
    activatedAt: request.activatedAt,
    summary: summarizeRegistrationAnswers(settings, request.answers),
  };
}

function adminRequestPayload(request, settings) {
  const applicantIp = request.applicantIp || null;
  const applicantGeo = request.applicantGeo || null;
  return {
    ...publicRequestPayload(request, settings),
    applicantIp,
    applicantIpIsLocal: applicantIp ? isLocalOrPrivateIp(applicantIp) : false,
    applicantGeo,
    countryVerification: buildCountryVerification(settings, request.answers, applicantGeo),
    registrationToken: request.tokenEncrypted
      ? decryptRegistrationToken(request.tokenEncrypted)
      : null,
    consentAgreement: request.consentTitle ? { title: request.consentTitle } : null,
  };
}

export async function handleRegistrationAuthRoutes(req, res, pathname, method) {
  if (pathname === "/auth/registration/config" && method === "GET") {
    return json(res, 200, publicRegistrationConfig());
  }

  const settings = getRegistrationSettings();
  if (!settings.enabled) {
    if (
      pathname === "/auth/registration/apply" ||
      pathname === "/auth/registration/status" ||
      pathname === "/auth/registration/activate/begin" ||
      pathname === "/auth/registration/activate/complete"
    ) {
      return registrationDisabled(res);
    }
    return false;
  }

  if (pathname === "/auth/registration/apply" && method === "POST") {
    try {
      const rl = consumeRateLimit(`reg-apply:${clientIp(req)}`, {
        windowMs: 60 * 60 * 1000,
        max: 8,
      });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many requests", retryAfterMs: rl.retryAfterMs });
      }
      const body = await readBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, clientIp(req));
      if (!turnstile.ok) {
        return json(res, 403, { error: turnstile.error || "Verification failed" });
      }
      const validation = validateRegistrationAnswers(settings, {
        email: body.email,
        displayName: body.displayName,
        consentAgreed: body.consentAgreed,
        answers: body.answers,
      });
      if (!validation.ok) {
        return json(res, 400, { error: validation.errors[0] || "Invalid request" });
      }
      const existing = findActiveRegistrationRequestByEmail(validation.email);
      if (existing) {
        return json(res, 409, {
          error:
            existing.status === "pending"
              ? "A request for this email is already pending review"
              : "This email already has an approved request awaiting activation",
        });
      }
      const token = generateRegistrationToken();
      const tokenHash = hashRegistrationToken(token);
      const applicantIp =
        settings.saveApplicantIp !== false ? clientIp(req) || null : null;
      const applicantGeo =
        settings.hydrateApplicantGeo && applicantIp
          ? await lookupIpGeolocation(applicantIp)
          : null;
      const request = createRegistrationRequest({
        email: validation.email,
        displayName: validation.displayName,
        tokenHash,
        tokenEncrypted: encryptRegistrationToken(token),
        answers: validation.answers,
        applicantIp,
        applicantGeo,
        consentTitle: settings.consent.enabled ? settings.consent.title : null,
      });
      return json(res, 201, {
        ok: true,
        token,
        request: publicRequestPayload(request, settings),
        message:
          "Save this token somewhere safe. You will need it to check your status and activate your account after approval.",
      });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/auth/registration/status" && method === "POST") {
    try {
      const rl = consumeRateLimit(`reg-status:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 30,
      });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many requests", retryAfterMs: rl.retryAfterMs });
      }
      const body = await readBody(req);
      const token = normalizeInputToken(body.token);
      if (!token) return json(res, 400, { error: "Token required" });
      const request = getRegistrationRequestByTokenHash(hashRegistrationToken(token));
      if (!request) {
        return json(res, 404, {
          status: "not_found",
          message:
            "No request found for this token. It may have been denied, removed, or entered incorrectly. You can submit a new request if needed.",
        });
      }
      return json(res, 200, {
        status: request.status,
        request: publicRequestPayload(request, settings),
        message: statusMessage(request),
      });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/auth/registration/activate/begin" && method === "POST") {
    try {
      const body = await readBody(req);
      const token = normalizeInputToken(body.token);
      if (!token) return json(res, 400, { error: "Token required" });
      const request = getRegistrationRequestByTokenHash(hashRegistrationToken(token));
      if (!request) {
        return json(res, 404, { error: "Invalid or unknown token" });
      }
      if (request.status === "activated") {
        return json(res, 409, {
          error: "This token was already used to create an account. Sign in with your username and password.",
          status: "activated",
        });
      }
      if (request.status === "denied") {
        return json(res, 403, {
          error: request.denyReason || "This request was denied",
          status: "denied",
        });
      }
      if (request.status === "pending") {
        return json(res, 403, {
          error: "This request is still pending review",
          status: "pending",
        });
      }
      return json(res, 200, {
        ok: true,
        status: "approved",
        email: request.email,
      });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/auth/registration/activate/complete" && method === "POST") {
    try {
      const rl = consumeRateLimit(`reg-activate:${clientIp(req)}`, {
        windowMs: 15 * 60 * 1000,
        max: 12,
      });
      if (!rl.allowed) {
        return json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
      }
      const body = await readBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, clientIp(req));
      if (!turnstile.ok) {
        return json(res, 403, { error: turnstile.error || "Verification failed" });
      }
      const token = normalizeInputToken(body.token);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!token) return json(res, 400, { error: "Token required" });
      if (!username || username.length < 3) {
        return json(res, 400, { error: "Username must be at least 3 characters" });
      }
      if (username.toLowerCase() === BOOTSTRAP_USERNAME.toLowerCase()) {
        return json(res, 400, { error: "That username is reserved" });
      }
      if (!password || password.length < 8) {
        return json(res, 400, { error: "Password must be at least 8 characters" });
      }
      const request = getRegistrationRequestByTokenHash(hashRegistrationToken(token));
      if (!request) return json(res, 404, { error: "Invalid or unknown token" });
      if (request.status === "activated") {
        return json(res, 409, {
          error: "This token was already used. Sign in with your username or email and password.",
        });
      }
      if (request.status !== "approved") {
        return json(res, 403, { error: "This request is not approved for activation" });
      }
      const emailAvailability = isLoginEmailAvailable(request.email);
      if (!emailAvailability.ok) {
        return json(res, 409, { error: emailAvailability.error });
      }
      if (getUserByUsername(username)) {
        return json(res, 409, { error: "Username already taken" });
      }
      const passwordHash = await hashPassword(password);
      const user = createLocalUser({
        username,
        passwordHash,
        role: settings.defaultRole,
        loginEmail: emailAvailability.email,
      });
      const profileFields = { registration_request_id: request.id };
      if (request.displayName) {
        profileFields.display_name = request.displayName;
      }
      const linkedUser = updateUser(user.id, profileFields);
      markRegistrationRequestActivated(request.id, linkedUser.id);

      if (userNeedsMandatoryTotpSetup(linkedUser)) {
        createScopedSession(req, res, linkedUser.id, SESSION_SCOPE_TOTP_SETUP, TOTP_SETUP_TTL_MS);
        return json(res, 200, {
          requires2faSetup: true,
          pending2fa: "setup",
          user: { username: linkedUser.username, role: linkedUser.role },
        });
      }
      if (userShouldPromptOptionalTotpSetup(linkedUser)) {
        createScopedSession(
          req,
          res,
          linkedUser.id,
          SESSION_SCOPE_TOTP_SETUP_OPTIONAL,
          TOTP_SETUP_TTL_MS,
        );
        return json(res, 200, {
          requires2faSetup: true,
          optional2faSetup: true,
          pending2fa: "setup_optional",
          user: { username: linkedUser.username, role: linkedUser.role },
        });
      }
      return json(res, 200, finishFullLogin(req, res, linkedUser));
    } catch (e) {
      if (String(e?.message || e).includes("UNIQUE")) {
        return json(res, 409, { error: "Username already taken" });
      }
      return json(res, 400, { error: "Invalid request" });
    }
  }

  return false;
}

function statusMessage(request) {
  if (request.status === "pending") {
    return "Your request is pending review. Check back later with the same token.";
  }
  if (request.status === "approved") {
    return "Approved — use Activate account with this token to choose a username and password.";
  }
  if (request.status === "denied") {
    return request.denyReason
      ? `Denied: ${request.denyReason}`
      : "This request was denied. You may submit a new request if you think that was a mistake.";
  }
  if (request.status === "activated") {
    if (request.displayName) {
      return `${request.displayName}, your account is active. Sign in with your username or email and password.`;
    }
    return "An account was created with this token. Sign in with your username or email and password.";
  }
  return "";
}

export async function handleRegistrationAdminRoutes(req, res, pathname, method, adminUserId) {
  if (pathname === "/api/admin/registration" && method === "GET") {
    const settings = registrationSettingsAdminPayload();
    const pendingCount = listRegistrationRequests({ status: "pending" }).length;
    return json(res, 200, { settings, pendingCount });
  }

  if (pathname === "/api/admin/registration" && method === "PATCH") {
    try {
      const body = await readBody(req);
      const settings = saveRegistrationSettings(body.settings || body);
      return json(res, 200, { ok: true, settings });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/api/admin/registration/reset-defaults" && method === "POST") {
    const settings = resetRegistrationSettingsToDefaults();
    return json(res, 200, { ok: true, settings });
  }

  if (pathname === "/api/admin/registration/requests" && method === "GET") {
    const url = new URL(req.url || "", "http://localhost");
    const status = url.searchParams.get("status") || undefined;
    const settings = getRegistrationSettings();
    const requests = listRegistrationRequests({ status }).map((request) =>
      adminRequestPayload(request, settings),
    );
    return json(res, 200, { requests });
  }

  const approveMatch = pathname.match(/^\/api\/admin\/registration\/requests\/(\d+)\/approve$/);
  if (approveMatch && method === "POST") {
    const id = Number(approveMatch[1]);
    const existing = getRegistrationRequestById(id);
    if (!existing) return json(res, 404, { error: "Request not found" });
    if (existing.status !== "pending") {
      return json(res, 400, { error: "Only pending requests can be approved" });
    }
    const updated = approveRegistrationRequest(id, adminUserId ?? null);
    const settings = getRegistrationSettings();
    return json(res, 200, { ok: true, request: adminRequestPayload(updated, settings) });
  }

  const denyMatch = pathname.match(/^\/api\/admin\/registration\/requests\/(\d+)\/deny$/);
  if (denyMatch && method === "POST") {
    const id = Number(denyMatch[1]);
    const existing = getRegistrationRequestById(id);
    if (!existing) return json(res, 404, { error: "Request not found" });
    if (existing.status !== "pending") {
      return json(res, 400, { error: "Only pending requests can be denied" });
    }
    let denyReason = null;
    try {
      const body = await readBody(req);
      denyReason = body.reason || body.denyReason || null;
    } catch {
      /* optional body */
    }
    const updated = denyRegistrationRequest(id, adminUserId ?? null, denyReason);
    const settings = getRegistrationSettings();
    return json(res, 200, { ok: true, request: adminRequestPayload(updated, settings) });
  }

  const deleteMatch = pathname.match(/^\/api\/admin\/registration\/requests\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const id = Number(deleteMatch[1]);
    const existing = getRegistrationRequestById(id);
    if (!existing) return json(res, 404, { error: "Request not found" });
    if (existing.status === "activated" && existing.activatedUserId) {
      return json(res, 400, { error: "Cannot delete a request that created an account" });
    }
    deleteRegistrationRequest(id);
    return json(res, 200, { ok: true });
  }

  const regenerateMatch = pathname.match(
    /^\/api\/admin\/registration\/requests\/(\d+)\/regenerate-token$/,
  );
  if (regenerateMatch && method === "POST") {
    const id = Number(regenerateMatch[1]);
    const existing = getRegistrationRequestById(id);
    if (!existing) return json(res, 404, { error: "Request not found" });
    const updated = regenerateRegistrationRequestToken(id);
    if (!updated) {
      return json(res, 400, {
        error: "Token can only be regenerated for pending or approved requests",
      });
    }
    const settings = getRegistrationSettings();
    return json(res, 200, { ok: true, request: adminRequestPayload(updated, settings) });
  }

  return false;
}
