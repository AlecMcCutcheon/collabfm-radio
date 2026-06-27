import {
  extensionStorageGet,
  extensionStorageRemove,
  extensionStorageSet,
} from "./extension-storage.js";

const GUEST_ID_KEY = "radioGuestId";
const LEGACY_GUEST_ID_KEY = "extensionGuestId";
const GUEST_NICKNAME_KEY = "radioGuestNickname";
const LEGACY_NICKNAME_KEY = "extensionGuestNickname";

const ADJECTIVES = [
  "Neon",
  "Cosmic",
  "Velvet",
  "Static",
  "Midnight",
  "Golden",
  "Silver",
  "Electric",
  "Lucky",
  "Chill",
  "Fuzzy",
  "Pixel",
];

const NOUNS = [
  "Listener",
  "Tuner",
  "Wave",
  "Signal",
  "Vibe",
  "Echo",
  "Beat",
  "Groove",
  "Frequency",
  "Fan",
  "Head",
  "Caller",
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseShareToken(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/\/listen\/([^/]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    // not a URL
  }
  const pathMatch = raw.match(/\/listen\/([^/?#]+)/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  return raw.split(/[?#]/)[0].trim();
}

export function sanitizeGuestNickname(raw, maxLen = 32) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, maxLen);
}

function randomGuestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isValidGuestId(raw) {
  const t = String(raw || "").trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t) ||
    /^g-\d+-[a-z0-9]+$/i.test(t)
  );
}

export function parseGuestIdInput(input) {
  const trimmed = String(input || "").trim();
  if (isValidGuestId(trimmed)) return trimmed;
  const uuidMatch = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  if (uuidMatch && isValidGuestId(uuidMatch[0])) return uuidMatch[0];
  const legacy = trimmed.match(/^g-\d+-[a-z0-9]+$/i);
  return legacy ? legacy[0] : null;
}

/** Same algorithm as frontend guestIdentity.ts */
export function proceduralGuestName(shareToken, guestId) {
  const seed = `${shareToken}|${guestId}`;
  const hash = hashString(seed);
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[(hash >> 8) % NOUNS.length];
  const suffix = (hash >> 16) % 100;
  return `${adj}${noun}${suffix}`;
}

async function migrateLegacyGuestStorage(stored) {
  const updates = {};
  const removals = [];
  if (!stored[GUEST_ID_KEY] && stored[LEGACY_GUEST_ID_KEY]) {
    updates[GUEST_ID_KEY] = stored[LEGACY_GUEST_ID_KEY];
    removals.push(LEGACY_GUEST_ID_KEY);
  }
  if (!stored[GUEST_NICKNAME_KEY] && stored[LEGACY_NICKNAME_KEY]) {
    updates[GUEST_NICKNAME_KEY] = stored[LEGACY_NICKNAME_KEY];
    removals.push(LEGACY_NICKNAME_KEY);
  }
  if (Object.keys(updates).length) {
    await extensionStorageSet(updates);
  }
  if (removals.length) {
    await extensionStorageRemove(removals);
  }
  return { ...stored, ...updates };
}

export async function getOrCreateGuestId() {
  let stored = await extensionStorageGet([
    GUEST_ID_KEY,
    LEGACY_GUEST_ID_KEY,
    GUEST_NICKNAME_KEY,
    LEGACY_NICKNAME_KEY,
  ]);
  stored = await migrateLegacyGuestStorage(stored);
  if (stored[GUEST_ID_KEY]) return stored[GUEST_ID_KEY];
  const guestId = randomGuestId();
  await extensionStorageSet({ [GUEST_ID_KEY]: guestId });
  return guestId;
}

export async function linkGuestId(guestIdInput) {
  const id = parseGuestIdInput(guestIdInput);
  if (!id) return null;
  await extensionStorageSet({ [GUEST_ID_KEY]: id });
  await extensionStorageRemove([GUEST_NICKNAME_KEY, LEGACY_NICKNAME_KEY]);
  return id;
}

export async function resolveGuestIdentity(shareToken, { guestIdDraft } = {}) {
  const linkedId = parseGuestIdInput(guestIdDraft);
  if (linkedId) {
    await linkGuestId(linkedId);
  }

  const guestId = linkedId || (await getOrCreateGuestId());
  const stored = await extensionStorageGet([GUEST_NICKNAME_KEY, LEGACY_NICKNAME_KEY]);
  const customNickname = stored[GUEST_NICKNAME_KEY] || stored[LEGACY_NICKNAME_KEY] || "";
  const sanitized = customNickname ? sanitizeGuestNickname(customNickname) : "";
  const proceduralName = proceduralGuestName(shareToken, guestId);
  const guestName = sanitized || proceduralName;
  return { guestId, guestName };
}

export async function applyLocalGuestProfile({ guestId, guestName, customNickname }) {
  const id = String(guestId || "").trim();
  const name = sanitizeGuestNickname(guestName);
  if (!id || !name) return;

  const stored = await extensionStorageGet(["guestAuth", GUEST_NICKNAME_KEY]);
  const updates = {};
  if (stored.guestAuth?.guestId === id) {
    updates.guestAuth = { ...stored.guestAuth, guestName: name };
  }
  const custom = customNickname ? sanitizeGuestNickname(customNickname) : "";
  if (custom) {
    updates[GUEST_NICKNAME_KEY] = custom;
  }

  if (Object.keys(updates).length) {
    await extensionStorageSet(updates);
  }
  if (!custom && stored[GUEST_NICKNAME_KEY]) {
    await extensionStorageRemove(GUEST_NICKNAME_KEY);
  }
}

export function formatGuestAuthStatus(guestAuth) {
  const name = guestAuth?.guestName ? String(guestAuth.guestName).trim() : "Guest";
  return `Guest — ${name}`;
}

/** Apply server-published nickname to stored guest auth (website ↔ extension sync). */
export async function applyServerGuestDisplayName(guestAuth, serverName, shareToken) {
  const name = sanitizeGuestNickname(serverName);
  if (!name || !guestAuth || name === guestAuth.guestName) return guestAuth;

  const proceduralName = proceduralGuestName(shareToken, guestAuth.guestId);
  const nextGuestAuth = { ...guestAuth, guestName: name };
  const updates = { guestAuth: nextGuestAuth };
  if (name !== proceduralName) {
    updates[GUEST_NICKNAME_KEY] = name;
  }
  await extensionStorageSet(updates);
  return nextGuestAuth;
}

export async function syncGuestAuthDisplayName(guestAuth, apiOrigin) {
  if (!guestAuth?.shareToken || !guestAuth?.guestId || !apiOrigin) return guestAuth;
  try {
    const res = await fetch(`${apiOrigin}/api/extension/guest/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareToken: guestAuth.shareToken,
        guestId: guestAuth.guestId,
      }),
    });
    if (!res.ok) return guestAuth;
    const data = await res.json();
    if (data.guestDisplayName) {
      return await applyServerGuestDisplayName(guestAuth, data.guestDisplayName, guestAuth.shareToken);
    }
  } catch {
    /* ignore */
  }
  return guestAuth;
}

/** Distinguish expired guest links from temporary server/network issues. */
export async function checkStoredGuestAuth(guestAuth, apiOrigin) {
  if (!guestAuth?.shareToken || !apiOrigin) return { status: "invalid" };
  try {
    const res = await fetch(`${apiOrigin}/api/extension/guest/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken: guestAuth.shareToken }),
    });
    if (res.status === 403 || res.status === 404) {
      return { status: "invalid" };
    }
    if (!res.ok) {
      return { status: "offline", guestAuth };
    }
    const data = await res.json();
    if (!data.valid) return { status: "invalid" };
    return {
      status: "valid",
      guestAuth: {
        ...guestAuth,
        label: data.label ?? guestAuth.label,
        expiresAt: data.expiresAt ?? guestAuth.expiresAt,
      },
    };
  } catch {
    return { status: "offline", guestAuth };
  }
}

/** @deprecated use resolveGuestIdentity */
export async function resolveGuestName(shareToken) {
  const { guestName } = await resolveGuestIdentity(shareToken);
  return guestName;
}
