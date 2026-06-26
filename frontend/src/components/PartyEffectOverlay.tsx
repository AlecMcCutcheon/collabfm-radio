import { useMemo } from "react";
import type { PartyEffect, PartyEffectType } from "../types/api";
import { PARTY_EFFECT_PLAY_MS } from "../hooks/usePartyEffects";
import { effectStaggerStyle } from "../utils/partyEffectPlayback";
import {
  type FireworkStyle,
  type SpotEffectTheme,
  getSpotEffectTheme,
  pickThemedFireworkStyle,
} from "../config/partySpotEffectThemes";
import { createSeededRng, pickSeeded } from "../utils/partyEffectSeed";

/** Snappy action phase, then linger/fade — total cleanup window is PARTY_EFFECT_PLAY_MS. */
const T = {
  fireworkBurst: 710,
  fireworkFlash: 285,
  fireworkCore: 210,
  confetti: 1950,
  shockwave: 1200,
  hearts: 1580,
  laser: 900,
  bubble: 2250,
  stars: 1650,
  notes: 2100,
} as const;

function useSpotEffectAnchorStyle(effect: PartyEffect) {
  const stagger = effectStaggerStyle(effect);
  return useMemo(
    () => ({
      left: `${effect.x * 100}vw`,
      top: `${effect.y * 100}vh`,
      ...stagger,
    }),
    [effect.x, effect.y, stagger],
  );
}

function syncDelaySec(staggerSec: number): string {
  return staggerSec === 0
    ? "var(--effect-stagger, 0ms)"
    : `calc(var(--effect-stagger, 0ms) + ${staggerSec}s)`;
}

interface BurstSpec {
  angle: number;
  color: string;
  delay: number;
  dist: number;
  size: number;
  trail: boolean;
  wobble: number;
}

function buildBurst(
  seed: string,
  count: number,
  distMin: number,
  distMax: number,
  palette: string[],
  style?: FireworkStyle,
  theme?: SpotEffectTheme,
): BurstSpec[] {
  const rng = createSeededRng(seed);
  const burstStyle = style ?? pickThemedFireworkStyle(seed, theme ?? { id: "classic", palette });

  if (burstStyle === "palm") {
    return Array.from({ length: count }, (_, i) => ({
      angle: 95 + (i / count) * 170 + rng() * 18,
      color: pickSeeded(rng, palette),
      delay: rng() * 0.05,
      dist: (distMin + rng() * (distMax - distMin)) * 1.15,
      size: 4 + rng() * 6,
      trail: true,
      wobble: 20 + rng() * 50,
    }));
  }

  if (burstStyle === "ring") {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * 360 + rng() * 6,
      color: pickSeeded(rng, palette),
      delay: rng() * 0.03,
      dist: distMin + (distMax - distMin) * (0.78 + (i % 3) * 0.08),
      size: 4 + rng() * 5,
      trail: false,
      wobble: (rng() - 0.5) * 12,
    }));
  }

  if (burstStyle === "willow") {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * 360 + rng() * 40,
      color: pickSeeded(rng, palette),
      delay: rng() * 0.08,
      dist: distMin + rng() * (distMax - distMin) * 1.25,
      size: 3 + rng() * 5,
      trail: true,
      wobble: 30 + rng() * 70,
    }));
  }

  if (burstStyle === "crossette") {
    const clusters = [0, 90, 180, 270];
    const perCluster = Math.ceil(count / 4);
    const specs: BurstSpec[] = [];
    for (const base of clusters) {
      for (let j = 0; j < perCluster && specs.length < count; j++) {
        specs.push({
          angle: base + (rng() - 0.5) * 36,
          color: pickSeeded(rng, palette),
          delay: rng() * 0.06,
          dist: distMin + rng() * (distMax - distMin) * 0.75,
          size: 5 + rng() * 7,
          trail: rng() > 0.4,
          wobble: (rng() - 0.5) * 30,
        });
      }
    }
    return specs;
  }

  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360 + rng() * 28,
    color: pickSeeded(rng, palette),
    delay: rng() * 0.04,
    dist: distMin + rng() * (distMax - distMin),
    size: 5 + rng() * 7,
    trail: rng() > 0.55,
    wobble: (rng() - 0.5) * 40,
  }));
}

function FireworkBurst({
  seed,
  scale,
  delaySec,
  main,
  theme,
}: {
  seed: string;
  scale: number;
  delaySec: number;
  main?: boolean;
  theme: SpotEffectTheme;
}) {
  const style = useMemo(() => pickThemedFireworkStyle(seed, theme), [seed, theme]);
  const particles = useMemo(
    () =>
      buildBurst(
        seed,
        main ? 30 : 12,
        main ? 60 : 24,
        main ? 140 : 62,
        theme.palette,
        style,
        theme,
      ),
    [seed, main, style, theme],
  );
  const sparks = useMemo(
    () =>
      buildBurst(
        `${seed}-spark`,
        main ? 8 : 4,
        10,
        32,
        theme.palette,
        style === "ring" ? "chrysanthemum" : style,
        theme,
      ),
    [seed, main, style, theme],
  );

  return (
    <div
      className={`party-firework-burst party-firework-${style} party-spot-theme-${theme.id}`}
      style={{
        ["--burst-scale" as string]: String(scale),
        ["--burst-delay" as string]: syncDelaySec(delaySec),
        ...(theme.flashGradient ? { ["--fw-flash-bg" as string]: theme.flashGradient } : {}),
        ...(theme.coreGlow ? { ["--fw-core-glow" as string]: theme.coreGlow } : {}),
      }}
    >
      {particles.map((p, i) => (
        <span
          key={`p-${i}`}
          className={p.trail ? "party-firework-particle party-firework-trail" : "party-firework-particle"}
          style={{
            backgroundColor: p.color,
            boxShadow: main ? `0 0 5px ${p.color}` : `0 0 4px ${p.color}99`,
            width: p.size,
            height: p.size,
            animationDelay: syncDelaySec(delaySec + p.delay),
            ["--burst-angle" as string]: `${p.angle}deg`,
            ["--burst-dist" as string]: `${p.dist * scale}px`,
            ["--burst-wobble" as string]: `${p.wobble}px`,
          }}
        />
      ))}
      {sparks.map((p, i) => (
        <span
          key={`s-${i}`}
          className="party-firework-spark"
          style={{
            backgroundColor: p.color,
            animationDelay: syncDelaySec(delaySec + 0.04 + p.delay),
            ["--burst-angle" as string]: `${p.angle}deg`,
            ["--burst-dist" as string]: `${p.dist * scale * 0.65}px`,
            ["--burst-wobble" as string]: `${p.wobble * 0.6}px`,
          }}
        />
      ))}
      <span className={main ? "party-firework-flash party-firework-flash-main" : "party-firework-flash"} />
      {main && <span className="party-firework-core" style={{ animationDelay: syncDelaySec(delaySec) }} />}
    </div>
  );
}

function Fireworks({ effect, compact }: { effect: PartyEffect; compact?: boolean }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("fireworks", effect.id), [effect.id]);
  const secondaries = useMemo(() => {
    if (compact) return [];
    const rng = createSeededRng(`${effect.id}-fw`);
    return Array.from({ length: 10 }, (_, i) => {
      const wave = i % 3;
      const delay =
        wave === 0
          ? 0.04 + rng() * 0.18
          : wave === 1
            ? 0.22 + rng() * 0.28
            : 0.48 + rng() * 0.38;
      const spread = wave === 2 ? 1.35 : wave === 1 ? 1.0 : 0.72;
      return {
        id: `${effect.id}-s${i}`,
        ox: (rng() - 0.5) * 26 * spread,
        oy: (rng() - 0.5) * 20 * spread,
        delay,
        scale: (wave === 2 ? 0.32 : 0.42) + rng() * (wave === 0 ? 0.38 : 0.28),
      };
    });
  }, [effect.id, compact]);

  return (
    <div className="party-effect-anchor" style={anchorStyle}>
      <FireworkBurst seed={`${effect.id}-main`} scale={1} delaySec={0} main theme={theme} />
      {secondaries.map((s) => (
        <div
          key={s.id}
          className="party-firework-secondary-anchor"
          style={{
            ["--sec-x" as string]: `${s.ox}vw`,
            ["--sec-y" as string]: `${s.oy}vh`,
          }}
        >
          <FireworkBurst seed={s.id} scale={s.scale} delaySec={s.delay} theme={theme} />
        </div>
      ))}
    </div>
  );
}

function confettiShape(rng: () => number, mode: SpotEffectTheme["confettiMode"]) {
  const roll = rng();
  if (mode === "rect") return { w: 6 + rng() * 10, h: 4 + rng() * 6, round: false };
  if (mode === "round") return { w: 8 + rng() * 10, h: 8 + rng() * 10, round: true };
  if (mode === "streamer") return { w: 3 + rng() * 4, h: 18 + rng() * 22, round: false };
  const shape = roll;
  return {
    w: 5 + rng() * 8,
    h: shape > 0.65 ? 4 + rng() * 4 : 10 + rng() * 12,
    round: shape > 0.35 && shape <= 0.65,
  };
}

function Confetti({ effect }: { effect: PartyEffect }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("confetti", effect.id), [effect.id]);
  const pieces = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-confetti`);
    return Array.from({ length: 48 }, () => {
      const shape = confettiShape(rng, theme.confettiMode ?? "mixed");
      return {
        x: (rng() - 0.5) * 200,
        rise: 90 + rng() * 200,
        fall: 30 + rng() * 100,
        rot: rng() * 1080,
        delay: rng() * 0.12,
        color: pickSeeded(rng, theme.palette),
        w: shape.w,
        h: shape.h,
        round: shape.round,
      };
    });
  }, [effect.id, theme]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      <span className="party-confetti-blast" aria-hidden />
      {pieces.map((p, i) => (
        <span
          key={i}
          className="party-confetti-piece"
          style={{
            backgroundColor: p.color,
            width: p.w,
            height: p.h,
            borderRadius: p.round ? "9999px" : "2px",
            animationDelay: syncDelaySec(p.delay),
            ["--confetti-x" as string]: `${p.x}px`,
            ["--confetti-rise" as string]: `${p.rise}px`,
            ["--confetti-fall" as string]: `${p.fall}px`,
            ["--confetti-rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

function buildShockwaveBurst(seed: string, compact: boolean, theme: SpotEffectTheme) {
  const rng = createSeededRng(seed);
  const palette = theme.palette;
  const flashPool = theme.flashColors ?? palette;
  const ringCount = compact ? 3 : 4;
  const rings = Array.from({ length: ringCount }, (_, i) => ({
    color: pickSeeded(rng, palette),
    delay: i * 0.07 + rng() * 0.05,
    width: compact ? 2 : 2 + rng() * 1.5,
    maxScale: compact ? 9 : 11 + rng() * 3,
  }));
  const sparks = Array.from({ length: compact ? 14 : 26 }, () => ({
    angle: rng() * 360,
    dist: (compact ? 35 : 50) + rng() * (compact ? 70 : 110),
    size: 2 + rng() * 5,
    color: pickSeeded(rng, palette),
    delay: rng() * 0.12,
  }));
  const dust = Array.from({ length: compact ? 8 : 14 }, () => ({
    angle: rng() * 360,
    dist: 20 + rng() * (compact ? 40 : 65),
    delay: 0.04 + rng() * 0.14,
  }));
  const flashColor = pickSeeded(rng, flashPool);
  return { rings, sparks, dust, flashColor };
}

function ShockwaveBurst({
  seed,
  compact,
  delaySec = 0,
  theme,
}: {
  seed: string;
  compact?: boolean;
  delaySec?: number;
  theme: SpotEffectTheme;
}) {
  const { rings, sparks, dust, flashColor } = useMemo(
    () => buildShockwaveBurst(seed, !!compact, theme),
    [seed, compact, theme],
  );

  return (
    <div className={`party-shockwave-burst party-spot-theme-${theme.id}`} aria-hidden>
      <span
        className="party-sw-center-flash"
        style={{
          animationDelay: syncDelaySec(delaySec),
          ["--sw-flash" as string]: flashColor,
        }}
      />
      {rings.map((r, i) => (
        <span
          key={`ring-${i}`}
          className="party-sw-ring"
          style={{
            borderColor: r.color,
            borderWidth: r.width,
            color: r.color,
            animationDelay: syncDelaySec(delaySec + r.delay),
            ["--sw-scale" as string]: String(r.maxScale),
          }}
        />
      ))}
      {sparks.map((s, i) => (
        <span
          key={`spark-${i}`}
          className="party-sw-spark"
          style={{
            background: s.color,
            width: s.size,
            height: s.size,
            animationDelay: syncDelaySec(delaySec + s.delay),
            ["--spark-angle" as string]: `${s.angle}deg`,
            ["--spark-dist" as string]: `${s.dist}px`,
          }}
        />
      ))}
      {dust.map((d, i) => (
        <span
          key={`dust-${i}`}
          className="party-sw-dust"
          style={{
            animationDelay: syncDelaySec(delaySec + d.delay),
            ["--spark-angle" as string]: `${d.angle}deg`,
            ["--spark-dist" as string]: `${d.dist}px`,
            ["--sw-flash" as string]: flashColor,
          }}
        />
      ))}
    </div>
  );
}

function Shockwave({ effect, compact }: { effect: PartyEffect; compact?: boolean }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("shockwave", effect.id), [effect.id]);
  const bursts = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-wave`);
    if (compact) {
      return [{ id: `${effect.id}-main`, ox: 0, oy: 0, delay: 0 }];
    }
    return [
      { id: `${effect.id}-main`, ox: 0, oy: 0, delay: 0 },
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `${effect.id}-sw${i}`,
        ox: (rng() - 0.5) * 14,
        oy: (rng() - 0.5) * 12,
        delay: 0.12 + i * 0.16 + rng() * 0.08,
      })),
    ];
  }, [effect.id, compact]);

  return (
    <div className="party-effect-anchor" style={anchorStyle}>
      {bursts.map((b) => (
        <div
          key={b.id}
          className={b.ox || b.oy ? "party-shockwave-secondary-anchor" : undefined}
          style={
            b.ox || b.oy
              ? {
                  ["--sw-x" as string]: `${b.ox}vw`,
                  ["--sw-y" as string]: `${b.oy}vh`,
                }
              : undefined
          }
        >
          <ShockwaveBurst seed={b.id} compact={compact || !!(b.ox || b.oy)} delaySec={b.delay} theme={theme} />
        </div>
      ))}
    </div>
  );
}

function Hearts({ effect }: { effect: PartyEffect }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("hearts", effect.id), [effect.id]);
  const heartColors = theme.heartColors ?? theme.palette;
  const hearts = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-hearts`);
    return Array.from({ length: 18 }, (_, i) => {
      const angle = (i / 18) * Math.PI * 2 + rng() * 0.5;
      const radius = 20 + rng() * 90;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius - 40,
        delay: rng() * 0.15,
        scale: 0.6 + rng() * 1.1,
        color: pickSeeded(rng, heartColors),
      };
    });
  }, [effect.id, heartColors]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      {hearts.map((h, i) => (
        <span
          key={i}
          className="party-heart"
          style={{
            color: h.color,
            animationDelay: syncDelaySec(h.delay),
            ["--heart-x" as string]: `${h.x}px`,
            ["--heart-y" as string]: `${h.y}px`,
            ["--heart-scale" as string]: String(h.scale),
          }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}

function Lasers({ effect }: { effect: PartyEffect }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("lasers", effect.id), [effect.id]);
  const beams = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-laser`);
    return Array.from({ length: 12 }, (_, i) => ({
      angle: (i / 12) * 360 + rng() * 10,
      color: pickSeeded(rng, theme.palette),
      width: 2 + rng() * 2,
      length: 160 + rng() * 80,
      delay: rng() * 0.08,
      sweep: 80 + rng() * 60,
    }));
  }, [effect.id, theme.palette]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      <span className="party-laser-core" />
      {beams.map((b, i) => (
        <span
          key={i}
          className="party-laser-beam"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${b.color} 42%, #fff 50%, ${b.color} 58%, transparent 100%)`,
            boxShadow: `0 0 8px ${b.color}`,
            height: b.width,
            width: b.length,
            marginTop: -(b.width / 2),
            marginLeft: -(b.length / 2),
            animationDelay: syncDelaySec(b.delay),
            ["--laser-angle" as string]: `${b.angle}deg`,
            ["--laser-sweep" as string]: `${b.sweep}deg`,
          }}
        />
      ))}
    </div>
  );
}

function Bubbles({ effect }: { effect: PartyEffect }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("bubbles", effect.id), [effect.id]);
  const hueRange = theme.bubbleHue ?? { min: 0, max: 360 };
  const bubbles = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-bubble`);
    return Array.from({ length: 22 }, () => ({
      x: (rng() - 0.5) * 160,
      size: 12 + rng() * 38,
      delay: rng() * 0.35,
      drift: (rng() - 0.5) * 90,
      hue: Math.floor(hueRange.min + rng() * (hueRange.max - hueRange.min)),
    }));
  }, [effect.id, hueRange.min, hueRange.max]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="party-bubble"
          style={{
            width: b.size,
            height: b.size,
            animationDelay: syncDelaySec(b.delay),
            ["--bubble-x" as string]: `${b.x}px`,
            ["--bubble-drift" as string]: `${b.drift}px`,
            ["--bubble-hue" as string]: String(b.hue),
          }}
        />
      ))}
    </div>
  );
}

function Stars({ effect, compact }: { effect: PartyEffect; compact?: boolean }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("stars", effect.id), [effect.id]);
  const glyphs = theme.starGlyphs ?? ["★", "✦", "✧", "✶", "⋆"];
  const stars = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-stars`);
    const count = compact ? 12 : 24;
    return Array.from({ length: count }, () => {
      const angle = rng() * Math.PI * 2;
      const dist = 15 + rng() * 110;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        delay: rng() * 0.18,
        scale: 0.7 + rng() * 1.6,
        glyph: pickSeeded(rng, glyphs),
        color: pickSeeded(rng, theme.palette),
      };
    });
  }, [effect.id, compact, glyphs, theme.palette]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      <span className="party-star-flare" />
      {stars.map((s, i) => (
        <span
          key={i}
          className="party-star"
          style={{
            color: s.color,
            animationDelay: syncDelaySec(s.delay),
            ["--star-x" as string]: `${s.x}px`,
            ["--star-y" as string]: `${s.y}px`,
            ["--star-scale" as string]: String(s.scale),
          }}
        >
          {s.glyph}
        </span>
      ))}
    </div>
  );
}

function MusicalNotes({ effect }: { effect: PartyEffect }) {
  const anchorStyle = useSpotEffectAnchorStyle(effect);
  const theme = useMemo(() => getSpotEffectTheme("notes", effect.id), [effect.id]);
  const glyphs = theme.noteGlyphs ?? ["♪", "♫", "♬", "♩", "🎵", "🎶"];
  const notes = useMemo(() => {
    const rng = createSeededRng(`${effect.id}-notes`);
    return Array.from({ length: 18 }, () => ({
      x: (rng() - 0.5) * 160,
      rise: 80 + rng() * 220,
      drift: (rng() - 0.5) * 70,
      delay: rng() * 0.28,
      scale: 0.75 + rng() * 1.3,
      glyph: pickSeeded(rng, glyphs),
      color: pickSeeded(rng, theme.palette),
      wobble: (rng() - 0.5) * 24,
    }));
  }, [effect.id, glyphs, theme.palette]);

  return (
    <div className={`party-effect-anchor party-spot-theme-${theme.id}`} style={anchorStyle}>
      {notes.map((n, i) => (
        <span
          key={i}
          className="party-note"
          style={{
            color: n.color,
            animationDelay: syncDelaySec(n.delay),
            ["--note-x" as string]: `${n.x}px`,
            ["--note-rise" as string]: `${n.rise}px`,
            ["--note-drift" as string]: `${n.drift}px`,
            ["--note-scale" as string]: String(n.scale),
            ["--note-wobble" as string]: `${n.wobble}px`,
          }}
        >
          {n.glyph}
        </span>
      ))}
    </div>
  );
}

function EffectRenderer({ effect }: { effect: PartyEffect }) {
  switch (effect.type as PartyEffectType | "spotlight") {
    case "confetti":
      return <Confetti effect={effect} />;
    case "shockwave":
    case "spotlight":
      return <Shockwave effect={effect} />;
    case "hearts":
      return <Hearts effect={effect} />;
    case "lasers":
      return <Lasers effect={effect} />;
    case "bubbles":
      return <Bubbles effect={effect} />;
    case "stars":
      return <Stars effect={effect} />;
    case "notes":
      return <MusicalNotes effect={effect} />;
    case "fireworks":
    default:
      return <Fireworks effect={effect} />;
  }
}

interface PartyEffectOverlayProps {
  effects: PartyEffect[];
}

export function PartyEffectStyles() {
  return (
    <style>{`
        .party-effects-root {
          pointer-events: none;
        }
        .party-effect-anchor {
          position: absolute;
          transform: translate(-50%, -50%);
          width: 0;
          height: 0;
        }
        .party-firework-burst {
          position: absolute;
          transform: scale(var(--burst-scale, 1));
        }
        .party-firework-secondary-anchor {
          position: absolute;
          transform: translate(var(--sec-x), var(--sec-y));
        }
        .party-firework-particle {
          position: absolute;
          border-radius: 9999px;
          animation: party-firework-burst ${T.fireworkBurst}ms cubic-bezier(0.08, 0.82, 0.22, 1) forwards,
            party-firework-drift ${PARTY_EFFECT_PLAY_MS}ms ease-in forwards;
          animation-delay: var(--burst-delay, 0s), var(--burst-delay, 0s);
        }
        .party-firework-trail::after {
          content: "";
          position: absolute;
          inset: 20% 20% auto auto;
          width: 120%;
          height: 2px;
          background: linear-gradient(90deg, currentColor, transparent);
          transform-origin: left center;
          opacity: 0.55;
        }
        .party-firework-spark {
          position: absolute;
          width: 2px;
          height: 2px;
          border-radius: 9999px;
          animation: party-firework-burst ${T.fireworkBurst}ms cubic-bezier(0.08, 0.82, 0.22, 1) forwards,
            party-firework-drift ${PARTY_EFFECT_PLAY_MS}ms ease-in forwards;
        }
        .party-firework-flash {
          position: absolute;
          width: 32px;
          height: 32px;
          margin: -16px 0 0 -16px;
          border-radius: 9999px;
          background: var(--fw-flash-bg, radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,220,120,0.35) 45%, transparent 75%));
          animation: party-firework-flash ${T.fireworkFlash}ms ease-out forwards;
          animation-delay: var(--burst-delay, 0s);
        }
        .party-firework-flash-main {
          width: 52px;
          height: 52px;
          margin: -26px 0 0 -26px;
        }
        .party-firework-core {
          position: absolute;
          width: 10px;
          height: 10px;
          margin: -5px 0 0 -5px;
          border-radius: 9999px;
          background: #fff;
          box-shadow: 0 0 8px #fff, 0 0 16px var(--fw-core-glow, #ffd56a);
          animation: party-firework-core ${T.fireworkCore}ms ease-out forwards;
        }
        @keyframes party-firework-burst {
          0% { transform: rotate(var(--burst-angle)) translateX(0) translateY(0) scale(1.15); opacity: 1; }
          55% { transform: rotate(var(--burst-angle)) translateX(calc(var(--burst-dist) * 0.92)) translateY(calc(var(--burst-wobble) * 0.3)) scale(0.75); opacity: 1; }
          100% { transform: rotate(var(--burst-angle)) translateX(var(--burst-dist)) translateY(calc(var(--burst-wobble) * 0.5)) scale(0.12); opacity: 0; }
        }
        @keyframes party-firework-drift {
          0%, 40% { margin-top: 0; }
          100% { margin-top: calc(var(--burst-dist) * 0.28); }
        }
        @keyframes party-firework-flash {
          0% { transform: scale(0.15); opacity: 1; }
          35% { transform: scale(1.5); opacity: 0.85; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes party-firework-core {
          0% { transform: scale(0.2); opacity: 1; }
          20% { transform: scale(1.8); opacity: 1; }
          100% { transform: scale(0.4); opacity: 0; }
        }
        .party-firework-willow .party-firework-particle {
          animation: party-firework-burst ${T.fireworkBurst}ms cubic-bezier(0.08, 0.82, 0.22, 1) forwards,
            party-firework-willow-fall ${PARTY_EFFECT_PLAY_MS}ms ease-in forwards;
        }
        @keyframes party-firework-willow-fall {
          0%, 35% { margin-top: 0; }
          100% { margin-top: calc(var(--burst-dist) * 0.55); }
        }
        .party-confetti-blast {
          position: absolute;
          width: 36px;
          height: 36px;
          margin: -18px 0 0 -18px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,220,120,0.35) 45%, transparent 72%);
          animation: party-confetti-blast 320ms ease-out forwards;
        }
        @keyframes party-confetti-blast {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .party-confetti-piece {
          position: absolute;
          animation: party-confetti-burst ${T.confetti}ms cubic-bezier(0.12, 0.84, 0.28, 1) forwards;
        }
        @keyframes party-confetti-burst {
          0% { transform: translate(0, 0) rotate(0deg) scale(0.35); opacity: 0; }
          6% { opacity: 1; transform: translate(calc(var(--confetti-x) * 0.15), calc(var(--confetti-rise) * -0.55)) rotate(calc(var(--confetti-rot) * 0.05)) scale(1); }
          28% { transform: translate(calc(var(--confetti-x) * 0.55), calc(var(--confetti-rise) * -1)) rotate(calc(var(--confetti-rot) * 0.25)) scale(1); opacity: 1; }
          100% { transform: translate(var(--confetti-x), var(--confetti-fall)) rotate(var(--confetti-rot)); opacity: 0; }
        }
        .party-shockwave-burst {
          position: absolute;
          width: 0;
          height: 0;
        }
        .party-shockwave-secondary-anchor {
          position: absolute;
          transform: translate(var(--sw-x), var(--sw-y));
        }
        .party-sw-center-flash {
          position: absolute;
          width: 48px;
          height: 48px;
          margin: -24px 0 0 -24px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, var(--sw-flash) 38%, transparent 72%);
          animation: party-sw-center-flash 420ms ease-out forwards;
        }
        .party-sw-ring {
          position: absolute;
          width: 24px;
          height: 24px;
          margin: -12px 0 0 -12px;
          border-radius: 9999px;
          border-style: solid;
          box-shadow: 0 0 14px currentColor, inset 0 0 8px rgba(255,255,255,0.25);
          animation: party-sw-ring-expand ${T.shockwave}ms cubic-bezier(0.06, 0.88, 0.18, 1) forwards;
        }
        .party-sw-spark {
          position: absolute;
          border-radius: 9999px;
          margin: -50% 0 0 -50%;
          box-shadow: 0 0 6px currentColor;
          animation: party-sw-spark-fly 880ms cubic-bezier(0.08, 0.92, 0.22, 1) forwards;
        }
        .party-sw-dust {
          position: absolute;
          width: 3px;
          height: 3px;
          margin: -1.5px 0 0 -1.5px;
          border-radius: 9999px;
          background: var(--sw-flash);
          opacity: 0.85;
          animation: party-sw-spark-fly 720ms cubic-bezier(0.1, 0.9, 0.25, 1) forwards;
        }
        @keyframes party-sw-center-flash {
          0% { transform: scale(0.15); opacity: 1; }
          35% { transform: scale(1.4); opacity: 0.95; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes party-sw-ring-expand {
          0% { transform: scale(0.25); opacity: 0.92; }
          100% { transform: scale(var(--sw-scale, 12)); opacity: 0; }
        }
        @keyframes party-sw-spark-fly {
          0% { transform: rotate(var(--spark-angle)) translate(0) scale(1); opacity: 1; }
          100% { transform: rotate(var(--spark-angle)) translate(var(--spark-dist)) scale(0.15); opacity: 0; }
        }
        .party-note {
          position: absolute;
          font-size: 1.55rem;
          line-height: 1;
          animation: party-note-float ${T.notes}ms cubic-bezier(0.12, 0.8, 0.28, 1) forwards;
        }
        @keyframes party-note-float {
          0% { transform: translate(0, 0) scale(calc(0.25 * var(--note-scale))) rotate(-8deg); opacity: 0; }
          10% { opacity: 1; }
          40% { transform: translate(calc(var(--note-x) + var(--note-wobble)), calc(var(--note-rise) * -0.85)) scale(var(--note-scale)) rotate(6deg); opacity: 1; }
          100% { transform: translate(calc(var(--note-x) + var(--note-drift)), calc(var(--note-rise) * -1)) scale(calc(var(--note-scale) * 0.9)) rotate(12deg); opacity: 0; }
        }
        .party-heart {
          position: absolute;
          font-size: 1.5rem;
          text-shadow: 0 0 8px currentColor;
          animation: party-heart-spiral ${T.hearts}ms cubic-bezier(0.12, 0.8, 0.25, 1) forwards;
        }
        @keyframes party-heart-spiral {
          0% { transform: translate(0, 0) scale(calc(0.3 * var(--heart-scale))); opacity: 0; }
          10% { opacity: 1; }
          45% { transform: translate(calc(var(--heart-x) * 0.85), calc(var(--heart-y) * 0.85)) scale(var(--heart-scale)); opacity: 1; }
          100% { transform: translate(var(--heart-x), var(--heart-y)) scale(calc(var(--heart-scale) * 0.85)); opacity: 0; }
        }
        .party-laser-core {
          position: absolute;
          width: 14px;
          height: 14px;
          margin: -7px 0 0 -7px;
          border-radius: 9999px;
          background: radial-gradient(circle, #fff 0%, #ffd56a 50%, transparent 100%);
          box-shadow: 0 0 12px #fff, 0 0 20px #ff85c0;
          animation: party-laser-core ${T.laser}ms ease-out forwards;
        }
        .party-laser-beam {
          position: absolute;
          transform-origin: center center;
          animation: party-laser-spin ${T.laser}ms cubic-bezier(0.15, 0.9, 0.25, 1) forwards;
        }
        @keyframes party-laser-core {
          0% { transform: scale(0.3); opacity: 0.5; }
          12% { transform: scale(1.5); opacity: 1; }
          28% { transform: scale(1); opacity: 0.9; }
          45% { transform: scale(1.3); opacity: 1; }
          62% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(0.4); opacity: 0; }
        }
        @keyframes party-laser-spin {
          0% { transform: rotate(var(--laser-angle)) scaleX(0); opacity: 0; }
          12% { transform: rotate(var(--laser-angle)) scaleX(1); opacity: 1; }
          55% { transform: rotate(calc(var(--laser-angle) + var(--laser-sweep))) scaleX(1); opacity: 0.85; }
          100% { transform: rotate(calc(var(--laser-angle) + var(--laser-sweep) + 40deg)) scaleX(0.6); opacity: 0; }
        }
        .party-bubble {
          position: absolute;
          border-radius: 9999px;
          border: 2px solid hsla(var(--bubble-hue), 80%, 72%, 0.75);
          background:
            radial-gradient(circle at 32% 28%, hsla(0, 0%, 100%, 0.72) 0%, transparent 28%),
            radial-gradient(circle at 50% 50%, hsla(var(--bubble-hue), 70%, 82%, 0.22) 0%, transparent 70%);
          box-shadow: inset 0 0 0 1px hsla(0, 0%, 100%, 0.35);
          animation: party-bubble-float ${T.bubble}ms cubic-bezier(0.15, 0.75, 0.25, 1) forwards;
        }
        @keyframes party-bubble-float {
          0% { transform: translate(var(--bubble-x), 24px) scale(0.25); opacity: 0; }
          8% { opacity: 0.92; transform: translate(var(--bubble-x), 0) scale(0.9); }
          100% { transform: translate(calc(var(--bubble-x) + var(--bubble-drift)), -210px) scale(1); opacity: 0; }
        }
        .party-star-flare {
          position: absolute;
          width: 40px;
          height: 40px;
          margin: -20px 0 0 -20px;
          background: radial-gradient(circle, #fff 0%, rgba(255,215,80,0.6) 35%, transparent 70%);
          animation: party-star-flare 420ms ease-out forwards;
        }
        .party-star {
          position: absolute;
          font-size: 1.2rem;
          text-shadow: 0 0 10px currentColor, 0 0 18px currentColor;
          animation: party-star-burst ${T.stars}ms cubic-bezier(0.1, 0.82, 0.25, 1) forwards;
        }
        @keyframes party-star-flare {
          0% { transform: scale(0.15) rotate(0deg); opacity: 1; }
          100% { transform: scale(2.2) rotate(70deg); opacity: 0; }
        }
        @keyframes party-star-burst {
          0% { transform: translate(0, 0) scale(calc(0.15 * var(--star-scale))) rotate(0deg); opacity: 0; }
          12% { opacity: 1; }
          50% { transform: translate(calc(var(--star-x) * 0.9), calc(var(--star-y) * 0.9)) scale(var(--star-scale)) rotate(120deg); opacity: 1; }
          100% { transform: translate(var(--star-x), var(--star-y)) scale(calc(var(--star-scale) * 0.8)) rotate(200deg); opacity: 0; }
        }
      `}</style>
  );
}

export function PartyEffectOverlay({ effects }: PartyEffectOverlayProps) {
  if (!effects.length) return null;

  return (
    <div className="party-effects-root absolute inset-0 overflow-hidden" aria-hidden>
      {effects.map((effect) => (
        <EffectRenderer key={effect.id} effect={effect} />
      ))}
    </div>
  );
}

export function ArrivalBurst({
  effect,
  kind,
}: {
  effect: PartyEffect;
  kind: "fireworks" | "shockwave" | "stars";
}) {
  const landing: PartyEffect = { ...effect, id: `${effect.id}-land` };
  switch (kind) {
    case "shockwave":
      return <Shockwave effect={landing} compact />;
    case "stars":
      return <Stars effect={landing} compact />;
    case "fireworks":
    default:
      return <Fireworks effect={landing} compact />;
  }
}
