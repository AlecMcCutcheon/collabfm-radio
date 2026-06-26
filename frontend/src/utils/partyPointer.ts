/** Normalized viewport position for party effects (0–1). */
export function pointerToNormalized(clientX: number, clientY: number): { x: number; y: number } {
  const w = typeof window !== "undefined" ? window.innerWidth : 1;
  const h = typeof window !== "undefined" ? window.innerHeight : 1;
  return {
    x: Math.max(0, Math.min(1, clientX / w)),
    y: Math.max(0, Math.min(1, clientY / h)),
  };
}
