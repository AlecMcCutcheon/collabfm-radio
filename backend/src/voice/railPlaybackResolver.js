const railCache = new Map();
const CACHE_MS = 3_000;

function normalizeText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
}

function normalizeArtUrl(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/")) {
    return text;
  }
  return null;
}

function isPlaceholderPlaybackTitle(title) {
  const text = String(title || "").trim();
  if (!text || text === "N/A") return true;
  if (text === "Someone is playing music" || text === "Music playing") return true;
  return / is playing music$/i.test(text);
}

export function createRailPlaybackResolver({
  getWsConnections,
  getActiveWsId,
  getCurrentSong,
  getCurrentArtist,
  getStoredNativeMetadataForUser,
  getStoredNativeMetadataForRail,
  getRailPlaybackSnapshot,
  getLiveStabilizedMetadata,
  lookupAlbumArt,
  formatConnectionStationLabel,
}) {
  async function resolveRailPlayback(railId) {
    const cached = railCache.get(railId);
    if (cached && Date.now() - cached.ts < CACHE_MS) {
      return cached.data;
    }

    const wsConnections = getWsConnections();
    const info = wsConnections.get(railId);
    if (!info) {
      return {
        railId,
        displayName: null,
        title: null,
        artist: null,
        albumArtUrl: null,
        active: false,
        isLive: false,
      };
    }

    const activeWsId = getActiveWsId();
    const displayName = formatConnectionStationLabel
      ? formatConnectionStationLabel(info)
      : String(info.displayName || info.broadcastName || "DJ").trim() || "DJ";

    const snapshot = getRailPlaybackSnapshot?.(railId);
    let title = normalizeText(snapshot?.title) ?? normalizeText(info.trackTitle);
    let artist = normalizeText(snapshot?.artist) ?? normalizeText(info.trackArtist);
    let albumArtUrl =
      normalizeArtUrl(snapshot?.albumArt) ?? normalizeArtUrl(info.trackAlbumArt);

    const native = getStoredNativeMetadataForRail?.(railId);
    if (native) {
      title = normalizeText(native.title) ?? title;
      artist = normalizeText(native.artist) ?? artist;
      albumArtUrl = normalizeArtUrl(native.albumArt) ?? albumArtUrl;
    }

    if (railId === activeWsId) {
      const stable = getLiveStabilizedMetadata?.();
      if (stable) {
        title = normalizeText(stable.title) ?? title;
        artist = normalizeText(stable.artist) ?? artist;
        albumArtUrl = normalizeArtUrl(stable.albumArt) ?? albumArtUrl;
      }
      const liveTitle = normalizeText(getCurrentSong());
      const liveArtist = normalizeText(getCurrentArtist());
      if (liveTitle && !isPlaceholderPlaybackTitle(liveTitle)) {
        title = liveTitle;
        artist = liveArtist ?? artist;
      }
    }

    albumArtUrl = lookupAlbumArt(title, artist, albumArtUrl) ?? albumArtUrl ?? null;

    const result = {
      railId,
      displayName,
      title,
      artist,
      albumArtUrl,
      active: true,
      isLive: railId === activeWsId,
    };

    railCache.set(railId, { data: result, ts: Date.now() });
    return result;
  }

  function invalidateRail(railId) {
    if (railId) railCache.delete(railId);
  }

  return { resolveRailPlayback, invalidateRail };
}
