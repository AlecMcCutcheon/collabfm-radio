import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "../db/index.js";

export const DEFAULT_LIMITS = {
  maxStageUsers: 7,
  logRetentionCount: 5,
};

/** Hard ceiling for maxStageUsers (admin can set 1–this value). */
export const MAX_STAGE_USERS = 10;

export const DEFAULT_AUDIO = {
  discordBufferFrames: 100,
  discordRelayBufferMs: 3000,
  pcmMaxBufferMs: 4500,
  pcmMinBufferMs: 1500,
  silenceDebounceChunks: 50,
  audioDebounceChunks: 25,
  silenceThreshold: 0.025,
};

const changeListeners = new Set();
let debugLogDir = null;

export function setOperationalDebugLogDir(dir) {
  debugLogDir = dir || null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeLimitsSettings(raw = {}) {
  return {
    maxStageUsers: clampInt(raw.maxStageUsers, 1, MAX_STAGE_USERS, DEFAULT_LIMITS.maxStageUsers),
    logRetentionCount: clampInt(raw.logRetentionCount, 1, 100, DEFAULT_LIMITS.logRetentionCount),
  };
}

export function normalizeAudioSettings(raw = {}) {
  const pcmMaxBufferMs = clampInt(raw.pcmMaxBufferMs, 500, 30_000, DEFAULT_AUDIO.pcmMaxBufferMs);
  const pcmMinBufferMs = clampInt(
    raw.pcmMinBufferMs,
    100,
    pcmMaxBufferMs,
    Math.min(DEFAULT_AUDIO.pcmMinBufferMs, pcmMaxBufferMs),
  );
  return {
    discordBufferFrames: clampInt(raw.discordBufferFrames, 8, 500, DEFAULT_AUDIO.discordBufferFrames),
    discordRelayBufferMs: clampInt(
      raw.discordRelayBufferMs,
      160,
      10_000,
      DEFAULT_AUDIO.discordRelayBufferMs,
    ),
    pcmMaxBufferMs,
    pcmMinBufferMs,
    silenceDebounceChunks: clampInt(
      raw.silenceDebounceChunks,
      1,
      500,
      DEFAULT_AUDIO.silenceDebounceChunks,
    ),
    audioDebounceChunks: clampInt(
      raw.audioDebounceChunks,
      1,
      500,
      DEFAULT_AUDIO.audioDebounceChunks,
    ),
    silenceThreshold: clampFloat(
      raw.silenceThreshold,
      0.001,
      0.5,
      DEFAULT_AUDIO.silenceThreshold,
    ),
  };
}

export function getLimitsSettings() {
  const stored = getSetting("limits", null);
  return normalizeLimitsSettings(stored ? { ...DEFAULT_LIMITS, ...stored } : DEFAULT_LIMITS);
}

export function getAudioSettings() {
  const stored = getSetting("audio", null);
  return normalizeAudioSettings(stored ? { ...DEFAULT_AUDIO, ...stored } : DEFAULT_AUDIO);
}

export function ensureOperationalSettings(configFile = {}) {
  if (getSetting("limits", null) === null) {
    setSetting("limits", normalizeLimitsSettings({ ...DEFAULT_LIMITS, ...(configFile.limits || {}) }));
  }
  if (getSetting("audio", null) === null) {
    setSetting("audio", normalizeAudioSettings({ ...DEFAULT_AUDIO, ...(configFile.audio || {}) }));
  }
}

export function operationalSettingsAdminPayload() {
  return {
    limits: getLimitsSettings(),
    audio: getAudioSettings(),
  };
}

export function onOperationalSettingsChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitOperationalSettingsChanged(payload) {
  for (const listener of changeListeners) {
    try {
      listener(payload);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function runDebugLogRetention(debugLogDir, keepCount = getLimitsSettings().logRetentionCount) {
  if (!debugLogDir) return;
  try {
    const files = fs
      .readdirSync(debugLogDir)
      .filter((f) => f.startsWith("stream-debug-") && f.endsWith(".log"))
      .map((f) => ({ f, t: fs.statSync(path.join(debugLogDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const keep = clampInt(keepCount, 1, 100, DEFAULT_LIMITS.logRetentionCount);
    for (const { f } of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(debugLogDir, f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function saveOperationalSettings(body = {}) {
  const limits = body.limits ? normalizeLimitsSettings(body.limits) : getLimitsSettings();
  const audio = body.audio ? normalizeAudioSettings(body.audio) : getAudioSettings();
  setSetting("limits", limits);
  setSetting("audio", audio);
  if (debugLogDir) {
    runDebugLogRetention(debugLogDir, limits.logRetentionCount);
  }
  const payload = { limits, audio };
  emitOperationalSettingsChanged(payload);
  return payload;
}
