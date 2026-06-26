import type { PartyEffectType } from "../types/api";
import { createSeededRng } from "../utils/partyEffectSeed";

export const FIREWORK_STYLES = ["chrysanthemum", "palm", "ring", "willow", "crossette"] as const;
export type FireworkStyle = (typeof FIREWORK_STYLES)[number];

export interface SpotEffectTheme {
  id: string;
  palette: string[];
  flashColors?: string[];
  heartColors?: string[];
  starGlyphs?: string[];
  noteGlyphs?: string[];
  bubbleHue?: { min: number; max: number };
  fireworkStyles?: readonly FireworkStyle[];
  confettiMode?: "mixed" | "rect" | "round" | "streamer";
  coreGlow?: string;
  flashGradient?: string;
}

const CLASSIC_PALETTE = [
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#ff85c0",
  "#c084fc",
  "#ff9f43",
  "#54e6ff",
];

const DEFAULT_THEME: SpotEffectTheme = {
  id: "classic",
  palette: CLASSIC_PALETTE,
  flashColors: ["#ffffff", "#ffd56a", "#ff85c0", "#54e6ff", "#c084fc"],
  heartColors: ["#ff6b9d", "#ff4d8d", "#ff85b3", "#e84393", "#fd79a8"],
  starGlyphs: ["★", "✦", "✧", "✶", "⋆"],
  noteGlyphs: ["♪", "♫", "♬", "♩", "🎵", "🎶"],
  bubbleHue: { min: 0, max: 360 },
};

export const SPOT_EFFECT_THEME_BANKS: Partial<Record<PartyEffectType, SpotEffectTheme[]>> = {
  fireworks: [
    DEFAULT_THEME,
    {
      id: "ice",
      palette: ["#e0f2fe", "#7dd3fc", "#38bdf8", "#a5f3fc", "#ffffff", "#bae6fd", "#0ea5e9"],
      flashColors: ["#ffffff", "#e0f2fe", "#7dd3fc", "#38bdf8"],
      fireworkStyles: ["ring", "willow", "chrysanthemum"],
      coreGlow: "#e0f2fe",
      flashGradient:
        "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.45) 45%, transparent 75%)",
    },
    {
      id: "gold",
      palette: ["#fff7cc", "#ffd56a", "#ffb347", "#ff8c42", "#ffffff", "#fbbf24", "#f59e0b"],
      flashColors: ["#ffffff", "#fff7cc", "#ffd56a", "#ffb347"],
      fireworkStyles: ["palm", "willow", "crossette"],
      coreGlow: "#ffd56a",
      flashGradient:
        "radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,213,106,0.5) 45%, transparent 75%)",
    },
    {
      id: "neon",
      palette: ["#ff00ff", "#00ffff", "#ffff00", "#7c3aed", "#22d3ee", "#f472b6", "#a3e635"],
      flashColors: ["#ffffff", "#00ffff", "#ff00ff", "#ffff00"],
      fireworkStyles: ["crossette", "ring", "chrysanthemum"],
      coreGlow: "#00ffff",
      flashGradient:
        "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(0,255,255,0.4) 40%, rgba(255,0,255,0.25) 65%, transparent 80%)",
    },
    {
      id: "emerald",
      palette: ["#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#ffffff", "#4ade80", "#bbf7d0"],
      flashColors: ["#ffffff", "#a7f3d0", "#34d399", "#6ee7b7"],
      fireworkStyles: ["palm", "chrysanthemum", "willow"],
      coreGlow: "#6ee7b7",
    },
    {
      id: "pastel",
      palette: ["#fecdd3", "#fde68a", "#bfdbfe", "#ddd6fe", "#bbf7d0", "#fbcfe8", "#fed7aa"],
      flashColors: ["#ffffff", "#fecdd3", "#bfdbfe", "#ddd6fe"],
      fireworkStyles: ["chrysanthemum", "ring"],
      coreGlow: "#fecdd3",
    },
    {
      id: "ruby",
      palette: ["#fecaca", "#f87171", "#ef4444", "#fca5a5", "#ffffff", "#fb7185", "#fda4af"],
      flashColors: ["#ffffff", "#fecaca", "#f87171", "#fda4af"],
      fireworkStyles: ["crossette", "palm", "ring"],
      coreGlow: "#f87171",
    },
  ],
  confetti: [
    { id: "classic", palette: CLASSIC_PALETTE, confettiMode: "mixed" },
    {
      id: "metallic",
      palette: ["#e2e8f0", "#cbd5e1", "#ffd56a", "#fbbf24", "#94a3b8", "#ffffff", "#fcd34d"],
      confettiMode: "rect",
    },
    {
      id: "candy",
      palette: ["#f9a8d4", "#c4b5fd", "#93c5fd", "#fde68a", "#bbf7d0", "#fda4af", "#fdba74"],
      confettiMode: "round",
    },
    {
      id: "tropical",
      palette: ["#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#fb923c", "#a3e635", "#ffffff"],
      confettiMode: "streamer",
    },
    {
      id: "mono",
      palette: ["#ffffff", "#e2e8f0", "#94a3b8", "#475569", "#1e293b", "#cbd5e1", "#f8fafc"],
      confettiMode: "rect",
    },
    {
      id: "pride",
      palette: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"],
      confettiMode: "mixed",
    },
  ],
  shockwave: [
    DEFAULT_THEME,
    {
      id: "electric",
      palette: ["#22d3ee", "#38bdf8", "#a5f3fc", "#ffffff", "#0ea5e9", "#67e8f9"],
      flashColors: ["#ffffff", "#a5f3fc", "#22d3ee", "#38bdf8"],
    },
    {
      id: "inferno",
      palette: ["#ff6b35", "#ff9f1c", "#ffd56a", "#ffffff", "#ef4444", "#f97316"],
      flashColors: ["#ffffff", "#ffd56a", "#ff6b35", "#ff9f1c"],
    },
    {
      id: "cosmic",
      palette: ["#c084fc", "#a78bfa", "#818cf8", "#ffffff", "#e879f9", "#6366f1"],
      flashColors: ["#ffffff", "#e9d5ff", "#c084fc", "#818cf8"],
    },
    {
      id: "mint",
      palette: ["#6ee7b7", "#34d399", "#a7f3d0", "#ffffff", "#10b981", "#bbf7d0"],
      flashColors: ["#ffffff", "#a7f3d0", "#34d399", "#6ee7b7"],
    },
  ],
  hearts: [
    {
      id: "classic",
      palette: CLASSIC_PALETTE,
      heartColors: ["#ff6b9d", "#ff4d8d", "#ff85b3", "#e84393", "#fd79a8"],
    },
    {
      id: "crimson",
      palette: ["#ef4444", "#dc2626", "#f87171", "#fca5a5", "#fecaca"],
      heartColors: ["#ef4444", "#dc2626", "#f87171", "#ff6b6b", "#e11d48"],
    },
    {
      id: "lavender",
      palette: ["#e9d5ff", "#c084fc", "#a78bfa", "#f0abfc", "#ddd6fe"],
      heartColors: ["#e879f9", "#c084fc", "#a78bfa", "#f0abfc", "#d946ef"],
    },
    {
      id: "gold",
      palette: ["#ffd56a", "#fbbf24", "#fcd34d", "#fff7cc", "#ffffff"],
      heartColors: ["#fbbf24", "#f59e0b", "#fcd34d", "#ffd56a", "#fde68a"],
    },
    {
      id: "ocean",
      palette: ["#38bdf8", "#0ea5e9", "#22d3ee", "#67e8f9", "#bae6fd"],
      heartColors: ["#38bdf8", "#0ea5e9", "#22d3ee", "#7dd3fc", "#06b6d4"],
    },
  ],
  lasers: [
    { id: "disco", palette: CLASSIC_PALETTE },
    {
      id: "ultraviolet",
      palette: ["#c084fc", "#a855f7", "#e879f9", "#818cf8", "#6366f1", "#ffffff"],
    },
    {
      id: "carnival",
      palette: ["#ff00ff", "#00ffff", "#ffff00", "#ff6b6b", "#54e6ff", "#ffd93d"],
    },
    {
      id: "ice",
      palette: ["#67e8f9", "#22d3ee", "#38bdf8", "#a5f3fc", "#ffffff", "#0ea5e9"],
    },
    {
      id: "lava",
      palette: ["#ff6b35", "#ef4444", "#ffd56a", "#ff9f1c", "#ffffff", "#f97316"],
    },
  ],
  bubbles: [
    { id: "rainbow", palette: CLASSIC_PALETTE, bubbleHue: { min: 0, max: 360 } },
    { id: "ocean", palette: ["#0ea5e9", "#38bdf8", "#22d3ee", "#67e8f9"], bubbleHue: { min: 185, max: 220 } },
    { id: "sunset", palette: ["#fb923c", "#f472b6", "#fbbf24", "#fda4af"], bubbleHue: { min: 10, max: 45 } },
    { id: "candy", palette: ["#f9a8d4", "#c4b5fd", "#93c5fd"], bubbleHue: { min: 280, max: 330 } },
    { id: "aurora", palette: ["#6ee7b7", "#34d399", "#a78bfa", "#22d3ee"], bubbleHue: { min: 140, max: 200 } },
  ],
  stars: [
    {
      id: "classic",
      palette: CLASSIC_PALETTE,
      starGlyphs: ["★", "✦", "✧", "✶", "⋆"],
    },
    {
      id: "gold",
      palette: ["#ffd56a", "#fbbf24", "#fcd34d", "#fff7cc", "#ffffff", "#fde68a"],
      starGlyphs: ["★", "✦", "✶", "⋆", "🌟"],
    },
    {
      id: "silver",
      palette: ["#e2e8f0", "#cbd5e1", "#94a3b8", "#ffffff", "#f8fafc", "#bae6fd"],
      starGlyphs: ["✦", "✧", "⋆", "✶", "★"],
    },
    {
      id: "neon",
      palette: ["#ff00ff", "#00ffff", "#ffff00", "#7c3aed", "#22d3ee", "#f472b6"],
      starGlyphs: ["★", "✦", "✧", "🌟", "⋆"],
    },
    {
      id: "sparkle",
      palette: ["#ffffff", "#fde68a", "#fbcfe8", "#bfdbfe", "#ddd6fe", "#bbf7d0"],
      starGlyphs: ["✨", "★", "✦", "⋆", "✧"],
    },
  ],
  notes: [
    {
      id: "classic",
      palette: CLASSIC_PALETTE,
      noteGlyphs: ["♪", "♫", "♬", "♩", "🎵", "🎶"],
    },
    {
      id: "jazz",
      palette: ["#ffd56a", "#fbbf24", "#1e293b", "#475569", "#ffffff", "#fcd34d"],
      noteGlyphs: ["♪", "♫", "♩", "🎷", "🎺", "🎶"],
    },
    {
      id: "neon-pop",
      palette: ["#ff00ff", "#00ffff", "#ffff00", "#7c3aed", "#22d3ee", "#f472b6"],
      noteGlyphs: ["🎵", "🎶", "♪", "♫", "♬", "♩"],
    },
    {
      id: "classical",
      palette: ["#1e293b", "#334155", "#64748b", "#ffffff", "#cbd5e1", "#94a3b8"],
      noteGlyphs: ["♪", "♫", "♩", "♬", "♭", "♯"],
    },
    {
      id: "dance",
      palette: ["#c084fc", "#a855f7", "#f472b6", "#22d3ee", "#fbbf24", "#ffffff"],
      noteGlyphs: ["🎵", "🎶", "♫", "♪", "🎧", "🎤"],
    },
  ],
};

export function getSpotEffectTheme(type: PartyEffectType, effectId: string): SpotEffectTheme {
  const bank = SPOT_EFFECT_THEME_BANKS[type];
  if (!bank?.length) return DEFAULT_THEME;
  const rng = createSeededRng(`${effectId}:spot-theme`);
  return bank[Math.floor(rng() * bank.length)]!;
}

export function pickThemedFireworkStyle(
  seed: string,
  theme: SpotEffectTheme,
): FireworkStyle {
  const pool = theme.fireworkStyles?.length ? theme.fireworkStyles : FIREWORK_STYLES;
  const rng = createSeededRng(`${seed}-fwstyle`);
  return pool[Math.floor(rng() * pool.length)]!;
}
