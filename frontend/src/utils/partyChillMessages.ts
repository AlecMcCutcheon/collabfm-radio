const PARTY_CHILL_MESSAGES = [
  "Chill fam",
  "Easy tiger",
  "Whoa there, sparkle chief",
  "One vibe at a time",
  "Slow your roll",
  "Party meter's full",
  "Even raves need cooldowns",
  "The effects machine needs air",
  "DJ says dial it back",
  "You're hogging the confetti",
  "Calm the chaos",
  "Take five, legend",
  "Pace yourself, superstar",
  "That's a lot of party",
  "Breathe, then boom",
] as const;

let lastPick = -1;

export function pickPartyChillMessage(): string {
  let idx = Math.floor(Math.random() * PARTY_CHILL_MESSAGES.length);
  if (idx === lastPick) idx = (idx + 1) % PARTY_CHILL_MESSAGES.length;
  lastPick = idx;
  return PARTY_CHILL_MESSAGES[idx];
}

export interface PartyChillBubble {
  id: string;
  message: string;
  x: number;
  y: number;
  at: number;
}

export const PARTY_CHILL_BUBBLE_MS = 5200;
