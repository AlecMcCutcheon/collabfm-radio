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

/** How long to wait for a remote cover before treating it as failed. */
export const REMOTE_IMAGE_PROBE_TIMEOUT_MS = 12_000;

/** Pause before one retry (avoids hammering CDNs on transient slowness). */
export const REMOTE_IMAGE_RETRY_DELAY_MS = 1_500;

/** Append a cache-busting query param for a one-time image reload retry. */
export function cacheBustImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_cfm", String(Date.now()));
    return parsed.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}_cfm=${Date.now()}`;
  }
}

/** Load-check a remote image off-screen (returns false on error or timeout). */
export function probeRemoteImage(
  url: string,
  timeoutMs = REMOTE_IMAGE_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/** Swap broken remote images for a procedural/data-URL fallback (retries once by default). */
export function imageFallbackHandler(
  fallbackSrc: string,
  options?: { retryOnce?: boolean; retryDelayMs?: number },
) {
  const retryOnce = options?.retryOnce !== false;
  const retryDelayMs = options?.retryDelayMs ?? REMOTE_IMAGE_RETRY_DELAY_MS;

  return (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.dataset.fallbackApplied === "1") return;

    const original = img.dataset.originalSrc || img.currentSrc || img.src;
    if (!img.dataset.originalSrc) img.dataset.originalSrc = original;

    const attempt = Number(img.dataset.fallbackAttempt || "0");
    if (retryOnce && attempt === 0 && !original.startsWith("data:")) {
      img.dataset.fallbackAttempt = "1";
      window.setTimeout(() => {
        if (img.dataset.fallbackApplied === "1") return;
        img.src = cacheBustImageUrl(original);
      }, retryDelayMs);
      return;
    }

    if (img.src === fallbackSrc) return;
    img.dataset.fallbackApplied = "1";
    img.onerror = null;
    img.src = fallbackSrc;
  };
}

export function avatarImageFallbackHandler(seed: string, size = 128) {
  return imageFallbackHandler(proceduralAvatarArt(seed, size));
}

export function albumArtFallbackHandler(
  title: string,
  artist: string,
  size = 192,
  options?: { retryOnce?: boolean },
) {
  return imageFallbackHandler(proceduralAlbumArt(title, artist, size), options);
}
