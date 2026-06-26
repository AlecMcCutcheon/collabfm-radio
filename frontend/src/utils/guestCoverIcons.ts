/** Centered emblem overlays for procedural guest avatar / cover art (Lucide-derived paths). */

export const GUEST_COVER_ICON_COUNT = 26;

export type GuestCoverIconShape =
  | { kind: "path"; d: string; transform?: string }
  | { kind: "circle"; cx: number; cy: number; r: number; transform?: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; transform?: string }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      transform?: string;
    };

export interface GuestCoverIconDef {
  id: number;
  label: string;
  shapes: GuestCoverIconShape[];
}

const BONE_PATH =
  "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z";

export const GUEST_COVER_ICONS: GuestCoverIconDef[] = [
  { id: 0, label: "None", shapes: [] },
  {
    id: 1,
    label: "Crossbones",
    shapes: [
      { kind: "path", d: BONE_PATH, transform: "rotate(45 12 12)" },
      { kind: "path", d: BONE_PATH, transform: "rotate(-45 12 12)" },
    ],
  },
  {
    id: 2,
    label: "Skull",
    shapes: [
      { kind: "path", d: "m12.5 17-.5-1-.5 1h1z" },
      {
        kind: "path",
        d: "M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z",
      },
      { kind: "circle", cx: 15, cy: 12, r: 1 },
      { kind: "circle", cx: 9, cy: 12, r: 1 },
    ],
  },
  {
    id: 3,
    label: "Biohazard",
    shapes: [
      { kind: "circle", cx: 12, cy: 11.9, r: 2 },
      { kind: "path", d: "M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6" },
      { kind: "path", d: "m8.9 10.1 1.4.8" },
      { kind: "path", d: "M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5" },
      { kind: "path", d: "m15.1 10.1-1.4.8" },
      { kind: "path", d: "M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2" },
      { kind: "path", d: "M12 13.9v1.6" },
      { kind: "path", d: "M13.5 5.4c-1-.2-2-.2-3 0" },
      { kind: "path", d: "M17 16.4c.7-.7 1.2-1.6 1.5-2.5" },
      { kind: "path", d: "M5.5 13.9c.3.9.8 1.8 1.5 2.5" },
    ],
  },
  {
    id: 4,
    label: "Hazard",
    shapes: [
      { kind: "path", d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" },
      { kind: "path", d: "M12 9v4" },
      { kind: "path", d: "M12 17h.01" },
    ],
  },
  {
    id: 5,
    label: "Bolt",
    shapes: [
      {
        kind: "path",
        d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      },
    ],
  },
  {
    id: 6,
    label: "Flame",
    shapes: [
      {
        kind: "path",
        d: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
      },
    ],
  },
  {
    id: 7,
    label: "Radio",
    shapes: [
      { kind: "path", d: "M16.247 7.761a6 6 0 0 1 0 8.478" },
      { kind: "path", d: "M19.075 4.933a10 10 0 0 1 0 14.134" },
      { kind: "path", d: "M4.925 19.067a10 10 0 0 1 0-14.134" },
      { kind: "path", d: "M7.753 16.239a6 6 0 0 1 0-8.478" },
      { kind: "circle", cx: 12, cy: 12, r: 2 },
    ],
  },
  {
    id: 8,
    label: "Headphones",
    shapes: [
      {
        kind: "path",
        d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
      },
    ],
  },
  {
    id: 9,
    label: "Music",
    shapes: [
      { kind: "path", d: "M9 18V5l12-2v13" },
      { kind: "circle", cx: 6, cy: 18, r: 3 },
      { kind: "circle", cx: 18, cy: 16, r: 3 },
    ],
  },
  {
    id: 10,
    label: "Star",
    shapes: [
      {
        kind: "path",
        d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      },
    ],
  },
  {
    id: 11,
    label: "Heart",
    shapes: [
      {
        kind: "path",
        d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
      },
    ],
  },
  {
    id: 12,
    label: "Ghost",
    shapes: [
      { kind: "path", d: "M9 10h.01" },
      { kind: "path", d: "M15 10h.01" },
      {
        kind: "path",
        d: "M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z",
      },
    ],
  },
  {
    id: 13,
    label: "Crown",
    shapes: [
      {
        kind: "path",
        d: "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
      },
      { kind: "path", d: "M5 21h14" },
    ],
  },
  {
    id: 14,
    label: "Crosshair",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "line", x1: 22, y1: 12, x2: 18, y2: 12 },
      { kind: "line", x1: 6, y1: 12, x2: 2, y2: 12 },
      { kind: "line", x1: 12, y1: 6, x2: 12, y2: 2 },
      { kind: "line", x1: 12, y1: 22, x2: 12, y2: 18 },
    ],
  },
  {
    id: 15,
    label: "Signal",
    shapes: [
      { kind: "path", d: "M12 20h.01" },
      { kind: "path", d: "M2 8.82a15 15 0 0 1 20 0" },
      { kind: "path", d: "M5 12.859a10 10 0 0 1 14 0" },
      { kind: "path", d: "M8.5 16.429a5 5 0 0 1 7 0" },
    ],
  },
  {
    id: 16,
    label: "Eye",
    shapes: [
      {
        kind: "path",
        d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      },
      { kind: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  {
    id: 17,
    label: "Mic",
    shapes: [
      { kind: "path", d: "M12 19v3" },
      { kind: "path", d: "M19 10v2a7 7 0 0 1-14 0v-2" },
      { kind: "rect", x: 9, y: 2, width: 6, height: 13, rx: 3 },
    ],
  },
  {
    id: 18,
    label: "Bomb",
    shapes: [
      { kind: "circle", cx: 11, cy: 13, r: 9 },
      {
        kind: "path",
        d: "M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95",
      },
      { kind: "path", d: "m22 2-1.5 1.5" },
    ],
  },
  {
    id: 19,
    label: "Shield",
    shapes: [
      {
        kind: "path",
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
  },
  {
    id: 20,
    label: "Disc",
    shapes: [
      { kind: "circle", cx: 12, cy: 12, r: 10 },
      { kind: "circle", cx: 12, cy: 12, r: 3 },
    ],
  },
  {
    id: 21,
    label: "Sparkles",
    shapes: [
      {
        kind: "path",
        d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
      },
      { kind: "path", d: "M20 2v4" },
      { kind: "path", d: "M22 4h-4" },
      { kind: "path", d: "M4 18v2" },
      { kind: "path", d: "M5 21H3" },
    ],
  },
  {
    id: 22,
    label: "Moon",
    shapes: [
      {
        kind: "path",
        d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
      },
    ],
  },
  {
    id: 23,
    label: "Volume",
    shapes: [
      {
        kind: "path",
        d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
      },
      { kind: "path", d: "M16 9a5 5 0 0 1 0 6" },
    ],
  },
  {
    id: 24,
    label: "Waves",
    shapes: [
      {
        kind: "path",
        d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
      {
        kind: "path",
        d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
      {
        kind: "path",
        d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
  },
  {
    id: 25,
    label: "Bot",
    shapes: [
      { kind: "path", d: "M12 8V4H8" },
      { kind: "rect", x: 4, y: 8, width: 16, height: 12, rx: 2 },
      { kind: "path", d: "M2 14h2" },
      { kind: "path", d: "M20 14h2" },
      { kind: "path", d: "M15 13v2" },
      { kind: "path", d: "M9 13v2" },
    ],
  },
];

function clampIconId(iconId: number): number {
  const n = Math.floor(iconId);
  if (!Number.isFinite(n) || n < 0 || n >= GUEST_COVER_ICON_COUNT) return 0;
  return n;
}

export function getGuestCoverIconDef(iconId: number): GuestCoverIconDef {
  const id = clampIconId(iconId);
  return GUEST_COVER_ICONS.find((icon) => icon.id === id) ?? GUEST_COVER_ICONS[0];
}

function shapeToSvg(shape: GuestCoverIconShape): string {
  const attrs =
    'fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const transform = shape.transform ? ` transform="${shape.transform}"` : "";
  switch (shape.kind) {
    case "path":
      return `<path d="${shape.d}"${transform} ${attrs}/>`;
    case "circle":
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"${transform} ${attrs}/>`;
    case "line":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"${transform} ${attrs}/>`;
    case "rect":
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.rx ?? 0}"${transform} ${attrs}/>`;
    default:
      return "";
  }
}

/** Dark badge behind the emblem — slightly larger than the icon for breathing room. */
const COVER_ICON_BADGE_RADIUS_RATIO = 0.22;

/** SVG fragment centered on a square canvas (viewBox 0..canvasSize). */
export function guestCoverIconOverlaySvg(iconId: number, canvasSize: number): string {
  const def = getGuestCoverIconDef(iconId);
  if (!def.shapes.length) return "";

  const cx = canvasSize / 2;
  const scale = canvasSize / 72;
  const shapes = def.shapes.map(shapeToSvg).join("\n");

  return `
  <g opacity="0.94">
    <circle cx="${cx}" cy="${cx}" r="${canvasSize * COVER_ICON_BADGE_RADIUS_RATIO}" fill="black" opacity="0.42"/>
    <g transform="translate(${cx}, ${cx}) scale(${scale}) translate(-12, -12)">
      ${shapes}
    </g>
  </g>`;
}
