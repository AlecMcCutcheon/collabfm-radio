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
] as const;

export const MAX_PROFILE_GENRES = 5;
export const MAX_PROFILE_STATUS_LENGTH = 80;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

const GENRE_SET = new Set<string>(MUSIC_GENRES);

export function normalizeProfileGenres(raw: unknown): MusicGenre[] {
  if (raw == null) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: MusicGenre[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!GENRE_SET.has(trimmed) || out.includes(trimmed as MusicGenre)) continue;
    out.push(trimmed as MusicGenre);
    if (out.length >= MAX_PROFILE_GENRES) break;
  }
  return out;
}
