import { getSetting, setSetting } from "../db/index.js";

const VOICE_BOT_DEFAULTS = {
  clientId: "",
  botToken: "",
  enabled: true,
};

export function ensureDefaultSettings(configFile = {}) {
  if (getSetting("leveling.guestActionsGrantXp") === null) {
    setSetting("leveling.guestActionsGrantXp", true);
  }
  if (getSetting("leveling.blockGuestXpMatchingStageIp") === null) {
    setSetting("leveling.blockGuestXpMatchingStageIp", true);
  }
  if (getSetting("broadcast.extensionRequirePairing") === null) {
    setSetting("broadcast.extensionRequirePairing", true);
  }
  if (getSetting("updates.notifyOnBuildAvailable") === null) {
    setSetting("updates.notifyOnBuildAvailable", false);
  }
  if (getSetting("updates.trackTag") === null) {
    setSetting("updates.trackTag", "latest");
  }
  if (!getSetting("voiceBot")) {
    const legacy = configFile.relayBot || configFile.discord || {};
    setSetting("voiceBot", {
      clientId: legacy.clientId || "",
      botToken: legacy.botToken || "",
      enabled: true,
    });
  }
}

export function getVoiceBotConfig(configFile = {}) {
  const stored = getSetting("voiceBot", {});
  const legacy = configFile.relayBot || configFile.discord || {};
  return {
    ...VOICE_BOT_DEFAULTS,
    ...stored,
    clientId: stored.clientId || legacy.clientId || "",
    botToken: stored.botToken || legacy.botToken || "",
    enabled: stored.enabled !== false,
  };
}

export function maskSecret(value) {
  if (!value) return "";
  return "********";
}

export function mergeSecretField(incoming, current) {
  if (!incoming || incoming === "********") return current;
  return incoming;
}
