import type { PartyEffectType } from "../types/api";
import { createSeededRng } from "./partyEffectSeed";
import {
  drawLightningStorm,
  getLightningStorm,
  drawLightningImpactForks,
} from "./lightningBolts";
import {
  interpolateByArcLength,
  progressFromElapsed,
  UFO_SCAN_PROGRESS,
  type TravelRoute,
} from "./partyTravelPath";

const SPAWN_MS = 16;
const TRAIL_SPAWNS = 60;
export const CRASH_BURST_MS = 650;

interface DrawParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  hue: number;
  sat: number;
  light: number;
  glow: boolean;
}

function pctToPx(xPct: number, yPct: number, w: number, h: number) {
  return { x: (xPct / 100) * w, y: (yPct / 100) * h };
}

function isOnScreen(x: number, y: number, radius: number, w: number, h: number): boolean {
  const pad = radius + 6;
  return x >= -pad && x <= w + pad && y >= -pad && y <= h + pad;
}

function hsl(h: number, s: number, l: number, a: number) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function trailMaxAge(type: PartyEffectType): number {
  switch (type) {
    case "meteor":
      return 340;
    case "comet":
      return 480;
    case "lightning":
      return 120;
    case "firefly":
      return 380;
    case "satellite":
      return 360;
    case "ufo":
      return 380;
    case "rocket":
      return 320;
    default:
      return 400;
  }
}

function spawnTrailParticle(
  effectId: string,
  type: PartyEffectType,
  k: number,
  route: TravelRoute,
  durationMs: number,
  w: number,
  h: number,
  age: number,
): DrawParticle | null {
  const maxAge = trailMaxAge(type);
  if (age > maxAge) return null;

  const spawnElapsed = k * SPAWN_MS;
  const headT = progressFromElapsed(spawnElapsed, durationMs, type);
  const head = interpolateByArcLength(route.samples, route.cumulativeLen, headT);
  const rng = createSeededRng(`${effectId}:t${k}`);
  const rad = (head.angle * Math.PI) / 180;
  const back =
    type === "rocket"
      ? 14 + rng() * 26
      : type === "meteor"
        ? 8 + rng() * 16
        : type === "lightning"
          ? 0
          : type === "firefly"
            ? 6 + rng() * 12
            : 6 + rng() * 14;
  const spread = (rng() - 0.5) * (type === "ufo" ? 14 : type === "rocket" ? 16 : type === "lightning" ? 18 : 10);
  const bx = head.x - Math.cos(rad) * back * 0.11;
  const by = head.y - Math.sin(rad) * back * 0.11;
  const px = bx + Math.cos(rad + Math.PI / 2) * spread * 0.09;
  const py = by + Math.sin(rad + Math.PI / 2) * spread * 0.09;
  const { x, y } = pctToPx(px, py, w, h);
  const life = 1 - age / maxAge;

  let hue = 40;
  let sat = 90;
  let light = 65;
  let size = 2 + rng() * 3;
  let glow = false;

  switch (type) {
    case "rocket":
      hue = rng() > 0.35 ? 16 + rng() * 32 : 0;
      sat = hue === 0 ? 0 : 88 + rng() * 12;
      light = hue === 0 ? 50 + rng() * 30 : 48 + rng() * 32;
      size = 1 + rng() * (rng() > 0.8 ? 6 : 3.5);
      glow = rng() > 0.4;
      break;
    case "comet":
      hue = 44 + rng() * 22;
      sat = 85 + rng() * 15;
      light = 72 + rng() * 20;
      size = 1 + rng() * 3.5;
      glow = true;
      break;
    case "ufo":
      hue = 145 + rng() * 35;
      sat = 75 + rng() * 25;
      light = 58 + rng() * 28;
      size = 1 + rng() * 2.8;
      glow = true;
      break;
    case "meteor":
      hue = 8 + rng() * 22;
      sat = 95;
      light = 48 + rng() * 32;
      size = 2 + rng() * 5;
      glow = rng() > 0.35;
      break;
    case "lightning":
      return null;
    case "firefly":
      hue = 72 + rng() * 38;
      sat = 78 + rng() * 22;
      light = 58 + rng() * 32;
      size = 1.5 + rng() * 3.5;
      glow = true;
      break;
    case "satellite":
      hue = 210 + rng() * 25;
      sat = 35 + rng() * 30;
      light = 62 + rng() * 28;
      size = 1 + rng() * 2.5;
      glow = rng() > 0.5;
      break;
  }

  return {
    x,
    y,
    size: size * (0.35 + life * 0.65),
    alpha: life * life * (0.35 + rng() * 0.55),
    hue,
    sat,
    light,
    glow,
  };
}

function spawnBeamParticles(
  effectId: string,
  durationMs: number,
  elapsed: number,
  progress: number,
  headPx: { x: number; y: number },
  destPx: { x: number; y: number },
): DrawParticle[] {
  const [scanStart, scanEnd] = UFO_SCAN_PROGRESS;
  if (progress < scanStart || progress > scanEnd) return [];

  const scanT = (progress - scanStart) / (scanEnd - scanStart);
  const beamTicks = Math.floor((elapsed - durationMs * 0.28) / 20);
  const out: DrawParticle[] = [];

  for (let b = Math.max(0, beamTicks - 28); b < beamTicks; b++) {
    const rng = createSeededRng(`${effectId}:b${b}`);
    const t = 0.1 + rng() * 0.9;
    const spread = (rng() - 0.5) * (10 + t * 24);
    const x = headPx.x + (destPx.x - headPx.x) * t + spread;
    const y = headPx.y + (destPx.y - headPx.y) * t + (rng() - 0.5) * 6;
    const age = elapsed - durationMs * 0.28 - b * 20;
    const life = Math.max(0, 1 - age / 320);
    if (life <= 0) continue;
    out.push({
      x,
      y,
      size: 1 + rng() * 2.4,
      alpha: life * (0.35 + scanT * 0.35),
      hue: 138 + rng() * 28,
      sat: 80,
      light: 62 + rng() * 20,
      glow: true,
    });
  }
  return out;
}

function drawUfoScanBeam(
  ctx: CanvasRenderingContext2D,
  headPx: { x: number; y: number },
  destPx: { x: number; y: number },
  progress: number,
  elapsed: number,
) {
  const [scanStart, scanEnd] = UFO_SCAN_PROGRESS;
  if (progress < scanStart || progress > scanEnd) return;

  const scanT = (progress - scanStart) / (scanEnd - scanStart);
  const pulse = 0.55 + 0.45 * Math.sin(elapsed * 0.028);
  const sweep = (scanT - 0.5) * Math.PI * 0.85;

  ctx.save();

  const beamGrad = ctx.createLinearGradient(headPx.x, headPx.y, destPx.x, destPx.y);
  beamGrad.addColorStop(0, `rgba(134, 239, 172, ${0.12 * pulse})`);
  beamGrad.addColorStop(0.45, `rgba(74, 222, 128, ${0.32 * pulse})`);
  beamGrad.addColorStop(1, `rgba(187, 247, 208, ${0.5 * pulse})`);
  ctx.strokeStyle = beamGrad;
  ctx.lineWidth = 2 + scanT * 1.5;
  ctx.beginPath();
  ctx.moveTo(headPx.x, headPx.y);
  ctx.lineTo(destPx.x, destPx.y);
  ctx.stroke();

  const ringR = 10 + scanT * 26;
  ctx.beginPath();
  ctx.arc(destPx.x, destPx.y, ringR, sweep - 0.65, sweep + 0.65);
  ctx.strokeStyle = `rgba(74, 222, 128, ${0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(destPx.x, destPx.y, ringR * 0.55, -sweep - 0.4, -sweep + 0.4);
  ctx.strokeStyle = `rgba(167, 243, 208, ${0.28 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawTraveledRibbon(
  ctx: CanvasRenderingContext2D,
  route: TravelRoute,
  progress: number,
  w: number,
  h: number,
  type: PartyEffectType,
) {
  if (type === "ufo" || type === "rocket" || type === "firefly" || type === "lightning") return;
  if (progress <= 0.004) return;

  const steps = 16;
  const ribbonLen = type === "meteor" || type === "comet" ? 0.1 : 0.14;
  const ribbonStart = Math.max(0, progress - ribbonLen);
  ctx.lineCap = "round";

  for (let i = 0; i < steps; i++) {
    const t0 = ribbonStart + ((progress - ribbonStart) * i) / steps;
    const t1 = ribbonStart + ((progress - ribbonStart) * (i + 1)) / steps;
    const p0 = interpolateByArcLength(route.samples, route.cumulativeLen, t0);
    const p1 = interpolateByArcLength(route.samples, route.cumulativeLen, t1);
    const a = pctToPx(p0.x, p0.y, w, h);
    const b = pctToPx(p1.x, p1.y, w, h);
    const glowPad = 8;
    if (
      (a.x < -glowPad && b.x < -glowPad) ||
      (a.x > w + glowPad && b.x > w + glowPad) ||
      (a.y < -glowPad && b.y < -glowPad) ||
      (a.y > h + glowPad && b.y > h + glowPad)
    ) {
      continue;
    }
    const fade = (i + 1) / steps;
    const alpha = fade * fade * 0.26;

    let color = `rgba(255, 220, 160, ${alpha})`;
    if (type === "comet") color = `rgba(200, 230, 255, ${alpha})`;
    if (type === "meteor") color = `rgba(255, 140, 60, ${alpha * 1.1})`;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + fade * 2.5;
    ctx.stroke();
  }
}

function drawFireflySwarm(
  ctx: CanvasRenderingContext2D,
  effectId: string,
  route: TravelRoute,
  progress: number,
  elapsed: number,
  w: number,
  h: number,
  pulse: number,
) {
  const baseRng = createSeededRng(`${effectId}:swarm`);
  const count = 8 + Math.floor(baseRng() * 4);

  for (let i = 0; i < count; i++) {
    const flyRng = createSeededRng(`${effectId}:fly${i}`);
    const lag = i * 0.045 + flyRng() * 0.035;
    const flyProgress = Math.max(0, Math.min(1, progress - lag));
    if (flyProgress <= 0.008) continue;

    const head = interpolateByArcLength(route.samples, route.cumulativeLen, flyProgress);
    const ox = (flyRng() - 0.5) * 14;
    const oy = (flyRng() - 0.5) * 12;
    const { x, y } = pctToPx(head.x + ox * 0.08, head.y + oy * 0.08, w, h);
    const wingPulse = 0.5 + 0.5 * Math.sin(elapsed * 0.065 + i * 1.7);
    if (!isOnScreen(x, y, 32, w, h)) continue;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, 22);
    glow.addColorStop(0, `rgba(220, 255, 120, ${0.22 * wingPulse})`);
    glow.addColorStop(1, "rgba(120, 220, 40, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    drawFireflyHead(
      ctx,
      x,
      y,
      head.angle + (flyRng() - 0.5) * 40,
      pulse * wingPulse * 1.15,
      elapsed + i * 140,
    );
  }
}

function drawFireflyHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  pulse: number,
  elapsed: number,
) {
  const rad = (angleDeg * Math.PI) / 180;
  const wing = 0.55 + 0.45 * Math.sin(elapsed * 0.065);
  const bob = Math.sin(elapsed * 0.028) * 2.5;
  const scale = 1.05 + pulse * 0.22;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(rad);

  const glow = ctx.createRadialGradient(0, 1, 0, 0, 1, 16 * scale);
  glow.addColorStop(0, `rgba(220, 255, 120, ${0.55 * wing})`);
  glow.addColorStop(0.45, `rgba(180, 255, 80, ${0.28 * wing})`);
  glow.addColorStop(1, "rgba(120, 220, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 1, 16 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(210, 255, 140, ${0.35 + wing * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(-5 * scale, -7 * wing, 9 * scale, 4.5 * scale, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-5 * scale, 9 * wing, 9 * scale, 4.5 * scale, 0.5, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(-5, 0, 5, 0);
  bodyGrad.addColorStop(0, "rgba(40, 50, 30, 0.9)");
  bodyGrad.addColorStop(0.55, "rgba(255, 245, 160, 0.95)");
  bodyGrad.addColorStop(1, "rgba(40, 50, 30, 0.85)");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.5 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const lantern = ctx.createRadialGradient(1.5, 0, 0, 1.5, 0, 4.5 * scale);
  lantern.addColorStop(0, `rgba(255, 255, 200, ${0.95 * wing})`);
  lantern.addColorStop(0.5, `rgba(255, 240, 100, ${0.75 * wing})`);
  lantern.addColorStop(1, "rgba(200, 255, 60, 0)");
  ctx.fillStyle = lantern;
  ctx.beginPath();
  ctx.arc(1.5, 0, 4 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSatelliteHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pulse: number,
  elapsed: number,
) {
  const bob = Math.sin(elapsed * 0.016) * 2;
  const yb = y + bob;
  const scale = 1 + pulse * 0.08;

  ctx.save();
  ctx.translate(x, yb);

  ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
  ctx.fillRect(-7 * scale, -4 * scale, 14 * scale, 8 * scale);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-7 * scale, -4 * scale, 14 * scale, 8 * scale);

  ctx.fillStyle = "rgba(96, 165, 250, 0.55)";
  ctx.fillRect(-22 * scale, -2.5 * scale, 14 * scale, 5 * scale);
  ctx.fillRect(8 * scale, -2.5 * scale, 14 * scale, 5 * scale);
  ctx.strokeStyle = "rgba(191, 219, 254, 0.8)";
  ctx.strokeRect(-22 * scale, -2.5 * scale, 14 * scale, 5 * scale);
  ctx.strokeRect(8 * scale, -2.5 * scale, 14 * scale, 5 * scale);

  const dishGrad = ctx.createRadialGradient(0, 5, 0, 0, 5, 6);
  dishGrad.addColorStop(0, "rgba(248, 250, 252, 0.9)");
  dishGrad.addColorStop(1, "rgba(148, 163, 184, 0.2)");
  ctx.fillStyle = dishGrad;
  ctx.beginPath();
  ctx.arc(0, 5, 5 * scale, 0, Math.PI, false);
  ctx.fill();

  ctx.restore();

  const glow = ctx.createRadialGradient(x, yb, 0, x, yb, 18);
  glow.addColorStop(0, "rgba(191, 219, 254, 0.35)");
  glow.addColorStop(1, "rgba(59, 130, 246, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, yb, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawRocketHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  pulse: number,
  elapsed: number,
) {
  const rad = (angleDeg * Math.PI) / 180;
  const flicker = 0.85 + 0.15 * Math.sin(elapsed * 0.045);
  const tailX = x - Math.cos(rad) * 8;
  const tailY = y - Math.sin(rad) * 8;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  const bodyGrad = ctx.createLinearGradient(-8, 0, 10, 0);
  bodyGrad.addColorStop(0, "rgba(180, 190, 200, 0.9)");
  bodyGrad.addColorStop(0.5, "rgba(240, 244, 248, 0.95)");
  bodyGrad.addColorStop(1, "rgba(255, 255, 255, 0.98)");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-6, -4.5);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-6, 4.5);
  ctx.closePath();
  ctx.fill();

  const flameLen = (14 + pulse * 8) * flicker;
  const flameGrad = ctx.createLinearGradient(-8, 0, -8 - flameLen, 0);
  flameGrad.addColorStop(0, "rgba(255, 255, 220, 0.95)");
  flameGrad.addColorStop(0.35, "rgba(255, 160, 40, 0.85)");
  flameGrad.addColorStop(0.7, "rgba(255, 70, 10, 0.55)");
  flameGrad.addColorStop(1, "rgba(255, 40, 0, 0)");
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-8 - flameLen, -3.5 * flicker);
  ctx.lineTo(-8 - flameLen * 0.7, 0);
  ctx.lineTo(-8 - flameLen, 3.5 * flicker);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  const exhaustGrad = ctx.createRadialGradient(tailX, tailY, 0, tailX, tailY, 16 * flicker);
  exhaustGrad.addColorStop(0, "rgba(255, 220, 120, 0.5)");
  exhaustGrad.addColorStop(1, "rgba(255, 80, 0, 0)");
  ctx.fillStyle = exhaustGrad;
  ctx.beginPath();
  ctx.arc(tailX, tailY, 16 * flicker, 0, Math.PI * 2);
  ctx.fill();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: PartyEffectType,
  pulse: number,
  angleDeg: number,
  elapsed: number,
) {
  if (type === "rocket") {
    drawRocketHead(ctx, x, y, angleDeg, pulse, elapsed);
    return;
  }
  if (type === "firefly") {
    drawFireflyHead(ctx, x, y, angleDeg, pulse, elapsed);
    return;
  }
  if (type === "satellite") {
    drawSatelliteHead(ctx, x, y, pulse, elapsed);
    return;
  }

  let inner = 5;
  let outer = 18;
  let innerColor = "rgba(255, 255, 255, 0.95)";
  let midColor = "rgba(255, 180, 80, 0.55)";
  let outerColor = "rgba(255, 120, 40, 0)";

  switch (type) {
    case "comet":
      inner = 4;
      outer = 22;
      innerColor = "rgba(255, 255, 255, 0.98)";
      midColor = "rgba(255, 230, 150, 0.5)";
      outerColor = "rgba(120, 180, 255, 0)";
      break;
    case "ufo": {
      inner = 5;
      outer = 16 + pulse * 5;
      const wobbleX = Math.sin(elapsed * 0.018) * 3;
      const wobbleY = Math.cos(elapsed * 0.014) * 2;
      x += wobbleX;
      y += wobbleY;
      innerColor = "rgba(220, 255, 240, 0.92)";
      midColor = "rgba(74, 222, 128, 0.42)";
      outerColor = "rgba(34, 197, 94, 0)";
      const scale = 1 + pulse * 0.1;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, outer * scale);
      grad.addColorStop(0, innerColor);
      grad.addColorStop(0.4, midColor);
      grad.addColorStop(1, outerColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, outer * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200, 255, 220, 0.85)";
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(134, 239, 172, ${0.4 + pulse * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 16 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case "meteor":
      inner = 7;
      outer = 24;
      innerColor = "rgba(255, 255, 240, 0.95)";
      midColor = "rgba(255, 100, 30, 0.65)";
      outerColor = "rgba(255, 60, 0, 0)";
      break;
  }

  const scale = 1 + pulse * 0.12;
  const r = outer * scale;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.35, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = innerColor;
  ctx.beginPath();
  ctx.arc(x, y, inner * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: DrawParticle[], w: number, h: number) {
  for (const p of particles) {
    if (p.alpha <= 0.01) continue;
    const glowR = p.glow ? p.size * 2.5 : p.size;
    if (!isOnScreen(p.x, p.y, glowR, w, h)) continue;
    if (p.glow) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
      g.addColorStop(0, hsl(p.hue, p.sat, p.light, p.alpha));
      g.addColorStop(1, hsl(p.hue, p.sat, p.light, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = hsl(p.hue, p.sat, p.light, p.alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawTravelFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  type: PartyEffectType,
  effectId: string,
  route: TravelRoute,
  elapsed: number,
  durationMs: number,
  destX: number,
  destY: number,
) {
  clearTravelCanvas(ctx, canvas);
  if (elapsed <= 0) return;

  const progress = progressFromElapsed(elapsed, durationMs, type);
  const head = interpolateByArcLength(route.samples, route.cumulativeLen, progress);
  const headPx = pctToPx(head.x, head.y, w, h);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.012);

  if (type === "lightning") {
    const stormProgress = Math.min(1, elapsed / durationMs);
    const storm = getLightningStorm(effectId, destX, destY, w, h);
    drawLightningStorm(ctx, storm, stormProgress, w, h);
    return;
  }

  drawTraveledRibbon(ctx, route, progress, w, h, type);

  const spawnCount = Math.min(Math.floor(elapsed / SPAWN_MS), Math.ceil(durationMs / SPAWN_MS));
  const firstSpawn = Math.max(0, spawnCount - TRAIL_SPAWNS);
  const particles: DrawParticle[] = [];

  for (let k = firstSpawn; k < spawnCount; k++) {
    const age = elapsed - k * SPAWN_MS;
    const p = spawnTrailParticle(effectId, type, k, route, durationMs, w, h, age);
    if (p) particles.push(p);
  }

  if (type === "rocket" && progress > 0.08) {
    const sputterCount = 3 + Math.floor(Math.sin(elapsed * 0.03) * 2 + 2);
    for (let s = 0; s < sputterCount; s++) {
      const rng = createSeededRng(`${effectId}:sp${Math.floor(elapsed / 40)}:${s}`);
      const rad = (head.angle * Math.PI) / 180;
      const back = 12 + rng() * 18;
      const { x, y } = pctToPx(
        head.x - Math.cos(rad) * back * 0.12 + (rng() - 0.5) * 2,
        head.y - Math.sin(rad) * back * 0.12 + (rng() - 0.5) * 2,
        w,
        h,
      );
      particles.push({
        x,
        y,
        size: 2 + rng() * 5,
        alpha: 0.45 + rng() * 0.4,
        hue: rng() > 0.4 ? 20 + rng() * 30 : 0,
        sat: 90,
        light: 55 + rng() * 25,
        glow: true,
      });
    }
  }

  if (type === "firefly" && progress > 0.08) {
    const sparkleCount = 2 + Math.floor(Math.sin(elapsed * 0.04) * 2 + 2);
    for (let s = 0; s < sparkleCount; s++) {
      const rng = createSeededRng(`${effectId}:ff${Math.floor(elapsed / 40)}:${s}`);
      const rad = (head.angle * Math.PI) / 180;
      const back = 5 + rng() * 10;
      const { x, y } = pctToPx(
        head.x - Math.cos(rad) * back * 0.09 + (rng() - 0.5) * 3,
        head.y - Math.sin(rad) * back * 0.09 + (rng() - 0.5) * 3,
        w,
        h,
      );
      particles.push({
        x,
        y,
        size: 1 + rng() * 2.5,
        alpha: 0.35 + rng() * 0.5,
        hue: 68 + rng() * 42,
        sat: 75 + rng() * 25,
        light: 62 + rng() * 28,
        glow: true,
      });
    }
  }

  if (type === "satellite" && progress > 0.65) {
    const destPx = pctToPx(destX * 100, destY * 100, w, h);
    const beamAlpha = Math.min(1, (progress - 0.65) / 0.25) * 0.35;
    ctx.save();
    const beamGrad = ctx.createLinearGradient(headPx.x, headPx.y, destPx.x, destPx.y);
    beamGrad.addColorStop(0, `rgba(191, 219, 254, ${beamAlpha})`);
    beamGrad.addColorStop(1, `rgba(96, 165, 250, ${beamAlpha * 1.4})`);
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headPx.x, headPx.y);
    ctx.lineTo(destPx.x, destPx.y);
    ctx.stroke();
    ctx.restore();
  }

  if (type === "ufo") {
    const destPx = pctToPx(destX * 100, destY * 100, w, h);
    drawUfoScanBeam(ctx, headPx, destPx, progress, elapsed);
    particles.push(
      ...spawnBeamParticles(effectId, durationMs, elapsed, progress, headPx, destPx),
    );
  }

  drawParticles(ctx, particles, w, h);

  if (type === "firefly" && progress > 0.01) {
    drawFireflySwarm(ctx, effectId, route, progress, elapsed, w, h, pulse);
  } else {
    const showHead =
      type === "rocket"
        ? progress < 0.98
        : progress < 0.995;
    if (showHead && isOnScreen(headPx.x, headPx.y, type === "meteor" ? 22 : 24, w, h)) {
      drawHead(ctx, headPx.x, headPx.y, type, pulse, head.angle, elapsed);
    }
  }
}

export function drawCrashBurst(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  destX: number,
  destY: number,
  approachAngleDeg: number,
  effectId: string,
  elapsed: number,
  type: "comet" | "meteor" | "lightning",
) {
  clearTravelCanvas(ctx, canvas);
  const t = Math.min(1, elapsed / CRASH_BURST_MS);
  const cx = destX * w;
  const cy = destY * h;
  const rad = (approachAngleDeg * Math.PI) / 180;
  const particles: DrawParticle[] = [];
  const isElectric = type === "lightning";

  const flashAlpha = (1 - t) * (1 - t) * (isElectric ? 0.98 : 0.85);
  if (flashAlpha > 0.02) {
    if (isElectric) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.18})`;
      ctx.fillRect(0, 0, w, h);
    }
    const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 + t * (isElectric ? 120 : 80));
    flash.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
    flash.addColorStop(
      0.35,
      isElectric
        ? `rgba(147, 197, 253, ${flashAlpha * 0.75})`
        : type === "meteor"
          ? `rgba(255, 120, 30, ${flashAlpha * 0.7})`
          : `rgba(180, 220, 255, ${flashAlpha * 0.65})`,
    );
    flash.addColorStop(1, isElectric ? "rgba(59, 130, 246, 0)" : "rgba(255, 80, 0, 0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, cy, 40 + t * 80, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isElectric) {
    drawLightningImpactForks(ctx, cx, cy, effectId, t);
  }

  const sparkCount = isElectric ? 28 : type === "meteor" ? 32 : 26;
  for (let i = 0; i < sparkCount; i++) {
    const rng = createSeededRng(`${effectId}:crash${i}`);
    const forward = rng() > (isElectric ? 0.25 : 0.35);
    const spread = (rng() - 0.5) * (forward ? (isElectric ? 1.2 : 0.9) : 2.4);
    const ang = rad + spread + (forward ? 0 : Math.PI);
    const speed = forward ? 0.35 + rng() * (isElectric ? 0.65 : 0.55) : 0.15 + rng() * 0.35;
    const dist = t * speed * (type === "meteor" ? 220 : isElectric ? 200 : 180);
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist;
    const life = Math.max(0, 1 - t * (0.8 + rng() * 0.4));
    particles.push({
      x: px,
      y: py,
      size: (2 + rng() * (type === "meteor" ? 6 : 4)) * life,
      alpha: life * (0.4 + rng() * 0.5),
      hue: isElectric ? 195 + rng() * 40 : type === "meteor" ? 12 + rng() * 28 : 40 + rng() * 30,
      sat: isElectric ? 75 + rng() * 25 : type === "meteor" ? 95 : 80,
      light: 52 + rng() * 30,
      glow: rng() > 0.3,
    });
  }

  for (let r = 0; r < 3; r++) {
    const ringT = Math.max(0, t - r * 0.08);
    const ringR = ringT * (90 + r * 35);
    const ringAlpha = Math.max(0, (1 - ringT) * 0.55);
    if (ringAlpha <= 0.01) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = isElectric
      ? `rgba(147, 197, 253, ${ringAlpha})`
      : type === "meteor"
        ? `rgba(255, 140, 50, ${ringAlpha})`
        : `rgba(200, 230, 255, ${ringAlpha})`;
    ctx.lineWidth = 3 - r * 0.6;
    ctx.stroke();
  }

  drawParticles(ctx, particles, w, h);
}

export function clearTravelCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
