import { getDb } from "./index.js";
import { isValidGuestId } from "../security/guestSession.js";

export const GUEST_AVATAR_VARIANT_MAX = 12;
export const GUEST_COVER_ICON_MAX = 25;

function clampAvatarVariant(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(GUEST_AVATAR_VARIANT_MAX - 1, Math.floor(n));
}

function clampCoverIcon(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(GUEST_COVER_ICON_MAX - 1, Math.floor(n));
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    displayName: row.display_name,
    avatarVariant: clampAvatarVariant(row.avatar_variant),
    coverIcon: clampCoverIcon(row.cover_icon),
  };
}

export function upsertGuestProfile(shareLinkId, guestId, fields = {}) {
  const linkId = Number(shareLinkId);
  const id = String(guestId || "").trim();
  if (!Number.isFinite(linkId) || linkId <= 0 || !id || !isValidGuestId(id)) return null;

  const existing = getDb()
    .prepare(
      "SELECT display_name, avatar_variant, cover_icon FROM guest_display_names WHERE share_link_id = ? AND guest_id = ?",
    )
    .get(linkId, id);

  const displayName = String(
    fields.displayName ?? existing?.display_name ?? "",
  ).trim();
  if (!displayName) return null;

  const avatarVariant = clampAvatarVariant(
    fields.avatarVariant ?? existing?.avatar_variant ?? 0,
  );
  const coverIcon = clampCoverIcon(fields.coverIcon ?? existing?.cover_icon ?? 0);

  getDb()
    .prepare(
      `INSERT INTO guest_display_names (share_link_id, guest_id, display_name, avatar_variant, cover_icon, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(share_link_id, guest_id) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_variant = excluded.avatar_variant,
         cover_icon = excluded.cover_icon,
         updated_at = excluded.updated_at`,
    )
    .run(linkId, id, displayName, avatarVariant, coverIcon);

  return { displayName, avatarVariant, coverIcon };
}

export function upsertGuestDisplayName(shareLinkId, guestId, displayName) {
  return upsertGuestProfile(shareLinkId, guestId, { displayName });
}

export function getGuestProfileFromDb(shareLinkId, guestId) {
  const linkId = Number(shareLinkId);
  const id = String(guestId || "").trim();
  if (!Number.isFinite(linkId) || linkId <= 0 || !id || !isValidGuestId(id)) return null;
  const row = getDb()
    .prepare(
      `SELECT display_name, avatar_variant, cover_icon
       FROM guest_display_names
       WHERE share_link_id = ? AND guest_id = ?`,
    )
    .get(linkId, id);
  return rowToProfile(row);
}

export function getGuestDisplayNameFromDb(shareLinkId, guestId) {
  return getGuestProfileFromDb(shareLinkId, guestId)?.displayName ?? null;
}

export function getLatestGuestProfileForGuestId(guestId) {
  const id = String(guestId || "").trim();
  if (!id || !isValidGuestId(id)) return null;
  const row = getDb()
    .prepare(
      `SELECT display_name, avatar_variant, cover_icon
       FROM guest_display_names
       WHERE guest_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(id);
  return rowToProfile(row);
}

export function deleteGuestDisplayNamesForShareLink(shareLinkId) {
  const linkId = Number(shareLinkId);
  if (!Number.isFinite(linkId) || linkId <= 0) return 0;
  const result = getDb()
    .prepare("DELETE FROM guest_display_names WHERE share_link_id = ?")
    .run(linkId);
  return result.changes;
}
