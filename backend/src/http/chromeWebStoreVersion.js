const EXTENSION_ID =
  process.env.COLLABFM_CHROME_EXTENSION_ID || "nnalcbfijmoobcgejgnbmdimnekedpba";

export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/collabfm-broadcaster/${EXTENSION_ID}`;

const CACHE_MS = 60 * 60 * 1000;
const UPDATE_CHECK_URL = `https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=131.0&acceptformat=crx2,crx3&x=id%3D${EXTENSION_ID}%26installsource%3Dondemand%26uc`;

let cache = { version: null, fetchedAt: 0, error: null };

function parseVersionFromUpdateXml(xml) {
  const text = String(xml || "");
  const updateMatch = text.match(/<updatecheck\b[^>]*\bversion="([^"]+)"/i);
  if (updateMatch?.[1]) return updateMatch[1].trim();
  const looseMatch = text.match(/\bversion="(\d+\.\d+\.\d+)"/);
  return looseMatch?.[1]?.trim() || null;
}

/** Version published on the Chrome Web Store (Chrome update-check XML, cached 1h). */
export async function getChromeWebStoreVersion() {
  const now = Date.now();
  if (cache.fetchedAt && now - cache.fetchedAt < CACHE_MS) {
    return { version: cache.version, error: cache.error };
  }

  try {
    const res = await fetch(UPDATE_CHECK_URL, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "CollabFM/1.0" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const version = parseVersionFromUpdateXml(await res.text());
    cache = {
      version,
      fetchedAt: now,
      error: version ? null : "version_not_found",
    };
    return { version, error: cache.error };
  } catch (error) {
    cache = {
      version: null,
      fetchedAt: now,
      error: error?.message || String(error),
    };
    return { version: null, error: cache.error };
  }
}
