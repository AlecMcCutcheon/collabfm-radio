import fs from "node:fs";
import path from "node:path";

const ENV_INT_KEYS = {
  WEB_PORT: "webPort",
  WS_PORT: "wsPort",
  PCM_RELAY_PORT: "pcmRelayPort",
};

const ENV_STRING_KEYS = {
  STORAGE_DIR: "storageDir",
  DEBUG_LOG_DIR: "debugLogDir",
};

function parsePort(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return null;
  return Math.floor(n);
}

/**
 * Load config.json and apply Docker/compose environment overrides.
 * Env vars win when set (e.g. WEB_PORT overrides server.webPort).
 */
export function loadAppConfig(configPath, backendRoot) {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  config.server = config.server || {};

  for (const [envKey, cfgKey] of Object.entries(ENV_INT_KEYS)) {
    const fromEnv = process.env[envKey];
    if (fromEnv != null && String(fromEnv).trim() !== "") {
      const port = parsePort(fromEnv);
      if (port != null) config.server[cfgKey] = port;
    }
  }

  for (const [envKey, cfgKey] of Object.entries(ENV_STRING_KEYS)) {
    const fromEnv = process.env[envKey];
    if (fromEnv != null && String(fromEnv).trim() !== "") {
      config.server[cfgKey] = String(fromEnv).trim();
    }
  }

  for (const key of ["storageDir", "debugLogDir"]) {
    const val = config.server[key];
    if (typeof val === "string" && val && !path.isAbsolute(val)) {
      config.server[key] = path.resolve(backendRoot, val);
    }
  }

  return config;
}
