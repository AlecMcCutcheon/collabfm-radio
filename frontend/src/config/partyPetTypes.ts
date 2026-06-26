export type PetPropAnim =
  | "pat-in"
  | "rub-side"
  | "scratch"
  | "kiss-peck"
  | "nose-boop"
  | "cheek-rub"
  | "heart-rise";

export interface PetProp {
  emoji: string;
  /** Degrees on logo: 0 = right, 90 = bottom, -90 = top */
  angleDeg: number;
  /** 1.0 = logo rim, ~1.12 = just outside for hands, ~0.2–0.35 = inside for hearts */
  rimFraction: number;
  anim: PetPropAnim;
  delayMs: number;
  durationMs: number;
  scale?: number;
  mirror?: boolean;
}

export interface PetScene {
  variant: number;
  props: PetProp[];
  hearts: PetProp[];
  heartPhaseStartMs: number;
  totalMs: number;
}

export type PetSceneDef = Omit<PetScene, "variant">;
