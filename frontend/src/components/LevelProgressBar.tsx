import type { LevelInfo } from "../types/api";
import { formatLevelLabel } from "../utils/leveling";

interface LevelProgressBarProps {
  level?: LevelInfo | null;
  compact?: boolean;
  showTotalXp?: boolean;
}

export function LevelProgressBar({ level, compact = false, showTotalXp = false }: LevelProgressBarProps) {
  if (!level) return null;

  return (
    <div className={compact ? "mt-2" : "mt-2.5"}>
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400 mb-1">
        <span className="font-semibold text-indigo-200">{formatLevelLabel(level)}</span>
        <span>
          {level.xpIntoLevel}/{level.xpForNextLevel} XP
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700/90 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all duration-500"
          style={{ width: `${level.progressPct}%` }}
        />
      </div>
      {showTotalXp && (
        <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
          {level.experiencePoints.toLocaleString()} XP total
        </p>
      )}
    </div>
  );
}
