// Free Music Archive metadata + license resolver for CollabFM content script.
(function () {
  const FMA_FETCH_HEADERS = { "User-Agent": "CollabFM-FMA-Metadata" };

  function safeJson(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function text(el) {
    return el?.textContent?.trim() || null;
  }

  function normalizeUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      u.pathname = u.pathname.replace(/\/+/g, "/");
      return u.toString();
    } catch {
      return null;
    }
  }

  function abs(url) {
    if (!url) return null;
    try {
      return new URL(url, location.href).toString();
    } catch {
      return null;
    }
  }

  function isFmaSite() {
    try {
      const host = window.location.hostname.replace(/^www\./, "");
      return host === "freemusicarchive.org" || host.endsWith(".freemusicarchive.org");
    } catch {
      return false;
    }
  }

  function getFmaPlayer() {
    const player = document.querySelector(".c-player");
    if (!player) return null;

    const title = text(player.querySelector(".c-song__title"));
    const artist = text(player.querySelector(".c-song__artist"));
    if (!title || !artist) return null;

    return { title, artist };
  }

  function getFmaDatasetMatch(player) {
    const items = [...document.querySelectorAll("[data-track-info]")];
    const parsed = items.map((el) => safeJson(el.dataset.trackInfo)).filter(Boolean);

    return parsed.find(
      (d) => d.title?.trim() === player.title && d.artistName?.trim() === player.artist,
    );
  }

  function buildFmaCandidates(info) {
    const urls = new Set();

    if (info?.url) urls.add(info.url);

    if (info?.playbackUrl) {
      urls.add(info.playbackUrl.replace("/track/", "/music/"));
    }

    if (info?.artistUrl && info?.handle) {
      const base = info.artistUrl.replace(/\/$/, "");
      urls.add(`${base}/${info.handle}/`);
      urls.add(`${base}/single/${info.handle}/`);
    }

    return [...urls].map(normalizeUrl).filter(Boolean);
  }

  async function validateFmaUrl(urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: "include", headers: FMA_FETCH_HEADERS });
        if (!res.ok) continue;

        const html = await res.text();
        if (html.includes("data-track-info")) {
          return url;
        }
      } catch {}
    }
    return null;
  }

  function extractFmaCover(doc, info) {
    const og = doc.querySelector('meta[property="og:image"]')?.content;
    if (og) return abs(og);

    const img1 = doc.querySelector(".w-full.h-80 img")?.src;
    if (img1) return abs(img1);

    const datasetImg = doc.querySelector("[data-track-info]")?.dataset?.trackInfo;
    const parsed = safeJson(datasetImg);

    if (parsed?.albumImage || parsed?.image) {
      return abs(parsed.albumImage || parsed.image);
    }

    const img2 = doc.querySelector('img[src*="track_image"]')?.src;
    if (img2) return abs(img2);

    const img3 = doc.querySelector('img[src*="album_image"]')?.src;
    if (img3) return abs(img3);

    return null;
  }

  function extractFmaLicense(doc) {
    const el = doc.querySelector('a[rel="license"]');
    if (!el) return null;

    const url = el.href || null;
    let type = el.textContent?.trim();

    if (!type && url) {
      const m = url.match(/creativecommons\.org\/licenses\/([^/]+)\/([^/]+)/);
      if (m) {
        type = `CC ${m[1].toUpperCase()} ${m[2]}`;
      }
    }

    if (!url && !type) return null;

    return {
      licenseType: type || "Creative Commons",
      licenseUrl: url,
    };
  }

  async function extractFmaPage(url) {
    const res = await fetch(url, { credentials: "include", headers: FMA_FETCH_HEADERS });
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");

    const el = doc.querySelector("[data-track-info]");
    if (!el) return null;

    const info = safeJson(el.dataset.trackInfo);
    if (!info) return null;

    const license = extractFmaLicense(doc);
    const cover = extractFmaCover(doc, info);

    const result = {
      title: info.title,
      artist: info.artistName,
      albumArt: cover || null,
      url,
    };

    if (license?.licenseType) result.licenseType = license.licenseType;
    if (license?.licenseUrl) result.licenseUrl = license.licenseUrl;

    return result;
  }

  const fmaResolveCache = new Map();
  let fmaResolveGeneration = 0;
  let fmaResolveAbort = null;

  function fmaTrackKey(title, artist) {
    return `${String(title || "").trim()}\0${String(artist || "").trim()}`;
  }

  function getFmaPlayerMetadata() {
    const player = getFmaPlayer();
    if (!player) return null;
    return { title: player.title, artist: player.artist };
  }

  async function resolveFmaMetadata(baseMeta, signal) {
    if (!baseMeta?.title || !baseMeta?.artist) return baseMeta;

    const cacheKey = fmaTrackKey(baseMeta.title, baseMeta.artist);
    const cached = fmaResolveCache.get(cacheKey);
    if (cached) {
      return { ...baseMeta, ...cached };
    }

    const player = { title: baseMeta.title, artist: baseMeta.artist };
    const dataset = getFmaDatasetMatch(player);
    if (!dataset) return baseMeta;

    const candidates = buildFmaCandidates(dataset);
    const validUrl = await validateFmaUrl(candidates);
    if (!validUrl) return baseMeta;

    if (signal?.aborted) return baseMeta;

    const extracted = await extractFmaPage(validUrl);
    if (!extracted) return baseMeta;

    const enriched = { ...baseMeta };
    if (extracted.albumArt) enriched.albumArt = extracted.albumArt;
    if (extracted.url) enriched.url = extracted.url;
    if (extracted.licenseType) enriched.licenseType = extracted.licenseType;
    if (extracted.licenseUrl) enriched.licenseUrl = extracted.licenseUrl;

    fmaResolveCache.set(cacheKey, {
      albumArt: enriched.albumArt || null,
      url: enriched.url,
      licenseType: enriched.licenseType,
      licenseUrl: enriched.licenseUrl,
    });

    return enriched;
  }

  async function resolveFmaMetadataTracked(baseMeta) {
    const generation = ++fmaResolveGeneration;
    if (fmaResolveAbort) {
      try {
        fmaResolveAbort.abort();
      } catch {}
    }
    fmaResolveAbort = new AbortController();
    const signal = fmaResolveAbort.signal;

    try {
      const result = await resolveFmaMetadata(baseMeta, signal);
      if (generation !== fmaResolveGeneration) return null;
      return result;
    } catch {
      if (generation !== fmaResolveGeneration) return null;
      return baseMeta;
    }
  }

  function clearFmaResolveState() {
    fmaResolveGeneration++;
    if (fmaResolveAbort) {
      try {
        fmaResolveAbort.abort();
      } catch {}
      fmaResolveAbort = null;
    }
    fmaResolveCache.clear();
  }

  window.__collabfmFma = {
    isFmaSite,
    getFmaPlayerMetadata,
    resolveFmaMetadataTracked,
    clearFmaResolveState,
  };
})();
