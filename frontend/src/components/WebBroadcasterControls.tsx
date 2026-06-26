import { Mic, Square } from "lucide-react";
import { useWebBroadcast } from "../context/WebBroadcastContext";

interface WebBroadcasterControlsProps {
  compact?: boolean;
}

export function WebBroadcasterControls({ compact = false }: WebBroadcasterControlsProps) {
  const {
    enabled,
    status,
    error,
    nowPlaying,
    isLive,
    localPlaybackMuted,
    captureSupported,
    captureUnsupportedMessage,
    start,
    stop,
  } = useWebBroadcast();

  const statusText =
    error ??
    (!captureSupported && captureUnsupportedMessage
      ? captureUnsupportedMessage
      : isLive
      ? nowPlaying || "Broadcasting"
      : status === "connecting"
        ? "Connecting…"
        : "Pick a tab playing music when you start.");

  const muteNote =
    localPlaybackMuted === false
      ? "This browser may still play tab audio locally while you broadcast — use headphones or mute the source tab to avoid hearing your own stream."
      : localPlaybackMuted === true
        ? "Captured tab audio is muted locally so you can listen on the site or Discord without echo."
        : null;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div
        className={`rounded-xl border px-3 py-2.5 text-sm ${
          isLive
            ? "border-green-600/50 bg-green-900/20 text-green-200"
            : error || (!captureSupported && captureUnsupportedMessage)
              ? "border-amber-600/50 bg-amber-900/20 text-amber-100"
              : "border-gray-700 bg-gray-800/60 text-gray-300"
        }`}
      >
        {statusText}
      </div>

      {muteNote && <p className="text-xs text-gray-500 leading-relaxed">{muteNote}</p>}

      {isLive ? (
        <button
          type="button"
          onClick={() => stop()}
          disabled={!enabled}
          className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-br from-radio-red to-red-700 hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Square className="w-4 h-4" />
          Stop broadcasting
        </button>
      ) : (
        <button
          type="button"
          disabled={!enabled || status === "connecting" || !captureSupported}
          onClick={() => void start()}
          className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-br from-radio-accent to-blue-500 hover:brightness-110 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Mic className="w-4 h-4" />
          {status === "connecting" ? "Starting…" : "Start broadcasting"}
        </button>
      )}
    </div>
  );
}
