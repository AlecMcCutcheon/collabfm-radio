import { hasSessionOrShareToken } from "../security/access.js";
import { getAppSession } from "../auth/routes.js";
import { isPrivateNetworkRemote } from "../security/network.js";

const PALETTE = [
  "hsl(221, 83%, 53%)",
  "hsl(259, 94%, 61%)",
  "hsl(280, 83%, 60%)",
  "hsl(199, 89%, 48%)",
  "hsl(173, 80%, 40%)",
  "hsl(14, 90%, 57%)",
  "hsl(340, 82%, 52%)",
  "hsl(168, 76%, 42%)",
];

const CANVAS_SIZE = 300;

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function chromaticLayer(svg, offset, angle) {
  const cos = Math.cos(angle) * offset;
  const sin = Math.sin(angle) * offset;
  const cos2 = Math.cos(angle + Math.PI / 3) * offset * 0.5;
  const sin2 = Math.sin(angle + Math.PI / 3) * offset * 0.5;
  const cos3 = Math.cos(angle + (2 * Math.PI) / 3) * offset;
  const sin3 = Math.sin(angle + (2 * Math.PI) / 3) * offset;
  return `
    <g style="mix-blend-mode: screen">
      <g transform="translate(${cos}, ${sin})" opacity="0.3" filter="url(#redShift)">${svg}</g>
      <g transform="translate(${cos2}, ${sin2})" opacity="0.5">${svg}</g>
      <g transform="translate(${cos3}, ${sin3})" opacity="0.3" filter="url(#blueShift)">${svg}</g>
    </g>`;
}

function buildShapeLayers(rand, colorIndexA, colorIndexB) {
  const half = CANVAS_SIZE / 2;
  const layers = [];

  for (let i = 0; i < 3; i += 1) {
    const x = Math.floor(rand() * half);
    const y = Math.floor(rand() * half);
    const r = Math.floor(20 + rand() * 60);
    const color = PALETTE[(colorIndexA + Math.floor(rand() * PALETTE.length)) % PALETTE.length];
    const opacity = (0.2 + rand() * 0.3).toFixed(2);
    layers.push(chromaticLayer(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}" />`, rand() * 2, rand() * Math.PI * 2));
  }

  for (let i = 0; i < 3; i += 1) {
    const w = Math.floor(32 + rand() * 72);
    const h = Math.floor(24 + rand() * 54);
    const x = Math.floor(rand() * Math.max(1, half - w));
    const y = Math.floor(rand() * Math.max(1, half - h));
    const rot = Math.floor(rand() * 360);
    const color = PALETTE[(colorIndexB + Math.floor(rand() * PALETTE.length)) % PALETTE.length];
    const opacity = (0.14 + rand() * 0.14).toFixed(2);
    const rect = `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${color}" opacity="${opacity}" /></g>`;
    layers.push(chromaticLayer(rect, rand() * 2, rand() * Math.PI * 2));
  }

  for (let i = 0; i < 3; i += 1) {
    const points = [
      `${Math.floor(rand() * half)},${Math.floor(rand() * half)}`,
      `${Math.floor(rand() * half)},${Math.floor(rand() * half)}`,
      `${Math.floor(rand() * half)},${Math.floor(rand() * half)}`,
    ].join(" ");
    const color = PALETTE[(colorIndexA + colorIndexB + i) % PALETTE.length];
    layers.push(chromaticLayer(`<polygon points="${points}" fill="${color}" opacity="0.18" />`, rand() * 1.8, rand() * Math.PI * 2));
  }

  return layers.join("\n");
}

function mirrorLayers(grouped) {
  const mirrors = [];
  for (let i = 0; i < 4; i += 1) {
    const deg = i * 90;
    mirrors.push(
      `<g transform="translate(${CANVAS_SIZE / 2},${CANVAS_SIZE / 2}) rotate(${deg}) translate(${-CANVAS_SIZE / 2},${-CANVAS_SIZE / 2})">${grouped}</g>`,
    );
  }
  return mirrors.join("");
}

function stripeOverlay() {
  const stripes = [];
  for (let i = 0; i < 12; i += 1) {
    const y = Math.floor((i / 12) * CANVAS_SIZE);
    stripes.push(`<rect x="0" y="${y}" width="${CANVAS_SIZE}" height="${Math.ceil(CANVAS_SIZE / 12)}" fill="white" opacity="${i % 2 === 0 ? "0.08" : "0.05"}" />`);
  }
  return stripes.join("\n");
}

export function proceduralTrackArtSvg(title, artist, displaySize = CANVAS_SIZE) {
  const safeTitle = String(title || "Unknown Track").trim() || "Unknown Track";
  const safeArtist = String(artist || "Unknown Artist").trim() || "Unknown Artist";
  const seed = hashString(`${safeTitle}|${safeArtist}`);
  const rand = seededRandom(seed);
  const colorIndexA = Math.floor(rand() * PALETTE.length);
  const colorIndexB = (colorIndexA + 2 + Math.floor(rand() * (PALETTE.length - 1))) % PALETTE.length;
  const colorA = PALETTE[colorIndexA];
  const colorB = PALETTE[colorIndexB];
  const layers = buildShapeLayers(rand, colorIndexA, colorIndexB);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displaySize}" height="${displaySize}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
  <defs>
    <linearGradient id="grad-${seed}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
    <filter id="blurSoft"><feGaussianBlur stdDeviation="6" /></filter>
    <filter id="redShift"><feColorMatrix type="matrix" values="1.5 0 0 0 0 0 0.4 0 0 0 0 0 0.4 0 0 0 0 0 1 0"/></filter>
    <filter id="blueShift"><feColorMatrix type="matrix" values="0.4 0 0 0 0 0 0.4 0 0 0 0 0 1.5 0 0 0 0 0 1 0"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="hsl(222, 47%, 11%)" />
  <rect width="100%" height="100%" fill="url(#grad-${seed})" opacity="0.58" />
  <g filter="url(#blurSoft)">${mirrorLayers(layers)}</g>
  <g opacity="0.35">${stripeOverlay()}</g>
</svg>`;
}

/** Public path (not under /api) so reverse proxies can serve Discord without session auth. */
export const PUBLIC_PROCEDURAL_ART_PATH = "/art/track";

export function isProceduralTrackArtPath(pathname) {
  const path = String(pathname || "");
  return path === PUBLIC_PROCEDURAL_ART_PATH || path === "/api/art/track";
}

export function proceduralTrackArtPath(title, artist, size = CANVAS_SIZE) {
  const params = new URLSearchParams({
    title: String(title || "Unknown Track"),
    artist: String(artist || "Unknown Artist"),
    size: String(size),
  });
  return `${PUBLIC_PROCEDURAL_ART_PATH}?${params.toString()}`;
}

export function handleProceduralTrackArtRoute(req, res, pathname, getSession = getAppSession) {
  const method = String(req.method || "GET").toUpperCase();
  if (!isProceduralTrackArtPath(pathname) || (method !== "GET" && method !== "HEAD")) {
    return false;
  }

  const remote = req.socket?.remoteAddress || "";
  if (!hasSessionOrShareToken(req, getSession) && !isPrivateNetworkRemote(remote)) {
    res.writeHead(401, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Authentication required");
    return true;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const title = url.searchParams.get("title") || "Unknown Track";
  const artist = url.searchParams.get("artist") || "Unknown Artist";
  const size = Math.max(64, Math.min(1024, Number.parseInt(url.searchParams.get("size") || "300", 10) || 300));
  const svg = proceduralTrackArtSvg(title, artist, size);
  const body = Buffer.from(svg, "utf8");

  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400, immutable",
    "Content-Length": String(body.length),
  });
  if (method === "HEAD") {
    res.end();
  } else {
    res.end(body);
  }
  return true;
}
