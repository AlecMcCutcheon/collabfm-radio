function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** WebSocket relay URL for the current radio site (matches extension radio-config behavior). */
export function resolveRelayWsUrl(): string {
  const { protocol, hostname, host } = window.location;
  const local = isLocalHost(hostname);

  if (local) {
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
