import { getSetting, setSetting } from "../db/index.js";

const MIRROR_KEY = "internalSongMirror";

export function mirrorInternalSongInfo(info) {
  setSetting(MIRROR_KEY, {
    title: info.title ?? null,
    artist: info.artist ?? null,
    albumArtUrl: info.albumArtUrl ?? null,
    url: info.url ?? null,
    licenseUrl: info.licenseUrl ?? null,
    licenseType: info.licenseType ?? null,
    sourceLabel: info.sourceLabel ?? null,
    sourceSite: info.sourceSite ?? null,
    liveRailId: info.liveRailId ?? null,
    active: !!info.active,
    broadcasterDisplayName: info.broadcasterDisplayName ?? null,
    updatedAt: Date.now(),
  });
}

export function readInternalSongMirror() {
  return getSetting(MIRROR_KEY, null);
}
