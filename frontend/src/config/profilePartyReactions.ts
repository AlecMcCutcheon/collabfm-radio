import type { ProfilePartyEffectType, RpsChoice } from "../types/api";
import { createSeededRng, pickSeeded } from "../utils/partyEffectSeed";

export const PROFILE_PARTY_REACTION_ITEMS: {
  type: ProfilePartyEffectType;
  label: string;
  icon: string;
}[] = [
  { type: "react_profile_party", label: "Party together", icon: "🎉" },
  { type: "react_profile_wave", label: "Wave", icon: "👋" },
  { type: "react_profile_highfive", label: "High five", icon: "🙌" },
  { type: "react_profile_rps", label: "Rock · Paper · Scissors", icon: "✊" },
];

export const PROFILE_REACTION_DURATION_MS = 6000;
export const PROFILE_RPS_DURATION_MS = 7000;

export function profileReactionDurationMs(type: string): number {
  return type === "react_profile_rps" ? PROFILE_RPS_DURATION_MS : PROFILE_REACTION_DURATION_MS;
}

export const RPS_CHOICE_EMOJI: Record<RpsChoice, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

export const RPS_CHOICE_LABEL: Record<RpsChoice, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};

/** Accent sparkles only — hands / impact emojis live on avatars or center column. */
export const PARTY_CONFETTI_EMOJI = ["✨", "⭐", "💫", "🎈", "🎊"];
export const WAVE_EXTRA_EMOJI = ["✨", "💫"];
export const HIGHFIVE_EXTRA_EMOJI = ["✨", "💥"];
export const RPS_EXTRA_EMOJI: readonly string[] = [];

export function isProfileReactionEffectType(type: string): type is ProfilePartyEffectType {
  return type.startsWith("react_profile_");
}

export interface ProfileReactionSparkle {
  emoji: string;
  corner: "top-left" | "top-right";
  delayMs: number;
  spin: number;
}

export function profileReactionSparkles(
  effectId: string,
  pool: readonly string[],
  count: number,
): ProfileReactionSparkle[] {
  if (!count || !pool.length) return [];
  const rng = createSeededRng(`${effectId}:sparkles`);
  return Array.from({ length: count }, (_, i) => ({
    emoji: pickSeeded(rng, [...pool]),
    corner: i % 2 === 0 ? "top-left" : "top-right",
    delayMs: 160 + Math.floor(rng() * 220) + i * 110,
    spin: Math.floor(rng() * 90) - 45,
  }));
}

/** @deprecated use profileReactionSparkles */
export function profileFloaterEmojis(
  effectId: string,
  pool: readonly string[],
  count: number,
  _side: "left" | "right" = "right",
): { emoji: string; ox: number; oy: number; delayMs: number; spin: number }[] {
  return profileReactionSparkles(effectId, pool, count).map((s, i) => ({
    emoji: s.emoji,
    ox: s.corner === "top-left" ? -72 - i * 8 : 72 + i * 8,
    oy: -56 - i * 6,
    delayMs: s.delayMs,
    spin: s.spin,
  }));
}
