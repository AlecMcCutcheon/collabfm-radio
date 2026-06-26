import { getIntegrationsConfig } from "../settings/integrations.js";

export function isTurnstileEnabled(configFile = {}) {
  const cfg = getIntegrationsConfig(configFile);
  return !!(cfg.turnstileSiteKey && cfg.turnstileSecretKey);
}

export function publicTurnstileSiteKey(configFile = {}) {
  if (!isTurnstileEnabled(configFile)) return null;
  return getIntegrationsConfig(configFile).turnstileSiteKey;
}

/**
 * Verify a Cloudflare Turnstile response token server-side.
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function verifyTurnstileToken(token, remoteIp, configFile = {}) {
  if (!isTurnstileEnabled(configFile)) {
    return { ok: true };
  }
  const response = String(token || "").trim();
  if (!response) {
    return { ok: false, error: "Turnstile verification required" };
  }

  const secret = getIntegrationsConfig(configFile).turnstileSecretKey;
  try {
    const body = new URLSearchParams({
      secret,
      response,
    });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (!data?.success) {
      return { ok: false, error: "Turnstile verification failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Turnstile verification unavailable" };
  }
}
