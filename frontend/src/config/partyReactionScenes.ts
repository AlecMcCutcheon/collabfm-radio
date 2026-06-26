import type { ReactionProp, ReactionSceneDef, StageMotion } from "./partyReactionTypes";
import { REACTION_SCENE_EXTRAS } from "./partyReactionScenesExtra";

function s(
  avatarAnim: ReactionSceneDef["avatarAnim"],
  ring: string,
  props: ReactionProp[],
  floaters: ReactionProp[] = [],
  stageMotion: StageMotion = "rise",
): ReactionSceneDef {
  return { avatarAnim, ring, props, floaters, stageMotion };
}

export const REACTION_SCENE_BANKS: Record<string, ReactionSceneDef[]> = {
  react_thumbs_up: [
    s("bounce", "linear-gradient(135deg, #fef08a, #fbbf24)", [
      { emoji: "👍", slot: "left-hand", anim: "hand-wave", delayMs: 80, scale: 1.15 },
      { emoji: "👍", slot: "right-hand", anim: "hand-wave", delayMs: 140, scale: 1.15, mirror: true },
      { emoji: "✨", slot: "above", anim: "sparkle", delayMs: 260, scale: 0.9 },
    ]),
    s("pop", "linear-gradient(135deg, #fde68a, #f59e0b)", [
      { emoji: "🙌", slot: "left-hand", anim: "hand-pop", delayMs: 60, scale: 1.05 },
      { emoji: "🙌", slot: "right-hand", anim: "hand-pop", delayMs: 120, scale: 1.05, mirror: true },
      { emoji: "💯", slot: "above", anim: "bounce-in", delayMs: 300, scale: 0.85 },
    ], [
      { emoji: "⭐", slot: "upper-left", anim: "sparkle", delayMs: 400, scale: 0.75 },
      { emoji: "⭐", slot: "upper-right", anim: "sparkle", delayMs: 480, scale: 0.75 },
    ]),
    s("sway", "linear-gradient(135deg, #fff, #fcd34d)", [
      { emoji: "👍", slot: "left-hand", anim: "hand-release-left", delayMs: 50, scale: 1.1 },
      { emoji: "👍", slot: "right-hand", anim: "hand-release-right", delayMs: 100, scale: 1.1, mirror: true },
      { emoji: "😊", slot: "above", anim: "bounce-in", delayMs: 220, scale: 0.95 },
    ], [], "drift-right"),
    s("bounce", "linear-gradient(135deg, #fef3c7, #f59e0b)", [
      { emoji: "👊", slot: "left-hand", anim: "hand-pop", delayMs: 70, scale: 0.95 },
      { emoji: "👍", slot: "above", anim: "bounce-in", delayMs: 160, scale: 1.1 },
    ], [
      { emoji: "✨", slot: "lower-left", anim: "sparkle", delayMs: 300, scale: 0.7 },
      { emoji: "✨", slot: "lower-right", anim: "sparkle", delayMs: 380, scale: 0.7 },
    ], "hop"),
    s("pop", "linear-gradient(135deg, #fffbeb, #eab308)", [
      { emoji: "🙏", slot: "below", anim: "bounce-in", delayMs: 80, scale: 0.9 },
      { emoji: "👍", slot: "left-hand", anim: "hand-wave", delayMs: 180, scale: 1.05 },
      { emoji: "👍", slot: "right-hand", anim: "hand-wave", delayMs: 240, scale: 1.05, mirror: true },
    ], [], "drift-left"),
  ],

  react_thumbs_down: [
    s("shake", "linear-gradient(135deg, #cbd5e1, #64748b)", [
      { emoji: "👎", slot: "left-hand", anim: "wiggle", delayMs: 60, scale: 1.1 },
      { emoji: "👎", slot: "right-hand", anim: "wiggle", delayMs: 120, scale: 1.1, mirror: true },
      { emoji: "😬", slot: "above", anim: "bounce-in", delayMs: 240, scale: 0.9 },
    ]),
    s("shake", "linear-gradient(135deg, #94a3b8, #475569)", [
      { emoji: "👎", slot: "left-hand", anim: "hand-pop", delayMs: 80 },
      { emoji: "🫤", slot: "above", anim: "bounce-in", delayMs: 200, scale: 1 },
    ], [
      { emoji: "💨", slot: "upper-right", anim: "drift-away-right", delayMs: 320, scale: 0.8 },
    ]),
    s("shake", "linear-gradient(135deg, #b0bec5, #546e7a)", [
      { emoji: "👎", slot: "left-hand", anim: "hand-release-left", delayMs: 50, scale: 1.05 },
      { emoji: "😒", slot: "above", anim: "bounce-in", delayMs: 220, scale: 0.95 },
    ], [
      { emoji: "💨", slot: "lower-left", anim: "drift-away-left", delayMs: 340, scale: 0.75 },
    ], "drift-left"),
    s("shake", "linear-gradient(135deg, #cfd8dc, #607d8b)", [
      { emoji: "🙅", slot: "left-hand", anim: "hand-wave", delayMs: 70, scale: 0.95 },
      { emoji: "👎", slot: "right-hand", anim: "hand-pop", delayMs: 140, scale: 1.05 },
    ], [
      { emoji: "😑", slot: "upper-right", anim: "wiggle", delayMs: 280, scale: 0.85 },
    ], "hop"),
    s("shake", "linear-gradient(135deg, #90a4ae, #37474f)", [
      { emoji: "👎", slot: "below", anim: "sink-down", delayMs: 100, scale: 1.1 },
      { emoji: "😞", slot: "above", anim: "bounce-in", delayMs: 180, scale: 0.9 },
    ], [], "drift-right"),
  ],

  react_love: [
    s("pulse", "linear-gradient(135deg, #fecdd3, #f472b6)", [
      { emoji: "🤗", slot: "left-hand", anim: "hand-wave", delayMs: 70, scale: 1.05 },
      { emoji: "🤗", slot: "right-hand", anim: "hand-wave", delayMs: 130, scale: 1.05, mirror: true },
      { emoji: "❤️", slot: "above", anim: "bounce-in", delayMs: 200, scale: 1.1 },
    ], [
      { emoji: "💕", slot: "lower-left", anim: "heart-float", delayMs: 280, scale: 0.85 },
      { emoji: "💖", slot: "lower-right", anim: "heart-float", delayMs: 360, scale: 0.85 },
    ]),
    s("sway", "linear-gradient(135deg, #fda4af, #e11d48)", [
      { emoji: "🫶", slot: "left-hand", anim: "hand-release-left", delayMs: 60, scale: 1.1 },
      { emoji: "🫶", slot: "right-hand", anim: "hand-release-right", delayMs: 120, scale: 1.1, mirror: true },
    ], [
      { emoji: "❤️", slot: "left-hand", anim: "heart-blow-left", delayMs: 260, scale: 1 },
      { emoji: "💘", slot: "right-hand", anim: "heart-blow-right", delayMs: 320, scale: 0.9 },
      { emoji: "✨", slot: "above", anim: "sparkle", delayMs: 400, scale: 0.7 },
    ], "drift-right"),
    s("bounce", "linear-gradient(135deg, #fbcfe8, #db2777)", [
      { emoji: "😍", slot: "above", anim: "bounce-in", delayMs: 100, scale: 1.05 },
      { emoji: "💋", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 0.95 },
      { emoji: "💋", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 0.9, mirror: true },
    ], [
      { emoji: "❤️", slot: "upper-left", anim: "heart-blow-left", delayMs: 340, scale: 0.85 },
      { emoji: "❤️", slot: "upper-right", anim: "heart-blow-right", delayMs: 400, scale: 0.85 },
    ]),
    s("pulse", "linear-gradient(135deg, #ffe4e6, #fb7185)", [
      { emoji: "🥰", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.05 },
      { emoji: "🤲", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.95 },
      { emoji: "🤲", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.95, mirror: true },
    ], [
      { emoji: "💗", slot: "lower-left", anim: "heart-blow-left", delayMs: 350, scale: 0.8 },
      { emoji: "💗", slot: "lower-right", anim: "heart-blow-right", delayMs: 420, scale: 0.8 },
    ], "hop"),
    s("sway", "linear-gradient(135deg, #f9a8d4, #be185d)", [
      { emoji: "💑", slot: "above", anim: "sway-float", delayMs: 60, scale: 0.85 },
      { emoji: "❤️", slot: "left-hand", anim: "hand-release-left", delayMs: 150, scale: 1 },
      { emoji: "❤️", slot: "right-hand", anim: "hand-release-right", delayMs: 210, scale: 1, mirror: true },
    ], [
      { emoji: "💕", slot: "above", anim: "heart-float", delayMs: 320, scale: 0.9 },
    ], "drift-left"),
  ],

  react_laugh: [
    s("giggle", "linear-gradient(135deg, #fef08a, #facc15)", [
      { emoji: "😂", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.2 },
      { emoji: "🤣", slot: "left-hand", anim: "wiggle", delayMs: 180, scale: 1 },
      { emoji: "😆", slot: "right-hand", anim: "wiggle", delayMs: 240, scale: 1 },
    ], [
      { emoji: "💀", slot: "upper-left", anim: "bounce-in", delayMs: 350, scale: 0.75 },
      { emoji: "😭", slot: "upper-right", anim: "bounce-in", delayMs: 420, scale: 0.75 },
    ]),
    s("giggle", "linear-gradient(135deg, #fde047, #eab308)", [
      { emoji: "😂", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.15 },
      { emoji: "👏", slot: "left-hand", anim: "clap-left", delayMs: 200, scale: 0.95 },
      { emoji: "👏", slot: "right-hand", anim: "clap-right", delayMs: 200, scale: 0.95 },
    ], [
      { emoji: "😹", slot: "lower-left", anim: "wiggle", delayMs: 300, scale: 0.85 },
      { emoji: "🤪", slot: "lower-right", anim: "wiggle", delayMs: 380, scale: 0.85 },
    ]),
    s("giggle", "linear-gradient(135deg, #fff176, #fdd835)", [
      { emoji: "🤣", slot: "above", anim: "sway-float", delayMs: 70, scale: 1.1 },
      { emoji: "😂", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 0.95 },
      { emoji: "😂", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 0.95, mirror: true },
    ], [], "hop"),
    s("bounce", "linear-gradient(135deg, #ffee58, #fbc02d)", [
      { emoji: "😆", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.1 },
      { emoji: "🙈", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.9 },
      { emoji: "🙉", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.9 },
    ], [
      { emoji: "💦", slot: "lower-left", anim: "tear-fall", delayMs: 320, scale: 0.75 },
      { emoji: "💦", slot: "lower-right", anim: "tear-fall", delayMs: 400, scale: 0.75 },
    ], "drift-right"),
    s("giggle", "linear-gradient(135deg, #fff9c4, #f9a825)", [
      { emoji: "😂", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 1 },
      { emoji: "😂", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 1 },
      { emoji: "🤣", slot: "above", anim: "bounce-in", delayMs: 220, scale: 1.05 },
    ], [
      { emoji: "✨", slot: "upper-left", anim: "sparkle", delayMs: 350, scale: 0.7 },
    ], "drift-left"),
  ],

  react_fire: [
    s("pulse", "linear-gradient(135deg, #fed7aa, #ea580c)", [
      { emoji: "🔥", slot: "below", anim: "flame-rise", delayMs: 40, scale: 1.2 },
      { emoji: "🔥", slot: "lower-left", anim: "flame-rise", delayMs: 120, scale: 0.95 },
      { emoji: "🔥", slot: "lower-right", anim: "flame-rise", delayMs: 180, scale: 0.95 },
    ], [
      { emoji: "💯", slot: "above", anim: "bounce-in", delayMs: 260, scale: 0.9 },
      { emoji: "⚡", slot: "upper-left", anim: "sparkle", delayMs: 340, scale: 0.8 },
    ]),
    s("bounce", "linear-gradient(135deg, #ffedd5, #f97316)", [
      { emoji: "🥵", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.05 },
      { emoji: "🔥", slot: "left-hand", anim: "flame-rise", delayMs: 160, scale: 1 },
      { emoji: "🔥", slot: "right-hand", anim: "flame-rise", delayMs: 220, scale: 1 },
    ], [
      { emoji: "✨", slot: "below", anim: "sparkle", delayMs: 300, scale: 0.75 },
    ]),
    s("pulse", "linear-gradient(135deg, #ffcc80, #e65100)", [
      { emoji: "🔥", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.15 },
      { emoji: "👊", slot: "left-hand", anim: "hand-pop", delayMs: 180, scale: 0.95 },
      { emoji: "🔥", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 1 },
    ], [
      { emoji: "⚡", slot: "upper-right", anim: "drift-away-right", delayMs: 320, scale: 0.85 },
    ], "hop"),
    s("bounce", "linear-gradient(135deg, #ffe0b2, #ff6d00)", [
      { emoji: "🚀", slot: "above", anim: "bounce-in", delayMs: 100, scale: 0.85 },
      { emoji: "🔥", slot: "left-hand", anim: "flame-rise", delayMs: 200, scale: 0.95 },
      { emoji: "🔥", slot: "right-hand", anim: "flame-rise", delayMs: 260, scale: 0.95 },
    ], [
      { emoji: "💥", slot: "below", anim: "bounce-in", delayMs: 350, scale: 0.8 },
    ], "drift-left"),
    s("pulse", "linear-gradient(135deg, #fff3e0, #fb8c00)", [
      { emoji: "🔥", slot: "left-hand", anim: "hand-wave", delayMs: 50, scale: 1.1 },
      { emoji: "🔥", slot: "right-hand", anim: "hand-wave", delayMs: 110, scale: 1.1, mirror: true },
      { emoji: "😤", slot: "above", anim: "bounce-in", delayMs: 220, scale: 0.95 },
    ], [], "drift-right"),
  ],

  react_clap: [
    s("bounce", "linear-gradient(135deg, #ddd6fe, #8b5cf6)", [
      { emoji: "👏", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 1.15 },
      { emoji: "👏", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 1.15 },
      { emoji: "🎉", slot: "above", anim: "bounce-in", delayMs: 200, scale: 1 },
    ], [
      { emoji: "✨", slot: "upper-left", anim: "sparkle", delayMs: 320, scale: 0.7 },
      { emoji: "✨", slot: "upper-right", anim: "sparkle", delayMs: 380, scale: 0.7 },
    ]),
    s("sway", "linear-gradient(135deg, #e9d5ff, #a855f7)", [
      { emoji: "🙌", slot: "above", anim: "hand-pop", delayMs: 60, scale: 1.05 },
      { emoji: "👏", slot: "left-hand", anim: "clap-left", delayMs: 140, scale: 1.1 },
      { emoji: "👏", slot: "right-hand", anim: "clap-right", delayMs: 140, scale: 1.1 },
    ], [
      { emoji: "🎊", slot: "below", anim: "bounce-in", delayMs: 280, scale: 0.85 },
    ]),
    s("bounce", "linear-gradient(135deg, #d8b4fe, #9333ea)", [
      { emoji: "👏", slot: "left-hand", anim: "hand-release-left", delayMs: 0, scale: 1.1 },
      { emoji: "👏", slot: "right-hand", anim: "hand-release-right", delayMs: 0, scale: 1.1 },
      { emoji: "🥳", slot: "above", anim: "sway-float", delayMs: 200, scale: 1 },
    ], [], "hop"),
    s("sway", "linear-gradient(135deg, #c4b5fd, #7c3aed)", [
      { emoji: "👏", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 1.05 },
      { emoji: "👏", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 1.05 },
    ], [
      { emoji: "⭐", slot: "upper-left", anim: "drift-away-left", delayMs: 280, scale: 0.8 },
      { emoji: "⭐", slot: "upper-right", anim: "drift-away-right", delayMs: 340, scale: 0.8 },
    ], "drift-left"),
    s("bounce", "linear-gradient(135deg, #ede9fe, #6d28d9)", [
      { emoji: "🙌", slot: "left-hand", anim: "hand-wave", delayMs: 80, scale: 1 },
      { emoji: "🙌", slot: "right-hand", anim: "hand-wave", delayMs: 140, scale: 1, mirror: true },
      { emoji: "👏", slot: "above", anim: "bounce-in", delayMs: 260, scale: 0.95 },
    ], [], "drift-right"),
  ],

  react_wow: [
    s("pop", "linear-gradient(135deg, #bae6fd, #0ea5e9)", [
      { emoji: "😮", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.15 },
      { emoji: "‼️", slot: "left-hand", anim: "wiggle", delayMs: 200, scale: 0.85 },
      { emoji: "❗", slot: "right-hand", anim: "wiggle", delayMs: 260, scale: 0.85 },
    ], [
      { emoji: "✨", slot: "upper-left", anim: "sparkle", delayMs: 320, scale: 0.8 },
      { emoji: "💫", slot: "below", anim: "sparkle", delayMs: 440, scale: 0.75 },
    ]),
    s("shake", "linear-gradient(135deg, #7dd3fc, #0284c7)", [
      { emoji: "🤯", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.1 },
      { emoji: "😲", slot: "left-hand", anim: "hand-pop", delayMs: 220, scale: 0.95 },
      { emoji: "😲", slot: "right-hand", anim: "hand-pop", delayMs: 280, scale: 0.95, mirror: true },
    ], [
      { emoji: "⭐", slot: "lower-left", anim: "sparkle", delayMs: 360, scale: 0.7 },
    ]),
    s("pop", "linear-gradient(135deg, #e0f2fe, #0369a1)", [
      { emoji: "😱", slot: "above", anim: "sway-float", delayMs: 70, scale: 1.05 },
      { emoji: "🫨", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 0.9 },
      { emoji: "🫨", slot: "right-hand", anim: "hand-release-right", delayMs: 260, scale: 0.9, mirror: true },
    ], [], "hop"),
    s("shake", "linear-gradient(135deg, #93c5fd, #1d4ed8)", [
      { emoji: "😮", slot: "left-hand", anim: "hand-wave", delayMs: 80, scale: 1 },
      { emoji: "😮", slot: "right-hand", anim: "hand-wave", delayMs: 140, scale: 1, mirror: true },
      { emoji: "💥", slot: "above", anim: "bounce-in", delayMs: 240, scale: 0.85 },
    ], [
      { emoji: "✨", slot: "upper-right", anim: "drift-away-right", delayMs: 350, scale: 0.75 },
    ], "drift-right"),
    s("pop", "linear-gradient(135deg, #bfdbfe, #2563eb)", [
      { emoji: "🤯", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.05 },
      { emoji: "👀", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.85 },
      { emoji: "👀", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.85 },
    ], [
      { emoji: "❓", slot: "lower-left", anim: "wiggle", delayMs: 340, scale: 0.8 },
      { emoji: "❓", slot: "lower-right", anim: "wiggle", delayMs: 400, scale: 0.8 },
    ], "drift-left"),
  ],

  react_devil: [
    s("sway", "linear-gradient(135deg, #fca5a5, #7c3aed)", [
      { emoji: "😈", slot: "above", anim: "devil-float", delayMs: 50, scale: 1.15 },
      { emoji: "👿", slot: "left-hand", anim: "wiggle", delayMs: 180, scale: 0.95 },
      { emoji: "👿", slot: "right-hand", anim: "wiggle", delayMs: 240, scale: 0.95, mirror: true },
    ], [
      { emoji: "🔥", slot: "lower-left", anim: "flame-rise", delayMs: 300, scale: 0.75 },
    ]),
    s("pulse", "linear-gradient(135deg, #f0abfc, #9333ea)", [
      { emoji: "😈", slot: "upper-left", anim: "devil-float", delayMs: 60, scale: 1 },
      { emoji: "😈", slot: "upper-right", anim: "devil-float", delayMs: 120, scale: 1 },
      { emoji: "💜", slot: "above", anim: "heart-float", delayMs: 200, scale: 0.9 },
    ], [
      { emoji: "✨", slot: "below", anim: "sparkle", delayMs: 320, scale: 0.7 },
    ]),
    s("sway", "linear-gradient(135deg, #e879f9, #6b21a8)", [
      { emoji: "😈", slot: "left-hand", anim: "hand-release-left", delayMs: 80, scale: 1 },
      { emoji: "🔥", slot: "right-hand", anim: "flame-rise", delayMs: 180, scale: 0.95 },
      { emoji: "😏", slot: "above", anim: "bounce-in", delayMs: 260, scale: 0.9 },
    ], [], "drift-right"),
    s("pulse", "linear-gradient(135deg, #d946ef, #581c87)", [
      { emoji: "👿", slot: "above", anim: "devil-float", delayMs: 60, scale: 1.1 },
      { emoji: "🔥", slot: "left-hand", anim: "hand-wave", delayMs: 200, scale: 0.9 },
      { emoji: "🔥", slot: "right-hand", anim: "hand-wave", delayMs: 260, scale: 0.9, mirror: true },
    ], [
      { emoji: "💀", slot: "lower-right", anim: "drift-away-right", delayMs: 350, scale: 0.75 },
    ], "hop"),
    s("sway", "linear-gradient(135deg, #f5d0fe, #86198f)", [
      { emoji: "😈", slot: "left-hand", anim: "hand-pop", delayMs: 70, scale: 1.05 },
      { emoji: "👿", slot: "right-hand", anim: "hand-pop", delayMs: 130, scale: 1.05, mirror: true },
    ], [
      { emoji: "🔥", slot: "above", anim: "flame-rise", delayMs: 220, scale: 0.85 },
      { emoji: "✨", slot: "below", anim: "sparkle", delayMs: 340, scale: 0.7 },
    ], "drift-left"),
  ],

  react_wink: [
    s("sway", "linear-gradient(135deg, #fbcfe8, #ec4899)", [
      { emoji: "😉", slot: "upper-right", anim: "wiggle", delayMs: 80, scale: 1.15 },
      { emoji: "😏", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.95 },
    ], [
      { emoji: "💕", slot: "upper-left", anim: "heart-blow-left", delayMs: 280, scale: 0.8 },
      { emoji: "✨", slot: "below", anim: "sparkle", delayMs: 360, scale: 0.75 },
    ]),
    s("bounce", "linear-gradient(135deg, #fce7f3, #db2777)", [
      { emoji: "😉", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.1 },
      { emoji: "🤭", slot: "left-hand", anim: "hand-pop", delayMs: 180, scale: 0.95 },
      { emoji: "💋", slot: "right-hand", anim: "hand-pop", delayMs: 240, scale: 0.9 },
    ], [
      { emoji: "💖", slot: "lower-left", anim: "heart-float", delayMs: 320, scale: 0.8 },
    ]),
    s("sway", "linear-gradient(135deg, #f9a8d4, #be123c)", [
      { emoji: "😉", slot: "left-hand", anim: "hand-release-left", delayMs: 80, scale: 1.05 },
      { emoji: "💋", slot: "right-hand", anim: "hand-release-right", delayMs: 140, scale: 0.95 },
    ], [
      { emoji: "💕", slot: "above", anim: "heart-blow-right", delayMs: 280, scale: 0.9 },
      { emoji: "✨", slot: "upper-left", anim: "sparkle", delayMs: 360, scale: 0.7 },
    ], "drift-right"),
    s("bounce", "linear-gradient(135deg, #fdf2f8, #e11d48)", [
      { emoji: "😘", slot: "above", anim: "bounce-in", delayMs: 70, scale: 1.05 },
      { emoji: "😉", slot: "left-hand", anim: "wiggle", delayMs: 200, scale: 0.95 },
      { emoji: "💋", slot: "right-hand", anim: "wiggle", delayMs: 260, scale: 0.9 },
    ], [], "hop"),
    s("sway", "linear-gradient(135deg, #fecdd3, #9d174d)", [
      { emoji: "😏", slot: "above", anim: "sway-float", delayMs: 60, scale: 1 },
      { emoji: "🤫", slot: "left-hand", anim: "hand-pop", delayMs: 180, scale: 0.9 },
      { emoji: "😉", slot: "right-hand", anim: "hand-pop", delayMs: 240, scale: 1.05 },
    ], [
      { emoji: "💫", slot: "lower-right", anim: "drift-away-right", delayMs: 340, scale: 0.75 },
    ], "drift-left"),
  ],

  react_jammin: [
    s("sway", "linear-gradient(135deg, #c4b5fd, #6366f1)", [
      { emoji: "🎸", slot: "left-hand", anim: "rock-sway", delayMs: 0, scale: 1.1 },
      { emoji: "🎸", slot: "right-hand", anim: "rock-sway", delayMs: 80, scale: 1.1, mirror: true },
      { emoji: "🎶", slot: "above", anim: "sway-float", delayMs: 160, scale: 1 },
    ], [
      { emoji: "🎵", slot: "upper-left", anim: "note-drift-left", delayMs: 280, scale: 0.85 },
      { emoji: "🎵", slot: "upper-right", anim: "note-drift-right", delayMs: 340, scale: 0.85 },
    ], "sway"),
    s("bounce", "linear-gradient(135deg, #a5b4fc, #4f46e5)", [
      { emoji: "🎤", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.05 },
      { emoji: "🕺", slot: "left-hand", anim: "hand-wave", delayMs: 180, scale: 0.95 },
      { emoji: "💃", slot: "right-hand", anim: "hand-wave", delayMs: 240, scale: 0.95, mirror: true },
    ], [
      { emoji: "🎶", slot: "lower-left", anim: "note-drift-left", delayMs: 320, scale: 0.8 },
    ], "hop"),
    s("sway", "linear-gradient(135deg, #ddd6fe, #7c3aed)", [
      { emoji: "🎧", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1 },
      { emoji: "🎸", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 1.05 },
      { emoji: "🔥", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.9 },
    ], [
      { emoji: "🎵", slot: "upper-right", anim: "note-drift-right", delayMs: 350, scale: 0.9 },
      { emoji: "✨", slot: "below", anim: "sparkle", delayMs: 420, scale: 0.7 },
    ], "drift-right"),
    s("pulse", "linear-gradient(135deg, #818cf8, #4338ca)", [
      { emoji: "🥁", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 0.95 },
      { emoji: "🥁", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 0.95 },
      { emoji: "🎶", slot: "above", anim: "sway-float", delayMs: 180, scale: 1.05 },
    ], [
      { emoji: "🎵", slot: "lower-left", anim: "note-drift-left", delayMs: 300, scale: 0.85 },
      { emoji: "🎵", slot: "lower-right", anim: "note-drift-right", delayMs: 380, scale: 0.85 },
    ], "sway"),
    s("bounce", "linear-gradient(135deg, #e0e7ff, #3730a3)", [
      { emoji: "🎷", slot: "left-hand", anim: "rock-sway", delayMs: 100, scale: 0.95 },
      { emoji: "🎺", slot: "right-hand", anim: "rock-sway", delayMs: 160, scale: 0.95, mirror: true },
      { emoji: "🤘", slot: "above", anim: "bounce-in", delayMs: 240, scale: 1.05 },
    ], [], "drift-left"),
  ],

  react_cry: [
    s("shake", "linear-gradient(135deg, #bfdbfe, #60a5fa)", [
      { emoji: "😢", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.1 },
      { emoji: "😿", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.95 },
      { emoji: "😿", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.95, mirror: true },
    ], [
      { emoji: "💧", slot: "lower-left", anim: "tear-fall", delayMs: 300, scale: 0.85 },
      { emoji: "💧", slot: "lower-right", anim: "tear-fall", delayMs: 380, scale: 0.85 },
    ]),
    s("sway", "linear-gradient(135deg, #93c5fd, #3b82f6)", [
      { emoji: "😭", slot: "above", anim: "sway-float", delayMs: 60, scale: 1.15 },
      { emoji: "🥺", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 0.95 },
      { emoji: "🥺", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 0.95, mirror: true },
    ], [
      { emoji: "💧", slot: "left-hand", anim: "tear-fall", delayMs: 320, scale: 0.9 },
      { emoji: "💧", slot: "right-hand", anim: "tear-fall", delayMs: 400, scale: 0.9 },
    ], "drift-left"),
    s("shake", "linear-gradient(135deg, #dbeafe, #2563eb)", [
      { emoji: "😢", slot: "left-hand", anim: "wiggle", delayMs: 80, scale: 1 },
      { emoji: "😢", slot: "right-hand", anim: "wiggle", delayMs: 140, scale: 1, mirror: true },
      { emoji: "💔", slot: "above", anim: "bounce-in", delayMs: 220, scale: 0.9 },
    ], [
      { emoji: "😭", slot: "below", anim: "sink-down", delayMs: 340, scale: 0.85 },
    ], "sink"),
    s("sway", "linear-gradient(135deg, #e0f2fe, #0284c7)", [
      { emoji: "🥲", slot: "above", anim: "bounce-in", delayMs: 70, scale: 1.05 },
      { emoji: "🤧", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.9 },
    ], [
      { emoji: "💧", slot: "upper-left", anim: "tear-fall", delayMs: 280, scale: 0.8 },
      { emoji: "💧", slot: "upper-right", anim: "tear-fall", delayMs: 340, scale: 0.8 },
      { emoji: "💧", slot: "below", anim: "tear-fall", delayMs: 420, scale: 0.75 },
    ], "drift-right"),
    s("shake", "linear-gradient(135deg, #bae6fd, #1d4ed8)", [
      { emoji: "😭", slot: "left-hand", anim: "hand-wave", delayMs: 60, scale: 1.05 },
      { emoji: "😭", slot: "right-hand", anim: "hand-wave", delayMs: 120, scale: 1.05, mirror: true },
      { emoji: "🌧️", slot: "above", anim: "sink-down", delayMs: 240, scale: 0.85 },
    ], [
      { emoji: "💦", slot: "lower-left", anim: "tear-fall", delayMs: 350, scale: 0.9 },
      { emoji: "💦", slot: "lower-right", anim: "tear-fall", delayMs: 420, scale: 0.9 },
    ], "sink"),
  ],

  react_kiss: [
    s("pulse", "linear-gradient(135deg, #fecdd3, #f43f5e)", [
      { emoji: "💋", slot: "left-hand", anim: "hand-release-left", delayMs: 60, scale: 1.05 },
      { emoji: "💋", slot: "right-hand", anim: "hand-release-right", delayMs: 120, scale: 1.05, mirror: true },
    ], [
      { emoji: "❤️", slot: "left-hand", anim: "heart-blow-left", delayMs: 260, scale: 1 },
      { emoji: "💕", slot: "right-hand", anim: "heart-blow-right", delayMs: 320, scale: 0.9 },
      { emoji: "✨", slot: "above", anim: "sparkle", delayMs: 400, scale: 0.75 },
    ], "drift-right"),
    s("sway", "linear-gradient(135deg, #fda4af, #e11d48)", [
      { emoji: "😘", slot: "above", anim: "bounce-in", delayMs: 70, scale: 1.1 },
      { emoji: "💋", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.95 },
      { emoji: "💋", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.95, mirror: true },
    ], [
      { emoji: "💖", slot: "upper-left", anim: "heart-blow-left", delayMs: 340, scale: 0.85 },
      { emoji: "💖", slot: "upper-right", anim: "heart-blow-right", delayMs: 400, scale: 0.85 },
    ]),
    s("bounce", "linear-gradient(135deg, #ffe4e6, #fb7185)", [
      { emoji: "💏", slot: "above", anim: "sway-float", delayMs: 80, scale: 0.9 },
      { emoji: "🤚", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 0.95 },
      { emoji: "🤚", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 0.95, mirror: true },
    ], [
      { emoji: "💋", slot: "above", anim: "heart-float", delayMs: 350, scale: 0.85 },
      { emoji: "❤️", slot: "below", anim: "heart-blow-right", delayMs: 420, scale: 0.8 },
    ], "hop"),
    s("pulse", "linear-gradient(135deg, #fbcfe8, #db2777)", [
      { emoji: "😽", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1 },
      { emoji: "💋", slot: "left-hand", anim: "hand-wave", delayMs: 180, scale: 1.05 },
      { emoji: "💋", slot: "right-hand", anim: "hand-wave", delayMs: 240, scale: 1.05, mirror: true },
    ], [
      { emoji: "💕", slot: "lower-left", anim: "heart-blow-left", delayMs: 320, scale: 0.9 },
      { emoji: "💕", slot: "lower-right", anim: "heart-blow-right", delayMs: 380, scale: 0.9 },
    ], "drift-left"),
    s("sway", "linear-gradient(135deg, #fff1f2, #be123c)", [
      { emoji: "💋", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.15 },
      { emoji: "😘", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 0.95 },
    ], [
      { emoji: "❤️", slot: "right-hand", anim: "heart-blow-right", delayMs: 320, scale: 1.05 },
      { emoji: "💘", slot: "upper-left", anim: "heart-blow-left", delayMs: 400, scale: 0.85 },
      { emoji: "✨", slot: "lower-right", anim: "sparkle", delayMs: 460, scale: 0.7 },
    ], "drift-right"),
  ],
};

for (const [key, extras] of Object.entries(REACTION_SCENE_EXTRAS)) {
  const bank = REACTION_SCENE_BANKS[key];
  if (bank) bank.push(...extras);
}
