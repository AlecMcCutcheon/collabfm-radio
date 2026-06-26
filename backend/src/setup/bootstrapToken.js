import crypto from "crypto";
import { getSetting, setSetting, listUsers, isSetupComplete } from "../db/index.js";
import { hashPassword, verifyPassword } from "../auth/session.js";

export const BOOTSTRAP_USERNAME = "admin";
const SETTING_BOOTSTRAP_HASH = "setup.bootstrapTokenHash";
const SETTING_RECOVERY_HASH = "setup.recoveryTokenHash";
const SETTING_RECOVERY_ACTIVE = "setup.recoveryActive";

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function regenerateBootstrapToken() {
  const token = generateToken();
  const hash = await hashPassword(token);
  setSetting(SETTING_BOOTSTRAP_HASH, hash);
  return token;
}

export async function verifyBootstrapToken(token) {
  const hash = getSetting(SETTING_BOOTSTRAP_HASH, null);
  if (!hash || !token) return false;
  return verifyPassword(String(token), hash);
}

export function clearBootstrapToken() {
  setSetting(SETTING_BOOTSTRAP_HASH, null);
}

export async function issueBootstrapTokenOnStartup() {
  if (isSetupComplete()) return null;
  const token = await regenerateBootstrapToken();
  return token;
}

export function isRecoveryActive() {
  return getSetting(SETTING_RECOVERY_ACTIVE, false) === true;
}

export async function activateRecoveryMode() {
  if (!isSetupComplete()) {
    throw new Error("Setup is not complete — use the bootstrap token from normal startup instead.");
  }
  const token = generateToken();
  const hash = await hashPassword(token);
  setSetting(SETTING_RECOVERY_HASH, hash);
  setSetting(SETTING_RECOVERY_ACTIVE, true);
  return token;
}

export async function verifyRecoveryToken(token) {
  if (!isRecoveryActive()) return false;
  const hash = getSetting(SETTING_RECOVERY_HASH, null);
  if (!hash || !token) return false;
  return verifyPassword(String(token), hash);
}

export function clearRecoveryMode() {
  setSetting(SETTING_RECOVERY_HASH, null);
  setSetting(SETTING_RECOVERY_ACTIVE, false);
}

export function getFirstAdminUser() {
  const admins = listUsers()
    .filter((u) => u.role === "admin" && u.enabled)
    .sort((a, b) => a.id - b.id);
  return admins[0] ?? null;
}

export function printBootstrapBanner(token, { recovery = false } = {}) {
  const lines = recovery
    ? [
        "",
        "══════════════════════════════════════════════════════════",
        "  CollabFM — ADMIN RECOVERY MODE",
        "  Log in with:",
        `    Username: ${BOOTSTRAP_USERNAME}`,
        `    Password: ${token}`,
        "  You will be signed in as the first admin account.",
        "  Reset your password in Admin, then log out.",
        "  Recovery token is single-use and cleared after login.",
        "══════════════════════════════════════════════════════════",
        "",
      ]
    : [
        "",
        "══════════════════════════════════════════════════════════",
        "  CollabFM — FIRST-TIME SETUP",
        "  Open /setup and unlock with:",
        `    Username: ${BOOTSTRAP_USERNAME}`,
        `    Password: ${token}`,
        "  Then create your real admin username and password.",
        "  This token changes on every restart until setup completes.",
        "══════════════════════════════════════════════════════════",
        "",
      ];
  for (const line of lines) {
    console.log(line);
  }
}
