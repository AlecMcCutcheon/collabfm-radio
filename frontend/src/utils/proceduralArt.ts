import { guestCoverIconOverlaySvg } from "./guestCoverIcons";

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
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function chromaticLayer(svg: string, offset: number, angle: number): string {
  const cos = Math.cos(angle) * offset;
  const sin = Math.sin(angle) * offset;
  const cos2 = Math.cos(angle + Math.PI / 3) * offset * 0.5;
  const sin2 = Math.sin(angle + Math.PI / 3) * offset * 0.5;
  const cos3 = Math.cos(angle + (2 * Math.PI) / 3) * offset;
  const sin3 = Math.sin(angle + (2 * Math.PI) / 3) * offset;
  return `
    <g style="mix-blend-mode: screen">
      <g transform="translate(${cos}, ${sin})" opacity="0.3" style="filter: url(#redShift)">${svg}</g>
      <g transform="translate(${cos2}, ${sin2})" opacity="0.5">${svg}</g>
      <g transform="translate(${cos3}, ${sin3})" opacity="0.3" style="filter: url(#blueShift)">${svg}</g>
    </g>`;
}

interface ShapeLayers {
  circles: string[];
  rings: string[];
  rects: string[];
  triangles: string[];
  centerAccents: string[];
  focalAccents?: string[];
}

function buildShapeLayers(rand: () => number, colorIndexA: number, colorIndexB: number): ShapeLayers {
  const half = Math.floor(CANVAS_SIZE / 2);
  const circles: string[] = [];
  const circleCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < circleCount; i++) {
    const x = Math.floor(rand() * half);
    const y = Math.floor(rand() * half);
    const r = Math.floor((20 + rand() * 50) * (0.9 + rand() * 0.2));
    const color = PALETTE[(colorIndexA + Math.floor(rand() * PALETTE.length)) % PALETTE.length];
    const opacity = 0.22 + rand() * 0.26;
    const offset = rand() * 1.5;
    const angle = rand() * Math.PI * 2;
    const circle = `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity.toFixed(2)}" />`;
    circles.push(chromaticLayer(circle, offset, angle));
  }

  const rings: string[] = [];
  const ringCount = 1 + Math.floor(rand() * 1);
  for (let i = 0; i < ringCount; i++) {
    const x = Math.floor(rand() * half);
    const y = Math.floor(rand() * half);
    const r = Math.floor(30 + rand() * 60);
    const color = PALETTE[(colorIndexB + Math.floor(rand() * PALETTE.length)) % PALETTE.length];
    const opacity = 0.22 + rand() * 0.14;
    const strokeWidth = 2 + Math.floor(rand() * 2);
    const offset = rand() * 1.2;
    const angle = rand() * Math.PI * 2;
    const ring = `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-opacity="${opacity.toFixed(2)}" stroke-width="${strokeWidth}" />`;
    rings.push(chromaticLayer(ring, offset, angle));
  }

  const rects: string[] = [];
  const rectCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < rectCount; i++) {
    const w = Math.floor(30 + rand() * 60);
    const h = Math.floor(20 + rand() * 40);
    const x = Math.floor(rand() * Math.max(1, half - w));
    const y = Math.floor(rand() * Math.max(1, half - h));
    const rx = 8 + Math.floor(rand() * 16);
    const rotation = Math.floor(rand() * 360);
    const color = PALETTE[(colorIndexA + Math.floor(rand() * PALETTE.length) * 2) % PALETTE.length];
    const opacity = 0.16 + rand() * 0.1;
    const offset = rand() * 2;
    const angle = rand() * Math.PI * 2;
    const rect = `<g transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${color}" opacity="${opacity.toFixed(2)}" /></g>`;
    rects.push(chromaticLayer(rect, offset, angle));
  }

  const triangles: string[] = [];
  const triCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < triCount; i++) {
    const x1 = Math.floor(rand() * half);
    const y1 = Math.floor(rand() * half);
    const x2 = Math.floor(rand() * half);
    const y2 = Math.floor(rand() * half);
    const x3 = Math.floor(rand() * half);
    const y3 = Math.floor(rand() * half);
    const color = PALETTE[(colorIndexB + Math.floor(rand() * PALETTE.length) * 3) % PALETTE.length];
    const opacity = 0.16 + rand() * 0.08;
    const offset = rand() * 1.8;
    const angle = rand() * Math.PI * 2;
    const tri = `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="${color}" opacity="${opacity.toFixed(2)}" />`;
    triangles.push(chromaticLayer(tri, offset, angle));
  }

  const centerAccents: string[] = [];
  const centerCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < centerCount; i++) {
    const cx = half * 0.5 + (rand() - 0.5) * half * 0.5;
    const cy = half * 0.5 + (rand() - 0.5) * half * 0.5;
    const color = PALETTE[(colorIndexB + Math.floor(rand() * PALETTE.length) + 2) % PALETTE.length];
    const opacity = 0.2 + rand() * 0.18;
    const offset = rand() * 1;
    const angle = rand() * Math.PI * 2;
    if (Math.floor(rand() * 2) === 0) {
      const r = 12 + rand() * 20;
      centerAccents.push(chromaticLayer(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity.toFixed(2)}" />`, offset, angle));
    } else {
      const w = 15 + rand() * 25;
      const h = 15 + rand() * 25;
      const x = cx - w / 2;
      const y = cy - h / 2;
      const rx = 4 + Math.floor(rand() * 8);
      const rot = Math.floor(rand() * 360);
      centerAccents.push(
        chromaticLayer(
          `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}" opacity="${opacity.toFixed(2)}" /></g>`,
          offset,
          angle,
        ),
      );
    }
  }

  const focalAccents: string[] = [];
  const focalCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < focalCount; i++) {
    const cx = half + (rand() - 0.5) * 30;
    const cy = half + (rand() - 0.5) * 30;
    const color = PALETTE[(colorIndexA + Math.floor(rand() * PALETTE.length) + 1) % PALETTE.length];
    const opacity = 0.25 + rand() * 0.2;
    const offset = rand() * 1.2;
    const angle = rand() * Math.PI * 2;
    if (Math.floor(rand() * 2) === 0) {
      const r = 15 + rand() * 25;
      focalAccents.push(chromaticLayer(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity.toFixed(2)}" />`, offset, angle));
    } else {
      const w = 20 + rand() * 30;
      const h = 20 + rand() * 30;
      const x = cx - w / 2;
      const y = cy - h / 2;
      const rx = 5 + Math.floor(rand() * 10);
      const rot = Math.floor(rand() * 360);
      focalAccents.push(
        chromaticLayer(
          `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}" opacity="${opacity.toFixed(2)}" /></g>`,
          offset,
          angle,
        ),
      );
    }
  }

  return { circles, rings, rects, triangles, centerAccents, focalAccents };
}

function mirrorLayers(layers: ShapeLayers, includeFocal = true): string {
  const grouped = [
    `<g filter="url(#blurSoft)">${layers.circles.join("\n")}</g>`,
    `<g>${layers.rings.join("\n")}</g>`,
    `<g filter="url(#blurMid)">${layers.rects.join("\n")}</g>`,
    `<g>${layers.triangles.join("\n")}</g>`,
    `<g filter="url(#blurSoft)">${layers.centerAccents.join("\n")}</g>`,
    ...(includeFocal && layers.focalAccents
      ? [`<g filter="url(#blurSoft)">${layers.focalAccents.join("\n")}</g>`]
      : []),
  ].join("");

  const mirrors: string[] = [];
  for (let i = 0; i < 4; i++) {
    const deg = i * 90;
    mirrors.push(
      `<g transform="translate(${CANVAS_SIZE / 2},${CANVAS_SIZE / 2}) rotate(${deg}) translate(${-CANVAS_SIZE / 2},${-CANVAS_SIZE / 2})">${grouped}</g>`,
    );
  }
  return mirrors.join("");
}

function stripeOverlay(): string {
  const stripes: string[] = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const y = Math.floor((i / count) * CANVAS_SIZE);
    const opacity = 0.06 + (i % 2 === 0 ? 0.02 : 0);
    stripes.push(
      `<rect x="0" y="${y}" width="${CANVAS_SIZE}" height="${Math.ceil(CANVAS_SIZE / count)}" fill="white" opacity="${opacity.toFixed(2)}" />`,
    );
  }
  return stripes.join("\n");
}

function svgFilters(gradientId: string, colorA: string, colorB: string): string {
  return `
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
    <filter id="blurSoft"><feGaussianBlur stdDeviation="6" /></filter>
    <filter id="blurMid"><feGaussianBlur stdDeviation="8" /></filter>
    <filter id="redShift">
      <feColorMatrix type="matrix" values="1.5 0 0 0 0
                                            0 0.4 0 0 0
                                            0 0 0.4 0 0
                                            0 0 0 1 0"/>
    </filter>
    <filter id="blueShift">
      <feColorMatrix type="matrix" values="0.4 0 0 0 0
                                            0 0.4 0 0 0
                                            0 0 1.5 0 0
                                            0 0 0 1 0"/>
    </filter>
  </defs>`;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Album/song placeholder art — seeded from title + artist. */
export function proceduralAlbumArt(title: string, artist: string, displaySize = CANVAS_SIZE): string {
  const seed = hashString(`${title}|${artist}`);
  const rand = seededRandom(seed);
  const colorIndexA = Math.floor(rand() * PALETTE.length);
  const colorIndexB = (colorIndexA + 2 + Math.floor(rand() * (PALETTE.length - 1))) % PALETTE.length;
  const colorA = PALETTE[colorIndexA];
  const colorB = PALETTE[colorIndexB];
  const bg = "hsl(222, 47%, 11%)";
  const layers = buildShapeLayers(rand, colorIndexA, colorIndexB);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displaySize}" height="${displaySize}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
  ${svgFilters(`grad-${seed}`, colorA, colorB)}
  <rect width="100%" height="100%" fill="${bg}" />
  <rect width="100%" height="100%" fill="url(#grad-${seed})" opacity="0.55" />
  ${mirrorLayers(layers, true)}
  <g opacity="0.35">${stripeOverlay()}</g>
</svg>`;

  return toDataUrl(svg);
}

/** Avatar placeholder art — seeded from a single string (display name / user id). */
export function proceduralAvatarArt(
  seedInput: string,
  displaySize = 128,
  coverIconId = 0,
): string {
  const seed = hashString(seedInput);
  const rand = seededRandom(seed);
  const colorIndexA = Math.floor(rand() * PALETTE.length);
  const colorIndexB = (colorIndexA + 2 + Math.floor(rand() * (PALETTE.length - 1))) % PALETTE.length;
  const colorA = PALETTE[colorIndexA];
  const colorB = PALETTE[colorIndexB];
  const bg = "hsl(222, 47%, 11%)";
  const half = Math.floor(CANVAS_SIZE / 2);
  const layers = buildShapeLayers(rand, colorIndexA, colorIndexB);

  const avatarCenter: string[] = [];
  const centerCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < centerCount; i++) {
    const color = PALETTE[(colorIndexA + Math.floor(rand() * PALETTE.length)) % PALETTE.length];
    const opacity = 0.28 + rand() * 0.12;
    const offset = rand() * 0.8;
    const angle = rand() * Math.PI * 2;
    if (Math.floor(rand() * 2) === 0) {
      const r = 15 + rand() * 25;
      avatarCenter.push(chromaticLayer(`<circle cx="${half}" cy="${half}" r="${r}" fill="${color}" opacity="${opacity.toFixed(2)}" />`, offset, angle));
    } else {
      const w = 20 + rand() * 30;
      const h = 20 + rand() * 30;
      const x = half - w / 2;
      const y = half - h / 2;
      const rx = 5 + Math.floor(rand() * 10);
      const rot = Math.floor(rand() * 360);
      avatarCenter.push(
        chromaticLayer(
          `<g transform="rotate(${rot} ${half} ${half})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}" opacity="${opacity.toFixed(2)}" /></g>`,
          offset,
          angle,
        ),
      );
    }
  }

  const grouped = [
    `<g filter="url(#blurSoft)">${layers.circles.join("\n")}</g>`,
    `<g>${layers.rings.join("\n")}</g>`,
    `<g filter="url(#blurMid)">${layers.rects.join("\n")}</g>`,
    `<g>${layers.triangles.join("\n")}</g>`,
    `<g filter="url(#blurSoft)">${avatarCenter.join("\n")}</g>`,
  ].join("");

  const mirrors: string[] = [];
  for (let i = 0; i < 4; i++) {
    const deg = i * 90;
    mirrors.push(
      `<g transform="translate(${CANVAS_SIZE / 2},${CANVAS_SIZE / 2}) rotate(${deg}) translate(${-CANVAS_SIZE / 2},${-CANVAS_SIZE / 2})">${grouped}</g>`,
    );
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displaySize}" height="${displaySize}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
  ${svgFilters(`avar-${seed}`, colorA, colorB)}
  <rect width="100%" height="100%" fill="${bg}" rx="${CANVAS_SIZE * 0.1}" />
  <rect width="100%" height="100%" fill="url(#avar-${seed})" opacity="0.55" rx="${CANVAS_SIZE * 0.1}" />
  ${mirrors.join("")}
  ${guestCoverIconOverlaySvg(coverIconId, CANVAS_SIZE)}
</svg>`;

  return toDataUrl(svg);
}

interface LastFmImage {
  "#text"?: string;
}

/** Pick the best non-placeholder Last.fm image from search/metadata payloads. */
export function albumArtFromImages(images: unknown): string | null {
  if (!Array.isArray(images)) return null;

  const sizes = [3, 2, 1, 0];
  for (const index of sizes) {
    const entry = images[index] as LastFmImage | undefined;
    const url = entry?.["#text"];
    if (url && !url.includes(LASTFM_PLACEHOLDER)) return url;
  }
  return null;
}

export function trackArtworkSrc(
  title: string,
  artist: string,
  images?: unknown,
  displaySize = CANVAS_SIZE,
): string {
  return albumArtFromImages(images) ?? proceduralAlbumArt(title, artist, displaySize);
}
