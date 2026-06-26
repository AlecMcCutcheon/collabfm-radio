const buckets = new Map();

/**
 * Simple in-memory sliding-window rate limiter.
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 */
export function consumeRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const windowStart = now - windowMs;
  let hits = buckets.get(key);
  if (!hits) {
    hits = [];
    buckets.set(key, hits);
  }
  while (hits.length && hits[0] < windowStart) hits.shift();
  if (hits.length >= max) {
    return { allowed: false, retryAfterMs: Math.max(0, hits[0] + windowMs - now) };
  }
  hits.push(now);
  return { allowed: true };
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
