/** Content script: sync guest nickname from the radio page into extension storage. No imports — MV3 content scripts cannot reliably load sibling modules. */

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

function sanitizeGuestNickname(raw, maxLen = 32) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, maxLen);
}

function isValidGuestId(raw) {
  const t = String(raw || "").trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t) ||
    /^g-\d+-[a-z0-9]+$/i.test(t)
  );
}

/** Same algorithm as frontend guestIdentity.ts / guest-auth.js */
function proceduralGuestName(shareToken, guestId) {
  const seed = `${shareToken}|${guestId}`;
  const hash = hashString(seed);
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[(hash >> 8) % NOUNS.length];
  const suffix = (hash >> 16) % 100;
  return `${adj}${noun}${suffix}`;
}

function readShareTokenFromPath() {
  const match = window.location.pathname.match(/\/listen\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function readPageGuestProfile() {
  const guestId = localStorage.getItem("radioGuestId");
  if (!guestId || !isValidGuestId(guestId)) return null;
  const shareToken = readShareTokenFromPath();
  if (!shareToken) return null;

  const storedNickname = localStorage.getItem("radioGuestNickname");
  const customNickname = storedNickname ? sanitizeGuestNickname(storedNickname) : "";
  const guestName = customNickname || proceduralGuestName(shareToken, guestId);
  return { guestId, guestName, customNickname: customNickname || null };
}

function pushToExtension() {
  const profile = readPageGuestProfile();
  if (!profile) return;
  chrome.runtime
    .sendMessage({
      type: "SYNC_GUEST_PROFILE_FROM_PAGE",
      guestId: profile.guestId,
      guestName: profile.guestName,
      customNickname: profile.customNickname,
    })
    .catch(() => {});
}

pushToExtension();
window.addEventListener("radio-profile-updated", pushToExtension);
window.addEventListener("storage", (event) => {
  if (
    event.key === "radioGuestNickname" ||
    event.key === "radioGuestId" ||
    event.key === null
  ) {
    pushToExtension();
  }
});
setInterval(pushToExtension, 10_000);
