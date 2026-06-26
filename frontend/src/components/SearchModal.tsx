import { ExternalLink, Info, Loader2, Search, X } from "lucide-react";

import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { GuestContext } from "../types/api";

import { trackArtworkSrc } from "../utils/proceduralArt";
import { AlbumArtImage } from "./AlbumArtImage";
import { subscribeLiveEvent } from "../utils/liveEvents";
import {
  REQUEST_STATUS_LABELS,
  normalizeRequestStatus,
  songRequestKey,
  type SongRequestStatus,
} from "../utils/songRequest";



interface SearchModalProps {

  open: boolean;

  onClose: () => void;

  guest?: GuestContext;

}



interface SearchResult {

  name: string;

  artist: string;

  url?: string;

  image?: unknown;

}



function artistName(raw: unknown): string {

  if (typeof raw === "string") return raw;

  if (raw && typeof raw === "object" && "#text" in raw) {

    return String((raw as { "#text"?: string })["#text"] ?? "");

  }

  return "Unknown Artist";

}



function normalizeResult(item: Record<string, unknown>): SearchResult {

  return {

    name: String(item.name ?? "Unknown Title"),

    artist: artistName(item.artist),

    url: typeof item.url === "string" ? item.url : undefined,

    image: item.image,

  };

}



export function SearchModal({ open, onClose, guest }: SearchModalProps) {

  const [songName, setSongName] = useState("");

  const [artist, setArtist] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);

  const [requesting, setRequesting] = useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);

  const [requestStatuses, setRequestStatuses] = useState<Record<string, SongRequestStatus>>({});

  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);



  useEffect(() => {

    if (!open) return;

    const syncRequests = async () => {

      try {

        const all = await api.requests(guest?.shareToken);

        const next: Record<string, SongRequestStatus> = {};

        for (const [key, req] of Object.entries(all)) {

          next[key] = normalizeRequestStatus(req.status);

        }

        setRequestStatuses(next);

      } catch {

        /* ignore */

      }

    };

    void syncRequests();

    const unsubscribe = subscribeLiveEvent("chat_changed", () => void syncRequests(), {
      shareToken: guest?.shareToken,
    });
    const id = window.setInterval(() => void syncRequests(), 30_000);

    return () => {
      unsubscribe();
      window.clearInterval(id);
    };

  }, [open, guest?.shareToken]);



  if (!open) return null;



  const runSearch = async (nextPage = 1) => {

    if (!songName.trim()) return;

    setLoading(true);

    setError(null);

    try {

      const data = await api.searchSongs(
        songName.trim(),
        artist.trim() || undefined,
        nextPage,
        guest?.shareToken,
      );

      const normalized = (data.results ?? []).map((r) => normalizeResult(r as Record<string, unknown>));

      setResults(nextPage === 1 ? normalized : [...results, ...normalized]);

      setTotal(data.total ?? normalized.length);

      setPage(nextPage);

      setHasSearched(true);

    } catch (err) {

      let msg = "Search failed. Try again.";

      if (err instanceof Error) {

        try {

          const parsed = JSON.parse(err.message) as { error?: string };

          if (parsed.error) msg = parsed.error;

        } catch {

          if (err.message && err.message.length < 200) msg = err.message;

        }

      }

      setError(msg);

      if (nextPage === 1) setResults([]);

    } finally {

      setLoading(false);

    }

  };



  const requestSong = async (title: string, trackArtist: string, url?: string) => {

    const key = songRequestKey(title, trackArtist);

    setRequesting(key);

    setRequestFeedback(null);

    try {

      const res = guest

        ? await api.requestGuestSong(title, trackArtist, guest, url)

        : await api.requestSong(title, trackArtist, url);

      const status = normalizeRequestStatus(res.status);

      setRequestStatuses((prev) => ({ ...prev, [key]: status }));

      const statusLabel = REQUEST_STATUS_LABELS[status];

      setRequestFeedback(

        `Request submitted — ${statusLabel.emoji} ${statusLabel.label}. Track it in chat${res.messageId ? ` (ID …${res.messageId.slice(-8)})` : ""}.`,

      );

    } catch (err) {

      const message = err instanceof Error ? err.message : "Request failed";

      setError(message.includes("429") ? "Rate limited — wait 2 minutes between requests." : "Could not submit request.");

    } finally {

      setRequesting(null);

    }

  };



  const close = () => {

    setHelpOpen(false);

    onClose();

  };



  return (

    <>

      <div

        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4"

        onClick={close}

      >

        <div

          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 w-[90%] max-w-2xl max-h-[80vh] border border-gray-700 shadow-2xl flex flex-col"

          onClick={(e) => e.stopPropagation()}

        >

          <div className="flex items-center justify-between mb-4">

            <div className="flex items-center gap-2">

              <Search className="w-5 h-5 text-radio-accent" />

              <h3 className="text-lg font-bold text-white">Search & Request Songs</h3>

              <button

                type="button"

                onClick={(e) => {

                  e.stopPropagation();

                  setHelpOpen(true);

                }}

                className="text-gray-400 hover:text-radio-accent transition-colors"

                title="How song requests work"

              >

                <Info className="w-4 h-4" />

              </button>

            </div>

            <button

              type="button"

              onClick={close}

              className="text-gray-400 hover:text-white transition-colors"

            >

              <X className="w-5 h-5" />

            </button>

          </div>



          <div className="space-y-3 mb-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <div>

                <label className="block text-sm text-gray-400 mb-1">Song Name</label>

                <input

                  type="text"

                  value={songName}

                  onChange={(e) => setSongName(e.target.value)}

                  onKeyDown={(e) => e.key === "Enter" && void runSearch(1)}

                  placeholder="Enter song name (required)"

                  className="w-full bg-gray-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-radio-accent"

                />

              </div>

              <div>

                <label className="block text-sm text-gray-400 mb-1">Artist</label>

                <input

                  type="text"

                  value={artist}

                  onChange={(e) => setArtist(e.target.value)}

                  onKeyDown={(e) => e.key === "Enter" && void runSearch(1)}

                  placeholder="Enter artist name (optional)"

                  className="w-full bg-gray-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-radio-accent"

                />

              </div>

            </div>

            <button

              type="button"

              onClick={() => void runSearch(1)}

              disabled={!songName.trim() || loading}

              className="w-full bg-gradient-to-br from-radio-accent to-purple-500 text-white rounded-xl px-4 py-2 text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"

            >

              <Search className="w-4 h-4" />

              {loading ? "Searching…" : "Search"}

            </button>

          </div>



          {error && <p className="text-sm text-radio-red mb-2">{error}</p>}

          {requestFeedback && <p className="text-sm text-green-400 mb-2">{requestFeedback}</p>}



          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-radio-accent/50 scrollbar-track-gray-800/50 min-h-0">

            {loading && (

              <div className="text-center py-8 text-gray-400">

                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />

                <p>Searching...</p>

              </div>

            )}



            {!loading && results.length === 0 && !hasSearched && (

              <div className="text-center py-8 text-gray-400 space-y-2">

                <p>Enter a song name to search</p>

                <p className="text-xs text-gray-500">Tip: Check your spelling for best results</p>

              </div>

            )}



            {!loading && results.length === 0 && hasSearched && (

              <div className="text-center py-8 text-gray-400">

                <p>No results found. Try different search terms.</p>

              </div>

            )}



            {!loading &&

              results.map((track) => {

                const key = songRequestKey(track.name, track.artist);

                const artwork = trackArtworkSrc(track.name, track.artist, track.image, 96);
                const remoteArtwork =
                  artwork.startsWith("data:") || artwork.startsWith("/") ? null : artwork;

                const trackStatus = requestStatuses[key];

                const statusMeta = trackStatus ? REQUEST_STATUS_LABELS[trackStatus] : null;



                return (

                  <div

                    key={key}

                    className="bg-gray-700/50 rounded-xl p-3 flex items-center gap-3 hover:bg-gray-700 transition-colors"

                  >

                    <div className="relative w-12 h-12 flex-shrink-0 group">

                      <AlbumArtImage
                        remoteUrl={remoteArtwork}
                        title={track.name}
                        artist={track.artist}
                        size={96}
                        alt={`${track.name} album art`}
                        className="w-full h-full rounded object-cover"
                      />

                      {track.url && (

                        <a

                          href={track.url}

                          target="_blank"

                          rel="noopener noreferrer"

                          className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded"

                          title="View on Last.fm"

                        >

                          <ExternalLink className="w-4 h-4 text-white" />

                        </a>

                      )}

                    </div>



                    <div className="flex-1 min-w-0">

                      <p className="text-white font-semibold text-sm truncate">{track.name}</p>

                      <p className="text-gray-400 text-xs truncate">{track.artist}</p>

                      {statusMeta && (

                        <span

                          className={`inline-flex mt-1 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusMeta.colorClass}`}

                        >

                          {statusMeta.emoji} {statusMeta.label}

                        </span>

                      )}

                    </div>



                    <button

                      type="button"

                      disabled={requesting === key || trackStatus === "requested" || trackStatus === "approved" || trackStatus === "playing"}

                      onClick={() => void requestSong(track.name, track.artist, track.url)}

                      className="shrink-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg px-3 py-1.5 text-xs hover:brightness-110 transition-all disabled:opacity-50"

                    >

                      {requesting === key

                        ? "…"

                        : trackStatus

                          ? "Requested"

                          : "Request"}

                    </button>

                  </div>

                );

              })}



            {!loading && results.length > 0 && results.length < total && (

              <button

                type="button"

                onClick={() => void runSearch(page + 1)}

                disabled={loading}

                className="w-full bg-gray-700 text-white rounded-xl px-4 py-2 text-sm hover:brightness-110 transition-all disabled:opacity-50"

              >

                {loading ? "Loading..." : `Load More (${results.length}/${total})`}

              </button>

            )}

          </div>

        </div>

      </div>



      {helpOpen && <SearchHelpModal onClose={() => setHelpOpen(false)} />}

    </>

  );

}



function SearchHelpModal({ onClose }: { onClose: () => void }) {

  return (

    <div

      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[95] p-4"

      onClick={onClose}

    >

      <div

        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-lg border border-gray-700 shadow-2xl max-h-[85vh] overflow-y-auto"

        onClick={(e) => e.stopPropagation()}

      >

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-lg font-bold text-white">How Song Requests Work</h3>

          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">

            <X className="w-5 h-5" />

          </button>

        </div>



        <div className="space-y-4 text-sm text-gray-300">

          <HelpStep

            step={1}

            title="Search & Request"

            body='Search for songs and click "Request" to submit your song choice.'

          />

          <HelpStep

            step={2}

            title="Community Voting"

            body="Other listeners can vote on song requests in the chat. Click 👍 to support or 👎 if you disagree."

          />

          <HelpStep

            step={3}

            title="Host Approval"

            body="Requests are subject to the host's discretion. They will review and approve or deny based on the vibe."

          />

          <div className="flex gap-3">

            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-radio-accent/20 flex items-center justify-center text-radio-accent font-bold text-xs">

              4

            </div>

            <div>

              <p className="font-semibold text-white mb-1">Track Status</p>

              <p className="mb-2">Watch the status badges in chat:</p>

              <div className="space-y-1 text-xs">

                <StatusBadge label="⏳ Requested" note="Pending approval" color="blue" />

                <StatusBadge label="✅ Approved" note="Will play soon" color="green" />

                <StatusBadge label="▶️ Playing" note="Currently on air" color="purple" />

                <StatusBadge label="❌ Denied" note="Not this time" color="red" />

              </div>

            </div>

          </div>

          <div className="pt-2 border-t border-gray-700">

            <p className="text-xs text-gray-400">

              <strong>Note:</strong> You can only have one pending request at a time, and there&apos;s a

              2-minute cooldown between requests.

            </p>

          </div>

        </div>



        <button

          type="button"

          onClick={onClose}

          className="w-full mt-4 bg-radio-accent/20 text-radio-accent rounded-xl px-4 py-2 text-sm font-semibold hover:bg-radio-accent/30 transition-all"

        >

          Got it!

        </button>

      </div>

    </div>

  );

}



function HelpStep({ step, title, body }: { step: number; title: string; body: string }) {

  return (

    <div className="flex gap-3">

      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-radio-accent/20 flex items-center justify-center text-radio-accent font-bold text-xs">

        {step}

      </div>

      <div>

        <p className="font-semibold text-white mb-1">{title}</p>

        <p>{body}</p>

      </div>

    </div>

  );

}



function StatusBadge({

  label,

  note,

  color,

}: {

  label: string;

  note: string;

  color: "blue" | "green" | "purple" | "red";

}) {

  const colors = {

    blue: "bg-blue-500/20 text-blue-400 border-blue-500/40",

    green: "bg-green-500/20 text-green-400 border-green-500/40",

    purple: "bg-purple-500/20 text-purple-400 border-purple-500/40",

    red: "bg-red-500/20 text-red-400 border-red-500/40",

  };

  return (

    <div className="flex items-center gap-2">

      <span className={`px-2 py-0.5 rounded-full border font-semibold ${colors[color]}`}>{label}</span>

      <span className="text-gray-400">- {note}</span>

    </div>

  );

}


