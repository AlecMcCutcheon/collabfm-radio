import { useMemo } from "react";
import type { PartyEffect, ProfilePartyEffectType } from "../types/api";
import {
  HIGHFIVE_EXTRA_EMOJI,
  PARTY_CONFETTI_EMOJI,
  PROFILE_RPS_DURATION_MS,
  RPS_CHOICE_EMOJI,
  RPS_CHOICE_LABEL,
  RPS_EXTRA_EMOJI,
  WAVE_EXTRA_EMOJI,
  isProfileReactionEffectType,
  profileReactionSparkles,
  profileReactionDurationMs,
} from "../config/profilePartyReactions";
import { profileReactionPlacement } from "../utils/partyEffectPlacement";
import { effectStaggerStyle, staggeredDelayMs } from "../utils/partyEffectPlayback";
import { partyReactorAvatarSrc } from "../utils/partyReactorAvatar";
import { PARTY_EFFECTS_REACTION_Z } from "../utils/partyEffectsZIndex";

export { isProfileReactionEffectType };

interface PartyProfileReactionEffectProps {
  effect: PartyEffect;
  shareToken?: string;
}

const RING = {
  party: "linear-gradient(135deg, #f472b6, #a855f7, #38bdf8, #fbbf24)",
  wave: "linear-gradient(135deg, #38bdf8, #22d3ee, #a5f3fc)",
  highfive: "linear-gradient(135deg, #fbbf24, #f97316, #fb923c)",
  rps: "linear-gradient(135deg, #c084fc, #818cf8, #6366f1)",
};

function ringFor(type: ProfilePartyEffectType): string {
  if (type === "react_profile_party") return RING.party;
  if (type === "react_profile_wave") return RING.wave;
  if (type === "react_profile_highfive") return RING.highfive;
  return RING.rps;
}

function Sparkle({
  emoji,
  corner,
  delayMs,
  spin,
  ms,
  effect,
}: {
  emoji: string;
  corner: "top-left" | "top-right";
  delayMs: number;
  spin: number;
  ms: number;
  effect: PartyEffect;
}) {
  return (
    <span
      className={`party-profile-sparkle party-profile-sparkle--${corner}`}
      style={{
        ["--fspin" as string]: `${spin}deg`,
        animationDuration: `${ms}ms`,
        animationDelay: staggeredDelayMs(effect, delayMs),
      }}
    >
      {emoji}
    </span>
  );
}

export function PartyProfileReactionEffect({ effect, shareToken }: PartyProfileReactionEffectProps) {
  const type = effect.type as ProfilePartyEffectType;
  const ms = profileReactionDurationMs(type);
  const reactorSrc = effect.reactor ? partyReactorAvatarSrc(effect.reactor, 128, shareToken) : null;
  const targetSrc = effect.target ? partyReactorAvatarSrc(effect.target, 128, shareToken) : null;
  const duel = effect.profileDuel;
  const ring = ringFor(type);
  const reactorWins = duel?.outcome === "reactor";
  const targetWins = duel?.outcome === "target";
  const isTie = duel?.outcome === "tie";
  const isRps = type === "react_profile_rps";
  const isParty = type === "react_profile_party";
  const isWave = type === "react_profile_wave";
  const isHighfive = type === "react_profile_highfive";

  const placement = useMemo(
    () => profileReactionPlacement(effect.x, effect.y),
    [effect.x, effect.y],
  );

  const sparkles = useMemo(() => {
    if (isParty) return profileReactionSparkles(effect.id, PARTY_CONFETTI_EMOJI, 4);
    if (isWave) return profileReactionSparkles(effect.id, WAVE_EXTRA_EMOJI, 2);
    if (isHighfive) return profileReactionSparkles(effect.id, HIGHFIVE_EXTRA_EMOJI, 2);
    return profileReactionSparkles(effect.id, RPS_EXTRA_EMOJI, 0);
  }, [effect.id, isParty, isWave, isHighfive]);

  const staggerStyle = effectStaggerStyle(effect);
  const anchorStyle = {
    ...staggerStyle,
    position: "fixed" as const,
    left: `${effect.x * 100}vw`,
    top: `${effect.y * 100}vh`,
    transform: `translate(calc(-50% + ${placement.offsetPxX}px), calc(-50% + ${placement.offsetPxY}px))`,
    width: 0,
    height: 0,
    zIndex: PARTY_EFFECTS_REACTION_Z,
    pointerEvents: "none" as const,
  };

  const reactorSideClass = isParty
    ? "party-profile-side--party-dance-a"
    : isWave
      ? "party-profile-side--wave-a"
      : isHighfive
        ? "party-profile-side--hf-reactor"
        : "party-profile-side--rps-reactor";
  const targetSideClass = isParty
    ? "party-profile-side--party-dance-b"
    : isWave
      ? "party-profile-side--wave-b"
      : isHighfive
        ? "party-profile-side--hf-target"
        : "party-profile-side--rps-target";

  return (
    <>
      <style>{`
        .party-profile-stage {
          position: absolute;
          transform: translate(-50%, -48%);
          animation: party-profile-stage ${ms}ms cubic-bezier(0.14, 0.82, 0.28, 1) forwards;
        }
        .party-profile-duel {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 260px;
          padding: 4px 8px 0;
        }
        .party-profile-top {
          position: relative;
          width: 100%;
          height: 30px;
          margin-bottom: 2px;
          flex-shrink: 0;
        }
        .party-profile-sparkles {
          position: absolute;
          inset: 0 0 auto 0;
          height: 44px;
          pointer-events: none;
          z-index: 0;
        }
        .party-profile-sparkle {
          position: absolute;
          font-size: 1rem;
          line-height: 1;
          animation-name: party-profile-sparkle;
          animation-fill-mode: forwards;
          animation-timing-function: cubic-bezier(0.14, 0.82, 0.28, 1);
        }
        .party-profile-sparkle--top-left { left: 6%; top: 6px; }
        .party-profile-sparkle--top-right { right: 6%; top: 10px; }
        .party-profile-row {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 18px;
          width: 100%;
          z-index: 1;
        }
        .party-profile-mid {
          flex-shrink: 0;
          width: 40px;
          min-height: 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          align-self: center;
          position: relative;
        }
        .party-profile-mid-icon {
          font-size: 1.35rem;
          line-height: 1;
          animation: party-profile-mid-pop ${ms}ms ease-out forwards;
        }
        .party-profile-mid-vs {
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          color: rgba(255, 255, 255, 0.8);
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.65);
          animation: party-profile-mid-pop ${ms}ms ease-out forwards;
        }
        .party-profile-foot {
          margin-top: 14px;
          min-height: 20px;
          width: 100%;
          text-align: center;
          z-index: 1;
        }
        .party-profile-side {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 1;
          animation-duration: ${ms}ms;
          animation-fill-mode: forwards;
          animation-timing-function: cubic-bezier(0.12, 0.85, 0.25, 1);
        }
        .party-profile-side--party-dance-a { animation-name: party-profile-party-dance-a; }
        .party-profile-side--party-dance-b { animation-name: party-profile-party-dance-b; }
        .party-profile-side--wave-a { animation-name: party-profile-wave-a; }
        .party-profile-side--wave-b { animation-name: party-profile-wave-b; }
        .party-profile-side--hf-reactor { animation-name: party-profile-hf-reactor; }
        .party-profile-side--hf-target { animation-name: party-profile-hf-target; }
        .party-profile-side--rps-reactor { animation-name: party-profile-rps-reactor; }
        .party-profile-side--rps-target { animation-name: party-profile-rps-target; }

        .party-profile-avatar-wrap {
          width: 72px;
          height: 72px;
          border-radius: 9999px;
          padding: 3px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
        }
        .party-profile-avatar-wrap--win {
          animation: party-profile-win-pulse ${ms}ms ease-in-out forwards;
        }
        .party-profile-avatar-wrap--lose {
          animation: party-profile-lose-sag ${ms}ms ease-in-out forwards;
        }
        .party-profile-avatar {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          object-fit: cover;
          display: block;
          background: #1e293b;
        }
        .party-profile-vs {
          display: none;
        }
        .party-profile-hand {
          position: absolute;
          font-size: 1.75rem;
          line-height: 1;
          animation-duration: ${ms}ms;
          animation-fill-mode: forwards;
        }
        .party-profile-hand--left {
          right: calc(100% + 2px);
          left: auto;
          top: 50%;
          margin-top: 0;
          animation-name: party-profile-hand-wave-left;
          transform-origin: 80% 70%;
        }
        .party-profile-hand--right {
          left: calc(100% + 2px);
          right: auto;
          top: 50%;
          margin-top: 0;
          animation-name: party-profile-hand-wave-right;
          transform-origin: 20% 70%;
        }
        .party-profile-impact {
          position: relative;
          left: auto;
          top: auto;
          transform: none;
          font-size: 2rem;
          line-height: 1;
          animation: party-profile-impact ${ms}ms cubic-bezier(0.14, 0.82, 0.28, 1) forwards;
        }
        .party-profile-impact-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 18px;
          height: 18px;
          margin: -9px 0 0 -9px;
          border-radius: 9999px;
          border: 2px solid rgba(251, 191, 36, 0.85);
          animation: party-profile-impact-ring ${ms}ms ease-out forwards;
        }
        .party-profile-badge {
          position: absolute;
          top: -22px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 1.45rem;
          line-height: 1;
          animation-duration: ${ms}ms;
          animation-fill-mode: forwards;
        }
        .party-profile-badge--win { animation-name: party-profile-badge-win; }
        .party-profile-badge--lose { animation-name: party-profile-badge-lose; }
        .party-profile-badge--tie { animation-name: party-profile-badge-tie; }
        .party-profile-rps-countdown {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 1rem;
          font-weight: 800;
          color: #fff;
          text-shadow: 0 2px 8px rgba(0,0,0,0.6);
          animation-duration: ${ms}ms;
          animation-fill-mode: forwards;
        }
        .party-profile-rps-countdown--3 { animation-name: party-profile-cd-3; }
        .party-profile-rps-countdown--2 { animation-name: party-profile-cd-2; }
        .party-profile-rps-countdown--1 { animation-name: party-profile-cd-1; }
        .party-profile-rps-shake {
          position: absolute;
          top: 50%;
          font-size: 1.15rem;
          animation: party-profile-rps-shake ${ms}ms ease-in-out forwards;
        }
        .party-profile-rps-shake--left {
          right: calc(100% + 4px);
          left: auto;
        }
        .party-profile-rps-shake--right {
          left: calc(100% + 4px);
          right: auto;
        }
        .party-profile-rps-choice {
          margin-top: 8px;
          font-size: 2rem;
          line-height: 1;
          animation: party-profile-rps-choice ${ms}ms cubic-bezier(0.14, 0.82, 0.28, 1) forwards;
        }
        .party-profile-rps-choice--target {
          animation-delay: calc(var(--effect-stagger, 0ms) + 180ms);
        }
        .party-profile-rps-label {
          margin-top: 4px;
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65);
          animation: party-profile-rps-label ${ms}ms ease-out forwards;
        }
        .party-profile-rps-label--target {
          animation-delay: calc(var(--effect-stagger, 0ms) + 180ms);
        }
        .party-profile-caption {
          position: relative;
          left: auto;
          bottom: auto;
          transform: none;
          white-space: nowrap;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
          text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
          animation: party-profile-caption ${ms}ms ease-out forwards;
        }
        .party-profile-caption--rps {
          animation-name: party-profile-caption-rps;
        }
        .party-profile-root .party-profile-stage,
        .party-profile-root .party-profile-side,
        .party-profile-root .party-profile-mid-icon,
        .party-profile-root .party-profile-mid-vs,
        .party-profile-root .party-profile-hand,
        .party-profile-root .party-profile-impact,
        .party-profile-root .party-profile-impact-ring,
        .party-profile-root .party-profile-avatar-wrap--win,
        .party-profile-root .party-profile-avatar-wrap--lose,
        .party-profile-root .party-profile-badge,
        .party-profile-root .party-profile-rps-countdown,
        .party-profile-root .party-profile-rps-shake,
        .party-profile-root .party-profile-rps-choice:not(.party-profile-rps-choice--target),
        .party-profile-root .party-profile-rps-label:not(.party-profile-rps-label--target),
        .party-profile-root .party-profile-caption:not(.party-profile-caption--rps) {
          animation-delay: var(--effect-stagger, 0ms);
        }
        .party-profile-root .party-profile-rps-choice--target,
        .party-profile-root .party-profile-rps-label--target {
          animation-delay: calc(var(--effect-stagger, 0ms) + 180ms);
        }
        .party-profile-root .party-profile-caption--rps {
          animation-delay: var(--effect-stagger, 0ms);
        }

        @keyframes party-profile-mid-pop {
          0% { opacity: 0; transform: scale(0.4); }
          14% { opacity: 1; transform: scale(1.12); }
          22% { transform: scale(1); opacity: 1; }
          82% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.85); }
        }

        /* Stage: enter → hold → exit (opacity held 18%–82%) */
        @keyframes party-profile-stage {
          0% { opacity: 0; transform: translate(-50%, -38%) scale(0.55); }
          10% { opacity: 1; transform: translate(-50%, -48%) scale(1.06); }
          16% { opacity: 1; transform: translate(-50%, -48%) scale(1); }
          82% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          94% { opacity: 0.35; transform: translate(-50%, -54%) scale(0.96); }
          100% { opacity: 0; transform: translate(-50%, -58%) scale(0.9); }
        }

        @keyframes party-profile-party-dance-a {
          0% { transform: translateX(72px) scale(0.35) rotate(8deg); opacity: 0; }
          11% { transform: translateX(0) scale(1.08) rotate(-4deg); opacity: 1; }
          18% { transform: translateX(0) scale(1) rotate(0deg); opacity: 1; }
          26% { transform: translateY(-10px) rotate(-5deg) scale(1.04); opacity: 1; }
          34% { transform: translateY(2px) rotate(3deg) scale(0.98); opacity: 1; }
          42% { transform: translateY(-8px) rotate(-4deg) scale(1.03); opacity: 1; }
          50% { transform: translateY(0) rotate(4deg) scale(1); opacity: 1; }
          58% { transform: translateY(-9px) rotate(-3deg) scale(1.02); opacity: 1; }
          66% { transform: translateY(2px) rotate(2deg) scale(0.99); opacity: 1; }
          74% { transform: translateY(-6px) rotate(-2deg) scale(1.01); opacity: 1; }
          82% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          92% { transform: translateY(4px) scale(0.94); opacity: 0.4; }
          100% { transform: translateY(10px) scale(0.88); opacity: 0; }
        }
        @keyframes party-profile-party-dance-b {
          0% { transform: translateX(-72px) scale(0.35) rotate(-8deg); opacity: 0; }
          11% { transform: translateX(0) scale(1.08) rotate(4deg); opacity: 1; }
          18% { transform: translateX(0) scale(1) rotate(0deg); opacity: 1; }
          26% { transform: translateY(-8px) rotate(5deg) scale(1.04); opacity: 1; }
          34% { transform: translateY(2px) rotate(-3deg) scale(0.98); opacity: 1; }
          42% { transform: translateY(-10px) rotate(4deg) scale(1.03); opacity: 1; }
          50% { transform: translateY(0) rotate(-4deg) scale(1); opacity: 1; }
          58% { transform: translateY(-7px) rotate(3deg) scale(1.02); opacity: 1; }
          66% { transform: translateY(2px) rotate(-2deg) scale(0.99); opacity: 1; }
          74% { transform: translateY(-8px) rotate(2deg) scale(1.01); opacity: 1; }
          82% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          92% { transform: translateY(4px) scale(0.94); opacity: 0.4; }
          100% { transform: translateY(10px) scale(0.88); opacity: 0; }
        }

        @keyframes party-profile-wave-a {
          0% { transform: translateX(64px) scale(0.4); opacity: 0; }
          12% { transform: translateX(0) scale(1.05); opacity: 1; }
          18% { transform: translateX(0) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-wave-b {
          0% { transform: translateX(-64px) scale(0.4); opacity: 0; }
          12% { transform: translateX(0) scale(1.05); opacity: 1; }
          18% { transform: translateX(0) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-hand-wave-left {
          0%, 16% { opacity: 0; transform: translateY(-50%) rotate(-40deg) scale(0.2); }
          22% { opacity: 1; transform: translateY(-50%) rotate(12deg) scale(1.1); }
          30% { transform: translateY(-50%) rotate(-14deg) scale(1); }
          38% { transform: translateY(-50%) rotate(16deg) scale(1.05); }
          46% { transform: translateY(-50%) rotate(-10deg) scale(1); }
          54% { transform: translateY(-50%) rotate(12deg) scale(1.02); }
          62% { transform: translateY(-50%) rotate(-6deg) scale(1); }
          70% { transform: translateY(-50%) rotate(8deg) scale(1); }
          82% { opacity: 1; transform: translateY(-50%) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translateY(calc(-50% - 10px)) rotate(0deg) scale(0.8); }
        }
        @keyframes party-profile-hand-wave-right {
          0%, 28% { opacity: 0; transform: translateY(-50%) rotate(40deg) scale(0.2); }
          34% { opacity: 1; transform: translateY(-50%) rotate(-12deg) scale(1.1); }
          42% { transform: translateY(-50%) rotate(14deg) scale(1); }
          50% { transform: translateY(-50%) rotate(-16deg) scale(1.05); }
          58% { transform: translateY(-50%) rotate(10deg) scale(1); }
          66% { transform: translateY(-50%) rotate(-12deg) scale(1.02); }
          74% { transform: translateY(-50%) rotate(6deg) scale(1); }
          82% { opacity: 1; transform: translateY(-50%) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translateY(calc(-50% - 10px)) rotate(0deg) scale(0.8); }
        }

        @keyframes party-profile-hf-reactor {
          0% { transform: translateX(80px) scale(0.35); opacity: 0; }
          12% { transform: translateX(0) scale(1); opacity: 1; }
          18% { transform: translateX(0) scale(1); opacity: 1; }
          28% { transform: translateX(32px) scale(1.08); opacity: 1; }
          34% { transform: translateX(26px) scale(1.02); opacity: 1; }
          40% { transform: translateX(14px) scale(0.98); opacity: 1; }
          48% { transform: translateX(6px) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-hf-target {
          0% { transform: translateX(-80px) scale(0.35); opacity: 0; }
          12% { transform: translateX(0) scale(1); opacity: 1; }
          18% { transform: translateX(0) scale(1); opacity: 1; }
          28% { transform: translateX(-32px) scale(1.08); opacity: 1; }
          34% { transform: translateX(-26px) scale(1.02); opacity: 1; }
          40% { transform: translateX(-14px) scale(0.98); opacity: 1; }
          48% { transform: translateX(-6px) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-impact {
          0%, 24% { opacity: 0; transform: scale(0.15); }
          30% { opacity: 1; transform: scale(1.45); }
          38% { opacity: 1; transform: scale(1.08); }
          48% { opacity: 0.85; transform: scale(1); }
          82% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.7) translateY(-8px); }
        }
        @keyframes party-profile-impact-ring {
          0%, 28% { opacity: 0; transform: scale(0.2); }
          34% { opacity: 1; transform: scale(2.2); }
          44% { opacity: 0.6; transform: scale(3.2); }
          82% { opacity: 0.25; transform: scale(3.4); }
          100% { opacity: 0; transform: scale(4); }
        }

        @keyframes party-profile-rps-reactor {
          0% { transform: translateX(70px) scale(0.35); opacity: 0; }
          10% { transform: translateX(0) scale(1.05); opacity: 1; }
          16% { transform: translateX(0) scale(1); opacity: 1; }
          24%, 32% { transform: translateX(-3px) rotate(-4deg) scale(1); opacity: 1; }
          28%, 36% { transform: translateX(3px) rotate(4deg) scale(1); opacity: 1; }
          52% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-rps-target {
          0% { transform: translateX(-70px) scale(0.35); opacity: 0; }
          10% { transform: translateX(0) scale(1.05); opacity: 1; }
          16% { transform: translateX(0) scale(1); opacity: 1; }
          24%, 32% { transform: translateX(3px) rotate(4deg) scale(1); opacity: 1; }
          28%, 36% { transform: translateX(-3px) rotate(-4deg) scale(1); opacity: 1; }
          52% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
          82% { transform: translateX(0) scale(1); opacity: 1; }
          92% { opacity: 0.35; transform: translateX(0) scale(0.94); }
          100% { opacity: 0; transform: translateX(0) scale(0.88); }
        }
        @keyframes party-profile-rps-shake {
          0%, 18% { opacity: 0; transform: translateY(-50%) scale(0.3); }
          24% { opacity: 1; transform: translateY(-50%) scale(1); }
          30%, 38% { transform: translateY(-50%) rotate(-12deg) scale(1.05); opacity: 1; }
          34%, 42% { transform: translateY(-50%) rotate(12deg) scale(1.05); opacity: 1; }
          48% { opacity: 0; transform: translateY(-50%) scale(0.8); }
          100% { opacity: 0; }
        }
        @keyframes party-profile-cd-3 {
          0%, 18% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          22% { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          28% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          100% { opacity: 0; }
        }
        @keyframes party-profile-cd-2 {
          0%, 28% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          32% { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          38% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          100% { opacity: 0; }
        }
        @keyframes party-profile-cd-1 {
          0%, 38% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          42% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          48% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          100% { opacity: 0; }
        }
        @keyframes party-profile-rps-choice {
          0%, 48% { opacity: 0; transform: scale(0.15) rotate(-30deg); }
          54% { opacity: 1; transform: scale(1.25) rotate(8deg); }
          62% { transform: scale(1) rotate(0deg); opacity: 1; }
          82% { opacity: 1; transform: scale(1) rotate(0deg); }
          100% { opacity: 0; transform: scale(0.85) rotate(0deg); }
        }
        @keyframes party-profile-rps-label {
          0%, 54% { opacity: 0; }
          60% { opacity: 1; }
          82% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes party-profile-win-pulse {
          0%, 58% { filter: brightness(1); box-shadow: 0 10px 32px rgba(0,0,0,0.5); }
          64% { filter: brightness(1.2); box-shadow: 0 0 28px rgba(251,191,36,0.65), 0 10px 32px rgba(0,0,0,0.5); }
          74%, 82% { filter: brightness(1.1); box-shadow: 0 0 18px rgba(251,191,36,0.45), 0 10px 32px rgba(0,0,0,0.5); }
          100% { filter: brightness(1); opacity: 0; }
        }
        @keyframes party-profile-lose-sag {
          0%, 58% { filter: brightness(1) grayscale(0); transform: translateY(0); }
          66% { filter: brightness(0.72) grayscale(0.4); transform: translateY(6px); }
          82% { filter: brightness(0.68) grayscale(0.45); transform: translateY(8px); }
          100% { opacity: 0; }
        }
        @keyframes party-profile-badge-win {
          0%, 60% { opacity: 0; transform: scale(0.2) translateY(10px); }
          66% { opacity: 1; transform: scale(1.35) translateY(0); }
          74% { transform: scale(1.05) translateY(-4px); }
          82% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.85) translateY(-10px); }
        }
        @keyframes party-profile-badge-lose {
          0%, 60% { opacity: 0; transform: scale(0.2); }
          66% { opacity: 1; transform: scale(1.1); }
          82% { opacity: 1; }
          100% { opacity: 0; transform: scale(0.85) translateY(8px); }
        }
        @keyframes party-profile-badge-tie {
          0%, 60% { opacity: 0; transform: scale(0.3); }
          66% { opacity: 1; transform: scale(1.2); }
          82% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes party-profile-vs-pulse {
          0%, 10% { opacity: 0; transform: scale(0.4); }
          16% { opacity: 1; transform: scale(1.1); }
          22% { transform: scale(1); opacity: 1; }
          82% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes party-profile-sparkle {
          0% { opacity: 0; transform: scale(0.2) rotate(0deg); }
          16% { opacity: 1; transform: scale(1.05) rotate(calc(var(--fspin, 0deg) * 0.25)); }
          24% { opacity: 1; transform: scale(1) rotate(calc(var(--fspin, 0deg) * 0.35)); }
          72% { opacity: 0.85; transform: translateY(-12px) scale(0.95) rotate(calc(var(--fspin, 0deg) * 0.6)); }
          82% { opacity: 0.7; }
          100% { opacity: 0; transform: translateY(-22px) scale(0.65) rotate(var(--fspin, 0deg)); }
        }
        @keyframes party-profile-caption {
          0%, 16% { opacity: 0; transform: translateY(4px); }
          22% { opacity: 1; transform: translateY(0); }
          82% { opacity: 1; }
          100% { opacity: 0; transform: translateY(2px); }
        }
        @keyframes party-profile-caption-rps {
          0%, 64% { opacity: 0; transform: translateY(4px); }
          68% { opacity: 1; transform: translateY(0); }
          82% { opacity: 1; }
          100% { opacity: 0; transform: translateY(2px); }
        }
      `}</style>
      <div className="party-profile-root" style={anchorStyle} aria-hidden>
        <div className="party-profile-stage">
          <div className="party-profile-duel">
            {isRps && (
              <div className="party-profile-top">
                <span className="party-profile-rps-countdown party-profile-rps-countdown--3">3</span>
                <span className="party-profile-rps-countdown party-profile-rps-countdown--2">2</span>
                <span className="party-profile-rps-countdown party-profile-rps-countdown--1">1</span>
              </div>
            )}

            {sparkles.length > 0 && (
              <div className="party-profile-sparkles">
                {sparkles.map((s, i) => (
                  <Sparkle key={`${effect.id}-s-${i}`} {...s} ms={ms} effect={effect} />
                ))}
              </div>
            )}

            <div className="party-profile-row">
              <div className={`party-profile-side ${reactorSideClass}`}>
                {isWave && <span className="party-profile-hand party-profile-hand--left">👋</span>}
                {isRps && (
                  <>
                    <span className="party-profile-rps-shake party-profile-rps-shake--left">✊</span>
                    {reactorWins && <span className="party-profile-badge party-profile-badge--win">🏆</span>}
                    {targetWins && <span className="party-profile-badge party-profile-badge--lose">😢</span>}
                    {isTie && <span className="party-profile-badge party-profile-badge--tie">🤝</span>}
                  </>
                )}
                <div
                  className={`party-profile-avatar-wrap ${
                    isRps && reactorWins
                      ? "party-profile-avatar-wrap--win"
                      : isRps && targetWins
                        ? "party-profile-avatar-wrap--lose"
                        : ""
                  }`}
                  style={{ background: ring }}
                >
                  {reactorSrc ? (
                    <img className="party-profile-avatar" src={reactorSrc} alt="" draggable={false} />
                  ) : (
                    <div className="party-profile-avatar" />
                  )}
                </div>
                {isRps && duel && (
                  <>
                    <span className="party-profile-rps-choice">{RPS_CHOICE_EMOJI[duel.reactorChoice]}</span>
                    <span className="party-profile-rps-label">{RPS_CHOICE_LABEL[duel.reactorChoice]}</span>
                  </>
                )}
              </div>

              <div className="party-profile-mid">
                {isParty && <span className="party-profile-mid-icon">🎉</span>}
                {isWave && <span className="party-profile-mid-vs">···</span>}
                {isHighfive && (
                  <>
                    <span className="party-profile-impact">🙌</span>
                    <span className="party-profile-impact-ring" aria-hidden />
                  </>
                )}
                {isRps && <span className="party-profile-mid-vs">VS</span>}
              </div>

              <div className={`party-profile-side ${targetSideClass}`}>
                {isWave && <span className="party-profile-hand party-profile-hand--right">👋</span>}
                {isRps && (
                  <>
                    <span className="party-profile-rps-shake party-profile-rps-shake--right">✊</span>
                    {targetWins && <span className="party-profile-badge party-profile-badge--win">🏆</span>}
                    {reactorWins && <span className="party-profile-badge party-profile-badge--lose">😢</span>}
                    {isTie && <span className="party-profile-badge party-profile-badge--tie">🤝</span>}
                  </>
                )}
                <div
                  className={`party-profile-avatar-wrap ${
                    isRps && targetWins
                      ? "party-profile-avatar-wrap--win"
                      : isRps && reactorWins
                        ? "party-profile-avatar-wrap--lose"
                        : ""
                  }`}
                  style={{ background: ring }}
                >
                  {targetSrc ? (
                    <img className="party-profile-avatar" src={targetSrc} alt="" draggable={false} />
                  ) : (
                    <div className="party-profile-avatar" />
                  )}
                </div>
                {isRps && duel && (
                  <>
                    <span className="party-profile-rps-choice party-profile-rps-choice--target">
                      {RPS_CHOICE_EMOJI[duel.targetChoice]}
                    </span>
                    <span className="party-profile-rps-label party-profile-rps-label--target">
                      {RPS_CHOICE_LABEL[duel.targetChoice]}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="party-profile-foot">
              {isRps && duel && (
                <span className="party-profile-caption party-profile-caption--rps">
                  {isTie ? "Tie game!" : "We have a winner!"}
                </span>
              )}
              {isParty && <span className="party-profile-caption">Party time!</span>}
              {isWave && <span className="party-profile-caption">Hey there!</span>}
              {isHighfive && <span className="party-profile-caption">Nice!</span>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const PROFILE_REACTION_PLAY_MS = PROFILE_RPS_DURATION_MS;
