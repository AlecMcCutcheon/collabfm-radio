import { createSeededRng } from "./partyEffectSeed.js";

const CHOICES = ["rock", "paper", "scissors"];

function pickRpsOutcome(reactorChoice, targetChoice) {
  if (reactorChoice === targetChoice) return "tie";
  if (
    (reactorChoice === "rock" && targetChoice === "scissors") ||
    (reactorChoice === "paper" && targetChoice === "rock") ||
    (reactorChoice === "scissors" && targetChoice === "paper")
  ) {
    return "reactor";
  }
  return "target";
}

/** Deterministic RPS duel so every client shows the same result. */
export function resolveProfileRps(effectId) {
  const rng = createSeededRng(`${effectId}:profile-rps`);
  const reactorChoice = CHOICES[Math.floor(rng() * CHOICES.length)];
  const targetChoice = CHOICES[Math.floor(rng() * CHOICES.length)];
  return {
    reactorChoice,
    targetChoice,
    outcome: pickRpsOutcome(reactorChoice, targetChoice),
  };
}
