import { useEffect, useMemo, useRef, useState } from "react";
import type { PartyEffect, PartyEffectType } from "../types/api";
import { TRAVEL_CONFIG } from "../config/partyEffectMenu";
import { buildTravelRoute } from "../utils/partyTravelPath";
import {
  CRASH_BURST_MS,
  clearTravelCanvas,
  drawCrashBurst,
  drawTravelFrame,
} from "../utils/travelParticles";
import { ArrivalBurst } from "./PartyEffectOverlay";

const ARRIVAL_BURST_MS: Record<"fireworks" | "shockwave" | "stars", number> = {
  fireworks: 3000,
  shockwave: 2000,
  stars: 2600,
};

/** Prevents arrival landing bursts from replaying if the travel component remounts. */
const consumedArrivalBursts = new Set<string>();
const startedArrivalBursts = new Set<string>();

function travelEndMs(durationMs: number, hasCrash: boolean): number {
  return durationMs + (hasCrash ? CRASH_BURST_MS : 0);
}

function isArrivalBurstConsumed(
  effectId: string,
  effectAt: number,
  durationMs: number,
  hasCrash: boolean,
  arrival: "fireworks" | "shockwave" | "stars" | null | undefined,
): boolean {
  if (consumedArrivalBursts.has(effectId)) return true;
  if (startedArrivalBursts.has(effectId)) return true;
  if (!arrival) return true;
  const travelDoneAt = effectAt + travelEndMs(durationMs, hasCrash);
  const burstDoneAt = travelDoneAt + ARRIVAL_BURST_MS[arrival];
  return Date.now() >= burstDoneAt;
}

function markArrivalBurstConsumed(effectId: string): void {
  consumedArrivalBursts.add(effectId);
}

interface PartyTravelEffectProps {
  effect: PartyEffect;
}

type Phase = "travel" | "crash" | "done";

export function PartyTravelEffect({ effect }: PartyTravelEffectProps) {
  const config = TRAVEL_CONFIG[effect.type];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasCrash =
    effect.type === "comet" || effect.type === "meteor" || effect.type === "lightning";
  const durationMs = config?.durationMs ?? 0;

  const [phase, setPhase] = useState<Phase>(() => {
    if (!config) return "done";
    const elapsed = Date.now() - effect.at;
    return elapsed >= travelEndMs(durationMs, hasCrash) ? "done" : "travel";
  });
  const [burstDone, setBurstDone] = useState(() =>
    isArrivalBurstConsumed(
      effect.id,
      effect.at,
      durationMs,
      hasCrash,
      config?.arrival,
    ),
  );
  const crashStartRef = useRef(0);

  const route = useMemo(
    () => buildTravelRoute(effect.id, effect.x, effect.y, effect.type),
    [effect.id, effect.type, effect.x, effect.y],
  );

  const arrivalKind =
    phase === "done" && config?.arrival && effect.type !== "rocket" && !burstDone
      ? config.arrival
      : null;

  useEffect(() => {
    if (!arrivalKind || burstDone) return;
    if (startedArrivalBursts.has(effect.id)) {
      setBurstDone(true);
      return;
    }
    startedArrivalBursts.add(effect.id);
    const id = window.setTimeout(() => {
      markArrivalBurstConsumed(effect.id);
      setBurstDone(true);
    }, ARRIVAL_BURST_MS[arrivalKind]);
    return () => window.clearTimeout(id);
  }, [arrivalKind, burstDone, effect.id]);

  useEffect(() => {
    if (!config || phase === "done") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      const elapsed = Date.now() - effect.at;
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (elapsed < config.durationMs) {
        drawTravelFrame(
          ctx,
          canvas,
          w,
          h,
          effect.type,
          effect.id,
          route,
          elapsed,
          config.durationMs,
          effect.x,
          effect.y,
        );
        raf = requestAnimationFrame(tick);
        return;
      }

      if (hasCrash) {
        if (!crashStartRef.current) {
          crashStartRef.current = effect.at + config.durationMs;
        }
        const crashElapsed = Date.now() - crashStartRef.current;
        if (crashElapsed < CRASH_BURST_MS) {
          drawCrashBurst(
            ctx,
            canvas,
            w,
            h,
            effect.x,
            effect.y,
            route.approachAngle,
            effect.id,
            crashElapsed,
            effect.type as "comet" | "meteor" | "lightning",
          );
          setPhase("crash");
          raf = requestAnimationFrame(tick);
          return;
        }
      }

      clearTravelCanvas(ctx, canvas);
      setPhase("done");
    };

    const elapsed = Date.now() - effect.at;
    if (elapsed >= config.durationMs + (hasCrash ? CRASH_BURST_MS : 0)) {
      clearTravelCanvas(ctx, canvas);
      setPhase("done");
    } else {
      if (elapsed >= config.durationMs && hasCrash) {
        crashStartRef.current = effect.at + config.durationMs;
        setPhase("crash");
      }
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      clearTravelCanvas(ctx, canvas);
    };
  }, [config, effect.at, effect.id, effect.type, effect.x, effect.y, route, hasCrash, phase]);

  if (!config) return null;

  if (phase === "done") {
    if (!arrivalKind) return null;
    return (
      <div className="party-effects-root absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <ArrivalBurst effect={effect} kind={arrivalKind} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

const TRAVEL_TYPES = new Set<PartyEffectType>([
  "rocket",
  "comet",
  "ufo",
  "meteor",
  "lightning",
  "firefly",
  "satellite",
]);

export function isTravelEffectType(type: PartyEffectType): boolean {
  return TRAVEL_TYPES.has(type);
}

export function getTravelDurationMs(type: PartyEffectType): number {
  const base = TRAVEL_CONFIG[type]?.durationMs ?? 0;
  if (type === "comet" || type === "meteor" || type === "lightning") return base + CRASH_BURST_MS;
  return base;
}

export function getTravelCompletionMs(type: PartyEffectType): number {
  const travel = getTravelDurationMs(type);
  if (!travel) return 0;
  const arrival = TRAVEL_CONFIG[type]?.arrival;
  if (!arrival) return travel;
  return travel + ARRIVAL_BURST_MS[arrival];
}
