function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Private LAN / docker host IPs — direct HTTP on :4002, relay WS on :4001 (no reverse proxy). */
function isPrivateLanHost(hostname) {
  if (!hostname || isLocalHost(hostname)) return true;
  const parts = String(hostname).split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Default connection when no server is stored — empty; user must set Radio host in the extension. */
export const DEFAULT_RADIO_HOST = "";

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

/** Split-port docker/LAN: HTTP API on webPort, browser relay WS on wsPort. */
function directCollabfmEndpoints(hostname, { apiPort = "4002", webPort = "5173" } = {}) {
  const apiOrigin = normalizeApiOrigin(`http://${hostname}:${apiPort}`);
  const useDevWeb = isLocalHost(hostname);
  return {
    apiOrigin,
    webOrigin: useDevWeb ? `http://${hostname}:${webPort}` : apiOrigin,
    wsUrl: `ws://${hostname}:4001/relay`,
    hostKey: hostname,
  };
}


export function resolveRadioEndpoints(input) {
  const raw = normalizeHostInput(input);
  if (!raw) {
    if (DEFAULT_RADIO_HOST) {
      return resolveRadioEndpoints(DEFAULT_RADIO_HOST);
    }
    return { apiOrigin: "", webOrigin: "", wsUrl: "", hostKey: "" };
  }

  if (/^wss?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const hostname = url.hostname;
    const local = isLocalHost(hostname);
    const lan = isPrivateLanHost(hostname);
    const wsPath = url.pathname && url.pathname !== "/" ? url.pathname : "/relay";
    const wsUrl = `${url.protocol}//${url.host}${wsPath}`;
    if (local || lan || url.port === "4001") {
      return directCollabfmEndpoints(hostname);
    }
    const apiOrigin =
      url.protocol === "wss:"
        ? normalizeApiOrigin(`https://${url.host}`)
        : normalizeApiOrigin(`http://${url.host}`);
    const webOrigin = local ? `http://${hostname}:5173` : apiOrigin;
    return { apiOrigin, webOrigin, wsUrl, hostKey: hostname };
  }

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const hostname = url.hostname;
    const local = isLocalHost(hostname);
    const apiOrigin = normalizeApiOrigin(raw);
    if (local || isPrivateLanHost(hostname) || url.port === "4002" || url.protocol === "http:") {
      return {
        ...directCollabfmEndpoints(hostname, {
          apiPort: url.port || "4002",
        }),
        apiOrigin,
        webOrigin: local ? `http://${hostname}:5173` : apiOrigin,
      };
    }
    return {
      apiOrigin,
      webOrigin: apiOrigin,
      wsUrl: `wss://${url.host}/relay`,
      hostKey: hostname,
    };
  }

  const hostOnly = raw.split("/")[0];
  const hostname = hostOnly.split(":")[0];
  const port = hostOnly.includes(":") ? hostOnly.split(":")[1] : "";
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
      return directCollabfmEndpoints(hostname, { apiPort: "4002" });
    }
    if (hostOnly.includes(":5173")) {
      return {
        apiOrigin: normalizeApiOrigin(`http://${hostname}:4002`),
        webOrigin: `http://${hostOnly}`,
        wsUrl: `ws://${hostname}:4001/relay`,
        hostKey: hostname,
      };
    }
    return directCollabfmEndpoints(hostname);
  }

  if (isPrivateLanHost(hostname) || port === "4002" || port === "4001") {
    const apiPort = port === "4001" ? "4002" : port || "4002";
    return directCollabfmEndpoints(hostname, { apiPort });
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
