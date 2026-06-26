import { createBootstrapAdmin, getAppSession } from "../auth/routes.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { isSetupComplete } from "../db/index.js";
import {
  BOOTSTRAP_USERNAME,
  clearBootstrapToken,
  verifyBootstrapToken,
} from "../setup/bootstrapToken.js";
import {
  clearAllSetupUnlocks,
  clearSetupUnlockCookie,
  createSetupUnlockToken,
  getSetupUnlockTokenFromRequest,
  hasSetupUnlock,
  revokeSetupUnlockToken,
  setSetupUnlockCookie,
} from "../setup/setupUnlock.js";

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

export async function handleSetupRoutes(req, res, pathname, method) {
  if (pathname === "/api/setup/status" && method === "GET") {
    json(res, 200, {
      complete: isSetupComplete(),
      bootstrapRequired: !isSetupComplete(),
      unlocked: !isSetupComplete() && hasSetupUnlock(req),
      bootstrapUsername: BOOTSTRAP_USERNAME,
    });
    return true;
  }

  if (!pathname.startsWith("/api/setup")) return false;

  if (isSetupComplete()) {
    json(res, 403, { error: "Setup already complete" });
    return true;
  }

  if (pathname === "/api/setup/unlock" && method === "POST") {
    const rl = consumeRateLimit(`setup-unlock:${clientIp(req)}`, {
      windowMs: 15 * 60 * 1000,
      max: 20,
    });
    if (!rl.allowed) {
      json(res, 429, { error: "Too many attempts", retryAfterMs: rl.retryAfterMs });
      return true;
    }
    try {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const bootstrapToken = String(body.bootstrapToken || body.password || "");
      if (username.toLowerCase() !== BOOTSTRAP_USERNAME.toLowerCase()) {
        json(res, 401, { error: "Invalid setup credentials" });
        return true;
      }
      if (!bootstrapToken) {
        json(res, 400, { error: "Setup token required" });
        return true;
      }
      const ok = await verifyBootstrapToken(bootstrapToken);
      if (!ok) {
        json(res, 401, { error: "Invalid setup credentials" });
        return true;
      }
      const unlockToken = createSetupUnlockToken();
      setSetupUnlockCookie(req, res, unlockToken);
      json(res, 200, { ok: true, unlocked: true });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/setup/complete" && method === "POST") {
    if (!hasSetupUnlock(req)) {
      json(res, 403, { error: "Setup locked — unlock with the server console token first" });
      return true;
    }
    try {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || username.length < 3) {
        json(res, 400, { error: "Username must be at least 3 characters" });
        return true;
      }
      if (username.toLowerCase() === BOOTSTRAP_USERNAME.toLowerCase()) {
        json(res, 400, {
          error: `Choose a different username than "${BOOTSTRAP_USERNAME}" — that name is reserved for setup unlock only`,
        });
        return true;
      }
      if (!password || password.length < 8) {
        json(res, 400, { error: "Password must be at least 8 characters" });
        return true;
      }
      const user = await createBootstrapAdmin({
        username,
        password,
        publicBaseUrl: body.publicBaseUrl || null,
        allowedOrigins: body.allowedOrigins || ["*"],
      });
      const priorUnlock = getSetupUnlockTokenFromRequest(req);
      revokeSetupUnlockToken(priorUnlock);
      clearAllSetupUnlocks();
      clearBootstrapToken();
      clearSetupUnlockCookie(req, res);
      json(res, 200, { ok: true, user: { username: user.username, role: user.role } });
      return true;
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) {
        json(res, 409, { error: "Username already taken" });
        return true;
      }
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  return false;
}

export function requireSetupOrAllow(pathname) {
  if (isSetupComplete()) return true;
  if (pathname === "/" || pathname === "/setup" || pathname.startsWith("/api/setup")) return true;
  if (pathname.startsWith("/listen/") || pathname.startsWith("/api/listen/")) return true;
  if (pathname.startsWith("/api/extension/")) return true;
  if (pathname.startsWith("/api/avatars/")) return true;
  if (pathname.startsWith("/api/broadcaster/")) return true;
  if (pathname.startsWith("/assets/")) return true;
  return false;
}

export function isAdminSession(req) {
  const session = getAppSession(req);
  return session?.user?.role === "admin";
}
