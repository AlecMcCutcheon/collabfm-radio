import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Circle, Headphones, Heart, Info, Loader2, Mic, Play, Radio, Search, Square, Volume2 } from "lucide-react";
import { api } from "../api/client";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { usePresenceRoster } from "../hooks/usePresenceRoster";
import { useBrandingFeatures } from "../context/BrandingFeaturesContext";
import { usePinnedMediaControl } from "../context/PinnedMediaControlContext";
import { usePartyEffectActions } from "../context/PartyEffectsContext";
import type { useRadioPlayer } from "../hooks/useRadioPlayer";
import type { GuestContext, NowPlayingSocial } from "../types/api";
import { trackArtworkSrc, proceduralAlbumArt } from "../utils/proceduralArt";
import {
  albumArtFallbackHandler,
  proceduralStationLogo,
  resolveBrandingImageUrl,
} from "../utils/brandingImage";
import { subscribeLiveEvent } from "../utils/liveEvents";
import { DjProfileVisualizer } from "./AlbumArtVisualizer";
import { ListenerRosterModal } from "./ListenerRosterModal";
import { SessionSongLogModal } from "./SessionSongLogModal";
import { MediaControlPanel } from "./MediaControlPanel";
import { StreamStallTelemetryPanel } from "./StreamStallTelemetryPanel";

type Player = ReturnType<typeof useRadioPlayer>;

interface RadioPanelProps {
  player: Player;
  onOpenAbout: () => void;
  onOpenBroadcast?: () => void;
  showBroadcastButton?: boolean;
  broadcastLive?: boolean;
  onOpenSearch?: () => void;
  guest?: GuestContext | null;
}

function streamStatusLabel(player: Player): string {
  if (player.streamActive) {
    return player.liveLabel ? `LIVE - ${player.liveLabel}` : "Stream Active";
  }
  if (player.liveLabel) {
    return `Stream Inactive · ${player.liveLabel}`;
  }
  return "Stream Inactive";
}

const STAT_PILL_BASE =
  "flex h-10 min-w-0 flex-1 basis-0 items-center justify-center gap-3 whitespace-nowrap rounded-xl border border-gray-600 bg-gray-900/60 px-3 shadow-md transition-colors sm:flex-none sm:basis-auto";

export function RadioPanel({
  player,
  onOpenAbout,
  onOpenBroadcast,
  showBroadcastButton = false,
  broadcastLive = false,
  onOpenSearch,
  guest = null,
}: RadioPanelProps) {
  const [visualizerSrc, setVisualizerSrc] = useState<string | null>(null);
  const [radioTitle, setRadioTitle] = useState("CollabFM Radio");
  const [nowPlayingSocial, setNowPlayingSocial] = useState<NowPlayingSocial | null>(null);
  const [heartBusy, setHeartBusy] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [stallTelemetryOpen, setStallTelemetryOpen] = useState(false);
  const volumeClickCountRef = useRef(0);
  const volumeClickTimerRef = useRef<number | null>(null);
  const { status } = useAuthStatus();
  const isAdmin = status.roleInfo?.roleType === "admin";
  const { roster, loading: rosterLoading, fetched: rosterFetched, refresh: refreshRoster } =
    usePresenceRoster(true, guest?.shareToken);
  const { songSearch: songSearchEnabled } = useBrandingFeatures();
  const { pinned, guest: pinGuest, togglePin } = usePinnedMediaControl();
  const partyEffects = usePartyEffectActions();
  const stationLogoFallback = proceduralStationLogo(radioTitle, 128);
  const volumePercent = Math.round(player.volume * 100);
  const volumeGradient = `linear-gradient(to right, rgb(135, 206, 250) 0%, rgb(135, 206, 250) ${volumePercent}%, rgb(75, 85, 99) ${volumePercent}%, rgb(75, 85, 99) 100%)`;
  const listenerCountLabel = rosterFetched ? String(roster.listeningCount) : player.listeners;
  const onlineCountLabel = rosterFetched ? String(roster.onlineCount) : "0";
  const stageCountLabel = rosterFetched ? String(roster.stageCount ?? 0) : "0";
  const botConnectionCountLabel = rosterFetched ? String(roster.botConnectionCount ?? 0) : "0";

  const albumArtSrc = player.hasTrackInfo
    ? player.metadata.albumArt ??
      trackArtworkSrc(player.metadata.title, player.metadata.artist, undefined, 192)
    : null;
  const albumArtFallback = player.hasTrackInfo
    ? proceduralAlbumArt(player.metadata.title, player.metadata.artist, 192)
    : "";

  const idleBroadcasterName = player.broadcasterDisplayName?.trim() || "Someone";
  const showIdleBroadcast =
    player.streamActive && !player.hasTrackInfo && !!player.broadcasterDisplayName;
  const idlePlaceholderTitle = `${idleBroadcasterName} is playing music`;
  const idlePlaceholderArt = proceduralAlbumArt("Playing music", idleBroadcasterName, 192);

  useEffect(() => {
    void api.branding().then((b) => {
      setRadioTitle(b.radioDisplayName);
      setVisualizerSrc(resolveBrandingImageUrl(b.visualizerImageUrl));
    }).catch(() => {
      setVisualizerSrc(null);
    });
  }, []);

  const refreshNowPlayingSocial = useCallback(async () => {
    if (!player.streamActive || !player.hasTrackInfo) {
      setNowPlayingSocial(null);
      return;
    }
    try {
      const social = await api.nowPlayingSocial(guest);
      setNowPlayingSocial(social);
    } catch {
      setNowPlayingSocial(null);
    }
  }, [guest, player.hasTrackInfo, player.streamActive]);

  useEffect(() => {
    void refreshNowPlayingSocial();
    if (!player.streamActive || !player.hasTrackInfo) return undefined;
    const timer = window.setInterval(() => {
      void refreshNowPlayingSocial();
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [
    player.metadata.title,
    player.metadata.artist,
    player.streamActive,
    player.hasTrackInfo,
    refreshNowPlayingSocial,
  ]);

  useEffect(() => {
    if (!player.streamActive || !player.hasTrackInfo) return undefined;
    return subscribeLiveEvent(
      "now_playing_social_changed",
      () => void refreshNowPlayingSocial(),
      { shareToken: guest?.shareToken },
    );
  }, [guest?.shareToken, player.hasTrackInfo, player.streamActive, refreshNowPlayingSocial]);

  const onVolumePercentClick = () => {
    if (!isAdmin) return;
    volumeClickCountRef.current += 1;
    if (volumeClickTimerRef.current !== null) {
      window.clearTimeout(volumeClickTimerRef.current);
    }
    volumeClickTimerRef.current = window.setTimeout(() => {
      volumeClickCountRef.current = 0;
      volumeClickTimerRef.current = null;
    }, 700);
    if (volumeClickCountRef.current >= 3) {
      volumeClickCountRef.current = 0;
      if (volumeClickTimerRef.current !== null) {
        window.clearTimeout(volumeClickTimerRef.current);
        volumeClickTimerRef.current = null;
      }
      setStallTelemetryOpen((open) => !open);
    }
  };

  const toggleHeart = async (event: React.MouseEvent) => {
    if (!nowPlayingSocial?.canHeart || heartBusy) return;
    setHeartBusy(true);
    try {
      const body = guest
        ? {
            shareToken: guest.shareToken,
            guestId: guest.guestId,
            guestSession: guest.guestSession,
          }
        : {};
      const res = await api.heartNowPlaying(body);
      if (res.levelUpEffect) {
        partyEffects?.ingestEffects([res.levelUpEffect]);
      }
      const guestCtx = guest?.guestSession ? guest : undefined;
      partyEffects?.triggerAtPointer("react_love", event.clientX, event.clientY, guestCtx);
      setNowPlayingSocial(res);
    } catch {
      /* ignore */
    } finally {
      setHeartBusy(false);
    }
  };

  return (
    <>
    <div className="relative">
      {songSearchEnabled && onOpenSearch && (
        <button
          type="button"
          disabled={!player.streamActive}
          onClick={onOpenSearch}
          title={player.streamActive ? "Search & request songs" : "Search available when live"}
          className="absolute top-4 left-4 z-30 text-gray-400 hover:text-radio-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-6 h-6" />
        </button>
      )}

      {showBroadcastButton && onOpenBroadcast && (
        <button
          type="button"
          title={broadcastLive ? "On air — manage broadcast" : "Go live"}
          onClick={onOpenBroadcast}
          className={`absolute top-4 right-14 z-30 transition-colors ${
            broadcastLive
              ? "text-radio-red hover:text-red-400"
              : "text-gray-400 hover:text-radio-accent"
          }`}
        >
          <Mic className={`w-6 h-6 ${broadcastLive ? "animate-pulse" : ""}`} />
        </button>
      )}

      <button
        type="button"
        title="About this radio"
        onClick={onOpenAbout}
        className="absolute top-4 right-4 z-30 text-gray-400 hover:text-radio-accent transition-colors"
      >
        <Info className="w-6 h-6" />
      </button>

      <div className="text-center mb-8">
        <DjProfileVisualizer
          playing={player.playing && !player.connecting}
          streamActive={player.streamActive}
          getAudio={player.getAudio}
          profileSrc={visualizerSrc}
          profileFallbackSrc={stationLogoFallback}
          stationName={radioTitle}
        />

        <div className="w-full bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-2xl p-3 sm:p-5 border border-gray-700 shadow-lg relative z-10 mb-4 sm:mb-5">
          <h1 className="text-4xl font-bold text-radio-accent text-center">{radioTitle}</h1>
        </div>

        <div className="flex flex-nowrap items-center justify-center gap-4 text-gray-300 my-0 w-full">
          <button
            type="button"
            onClick={() => {
              setRosterOpen(true);
              void refreshRoster();
            }}
            className={`${STAT_PILL_BASE} hover:border-radio-accent/70 hover:bg-gray-800/70`}
            title="See who is listening, online, and on stage"
          >
            <span className="sr-only">Open listener roster</span>
            <span className="inline-flex items-center gap-1.5" title="Listening (site + Discord on main station)">
              <Headphones className="w-4 h-4 shrink-0 text-radio-accent" />
              <span className="text-sm font-semibold leading-none text-white">
                {listenerCountLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5" title="Online on site">
              <Circle className="w-4 h-4 shrink-0 fill-emerald-400 text-emerald-400" />
              <span className="text-sm font-semibold leading-none text-white">
                {onlineCountLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5" title="On stage">
              <Mic className="w-4 h-4 shrink-0 text-radio-red" />
              <span className="text-sm font-semibold leading-none text-white">
                {stageCountLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5" title="Discord voice bots (any station)">
              <Bot className="w-4 h-4 shrink-0 text-indigo-300" />
              <span className="text-sm font-semibold leading-none text-white">
                {botConnectionCountLabel}
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={!player.streamActive}
            onClick={() => setSessionLogOpen(true)}
            className={`${STAT_PILL_BASE} ${
              player.streamActive
                ? "hover:border-radio-accent/70 hover:bg-gray-800/70 cursor-pointer"
                : "cursor-default opacity-80"
            }`}
            title={
              player.streamActive
                ? "View songs played this live session"
                : "Session log available while the stream is live"
            }
          >
            <Circle
              className={`w-4 h-4 shrink-0 ${
                player.streamActive
                  ? "fill-radio-red text-radio-red animate-pulse"
                  : "fill-gray-500 text-gray-500"
              }`}
              aria-hidden
            />
            {player.streamActive ? (
              <>
                <span className="text-sm font-semibold leading-none text-radio-red">LIVE</span>
                <span className="text-sm font-semibold leading-none tabular-nums text-radio-red">
                  {player.liveLabel ?? "—"}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold leading-none text-gray-400">
                {streamStatusLabel(player)}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-5 mt-2 sm:mt-3 mb-4 sm:mb-8 border border-gray-600 shadow-lg">
        {player.hasTrackInfo ? (
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0 relative group">
              {albumArtSrc ? (
                <img
                  alt="Album artwork"
                  className="w-24 h-24 rounded-lg shadow-lg object-cover border-2 border-gray-600"
                  src={albumArtSrc}
                  onError={albumArtFallbackHandler(player.metadata.title, player.metadata.artist, 192)}
                />
              ) : (
                <img
                  alt="Album artwork"
                  className="w-24 h-24 rounded-lg shadow-lg object-cover border-2 border-gray-600"
                  src={albumArtFallback}
                />
              )}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-semibold text-xs uppercase tracking-wider mb-2 text-radio-red">
                Now Playing
              </p>
              <h2 className="text-sm sm:text-2xl font-bold text-radio-green mb-1 truncate">
                {player.metadata.title}
              </h2>
              <p className="text-sm sm:text-xl font-semibold text-radio-green opacity-80 truncate">
                {player.metadata.artist}
              </p>
            </div>
            {nowPlayingSocial?.canHeart && (
              <button
                type="button"
                disabled={heartBusy || nowPlayingSocial.userHasHearted}
                onClick={(event) => void toggleHeart(event)}
                title={
                  nowPlayingSocial.userHasHearted
                    ? "You already hearted this track"
                    : nowPlayingSocial.isOwnBroadcast
                      ? "Heart your track (counts here, no XP for yourself)"
                      : "Heart the DJ for this track"
                }
                className={`flex flex-col items-center gap-1 shrink-0 px-2 py-1 rounded-xl transition-colors ${
                  nowPlayingSocial.userHasHearted
                    ? "text-pink-400"
                    : "text-gray-400 hover:text-pink-300"
                } disabled:opacity-60`}
              >
                <Heart
                  className={`w-7 h-7 ${nowPlayingSocial.userHasHearted ? "fill-current" : ""}`}
                />
                <span className="text-[11px] font-semibold tabular-nums">
                  {nowPlayingSocial.heartCount}
                </span>
              </button>
            )}
          </div>
        ) : showIdleBroadcast ? (
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              <img
                alt="Now playing artwork"
                className="w-24 h-24 rounded-lg shadow-lg object-cover border-2 border-gray-600"
                src={idlePlaceholderArt}
              />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-semibold text-xs uppercase tracking-wider mb-2 text-radio-red">
                Now Playing
              </p>
              <h2 className="text-sm sm:text-2xl font-bold text-radio-green mb-1 truncate">
                {idlePlaceholderTitle}
              </h2>
              <p className="text-sm sm:text-xl font-semibold text-radio-green opacity-80 truncate">
                Live on air
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-radio-accent via-blue-500 to-purple-600 flex items-center justify-center mb-3 animate-pulse">
              <Volume2 className="w-8 h-8 text-white opacity-60" />
            </div>
            <p className="text-gray-400 text-base sm:text-lg font-medium">
              Broadcast idle - No recent tracks
            </p>
          </div>
        )}
      </div>

      <div className="mb-4 sm:mb-8">
        <button
          type="button"
          disabled={player.offline || player.connecting}
          onClick={() => void player.toggle()}
          className={`w-full py-2 sm:py-3 px-5 sm:px-7 min-h-16 rounded-2xl font-semibold sm:font-bold text-base sm:text-xl transition-all duration-300 transform hover:brightness-110 active:scale-95 flex items-center justify-center gap-2 sm:gap-3 border border-gray-600 shadow-lg ${
            player.offline
              ? "bg-gradient-to-br from-gray-600 to-gray-700 text-gray-400 cursor-not-allowed hover:brightness-100"
              : player.connecting
                ? "bg-gradient-to-br from-radio-accent to-blue-400 text-white cursor-wait hover:brightness-100"
                : player.playing
                  ? "bg-gradient-to-br from-radio-red to-red-700 text-white"
                  : "bg-gradient-to-br from-white to-gray-100 text-gray-900"
          }`}
        >
          {player.offline ? (
            <>
              <Radio className="w-5 h-5 sm:w-6 sm:h-6" />
              Offline
            </>
          ) : player.connecting ? (
            <>
              <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
              Buffering...
            </>
          ) : player.playing ? (
            <>
              <Square className="w-5 h-5 sm:w-6 sm:h-6" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-5 h-5 sm:w-6 sm:h-6" />
              Listen Live
            </>
          )}
        </button>
      </div>

      <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl px-4 sm:px-5 py-4 sm:py-5 border border-gray-600 shadow-lg min-h-16 flex items-center">
        <div className="flex items-center gap-3 sm:gap-4 w-full">
          <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300 flex-shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            onChange={(e) => player.setVolume(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider my-0"
            style={{ background: volumeGradient }}
            aria-label="Volume"
          />
          <span
            className="text-white font-semibold w-12 text-right text-sm sm:text-base leading-none select-none"
            onClick={onVolumePercentClick}
          >
            {volumePercent}%
          </span>
        </div>
      </div>

      {pinned && (
        <div className="sm:hidden mt-3">
          <MediaControlPanel
            target={pinned}
            guest={pinGuest}
            showPin
            pinned
            onTogglePin={() => togglePin(pinned)}
          />
        </div>
      )}
    </div>

    <ListenerRosterModal
      open={rosterOpen}
      onClose={() => setRosterOpen(false)}
      stage={roster.stage ?? []}
      listening={roster.listening}
      online={roster.online}
      botConnections={roster.botConnections ?? []}
      loading={rosterLoading}
      authUser={status.user ?? null}
      guest={guest}
    />

    <SessionSongLogModal
      open={sessionLogOpen}
      onClose={() => setSessionLogOpen(false)}
      guest={guest}
    />

    {isAdmin && (
      <StreamStallTelemetryPanel
        open={stallTelemetryOpen}
        onClose={() => setStallTelemetryOpen(false)}
        telemetry={player.stallTelemetry}
        playing={player.playing}
      />
    )}
    </>
  );
}
