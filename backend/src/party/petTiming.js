import { createSeededRng } from "./partyEffectSeed.js";

/** Ms after react_pet before react_pet_hearts — mirrors frontend partyPetScenes heartPhaseStartMs */
const PET_HEART_PHASE_MS = [1870, 1870, 2050, 2010, 1850, 2050, 2070, 2150, 2070, 2310];

export const PET_VARIANT_COUNT = PET_HEART_PHASE_MS.length;

export function petVariantForEffectId(effectId) {
  const rng = createSeededRng(`${effectId}:pet`);
  return Math.floor(rng() * PET_VARIANT_COUNT);
}

export function petHeartDelayMs(variant) {
  return PET_HEART_PHASE_MS[variant] ?? PET_HEART_PHASE_MS[0];
}
