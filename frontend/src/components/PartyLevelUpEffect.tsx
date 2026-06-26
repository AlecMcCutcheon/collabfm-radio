import type { PartyEffect } from "../types/api";
import {
  LEVEL_UP_BADGE_DELAY_MS,
  LEVEL_UP_BADGE_DURATION_MS,
  LEVEL_UP_ORBIT_PROPS,
  levelUpPropPoint,
} from "../config/partyLevelUpScene";
import { usePartyPetLogoRect } from "./PartyPetEffect";
import { staggeredDelayMs } from "../utils/partyEffectPlayback";
import {
  PARTY_EFFECTS_LEVEL_UP_BADGE_Z,
  PARTY_EFFECTS_LEVEL_UP_Z,
} from "../utils/partyEffectsZIndex";

export { LEVEL_UP_DURATION_MS } from "../config/partyLevelUpScene";

interface PartyLevelUpEffectProps {
  effect: PartyEffect;
}

export function PartyLevelUpEffect({ effect }: PartyLevelUpEffectProps) {
  const logo = usePartyPetLogoRect(effect);
  const cx = logo.left + logo.width / 2;
  const cy = logo.top + logo.height / 2;
  const badgeTop = cy - logo.height * 0.62;
  const level = effect.levelUpLevel ?? 1;
  const name = effect.levelUpDisplayName?.trim();

  return (
    <>
      <style>{`
        @keyframes party-level-coin-burst {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--lvl-rot)) scale(0.2); }
          18% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--lvl-rot)) scale(var(--lvl-scale)); }
          55% { transform: translate(calc(-50% + var(--lvl-dx)), calc(-50% + var(--lvl-dy))) rotate(calc(var(--lvl-rot) + 24deg)) scale(calc(var(--lvl-scale) * 1.08)); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--lvl-dx) * 1.4), calc(-50% + var(--lvl-dy) * 1.4 - 28px)) rotate(calc(var(--lvl-rot) + 48deg)) scale(calc(var(--lvl-scale) * 0.85)); }
        }
        @keyframes party-level-star-spin {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg) scale(0.3); }
          20% { opacity: 1; transform: translate(-50%, -50%) rotate(90deg) scale(var(--lvl-scale)); }
          60% { transform: translate(calc(-50% + var(--lvl-dx) * 0.6), calc(-50% + var(--lvl-dy) * 0.6)) rotate(220deg) scale(var(--lvl-scale)); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--lvl-dx)), calc(-50% + var(--lvl-dy) - 36px)) rotate(320deg) scale(calc(var(--lvl-scale) * 0.7)); }
        }
        @keyframes party-level-badge-in {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.55); }
          22% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
          38% { transform: translate(-50%, -50%) scale(1); }
          78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 12px)) scale(0.92); }
        }
        .party-level-up-prop {
          position: fixed;
          pointer-events: none;
          z-index: ${PARTY_EFFECTS_LEVEL_UP_Z};
          font-size: 1.5rem;
          line-height: 1;
          opacity: 0;
          filter: drop-shadow(0 2px 10px rgba(251, 191, 36, 0.45));
          animation-fill-mode: both;
          animation-timing-function: ease-out;
        }
        .party-level-up-prop--coin { animation-name: party-level-coin-burst; }
        .party-level-up-prop--star { animation-name: party-level-star-spin; font-size: 1.35rem; }
        .party-level-up-badge {
          position: fixed;
          pointer-events: none;
          z-index: ${PARTY_EFFECTS_LEVEL_UP_BADGE_Z};
          transform: translate(-50%, -50%);
          opacity: 0;
          animation-fill-mode: both;
          animation-timing-function: ease-out;
          text-align: center;
          min-width: 7rem;
        }
        .party-level-up-badge-inner {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
          padding: 0.35rem 0.75rem;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.92));
          border: 1px solid rgba(254, 243, 199, 0.65);
          box-shadow: 0 4px 22px rgba(251, 191, 36, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.2);
        }
        .party-level-up-title {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #1c1917;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .party-level-up-name {
          font-size: 0.65rem;
          font-weight: 600;
          color: rgba(28, 25, 23, 0.82);
          max-width: 9rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <div
        className="party-level-up-badge"
        style={{
          left: cx,
          top: badgeTop,
          animation: `party-level-badge-in ${LEVEL_UP_BADGE_DURATION_MS}ms ease-out ${staggeredDelayMs(effect, LEVEL_UP_BADGE_DELAY_MS)} both`,
        }}
        aria-live="polite"
      >
        <div className="party-level-up-badge-inner">
          <span className="party-level-up-title">Level {level}!</span>
          {name ? <span className="party-level-up-name">{name}</span> : null}
        </div>
      </div>

      {LEVEL_UP_ORBIT_PROPS.map((item, i) => {
        const pt = levelUpPropPoint(logo, item);
        const towardCenterX = cx - pt.x;
        const towardCenterY = cy - pt.y;
        const len = Math.hypot(towardCenterX, towardCenterY) || 1;
        const burstPx = 18;
        const dx = (-towardCenterX / len) * burstPx;
        const dy = (-towardCenterY / len) * burstPx;
        const scale = item.scale ?? 1;
        const isStar = item.anim === "star-spin";

        return (
          <span
            key={`${effect.id}-${i}-${item.emoji}`}
            className={`party-level-up-prop ${isStar ? "party-level-up-prop--star" : "party-level-up-prop--coin"}`}
            style={{
              left: pt.x,
              top: pt.y,
              animationDuration: `${item.durationMs}ms`,
              animationDelay: staggeredDelayMs(effect, item.delayMs),
              ["--lvl-rot" as string]: `${pt.rotateDeg}deg`,
              ["--lvl-scale" as string]: String(scale),
              ["--lvl-dx" as string]: `${dx}px`,
              ["--lvl-dy" as string]: `${dy}px`,
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

export function isLevelUpEffectType(type: string): boolean {
  return type === "level_up";
}
