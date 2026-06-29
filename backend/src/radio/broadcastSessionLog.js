import { isContentPolicyMutedMetadata } from "../content/contentPolicy.js";

const MAX_SESSION_SONGS = 100;

/** @type {string | null} */
let sessionKey = null;

/** @type {Array<{ trackSessionId: string, title: string, artist: string, albumArt: string | null, fromRequest: boolean, requestSongKey: string | null, broadcasterUserId: string | null, broadcasterDisplayName: string | null, startedAt: number, endedAt: number | null, isCurrent: boolean }>} */
let sessionSongs = [];

export function beginBroadcastSession(startTimeIso) {
  const key = String(startTimeIso || "").trim();
  if (!key) return;
  sessionKey = key;
  sessionSongs = [];
}

export function endBroadcastSession() {
  sessionKey = null;
  sessionSongs = [];
}

export function appendSessionTrack({
  trackSessionId,
  title,
  artist,
  albumArt = null,
  url = null,
  sourceSite = null,
  licenseType = null,
  licenseUrl = null,
  broadcasterUserId,
  broadcasterDisplayName,
  startedAt = Date.now(),
}) {
  if (!sessionKey || !trackSessionId) return;

  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  if (isContentPolicyMutedMetadata(trackTitle, trackArtist)) return;

  const now = Number(startedAt) || Date.now();
  if (sessionSongs.length > 0) {
    const prev = sessionSongs[sessionSongs.length - 1];
    prev.endedAt = now;
    prev.isCurrent = false;
  }

  sessionSongs.push({
    trackSessionId: String(trackSessionId),
    title: trackTitle,
    artist: trackArtist,
    albumArt: albumArt ? String(albumArt) : null,
    url: url ? String(url) : null,
    sourceSite: sourceSite ? String(sourceSite) : null,
    licenseType: licenseType ? String(licenseType) : null,
    licenseUrl: licenseUrl ? String(licenseUrl) : null,
    fromRequest: false,
    requestSongKey: null,
    broadcasterUserId: broadcasterUserId ? String(broadcasterUserId) : null,
    broadcasterDisplayName: broadcasterDisplayName ? String(broadcasterDisplayName) : null,
    startedAt: now,
    endedAt: null,
    isCurrent: true,
  });

  if (sessionSongs.length > MAX_SESSION_SONGS) {
    sessionSongs = sessionSongs.slice(-MAX_SESSION_SONGS);
  }
}

export function updateSessionTrackAlbumArtByTitleArtist(title, artist, albumArt) {
  const art = String(albumArt || "").trim();
  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  if (!sessionKey || !art || !trackTitle || !trackArtist) return null;
  if (isContentPolicyMutedMetadata(trackTitle, trackArtist)) return null;

  for (let i = sessionSongs.length - 1; i >= 0; i--) {
    const song = sessionSongs[i];
    if (song.title === trackTitle && song.artist === trackArtist) {
      if (song.albumArt === art) return song.trackSessionId;
      song.albumArt = art;
      return song.trackSessionId;
    }
  }
  return null;
}

export function updateSessionTrackSourceLicenseByTitleArtist(
  title,
  artist,
  { url = null, sourceSite = null, licenseType = null, licenseUrl = null } = {},
) {
  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  if (!sessionKey || !trackTitle || !trackArtist) return null;
  if (isContentPolicyMutedMetadata(trackTitle, trackArtist)) return null;

  const nextUrl = url ? String(url).trim() : "";
  const nextSourceSite = sourceSite ? String(sourceSite).trim() : "";
  const nextLicenseType = licenseType ? String(licenseType).trim() : "";
  const nextLicenseUrl = licenseUrl ? String(licenseUrl).trim() : "";
  if (!nextUrl && !nextSourceSite && !nextLicenseType && !nextLicenseUrl) return null;

  for (let i = sessionSongs.length - 1; i >= 0; i--) {
    const song = sessionSongs[i];
    if (song.title !== trackTitle || song.artist !== trackArtist) continue;

    let changed = false;
    if (nextUrl && song.url !== nextUrl) {
      song.url = nextUrl;
      changed = true;
    }
    if (nextSourceSite && song.sourceSite !== nextSourceSite) {
      song.sourceSite = nextSourceSite;
      changed = true;
    }
    if (nextLicenseType && song.licenseType !== nextLicenseType) {
      song.licenseType = nextLicenseType;
      changed = true;
    }
    if (nextLicenseUrl && song.licenseUrl !== nextLicenseUrl) {
      song.licenseUrl = nextLicenseUrl;
      changed = true;
    }

    return changed ? song.trackSessionId : null;
  }

  return null;
}

export function markSessionTrackFromRequest({
  songKey,
  title,
  artist,
  trackSessionId = null,
} = {}) {
  const key = String(songKey || "").trim();
  if (!sessionKey || !key) return null;

  let target = null;
  const sessionId = String(trackSessionId || "").trim();
  if (sessionId) {
    target = sessionSongs.find((song) => song.trackSessionId === sessionId) ?? null;
  }

  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  const titleArtistKey =
    trackTitle && trackArtist ? `${trackTitle}|||${trackArtist}` : "";

  if (!target && titleArtistKey) {
    for (let i = sessionSongs.length - 1; i >= 0; i--) {
      const song = sessionSongs[i];
      if (song.title === trackTitle && song.artist === trackArtist) {
        target = song;
        break;
      }
    }
  }

  if (!target) {
    for (let i = sessionSongs.length - 1; i >= 0; i--) {
      const song = sessionSongs[i];
      const entryKey = `${song.title}|||${song.artist}`;
      if (entryKey === key || entryKey === titleArtistKey) {
        target = song;
        break;
      }
    }
  }

  if (!target || target.fromRequest) return target?.trackSessionId ?? null;

  target.fromRequest = true;
  target.requestSongKey = key;
  return target.trackSessionId;
}

export function getBroadcastSessionLogSnapshot() {
  return {
    sessionKey,
    songs: sessionSongs
      .filter((song) => !isContentPolicyMutedMetadata(song.title, song.artist))
      .map((song) => ({ ...song })),
  };
}
