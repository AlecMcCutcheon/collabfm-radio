/** Deterministic RNG so every client renders the same effect layout. */
export function createSeededRng(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (Math.imul(31, state) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickSeeded<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}
