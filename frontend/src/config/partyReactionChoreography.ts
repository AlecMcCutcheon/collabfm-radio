import type { PartyEffectType } from "../types/api";
import { createSeededRng } from "../utils/partyEffectSeed";
import { REACTION_SCENE_BANKS } from "./partyReactionScenes";

export {
  REACTION_DURATION_MS,
  type ReactionProp,
  type ReactionPropAnim,
  type ReactionScene,
  type ReactionSlot,
  type AvatarAnim,
  type StageMotion,
} from "./partyReactionTypes";

import type { ReactionScene, ReactionSlot } from "./partyReactionTypes";

const SLOT_STYLE: Record<ReactionSlot, { left: string; top: string }> = {
  "left-hand": { left: "-38px", top: "14px" },
  "right-hand": { left: "38px", top: "14px" },
  "above": { left: "0", top: "-52px" },
  "below": { left: "0", top: "56px" },
  "upper-left": { left: "-30px", top: "-40px" },
  "upper-right": { left: "30px", top: "-40px" },
  "lower-left": { left: "-38px", top: "40px" },
  "lower-right": { left: "38px", top: "40px" },
};

export function slotPosition(slot: ReactionSlot) {
  return SLOT_STYLE[slot];
}

const FALLBACK_SCENE: ReactionScene = {
  variant: 0,
  avatarAnim: "pop",
  ring: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(167, 139, 250, 0.85))",
  stageMotion: "rise",
  props: [{ emoji: "✨", slot: "above", anim: "sparkle", delayMs: 100 }],
  floaters: [],
};

export function getReactionScene(type: PartyEffectType, effectId: string): ReactionScene {
  const bank = REACTION_SCENE_BANKS[type];
  if (!bank?.length) return FALLBACK_SCENE;

  const rng = createSeededRng(`${effectId}:scene`);
  const variant = Math.floor(rng() * bank.length);
  const picked = bank[variant]!;
  return { ...picked, variant };
}

export function variantCountFor(type: PartyEffectType): number {
  return REACTION_SCENE_BANKS[type]?.length ?? 1;
}
