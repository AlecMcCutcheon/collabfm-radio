import { createSeededRng } from "./partyEffectSeed";

export interface LightningPoint {
  x: number;
  y: number;
}

export interface LightningBoltSpec {
  points: LightningPoint[];
  width: number;
  strikeAt: number;
  branch: boolean;
}

export interface LightningStormSpec {
  bolts: LightningBoltSpec[];
  destX: number;
  destY: number;
}

const stormCache = new Map<string, LightningStormSpec>();

function jaggedLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  displace: number,
  rng: () => number,
): LightningPoint[] {
  if (displace < 2.5) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }
  const midX = (x1 + x2) / 2 + (rng() - 0.5) * displace;
  const midY = (y1 + y2) / 2 + (rng() - 0.5) * displace * 0.85;
  const left = jaggedLine(x1, y1, midX, midY, displace * 0.52, rng);
  const right = jaggedLine(midX, midY, x2, y2, displace * 0.52, rng);
  return [...left.slice(0, -1), ...right];
}

function branchFromBolt(
  points: LightningPoint[],
  rng: () => number,
  displace: number,
): LightningBoltSpec | null {
  if (points.length < 4) return null;
  const t = 0.35 + rng() * 0.35;
  const idx = Math.min(points.length - 2, Math.max(1, Math.floor(t * (points.length - 1))));
  const origin = points[idx]!;
  const len = 40 + rng() * 70;
  const ang = (rng() - 0.5) * Math.PI * 0.9;
  const end = {
    x: origin.x + Math.cos(ang) * len,
    y: origin.y + Math.sin(ang) * len * 0.65,
  };
  return {
    points: jaggedLine(origin.x, origin.y, end.x, end.y, displace * 0.55, rng),
    width: 1.2 + rng() * 0.8,
    strikeAt: 0,
    branch: true,
  };
}

export function getLightningStorm(
  effectId: string,
  destNormX: number,
  destNormY: number,
  w: number,
  h: number,
): LightningStormSpec {
  const key = `${effectId}:${w}x${h}:${destNormX.toFixed(4)}:${destNormY.toFixed(4)}`;
  const cached = stormCache.get(key);
  if (cached) return cached;

  const rng = createSeededRng(`${effectId}:storm`);
  const destX = destNormX * w;
  const destY = destNormY * h;
  const cloudY = -24 - rng() * 36;
  const bolts: LightningBoltSpec[] = [];

  const mainCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < mainCount; i++) {
    const startX = destX + (rng() - 0.5) * (90 + i * 55);
    const startY = cloudY - rng() * 50;
    const endX = destX + (rng() - 0.5) * 28;
    const endY = destY + (rng() - 0.5) * 16;
    const displace = 38 + rng() * 42;
    const points = jaggedLine(startX, startY, endX, endY, displace, rng);
    const strikeAt = 0.04 + i * 0.14 + rng() * 0.06;
    bolts.push({
      points,
      width: 2.4 + rng() * 1.2,
      strikeAt,
      branch: false,
    });

    const branchCount = 1 + Math.floor(rng() * 2);
    for (let b = 0; b < branchCount; b++) {
      const branch = branchFromBolt(points, rng, displace);
      if (branch) {
        branch.strikeAt = strikeAt + 0.06 + b * 0.05 + rng() * 0.04;
        bolts.push(branch);
      }
    }
  }

  const distantCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < distantCount; i++) {
    const startX = destX + (rng() - 0.5) * 220;
    const startY = cloudY - 20 - rng() * 40;
    const endX = destX + (rng() - 0.5) * 80;
    const endY = destY * 0.35 + rng() * destY * 0.45;
    const points = jaggedLine(startX, startY, endX, endY, 28 + rng() * 24, rng);
    bolts.push({
      points,
      width: 1.4 + rng() * 0.6,
      strikeAt: 0.22 + i * 0.18 + rng() * 0.08,
      branch: false,
    });
  }

  bolts.sort((a, b) => a.strikeAt - b.strikeAt);
  const spec = { bolts, destX, destY };
  stormCache.set(key, spec);
  if (stormCache.size > 40) {
    const first = stormCache.keys().next().value;
    if (first) stormCache.delete(first);
  }
  return spec;
}

export function drawLightningBoltPath(
  ctx: CanvasRenderingContext2D,
  points: LightningPoint[],
  reveal: number,
  width: number,
  alpha: number,
) {
  if (reveal <= 0 || alpha <= 0.01 || points.length < 2) return;

  const totalSegs = points.length - 1;
  const visibleSegs = Math.min(totalSegs, Math.max(1, Math.floor(reveal * totalSegs)));
  const frac = reveal * totalSegs - Math.floor(reveal * totalSegs);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const drawPass = (lineW: number, color: string, blur: number) => {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i <= visibleSegs; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    if (frac > 0 && visibleSegs < totalSegs) {
      const a = points[visibleSegs]!;
      const b = points[visibleSegs + 1]!;
      ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
    }
    ctx.stroke();
  };

  drawPass(width * 3.2, `rgba(59, 130, 246, ${alpha * 0.35})`, 18);
  drawPass(width * 1.8, `rgba(147, 197, 253, ${alpha * 0.55})`, 12);
  drawPass(width, `rgba(240, 249, 255, ${alpha * 0.92})`, 6);
  drawPass(Math.max(1, width * 0.45), `rgba(255, 255, 255, ${alpha})`, 2);

  ctx.restore();
}

export function drawLightningStorm(
  ctx: CanvasRenderingContext2D,
  storm: LightningStormSpec,
  progress: number,
  w: number,
  h: number,
) {
  const flicker = 0.82 + 0.18 * Math.sin(progress * 48);

  for (const bolt of storm.bolts) {
    if (progress < bolt.strikeAt) continue;
    const local = Math.min(1, (progress - bolt.strikeAt) / (bolt.branch ? 0.22 : 0.32));
    const revealEase = 1 - Math.pow(1 - local, 2.8);
    const alpha = (bolt.branch ? 0.75 : 1) * flicker * Math.min(1, 0.35 + local * 0.9);
    drawLightningBoltPath(ctx, bolt.points, revealEase, bolt.width, alpha);
  }

  const hitProgress = Math.max(0, (progress - 0.55) / 0.45);
  if (hitProgress > 0) {
    const flash = Math.pow(1 - Math.min(1, hitProgress * 1.4), 2) * 0.42 * flicker;
    if (flash > 0.02) {
      const grad = ctx.createRadialGradient(storm.destX, storm.destY, 0, storm.destX, storm.destY, 90 + hitProgress * 60);
      grad.addColorStop(0, `rgba(255, 255, 255, ${flash})`);
      grad.addColorStop(0.25, `rgba(191, 219, 254, ${flash * 0.7})`);
      grad.addColorStop(1, "rgba(59, 130, 246, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (progress > 0.08) {
    const cloudAlpha = Math.min(0.22, progress * 0.18) * flicker;
    const cloudGrad = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    cloudGrad.addColorStop(0, `rgba(30, 41, 59, ${cloudAlpha})`);
    cloudGrad.addColorStop(1, "rgba(30, 41, 59, 0)");
    ctx.fillStyle = cloudGrad;
    ctx.fillRect(0, 0, w, h * 0.35);
  }
}

export function drawLightningImpactForks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  effectId: string,
  t: number,
) {
  if (t <= 0.02 || t >= 0.92) return;
  const rng = createSeededRng(`${effectId}:impact`);
  const forkCount = 4 + Math.floor(rng() * 3);
  const life = Math.max(0, 1 - t * 1.15);
  const alpha = life * life * 0.9;

  for (let i = 0; i < forkCount; i++) {
    const ang = (i / forkCount) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const len = 18 + rng() * 42 * life;
    const endX = cx + Math.cos(ang) * len;
    const endY = cy + Math.sin(ang) * len * 0.7;
    const points = jaggedLine(cx, cy, endX, endY, 10 + rng() * 14, rng);
    const reveal = Math.min(1, t * 3.5);
    drawLightningBoltPath(ctx, points, reveal, 1.2 + rng() * 0.6, alpha * (0.65 + rng() * 0.35));
  }
}
