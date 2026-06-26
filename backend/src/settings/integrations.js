import { getSetting, setSetting } from "../db/index.js";
import { maskSecret, mergeSecretField } from "./runtime.js";

const INTEGRATIONS_DEFAULTS = {
  lastfmApiKey: "",
  lastfmDefaultUser: "",
  giphyApiKey: "",
  turnstileSiteKey: "",
  turnstileSecretKey: "",
};

export function ensureIntegrationsSettings(configFile = {}) {
  const legacy = configFile.lastfm || {};
  const current = getSetting("integrations", null);
  if (current) return;
  setSetting("integrations", {
    lastfmApiKey: legacy.defaultApiKey || "",
    lastfmDefaultUser: legacy.defaultUser || "",
    giphyApiKey: "",
  });
}

export function getIntegrationsConfig(configFile = {}) {
  if (!getSetting("integrations", null)) {
    ensureIntegrationsSettings(configFile);
  }
  const stored = getSetting("integrations", {});
  const legacy = configFile.lastfm || {};
  return {
    lastfmApiKey: stored.lastfmApiKey || legacy.defaultApiKey || "",
    lastfmDefaultUser: stored.lastfmDefaultUser || legacy.defaultUser || "",
    giphyApiKey: stored.giphyApiKey || "",
    turnstileSiteKey: stored.turnstileSiteKey || "",
    turnstileSecretKey: stored.turnstileSecretKey || "",
  };
}

export function getLastfmApiKey(configFile = {}) {
  return getIntegrationsConfig(configFile).lastfmApiKey || "";
}

export function getGiphyApiKey(configFile = {}) {
  return getIntegrationsConfig(configFile).giphyApiKey || "";
}

export function integrationsAdminPayload(configFile = {}) {
  const cfg = getIntegrationsConfig(configFile);
  return {
    lastfmApiKey: maskSecret(cfg.lastfmApiKey),
    lastfmDefaultUser: cfg.lastfmDefaultUser || "",
    giphyApiKey: maskSecret(cfg.giphyApiKey),
    lastfmConfigured: !!cfg.lastfmApiKey,
    giphyConfigured: !!cfg.giphyApiKey,
    turnstileSiteKey: cfg.turnstileSiteKey || "",
    turnstileSecretKey: maskSecret(cfg.turnstileSecretKey),
    turnstileConfigured: !!(cfg.turnstileSiteKey && cfg.turnstileSecretKey),
  };
}

export function saveIntegrationsSettings(body = {}, configFile = {}) {
  const current = getIntegrationsConfig(configFile);
  const next = {
    lastfmApiKey: mergeSecretField(body.lastfmApiKey, current.lastfmApiKey),
    lastfmDefaultUser:
      body.lastfmDefaultUser != null
        ? String(body.lastfmDefaultUser).trim()
        : current.lastfmDefaultUser,
    giphyApiKey: mergeSecretField(body.giphyApiKey, current.giphyApiKey),
    turnstileSiteKey:
      body.turnstileSiteKey != null
        ? String(body.turnstileSiteKey).trim()
        : current.turnstileSiteKey,
    turnstileSecretKey: mergeSecretField(body.turnstileSecretKey, current.turnstileSecretKey),
  };
  setSetting("integrations", next);
  return integrationsAdminPayload(configFile);
}

export function isAllowedGifUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === "media.giphy.com" ||
      host.endsWith(".giphy.com") ||
      host === "media.tenor.com" ||
      host.endsWith(".tenor.com")
    );
  } catch {
    return false;
  }
}
