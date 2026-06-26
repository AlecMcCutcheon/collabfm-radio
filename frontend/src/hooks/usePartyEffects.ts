import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { GuestContext, PartyEffect, PartyEffectType, ProfilePartyEffectType } from "../types/api";
import { profileReactionDurationMs, isProfileReactionEffectType } from "../config/profilePartyReactions";
import { PARTY_REACTION_MS } from "../components/PartyReactionEffect";
import { getTravelCompletionMs, getTravelDurationMs } from "../components/PartyTravelEffect";
import { isPetEffectType, isPetHeartsEffectType } from "../components/PartyPetEffect";
import { isLevelUpEffectType, LEVEL_UP_DURATION_MS } from "../components/PartyLevelUpEffect";
import { getPetPhaseDurationMs, getPetHeartsDurationMs } from "../config/partyPetScenes";
import {
  PARTY_CHILL_BUBBLE_MS,
  pickPartyChillMessage,
  type PartyChillBubble,
} from "../utils/partyChillMessages";
import { sortEffectsByAt, withBatchStagger } from "../utils/partyEffectPlayback";
import { subscribeLiveEvent } from "../utils/liveEvents";

const POLL_MS = 5000;
const POLL_SINCE_OVERLAP_MS = 15_000;
const POLL_BACKOFF_MAX_MS = 30_000;
const TRIGGER_COOLDOWN_MS = 400;
const DEFAULT_PLAY_MS = 4500;
/** Ignore client/server clock skew when accepting polled effects. */
const CLOCK_SKEW_MS = 60_000;

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function effectLifetimeMs(type: PartyEffectType, effect?: PartyEffect): number {
  const travel = getTravelDurationMs(type);
  if (travel > 0) return getTravelCompletionMs(type) + 400;
  if (isPetEffectType(type)) {
    return getPetPhaseDurationMs(effect?.petVariant ?? 0) + 400;
  }
  if (isPetHeartsEffectType(type)) {
    return getPetHeartsDurationMs(effect?.petVariant ?? 0) + 400;
  }
  if (isLevelUpEffectType(type)) return LEVEL_UP_DURATION_MS + 400;
  if (isProfileReactionEffectType(type)) return profileReactionDurationMs(type) + 1200;
  if (type.startsWith("react_")) return PARTY_REACTION_MS + 1200;
  return DEFAULT_PLAY_MS;
}

function effectVisibleMs(type: PartyEffectType, effect?: PartyEffect): number {
  const stagger = effect?.playbackStaggerMs ?? 0;
  return effectLifetimeMs(type, effect) + stagger;
}

export function usePartyEffects(active: boolean, shareToken?: string) {
  const [effects, setEffects] = useState<PartyEffect[]>([]);
  const [chillBubbles, setChillBubbles] = useState<PartyChillBubble[]>([]);
  const sinceRef = useRef(Date.now());
  const seenRef = useRef(new Set<string>());
  const chillActiveRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const pollBackoffMsRef = useRef(0);
  const lastTriggerAtRef = useRef(0);
  const schedulePollRef = useRef<(delayMs: number) => void>(() => {});
  const liveConnectedRef = useRef(false);

  const ingest = useCallback((incoming: PartyEffect[], advanceSince = false) => {
    if (!incoming.length) return;
    const now = Date.now();
    setEffects((prev) => {
      const next = [...prev];
      const sorted = sortEffectsByAt(incoming);
      const accepted: PartyEffect[] = [];
      let maxIncomingAt = 0;
      for (const effect of sorted) {
        if (seenRef.current.has(effect.id)) continue;
        const ageMs = now - effect.at;
        if (ageMs < -CLOCK_SKEW_MS) continue;
        const maxAgeMs = effectLifetimeMs(effect.type, effect) + POLL_MS * 3;
        if (ageMs >= maxAgeMs) continue;
        seenRef.current.add(effect.id);
        accepted.push(effect);
        maxIncomingAt = Math.max(maxIncomingAt, effect.at);
      }
      const staged = advanceSince ? withBatchStagger(accepted) : accepted.map((e) => ({ ...e, playbackStaggerMs: 0 }));
      next.push(...staged);
      if (advanceSince && maxIncomingAt > 0) {
        sinceRef.current = Math.max(sinceRef.current, maxIncomingAt);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active) return;

    const joinAt = Date.now();
    sinceRef.current = joinAt;
    seenRef.current = new Set();
    setEffects([]);
    setChillBubbles([]);
    chillActiveRef.current = false;
    pollBackoffMsRef.current = 0;
    liveConnectedRef.current = false;

    let cancelled = false;
    let pollTimer: number | null = null;
    let unsubscribeLive: (() => void) | null = null;

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      if (liveConnectedRef.current) return;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => void runPoll(), delayMs);
    };
    schedulePollRef.current = schedulePoll;

    const runPoll = async () => {
      if (cancelled) return;

      if (!isPageVisible()) {
        schedulePoll(POLL_MS);
        return;
      }

      if (pollInFlightRef.current) {
        schedulePoll(POLL_MS);
        return;
      }

      pollInFlightRef.current = true;
      try {
        const since = Math.max(0, sinceRef.current - POLL_SINCE_OVERLAP_MS);
        const data = await api.partyEffects(since, shareToken);
        if (cancelled) return;

        if (data.rateLimited) {
          pollBackoffMsRef.current = Math.min(
            POLL_BACKOFF_MAX_MS,
            Math.max(POLL_MS, data.retryAfterMs || POLL_MS * 2),
          );
        } else {
          pollBackoffMsRef.current = 0;
          ingest(data.effects || [], true);
        }
      } catch {
        pollBackoffMsRef.current = Math.min(
          POLL_BACKOFF_MAX_MS,
          pollBackoffMsRef.current ? pollBackoffMsRef.current * 2 : POLL_MS * 2,
        );
      } finally {
        pollInFlightRef.current = false;
        if (!cancelled && !liveConnectedRef.current) {
          schedulePoll(POLL_MS + pollBackoffMsRef.current);
        }
      }
    };

    unsubscribeLive = subscribeLiveEvent(
      "party_effect",
      (event) => {
        try {
          const data = JSON.parse(event.data) as { effect?: PartyEffect };
          if (data.effect) ingest([data.effect], true);
        } catch {
          /* Ignore malformed stream messages and let the fallback poll catch up. */
        }
      },
      {
        since: Math.max(0, joinAt - POLL_SINCE_OVERLAP_MS),
        shareToken,
        onOpen: () => {
          liveConnectedRef.current = true;
          pollBackoffMsRef.current = 0;
          if (pollTimer != null) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
          }
        },
        onError: () => {
          liveConnectedRef.current = false;
          schedulePoll(POLL_MS);
        },
      },
    );

    schedulePoll(typeof EventSource !== "undefined" ? POLL_MS : 0);

    return () => {
      cancelled = true;
      liveConnectedRef.current = false;
      unsubscribeLive?.();
      if (pollTimer != null) window.clearTimeout(pollTimer);
    };
  }, [active, shareToken, ingest]);

  useEffect(() => {
    if (!effects.length) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setEffects((prev) =>
        prev.filter((e) => now - e.at < effectVisibleMs(e.type, e) + CLOCK_SKEW_MS),
      );
    }, 400);
    return () => window.clearInterval(id);
  }, [effects.length]);

  useEffect(() => {
    if (!chillBubbles.length) {
      chillActiveRef.current = false;
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      setChillBubbles((prev) => {
        const next = prev.filter((b) => now - b.at < PARTY_CHILL_BUBBLE_MS + 200);
        if (!next.length) chillActiveRef.current = false;
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [chillBubbles.length]);

  const spawnChillBubble = useCallback((x: number, y: number) => {
    if (chillActiveRef.current) return;
    chillActiveRef.current = true;
    const id = `chill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setChillBubbles([{ id, message: pickPartyChillMessage(), x, y, at: Date.now() }]);
  }, []);

  const trigger = useCallback(
    async (type: PartyEffect["type"], x: number, y: number, guest?: GuestContext) => {
      const now = Date.now();
      if (now - lastTriggerAtRef.current < TRIGGER_COOLDOWN_MS) {
        spawnChillBubble(x, y);
        return;
      }
      lastTriggerAtRef.current = now;

      try {
        const res = await api.triggerPartyEffect(type, x, y, guest);
        if (res.rateLimited) {
          spawnChillBubble(x, y);
          return;
        }
        if (res.effect) {
          ingest([res.effect]);
          if (!liveConnectedRef.current) schedulePollRef.current(200);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("401")) {
          spawnChillBubble(x, y);
        }
      }
    },
    [ingest, spawnChillBubble],
  );

  const triggerProfile = useCallback(
    async (
      type: ProfilePartyEffectType,
      x: number,
      y: number,
      target: { userId: string; avatarVariant?: number; coverIcon?: number },
      guest?: GuestContext,
    ) => {
      const now = Date.now();
      if (now - lastTriggerAtRef.current < TRIGGER_COOLDOWN_MS) {
        spawnChillBubble(x, y);
        return;
      }
      lastTriggerAtRef.current = now;

      try {
        const res = await api.triggerProfilePartyEffect(type, x, y, target, guest);
        if (res.rateLimited) {
          spawnChillBubble(x, y);
          return;
        }
        if (res.effect) {
          ingest([res.effect]);
          if (!liveConnectedRef.current) schedulePollRef.current(200);
        }
      } catch (err) {
        if (err instanceof Error && (err.message.includes("401") || err.message.includes("400"))) {
          spawnChillBubble(x, y);
        }
      }
    },
    [ingest, spawnChillBubble],
  );

  return { effects, chillBubbles, trigger, triggerProfile, ingest };
}

export { DEFAULT_PLAY_MS as PARTY_EFFECT_PLAY_MS };
