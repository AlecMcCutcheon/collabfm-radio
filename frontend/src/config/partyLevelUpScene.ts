export type LevelUpAnim = "coin-burst" | "star-spin";

export interface LevelUpProp {
  emoji: string;
  angleDeg: number;
  rimFraction: number;
  anim: LevelUpAnim;
  delayMs: number;
  durationMs: number;
  scale?: number;
}

/** Coins and stars burst around the radio logo rim */
export const LEVEL_UP_ORBIT_PROPS: LevelUpProp[] = [
  { emoji: "🪙", angleDeg: 0, rimFraction: 1.2, anim: "coin-burst", delayMs: 0, durationMs: 1500, scale: 1.15 },
  { emoji: "🪙", angleDeg: 45, rimFraction: 1.16, anim: "coin-burst", delayMs: 60, durationMs: 1500, scale: 1.05 },
  { emoji: "⭐", angleDeg: 90, rimFraction: 1.22, anim: "star-spin", delayMs: 120, durationMs: 1600, scale: 1.1 },
  { emoji: "🪙", angleDeg: 135, rimFraction: 1.14, anim: "coin-burst", delayMs: 180, durationMs: 1500 },
  { emoji: "✨", angleDeg: 180, rimFraction: 1.2, anim: "star-spin", delayMs: 100, durationMs: 1700, scale: 1.2 },
  { emoji: "🪙", angleDeg: 225, rimFraction: 1.18, anim: "coin-burst", delayMs: 240, durationMs: 1500, scale: 1.08 },
  { emoji: "💫", angleDeg: 270, rimFraction: 1.24, anim: "star-spin", delayMs: 160, durationMs: 1650, scale: 1.12 },
  { emoji: "🪙", angleDeg: 315, rimFraction: 1.15, anim: "coin-burst", delayMs: 300, durationMs: 1500 },
  { emoji: "🌟", angleDeg: -45, rimFraction: 1.1, anim: "star-spin", delayMs: 220, durationMs: 1800, scale: 0.95 },
  { emoji: "🎉", angleDeg: -90, rimFraction: 1.08, anim: "coin-burst", delayMs: 350, durationMs: 1400, scale: 1.05 },
  { emoji: "✨", angleDeg: -135, rimFraction: 1.12, anim: "star-spin", delayMs: 280, durationMs: 1600 },
  { emoji: "🪙", angleDeg: -22, rimFraction: 1.26, anim: "coin-burst", delayMs: 400, durationMs: 1500, scale: 1.1 },
];

export const LEVEL_UP_BADGE_DELAY_MS = 180;
export const LEVEL_UP_BADGE_DURATION_MS = 3200;
export const LEVEL_UP_DURATION_MS = 3600;

export function levelUpPropPoint(
  logo: { left: number; top: number; width: number; height: number },
  item: LevelUpProp,
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
