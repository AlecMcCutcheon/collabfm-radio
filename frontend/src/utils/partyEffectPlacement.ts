export type EffectPlacementSide = "left" | "right";

export interface PartyEffectPlacement {
  offsetPxX: number;
  offsetPxY: number;
  side: EffectPlacementSide;
}

/** Offset a party effect away from the click point toward open screen space. */
export function computePartyEffectPlacement(
  normX: number,
  normY: number,
  footprintHalfW: number,
  footprintHalfH: number,
): PartyEffectPlacement {
  if (typeof window === "undefined") {
    return { offsetPxX: footprintHalfW * 0.85, offsetPxY: -24, side: "right" };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const px = normX * vw;
  const py = normY * vh;
  const margin = 12;

  const spaceLeft = px - margin;
  const spaceRight = vw - px - margin;
  const spaceTop = py - margin;
  const spaceBottom = vh - py - margin;

  const side: EffectPlacementSide = spaceRight >= spaceLeft ? "right" : "left";
  const horizontalRoom = side === "right" ? spaceRight : spaceLeft;
  const offsetPxX =
    side === "right"
      ? Math.min(horizontalRoom * 0.42, footprintHalfW + 36)
      : -Math.min(horizontalRoom * 0.42, footprintHalfW + 36);

  let offsetPxY = -Math.min(32, spaceTop * 0.15);
  if (spaceBottom < footprintHalfH && spaceTop > spaceBottom) {
    offsetPxY = -Math.min(spaceTop * 0.28, footprintHalfH * 0.55);
  } else if (spaceTop < footprintHalfH * 0.45) {
    offsetPxY = Math.min(spaceBottom * 0.12, 28);
  }

  return { offsetPxX, offsetPxY, side };
}

export function profileReactionPlacement(normX: number, normY: number): PartyEffectPlacement {
  const base = computePartyEffectPlacement(normX, normY, 150, 115);
  return { ...base, offsetPxY: base.offsetPxY + 20 };
}

export function pointerReactionPlacement(normX: number, normY: number): PartyEffectPlacement {
  return computePartyEffectPlacement(normX, normY, 72, 64);
}
