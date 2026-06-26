import type { PartyEffectType } from "../types/api";
import { ASSIGNABLE_PARTY_EFFECT_TYPES } from "../config/partyEffectMenu";

export const PARTY_FAVORITE_SLOT_COUNT = 8;
export const PARTY_FAVORITES_CHANGED_EVENT = "party-favorites-changed";

export type PartyFavoriteSlots = (PartyEffectType | null)[];

const STORAGE_PREFIX = "partyEffectFavorites_v1:";

export function partyFavoritesStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function emptyPartyFavoriteSlots(): PartyFavoriteSlots {
  return Array.from({ length: PARTY_FAVORITE_SLOT_COUNT }, () => null);
}

function normalizeSlots(raw: unknown): PartyFavoriteSlots {
  if (!Array.isArray(raw) || raw.length !== PARTY_FAVORITE_SLOT_COUNT) {
    return emptyPartyFavoriteSlots();
  }
  return raw.map((value) =>
    typeof value === "string" && ASSIGNABLE_PARTY_EFFECT_TYPES.has(value as PartyEffectType)
      ? (value as PartyEffectType)
      : null,
  );
}

export function loadPartyFavorites(scope: string): PartyFavoriteSlots {
  try {
    const raw = localStorage.getItem(partyFavoritesStorageKey(scope));
    if (!raw) return emptyPartyFavoriteSlots();
    return normalizeSlots(JSON.parse(raw));
  } catch {
    return emptyPartyFavoriteSlots();
  }
}

export function savePartyFavorites(scope: string, slots: PartyFavoriteSlots): void {
  localStorage.setItem(partyFavoritesStorageKey(scope), JSON.stringify(normalizeSlots(slots)));
  window.dispatchEvent(new Event(PARTY_FAVORITES_CHANGED_EVENT));
}

export function partyFavoritesScopeForUser(userId: string | number | undefined | null): string | null {
  if (userId == null || userId === "") return null;
  return `user:${userId}`;
}

export function partyFavoritesScopeForGuest(
  shareToken: string,
  guestId: string | undefined | null,
): string | null {
  if (!shareToken || !guestId) return null;
  return `guest:${shareToken}:${guestId}`;
}

/** Sensible starter hotkeys for first-time guest listeners. */
export const DEFAULT_GUEST_PARTY_FAVORITE_SLOTS: PartyFavoriteSlots = [
  "fireworks",
  "confetti",
  "react_love",
  "react_clap",
  "rocket",
  "react_fire",
  "hearts",
  "react_laugh",
];

export function seedPartyFavoritesIfEmpty(
  scope: string,
  defaults: PartyFavoriteSlots = DEFAULT_GUEST_PARTY_FAVORITE_SLOTS,
): boolean {
  if (!scope) return false;
  try {
    if (localStorage.getItem(partyFavoritesStorageKey(scope)) != null) return false;
    savePartyFavorites(scope, defaults);
    return true;
  } catch {
    return false;
  }
}
