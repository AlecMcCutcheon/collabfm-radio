import crypto from "crypto";
import { getDb } from "./index.js";

export const SHARE_TTL_OPTIONS = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "72h": 72 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  never: null,
};

export const LISTENER_TTL_OPTIONS = ["never", "24h", "72h", "7d", "30d", "1y"];

export const GUEST_BROADCASTER_TTL_OPTIONS = ["1h", "6h", "24h"];

export const MAX_ACTIVE_SHARE_LINKS_PER_USER = 3;

export const GUEST_MODES = ["listener", "guest_broadcaster"];

export function ttlToExpiresAt(ttlKey) {
  if (ttlKey === "never") return null;
  const ms = SHARE_TTL_OPTIONS[ttlKey];
  if (ms == null) throw new Error("Invalid TTL");
  return Date.now() + ms;
}

export function ttlOptionsForGuestMode(guestMode) {
  if (guestMode === "guest_broadcaster") return GUEST_BROADCASTER_TTL_OPTIONS;
  return LISTENER_TTL_OPTIONS;
}

export function generateShareToken() {
  return crypto.randomBytes(24).toString("base64url");
}

let onRevokeShareLink = null;

/** Register hook to purge guest nicknames (and related caches) when a link is revoked. */
export function setOnRevokeShareLink(fn) {
  onRevokeShareLink = typeof fn === "function" ? fn : null;
}

export function purgeExpiredShareLinks() {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT id FROM stream_share_links
       WHERE revoked = 0 AND expires_at IS NOT NULL AND expires_at < ?`,
    )
    .all(now);
  for (const row of rows) {
    revokeShareLink(row.id);
  }
}

/** Active = not revoked and not past expires_at (ms). */
export function isShareLinkActive(row) {
  if (!row || row.revoked) return false;
  if (row.expires_at != null && Number(row.expires_at) < Date.now()) return false;
  return true;
}

const ACTIVE_SHARE_LINK_SQL = `revoked = 0 AND (expires_at IS NULL OR expires_at >= ?)`;

export function createShareLink({ label, linkKind, guestMode, ttl, createdBy }) {
  const mode = GUEST_MODES.includes(guestMode) ? guestMode : "listener";
  const kind = linkKind === "stream" ? "stream" : "ui";
  const allowedTtls = ttlOptionsForGuestMode(mode);
  if (!ttl || !allowedTtls.includes(ttl)) {
    throw new Error("Invalid TTL for guest mode");
  }
  purgeExpiredShareLinks();
  const token = generateShareToken();
  const expiresAt = ttlToExpiresAt(ttl);
  const result = getDb()
    .prepare(
      `INSERT INTO stream_share_links (token, label, link_kind, guest_mode, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(token, label ?? null, kind, mode, expiresAt, createdBy ?? null);
  return getShareLinkById(result.lastInsertRowid);
}

export function getShareLinkById(id) {
  return getDb().prepare("SELECT * FROM stream_share_links WHERE id = ?").get(id) ?? null;
}

export function getShareLinkByToken(token) {
  return getDb().prepare("SELECT * FROM stream_share_links WHERE token = ?").get(token) ?? null;
}

export function listShareLinks() {
  purgeExpiredShareLinks();
  const now = Date.now();
  return getDb()
    .prepare(
      `SELECT id, token, label, link_kind, guest_mode, expires_at, revoked, created_by, created_at, last_used_at
       FROM stream_share_links
       WHERE ${ACTIVE_SHARE_LINK_SQL}
       ORDER BY created_at DESC`
    )
    .all(now);
}

export function listShareLinksForUser(userId) {
  purgeExpiredShareLinks();
  const now = Date.now();
  return getDb()
    .prepare(
      `SELECT id, token, label, link_kind, guest_mode, expires_at, revoked, created_by, created_at, last_used_at
       FROM stream_share_links
       WHERE created_by = ? AND ${ACTIVE_SHARE_LINK_SQL}
       ORDER BY created_at DESC`
    )
    .all(userId, now);
}

export function countActiveShareLinksForUser(userId) {
  purgeExpiredShareLinks();
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM stream_share_links
       WHERE created_by = ? AND ${ACTIVE_SHARE_LINK_SQL}`
    )
    .get(userId, now);
  return row?.count ?? 0;
}

export function revokeShareLink(id) {
  const linkId = Number(id);
  if (Number.isFinite(linkId) && linkId > 0) {
    onRevokeShareLink?.(linkId);
  }
  getDb().prepare("UPDATE stream_share_links SET revoked = 1 WHERE id = ?").run(id);
}

export function touchShareLink(token) {
  getDb()
    .prepare("UPDATE stream_share_links SET last_used_at = datetime('now') WHERE token = ?")
    .run(token);
}

export function validateShareToken(token) {
  const row = getShareLinkByToken(token);
  if (!isShareLinkActive(row)) {
    if (row && !row.revoked && row.expires_at != null && Number(row.expires_at) < Date.now()) {
      revokeShareLink(row.id);
    }
    return null;
  }
  return row;
}

export function validateGuestBroadcasterLink(token) {
  const row = validateShareToken(token);
  if (!row || row.guest_mode !== "guest_broadcaster") return null;
  if (row.link_kind !== "ui") return null;
  return row;
}

export function userOwnsShareLink(userId, linkId) {
  const row = getShareLinkById(linkId);
  return row && Number(row.created_by) === Number(userId);
}

export function enrichShareLink(row, base = "") {
  const prefix = base ? base.replace(/\/$/, "") : "";
  return {
    ...row,
    guest_mode: row.guest_mode || "listener",
    uiUrl: prefix ? `${prefix}/listen/${row.token}` : `/listen/${row.token}`,
    streamUrl: prefix
      ? `${prefix}/api/listen/${row.token}/stream`
      : `/api/listen/${row.token}/stream`,
    expired: row.expires_at != null && row.expires_at < Date.now(),
  };
}
