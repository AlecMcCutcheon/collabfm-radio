import { getSetting, setSetting } from "../db/index.js";

export function normalizeSecuritySettings(raw = {}) {
  return {
    localLogin2faRequired: raw.localLogin2faRequired === true,
  };
}

export function getSecuritySettings() {
  return normalizeSecuritySettings(getSetting("security", {}));
}

export function saveSecuritySettings(incoming = {}) {
  const current = getSecuritySettings();
  const next = normalizeSecuritySettings({ ...current, ...incoming });
  setSetting("security", next);
  return next;
}

export function securitySettingsAdminPayload() {
  return getSecuritySettings();
}

export function ensureSecuritySettings() {
  const current = getSetting("security", null);
  if (!current || typeof current !== "object") {
    setSetting("security", normalizeSecuritySettings({}));
  }
}
