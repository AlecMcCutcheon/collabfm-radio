import type { PartyEffectType } from "../types/api";

export interface PartyMenuItem {
  type: PartyEffectType;
  label: string;
  icon: string;
}

export const PARTY_EFFECT_ITEMS: PartyMenuItem[] = [
  { type: "fireworks", label: "Fireworks", icon: "🎆" },
  { type: "confetti", label: "Confetti cannon", icon: "🎊" },
  { type: "shockwave", label: "Shockwave", icon: "💥" },
  { type: "hearts", label: "Love burst", icon: "💖" },
  { type: "lasers", label: "Laser show", icon: "🪩" },
  { type: "bubbles", label: "Bubble pop", icon: "🫧" },
  { type: "stars", label: "Star shower", icon: "🌟" },
  { type: "notes", label: "Musical notes", icon: "🎶" },
];

export const PARTY_ARRIVAL_ITEMS: PartyMenuItem[] = [
  { type: "rocket", label: "Rocket arrival", icon: "🚀" },
  { type: "comet", label: "Comet streak", icon: "☄️" },
  { type: "ufo", label: "UFO fly-in", icon: "🛸" },
  { type: "meteor", label: "Meteor drop", icon: "🌠" },
  { type: "lightning", label: "Lightning storm", icon: "⚡" },
  { type: "firefly", label: "Firefly swarm", icon: "✨" },
  { type: "satellite", label: "Satellite drop", icon: "🛰️" },
];

export const PARTY_REACTION_ITEMS: PartyMenuItem[] = [
  { type: "react_thumbs_up", label: "Thumbs up", icon: "👍" },
  { type: "react_thumbs_down", label: "Thumbs down", icon: "👎" },
  { type: "react_love", label: "Love it", icon: "❤️" },
  { type: "react_laugh", label: "LOL", icon: "😂" },
  { type: "react_fire", label: "Fire", icon: "🔥" },
  { type: "react_clap", label: "Applause", icon: "👏" },
  { type: "react_wow", label: "Wow", icon: "😮" },
  { type: "react_devil", label: "Devious", icon: "😈" },
  { type: "react_wink", label: "Wink", icon: "😉" },
  { type: "react_jammin", label: "Jammin'", icon: "🎸" },
  { type: "react_cry", label: "Tears", icon: "😢" },
  { type: "react_kiss", label: "Kiss", icon: "💋" },
];

/** Easter egg — only shown when the party menu opens from the radio logo. */
export const PARTY_PET_REACTION_ITEM: PartyMenuItem = {
  type: "react_pet",
  label: "Pet",
  icon: "🐾",
};

export const REACTION_EMOJI: Partial<Record<PartyEffectType, string>> = {
  react_thumbs_up: "👍",
  react_thumbs_down: "👎",
  react_love: "❤️",
  react_laugh: "😂",
  react_fire: "🔥",
  react_clap: "👏",
  react_wow: "😮",
  react_devil: "😈",
  react_wink: "😉",
  react_jammin: "🎸",
  react_cry: "😢",
  react_kiss: "💋",
  react_pet: "🐾",
};

export const TRAVEL_CONFIG: Partial<
  Record<PartyEffectType, { durationMs: number; arrival: "fireworks" | "shockwave" | "stars" | null }>
> = {
  rocket: { durationMs: 5200, arrival: null },
  comet: { durationMs: 2600, arrival: "shockwave" },
  ufo: { durationMs: 5200, arrival: "stars" },
  meteor: { durationMs: 2000, arrival: "shockwave" },
  lightning: { durationMs: 3000, arrival: "shockwave" },
  firefly: { durationMs: 4600, arrival: "fireworks" },
  satellite: { durationMs: 5000, arrival: "stars" },
};

export const ALL_PARTY_MENU_ITEMS: PartyMenuItem[] = [
  ...PARTY_EFFECT_ITEMS,
  ...PARTY_ARRIVAL_ITEMS,
  ...PARTY_REACTION_ITEMS,
];

const PARTY_MENU_BY_TYPE = new Map(ALL_PARTY_MENU_ITEMS.map((item) => [item.type, item]));

export function getPartyMenuItem(type: PartyEffectType): PartyMenuItem | undefined {
  return PARTY_MENU_BY_TYPE.get(type);
}

export const ASSIGNABLE_PARTY_EFFECT_TYPES = new Set<PartyEffectType>(
  ALL_PARTY_MENU_ITEMS.map((item) => item.type),
);
