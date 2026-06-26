import { useLayoutEffect, useMemo, useState } from "react";
import type { PartyEffect } from "../types/api";
import { getPetScene, petPropPoint, getPetPhaseDurationMs } from "../config/partyPetScenes";
import type { PetProp } from "../config/partyPetTypes";
import { getRadioLogoRect, RADIO_LOGO_SELECTOR } from "../utils/radioLogoAnchor";
import { staggeredDelayMs } from "../utils/partyEffectPlayback";
import { PARTY_EFFECTS_PET_Z } from "../utils/partyEffectsZIndex";

export { getPetPhaseDurationMs as PARTY_PET_PHASE_MS };

interface LogoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function resolveLogoRect(fallback: PartyEffect): LogoRect {
  const rect = getRadioLogoRect();
  if (rect) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  return {
    left: fallback.x * window.innerWidth - 64,
    top: fallback.y * window.innerHeight - 64,
    width: 128,
    height: 128,
  };
}

export function usePartyPetLogoRect(effect: PartyEffect): LogoRect {
  const [logo, setLogo] = useState<LogoRect>(() => resolveLogoRect(effect));

  useLayoutEffect(() => {
    const sync = () => setLogo(resolveLogoRect(effect));
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const el = document.querySelector(RADIO_LOGO_SELECTOR);
    const observer = el ? new ResizeObserver(sync) : null;
    if (el && observer) observer.observe(el);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      observer?.disconnect();
    };
  }, [effect]);

  return logo;
}

function animClass(anim: PetProp["anim"]): string {
  return `party-pet-anim--${anim}`;
}

interface PartyPetEffectProps {
  effect: PartyEffect;
}

export function PartyPetEffect({ effect }: PartyPetEffectProps) {
  const logo = usePartyPetLogoRect(effect);
  const scene = useMemo(
    () => getPetScene(effect.id, effect.petVariant),
    [effect.id, effect.petVariant],
  );

  return (
    <>
      <style>{`
        @keyframes party-pet-pat-in {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.7); }
          15% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(var(--pet-scale)); }
          45% { transform: translate(calc(-50% + var(--pet-dx)), calc(-50% + var(--pet-dy))) rotate(calc(var(--pet-rot) - 6deg)) scale(var(--pet-scale)); }
          70% { transform: translate(calc(-50% + var(--pet-dx) * 0.5), calc(-50% + var(--pet-dy) * 0.5)) rotate(calc(var(--pet-rot) + 4deg)) scale(calc(var(--pet-scale) * 0.98)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 0.92)); }
        }
        @keyframes party-pet-rub-side {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.75); }
          12% { opacity: 1; }
          30% { transform: translate(calc(-50% + var(--pet-dx)), calc(-50% + var(--pet-dy))) rotate(calc(var(--pet-rot) + 8deg)) scale(var(--pet-scale)); }
          50% { transform: translate(calc(-50% - var(--pet-dx) * 0.6), calc(-50% - var(--pet-dy) * 0.4)) rotate(calc(var(--pet-rot) - 6deg)) scale(var(--pet-scale)); }
          72% { transform: translate(calc(-50% + var(--pet-dx) * 0.8), calc(-50% + var(--pet-dy) * 0.6)) rotate(calc(var(--pet-rot) + 5deg)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 0.9)); }
        }
        @keyframes party-pet-scratch {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.8); }
          10% { opacity: 1; }
          22% { transform: translate(calc(-50% + 4px), calc(-50% + 3px)) rotate(calc(var(--pet-rot) - 10deg)) scale(var(--pet-scale)); }
          34% { transform: translate(calc(-50% - 5px), calc(-50% - 2px)) rotate(calc(var(--pet-rot) + 12deg)) scale(var(--pet-scale)); }
          46% { transform: translate(calc(-50% + 5px), calc(-50% + 2px)) rotate(calc(var(--pet-rot) - 8deg)) scale(var(--pet-scale)); }
          58% { transform: translate(calc(-50% - 4px), calc(-50% + 3px)) rotate(calc(var(--pet-rot) + 10deg)) scale(var(--pet-scale)); }
          70% { transform: translate(calc(-50% + 3px), calc(-50% - 2px)) rotate(calc(var(--pet-rot) - 6deg)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 0.88)); }
        }
        @keyframes party-pet-kiss-peck {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.5); }
          18% { opacity: 1; transform: translate(calc(-50% + var(--pet-dx)), calc(-50% + var(--pet-dy))) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 1.12)); }
          42% { transform: translate(calc(-50% + var(--pet-dx) * 1.2), calc(-50% + var(--pet-dy) * 1.2)) rotate(var(--pet-rot)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 0.85)); }
        }
        @keyframes party-pet-nose-boop {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.6); }
          20% { opacity: 1; transform: translate(calc(-50% + var(--pet-dx)), calc(-50% + var(--pet-dy))) rotate(var(--pet-rot)) scale(var(--pet-scale)); }
          35% { transform: translate(calc(-50% + var(--pet-dx) * 1.35), calc(-50% + var(--pet-dy) * 1.35)) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 1.08)); }
          55% { transform: translate(calc(-50% + var(--pet-dx) * 0.6), calc(-50% + var(--pet-dy) * 0.6)) rotate(var(--pet-rot)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.8); }
        }
        @keyframes party-pet-cheek-rub {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.75); }
          12% { opacity: 1; }
          35% { transform: translate(calc(-50% + var(--pet-dx)), calc(-50% + var(--pet-dy))) rotate(calc(var(--pet-rot) + 12deg)) scale(var(--pet-scale)); }
          55% { transform: translate(calc(-50% + var(--pet-dx) * 0.3), calc(-50% + var(--pet-dy) * 0.5)) rotate(calc(var(--pet-rot) - 8deg)) scale(var(--pet-scale)); }
          75% { transform: translate(calc(-50% + var(--pet-dx) * 0.9), calc(-50% + var(--pet-dy) * 0.8)) rotate(calc(var(--pet-rot) + 6deg)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 0.9)); }
        }
        .party-pet-prop {
          position: fixed;
          pointer-events: none;
          z-index: ${PARTY_EFFECTS_PET_Z};
          font-size: 1.85rem;
          line-height: 1;
          opacity: 0;
          filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35));
          animation-fill-mode: both;
          animation-timing-function: ease-in-out;
        }
        .party-pet-anim--pat-in { animation-name: party-pet-pat-in; }
        .party-pet-anim--rub-side { animation-name: party-pet-rub-side; }
        .party-pet-anim--scratch { animation-name: party-pet-scratch; }
        .party-pet-anim--kiss-peck { animation-name: party-pet-kiss-peck; }
        .party-pet-anim--nose-boop { animation-name: party-pet-nose-boop; }
        .party-pet-anim--cheek-rub { animation-name: party-pet-cheek-rub; }
      `}</style>
      {scene.props.map((item, i) => {
        const pt = petPropPoint(logo, item);
        const cx = logo.left + logo.width / 2;
        const cy = logo.top + logo.height / 2;
        const towardCenterX = cx - pt.x;
        const towardCenterY = cy - pt.y;
        const len = Math.hypot(towardCenterX, towardCenterY) || 1;
        const patPx = 11;
        const dx = (towardCenterX / len) * patPx;
        const dy = (towardCenterY / len) * patPx;
        const scale = item.scale ?? 1;

        return (
          <span
            key={`${effect.id}-${i}-${item.emoji}`}
            className={`party-pet-prop ${animClass(item.anim)}`}
            style={{
              left: pt.x,
              top: pt.y,
              animationDuration: `${item.durationMs}ms`,
              animationDelay: staggeredDelayMs(effect, item.delayMs),
              ["--pet-rot" as string]: `${pt.rotateDeg}deg`,
              ["--pet-scale" as string]: String(scale),
              ["--pet-dx" as string]: `${dx}px`,
              ["--pet-dy" as string]: `${dy}px`,
            }}
            aria-hidden
          >
            <span style={{ display: "inline-block", transform: item.mirror ? "scaleX(-1)" : undefined }}>
              {item.emoji}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function isPetEffectType(type: string): boolean {
  return type === "react_pet";
}

export function isPetHeartsEffectType(type: string): boolean {
  return type === "react_pet_hearts";
}
