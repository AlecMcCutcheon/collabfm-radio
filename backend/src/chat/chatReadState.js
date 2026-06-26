import { getShareLinkById } from "../db/shareLinks.js";

/** @type {Map<string, { lastReadAt: number }>} */
const readCursors = new Map();

export function recipientKeyForUser(userId) {
  return `user:${String(userId)}`;
}

export function recipientKeyForGuest(shareToken, guestId) {
  return `guest:${String(shareToken)}:${String(guestId)}`;
}

export function getLastReadAt(recipientKey) {
  return readCursors.get(recipientKey)?.lastReadAt ?? 0;
}

export function markChatReadForRecipient(recipientKey, messages) {
  const lastReadAt = messages.length
    ? Math.max(...messages.map((m) => Number(m.timestamp) || 0))
    : Date.now();
  readCursors.set(recipientKey, { lastReadAt });
  return lastReadAt;
}

export function countUnreadMessages(messages, recipientKey, viewerUserId) {
  const lastReadAt = getLastReadAt(recipientKey);
  return messages.filter((message) => {
    const timestamp = Number(message.timestamp) || 0;
    if (timestamp <= lastReadAt) return false;
    if (viewerUserId && message.userId === viewerUserId) return false;
    return true;
  }).length;
}

export function purgeGuestReadStateForShareLink(shareLinkId) {
  const link = getShareLinkById(shareLinkId);
  if (!link?.token) return;
  const prefix = recipientKeyForGuest(link.token, "");
  for (const key of [...readCursors.keys()]) {
    if (key.startsWith(prefix)) readCursors.delete(key);
  }
}
