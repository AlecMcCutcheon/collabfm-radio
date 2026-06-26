import type { PartyEffect } from "../types/api";

/** Stable render order when multiple effects overlap. */
export function sortEffectsByAt(effects: PartyEffect[]): PartyEffect[] {
  return [...effects].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Positive delay so batch-mates play in server trigger order, always from t=0. */
export function effectStaggerMs(effect: PartyEffect): number {
  return effect.playbackStaggerMs ?? 0;
}

export function effectStaggerStyle(effect: PartyEffect): Record<string, string> {
  const stagger = effectStaggerMs(effect);
  if (stagger <= 0) return {};
  return { "--effect-stagger": `${stagger}ms` };
}

/** CSS animation-delay: batch stagger + optional prop offset (ms). */
export function staggeredDelayMs(effect: PartyEffect, extraMs = 0): string {
  const stagger = effectStaggerMs(effect);
  if (stagger === 0 && extraMs === 0) return "0ms";
  if (extraMs === 0) return `${stagger}ms`;
  return `calc(var(--effect-stagger, 0ms) + ${extraMs}ms)`;
}

/** CSS animation-delay: batch stagger + optional prop offset (seconds). */
export function staggeredDelaySec(effect: PartyEffect, extraSec = 0): string {
  const stagger = effectStaggerMs(effect);
  if (stagger === 0 && extraSec === 0) return "0s";
  if (extraSec === 0) return `${stagger}ms`;
  return `calc(var(--effect-stagger, 0ms) + ${extraSec}s)`;
}

export function withBatchStagger(effects: PartyEffect[]): PartyEffect[] {
  if (effects.length <= 1) {
    return effects.map((e) => ({ ...e, playbackStaggerMs: 0 }));
  }
  const baseAt = Math.min(...effects.map((e) => e.at));
  return effects.map((e) => ({
    ...e,
    playbackStaggerMs: Math.max(0, e.at - baseAt),
  }));
}
