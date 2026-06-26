const MAX_EFFECTS = 80;
const EFFECT_TTL_MS = 90_000;

/** @type {Array<{ id: string, type: string, x: number, y: number, at: number, by?: string, reactor?: object }>} */
let effects = [];
let publishEffect = null;

export function setPartyEffectPublisher(publisher) {
  publishEffect = typeof publisher === "function" ? publisher : null;
}

export function notifyPartyEffect(effect) {
  try {
    publishEffect?.(effect);
  } catch {
    /* Keep effect storage independent from live delivery failures. */
  }
}

function pruneEffects(now = Date.now()) {
  effects = effects.filter((e) => now - e.at < EFFECT_TTL_MS);
  if (effects.length > MAX_EFFECTS) {
    effects = effects.slice(-MAX_EFFECTS);
  }
}

export function pushEffect(type, x, y, by, reactor, extra = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const effect = { id, type, x, y, at: Date.now(), by, ...extra };
  if (reactor) effect.reactor = reactor;
  effects.push(effect);
  pruneEffects();
  return effect;
}

export function listPartyEffectsSince(sinceMs = 0) {
  const since = Number(sinceMs) || 0;
  const now = Date.now();
  pruneEffects(now);
  return effects.filter((e) => e.at >= since);
}

/** Server-only: logo-anchored celebration when a registered user levels up */
export function pushLevelUpEffect({ userId, level, displayName }) {
  const effect = pushEffect("level_up", 0.5, 0.5, `system:level_up:${userId}`, null, {
    levelUpLevel: level,
    levelUpUserId: String(userId),
    levelUpDisplayName: displayName ? String(displayName).slice(0, 64) : null,
  });
  notifyPartyEffect(effect);
  return effect;
}
