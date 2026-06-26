import { useState } from "react";
import { Pin, PinOff, Play, SkipBack, SkipForward } from "lucide-react";
import { api } from "../api/client";
import type { GuestContext } from "../types/api";
import type { PinnedMediaTarget } from "../context/PinnedMediaControlContext";

interface MediaControlPanelProps {
  target: PinnedMediaTarget;
  guest?: GuestContext | null;
  showPin?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function MediaControlPanel({
  target,
  guest = null,
  showPin = false,
  pinned = false,
  onTogglePin,
}: MediaControlPanelProps) {
  const [busy, setBusy] = useState(false);
  const label = target.broadcastName?.trim() || "Browser extension";

  const sendMediaControl = async (action: "playPause" | "previous" | "next") => {
    setBusy(true);
    try {
      if (guest) {
        await api.sendGuestMediaControl(target.userId, action, guest);
      } else {
        await api.sendMediaControl(target.userId, action);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-xs text-gray-300 text-center flex-1 min-w-0">
          Controlling: <span className="text-white font-semibold">{label}</span>
          <span className="text-gray-400"> · {target.displayName || "Unknown User"}</span>
          {target.site && <div className="text-xs text-gray-400 mt-1">Site: {target.site}</div>}
        </div>
        {showPin && onTogglePin && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            className={`shrink-0 p-2 rounded-lg transition-colors ${
              pinned
                ? "bg-radio-accent text-white"
                : "bg-gray-600 text-gray-200 hover:bg-gray-500"
            }`}
            title={pinned ? "Unpin from radio page" : "Pin to radio page"}
            aria-pressed={pinned}
          >
            {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void sendMediaControl("playPause");
          }}
          className="flex flex-col items-center gap-1 p-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors disabled:opacity-50"
          title="Play/Pause"
        >
          <Play className="w-5 h-5 text-white" />
          <span className="text-xs text-gray-200">Play/Pause</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void sendMediaControl("previous");
          }}
          className="flex flex-col items-center gap-1 p-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors disabled:opacity-50"
          title="Previous song"
        >
          <SkipBack className="w-5 h-5 text-white" />
          <span className="text-xs text-gray-200">Previous</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void sendMediaControl("next");
          }}
          className="flex flex-col items-center gap-1 p-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors disabled:opacity-50"
          title="Next song"
        >
          <SkipForward className="w-5 h-5 text-white" />
          <span className="text-xs text-gray-200">Next</span>
        </button>
      </div>
    </div>
  );
}

export function pinnedTargetFromConnection(connection: {
  wsId: string;
  userId: string;
  displayName: string;
  broadcastName: string | null;
  capabilities: { site: string | null };
}): PinnedMediaTarget {
  return {
    wsId: connection.wsId,
    userId: connection.userId,
    displayName: connection.displayName,
    broadcastName: connection.broadcastName,
    site: connection.capabilities.site,
  };
}
