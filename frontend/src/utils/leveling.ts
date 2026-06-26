import type { LevelInfo } from "../types/api";

export function formatLevelLabel(level?: LevelInfo | null): string {
  if (!level) return "";
  return `Level ${level.level}`;
}
