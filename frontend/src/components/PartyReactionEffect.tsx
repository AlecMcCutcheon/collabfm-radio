import { useMemo } from "react";
import type { PartyEffect } from "../types/api";
import { REACTION_EMOJI } from "../config/partyEffectMenu";
import {
  REACTION_DURATION_MS,
  getReactionScene,
  slotPosition,
  type ReactionProp,
  type StageMotion,
} from "../config/partyReactionChoreography";
import { pointerReactionPlacement } from "../utils/partyEffectPlacement";
import { effectStaggerStyle, staggeredDelayMs } from "../utils/partyEffectPlayback";
import { partyReactorAvatarSrc } from "../utils/partyReactorAvatar";
import { PARTY_EFFECTS_REACTION_Z } from "../utils/partyEffectsZIndex";

interface PartyReactionEffectProps {
  effect: PartyEffect;
  shareToken?: string;
}

function ReactionPropEl({ prop, index, effect }: { prop: ReactionProp; index: number; effect: PartyEffect }) {
  const pos = slotPosition(prop.slot);
  const scale = prop.scale ?? 1;
  return (
    <span
      key={`${prop.emoji}-${prop.slot}-${index}`}
      className={`party-reaction-prop party-reaction-prop--${prop.anim}`}
      style={{
        left: pos.left,
        top: pos.top,
        animationDelay: staggeredDelayMs(effect, prop.delayMs),
        ["--ps" as string]: String(scale),
      }}
    >
      <span
        className="party-reaction-prop-inner"
        style={prop.mirror ? { transform: "scaleX(-1)" } : undefined}
      >
        {prop.emoji}
      </span>
    </span>
  );
}

export function PartyReactionEffect({ effect, shareToken }: PartyReactionEffectProps) {
  const fallbackEmoji = REACTION_EMOJI[effect.type] ?? "✨";
  const placement = useMemo(
    () => pointerReactionPlacement(effect.x, effect.y),
    [effect.x, effect.y],
  );
  const scene = useMemo(() => {
    const base = getReactionScene(effect.type, effect.id);
    const sideMotion: StageMotion = placement.side === "right" ? "drift-right" : "drift-left";
    const driftMotions: StageMotion[] = ["drift-left", "drift-right", "rise", "sway", "hop"];
    const stageMotion = driftMotions.includes(base.stageMotion) ? sideMotion : base.stageMotion;
    return { ...base, stageMotion };
  }, [effect.type, effect.id, placement.side]);
  const avatarSrc = effect.reactor ? partyReactorAvatarSrc(effect.reactor, 96, shareToken) : null;
  const ms = REACTION_DURATION_MS;
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

  return (
    <>
      <style>{`
        .party-reaction-stage {
          position: absolute;
          animation-duration: ${ms}ms;
          animation-fill-mode: forwards;
          animation-timing-function: cubic-bezier(0.14, 0.82, 0.28, 1);
        }
        .party-reaction-stage--rise { animation-name: party-reaction-stage-rise; }
        .party-reaction-stage--drift-left { animation-name: party-reaction-stage-drift-left; }
        .party-reaction-stage--drift-right { animation-name: party-reaction-stage-drift-right; }
        .party-reaction-stage--hop { animation-name: party-reaction-stage-hop; }
        .party-reaction-stage--sway { animation-name: party-reaction-stage-sway; }
        .party-reaction-stage--sink { animation-name: party-reaction-stage-sink; }
        .party-reaction-body {
          position: relative;
          width: 0;
          height: 0;
        }
        .party-reaction-avatar-wrap {
          position: absolute;
          left: 0;
          top: 0;
          width: 56px;
          height: 56px;
          margin: -28px 0 0 -28px;
          border-radius: 9999px;
          padding: 3px;
          box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
        }
        .party-reaction-avatar {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          object-fit: cover;
          display: block;
          background: #1e293b;
        }
        .party-reaction-prop {
          position: absolute;
          font-size: calc(1.45rem * var(--ps, 1));
          line-height: 1;
          animation-duration: ${ms}ms;
          animation-fill-mode: both;
          animation-timing-function: cubic-bezier(0.14, 0.82, 0.28, 1);
        }
        .party-reaction-prop-inner {
          display: inline-block;
        }
        .party-reaction-prop--hand-pop {
          animation-name: party-reaction-hand-pop;
        }
        .party-reaction-prop--hand-wave {
          animation-name: party-reaction-hand-wave;
        }
        .party-reaction-prop--clap-left {
          animation-name: party-reaction-clap-left;
          animation-timing-function: ease-in-out;
        }
        .party-reaction-prop--clap-right {
          animation-name: party-reaction-clap-right;
          animation-timing-function: ease-in-out;
        }
        .party-reaction-prop--heart-float {
          animation-name: party-reaction-heart-float;
        }
        .party-reaction-prop--sparkle {
          animation-name: party-reaction-sparkle;
        }
        .party-reaction-prop--bounce-in {
          animation-name: party-reaction-bounce-in;
        }
        .party-reaction-prop--wiggle {
          animation-name: party-reaction-wiggle;
        }
        .party-reaction-prop--flame-rise {
          animation-name: party-reaction-flame-rise;
        }
        .party-reaction-prop--devil-float {
          animation-name: party-reaction-devil-float;
        }

        .party-reaction-prop--devil-float {
          animation-name: party-reaction-devil-float;
        }
        .party-reaction-prop--hand-release-left {
          animation-name: party-reaction-hand-release-left;
        }
        .party-reaction-prop--hand-release-right {
          animation-name: party-reaction-hand-release-right;
        }
        .party-reaction-prop--heart-blow-left {
          animation-name: party-reaction-heart-blow-left;
        }
        .party-reaction-prop--heart-blow-right {
          animation-name: party-reaction-heart-blow-right;
        }
        .party-reaction-prop--drift-away-left {
          animation-name: party-reaction-drift-away-left;
        }
        .party-reaction-prop--drift-away-right {
          animation-name: party-reaction-drift-away-right;
        }
        .party-reaction-prop--tear-fall {
          animation-name: party-reaction-tear-fall;
        }
        .party-reaction-prop--sink-down {
          animation-name: party-reaction-sink-down;
        }
        .party-reaction-prop--sway-float {
          animation-name: party-reaction-sway-float;
        }
        .party-reaction-prop--rock-sway {
          animation-name: party-reaction-rock-sway;
          animation-timing-function: ease-in-out;
        }
        .party-reaction-prop--note-drift-left {
          animation-name: party-reaction-note-drift-left;
        }
        .party-reaction-prop--note-drift-right {
          animation-name: party-reaction-note-drift-right;
        }

        @keyframes party-reaction-stage-rise {
          0% { transform: translate(0, 12px); opacity: 0; }
          10% { opacity: 1; }
          68% { transform: translate(0, -48px); opacity: 1; }
          88% { transform: translate(0, -58px); opacity: 0.55; }
          100% { transform: translate(0, -64px); opacity: 0; }
        }
        @keyframes party-reaction-stage-drift-left {
          0% { transform: translate(8px, 10px); opacity: 0; }
          10% { opacity: 1; }
          68% { transform: translate(-20px, -44px); opacity: 1; }
          88% { transform: translate(-25px, -54px); opacity: 0.55; }
          100% { transform: translate(-28px, -58px); opacity: 0; }
        }
        @keyframes party-reaction-stage-drift-right {
          0% { transform: translate(-8px, 10px); opacity: 0; }
          10% { opacity: 1; }
          68% { transform: translate(20px, -44px); opacity: 1; }
          88% { transform: translate(25px, -54px); opacity: 0.55; }
          100% { transform: translate(28px, -58px); opacity: 0; }
        }
        @keyframes party-reaction-stage-hop {
          0% { transform: translate(0, 16px); opacity: 0; }
          12% { transform: translate(0, -6px); opacity: 1; }
          28% { transform: translate(0, 4px); opacity: 1; }
          44% { transform: translate(0, -12px); opacity: 1; }
          68% { transform: translate(0, -58px); opacity: 1; }
          88% { transform: translate(0, -66px); opacity: 0.55; }
          100% { transform: translate(0, -72px); opacity: 0; }
        }
        @keyframes party-reaction-stage-sway {
          0% { transform: translate(0, 10px); opacity: 0; }
          10% { opacity: 1; }
          30% { transform: translate(10px, -20px); opacity: 1; }
          55% { transform: translate(-10px, -38px); opacity: 1; }
          68% { transform: translate(2px, -50px); opacity: 1; }
          88% { transform: translate(4px, -58px); opacity: 0.55; }
          100% { transform: translate(6px, -62px); opacity: 0; }
        }
        @keyframes party-reaction-stage-sink {
          0% { transform: translate(0, -8px); opacity: 0; }
          12% { transform: translate(0, 0); opacity: 1; }
          68% { transform: translate(0, 26px); opacity: 1; }
          88% { transform: translate(0, 32px); opacity: 0.55; }
          100% { transform: translate(0, 36px); opacity: 0; }
        }
        @keyframes party-reaction-avatar-pop {
          0% { transform: scale(0.2); opacity: 0; }
          14% { transform: scale(1.1); opacity: 1; }
          28% { transform: scale(1); opacity: 1; }
          68% { transform: scale(1); opacity: 1; }
          88% { transform: scale(0.97); opacity: 0.55; }
          100% { transform: scale(0.94); opacity: 0; }
        }
        @keyframes party-reaction-avatar-bounce {
          0% { transform: scale(0.3) translateY(8px); opacity: 0; }
          12% { transform: scale(1.08) translateY(-4px); opacity: 1; }
          22% { transform: scale(0.98) translateY(2px); opacity: 1; }
          32% { transform: scale(1.02) translateY(-2px); opacity: 1; }
          68% { transform: scale(1) translateY(0); opacity: 1; }
          88% { transform: scale(0.97) translateY(0); opacity: 0.55; }
          100% { transform: scale(0.95) translateY(0); opacity: 0; }
        }
        @keyframes party-reaction-avatar-sway {
          0% { transform: scale(0.4) rotate(-6deg); opacity: 0; }
          15% { transform: scale(1.05) rotate(4deg); opacity: 1; }
          35% { transform: scale(1) rotate(-3deg); opacity: 1; }
          55% { transform: scale(1) rotate(3deg); opacity: 1; }
          68% { transform: scale(1) rotate(0deg); opacity: 1; }
          88% { transform: scale(0.97) rotate(0deg); opacity: 0.55; }
          100% { transform: scale(0.94) rotate(0deg); opacity: 0; }
        }
        @keyframes party-reaction-avatar-pulse {
          0% { transform: scale(0.35); opacity: 0; }
          12% { transform: scale(1.12); opacity: 1; }
          25% { transform: scale(0.96); opacity: 1; }
          40% { transform: scale(1.06); opacity: 1; }
          55% { transform: scale(0.98); opacity: 1; }
          68% { transform: scale(1); opacity: 1; }
          88% { transform: scale(0.96); opacity: 0.55; }
          100% { transform: scale(0.92); opacity: 0; }
        }
        @keyframes party-reaction-avatar-shake {
          0% { transform: scale(0.5) translateX(0); opacity: 0; }
          10% { transform: scale(1) translateX(0); opacity: 1; }
          18% { transform: scale(1) translateX(-4px); }
          26% { transform: scale(1) translateX(4px); }
          34% { transform: scale(1) translateX(-3px); }
          42% { transform: scale(1) translateX(3px); }
          68% { transform: scale(1) translateX(0); opacity: 1; }
          88% { transform: scale(0.97) translateX(0); opacity: 0.55; }
          100% { transform: scale(0.94) translateX(0); opacity: 0; }
        }
        @keyframes party-reaction-avatar-giggle {
          0% { transform: scale(0.3) rotate(0deg); opacity: 0; }
          10% { transform: scale(1.05) rotate(-4deg); opacity: 1; }
          20% { transform: scale(1) rotate(4deg); }
          30% { transform: scale(1.03) rotate(-3deg); }
          40% { transform: scale(1) rotate(3deg); }
          50% { transform: scale(1.02) rotate(-2deg); }
          68% { transform: scale(1) rotate(0deg); opacity: 1; }
          88% { transform: scale(0.98) rotate(0deg); opacity: 0.55; }
          100% { transform: scale(0.95) rotate(0deg); opacity: 0; }
        }

        @keyframes party-reaction-hand-pop {
          0% { transform: translate(-50%, -50%) scale(0.1); opacity: 0; }
          16% { transform: translate(-50%, -50%) scale(calc(1.15 * var(--ps, 1))); opacity: 1; }
          30% { transform: translate(-50%, -50%) scale(var(--ps, 1)); opacity: 1; }
          68% { transform: translate(-50%, -58%) scale(var(--ps, 1)); opacity: 1; }
          88% { transform: translate(-50%, -59%) scale(calc(0.92 * var(--ps, 1))); opacity: 0.55; }
          100% { transform: translate(-50%, -60%) scale(calc(0.85 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-hand-wave {
          0% { transform: translate(-50%, -50%) scale(0.2) rotate(-20deg); opacity: 0; }
          14% { transform: translate(-50%, -58%) scale(var(--ps, 1)) rotate(8deg); opacity: 1; }
          28% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-6deg); opacity: 1; }
          42% { transform: translate(-50%, -56%) scale(var(--ps, 1)) rotate(4deg); opacity: 1; }
          68% { transform: translate(-50%, -60%) scale(var(--ps, 1)) rotate(0deg); opacity: 1; }
          88% { transform: translate(-50%, -62%) scale(calc(0.95 * var(--ps, 1))) rotate(0deg); opacity: 0.55; }
          100% { transform: translate(-50%, -64%) scale(calc(0.9 * var(--ps, 1))) rotate(0deg); opacity: 0; }
        }
        @keyframes party-reaction-clap-left {
          0%, 100% { transform: translate(-50%, -50%) scale(calc(0.85 * var(--ps, 1))); opacity: 0; }
          8% { opacity: 1; }
          15% { transform: translate(-42%, -50%) scale(var(--ps, 1)); }
          25% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          35% { transform: translate(-42%, -50%) scale(var(--ps, 1)); }
          45% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          55% { transform: translate(-42%, -50%) scale(var(--ps, 1)); }
          65% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          75% { opacity: 1; }
          88% { opacity: 0.55; }
        }
        @keyframes party-reaction-clap-right {
          0%, 100% { transform: translate(-50%, -50%) scale(calc(0.85 * var(--ps, 1))); opacity: 0; }
          8% { opacity: 1; }
          15% { transform: translate(-58%, -50%) scale(var(--ps, 1)); }
          25% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          35% { transform: translate(-58%, -50%) scale(var(--ps, 1)); }
          45% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          55% { transform: translate(-58%, -50%) scale(var(--ps, 1)); }
          65% { transform: translate(-50%, -50%) scale(calc(0.92 * var(--ps, 1))); }
          75% { opacity: 1; }
          88% { opacity: 0.55; }
        }
        @keyframes party-reaction-heart-float {
          0% { transform: translate(-50%, -30%) scale(0.2); opacity: 0; }
          18% { transform: translate(-50%, -70%) scale(var(--ps, 1)); opacity: 1; }
          68% { transform: translate(-50%, -106%) scale(var(--ps, 1)); opacity: 1; }
          88% { transform: translate(-50%, -114%) scale(calc(0.85 * var(--ps, 1))); opacity: 0.55; }
          100% { transform: translate(-50%, -120%) scale(calc(0.7 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-sparkle {
          0% { transform: translate(-50%, -50%) scale(0.1) rotate(0deg); opacity: 0; }
          20% { transform: translate(-50%, -62%) scale(var(--ps, 1)) rotate(20deg); opacity: 1; }
          68% { transform: translate(-50%, -82%) scale(var(--ps, 1)) rotate(38deg); opacity: 1; }
          88% { transform: translate(-50%, -87%) scale(calc(0.75 * var(--ps, 1))) rotate(42deg); opacity: 0.55; }
          100% { transform: translate(-50%, -90%) scale(calc(0.5 * var(--ps, 1))) rotate(45deg); opacity: 0; }
        }
        @keyframes party-reaction-bounce-in {
          0% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
          18% { transform: translate(-50%, -68%) scale(calc(1.2 * var(--ps, 1))); opacity: 1; }
          30% { transform: translate(-50%, -58%) scale(calc(0.95 * var(--ps, 1))); opacity: 1; }
          68% { transform: translate(-50%, -64%) scale(var(--ps, 1)); opacity: 1; }
          88% { transform: translate(-50%, -68%) scale(calc(0.92 * var(--ps, 1))); opacity: 0.55; }
          100% { transform: translate(-50%, -72%) scale(calc(0.85 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-wiggle {
          0% { transform: translate(-50%, -50%) scale(0.2) rotate(-12deg); opacity: 0; }
          14% { transform: translate(-50%, -55%) scale(var(--ps, 1)) rotate(10deg); opacity: 1; }
          28% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-8deg); }
          42% { transform: translate(-50%, -55%) scale(var(--ps, 1)) rotate(6deg); }
          68% { transform: translate(-50%, -57%) scale(var(--ps, 1)) rotate(0deg); opacity: 1; }
          88% { transform: translate(-50%, -60%) scale(calc(0.92 * var(--ps, 1))) rotate(0deg); opacity: 0.55; }
          100% { transform: translate(-50%, -62%) scale(calc(0.88 * var(--ps, 1))) rotate(0deg); opacity: 0; }
        }
        @keyframes party-reaction-flame-rise {
          0% { transform: translate(-50%, -20%) scale(0.3); opacity: 0; }
          15% { transform: translate(-50%, -55%) scale(var(--ps, 1)); opacity: 1; }
          68% { transform: translate(-50%, -86%) scale(var(--ps, 1)); opacity: 1; }
          88% { transform: translate(-50%, -91%) scale(calc(0.75 * var(--ps, 1))); opacity: 0.55; }
          100% { transform: translate(-50%, -95%) scale(calc(0.6 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-devil-float {
          0% { transform: translate(-50%, -40%) scale(0.2) rotate(-8deg); opacity: 0; }
          16% { transform: translate(-50%, -72%) scale(var(--ps, 1)) rotate(6deg); opacity: 1; }
          50% { transform: translate(-50%, -68%) scale(calc(1.05 * var(--ps, 1))) rotate(-4deg); opacity: 1; }
          68% { transform: translate(-50%, -80%) scale(var(--ps, 1)) rotate(0deg); opacity: 1; }
          88% { transform: translate(-50%, -85%) scale(calc(0.9 * var(--ps, 1))) rotate(0deg); opacity: 0.55; }
          100% { transform: translate(-50%, -88%) scale(calc(0.8 * var(--ps, 1))) rotate(0deg); opacity: 0; }
        }
        @keyframes party-reaction-hand-release-left {
          0% { transform: translate(-50%, -50%) scale(0.35) rotate(12deg); opacity: 0; }
          14% { transform: translate(-50%, -50%) scale(var(--ps, 1)) rotate(0deg); opacity: 1; }
          38% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-8deg); opacity: 1; }
          100% { transform: translate(calc(-50% - 52px), calc(-50% - 24px)) scale(calc(0.82 * var(--ps, 1))) rotate(-38deg); opacity: 0; }
        }
        @keyframes party-reaction-hand-release-right {
          0% { transform: translate(-50%, -50%) scale(0.35) rotate(-12deg); opacity: 0; }
          14% { transform: translate(-50%, -50%) scale(var(--ps, 1)) rotate(0deg); opacity: 1; }
          38% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(8deg); opacity: 1; }
          100% { transform: translate(calc(-50% + 52px), calc(-50% - 24px)) scale(calc(0.82 * var(--ps, 1))) rotate(38deg); opacity: 0; }
        }
        @keyframes party-reaction-heart-blow-left {
          0% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
          18% { transform: translate(-50%, -55%) scale(calc(0.9 * var(--ps, 1))); opacity: 1; }
          100% { transform: translate(calc(-50% - 58px), calc(-50% - 72px)) scale(calc(0.65 * var(--ps, 1))) rotate(-22deg); opacity: 0; }
        }
        @keyframes party-reaction-heart-blow-right {
          0% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
          18% { transform: translate(-50%, -55%) scale(calc(0.9 * var(--ps, 1))); opacity: 1; }
          100% { transform: translate(calc(-50% + 58px), calc(-50% - 72px)) scale(calc(0.65 * var(--ps, 1))) rotate(22deg); opacity: 0; }
        }
        @keyframes party-reaction-drift-away-left {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
          16% { transform: translate(-50%, -54%) scale(var(--ps, 1)); opacity: 1; }
          100% { transform: translate(calc(-50% - 72px), calc(-50% - 18px)) scale(calc(0.55 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-drift-away-right {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
          16% { transform: translate(-50%, -54%) scale(var(--ps, 1)); opacity: 1; }
          100% { transform: translate(calc(-50% + 72px), calc(-50% - 18px)) scale(calc(0.55 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-tear-fall {
          0% { transform: translate(-50%, -70%) scale(0.2); opacity: 0; }
          14% { transform: translate(-50%, -58%) scale(var(--ps, 1)); opacity: 0.9; }
          100% { transform: translate(-50%, calc(-50% + 72px)) scale(calc(0.6 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-sink-down {
          0% { transform: translate(-50%, -60%) scale(0.25); opacity: 0; }
          16% { transform: translate(-50%, -50%) scale(var(--ps, 1)); opacity: 1; }
          100% { transform: translate(-50%, calc(-50% + 48px)) scale(calc(0.75 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-sway-float {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
          14% { transform: translate(-50%, -58%) scale(var(--ps, 1)); opacity: 1; }
          35% { transform: translate(calc(-50% + 12px), calc(-50% - 28px)) scale(var(--ps, 1)); opacity: 1; }
          60% { transform: translate(calc(-50% - 10px), calc(-50% - 48px)) scale(var(--ps, 1)); opacity: 1; }
          100% { transform: translate(calc(-50% + 6px), calc(-50% - 78px)) scale(calc(0.8 * var(--ps, 1))); opacity: 0; }
        }
        @keyframes party-reaction-rock-sway {
          0%, 100% { transform: translate(-50%, -50%) scale(calc(0.85 * var(--ps, 1))); opacity: 0; }
          8% { opacity: 1; transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-14deg); }
          22% { transform: translate(-50%, -50%) scale(var(--ps, 1)) rotate(14deg); }
          36% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-12deg); }
          50% { transform: translate(-50%, -50%) scale(var(--ps, 1)) rotate(12deg); }
          64% { transform: translate(-50%, -52%) scale(var(--ps, 1)) rotate(-8deg); }
          80% { opacity: 1; }
        }
        @keyframes party-reaction-note-drift-left {
          0% { transform: translate(-50%, -50%) scale(0.15) rotate(0deg); opacity: 0; }
          18% { transform: translate(-50%, -62%) scale(var(--ps, 1)) rotate(-12deg); opacity: 1; }
          100% { transform: translate(calc(-50% - 48px), calc(-50% - 88px)) scale(calc(0.6 * var(--ps, 1))) rotate(-28deg); opacity: 0; }
        }
        @keyframes party-reaction-note-drift-right {
          0% { transform: translate(-50%, -50%) scale(0.15) rotate(0deg); opacity: 0; }
          18% { transform: translate(-50%, -62%) scale(var(--ps, 1)) rotate(12deg); opacity: 1; }
          100% { transform: translate(calc(-50% + 48px), calc(-50% - 88px)) scale(calc(0.6 * var(--ps, 1))) rotate(28deg); opacity: 0; }
        }

        .party-reaction-fallback {
          position: absolute;
          font-size: 2rem;
          line-height: 1;
          animation: party-reaction-fallback ${ms}ms cubic-bezier(0.15, 0.85, 0.25, 1) forwards;
        }
        .party-reaction-root .party-reaction-stage,
        .party-reaction-root .party-reaction-avatar-wrap,
        .party-reaction-root .party-reaction-fallback {
          animation-delay: var(--effect-stagger, 0ms);
        }
        @keyframes party-reaction-fallback {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          15% { transform: translate(-50%, -58%) scale(1.15); opacity: 1; }
          68% { transform: translate(-50%, -96%) scale(1); opacity: 1; }
          88% { transform: translate(-50%, -104%) scale(0.92); opacity: 0.55; }
          100% { transform: translate(-50%, -110%) scale(0.85); opacity: 0; }
        }
      `}</style>
      <div className="party-reaction-root" style={anchorStyle} aria-hidden>
        {avatarSrc ? (
          <div className={`party-reaction-stage party-reaction-stage--${scene.stageMotion}`}>
            <div className="party-reaction-body">
              {scene.floaters.map((prop, i) => (
                <ReactionPropEl key={`f-${i}`} prop={prop} index={i} effect={effect} />
              ))}
              <div
                className={`party-reaction-avatar-wrap party-reaction-avatar-wrap--${scene.avatarAnim}`}
                style={{
                  background: scene.ring,
                  animation: `party-reaction-avatar-${scene.avatarAnim} ${ms}ms cubic-bezier(0.12, 0.85, 0.25, 1) forwards`,
                }}
              >
                <img className="party-reaction-avatar" src={avatarSrc} alt="" draggable={false} />
              </div>
              {scene.props.map((prop, i) => (
                <ReactionPropEl key={`p-${i}`} prop={prop} index={i} effect={effect} />
              ))}
            </div>
          </div>
        ) : (
          <span className="party-reaction-fallback">{fallbackEmoji}</span>
        )}
      </div>
    </>
  );
}

export { REACTION_DURATION_MS as PARTY_REACTION_MS };

export function isReactionEffectType(type: string): boolean {
  return (
    type.startsWith("react_") &&
    !type.startsWith("react_profile_") &&
    type !== "react_pet" &&
    type !== "react_pet_hearts"
  );
}
