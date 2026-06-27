import { getSetting, setSetting } from "../db/index.js";
import { buildDefaultContentPolicy, normalizePolicy } from "../content/contentPolicy.js";

const SETTING_KEY = "contentPolicy";

export function getContentPolicySettings() {
  const stored = getSetting(SETTING_KEY, null);
  return normalizePolicy(stored);
}

export function saveContentPolicySettings(policy) {
  const normalized = normalizePolicy(policy);
  setSetting(SETTING_KEY, normalized);
  return normalized;
}

export function ensureContentPolicySettings() {
  if (getSetting(SETTING_KEY, null) == null) {
    setSetting(SETTING_KEY, buildDefaultContentPolicy());
  }
}

export function resetContentPolicySettings() {
  const defaults = buildDefaultContentPolicy();
  setSetting(SETTING_KEY, defaults);
  return defaults;
}
