import { isLocalOrPrivateIp } from "./network.js";

const IP_API_ENDPOINT = "http://ip-api.com/json";
const IP_API_FIELDS = "status,message,country,countryCode,regionName,city,zip,query";
const LOOKUP_TIMEOUT_MS = 4000;

export { isLocalOrPrivateIp };

/**
 * Resolve an IP address to a compact geolocation record using ip-api.com.
 * Returns null when the IP is private/local or the lookup fails.
 * @param {string} ip
 * @returns {Promise<{country: string|null, countryCode: string|null, regionName: string|null, city: string|null, zip: string|null, ip: string, lookedUpAt: string} | null>}
 */
export async function lookupIpGeolocation(ip) {
  const value = String(ip || "").trim();
  if (isLocalOrPrivateIp(value)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${IP_API_ENDPOINT}/${encodeURIComponent(value)}?fields=${IP_API_FIELDS}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.status !== "success") return null;
    return {
      ip: data.query || value,
      country: data.country || null,
      countryCode: data.countryCode || null,
      regionName: data.regionName || null,
      city: data.city || null,
      zip: data.zip || null,
      lookedUpAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
