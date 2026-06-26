import type { ReactionSceneDef } from "./partyReactionTypes";

function s(
  avatarAnim: ReactionSceneDef["avatarAnim"],
  ring: string,
  props: ReactionSceneDef["props"],
  floaters: ReactionSceneDef["floaters"] = [],
  stageMotion: ReactionSceneDef["stageMotion"] = "rise",
): ReactionSceneDef {
  return { avatarAnim, ring, props, floaters, stageMotion };
}

/** Two additional choreographies per reaction type (merged into scene banks at load). */
export const REACTION_SCENE_EXTRAS: Record<string, ReactionSceneDef[]> = {
  react_thumbs_up: [
    s("bounce", "linear-gradient(135deg, #fef9c3, #facc15)", [
      { emoji: "👍", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.2 },
      { emoji: "⭐", slot: "left-hand", anim: "sparkle", delayMs: 200, scale: 0.9 },
      { emoji: "⭐", slot: "right-hand", anim: "sparkle", delayMs: 260, scale: 0.9 },
    ], [
      { emoji: "🎯", slot: "lower-left", anim: "drift-away-left", delayMs: 340, scale: 0.75 },
    ], "hop"),
    s("sway", "linear-gradient(135deg, #fff7ed, #fb923c)", [
      { emoji: "🤙", slot: "left-hand", anim: "hand-wave", delayMs: 80, scale: 1.05 },
      { emoji: "👍", slot: "right-hand", anim: "hand-pop", delayMs: 160, scale: 1.1 },
      { emoji: "😎", slot: "above", anim: "sway-float", delayMs: 280, scale: 0.95 },
    ], [], "drift-right"),
  ],
  react_thumbs_down: [
    s("shake", "linear-gradient(135deg, #e2e8f0, #64748b)", [
      { emoji: "👎", slot: "above", anim: "sink-down", delayMs: 90, scale: 1.1 },
      { emoji: "🙃", slot: "left-hand", anim: "wiggle", delayMs: 220, scale: 0.9 },
    ], [
      { emoji: "💨", slot: "lower-right", anim: "drift-away-right", delayMs: 360, scale: 0.8 },
    ], "sink"),
    s("shake", "linear-gradient(135deg, #94a3b8, #334155)", [
      { emoji: "👎", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 1 },
      { emoji: "👎", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 1 },
      { emoji: "😤", slot: "above", anim: "bounce-in", delayMs: 240, scale: 0.95 },
    ], [], "drift-left"),
  ],
  react_love: [
    s("pulse", "linear-gradient(135deg, #fce7f3, #ec4899)", [
      { emoji: "💝", slot: "above", anim: "bounce-in", delayMs: 70, scale: 1.05 },
      { emoji: "🫰", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 1 },
      { emoji: "🫰", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 1, mirror: true },
    ], [
      { emoji: "💞", slot: "upper-left", anim: "heart-float", delayMs: 350, scale: 0.85 },
      { emoji: "💞", slot: "upper-right", anim: "heart-float", delayMs: 420, scale: 0.85 },
    ]),
    s("bounce", "linear-gradient(135deg, #fda4af, #e11d48)", [
      { emoji: "💌", slot: "below", anim: "bounce-in", delayMs: 100, scale: 0.9 },
      { emoji: "❤️‍🔥", slot: "above", anim: "sway-float", delayMs: 200, scale: 1.1 },
    ], [
      { emoji: "✨", slot: "lower-left", anim: "sparkle", delayMs: 320, scale: 0.75 },
      { emoji: "✨", slot: "lower-right", anim: "sparkle", delayMs: 400, scale: 0.75 },
    ], "hop"),
  ],
  react_laugh: [
    s("giggle", "linear-gradient(135deg, #fef08a, #eab308)", [
      { emoji: "🤣", slot: "left-hand", anim: "hand-wave", delayMs: 60, scale: 1.05 },
      { emoji: "😂", slot: "right-hand", anim: "hand-wave", delayMs: 120, scale: 1.05, mirror: true },
      { emoji: "💀", slot: "above", anim: "bounce-in", delayMs: 260, scale: 0.9 },
    ], [
      { emoji: "😹", slot: "below", anim: "wiggle", delayMs: 380, scale: 0.85 },
    ]),
    s("bounce", "linear-gradient(135deg, #fff59d, #f9a825)", [
      { emoji: "😆", slot: "above", anim: "bounce-in", delayMs: 50, scale: 1.15 },
      { emoji: "🤪", slot: "left-hand", anim: "hand-pop", delayMs: 190, scale: 0.95 },
      { emoji: "🤪", slot: "right-hand", anim: "hand-pop", delayMs: 250, scale: 0.95 },
    ], [
      { emoji: "💦", slot: "upper-left", anim: "tear-fall", delayMs: 340, scale: 0.7 },
      { emoji: "💦", slot: "upper-right", anim: "tear-fall", delayMs: 410, scale: 0.7 },
    ], "drift-right"),
  ],
  react_fire: [
    s("pulse", "linear-gradient(135deg, #ff8a65, #bf360c)", [
      { emoji: "🔥", slot: "above", anim: "flame-rise", delayMs: 50, scale: 1.2 },
      { emoji: "💥", slot: "left-hand", anim: "hand-pop", delayMs: 180, scale: 0.9 },
      { emoji: "💥", slot: "right-hand", anim: "hand-pop", delayMs: 240, scale: 0.9 },
    ], [
      { emoji: "⚡", slot: "upper-right", anim: "sparkle", delayMs: 320, scale: 0.85 },
    ], "hop"),
    s("bounce", "linear-gradient(135deg, #ffab91, #e64a19)", [
      { emoji: "🌋", slot: "below", anim: "flame-rise", delayMs: 80, scale: 0.95 },
      { emoji: "🔥", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 1.05 },
      { emoji: "🔥", slot: "right-hand", anim: "hand-release-right", delayMs: 260, scale: 1.05 },
      { emoji: "🥵", slot: "above", anim: "bounce-in", delayMs: 340, scale: 1 },
    ], [], "drift-left"),
  ],
  react_clap: [
    s("bounce", "linear-gradient(135deg, #c4b5fd, #7c3aed)", [
      { emoji: "👏", slot: "above", anim: "bounce-in", delayMs: 80, scale: 1.1 },
      { emoji: "🎉", slot: "left-hand", anim: "hand-pop", delayMs: 200, scale: 0.95 },
      { emoji: "🎊", slot: "right-hand", anim: "hand-pop", delayMs: 260, scale: 0.95 },
    ], [
      { emoji: "✨", slot: "lower-left", anim: "sparkle", delayMs: 360, scale: 0.7 },
    ]),
    s("sway", "linear-gradient(135deg, #ddd6fe, #5b21b6)", [
      { emoji: "🙌", slot: "above", anim: "sway-float", delayMs: 60, scale: 1.05 },
      { emoji: "👏", slot: "left-hand", anim: "clap-left", delayMs: 0, scale: 1.1 },
      { emoji: "👏", slot: "right-hand", anim: "clap-right", delayMs: 0, scale: 1.1 },
    ], [
      { emoji: "🏆", slot: "upper-right", anim: "drift-away-right", delayMs: 300, scale: 0.8 },
    ], "drift-right"),
  ],
  react_wow: [
    s("pop", "linear-gradient(135deg, #7dd3fc, #0369a1)", [
      { emoji: "🤯", slot: "below", anim: "bounce-in", delayMs: 100, scale: 0.95 },
      { emoji: "😲", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.15 },
      { emoji: "💫", slot: "left-hand", anim: "sparkle", delayMs: 240, scale: 0.9 },
    ], [
      { emoji: "✨", slot: "upper-right", anim: "drift-away-right", delayMs: 380, scale: 0.75 },
    ]),
    s("shake", "linear-gradient(135deg, #bae6fd, #0c4a6e)", [
      { emoji: "😱", slot: "left-hand", anim: "wiggle", delayMs: 70, scale: 1 },
      { emoji: "😱", slot: "right-hand", anim: "wiggle", delayMs: 130, scale: 1, mirror: true },
      { emoji: "🫨", slot: "above", anim: "sway-float", delayMs: 250, scale: 1.05 },
    ], [
      { emoji: "‼️", slot: "lower-left", anim: "bounce-in", delayMs: 360, scale: 0.8 },
    ], "hop"),
  ],
  react_devil: [
    s("pulse", "linear-gradient(135deg, #c084fc, #6b21a8)", [
      { emoji: "😈", slot: "below", anim: "devil-float", delayMs: 90, scale: 1 },
      { emoji: "🔥", slot: "left-hand", anim: "flame-rise", delayMs: 200, scale: 0.9 },
      { emoji: "👿", slot: "above", anim: "bounce-in", delayMs: 160, scale: 1.1 },
    ], [
      { emoji: "💜", slot: "upper-right", anim: "heart-float", delayMs: 340, scale: 0.8 },
    ]),
    s("sway", "linear-gradient(135deg, #e879f9, #581c87)", [
      { emoji: "😏", slot: "left-hand", anim: "hand-wave", delayMs: 80, scale: 1 },
      { emoji: "😈", slot: "right-hand", anim: "hand-pop", delayMs: 160, scale: 1.05 },
      { emoji: "🔥", slot: "above", anim: "flame-rise", delayMs: 280, scale: 0.85 },
    ], [], "drift-left"),
  ],
  react_wink: [
    s("bounce", "linear-gradient(135deg, #f9a8d4, #db2777)", [
      { emoji: "😉", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.15 },
      { emoji: "💅", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 0.9 },
      { emoji: "✨", slot: "right-hand", anim: "sparkle", delayMs: 280, scale: 0.85 },
    ], [
      { emoji: "💕", slot: "below", anim: "heart-float", delayMs: 380, scale: 0.8 },
    ]),
    s("sway", "linear-gradient(135deg, #fbcfe8, #be185d)", [
      { emoji: "😘", slot: "left-hand", anim: "hand-pop", delayMs: 90, scale: 0.95 },
      { emoji: "😉", slot: "right-hand", anim: "wiggle", delayMs: 150, scale: 1.1 },
      { emoji: "🤭", slot: "above", anim: "sway-float", delayMs: 260, scale: 0.95 },
    ], [], "drift-right"),
  ],
  react_jammin: [
    s("sway", "linear-gradient(135deg, #a5b4fc, #4338ca)", [
      { emoji: "🎹", slot: "left-hand", anim: "rock-sway", delayMs: 0, scale: 0.95 },
      { emoji: "🎸", slot: "right-hand", anim: "rock-sway", delayMs: 80, scale: 1.05, mirror: true },
      { emoji: "🎤", slot: "above", anim: "bounce-in", delayMs: 200, scale: 1 },
    ], [
      { emoji: "🎵", slot: "lower-left", anim: "note-drift-left", delayMs: 320, scale: 0.85 },
      { emoji: "🎵", slot: "lower-right", anim: "note-drift-right", delayMs: 400, scale: 0.85 },
    ], "sway"),
    s("bounce", "linear-gradient(135deg, #c7d2fe, #3730a3)", [
      { emoji: "🪩", slot: "above", anim: "sway-float", delayMs: 70, scale: 0.9 },
      { emoji: "🕺", slot: "left-hand", anim: "hand-wave", delayMs: 180, scale: 0.95 },
      { emoji: "💃", slot: "right-hand", anim: "hand-wave", delayMs: 240, scale: 0.95, mirror: true },
      { emoji: "🔥", slot: "below", anim: "flame-rise", delayMs: 340, scale: 0.8 },
    ], [], "hop"),
  ],
  react_cry: [
    s("shake", "linear-gradient(135deg, #93c5fd, #1e40af)", [
      { emoji: "😭", slot: "above", anim: "bounce-in", delayMs: 70, scale: 1.1 },
      { emoji: "🥺", slot: "left-hand", anim: "hand-release-left", delayMs: 200, scale: 0.95 },
      { emoji: "💧", slot: "right-hand", anim: "tear-fall", delayMs: 280, scale: 0.9 },
    ], [
      { emoji: "🌧️", slot: "below", anim: "sink-down", delayMs: 400, scale: 0.85 },
    ], "sink"),
    s("sway", "linear-gradient(135deg, #bfdbfe, #2563eb)", [
      { emoji: "😢", slot: "above", anim: "sway-float", delayMs: 80, scale: 1.05 },
      { emoji: "😿", slot: "left-hand", anim: "wiggle", delayMs: 200, scale: 1 },
      { emoji: "😿", slot: "right-hand", anim: "wiggle", delayMs: 260, scale: 1, mirror: true },
    ], [
      { emoji: "💧", slot: "upper-left", anim: "tear-fall", delayMs: 340, scale: 0.75 },
      { emoji: "💧", slot: "upper-right", anim: "tear-fall", delayMs: 410, scale: 0.75 },
    ], "drift-left"),
  ],
  react_kiss: [
    s("pulse", "linear-gradient(135deg, #fecdd3, #be123c)", [
      { emoji: "😘", slot: "above", anim: "bounce-in", delayMs: 60, scale: 1.15 },
      { emoji: "💋", slot: "left-hand", anim: "hand-release-left", delayMs: 180, scale: 1.05 },
      { emoji: "💋", slot: "right-hand", anim: "hand-release-right", delayMs: 240, scale: 1.05 },
    ], [
      { emoji: "💘", slot: "upper-left", anim: "heart-blow-left", delayMs: 360, scale: 0.9 },
      { emoji: "💘", slot: "upper-right", anim: "heart-blow-right", delayMs: 430, scale: 0.9 },
    ]),
    s("sway", "linear-gradient(135deg, #ffe4e6, #e11d48)", [
      { emoji: "🥰", slot: "above", anim: "sway-float", delayMs: 70, scale: 1.05 },
      { emoji: "💑", slot: "below", anim: "bounce-in", delayMs: 200, scale: 0.85 },
    ], [
      { emoji: "❤️", slot: "left-hand", anim: "heart-float", delayMs: 320, scale: 0.95 },
      { emoji: "💖", slot: "right-hand", anim: "heart-float", delayMs: 390, scale: 0.95 },
      { emoji: "✨", slot: "upper-right", anim: "sparkle", delayMs: 460, scale: 0.7 },
    ], "drift-right"),
  ],
};
