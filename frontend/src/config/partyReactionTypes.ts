export const REACTION_DURATION_MS = 3200;

export type ReactionSlot =
  | "left-hand"
  | "right-hand"
  | "above"
  | "below"
  | "upper-left"
  | "upper-right"
  | "lower-left"
  | "lower-right";

export type ReactionPropAnim =
  | "hand-pop"
  | "hand-wave"
  | "hand-release-left"
  | "hand-release-right"
  | "clap-left"
  | "clap-right"
  | "heart-float"
  | "heart-blow-left"
  | "heart-blow-right"
  | "sparkle"
  | "bounce-in"
  | "wiggle"
  | "flame-rise"
  | "devil-float"
  | "drift-away-left"
  | "drift-away-right"
  | "tear-fall"
  | "sink-down"
  | "sway-float"
  | "rock-sway"
  | "note-drift-left"
  | "note-drift-right";

export type AvatarAnim = "pop" | "bounce" | "sway" | "pulse" | "shake" | "giggle";

export type StageMotion = "rise" | "drift-left" | "drift-right" | "hop" | "sway" | "sink";

export interface ReactionProp {
  emoji: string;
  slot: ReactionSlot;
  anim: ReactionPropAnim;
  delayMs: number;
  scale?: number;
  mirror?: boolean;
}

export interface ReactionScene {
  variant: number;
  avatarAnim: AvatarAnim;
  ring: string;
  stageMotion: StageMotion;
  props: ReactionProp[];
  floaters: ReactionProp[];
}

export type ReactionSceneDef = Omit<ReactionScene, "variant">;
