import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Heart, ListMusic, X } from "lucide-react";
import { api } from "../api/client";
import { usePartyEffectActions } from "../context/PartyEffectsContext";
import type { BroadcastSessionLog, GuestContext, SessionSongLogEntry } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";
import { AlbumArtImage } from "./AlbumArtImage";

interface SessionSongLogModalProps {
  open: boolean;
  onClose: () => void;
  guest?: GuestContext | null;
}

function formatPlayedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function SongLogRow({
  entry,
  heartBusy,
  onHeart,
}: {
  entry: SessionSongLogEntry;
  heartBusy: boolean;
  onHeart: (entry: SessionSongLogEntry, event: MouseEvent) => void;
}) {
  const title = entry.title || "Track";
  const artist = entry.artist || "Artist";
  const remoteArt = entry.albumArt?.trim() || null;
  const djLabel = entry.broadcasterDisplayName?.trim() || "DJ";

  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-2 py-2 border ${
        entry.isCurrent
          ? "border-radio-red/40 bg-radio-red/5"
          : "border-transparent hover:bg-gray-700/50"
      }`}
    >
      <AlbumArtImage
        remoteUrl={remoteArt}
        title={title}
        artist={artist}
        size={96}
        alt=""
        className="w-11 h-11 rounded-lg object-cover border border-gray-600 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{entry.title || "Unknown title"}</p>
          {entry.isCurrent ? (
            <span className="shrink-0 rounded-full border border-radio-red/40 bg-radio-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-radio-red">
              Now
            </span>
          ) : null}
          {entry.fromRequest ? (
            <span
              className="shrink-0 rounded-full border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300"
              title="Played from a listener request"
            >
              Request
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-400 truncate">{entry.artist || "Unknown artist"}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          {djLabel} · {formatPlayedAt(entry.startedAt)}
        </p>
      </div>
      {entry.canHeart || entry.userHasHearted ? (
        <button
          type="button"
          disabled={heartBusy || entry.userHasHearted}
          onClick={(event) => onHeart(entry, event)}
          title={
            entry.userHasHearted
              ? "You already hearted this track"
              : entry.isCurrent
                ? "Heart the now playing track"
                : "Heart this past track"
          }
          className={`flex flex-col items-center gap-0.5 shrink-0 px-2 py-1 rounded-lg transition-colors ${
            entry.userHasHearted ? "text-pink-400" : "text-gray-400 hover:text-pink-300"
          } disabled:opacity-60`}
        >
          <Heart className={`w-5 h-5 ${entry.userHasHearted ? "fill-current" : ""}`} />
          <span className="text-[10px] font-semibold tabular-nums">{entry.heartCount}</span>
        </button>
      ) : entry.heartCount > 0 ? (
        <div className="flex flex-col items-center gap-0.5 shrink-0 px-2 py-1 text-pink-400/80">
          <Heart className="w-5 h-5 fill-current" />
          <span className="text-[10px] font-semibold tabular-nums">{entry.heartCount}</span>
        </div>
      ) : null}
    </li>
  );
}

export function SessionSongLogModal({ open, onClose, guest = null }: SessionSongLogModalProps) {
  const [log, setLog] = useState<BroadcastSessionLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [heartBusyId, setHeartBusyId] = useState<string | null>(null);
  const partyEffects = usePartyEffectActions();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.broadcastSessionLog(guest);
      setLog(data);
    } catch {
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, [guest]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const unsubSocial = subscribeLiveEvent(
      "now_playing_social_changed",
      () => void refresh(),
      { shareToken: guest?.shareToken },
    );
    const unsubLog = subscribeLiveEvent(
      "broadcast_session_log_changed",
      () => void refresh(),
      { shareToken: guest?.shareToken },
    );
    const unsubStatus = subscribeLiveEvent(
      "broadcast_status_changed",
      () => void refresh(),
      { shareToken: guest?.shareToken },
    );
    const unsubProfile = subscribeLiveEvent(
      "profile_changed",
      () => void refresh(),
      { shareToken: guest?.shareToken },
    );
    const unsubChat = subscribeLiveEvent(
      "chat_changed",
      () => void refresh(),
      { shareToken: guest?.shareToken },
    );
    return () => {
      unsubSocial();
      unsubLog();
      unsubStatus();
      unsubProfile();
      unsubChat();
    };
  }, [guest?.shareToken, open, refresh]);

  const heartTrack = async (entry: SessionSongLogEntry, event: MouseEvent) => {
    if (!entry.canHeart || heartBusyId) return;
    setHeartBusyId(entry.trackSessionId);
    try {
      const res = await api.heartSessionTrack(entry.trackSessionId, guest);
      setLog(res);
      if (res.levelUpEffect) {
        partyEffects?.ingestEffects([res.levelUpEffect]);
      }
      const guestCtx = guest?.guestSession ? guest : undefined;
      partyEffects?.triggerAtPointer("react_love", event.clientX, event.clientY, guestCtx);
    } catch {
      /* ignore */
    } finally {
      setHeartBusyId(null);
    }
  };

  if (!open) return null;

  const songs = log?.songs ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-md border border-gray-700 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="session-song-log-title"
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-radio-red" />
            <h3 id="session-song-log-title" className="text-lg font-bold text-white">
              Live session log
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-[12rem] max-h-[min(60vh,480px)] overflow-y-auto scrollbar-party pr-1 -mr-1">
          {loading && songs.length === 0 ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : songs.length === 0 ? (
            <p className="text-sm text-gray-500">
              {log?.active
                ? "No tracks logged yet for this session."
                : "The stream is offline or this session has no logged tracks yet."}
            </p>
          ) : (
            <ul className="space-y-1">
              {songs.map((entry) => (
                <SongLogRow
                  key={entry.trackSessionId}
                  entry={entry}
                  heartBusy={heartBusyId === entry.trackSessionId}
                  onHeart={(item, event) => void heartTrack(item, event)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
