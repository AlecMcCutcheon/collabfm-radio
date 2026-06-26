import { validateShareToken } from "../db/shareLinks.js";
import { getGiphyApiKey } from "../settings/integrations.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function mapGiphyResults(data) {
  const items = data?.data ?? [];
  return items.map((gif) => ({
    id: gif.id,
    title: gif.title || "",
    url: gif.images?.fixed_height?.url || gif.images?.downsized_medium?.url || "",
    previewUrl: gif.images?.fixed_height_small?.url || gif.images?.preview_gif?.url || "",
    width: Number(gif.images?.fixed_height?.width) || null,
    height: Number(gif.images?.fixed_height?.height) || null,
  })).filter((g) => g.url);
}

async function giphyFetch(path, apiKey) {
  const res = await fetch(`https://api.giphy.com/v1/gifs/${path}&api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Giphy HTTP ${res.status}`);
  }
  return res.json();
}

function canUseGiphy(req, getAppSession, shareToken) {
  if (getAppSession(req)) return true;
  if (!shareToken) return false;
  const link = validateShareToken(String(shareToken));
  return !!link && link.link_kind === "ui";
}

export async function handleGiphyRoutes(req, res, pathname, method, getAppSession, configFile = {}) {
  if (!pathname.startsWith("/api/giphy")) return false;

  const apiKey = getGiphyApiKey(configFile);
  if (!apiKey) {
    json(res, 503, { error: "Giphy API key not configured" });
    return true;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const shareToken = url.searchParams.get("shareToken");

  if (!canUseGiphy(req, getAppSession, shareToken)) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }

  const rlKey = shareToken
    ? `giphy:guest:${shareToken}`
    : `giphy:user:${getAppSession(req)?.user?.id || clientIp(req)}`;
  const rl = consumeRateLimit(rlKey, { windowMs: 60 * 1000, max: 30 });
  if (!rl.allowed) {
    json(res, 429, { error: "Rate limited", retryAfterMs: rl.retryAfterMs });
    return true;
  }

  if (method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return true;
  }

  try {
    if (pathname === "/api/giphy/trending") {
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") || 20)));
      const data = await giphyFetch(`trending?offset=${offset}&limit=${limit}&rating=pg-13`, apiKey);
      json(res, 200, { results: mapGiphyResults(data), pagination: data.pagination ?? null });
      return true;
    }

    if (pathname === "/api/giphy/search") {
      const q = String(url.searchParams.get("q") || "").trim();
      if (!q) {
        json(res, 400, { error: "Missing q parameter" });
        return true;
      }
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") || 20)));
      const data = await giphyFetch(
        `search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}&rating=pg-13&lang=en`,
        apiKey,
      );
      json(res, 200, { results: mapGiphyResults(data), pagination: data.pagination ?? null });
      return true;
    }

    json(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    json(res, 502, { error: "Giphy request failed", message: err.message });
    return true;
  }
}
