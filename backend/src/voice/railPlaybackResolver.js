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

function pickLinkFields(metadata) {
  if (!metadata) return {};
  return {
    url: normalizeText(metadata.url),
    licenseUrl: normalizeText(metadata.licenseUrl),
    licenseType: normalizeText(metadata.licenseType),
    sourceLabel: normalizeText(metadata.sourceLabel),
    sourceSite: normalizeText(metadata.sourceSite),
  };
}

function mergeLinkFields(target, source) {
  if (!source) return target;
  for (const key of ["url", "licenseUrl", "licenseType", "sourceLabel", "sourceSite"]) {
    if (!target[key] && source[key]) target[key] = source[key];
  }
  return target;
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
        url: null,
        licenseUrl: null,
        licenseType: null,
        sourceLabel: null,
        sourceSite: null,
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
    let linkFields = {
      url: null,
      licenseUrl: null,
      licenseType: null,
      sourceLabel: null,
      sourceSite: null,
    };

    const native = getStoredNativeMetadataForRail?.(railId);
    if (native) {
      title = normalizeText(native.title) ?? title;
      artist = normalizeText(native.artist) ?? artist;
      albumArtUrl = normalizeArtUrl(native.albumArt) ?? albumArtUrl;
      mergeLinkFields(linkFields, pickLinkFields(native));
    }

    if (railId === activeWsId) {
      const stable = getLiveStabilizedMetadata?.();
      if (stable) {
        title = normalizeText(stable.title) ?? title;
        artist = normalizeText(stable.artist) ?? artist;
        albumArtUrl = normalizeArtUrl(stable.albumArt) ?? albumArtUrl;
        mergeLinkFields(linkFields, pickLinkFields(stable));
      }
      const liveTitle = normalizeText(getCurrentSong());
      const liveArtist = normalizeText(getCurrentArtist());
      if (liveTitle && !isPlaceholderPlaybackTitle(liveTitle)) {
        title = liveTitle;
        artist = liveArtist ?? artist;
        linkFields = {
          url: null,
          licenseUrl: null,
          licenseType: null,
          sourceLabel: null,
          sourceSite: null,
        };
        if (
          stable &&
          normalizeText(stable.title) === title &&
          normalizeText(stable.artist) === artist
        ) {
          mergeLinkFields(linkFields, pickLinkFields(stable));
        } else if (
          native &&
          normalizeText(native.title) === title &&
          normalizeText(native.artist) === artist
        ) {
          mergeLinkFields(linkFields, pickLinkFields(native));
        }
      }
    }

    albumArtUrl = lookupAlbumArt(title, artist, albumArtUrl) ?? albumArtUrl ?? null;

    const result = {
      railId,
      displayName,
      title,
      artist,
      albumArtUrl,
      ...linkFields,
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
