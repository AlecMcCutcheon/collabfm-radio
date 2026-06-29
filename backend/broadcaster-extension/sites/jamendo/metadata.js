// Jamendo — DOM metadata, track URL, and license enrichment via the public API.
(function () {
  const { hostMatchesSuffix } = window.__collabfmDomUtils || {};
  const { createDomObserver } = window.__collabfmDomObserver || {};

  /** Shared CollabFM Jamendo API client id — see ../../README.md#jamendo-api-client_id */
  const JAMENDO_CLIENT_ID = "342ccf12";

  let domObserverHandle = null;
  const resolveCache = new Map();
  let resolveGeneration = 0;
  let resolveAbort = null;

  function text(el) {
    return el?.textContent?.trim() || null;
  }

  function matches(host) {
    return hostMatchesSuffix
      ? hostMatchesSuffix(host, "jamendo.com")
      : host === "jamendo.com" || host.endsWith(".jamendo.com");
  }

  function extractTrackIdFromUrl(url) {
    if (!url) return null;
    const match = String(url).match(/track\/(\d+)/);
    return match ? match[1] : null;
  }

  function extractTrackIdFromImage(imgUrl) {
    if (!imgUrl) return null;
    const match = String(imgUrl).match(/trackid=(\d+)/i);
    return match ? match[1] : null;
  }

  function getJamendoPlayerSnapshot() {
    const mini = document.querySelector(".player-mini");
    const full = document.querySelector(".hero-plain");

    const title =
      text(mini?.querySelector(".js-player-name")) ||
      text(full?.querySelector(".primary span")) ||
      text(document.querySelector("h1.primary span"));

    const artist =
      text(mini?.querySelector(".js-player-artistId")) ||
      text(mini?.querySelector(".js-player-artist")) ||
      text(full?.querySelector("a.secondary span")) ||
      text(document.querySelector("a.secondary span"));

    const albumArt =
      mini?.querySelector("img.js-player-cover")?.src ||
      full?.querySelector(".hero-cover img")?.src ||
      document.querySelector('meta[property="og:image"]')?.content ||
      null;

    const pageUrl =
      full?.querySelector("a.secondary")?.href ||
      (location.pathname.includes("/track/") ? location.href : null);

    return { title, artist, albumArt, pageUrl };
  }

  function resolveTrackId(snapshot) {
    return (
      extractTrackIdFromUrl(location.href) ||
      extractTrackIdFromUrl(snapshot?.pageUrl) ||
      extractTrackIdFromImage(snapshot?.albumArt)
    );
  }

  function trackKey(title, artist) {
    return `${String(title || "").trim()}\0${String(artist || "").trim()}`;
  }

  function parseLicenseFromCcUrl(licenseUrl) {
    if (!licenseUrl) return null;

    let licenseType = null;
    const match = String(licenseUrl).match(/creativecommons\.org\/licenses\/([^/]+)\/([^/]+)/);
    if (match) {
      licenseType = `CC ${match[1].toUpperCase().replace(/-/g, " ")} ${match[2]}`;
    }

    return {
      licenseType: licenseType || "Creative Commons",
      licenseUrl: String(licenseUrl).trim(),
    };
  }

  async function fetchFromApi(trackId, signal) {
    const url =
      `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}` +
      `&id=${encodeURIComponent(trackId)}&format=json&include=musicinfo`;

    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const json = await res.json();
    const track = json?.results?.[0];
    if (!track) return null;

    const license = parseLicenseFromCcUrl(track.license_ccurl);

    return {
      title: track.name || null,
      artist: track.artist_name || null,
      albumArt: track.album_image || track.image || null,
      url: `https://www.jamendo.com/track/${trackId}/`,
      licenseType: license?.licenseType || null,
      licenseUrl: license?.licenseUrl || null,
    };
  }

  async function fetchFromTrackPage(trackId, signal) {
    const pageUrl = `https://www.jamendo.com/track/${trackId}/`;
    const res = await fetch(pageUrl, { credentials: "include", signal });
    if (!res.ok) return null;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const title = text(doc.querySelector("h1.primary span"));
    const artist = text(doc.querySelector("a.secondary span"));
    const albumArt = doc.querySelector('meta[property="og:image"]')?.content || null;
    const licenseUrl = doc.querySelector('a[rel="license"]')?.href || null;
    const license = parseLicenseFromCcUrl(licenseUrl);

    return {
      title,
      artist,
      albumArt,
      url: pageUrl,
      licenseType: license?.licenseType || null,
      licenseUrl: license?.licenseUrl || null,
    };
  }

  function getPlayerMetadata() {
    const snapshot = getJamendoPlayerSnapshot();
    if (!snapshot?.title || !snapshot?.artist) return null;

    const meta = {
      title: snapshot.title,
      artist: snapshot.artist,
    };
    if (snapshot.albumArt) meta.albumArt = snapshot.albumArt;
    return meta;
  }

  async function enrichMetadata(baseMeta) {
    if (!baseMeta?.title || !baseMeta?.artist) return baseMeta;

    const cacheKey = trackKey(baseMeta.title, baseMeta.artist);
    const cached = resolveCache.get(cacheKey);
    if (cached) {
      return { ...baseMeta, ...cached };
    }

    const generation = ++resolveGeneration;
    if (resolveAbort) {
      try {
        resolveAbort.abort();
      } catch {}
    }
    resolveAbort = new AbortController();
    const signal = resolveAbort.signal;

    try {
      const snapshot = getJamendoPlayerSnapshot();
      const trackId = resolveTrackId(snapshot);
      if (!trackId) return baseMeta;

      let enriched = await fetchFromApi(trackId, signal);
      if (generation !== resolveGeneration) return null;

      if (!enriched?.title) {
        enriched = await fetchFromTrackPage(trackId, signal);
        if (generation !== resolveGeneration) return null;
      }

      if (!enriched) return baseMeta;

      const merged = { ...baseMeta };
      if (enriched.title) merged.title = enriched.title;
      if (enriched.artist) merged.artist = enriched.artist;
      if (enriched.albumArt) merged.albumArt = enriched.albumArt;
      if (enriched.url) merged.url = enriched.url;
      if (enriched.licenseType) merged.licenseType = enriched.licenseType;
      if (enriched.licenseUrl) merged.licenseUrl = enriched.licenseUrl;

      resolveCache.set(cacheKey, {
        albumArt: merged.albumArt || null,
        url: merged.url || null,
        licenseType: merged.licenseType || null,
        licenseUrl: merged.licenseUrl || null,
      });

      return merged;
    } catch {
      if (generation !== resolveGeneration) return null;
      return baseMeta;
    }
  }

  function clearState() {
    resolveGeneration++;
    if (resolveAbort) {
      try {
        resolveAbort.abort();
      } catch {}
      resolveAbort = null;
    }
    resolveCache.clear();
    domObserverHandle?.stop();
    domObserverHandle = null;
  }

  function startDomObserver(onCheck) {
    if (!createDomObserver) return;
    domObserverHandle?.stop();
    domObserverHandle = createDomObserver(onCheck);
    domObserverHandle.start();
  }

  function stopDomObserver() {
    domObserverHandle?.stop();
    domObserverHandle = null;
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "jamendo",
    label: "Jamendo",
    matches,
    metadata: {
      getPlayerMetadata,
      enrichMetadata,
      startDomObserver,
      stopDomObserver,
      clearState,
    },
  });
})();
