import type { SongMetadata } from "../types/api";
import { apiUrl } from "../config";

const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

interface LastFmImage {
  size?: string;
  "#text"?: string;
}

interface LastFmTrack {
  name?: string;
  url?: string;
  artist?: { "#text"?: string } | string;
  "@attr"?: { nowplaying?: string };
  image?: LastFmImage[];
}

interface LastFmPayload {
  disabled?: boolean;
  recenttracks?: { track?: LastFmTrack | LastFmTrack[] };
  title?: string;
  artist?: string;
  albumArt?: string;
  url?: string;
}

function tracksFromPayload(data: LastFmPayload): LastFmTrack[] {
  const raw = data.recenttracks?.track;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function artistFromTrack(track: LastFmTrack): string {
  const artist = track.artist;
  if (!artist) return "Unknown Artist";
  if (typeof artist === "string") return artist;
  return artist["#text"] || "Unknown Artist";
}

function albumArtFromTrack(track: LastFmTrack): string | undefined {
  const images = track.image;
  if (!Array.isArray(images)) return undefined;

  for (let i = images.length - 1; i >= 0; i--) {
    const url = images[i]?.["#text"];
    if (!url) continue;
    if (url.includes(LASTFM_PLACEHOLDER)) continue;
    return url;
  }
  return undefined;
}

function resolveAlbumArtUrl(url?: string): string | undefined {
  const text = String(url || "").trim();
  if (!text) return undefined;
  if (text.startsWith("/") && !text.startsWith("//")) return apiUrl(text);
  return text;
}

/** Normalize /api/metadata (Last.fm-shaped JSON) into UI fields. */
export function parseMetadataResponse(data: unknown): SongMetadata | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as LastFmPayload;
  if (payload.disabled) return null;

  if (payload.title && payload.artist) {
    return {
      title: payload.title,
      artist: payload.artist,
      albumArt: resolveAlbumArtUrl(payload.albumArt),
      url: payload.url,
    };
  }

  const track = tracksFromPayload(payload)[0];
  if (!track) return null;

  const title = track.name || "Unknown Title";
  const artist = artistFromTrack(track);

  if (title === "Unknown Title" && artist === "Unknown Artist") {
    return null;
  }

  return {
    title,
    artist,
    albumArt: resolveAlbumArtUrl(albumArtFromTrack(track)),
    url: track.url,
  };
}
