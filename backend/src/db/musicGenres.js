/** Shared music genre allowlist for broadcaster profile tags. */
export const MUSIC_GENRES = [
  "Alternative",
  "Ambient",
  "Blues",
  "Classical",
  "Country",
  "Dance",
  "Disco",
  "Drum & Bass",
  "Dubstep",
  "EDM",
  "Electronic",
  "Experimental",
  "Folk",
  "Funk",
  "Garage",
  "Grime",
  "Hip-Hop",
  "House",
  "Indie",
  "Industrial",
  "Jazz",
  "K-Pop",
  "Latin",
  "Lo-Fi",
  "Metal",
  "New Wave",
  "Pop",
  "Punk",
  "R&B",
  "Rap",
  "Reggae",
  "Rock",
  "Ska",
  "Soul",
  "Synthwave",
  "Techno",
  "Trance",
  "Trap",
  "World",
];

export const MAX_PROFILE_GENRES = 5;
export const MAX_PROFILE_STATUS_LENGTH = 80;

const GENRE_SET = new Set(MUSIC_GENRES);

export function normalizeProfileGenres(raw) {
  if (raw == null || raw === "") return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!GENRE_SET.has(trimmed) || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= MAX_PROFILE_GENRES) break;
  }
  return out;
}

export function normalizeProfileBio(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, " ").slice(0, MAX_PROFILE_STATUS_LENGTH);
  return trimmed || null;
}
