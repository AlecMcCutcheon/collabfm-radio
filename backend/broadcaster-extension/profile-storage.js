import { resolveRadioEndpoints, DEFAULT_RADIO_HOST } from "./radio-config.js";
import {
  extensionStorageGet,
  extensionStorageRemove,
  extensionStorageSet,
} from "./extension-storage.js";

export const PROFILES_STORAGE_KEY = "connectionProfiles";
const PROFILES_VERSION = 1;

const FLAT_PROFILE_KEYS = [
  "radioHost",
  "relayUrl",
  "apiOrigin",
  "authMode",
  "pairedDevice",
  "pendingPair",
  "guestAuth",
  "guestFormDraft",
  "radioGuestId",
  "radioGuestNickname",
  "rememberedTabId",
];

function newProfileId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function profileLabelFromHost(radioHost) {
  const raw = String(radioHost || "").trim();
  if (!raw) return "New server";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    let host = url.hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    return host || "New server";
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0] || "New server";
  }
}

export function createEmptyProfile(overrides = {}) {
  const id = newProfileId();
  return {
    id,
    label: "New server",
    radioHost: "",
    relayUrl: "",
    apiOrigin: "",
    authMode: "pair",
    pairedDevice: null,
    pendingPair: null,
    guestAuth: null,
    guestFormDraft: null,
    radioGuestId: null,
    radioGuestNickname: null,
    rememberedTabId: null,
    ...overrides,
  };
}

function profileFromFlat(flat, id = newProfileId()) {
  const radioHost = flat.radioHost || "";
  const endpoints = radioHost
    ? resolveRadioEndpoints(radioHost)
    : { wsUrl: "", apiOrigin: "" };
  return createEmptyProfile({
    id,
    label: profileLabelFromHost(radioHost),
    radioHost,
    relayUrl: flat.relayUrl || endpoints.wsUrl || "",
    apiOrigin: flat.apiOrigin || endpoints.apiOrigin || "",
    authMode: flat.authMode === "guest" ? "guest" : "pair",
    pairedDevice: flat.pairedDevice || null,
    pendingPair: flat.pendingPair || null,
    guestAuth: flat.guestAuth || null,
    guestFormDraft: flat.guestFormDraft || null,
    radioGuestId: flat.radioGuestId || null,
    radioGuestNickname: flat.radioGuestNickname || null,
    rememberedTabId: flat.rememberedTabId ?? null,
  });
}

function flatFromProfile(profile) {
  const radioHost = profile.radioHost || "";
  let relayUrl = profile.relayUrl || "";
  let apiOrigin = profile.apiOrigin || "";
  if (radioHost && (!relayUrl || !apiOrigin)) {
    try {
      const endpoints = resolveRadioEndpoints(radioHost);
      relayUrl = relayUrl || endpoints.wsUrl;
      apiOrigin = apiOrigin || endpoints.apiOrigin;
    } catch {}
  }
  const flat = {
    radioHost,
    relayUrl,
    apiOrigin,
    authMode: profile.authMode === "guest" ? "guest" : "pair",
    pairedDevice: profile.pairedDevice || undefined,
    pendingPair: profile.pendingPair || undefined,
    guestAuth: profile.guestAuth || undefined,
    guestFormDraft: profile.guestFormDraft || undefined,
    radioGuestId: profile.radioGuestId || undefined,
    radioGuestNickname: profile.radioGuestNickname || undefined,
    rememberedTabId: profile.rememberedTabId ?? undefined,
  };
  for (const key of Object.keys(flat)) {
    if (flat[key] === undefined) delete flat[key];
  }
  return flat;
}

function normalizeProfilesState(raw) {
  if (!raw?.profiles || typeof raw.profiles !== "object") {
    return null;
  }
  const profiles = { ...raw.profiles };
  const ids = Object.keys(profiles);
  if (!ids.length) return null;
  let activeProfileId = raw.activeProfileId;
  if (!activeProfileId || !profiles[activeProfileId]) {
    activeProfileId = ids[0];
  }
  return {
    version: PROFILES_VERSION,
    activeProfileId,
    profiles,
  };
}

export async function loadProfilesState() {
  const stored = await extensionStorageGet([PROFILES_STORAGE_KEY]);
  return normalizeProfilesState(stored[PROFILES_STORAGE_KEY]);
}

export async function migrateLegacyStorageIfNeeded() {
  const existing = await loadProfilesState();
  if (existing) return existing;

  const flat = await extensionStorageGet(FLAT_PROFILE_KEYS);
  const hasLegacyData =
    flat.radioHost ||
    flat.pairedDevice ||
    flat.pendingPair ||
    flat.guestAuth;

  const profile = profileFromFlat(
    hasLegacyData
      ? flat
      : {
          radioHost: DEFAULT_RADIO_HOST,
          authMode: "pair",
        },
  );

  const state = {
    version: PROFILES_VERSION,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
  };

  await extensionStorageSet({
    [PROFILES_STORAGE_KEY]: state,
    ...flatFromProfile(profile),
  });

  return state;
}

export async function captureFlatIntoActiveProfile(extra = {}) {
  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  const flat = await extensionStorageGet(FLAT_PROFILE_KEYS);
  const mergedFlat = { ...flat, ...extra };
  const activeId = state.activeProfileId;
  const current = state.profiles[activeId] || createEmptyProfile({ id: activeId });
  const nextProfile = profileFromFlat(mergedFlat, activeId);
  nextProfile.label = profileLabelFromHost(nextProfile.radioHost) || current.label;

  const nextState = {
    ...state,
    profiles: {
      ...state.profiles,
      [activeId]: nextProfile,
    },
  };

  await extensionStorageSet({ [PROFILES_STORAGE_KEY]: nextState });
  return nextProfile;
}

export async function applyProfileToFlat(profile) {
  const flat = flatFromProfile(profile);
  const removals = FLAT_PROFILE_KEYS.filter((key) => !(key in flat));
  await extensionStorageSet(flat);
  if (removals.length) {
    await extensionStorageRemove(removals);
  }
  return flat;
}

export async function getActiveProfile() {
  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  return state.profiles[state.activeProfileId] || null;
}

export async function listProfiles() {
  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  const activeId = state.activeProfileId;
  return Object.values(state.profiles)
    .map((profile) => ({
      ...profile,
      isActive: profile.id === activeId,
    }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return String(a.label).localeCompare(String(b.label));
    });
}

async function saveProfilesState(state) {
  await extensionStorageSet({ [PROFILES_STORAGE_KEY]: state });
  return state;
}

export function isUnusedProfile(profile) {
  if (!profile) return false;
  if (String(profile.radioHost || "").trim()) return false;
  if (profile.pairedDevice?.deviceToken) return false;
  if (profile.guestAuth?.shareToken) return false;
  return true;
}

function findUnusedProfile(state) {
  for (const profile of Object.values(state.profiles)) {
    if (isUnusedProfile(profile)) return profile;
  }
  return null;
}

export async function activateOrCreateBlankProfile() {
  await captureFlatIntoActiveProfile();

  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  const active = state.profiles[state.activeProfileId];
  if (isUnusedProfile(active)) {
    await applyProfileToFlat(active);
    return active;
  }

  const existing = findUnusedProfile(state);
  if (existing) {
    const nextState = {
      ...state,
      activeProfileId: existing.id,
    };
    await saveProfilesState(nextState);
    await applyProfileToFlat(existing);
    return existing;
  }

  const profile = createEmptyProfile();
  const nextState = {
    ...state,
    activeProfileId: profile.id,
    profiles: {
      ...state.profiles,
      [profile.id]: profile,
    },
  };
  await saveProfilesState(nextState);
  await applyProfileToFlat(profile);
  return profile;
}

export async function switchActiveProfile(profileId) {
  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  if (!state.profiles[profileId]) {
    throw new Error("Profile not found");
  }
  if (state.activeProfileId === profileId) {
    return state.profiles[profileId];
  }

  await captureFlatIntoActiveProfile();

  const nextState = {
    ...state,
    activeProfileId: profileId,
  };
  await saveProfilesState(nextState);

  const profile = nextState.profiles[profileId];
  await applyProfileToFlat(profile);
  return profile;
}

export async function deleteActiveProfile() {
  const state = (await loadProfilesState()) || (await migrateLegacyStorageIfNeeded());
  const ids = Object.keys(state.profiles);
  if (ids.length <= 1) {
    throw new Error("Cannot delete the only saved server");
  }

  const activeId = state.activeProfileId;
  const remaining = { ...state.profiles };
  delete remaining[activeId];

  const nextActiveId = Object.keys(remaining)[0];
  const nextState = {
    ...state,
    activeProfileId: nextActiveId,
    profiles: remaining,
  };

  await saveProfilesState(nextState);
  const profile = nextState.profiles[nextActiveId];
  await applyProfileToFlat(profile);
  return profile;
}

export async function persistConnectionPatch(patch) {
  const setItems = {};
  const removeKeys = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!FLAT_PROFILE_KEYS.includes(key)) continue;
    if (value === null || value === undefined) {
      removeKeys.push(key);
    } else {
      setItems[key] = value;
    }
  }
  if (Object.keys(setItems).length) {
    await extensionStorageSet(setItems);
  }
  if (removeKeys.length) {
    await extensionStorageRemove(removeKeys);
  }
  await captureFlatIntoActiveProfile(setItems);
}
