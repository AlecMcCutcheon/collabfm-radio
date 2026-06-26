import type { PartyEffectType } from "../types/api";
import { createSeededRng } from "./partyEffectSeed";

export interface SampledPoint {
  x: number;
  y: number;
  angle: number;
}

interface Point {
  x: number;
  y: number;
}

export interface TravelRoute {
  samples: SampledPoint[];
  cumulativeLen: number[];
  totalLen: number;
  /** Degrees — direction of travel into the destination. */
  approachAngle: number;
}

const TRAVEL_TYPES = new Set<string>([
  "rocket",
  "comet",
  "ufo",
  "meteor",
  "lightning",
  "firefly",
  "satellite",
]);

function edgePoint(edge: number, rng: () => number): Point {
  const pad = 8 + rng() * 14;
  const along = 12 + rng() * 76;
  switch (edge) {
    case 0:
      return { x: along, y: -pad };
    case 1:
      return { x: 100 + pad, y: along };
    case 2:
      return { x: along, y: 100 + pad };
    default:
      return { x: -pad, y: along };
  }
}

/** Pick the screen edge farthest from the click (with slight randomness). */
export function pickEntryEdge(destNormX: number, destNormY: number, rng: () => number): number {
  const x = destNormX * 100;
  const y = destNormY * 100;
  const ranked = [
    { edge: 0, score: y },
    { edge: 1, score: 100 - x },
    { edge: 2, score: 100 - y },
    { edge: 3, score: x },
  ].sort((a, b) => b.score - a.score);
  return rng() < 0.78 ? ranked[0]!.edge : ranked[1]!.edge;
}

function sampleLinear(start: Point, end: Point, count: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  });
}

function sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, count: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const u = 1 - t;
    return {
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y,
    };
  });
}

function sampleCircularArc(
  cx: number,
  cy: number,
  radius: number,
  angStart: number,
  angEnd: number,
  count: number,
): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const ang = angStart + (angEnd - angStart) * t;
    return { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
  });
}

function orbitTangent(ang: number, dir: 1 | -1): Point {
  return dir > 0
    ? { x: -Math.sin(ang), y: Math.cos(ang) }
    : { x: Math.sin(ang), y: -Math.cos(ang) };
}

function concatPaths(...paths: Point[][]): Point[] {
  const out: Point[] = [];
  for (const path of paths) {
    for (const pt of path) {
      const prev = out[out.length - 1];
      if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 0.05) continue;
      out.push(pt);
    }
  }
  return out;
}

function addAngles(samples: Point[]): SampledPoint[] {
  return samples.map((p, i) => {
    const look = Math.max(1, Math.min(4, i, samples.length - 1 - i));
    const prev = samples[Math.max(0, i - look)]!;
    const next = samples[Math.min(samples.length - 1, i + look)]!;
    return {
      x: p.x,
      y: p.y,
      angle: (Math.atan2(next.y - prev.y, next.x - prev.x) * 180) / Math.PI,
    };
  });
}

function buildCumulativeLen(samples: Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < samples.length; i++) {
    cum.push(
      cum[i - 1]! +
        Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.y - samples[i - 1]!.y),
    );
  }
  return cum;
}

function computeApproachAngle(samples: Point[]): number {
  if (samples.length < 2) return 0;
  const a = samples[samples.length - 2]!;
  const b = samples[samples.length - 1]!;
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function buildStraightRoute(
  seed: string,
  destNormX: number,
  destNormY: number,
): { raw: Point[]; edge: number } {
  const rng = createSeededRng(seed);
  const edge = pickEntryEdge(destNormX, destNormY, rng);
  const start = edgePoint(edge, rng);
  const dest = { x: destNormX * 100, y: destNormY * 100 };
  return { raw: sampleLinear(start, dest, 96), edge };
}

function sampleSpiralExit(
  anchor: Point,
  startAng: number,
  dir: 1 | -1,
  turns: number,
  maxR: number,
  endR: number,
  rise: number,
  driftX: number,
  count: number,
): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const ease = t * t * (3 - 2 * t);
    const ang = startAng + dir * turns * Math.PI * 2 * ease;
    const r = maxR * (1 - ease * 0.88) + endR * ease;
    const hubX = anchor.x + driftX * ease;
    const hubY = anchor.y - rise * ease;
    const ring = r * ease;
    return {
      x: hubX + Math.cos(ang) * ring,
      y: hubY + Math.sin(ang) * ring,
    };
  });
}

function buildUfoRoute(seed: string, destNormX: number, destNormY: number): Point[] {
  const rng = createSeededRng(`${seed}-ufo`);
  const edge = pickEntryEdge(destNormX, destNormY, rng);
  const start = edgePoint(edge, rng);
  const dest = { x: destNormX * 100, y: destNormY * 100 };
  const dir: 1 | -1 = rng() > 0.5 ? 1 : -1;
  const approachAng = Math.atan2(dest.y - start.y, dest.x - start.x);
  const perpX = -Math.sin(approachAng);
  const perpY = Math.cos(approachAng);
  const lift = 10 + rng() * 9;

  const approachPt = {
    x: dest.x - Math.cos(approachAng) * (26 + rng() * 14) + perpX * dir * (10 + rng() * 12),
    y: dest.y - Math.sin(approachAng) * (26 + rng() * 14) + perpY * dir * (10 + rng() * 12) - lift,
  };
  const approachLen = Math.hypot(approachPt.x - start.x, approachPt.y - start.y) || 1;
  const entry = sampleCubicBezier(
    start,
    {
      x: start.x + Math.cos(approachAng) * approachLen * 0.45,
      y: start.y + Math.sin(approachAng) * approachLen * 0.45,
    },
    {
      x: approachPt.x - Math.cos(approachAng) * approachLen * 0.2,
      y: approachPt.y - Math.sin(approachAng) * approachLen * 0.2,
    },
    approachPt,
    52,
  );

  const crest = {
    x: dest.x + perpX * dir * (6 + rng() * 10),
    y: dest.y - lift * (0.65 + rng() * 0.25),
  };
  const passPt = {
    x: dest.x + Math.cos(approachAng) * (20 + rng() * 12) + perpX * dir * (14 + rng() * 10),
    y: dest.y + Math.sin(approachAng) * (20 + rng() * 12) - lift * 0.35,
  };
  const flyover = sampleCubicBezier(
    approachPt,
    {
      x: (approachPt.x + crest.x) / 2 + perpX * dir * 5,
      y: (approachPt.y + crest.y) / 2 - 2,
    },
    {
      x: (crest.x + passPt.x) / 2 + perpX * dir * 4,
      y: (crest.y + passPt.y) / 2,
    },
    passPt,
    48,
  );

  const scanCx = dest.x + perpX * dir * 2;
  const scanCy = dest.y - 3;
  const scanR = 16 + rng() * 11;
  const scanStartAng = Math.atan2(passPt.y - scanCy, passPt.x - scanCx);
  const scanSweep = Math.PI * (0.95 + rng() * 0.45);
  const scanEndAng = scanStartAng + dir * scanSweep;
  const scan = sampleCircularArc(scanCx, scanCy, scanR, scanStartAng, scanEndAng, 84);

  const scanEnd = scan[scan.length - 1]!;
  const spiralStartAng = scanEndAng + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const spiral = sampleSpiralExit(
    scanEnd,
    spiralStartAng,
    dir,
    2.2 + rng() * 0.9,
    scanR * 0.8,
    2 + rng() * 2.5,
    40 + rng() * 24,
    perpX * dir * (8 + rng() * 12),
    100,
  );

  return concatPaths(entry, flyover.slice(1), scan.slice(1), spiral.slice(1));
}

function buildRocketRoute(seed: string, destNormX: number, destNormY: number): Point[] {
  const rng = createSeededRng(`${seed}-rocket`);
  const edge = pickEntryEdge(destNormX, destNormY, rng);
  const start = edgePoint(edge, rng);
  const dest = { x: destNormX * 100, y: destNormY * 100 };
  const orbitR = 10 + rng() * 12;
  const dir: 1 | -1 = rng() > 0.5 ? 1 : -1;
  const approachAng = Math.atan2(dest.y - start.y, dest.x - start.x);
  const arcStartAng = approachAng + Math.PI + dir * (0.22 + rng() * 0.28);
  const arcSweep = Math.PI * (1.1 + rng() * 0.5);
  const arcEndAng = arcStartAng + dir * arcSweep;

  const join = {
    x: dest.x + Math.cos(arcStartAng) * orbitR,
    y: dest.y + Math.sin(arcStartAng) * orbitR,
  };

  const approachLen = Math.hypot(join.x - start.x, join.y - start.y) || 1;
  const joinInTan = orbitTangent(arcStartAng, dir);
  const approach = sampleCubicBezier(
    start,
    {
      x: start.x + Math.cos(approachAng) * approachLen * 0.42,
      y: start.y + Math.sin(approachAng) * approachLen * 0.42,
    },
    {
      x: join.x - joinInTan.x * approachLen * 0.32,
      y: join.y - joinInTan.y * approachLen * 0.32,
    },
    join,
    56,
  );

  const orbit = sampleCircularArc(dest.x, dest.y, orbitR, arcStartAng, arcEndAng, 72);

  const last = orbit[orbit.length - 1]!;
  const exitTan = orbitTangent(arcEndAng, dir);
  const exitDist = 52 + rng() * 22;
  const exit = {
    x: last.x + exitTan.x * exitDist,
    y: last.y + exitTan.y * exitDist,
  };
  const exitLen = Math.hypot(exit.x - last.x, exit.y - last.y) || 1;
  const exitCurve = sampleCubicBezier(
    last,
    {
      x: last.x + exitTan.x * exitLen * 0.38,
      y: last.y + exitTan.y * exitLen * 0.38,
    },
    {
      x: exit.x - exitTan.x * exitLen * 0.18,
      y: exit.y - exitTan.y * exitLen * 0.18,
    },
    exit,
    40,
  );

  return concatPaths(approach, orbit.slice(1), exitCurve.slice(1));
}

function buildLightningRoute(seed: string, destNormX: number, destNormY: number): Point[] {
  const rng = createSeededRng(`${seed}-lightning`);
  const dest = { x: destNormX * 100, y: destNormY * 100 };
  const start = {
    x: dest.x + (rng() - 0.5) * 38,
    y: -10 - rng() * 14,
  };
  const forks = 5 + Math.floor(rng() * 2);
  const waypoints: Point[] = [start];
  for (let i = 1; i < forks; i++) {
    const t = i / forks;
    const bx = start.x + (dest.x - start.x) * t;
    const by = start.y + (dest.y - start.y) * t;
    const amp = (1 - t * 0.6) * (16 + rng() * 24);
    waypoints.push({
      x: bx + (rng() > 0.5 ? 1 : -1) * amp,
      y: by + (rng() - 0.5) * 12,
    });
  }
  waypoints.push(dest);
  const segments: Point[][] = [];
  for (let i = 1; i < waypoints.length; i++) {
    segments.push(sampleLinear(waypoints[i - 1]!, waypoints[i]!, 26));
  }
  return concatPaths(...segments);
}

function buildFireflyRoute(seed: string, destNormX: number, destNormY: number): Point[] {
  const rng = createSeededRng(`${seed}-firefly`);
  const edge = pickEntryEdge(destNormX, destNormY, rng);
  const start = edgePoint(edge, rng);
  const dest = { x: destNormX * 100, y: destNormY * 100 };

  const wobbleA = {
    x: start.x + (dest.x - start.x) * 0.28 + (rng() - 0.5) * 22,
    y: start.y + (dest.y - start.y) * 0.22 - (12 + rng() * 18),
  };
  const wobbleB = {
    x: start.x + (dest.x - start.x) * 0.55 + (rng() - 0.5) * 28,
    y: start.y + (dest.y - start.y) * 0.48 + (rng() - 0.5) * 20,
  };
  const wobbleC = {
    x: dest.x + (rng() - 0.5) * 16,
    y: dest.y - (10 + rng() * 14),
  };

  const leg1 = sampleCubicBezier(
    start,
    { x: start.x + (wobbleA.x - start.x) * 0.45, y: start.y - 8 },
    { x: wobbleA.x - 4, y: wobbleA.y + 6 },
    wobbleA,
    36,
  );
  const leg2 = sampleCubicBezier(
    wobbleA,
    { x: (wobbleA.x + wobbleB.x) / 2 + (rng() - 0.5) * 14, y: wobbleA.y - 6 },
    { x: wobbleB.x, y: wobbleB.y + (rng() - 0.5) * 10 },
    wobbleB,
    40,
  );
  const leg3 = sampleCubicBezier(
    wobbleB,
    { x: (wobbleB.x + wobbleC.x) / 2, y: wobbleB.y + 4 },
    { x: wobbleC.x, y: wobbleC.y - 4 },
    wobbleC,
    32,
  );
  const leg4 = sampleLinear(wobbleC, dest, 28);
  return concatPaths(leg1, leg2.slice(1), leg3.slice(1), leg4.slice(1));
}

function buildSatelliteRoute(seed: string, destNormX: number, destNormY: number): Point[] {
  const rng = createSeededRng(`${seed}-satellite`);
  const dest = { x: destNormX * 100, y: destNormY * 100 };
  const start = {
    x: dest.x + (rng() - 0.5) * 55,
    y: -16 - rng() * 12,
  };
  const apex = {
    x: dest.x + (rng() - 0.5) * 22,
    y: dest.y - (42 + rng() * 38),
  };
  return sampleCubicBezier(
    start,
    { x: (start.x + apex.x) / 2, y: start.y - 10 },
    { x: apex.x, y: (apex.y + dest.y) / 2 },
    dest,
    100,
  );
}

function finalizeRoute(raw: Point[]): TravelRoute {
  const samples = addAngles(raw);
  const cumulativeLen = buildCumulativeLen(raw);
  return {
    samples,
    cumulativeLen,
    totalLen: cumulativeLen[cumulativeLen.length - 1] ?? 0,
    approachAngle: computeApproachAngle(raw),
  };
}

export function travelEase(
  t: number,
  mode: "default" | "impact" | "rocket" | "ufo" | "lightning" | "firefly" | "satellite" = "default",
): number {
  const c = Math.max(0, Math.min(1, t));
  if (mode === "impact") return c * c * c;
  if (mode === "lightning") {
    if (c < 0.85) return c * 0.92;
    return 0.78 + ((c - 0.85) / 0.15) * 0.22;
  }
  if (mode === "firefly") {
    const flutter = Math.sin(c * Math.PI * 7) * 0.022;
    return c * 0.94 + flutter;
  }
  if (mode === "satellite") {
    const smooth = (x: number) => {
      const v = Math.max(0, Math.min(1, x));
      return v * v * (3 - 2 * v);
    };
    if (c < 0.22) return smooth(c / 0.22) * 0.18;
    return 0.18 + smooth((c - 0.22) / 0.78) * 0.82;
  }
  if (mode === "rocket") {
    if (c < 0.22) return (c / 0.22) * (c / 0.22) * 0.22;
    if (c < 0.72) return 0.22 + ((c - 0.22) / 0.5) * 0.56;
    return 0.78 + ((c - 0.72) / 0.28) * 0.22;
  }
  if (mode === "ufo") {
    const smooth = (x: number) => {
      const v = Math.max(0, Math.min(1, x));
      return v * v * (3 - 2 * v);
    };
    if (c < 0.18) return smooth(c / 0.18) * 0.16;
    if (c < 0.30) return 0.16 + smooth((c - 0.18) / 0.12) * 0.1;
    if (c < 0.56) return 0.26 + ((c - 0.30) / 0.26) * 0.22;
    return 0.48 + smooth((c - 0.56) / 0.44) * 0.52;
  }
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function buildTravelRoute(
  seed: string,
  destNormX: number,
  destNormY: number,
  travelType: PartyEffectType,
): TravelRoute {
  if (!TRAVEL_TYPES.has(travelType)) {
    return finalizeRoute(sampleLinear({ x: 50, y: -12 }, { x: destNormX * 100, y: destNormY * 100 }, 64));
  }

  switch (travelType) {
    case "comet":
    case "meteor":
      return finalizeRoute(buildStraightRoute(seed, destNormX, destNormY).raw);
    case "ufo":
      return finalizeRoute(buildUfoRoute(seed, destNormX, destNormY));
    case "lightning":
      return finalizeRoute(buildLightningRoute(seed, destNormX, destNormY));
    case "firefly":
      return finalizeRoute(buildFireflyRoute(seed, destNormX, destNormY));
    case "satellite":
      return finalizeRoute(buildSatelliteRoute(seed, destNormX, destNormY));
    case "rocket":
      return finalizeRoute(buildRocketRoute(seed, destNormX, destNormY));
    default:
      return finalizeRoute(buildStraightRoute(seed, destNormX, destNormY).raw);
  }
}

export function interpolateByArcLength(
  samples: SampledPoint[],
  cumulativeLen: number[],
  t: number,
): SampledPoint {
  if (!samples.length) return { x: 50, y: 50, angle: 0 };
  const total = cumulativeLen[cumulativeLen.length - 1] || 1;
  const target = Math.max(0, Math.min(1, t)) * total;

  let lo = 0;
  let hi = cumulativeLen.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeLen[mid]! <= target) lo = mid;
    else hi = mid;
  }

  const segLen = cumulativeLen[hi]! - cumulativeLen[lo]!;
  const frac = segLen > 0 ? (target - cumulativeLen[lo]!) / segLen : 0;
  const a = samples[lo]!;
  const b = samples[hi]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const travelAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const blend = frac * frac * (3 - 2 * frac);
  let angle = travelAngle;
  if (lo > 0 && hi < samples.length - 1) {
    angle = a.angle + (b.angle - a.angle) * blend;
  }
  return {
    x: a.x + dx * frac,
    y: a.y + dy * frac,
    angle,
  };
}

export function progressFromElapsed(
  elapsedMs: number,
  durationMs: number,
  travelType?: PartyEffectType,
): number {
  const raw = Math.min(1, Math.max(0, elapsedMs / durationMs));
  if (travelType === "comet" || travelType === "meteor") {
    return travelEase(raw, "impact");
  }
  if (travelType === "lightning") return travelEase(raw, "lightning");
  if (travelType === "rocket") return travelEase(raw, "rocket");
  if (travelType === "ufo") return travelEase(raw, "ufo");
  if (travelType === "firefly") return travelEase(raw, "firefly");
  if (travelType === "satellite") return travelEase(raw, "satellite");
  return travelEase(raw, "default");
}

export function easeModeForType(
  travelType: PartyEffectType,
): "default" | "impact" | "rocket" | "ufo" | "lightning" | "firefly" | "satellite" {
  if (travelType === "comet" || travelType === "meteor") return "impact";
  if (travelType === "lightning") return "lightning";
  if (travelType === "rocket") return "rocket";
  if (travelType === "ufo") return "ufo";
  if (travelType === "firefly") return "firefly";
  if (travelType === "satellite") return "satellite";
  return "default";
}

/** Path progress range where the UFO scan beam is active. */
export const UFO_SCAN_PROGRESS: readonly [number, number] = [0.24, 0.52];
