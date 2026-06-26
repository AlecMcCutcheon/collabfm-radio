import { GUEST_COVER_ICON_COUNT } from "./guestCoverIcons";

const SCOPES_STORAGE_KEY = "radioGuestScopes_v1";

export const GUEST_AVATAR_VARIANT_COUNT = 12;

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

interface GuestScopeRecord {
  guestId: string;
  originalGuestId: string;
  nickname?: string;
  avatarVariant?: number;
  coverIcon?: number;
}

type GuestScopeMap = Record<string, GuestScopeRecord>;

export interface GuestIdentity {
  guestId: string;
  originalGuestId: string;
  guestName: string;
  avatarVariant: number;
  coverIcon: number;
}

export interface GuestServerProfile {
  displayName?: string | null;
  avatarVariant?: number | null;
  coverIcon?: number | null;
}

/** FNV-1a — must match backend/broadcaster-extension/guest-auth.js */
function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Strip spaces and limit length for guest or on-air nicknames. */
export function sanitizeNickname(raw: string, maxLen = 32): string {
  return raw.trim().replace(/\s+/g, "").slice(0, maxLen);
}

function randomGuestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function scopeKey(shareToken: string): string {
  return shareToken.trim() || "_anonymous";
}

function loadScopes(): GuestScopeMap {
  try {
    const raw = localStorage.getItem(SCOPES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GuestScopeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveScopes(scopes: GuestScopeMap): void {
  localStorage.setItem(SCOPES_STORAGE_KEY, JSON.stringify(scopes));
}

function clampAvatarVariant(raw: number | undefined): number {
  const n = raw == null ? 0 : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || n >= GUEST_AVATAR_VARIANT_COUNT) return 0;
  return n;
}

function clampCoverIcon(raw: number | undefined): number {
  const n = raw == null ? 0 : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || n >= GUEST_COVER_ICON_COUNT) return 0;
  return n;
}

function ensureScope(shareToken: string): GuestScopeRecord {
  const key = scopeKey(shareToken);
  const scopes = loadScopes();
  let scope = scopes[key];
  if (!scope?.guestId) {
    const guestId = randomGuestId();
    scope = { guestId, originalGuestId: guestId };
    scopes[key] = scope;
    saveScopes(scopes);
  }
  return scope;
}

function writeScope(shareToken: string, patch: Partial<GuestScopeRecord>): GuestScopeRecord {
  const key = scopeKey(shareToken);
  const scopes = loadScopes();
  const current = scopes[key] ?? ensureScope(shareToken);
  const next: GuestScopeRecord = { ...current, ...patch };
  scopes[key] = next;
  saveScopes(scopes);
  return next;
}

export function isValidGuestId(raw: string): boolean {
  const t = raw.trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t) ||
    /^g-\d+-[a-z0-9]+$/i.test(t)
  );
}

/** Extract a guest ID from pasted text (full UUID or legacy id). */
export function parseGuestIdInput(input: string): string | null {
  const trimmed = input.trim();
  if (isValidGuestId(trimmed)) return trimmed;
  const uuidMatch = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  if (uuidMatch && isValidGuestId(uuidMatch[0])) return uuidMatch[0];
  const legacy = trimmed.match(/^g-\d+-[a-z0-9]+$/i);
  return legacy ? legacy[0] : null;
}

export function proceduralGuestName(shareToken: string, guestId: string): string {
  const seed = `${shareToken}|${guestId}`;
  const hash = fnv1aHash(seed);
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[(hash >> 8) % NOUNS.length];
  const suffix = (hash >> 16) % 100;
  return `${adj}${noun}${suffix}`;
}

export function guestUserId(guestId: string): string {
  return `guest:${guestId}`;
}

/** Seed for procedural avatar art — variant picks a consistent alternate look. */
export function guestAvatarSeed(guestId: string, variant = 0): string {
  const v = Math.max(0, Math.min(GUEST_AVATAR_VARIANT_COUNT - 1, Math.floor(variant)));
  return `${guestId}:avatar:v${v}`;
}

export function hasCustomGuestNickname(shareToken: string): boolean {
  const scope = ensureScope(shareToken);
  return !!(scope.nickname && sanitizeNickname(scope.nickname));
}

export function getGuestIdentity(shareToken: string): GuestIdentity {
  const scope = ensureScope(shareToken);
  const customNickname = scope.nickname ? sanitizeNickname(scope.nickname) : "";
  const proceduralName = proceduralGuestName(shareToken, scope.guestId);
  return {
    guestId: scope.guestId,
    originalGuestId: scope.originalGuestId,
    guestName: customNickname || proceduralName,
    avatarVariant: clampAvatarVariant(scope.avatarVariant),
    coverIcon: clampCoverIcon(scope.coverIcon),
  };
}

export function proceduralNameForCurrentGuest(shareToken: string): string {
  const { guestId } = getGuestIdentity(shareToken);
  return proceduralGuestName(shareToken, guestId);
}

export function isGuestIdLinked(shareToken: string): boolean {
  const { guestId, originalGuestId } = getGuestIdentity(shareToken);
  return guestId !== originalGuestId;
}

/** Adopt an ID from the extension (scoped to this share link). Clears custom nickname. */
export function linkGuestId(guestIdInput: string, shareToken: string): GuestIdentity | null {
  const id = parseGuestIdInput(guestIdInput);
  if (!id) return null;
  const scope = ensureScope(shareToken);
  const scopes = loadScopes();
  const key = scopeKey(shareToken);
  scopes[key] = {
    ...scope,
    guestId: id,
    nickname: undefined,
  };
  delete scopes[key].nickname;
  saveScopes(scopes);
  return getGuestIdentity(shareToken);
}

export function setGuestNickname(nickname: string, shareToken: string): GuestIdentity {
  const trimmed = sanitizeNickname(nickname);
  if (trimmed) {
    writeScope(shareToken, { nickname: trimmed });
  } else {
    resetGuestNickname(shareToken);
  }
  return getGuestIdentity(shareToken);
}

export function resetGuestNickname(shareToken: string): GuestIdentity {
  const scopes = loadScopes();
  const key = scopeKey(shareToken);
  if (scopes[key]) {
    delete scopes[key].nickname;
    saveScopes(scopes);
  }
  return getGuestIdentity(shareToken);
}

/** Restore this link's browser-native guest ID (before any extension link). */
export function resetGuestIdToOriginal(shareToken: string): GuestIdentity {
  const scope = ensureScope(shareToken);
  const scopes = loadScopes();
  const key = scopeKey(shareToken);
  scopes[key] = {
    ...scope,
    guestId: scope.originalGuestId,
    nickname: undefined,
  };
  delete scopes[key].nickname;
  saveScopes(scopes);
  return getGuestIdentity(shareToken);
}

export function setGuestAvatarVariant(variant: number, shareToken: string): number {
  const v = clampAvatarVariant(variant);
  writeScope(shareToken, { avatarVariant: v });
  return v;
}

export function resetGuestAvatarVariant(shareToken: string): number {
  writeScope(shareToken, { avatarVariant: 0 });
  return 0;
}

export function setGuestCoverIcon(iconId: number, shareToken: string): number {
  const id = clampCoverIcon(iconId);
  writeScope(shareToken, { coverIcon: id });
  return id;
}

export function resetGuestCoverIcon(shareToken: string): number {
  writeScope(shareToken, { coverIcon: 0 });
  return 0;
}

/** Apply a saved server profile for this share link (listeners and broadcasters). */
export function mergeGuestProfileFromServer(
  shareToken: string,
  profile: GuestServerProfile,
): GuestIdentity {
  const scope = ensureScope(shareToken);
  const patch: Partial<GuestScopeRecord> = {};

  if (profile.displayName) {
    const trimmed = sanitizeNickname(profile.displayName);
    const procedural = proceduralGuestName(shareToken, scope.guestId);
    if (trimmed && trimmed !== procedural) {
      patch.nickname = trimmed;
    }
  }
  if (profile.avatarVariant != null && Number.isFinite(Number(profile.avatarVariant))) {
    patch.avatarVariant = clampAvatarVariant(Number(profile.avatarVariant));
  }
  if (profile.coverIcon != null && Number.isFinite(Number(profile.coverIcon))) {
    patch.coverIcon = clampCoverIcon(Number(profile.coverIcon));
  }

  if (Object.keys(patch).length > 0) {
    writeScope(shareToken, patch);
  }
  return getGuestIdentity(shareToken);
}
