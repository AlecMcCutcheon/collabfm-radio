import { getSetting } from "../db/index.js";

export const VOICE_MESSAGE_CLEANUP_TARGETS = Object.freeze([
  "off",
  "sync_embed",
  "slash_replies",
  "all",
]);

export const VOICE_MESSAGE_CLEANUP_SCOPES = Object.freeze([
  "remembered",
  "all_channels",
]);

const DEFAULTS = Object.freeze({
  targets: "all",
  scope: "remembered",
});

function normalizeTargets(value) {
  const raw = String(value || "").trim();
  return VOICE_MESSAGE_CLEANUP_TARGETS.includes(raw) ? raw : DEFAULTS.targets;
}

function normalizeScope(value) {
  const raw = String(value || "").trim();
  return VOICE_MESSAGE_CLEANUP_SCOPES.includes(raw) ? raw : DEFAULTS.scope;
}

export function normalizeVoiceMessageCleanupSettings(input = {}) {
  return {
    targets: normalizeTargets(input.targets),
    scope: normalizeScope(input.scope),
  };
}

export function getVoiceMessageCleanupSettings() {
  const voice = getSetting("voiceBot", {});
  return normalizeVoiceMessageCleanupSettings(voice.messageCleanup || {});
}

export function isVoiceMessageCleanupEnabled(settings = getVoiceMessageCleanupSettings()) {
  return settings.targets !== "off";
}
