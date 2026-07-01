import crypto from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { getDb, getSetting, getUserById, setSetting } from "../db/index.js";
import { DEFAULT_RADIO_DISPLAY_NAME, getBrandingSettings } from "../http/branding.js";
import { hashPassword, verifyPassword } from "./session.js";
import { getSecuritySettings } from "../settings/security.js";

/** ±1 TOTP period (30s), matching legacy authenticator window: 1 */
const TOTP_EPOCH_TOLERANCE = 30;

const BACKUP_CODE_COUNT = 10;
const DEFAULT_TOTP_ISSUER = "CollabFM";

export const SESSION_SCOPE_FULL = "full";
export const SESSION_SCOPE_TOTP_VERIFY = "totp_verify";
export const SESSION_SCOPE_TOTP_SETUP = "totp_setup";
export const SESSION_SCOPE_TOTP_SETUP_OPTIONAL = "totp_setup_optional";

export const TOTP_VERIFY_TTL_MS = 5 * 60 * 1000;
export const TOTP_SETUP_TTL_MS = 15 * 60 * 1000;

function getEncryptionKey() {
  let key = getSetting("totpEncryptionKey");
  if (!key) {
    key = crypto.randomBytes(32).toString("hex");
    setSetting("totpEncryptionKey", key);
  }
  return crypto.createHash("sha256").update(String(key)).digest();
}

export function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptTotpSecret(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function userTotpEnabled(user) {
  return !!(user && Number(user.totp_enabled) === 1);
}

export function userHasLocalPassword(user) {
  return !!(user?.password_hash && String(user.password_hash).trim());
}

export function userExemptFrom2faEnforcement(user) {
  return user?.role === "admin";
}

export function localLogin2faRequired() {
  return getSecuritySettings().localLogin2faRequired === true;
}

export function userNeedsMandatoryTotpSetup(user) {
  if (!user || !userHasLocalPassword(user)) return false;
  if (userExemptFrom2faEnforcement(user)) return false;
  if (!localLogin2faRequired()) return false;
  return !userTotpEnabled(user);
}

/** Admin-only: policy is on but enrollment can be deferred at login. */
export function userShouldPromptOptionalTotpSetup(user) {
  if (!user || !userHasLocalPassword(user)) return false;
  if (!userExemptFrom2faEnforcement(user)) return false;
  if (!localLogin2faRequired()) return false;
  return !userTotpEnabled(user);
}

export function userNeedsTotpVerify(user) {
  if (!user || !userHasLocalPassword(user)) return false;
  return userTotpEnabled(user);
}

export function generateTotpSecret() {
  return generateSecret();
}

function getTotpIssuer() {
  const branding = getBrandingSettings();
  if (branding.branded2fa !== true) {
    return DEFAULT_TOTP_ISSUER;
  }
  const name = String(branding.radioDisplayName || "").trim();
  return name || DEFAULT_RADIO_DISPLAY_NAME;
}

export function buildOtpAuthUri(username, secret) {
  return generateURI({
    issuer: getTotpIssuer(),
    label: String(username || "user"),
    secret: String(secret),
  });
}

export async function qrDataUrlForOtpAuth(uri) {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

export function verifyTotpCode(secret, code) {
  const token = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({
      secret: String(secret),
      token,
      epochTolerance: TOTP_EPOCH_TOLERANCE,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

function parseSingleBackupCode(code) {
  const raw = String(code || "").trim();
  if (!raw) return null;

  const lines = raw
    .split(/[\r\n]+/)
    .map((line) => line.trim().replace(/\s+/g, "").toUpperCase())
    .filter((line) => line.length >= 8);

  if (lines.length > 1) {
    return { error: "Enter one backup code, not the full list" };
  }

  let candidate = lines[0];
  if (!candidate) {
    candidate = raw.replace(/\s+/g, "").toUpperCase();
    if (candidate.length > 10 && /^[A-F0-9]+$/.test(candidate)) {
      candidate = candidate.slice(0, 10);
    }
  } else if (candidate.length > 10 && /^[A-F0-9]+$/.test(candidate)) {
    candidate = candidate.slice(0, 10);
  }

  return candidate || null;
}

async function consumeBackupCode(userId, normalized) {
  const rows = getDb()
    .prepare(
      "SELECT id, code_hash FROM totp_backup_codes WHERE user_id = ? AND used_at IS NULL",
    )
    .all(userId);
  for (const row of rows) {
    const ok = await verifyPassword(normalized, row.code_hash);
    if (!ok) continue;
    getDb()
      .prepare("UPDATE totp_backup_codes SET used_at = datetime('now') WHERE id = ?")
      .run(row.id);
    return true;
  }
  return false;
}

export async function createBackupCodesForUser(userId) {
  getDb().prepare("DELETE FROM totp_backup_codes WHERE user_id = ?").run(userId);
  const plain = [];
  const insert = getDb().prepare(
    "INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?, ?)",
  );
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    plain.push(code);
    const codeHash = await hashPassword(code);
    insert.run(userId, codeHash);
  }
  return plain;
}

export async function verifyAndConsumeBackupCode(userId, code) {
  const parsed = parseSingleBackupCode(code);
  if (parsed?.error) return parsed;
  if (!parsed) return false;
  const ok = await consumeBackupCode(userId, parsed);
  return ok ? true : false;
}

export function clearUserTotp(userId) {
  getDb().prepare("DELETE FROM totp_backup_codes WHERE user_id = ?").run(userId);
  getDb().prepare("DELETE FROM totp_setup_pending WHERE user_id = ?").run(userId);
  getDb()
    .prepare(
      `UPDATE users SET totp_secret_encrypted = NULL, totp_enabled = 0, totp_confirmed_at = NULL
       WHERE id = ?`,
    )
    .run(userId);
}

export function savePendingTotpSetup(userId, secret) {
  const encrypted = encryptTotpSecret(secret);
  getDb()
    .prepare(
      `INSERT INTO totp_setup_pending (user_id, secret_encrypted, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         secret_encrypted = excluded.secret_encrypted,
         created_at = excluded.created_at`,
    )
    .run(userId, encrypted);
}

export function loadPendingTotpSetup(userId) {
  const row = getDb()
    .prepare("SELECT secret_encrypted FROM totp_setup_pending WHERE user_id = ?")
    .get(userId);
  if (!row) return null;
  return decryptTotpSecret(row.secret_encrypted);
}

export function clearPendingTotpSetup(userId) {
  getDb().prepare("DELETE FROM totp_setup_pending WHERE user_id = ?").run(userId);
}

export async function activateTotpForUser(userId, secret) {
  const encrypted = encryptTotpSecret(secret);
  getDb()
    .prepare(
      `UPDATE users SET totp_secret_encrypted = ?, totp_enabled = 1,
       totp_confirmed_at = datetime('now') WHERE id = ?`,
    )
    .run(encrypted, userId);
  clearPendingTotpSetup(userId);
  return createBackupCodesForUser(userId);
}

export async function verifyUserTotpLogin(user, { code, backupCode } = {}) {
  const checkBackup = async (value) => {
    const result = await verifyAndConsumeBackupCode(user.id, value);
    if (result && typeof result === "object" && result.error) return result;
    return result === true;
  };

  if (backupCode) {
    return checkBackup(backupCode);
  }
  const codeStr = String(code || "").replace(/\s+/g, "");
  if (/^\d{6}$/.test(codeStr)) {
    const secret = decryptTotpSecret(user.totp_secret_encrypted);
    if (!secret) return false;
    return verifyTotpCode(secret, codeStr);
  }
  if (codeStr) {
    return checkBackup(code);
  }
  return false;
}

export async function beginTotpSetupForUser(user) {
  const secret = generateTotpSecret();
  savePendingTotpSetup(user.id, secret);
  const uri = buildOtpAuthUri(user.username, secret);
  const qrDataUrl = await qrDataUrlForOtpAuth(uri);
  return { secret, uri, qrDataUrl };
}

export async function confirmTotpSetupForUser(user, code) {
  const secret = loadPendingTotpSetup(user.id);
  if (!secret) {
    return { error: "No 2FA setup in progress", status: 400 };
  }
  if (!verifyTotpCode(secret, code)) {
    return { error: "Invalid authentication code", status: 401 };
  }
  const backupCodes = await activateTotpForUser(user.id, secret);
  return { backupCodes, user: getUserById(user.id) };
}

export async function disableTotpForUser(user, { code, backupCode } = {}) {
  if (!userTotpEnabled(user)) {
    return { error: "2FA is not enabled", status: 400 };
  }
  if (localLogin2faRequired() && !userExemptFrom2faEnforcement(user)) {
    return { error: "2FA cannot be disabled while required by station policy", status: 403 };
  }
  const result = await verifyUserTotpLogin(user, { code, backupCode });
  if (result && typeof result === "object" && result.error) {
    return { error: result.error, status: 400 };
  }
  if (!result) {
    return { error: "Invalid authentication code", status: 401 };
  }
  clearUserTotp(user.id);
  return { user: getUserById(user.id) };
}

export async function regenerateBackupCodesForUser(user, code) {
  if (!userTotpEnabled(user)) {
    return { error: "2FA is not enabled", status: 400 };
  }
  const secret = decryptTotpSecret(user.totp_secret_encrypted);
  if (!secret || !verifyTotpCode(secret, code)) {
    return { error: "Invalid authentication code", status: 401 };
  }
  const backupCodes = await createBackupCodesForUser(user.id);
  return { backupCodes };
}

export function adminResetUserTotp(userId) {
  clearUserTotp(userId);
  return getUserById(userId);
}
