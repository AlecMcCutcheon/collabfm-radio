import { useMemo } from "react";
import type { PartyEffect } from "../types/api";
import { getPetHeartsForVariant, getPetHeartsDurationMs, petPropPoint } from "../config/partyPetScenes";
import { usePartyPetLogoRect } from "./PartyPetEffect";
import { staggeredDelayMs } from "../utils/partyEffectPlayback";
import { PARTY_EFFECTS_PET_Z } from "../utils/partyEffectsZIndex";

export { getPetHeartsDurationMs as PARTY_PET_HEARTS_MS };

interface PartyPetHeartsEffectProps {
  effect: PartyEffect;
}

export function PartyPetHeartsEffect({ effect }: PartyPetHeartsEffectProps) {
  const logo = usePartyPetLogoRect(effect);
  const hearts = useMemo(
    () => getPetHeartsForVariant(effect.petVariant ?? 0),
    [effect.petVariant],
  );

  return (
    <>
      <style>{`
        @keyframes party-pet-heart-rise {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--pet-rot)) scale(0.35); }
          14% { opacity: 1; transform: translate(-50%, calc(-50% - 8px)) rotate(var(--pet-rot)) scale(var(--pet-scale)); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 78px)) rotate(var(--pet-rot)) scale(calc(var(--pet-scale) * 1.15)); }
        }
        .party-pet-heart {
          position: fixed;
          pointer-events: none;
          z-index: ${PARTY_EFFECTS_PET_Z};
          font-size: 1.35rem;
          line-height: 1;
          opacity: 0;
          filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35));
          animation-name: party-pet-heart-rise;
          animation-fill-mode: both;
          animation-timing-function: ease-in-out;
        }
      `}</style>
      {hearts.map((item, i) => {
        const pt = petPropPoint(logo, item);
        const scale = item.scale ?? 1;

        return (
          <span
            key={`${effect.id}-${i}-${item.emoji}`}
            className="party-pet-heart"
            style={{
              left: pt.x,
              top: pt.y,
              animationDuration: `${item.durationMs}ms`,
              animationDelay: staggeredDelayMs(effect, item.delayMs),
              ["--pet-rot" as string]: `${pt.rotateDeg}deg`,
              ["--pet-scale" as string]: String(scale),
            }}
            aria-hidden
          >
            {item.emoji}
          </span>
        );
      })}
    </>
  );
}
