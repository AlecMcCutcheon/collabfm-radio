import { createSeededRng } from "../utils/partyEffectSeed";
import type { PetProp, PetScene, PetSceneDef } from "./partyPetTypes";

const HEART_RISE_MS = 1700;

function prop(
  emoji: string,
  angleDeg: number,
  anim: PetProp["anim"],
  delayMs: number,
  durationMs: number,
  rimFraction: number,
  scale = 1,
  mirror = false,
): PetProp {
  return { emoji, angleDeg, rimFraction, anim, delayMs, durationMs, scale, mirror };
}

function buildScene(
  props: PetProp[],
  heartSpecs: Array<{ emoji: string; angleDeg: number; staggerMs: number; rimFraction?: number }>,
): PetSceneDef {
  const lastPropEnd = props.reduce((max, p) => Math.max(max, p.delayMs + p.durationMs), 0);
  const heartPhaseStartMs = lastPropEnd + 350;
  const hearts: PetProp[] = heartSpecs.map((h) => ({
    emoji: h.emoji,
    angleDeg: h.angleDeg,
    rimFraction: h.rimFraction ?? 0.28,
    anim: "heart-rise",
    delayMs: heartPhaseStartMs + h.staggerMs,
    durationMs: HEART_RISE_MS,
    scale: 1,
  }));
  const totalMs =
    heartPhaseStartMs +
    Math.max(...heartSpecs.map((h) => h.staggerMs), 0) +
    HEART_RISE_MS +
    450;
  return { props, hearts, heartPhaseStartMs, totalMs };
}

const defaultHearts = (base = 0) => [
  { emoji: "❤️", angleDeg: -95, staggerMs: base, rimFraction: 0.24 },
  { emoji: "💕", angleDeg: -70, staggerMs: base + 100, rimFraction: 0.2 },
  { emoji: "💖", angleDeg: -110, staggerMs: base + 200, rimFraction: 0.2 },
  { emoji: "❤️", angleDeg: -85, staggerMs: base + 320, rimFraction: 0.3 },
  { emoji: "💗", angleDeg: -100, staggerMs: base + 420, rimFraction: 0.16 },
  { emoji: "✨", angleDeg: -78, staggerMs: base + 520, rimFraction: 0.32 },
];

/** 10 affection variants — more than standard reactions */
export const PET_SCENE_BANK: PetSceneDef[] = [
  buildScene(
    [
      prop("🤚", -90, "pat-in", 0, 520, 1.14, 1.15),
      prop("🤚", -90, "pat-in", 400, 480, 1.14, 1.1),
      prop("🫳", -135, "rub-side", 760, 580, 1.1),
      prop("🫳", -45, "rub-side", 940, 580, 1.1, 1, true),
    ],
    defaultHearts(),
  ),
  buildScene(
    [
      prop("🤚", 180, "cheek-rub", 0, 680, 1.12, 1.05),
      prop("🤚", 0, "cheek-rub", 200, 680, 1.12, 1.05, true),
      prop("😘", -90, "kiss-peck", 760, 440, 1.08, 1.1),
      prop("😘", -118, "kiss-peck", 960, 400, 1.1, 0.95),
      prop("😘", -62, "kiss-peck", 1120, 400, 1.1, 0.95, true),
    ],
    [
      { emoji: "💋", angleDeg: -88, staggerMs: 0, rimFraction: 0.22 },
      { emoji: "❤️", angleDeg: -102, staggerMs: 120, rimFraction: 0.18 },
      { emoji: "💕", angleDeg: -74, staggerMs: 240, rimFraction: 0.18 },
      { emoji: "💖", angleDeg: -92, staggerMs: 380, rimFraction: 0.26 },
    ],
  ),
  buildScene(
    [
      prop("🤚", -90, "pat-in", 0, 480, 1.16, 1.2),
      prop("🤚", -125, "pat-in", 340, 460, 1.12, 1.05),
      prop("🤚", -55, "pat-in", 580, 460, 1.12, 1.05, true),
      prop("👆", -90, "scratch", 900, 560, 1.06, 0.95),
      prop("👆", -138, "scratch", 1060, 500, 1.08, 0.9),
      prop("👆", -42, "scratch", 1200, 500, 1.08, 0.9, true),
    ],
    defaultHearts(70),
  ),
  buildScene(
    [
      prop("🐾", -90, "pat-in", 0, 420, 1.13, 0.92),
      prop("🐾", 158, "rub-side", 300, 540, 1.1, 0.88),
      prop("🐾", -158, "rub-side", 500, 540, 1.1, 0.88, true),
      prop("🤚", -90, "scratch", 840, 620, 1.08, 1.1),
      prop("💅", 142, "scratch", 1000, 520, 1.1, 0.85),
      prop("💅", -142, "scratch", 1140, 520, 1.1, 0.85, true),
    ],
    [
      { emoji: "❤️", angleDeg: -90, staggerMs: 0, rimFraction: 0.22 },
      { emoji: "🐾", angleDeg: -75, staggerMs: 110, rimFraction: 0.3 },
      { emoji: "💕", angleDeg: -105, staggerMs: 220, rimFraction: 0.3 },
      { emoji: "❤️", angleDeg: -92, staggerMs: 340, rimFraction: 0.14 },
      { emoji: "✨", angleDeg: -82, staggerMs: 460, rimFraction: 0.34 },
    ],
  ),
  buildScene(
    [
      prop("😘", -90, "kiss-peck", 0, 400, 1.07, 1.05),
      prop("💋", -120, "kiss-peck", 280, 380, 1.11, 0.95),
      prop("💋", -60, "kiss-peck", 440, 380, 1.11, 0.95, true),
      prop("🤚", -90, "pat-in", 720, 500, 1.15, 1.1),
      prop("😽", -90, "nose-boop", 1140, 360, 1.05, 1),
    ],
    [
      { emoji: "💋", angleDeg: -86, staggerMs: 0, rimFraction: 0.2 },
      { emoji: "❤️", angleDeg: -98, staggerMs: 100, rimFraction: 0.24 },
      { emoji: "💕", angleDeg: -72, staggerMs: 200, rimFraction: 0.24 },
      { emoji: "😘", angleDeg: -94, staggerMs: 320, rimFraction: 0.12 },
      { emoji: "💖", angleDeg: -80, staggerMs: 440, rimFraction: 0.28 },
    ],
  ),
  buildScene(
    [
      prop("🤚", 180, "cheek-rub", 0, 720, 1.12, 1.08),
      prop("🤚", 0, "cheek-rub", 200, 720, 1.12, 1.08, true),
      prop("🫳", -90, "pat-in", 820, 520, 1.15, 1.15),
      prop("🫳", -90, "pat-in", 1220, 480, 1.15, 1.1),
    ],
    defaultHearts(90),
  ),
  buildScene(
    [
      prop("👋", -90, "pat-in", 0, 440, 1.16, 1.15),
      prop("🤚", -152, "rub-side", 320, 560, 1.11),
      prop("🤚", -28, "rub-side", 500, 560, 1.11, 1, true),
      prop("👆", -90, "scratch", 780, 600, 1.07, 0.95),
      prop("👆", -122, "scratch", 960, 480, 1.09, 0.88),
      prop("👆", -58, "scratch", 1100, 480, 1.09, 0.88, true),
      prop("😘", -90, "kiss-peck", 1340, 380, 1.06, 1.05),
    ],
    defaultHearts(50),
  ),
  buildScene(
    [
      prop("🤚", -110, "pat-in", 0, 460, 1.12, 1.05),
      prop("🤚", -70, "pat-in", 240, 460, 1.12, 1.05, true),
      prop("🤚", -90, "pat-in", 500, 500, 1.15, 1.2),
      prop("🐾", 172, "nose-boop", 860, 340, 1.1, 0.92),
      prop("🐾", -172, "nose-boop", 1020, 340, 1.1, 0.92, true),
      prop("🫳", -90, "cheek-rub", 1220, 580, 1.1, 1),
    ],
    [
      { emoji: "❤️", angleDeg: -92, staggerMs: 0, rimFraction: 0.16 },
      { emoji: "🐾", angleDeg: -78, staggerMs: 110, rimFraction: 0.28 },
      { emoji: "💕", angleDeg: -106, staggerMs: 220, rimFraction: 0.28 },
      { emoji: "❤️", angleDeg: -88, staggerMs: 340, rimFraction: 0.1 },
      { emoji: "💖", angleDeg: -96, staggerMs: 460, rimFraction: 0.22 },
      { emoji: "✨", angleDeg: -84, staggerMs: 560, rimFraction: 0.32 },
    ],
  ),
  buildScene(
    [
      prop("🤚", -90, "pat-in", 0, 520, 1.14, 1.15),
      prop("💋", -128, "kiss-peck", 420, 420, 1.1, 0.95),
      prop("💋", -52, "kiss-peck", 580, 420, 1.1, 0.95, true),
      prop("🤚", 180, "scratch", 860, 640, 1.12, 1.05),
      prop("🤚", 0, "scratch", 1020, 640, 1.12, 1.05, true),
      prop("😘", -90, "kiss-peck", 1320, 400, 1.07, 1.08),
    ],
    defaultHearts(110),
  ),
  buildScene(
    [
      prop("🫳", -90, "pat-in", 0, 480, 1.14, 1.1),
      prop("🫳", -138, "rub-side", 300, 520, 1.11),
      prop("🫳", -42, "rub-side", 460, 520, 1.11, 1, true),
      prop("👆", -90, "scratch", 740, 660, 1.06, 0.92),
      prop("🤚", -115, "cheek-rub", 980, 600, 1.11, 1.02),
      prop("🤚", -65, "cheek-rub", 1140, 600, 1.11, 1.02, true),
      prop("😘", -90, "nose-boop", 1420, 340, 1.05, 1.05),
      prop("💋", -95, "kiss-peck", 1600, 360, 1.04, 0.92),
    ],
    [
      { emoji: "❤️", angleDeg: -90, staggerMs: 0, rimFraction: 0.14 },
      { emoji: "💕", angleDeg: -75, staggerMs: 90, rimFraction: 0.22 },
      { emoji: "💕", angleDeg: -105, staggerMs: 180, rimFraction: 0.22 },
      { emoji: "💖", angleDeg: -88, staggerMs: 280, rimFraction: 0.08 },
      { emoji: "❤️", angleDeg: -98, staggerMs: 380, rimFraction: 0.2 },
      { emoji: "💋", angleDeg: -82, staggerMs: 500, rimFraction: 0.26 },
      { emoji: "✨", angleDeg: -92, staggerMs: 600, rimFraction: 0.3 },
    ],
  ),
];

export const PET_MAX_DURATION_MS = Math.max(...PET_SCENE_BANK.map((s) => s.totalMs));

export function getPetScene(effectId: string, petVariant?: number): PetScene {
  const variant =
    petVariant != null && petVariant >= 0 && petVariant < PET_SCENE_BANK.length
      ? petVariant
      : Math.floor(createSeededRng(`${effectId}:pet`)() * PET_SCENE_BANK.length);
  const picked = PET_SCENE_BANK[variant]!;
  return { ...picked, variant };
}

export function getPetHeartsForVariant(variant: number): PetProp[] {
  const scene = PET_SCENE_BANK[variant] ?? PET_SCENE_BANK[0]!;
  const phaseStart = scene.heartPhaseStartMs;
  return scene.hearts.map((h) => ({
    ...h,
    delayMs: h.delayMs - phaseStart,
  }));
}

export function getPetPhaseDurationMs(variant: number): number {
  return PET_SCENE_BANK[variant]?.heartPhaseStartMs ?? PET_SCENE_BANK[0]!.heartPhaseStartMs;
}

export function getPetHeartsDurationMs(variant: number): number {
  const scene = PET_SCENE_BANK[variant] ?? PET_SCENE_BANK[0]!;
  const phaseStart = scene.heartPhaseStartMs;
  const maxEnd = scene.hearts.reduce(
    (max, h) => Math.max(max, h.delayMs - phaseStart + h.durationMs),
    0,
  );
  return maxEnd + 450;
}

export function petVariantCount(): number {
  return PET_SCENE_BANK.length;
}

export function petPropPoint(
  logo: { left: number; top: number; width: number; height: number },
  item: PetProp,
): { x: number; y: number; rotateDeg: number } {
  const cx = logo.left + logo.width / 2;
  const cy = logo.top + logo.height / 2;
  const r = (logo.width / 2) * item.rimFraction;
  const rad = (item.angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
    rotateDeg: item.angleDeg + 90,
  };
}
