import { isRegisteredUserId, tryAwardStageShareXp } from "../db/userLevel.js";

/** How long the handoff target must stay DJ before the sharer earns XP */
export const STAGE_SHARE_HOLD_MS = 3 * 60 * 1000;

/** @type {Map<string, { timer: ReturnType<typeof setTimeout> }>} */
const pendingByPromoter = new Map();

let getBroadcastState = () => ({ broadcasterUserId: null, activeWsId: null });

export function setStageShareContext(ctx = {}) {
  if (typeof ctx.getBroadcastState === "function") {
    getBroadcastState = ctx.getBroadcastState;
  }
}

function clearAllPending() {
  for (const entry of pendingByPromoter.values()) {
    clearTimeout(entry.timer);
  }
  pendingByPromoter.clear();
}

function scheduleStageShareAward({
  promoterUserId,
  targetUserId,
  targetWsId,
  sharedAt,
}) {
  const key = String(promoterUserId);
  const existing = pendingByPromoter.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingByPromoter.delete(key);
    const state = getBroadcastState();
    if (String(state.broadcasterUserId ?? "") !== String(targetUserId)) return;
    tryAwardStageShareXp({
      promoterUserId: key,
      targetUserId: String(targetUserId),
      targetWsId: String(targetWsId),
      sharedAt,
    });
  }, STAGE_SHARE_HOLD_MS);

  pendingByPromoter.set(key, { timer });
}

/**
 * Called whenever active DJ changes (manual switch, take-back, admin override, auto-promote).
 * Cancels in-flight handoff timers unless this event starts a new voluntary share.
 */
export function onDjSwitch({
  initiatorUserId = null,
  previousBroadcasterUserId = null,
  newBroadcasterUserId = null,
  newWsId = null,
  wasCurrentBroadcaster = false,
} = {}) {
  clearAllPending();

  if (!wasCurrentBroadcaster) return;
  if (!initiatorUserId || !previousBroadcasterUserId || !newBroadcasterUserId || !newWsId) {
    return;
  }
  if (String(initiatorUserId) !== String(previousBroadcasterUserId)) return;
  if (String(newBroadcasterUserId) === String(initiatorUserId)) return;
  if (!isRegisteredUserId(initiatorUserId)) return;

  scheduleStageShareAward({
    promoterUserId: String(initiatorUserId),
    targetUserId: String(newBroadcasterUserId),
    targetWsId: String(newWsId),
    sharedAt: Date.now(),
  });
}
