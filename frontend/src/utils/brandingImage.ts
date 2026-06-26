import type { SyntheticEvent } from "react";
import { apiUrl } from "../config";
import { DEFAULT_VISUALIZER_SRC } from "./avatar";
import { proceduralAlbumArt, proceduralAvatarArt } from "./proceduralArt";

/** Procedural station logo when custom branding image is missing or fails to load. */
export function proceduralStationLogo(stationName: string, displaySize = 300): string {
  const name = (stationName || "Radio").trim() || "Radio";
  return proceduralAlbumArt(name, "Station", displaySize);
}

export function resolveBrandingImageUrl(path?: string | null): string {
  const normalized = path || DEFAULT_VISUALIZER_SRC;
  if (normalized.startsWith("http") || normalized.startsWith("data:")) return normalized;
  const url = apiUrl(normalized);
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}

/** Swap broken remote images for a procedural/data-URL fallback (safe to call once). */
export function imageFallbackHandler(fallbackSrc: string) {
  return (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.dataset.fallbackApplied === "1") return;
    if (img.src === fallbackSrc) return;
    img.dataset.fallbackApplied = "1";
    img.onerror = null;
    img.src = fallbackSrc;
  };
}

export function avatarImageFallbackHandler(seed: string, size = 128) {
  return imageFallbackHandler(proceduralAvatarArt(seed, size));
}

export function albumArtFallbackHandler(title: string, artist: string, size = 192) {
  return imageFallbackHandler(proceduralAlbumArt(title, artist, size));
}
