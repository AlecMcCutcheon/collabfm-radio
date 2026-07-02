import path from "path";

function ipv4ToInt(ip) {
  const parts = String(ip).split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  if ((n & 0xff000000) === 0x0a000000) return true;
  if ((n & 0xfff00000) === 0xac100000) return true;
  if ((n & 0xffff0000) === 0xc0a80000) return true;
  if ((n & 0xff000000) === 0x7f000000) return true;
  return false;
}

/** True for loopback and RFC1918 IPv4; ::1 for IPv6. */
export function isPrivateNetworkRemote(remote) {
  return isLocalOrPrivateIp(remote);
}

/** True when an IP is loopback, link-local, RFC1918, or otherwise not publicly routable. */
export function isLocalOrPrivateIp(ip) {
  const value = String(ip || "").trim();
  if (!value || value === "unknown") return true;
  if (value.toLowerCase() === "localhost") return true;

  let addr = value;
  if (addr.startsWith("::ffff:")) addr = addr.slice(7);

  if (addr === "::1" || addr === "0:0:0:0:0:0:0:1") return true;

  if (!addr.includes(":")) {
    if (addr.startsWith("169.254.")) return true;
    return isPrivateIpv4(addr);
  }

  const lower = addr.toLowerCase();
  const first = lower.split(":")[0] || "";
  if (/^fe[89ab][0-9a-f]{0,2}$/i.test(first)) return true;
  if (/^f[cd][0-9a-f]{0,2}$/i.test(first)) return true;
  return false;
}

/** Resolve a URL path segment under root; returns null if traversal escapes root. */
export function safeResolveUnderRoot(rootDir, urlPath) {
  const raw = String(urlPath || "").split("?")[0].split("#")[0];
  const stripped = raw.replace(/^\/+/, "");
  if (!stripped || stripped.includes("\0")) return null;
  const normalized = path.normalize(stripped);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
