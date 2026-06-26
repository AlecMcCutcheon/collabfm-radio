import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { apiUrl } from "../config";
import {
  disposeAudioGraph,
  ensureAudioGraph,
  fadeInPlayback,
  getActiveAnalyser,
  setAudioGraphVolume,
} from "../utils/audioGraph";
import { formatDisconnectAgo, formatLiveDuration } from "../utils/formatLiveDuration";
import { parseMetadataResponse } from "../utils/parseMetadata";
import {
  DEFAULT_WEB_STREAM_DELAY_MS,
  getBufferedAheadMs,
  PLAYBACK_WARMUP_MS,
  PlaybackClockMonitor,
  waitForPlaybackReady,
} from "../utils/streamPlaybackBuffer";
import {
  StreamStallRecorder,
  createEmptyStreamStallTelemetry,
  type StreamStallTelemetry,
} from "../utils/streamStallTelemetry";
import type { BroadcastStatus, SongMetadata } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

const VOLUME_KEY = "radioVolume";
/** Only show reconnect UI if the stream stalls longer than this (ms). */
const STALL_UI_MS = 2500;

function appendShareTokenToAssetUrl(url: string | undefined, shareToken?: string): string | undefined {
  if (!url || !shareToken) return url;
  if (/^https?:\/\//i.test(url) && !url.includes("/art/track")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}shareToken=${encodeURIComponent(shareToken)}`;
}

function attachAudioListeners(
  audio: HTMLAudioElement,
  handlers: {
    onPlaying: () => void;
    onWaiting: () => void;
    onStalled: () => void;
    onCanPlay: () => void;
    onError: () => void;
  },
) {
  audio.addEventListener("playing", handlers.onPlaying);
  audio.addEventListener("waiting", handlers.onWaiting);
  audio.addEventListener("stalled", handlers.onStalled);
  audio.addEventListener("canplay", handlers.onCanPlay);
  audio.addEventListener("error", handlers.onError);
  return () => {
    audio.removeEventListener("playing", handlers.onPlaying);
    audio.removeEventListener("waiting", handlers.onWaiting);
    audio.removeEventListener("stalled", handlers.onStalled);
    audio.removeEventListener("canplay", handlers.onCanPlay);
    audio.removeEventListener("error", handlers.onError);
  };
}

export function useRadioPlayer(options?: { shareToken?: string }) {
  const shareToken = options?.shareToken;
  const streamPath = shareToken
    ? `/api/listen/${encodeURIComponent(shareToken)}/stream`
    : "/api/stream";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const hasStartedPlaybackRef = useRef(false);
  const playbackReadyRef = useRef(false);
  const stallRecorderRef = useRef(new StreamStallRecorder());
  const clockMonitorRef = useRef(new PlaybackClockMonitor());
  const stallSampleTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const reconnectStreamRef = useRef<() => void>(() => {});
  const reconnectingRef = useRef(false);
  const expectingLiveStreamRef = useRef(false);
  const [stallTelemetry, setStallTelemetry] = useState<StreamStallTelemetry>(
    createEmptyStreamStallTelemetry,
  );
  const [playing, setPlaying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [offline, setOffline] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [broadcastStartTime, setBroadcastStartTime] = useState<Date | null>(null);
  const [lastDisconnect, setLastDisconnect] = useState<Date | null>(null);
  const [broadcasterUserId, setBroadcasterUserId] = useState<string | null>(null);
  const [broadcasterDisplayName, setBroadcasterDisplayName] = useState<string | null>(null);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<SongMetadata>({
    title: "N/A",
    artist: "N/A",
  });
  const [listeners, setListeners] = useState("0");
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved ? parseFloat(saved) : 1;
  });
  const [webStreamDelayMs, setWebStreamDelayMs] = useState(DEFAULT_WEB_STREAM_DELAY_MS);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const clearStallSampleTimer = useCallback(() => {
    if (stallSampleTimerRef.current !== null) {
      window.clearInterval(stallSampleTimerRef.current);
      stallSampleTimerRef.current = null;
    }
  }, []);

  const syncStallTelemetry = useCallback(() => {
    setStallTelemetry(stallRecorderRef.current.snapshot());
  }, []);

  const sampleStallBuffer = useCallback(
    (audio: HTMLAudioElement | null) => {
      if (!audio) return;
      stallRecorderRef.current.sampleBuffer(getBufferedAheadMs(audio));
      syncStallTelemetry();
    },
    [syncStallTelemetry],
  );

  const startStallSampling = useCallback(
    (audio: HTMLAudioElement) => {
      clearStallSampleTimer();
      clockMonitorRef.current.reset();
      sampleStallBuffer(audio);
      stallSampleTimerRef.current = window.setInterval(() => {
        const el = audioRef.current;
        if (!el) return;
        sampleStallBuffer(el);
        clockMonitorRef.current.tick(
          el,
          () => {
            if (!playbackReadyRef.current) return;
            stallRecorderRef.current.markClockStall(getBufferedAheadMs(el));
            syncStallTelemetry();
          },
          () => {
            if (!playbackReadyRef.current) return;
            stallRecorderRef.current.markRecovered(getBufferedAheadMs(el));
            syncStallTelemetry();
          },
        );
      }, 250);
    },
    [clearStallSampleTimer, sampleStallBuffer, syncStallTelemetry],
  );

  const stopPlayback = useCallback(() => {
    clearStallTimer();
    clearStallSampleTimer();
    hasStartedPlaybackRef.current = false;
    playbackReadyRef.current = false;
    stallRecorderRef.current.reset();
    clockMonitorRef.current.reset();
    syncStallTelemetry();
    disposeAudioGraph();
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    expectingLiveStreamRef.current = false;
    setPlaying(false);
    setConnecting(false);
  }, [clearStallSampleTimer, clearStallTimer, syncStallTelemetry]);

  const createLiveAudio = useCallback(() => {
    clearStallTimer();
    hasStartedPlaybackRef.current = false;
    playbackReadyRef.current = false;
    disposeAudioGraph();
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }

    const audio = new Audio(apiUrl(`${streamPath}?_live=${Date.now()}`));
    audio.volume = 1;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";

    const onPlaying = () => {
      if (!playbackReadyRef.current) return;
      hasStartedPlaybackRef.current = true;
      clearStallTimer();
      stallRecorderRef.current.markRecovered(getBufferedAheadMs(audio));
      syncStallTelemetry();
      setConnecting(false);
      setPlaying(true);
    };

    const onCanPlay = () => {
      if (!playbackReadyRef.current || !hasStartedPlaybackRef.current) return;
      clearStallTimer();
      stallRecorderRef.current.markRecovered(getBufferedAheadMs(audio));
      syncStallTelemetry();
      setConnecting(false);
      if (audio.paused && !audio.ended) {
        void audio.play().catch(() => {});
      }
    };

    const onWaiting = () => {
      if (!playbackReadyRef.current) {
        setConnecting(true);
        setPlaying(false);
        return;
      }

      stallRecorderRef.current.markWaiting(getBufferedAheadMs(audio));
      syncStallTelemetry();

      // Brief live-stream buffer dips are normal — keep Stop UI unless stall persists.
      if (stallTimerRef.current !== null) return;
      stallTimerRef.current = window.setTimeout(() => {
        stallTimerRef.current = null;
        const el = audioRef.current;
        if (!el || el.paused || el.ended) return;
        if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
        setConnecting(true);
      }, STALL_UI_MS);
    };

    const onStalled = () => {
      if (!playbackReadyRef.current) return;
      stallRecorderRef.current.markStalled(getBufferedAheadMs(audio));
      syncStallTelemetry();
    };

    const onError = () => {
      clearStallTimer();
      setPlaying(false);
      if (!hasStartedPlaybackRef.current && !expectingLiveStreamRef.current) {
        setConnecting(false);
        return;
      }
      window.setTimeout(() => reconnectStreamRef.current(), 1500);
    };

    cleanupRef.current = attachAudioListeners(audio, {
      onPlaying,
      onWaiting,
      onStalled,
      onCanPlay,
      onError,
    });
    audioRef.current = audio;
    return audio;
  }, [clearStallTimer, streamPath, syncStallTelemetry]);

  const applyPlaybackVolume = useCallback((nextVolume: number) => {
    setAudioGraphVolume(nextVolume);
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = getActiveAnalyser() != null ? 1 : nextVolume;
  }, []);

  const getAudio = useCallback(() => audioRef.current ?? createLiveAudio(), [createLiveAudio]);

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
    applyPlaybackVolume(volume);
  }, [volume, applyPlaybackVolume]);

  useEffect(() => {
    const tick = () => {
      if (broadcastStartTime && streamActive) {
        setLiveLabel(formatLiveDuration(broadcastStartTime));
      } else if (lastDisconnect && !streamActive) {
        setLiveLabel(formatDisconnectAgo(lastDisconnect));
      } else {
        setLiveLabel(null);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [broadcastStartTime, lastDisconnect, streamActive]);

  const refreshStatus = useCallback(async () => {
    try {
      const [rawMeta, status, ice] = await Promise.all([
        api.metadataRaw(shareToken),
        api.broadcastStatus(shareToken),
        api.statusJson(shareToken).catch(() => null),
      ]);

      const parsed = parseMetadataResponse(rawMeta);
      if (parsed) {
        parsed.albumArt = appendShareTokenToAssetUrl(parsed.albumArt, shareToken);
        setMetadata(parsed);
      } else if (!playing) {
        setMetadata({ title: "N/A", artist: "N/A" });
      }

      const broadcast = status as BroadcastStatus;
      setStreamActive(!!broadcast.active);
      setBroadcastStartTime(broadcast.startTime ? new Date(broadcast.startTime) : null);
      setLastDisconnect(broadcast.lastDisconnect ? new Date(broadcast.lastDisconnect) : null);
      setBroadcasterUserId(broadcast.broadcasterUserId ? String(broadcast.broadcasterUserId) : null);
      setBroadcasterDisplayName(broadcast.broadcasterDisplayName ?? null);
      setOffline(false);

      const iceStats = ice as {
        icestats?: {
          source?: {
            listeners?: number;
            webStreamDelayMs?: number;
            streamHubDelayQueueMs?: number;
          } | Array<{
            listeners?: number;
            webStreamDelayMs?: number;
            streamHubDelayQueueMs?: number;
          }>;
        };
      } | null;
      const source = iceStats?.icestats?.source;
      const sourceEntry = Array.isArray(source) ? source[0] : source;
      const listenerCount = sourceEntry?.listeners;
      if (typeof sourceEntry?.webStreamDelayMs === "number") {
        setWebStreamDelayMs(sourceEntry.webStreamDelayMs);
        stallRecorderRef.current.setServerStreamDelayMs(sourceEntry.webStreamDelayMs);
      }
      if (typeof sourceEntry?.streamHubDelayQueueMs === "number") {
        stallRecorderRef.current.setServerDelayQueueMs(sourceEntry.streamHubDelayQueueMs);
      }
      if (playing || connecting) {
        syncStallTelemetry();
      }
      if (typeof listenerCount === "number") {
        setListeners(String(listenerCount));
      } else if (typeof broadcast.listeners === "number") {
        setListeners(String(broadcast.listeners));
      }
    } catch {
      if (!playing) {
        setMetadata({ title: "N/A", artist: "N/A" });
      }
      setStreamActive(false);
      setBroadcastStartTime(null);
      setLastDisconnect(null);
      setBroadcasterUserId(null);
      setBroadcasterDisplayName(null);
      setListeners("0");
      setOffline(true);
      if (playing || connecting) {
        stopPlayback();
      }
    } finally {
      setStatusReady(true);
    }
  }, [connecting, playing, shareToken, stopPlayback, syncStallTelemetry]);

  const onStreamHandoff = useCallback(() => {
    if (!playing || offline) return;
    // Rail swap is seamless on the existing HTTP connection — stay connected.
    clockMonitorRef.current.reset();
    stallRecorderRef.current.setWarmupUntil(Date.now() + 3000);
    syncStallTelemetry();
  }, [offline, playing, syncStallTelemetry]);

  useEffect(() => {
    void refreshStatus();
    const unsubscribe = subscribeLiveEvent("broadcast_status_changed", (event) => {
      void refreshStatus();
      try {
        const payload = JSON.parse(event.data) as { reason?: string };
        if (payload.reason === "stream-handoff") {
          onStreamHandoff();
        }
      } catch {
        /* ignore */
      }
    }, {
      shareToken,
    });
    const id = window.setInterval(() => void refreshStatus(), 6000);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [refreshStatus, onStreamHandoff, shareToken]);

  const startLivePlayback = useCallback(async () => {
    expectingLiveStreamRef.current = true;
    setConnecting(true);
    setPlaying(false);
    stallRecorderRef.current.beginSession(webStreamDelayMs);
    syncStallTelemetry();
    const audio = createLiveAudio();

    try {
      const graph = await ensureAudioGraph(audio, volume);
      audio.volume = graph ? 1 : 0;
      await audio.play();
      await waitForPlaybackReady(audio);
      playbackReadyRef.current = true;
      if (graph) {
        await fadeInPlayback(volume, 500);
      } else {
        audio.volume = volume;
      }
      hasStartedPlaybackRef.current = true;
      expectingLiveStreamRef.current = false;
      stallRecorderRef.current.setWarmupUntil(Date.now() + PLAYBACK_WARMUP_MS);
      startStallSampling(audio);
      setConnecting(false);
      setPlaying(true);
    } catch {
      expectingLiveStreamRef.current = false;
      stopPlayback();
    }
  }, [
    createLiveAudio,
    volume,
    webStreamDelayMs,
    syncStallTelemetry,
    startStallSampling,
    stopPlayback,
  ]);

  const reconnectLivePlayback = useCallback(async () => {
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;
    try {
      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const status = await api.broadcastStatus(shareToken);
        if (!status.active) {
          expectingLiveStreamRef.current = false;
          stopPlayback();
          return;
        }
        stopPlayback();
        expectingLiveStreamRef.current = true;
        try {
          await startLivePlayback();
          return;
        } catch {
          expectingLiveStreamRef.current = false;
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000 + attempt * 750));
          }
        }
      }
      expectingLiveStreamRef.current = false;
      setConnecting(false);
      setPlaying(false);
    } catch {
      expectingLiveStreamRef.current = false;
      setConnecting(false);
      setPlaying(false);
    } finally {
      reconnectingRef.current = false;
    }
  }, [shareToken, startLivePlayback, stopPlayback]);

  useEffect(() => {
    reconnectStreamRef.current = () => {
      void reconnectLivePlayback();
    };
  }, [reconnectLivePlayback]);

  const toggle = async () => {
    if (!statusReady || offline) return;
    if (connecting && !playing) return;

    if (playing) {
      stopPlayback();
      return;
    }

    await startLivePlayback();
  };

  const hasTrackInfo =
    metadata.title !== "N/A" &&
    metadata.artist !== "N/A" &&
    metadata.title !== "Unknown Title" &&
    metadata.artist !== "Unknown Artist";

  return {
    playing,
    connecting: connecting && !playing,
    offline,
    statusReady,
    streamActive,
    broadcastStartTime,
    lastDisconnect,
    broadcasterUserId,
    broadcasterDisplayName,
    liveLabel,
    metadata,
    listeners,
    volume,
    setVolume,
    toggle,
    hasTrackInfo,
    getAudio,
    stallTelemetry,
  };
};
