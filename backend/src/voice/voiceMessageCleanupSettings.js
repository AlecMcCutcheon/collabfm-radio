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

/** When the bot has an active voice session, never delete the now-playing embed. */
export function resolveCleanupTargets(targets, { guildProtected = false } = {}) {
  if (!guildProtected || targets === "off") return targets;
  if (targets === "slash_replies") return "slash_replies";
  if (targets === "sync_embed") return "off";
  if (targets === "all") return "slash_replies";
  return targets;
}
