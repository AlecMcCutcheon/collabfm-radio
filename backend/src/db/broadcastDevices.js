import crypto from "crypto";
import { getDb } from "./index.js";
import { publicDisplayName } from "./userProfile.js";

const PAIR_TTL_MS = 10 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomUserCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (i === 3) code += "-";
  }
  return code;
}

export function pruneExpiredPairRequests() {
  getDb().prepare("DELETE FROM extension_pair_requests WHERE expires_at < ?").run(Date.now());
}

export function startPairRequest(deviceId = null) {
  pruneExpiredPairRequests();
  const id = deviceId || crypto.randomBytes(16).toString("hex");
  const userCode = randomUserCode();
  const now = Date.now();
  const expiresAt = now + PAIR_TTL_MS;
  getDb()
    .prepare(
      `INSERT INTO extension_pair_requests (device_id, user_code, created_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         user_code = excluded.user_code,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at,
         paired_user_id = NULL,
         paired_token = NULL,
         consumed = 0`
    )
    .run(id, userCode, now, expiresAt);
  return { deviceId: id, userCode, expiresIn: PAIR_TTL_MS };
}

export function getPairRequest(deviceId) {
  pruneExpiredPairRequests();
  return (
    getDb()
      .prepare(
        `SELECT device_id, user_code, created_at, expires_at, paired_user_id, paired_token, consumed
         FROM extension_pair_requests WHERE device_id = ?`
      )
      .get(deviceId) ?? null
  );
}

export function getPairRequestByCode(userCode) {
  pruneExpiredPairRequests();
  const normalized = String(userCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const withDash =
    normalized.length === 8 && !normalized.includes("-")
      ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
      : normalized;
  return (
    getDb()
      .prepare(
        `SELECT device_id, user_code, created_at, expires_at, paired_user_id, paired_token, consumed
         FROM extension_pair_requests WHERE user_code = ?`
      )
      .get(withDash) ?? null
  );
}

export function confirmPairRequest(userCode, userId, label = null) {
  const row = getPairRequestByCode(userCode);
  if (!row) return { error: "invalid_code" };
  if (row.expires_at < Date.now()) return { error: "expired" };
  if (row.paired_user_id) return { error: "already_paired" };

  const deviceToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(deviceToken);
  const tokenPrefix = deviceToken.slice(0, 8);
  const db = getDb();
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO broadcast_devices (user_id, label, token_hash, token_prefix)
         VALUES (?, ?, ?, ?)`
      )
      .run(userId, label || null, tokenHash, tokenPrefix);
    db.prepare(
      `UPDATE extension_pair_requests
       SET paired_user_id = ?, paired_token = ?, consumed = 0
       WHERE device_id = ?`
    ).run(userId, deviceToken, row.device_id);
    return result.lastInsertRowid;
  });
  const deviceRowId = tx();
  return {
    ok: true,
    deviceId: row.device_id,
    deviceRowId,
    userCode: row.user_code,
  };
}

export function pollPairRequest(deviceId) {
  const row = getPairRequest(deviceId);
  if (!row) return { status: "expired" };
  if (row.expires_at < Date.now()) return { status: "expired" };
  if (!row.paired_user_id || !row.paired_token) return { status: "pending" };

  const user = getDb()
    .prepare("SELECT username, display_name FROM users WHERE id = ? AND enabled = 1")
    .get(row.paired_user_id);
  if (!user) {
    return { status: "revoked" };
  }

  const tokenHash = hashToken(row.paired_token);
  const device = getDb()
    .prepare(
      `SELECT bd.label FROM broadcast_devices bd
       INNER JOIN users u ON u.id = bd.user_id
       WHERE bd.token_hash = ? AND bd.revoked = 0 AND u.enabled = 1`
    )
    .get(tokenHash);
  if (!device) {
    return { status: "revoked" };
  }

  return {
    status: "paired",
    deviceToken: row.paired_token,
    username: user.username ?? null,
    displayName: publicDisplayName(user),
    label: device.label || "Browser extension",
  };
}

export function purgeUserBroadcastAccess(userId) {
  const id = Number(userId);
  if (!id) return;
  const db = getDb();
  db.prepare("DELETE FROM broadcast_devices WHERE user_id = ?").run(id);
  db.prepare(
    `UPDATE extension_pair_requests
     SET paired_user_id = NULL, paired_token = NULL, consumed = 0
     WHERE paired_user_id = ?`
  ).run(id);
  db.prepare("DELETE FROM ws_tokens WHERE user_id = ?").run(id);
}

/** Remove device rows whose owner was deleted or disabled (legacy orphans). */
export function pruneOrphanBroadcastDevices() {
  const db = getDb();
  db.prepare(
    `DELETE FROM broadcast_devices
     WHERE user_id NOT IN (SELECT id FROM users WHERE enabled = 1)`
  ).run();
  db.prepare(
    `UPDATE extension_pair_requests
     SET paired_user_id = NULL, paired_token = NULL, consumed = 0
     WHERE paired_user_id IS NOT NULL
       AND paired_user_id NOT IN (SELECT id FROM users WHERE enabled = 1)`
  ).run();
}

export function ackPairRequest(deviceId) {
  getDb()
    .prepare(
      `UPDATE extension_pair_requests
       SET paired_token = NULL, consumed = 1
       WHERE device_id = ?`
    )
    .run(deviceId);
}

export function parseBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function verifyBroadcastDeviceToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = getDb()
    .prepare(
      `SELECT bd.id, bd.user_id, bd.label, bd.token_prefix, bd.revoked
       FROM broadcast_devices bd
       INNER JOIN users u ON u.id = bd.user_id
       WHERE bd.token_hash = ? AND bd.revoked = 0 AND u.enabled = 1`
    )
    .get(tokenHash);
  if (!row) return null;
  getDb()
    .prepare("UPDATE broadcast_devices SET last_used_at = datetime('now') WHERE id = ?")
    .run(row.id);
  return {
    id: row.id,
    userId: String(row.user_id),
    label: row.label,
    tokenPrefix: row.token_prefix,
  };
}

export function verifyBroadcastDeviceFromRequest(req) {
  return verifyBroadcastDeviceToken(parseBearerToken(req));
}

export function listDevicesForUser(userId) {
  return getDb()
    .prepare(
      `SELECT id, label, token_prefix, created_at, last_used_at, revoked
       FROM broadcast_devices WHERE user_id = ? AND revoked = 0
       ORDER BY created_at DESC`
    )
    .all(userId);
}

export function getLatestDeviceLabelForUser(userId) {
  const row = getDb()
    .prepare(
      `SELECT label FROM broadcast_devices
       WHERE user_id = ? AND revoked = 0
       ORDER BY last_used_at IS NULL, last_used_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(userId);
  const label = row?.label?.trim();
  return label || null;
}

export function revokeDevice(deviceId, userId) {
  const row = getDb()
    .prepare("SELECT id, user_id FROM broadcast_devices WHERE id = ? AND revoked = 0")
    .get(deviceId);
  if (!row) return false;
  if (Number(row.user_id) !== Number(userId)) return false;
  getDb().prepare("UPDATE broadcast_devices SET revoked = 1 WHERE id = ?").run(deviceId);
  return true;
}

export function updateDeviceLabel(deviceId, userId, label) {
  const trimmed = String(label || "").trim().slice(0, 64) || "Browser extension";
  const row = getDb()
    .prepare("SELECT id, user_id FROM broadcast_devices WHERE id = ? AND revoked = 0")
    .get(deviceId);
  if (!row) return false;
  if (Number(row.user_id) !== Number(userId)) return false;
  getDb().prepare("UPDATE broadcast_devices SET label = ? WHERE id = ?").run(trimmed, deviceId);
  return true;
}

export function revokeDeviceAdmin(deviceId) {
  const result = getDb()
    .prepare("UPDATE broadcast_devices SET revoked = 1 WHERE id = ? AND revoked = 0")
    .run(deviceId);
  return result.changes > 0;
}
