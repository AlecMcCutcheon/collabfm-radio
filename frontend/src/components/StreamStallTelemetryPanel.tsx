import { useMemo } from "react";
import type { StreamStallTelemetry } from "../utils/streamStallTelemetry";

interface StreamStallTelemetryPanelProps {
  open: boolean;
  onClose: () => void;
  telemetry: StreamStallTelemetry;
  playing: boolean;
}

function formatTime(ts: number | null): string {
  if (ts === null) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function formatEventLabel(event: StreamStallTelemetry["events"][number]): string {
  const base =
    event.type === "warmup"
      ? `warmup ${formatMs(event.durationMs ?? null)} (${event.cause ?? "?"})`
      : `stall ${formatMs(event.durationMs ?? null)} (${event.cause ?? "?"})`;

  const startAhead = event.stallStartDecodeAheadMs;
  const endAhead = event.decodeAheadMs;
  if (startAhead !== undefined && startAhead !== null) {
    return `${base} · start ${startAhead}ms ahead`;
  }
  if (endAhead !== null) {
    return `${base} · ${endAhead}ms ahead`;
  }
  return base;
}

export function StreamStallTelemetryPanel({
  open,
  onClose,
  telemetry,
  playing,
}: StreamStallTelemetryPanelProps) {
  const sessionLabel = useMemo(() => {
    if (!telemetry.sessionStartedAt) return playing ? "0:00" : "not listening";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - telemetry.sessionStartedAt) / 1000));
    const min = Math.floor(elapsedSec / 60);
    const sec = elapsedSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }, [telemetry.sessionStartedAt, open, playing]);

  if (!open) return null;

  const decodeAheadLabel = telemetry.decodeAheadAvailable
    ? formatMs(telemetry.bufferedAheadMs)
    : "n/a (live)";

  return (
    <div className="fixed bottom-3 right-3 z-40 w-[min(92vw,320px)] rounded-lg border border-gray-700/80 bg-gray-950/95 p-3 text-[11px] leading-relaxed text-gray-300 shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide text-gray-500">Stream buffer</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          aria-label="Close stream buffer telemetry"
        >
          ×
        </button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-gray-500">Server delay</dt>
        <dd>{formatMs(telemetry.serverStreamDelayMs)}</dd>
        <dt className="text-gray-500">Hub queue</dt>
        <dd>{formatMs(telemetry.serverDelayQueueMs)}</dd>
        <dt className="text-gray-500">Session</dt>
        <dd>{sessionLabel}</dd>
        <dt className="text-gray-500">Warmup</dt>
        <dd>{telemetry.inWarmup ? "yes" : "no"}</dd>
        <dt className="text-gray-500">Decode ahead</dt>
        <dd>{decodeAheadLabel}</dd>
        <dt className="text-gray-500">Stalls</dt>
        <dd>{telemetry.stallCount}</dd>
        <dt className="text-gray-500">Stall total</dt>
        <dd>{formatMs(telemetry.totalStallMs)}</dd>
        <dt className="text-gray-500">Last stall</dt>
        <dd>
          {telemetry.lastStallDurationMs !== null
            ? `${formatMs(telemetry.lastStallDurationMs)} @ ${formatTime(telemetry.lastStallAt)}`
            : "—"}
        </dd>
      </dl>

      <p className="mt-2 text-[10px] text-gray-600">
        Stalls mean the MP3 decoder ran out of audio ahead of playback. Warmup events during
        connect are logged separately and not counted.
      </p>

      {telemetry.events.length > 0 && (
        <div className="mt-3 max-h-36 overflow-y-auto border-t border-gray-800 pt-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-600">Recent</p>
          <ul className="space-y-1 font-mono text-[10px] text-gray-400">
            {[...telemetry.events].reverse().map((event, index) => (
              <li key={`${event.at}-${event.type}-${index}`}>
                {formatTime(event.at)} {formatEventLabel(event)}
                {event.decodeAheadMs !== null && event.stallStartDecodeAheadMs != null
                  ? ` → ${event.decodeAheadMs}ms`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
