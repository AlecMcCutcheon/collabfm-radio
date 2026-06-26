function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Default connection when no server is stored (production). */
export const DEFAULT_RADIO_HOST = "https://radio.app.ackvyn.org";

function hostnamesEquivalent(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (isLocalHost(a) && isLocalHost(b)) return true;
  return a.toLowerCase() === b.toLowerCase();
}

function effectivePort(url) {
  if (url.port) return url.port;
  if (url.protocol === "https:" || url.protocol === "wss:") return "443";
  if (url.protocol === "http:" || url.protocol === "ws:") return "80";
  return "";
}

function urlsMatchHostPort(a, b) {
  if (effectivePort(a) !== effectivePort(b)) return false;
  return hostnamesEquivalent(a.hostname, b.hostname);
}

export function isRadioConnectionTabUrl(tabUrl, connectionInput) {
  try {
    const tab = new URL(tabUrl);
    const { apiOrigin, webOrigin } = resolveRadioEndpoints(connectionInput);
    for (const origin of [apiOrigin, webOrigin]) {
      const blocked = new URL(origin);
      if (urlsMatchHostPort(tab, blocked)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeHostInput(input) {
  return String(input || "").trim().replace(/\/+$/, "");
}

export function normalizeApiOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `http://127.0.0.1:${url.port || "4002"}`;
    }
    return origin.replace(/\/+$/, "");
  } catch {
    return origin;
  }
}

export function resolveRadioEndpoints(input) {
  const raw = normalizeHostInput(input);
  if (!raw) {
    return resolveRadioEndpoints(DEFAULT_RADIO_HOST);
  }

  if (/^wss?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const hostname = url.hostname;
    const local = isLocalHost(hostname);
    const wsPath = url.pathname && url.pathname !== "/" ? url.pathname : "/relay";
    const wsUrl = `${url.protocol}//${url.host}${wsPath}`;
    const apiOrigin = local
      ? normalizeApiOrigin(`http://${hostname}:4002`)
      : url.protocol === "wss:"
        ? `https://${url.host}`
        : `http://${url.host}`;
    const webOrigin = local ? `http://${hostname}:5173` : apiOrigin;
    return { apiOrigin, webOrigin, wsUrl, hostKey: hostname };
  }

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const local = isLocalHost(url.hostname);
    const apiOrigin = normalizeApiOrigin(raw);
    const webOrigin = local ? `http://${url.hostname}:5173` : apiOrigin;
    return {
      apiOrigin,
      webOrigin,
      wsUrl: local ? `ws://${url.hostname}:4001/relay` : `wss://${url.host}/relay`,
      hostKey: url.hostname,
    };
  }

  const hostOnly = raw.split("/")[0];
  const hostname = hostOnly.split(":")[0];
  const local = isLocalHost(hostname);
  if (local) {
    if (hostOnly.includes(":4001")) {
      return {
        apiOrigin: normalizeApiOrigin(`http://${hostname}:4002`),
        webOrigin: `http://${hostname}:5173`,
        wsUrl: `ws://${hostOnly}/relay`,
        hostKey: hostname,
      };
    }
    if (hostOnly.includes(":4002")) {
      return {
        apiOrigin: normalizeApiOrigin(`http://${hostOnly}`),
        webOrigin: `http://${hostname}:5173`,
        wsUrl: `ws://${hostname}:4001/relay`,
        hostKey: hostname,
      };
    }
    if (hostOnly.includes(":5173")) {
      return {
        apiOrigin: normalizeApiOrigin(`http://${hostname}:4002`),
        webOrigin: `http://${hostOnly}`,
        wsUrl: `ws://${hostname}:4001/relay`,
        hostKey: hostname,
      };
    }
    return {
      apiOrigin: normalizeApiOrigin(`http://${hostname}:4002`),
      webOrigin: `http://${hostname}:5173`,
      wsUrl: `ws://${hostname}:4001/relay`,
      hostKey: hostname,
    };
  }

  return {
    apiOrigin: `https://${hostOnly}`,
    webOrigin: `https://${hostOnly}`,
    wsUrl: `wss://${hostOnly}/relay`,
    hostKey: hostname,
  };
}

export function isSameRadioHost(a, b) {
  const left = resolveRadioEndpoints(a);
  const right = resolveRadioEndpoints(b);
  return normalizeApiOrigin(left.apiOrigin) === normalizeApiOrigin(right.apiOrigin);
}
