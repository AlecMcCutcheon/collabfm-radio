function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function isPrivateLanHost(hostname: string): boolean {
  if (isLocalHost(hostname)) return true;
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** WebSocket relay URL for the current radio site (matches extension radio-config behavior). */
export function resolveRelayWsUrl(): string {
  const { protocol, hostname, host } = window.location;
  const local = isLocalHost(hostname);
  const lan = isPrivateLanHost(hostname);

  if (local || lan || protocol === "http:") {
    return `ws://${hostname}:4001/relay`;
  }
  if (protocol === "https:") {
    return `wss://${host}/relay`;
  }
  return `ws://${hostname}:4001/relay`;
}

export function encodeBroadcastNameParam(label: string): string {
  return btoa(encodeURIComponent(label.trim().slice(0, 64)));
}
