import { useState, type MouseEvent } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "../api/client";
import { usePartyEffectActions } from "../context/PartyEffectsContext";
import type { AuthStatus, ChatMessage, GuestContext } from "../types/api";
import {
  REQUEST_STATUS_LABELS,
  canModerateSongRequests,
  normalizeRequestStatus,
  parseRequestMessageContent,
  songRequestKey,
} from "../utils/songRequest";

interface SongRequestChatCardProps {
  message: ChatMessage;
  auth: AuthStatus;
  guest?: GuestContext;
  broadcasterUserId?: string | null;
  canDelete: boolean;
  onUpdated: () => void;
  deleteControl: React.ReactNode;
}

function voteButtonClass(selected: boolean, tone: "up" | "down", compact: boolean): string {
  const base = compact
    ? "inline-flex items-center justify-center rounded-lg p-1.5 transition-all disabled:opacity-100"
    : "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-100";
  if (selected && tone === "up") {
    return `${base} bg-green-600 text-white ring-2 ring-green-400/80 shadow-[0_0_10px_rgba(34,197,94,0.35)]`;
  }
  if (selected && tone === "down") {
    return `${base} bg-red-600 text-white ring-2 ring-red-400/80 shadow-[0_0_10px_rgba(239,68,68,0.35)]`;
  }
  return `${base} bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50`;
}

export function SongRequestChatCard({
  message,
  auth,
  guest,
  broadcasterUserId,
  canDelete,
  onUpdated,
  deleteControl,
}: SongRequestChatCardProps) {
  const [busy, setBusy] = useState(false);
  const partyEffects = usePartyEffectActions();
  const parsed = parseRequestMessageContent(message.content ?? "");
  const title = message.requestTitle ?? parsed?.title ?? "Unknown title";
  const artist = message.requestArtist ?? parsed?.artist ?? "Unknown artist";
  const songKey = message.songKey ?? songRequestKey(title, artist);
  const status = normalizeRequestStatus(message.requestStatus);
  const statusMeta = REQUEST_STATUS_LABELS[status];
  const myVote = message.requestUserVote ?? null;
  const canVote =
    !!(auth.authenticated || guest) && (status === "requested" || status === "approved");
  const canModerate = canModerateSongRequests(auth, guest, broadcasterUserId);
  const showModeration = canModerate && status === "requested";
  const canAdvanceStatus =
    canModerate && (status === "approved" || status === "playing");
  const compactVoteButtons = showModeration;
  const votesLocked = status === "denied" || status === "playing" || status === "played";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onUpdated();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const vote = (voteValue: number, event: MouseEvent) => {
    if (myVote === voteValue) return;
    void run(async () => {
      if (guest) {
        await api.voteGuestSong(title, artist, voteValue, guest);
      } else {
        await api.voteSong(title, artist, voteValue);
      }
      const guestCtx = guest?.guestSession ? guest : undefined;
      partyEffects?.triggerAtPointer(
        voteValue === 1 ? "react_thumbs_up" : "react_thumbs_down",
        event.clientX,
        event.clientY,
        guestCtx,
      );
    });
  };

  const approve = () => {
    if (busy) return;
    void run(async () => {
      if (guest) {
        await api.approveGuestRequest(songKey, guest);
      } else {
        await api.approveRequest(songKey);
      }
    });
  };

  const deny = () => {
    if (busy) return;
    void run(async () => {
      if (guest) {
        await api.denyGuestRequest(songKey, guest);
      } else {
        await api.denyRequest(songKey);
      }
    });
  };

  const markPlaying = () => {
    if (busy || status !== "approved") return;
    void run(async () => {
      if (guest) {
        await api.markGuestRequestPlaying(songKey, guest);
      } else {
        await api.markRequestPlaying(songKey);
      }
    });
  };

  const markPlayed = () => {
    if (busy || status !== "playing") return;
    void run(async () => {
      if (guest) {
        await api.markGuestRequestPlayed(songKey, guest);
      } else {
        await api.markRequestPlayed(songKey);
      }
    });
  };

  const onStatusSelect = (next: string) => {
    if (next === status) return;
    if (status === "approved" && next === "playing") markPlaying();
    if (status === "playing" && next === "played") markPlayed();
  };

  const statusBadgeTitle = canAdvanceStatus
    ? status === "approved"
      ? "Set request status"
      : "Set request status"
    : statusMeta.note;

  const statusControl = canAdvanceStatus ? (
    <select
      value={status}
      disabled={busy}
      aria-label="Request status"
      title={statusBadgeTitle}
      onChange={(e) => onStatusSelect(e.target.value)}
      className={`shrink-0 max-w-[9.5rem] rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-radio-accent/60 ${statusMeta.colorClass}`}
    >
      {status === "approved" ? (
        <>
          <option value="approved">{statusMeta.emoji} {statusMeta.label}</option>
          <option value="playing">▶️ Mark playing</option>
        </>
      ) : (
        <>
          <option value="playing">{statusMeta.emoji} {statusMeta.label}</option>
          <option value="played">✔️ Mark played</option>
        </>
      )}
    </select>
  ) : (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusMeta.colorClass}`}
      title={statusBadgeTitle}
    >
      {statusMeta.emoji} {statusMeta.label}
    </span>
  );

  return (
    <div className="group relative rounded-xl bg-gray-800/70 border border-gray-700/80 px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400 mb-1">{message.content}</p>
          <p className="text-white font-semibold truncate">{title}</p>
          <p className="text-gray-300 text-xs truncate">by {artist}</p>
        </div>
        {statusControl}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>
          👍 {message.requestVotesUp ?? 0} · 👎 {message.requestVotesDown ?? 0}
          {typeof message.requestApprovalPct === "number"
            ? ` · ${message.requestApprovalPct}% approval`
            : ""}
        </span>
        {myVote === 1 && !votesLocked ? (
          <span className="text-green-400/90">You supported this</span>
        ) : myVote === -1 && !votesLocked ? (
          <span className="text-red-400/90">You disagreed</span>
        ) : null}
        {message.id ? (
          <span className="text-[10px] text-gray-500 truncate" title={`Request message ${message.id}`}>
            ID {message.id.slice(-8)}
          </span>
        ) : null}
      </div>

      {(canVote || showModeration) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {canVote && (
            <>
              <button
                type="button"
                disabled={busy || myVote === 1}
                onClick={(event) => vote(1, event)}
                aria-pressed={myVote === 1}
                aria-label={myVote === 1 ? "You supported this" : "Support this request"}
                title={compactVoteButtons ? (myVote === 1 ? "You supported this" : "Support") : undefined}
                className={voteButtonClass(myVote === 1, "up", compactVoteButtons)}
              >
                <ThumbsUp className={compactVoteButtons ? "w-4 h-4" : "w-3.5 h-3.5"} />
                {!compactVoteButtons && (myVote === 1 ? "Supported" : "Support")}
              </button>
              <button
                type="button"
                disabled={busy || myVote === -1}
                onClick={(event) => vote(-1, event)}
                aria-pressed={myVote === -1}
                aria-label={myVote === -1 ? "You disagreed with this" : "Disagree with this request"}
                title={compactVoteButtons ? (myVote === -1 ? "You disagreed" : "Disagree") : undefined}
                className={voteButtonClass(myVote === -1, "down", compactVoteButtons)}
              >
                <ThumbsDown className={compactVoteButtons ? "w-4 h-4" : "w-3.5 h-3.5"} />
                {!compactVoteButtons && (myVote === -1 ? "Disagreed" : "Disagree")}
              </button>
            </>
          )}
          {showModeration && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={approve}
                className="rounded-lg bg-green-700/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={deny}
                className="rounded-lg bg-red-700/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                Deny
              </button>
            </>
          )}
        </div>
      )}

      {canDelete ? deleteControl : null}
    </div>
  );
}
