import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { encodeBroadcastNameParam, resolveRelayWsUrl } from "../utils/relayUrl";
import {
  getDisplayCaptureUnsupportedMessage,
  isDisplayCaptureAvailable,
  requestDisplayAudioStream,
} from "../utils/displayCapture";
import { buildOpusRecorderOptions, createBroadcastRecordStream } from "../utils/broadcastAudioPipeline";

const BROADCASTER_LABEL = "Web UI";
const METADATA_INTERVAL_MS = 4000;
const RECORDER_SLICE_MS = 250;

export type WebBroadcastStatus = "idle" | "connecting" | "live" | "error";

export type WebBroadcastAuth =
  | { mode: "session"; displayName: string }
  | { mode: "guest"; displayName: string; shareToken: string; guestId: string; guestSession: string };

function readMediaSessionMetadata(): { title: string; artist: string; albumArt?: string } | null {
  const meta = navigator.mediaSession?.metadata;
  if (!meta?.title) return null;
  const artist = meta.artist?.trim() || meta.album?.trim() || "";
  if (!artist) return null;
  const albumArt = meta.artwork?.length ? meta.artwork[meta.artwork.length - 1]?.src : undefined;
  return { title: meta.title.trim(), artist, albumArt };
}

async function captureTabAudio(): Promise<{ stream: MediaStream; localPlaybackMuted: boolean | null }> {
  const displayStream = await requestDisplayAudioStream();

  displayStream.getVideoTracks().forEach((track) => track.stop());

  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error("No tab audio. Share a tab that is playing music and enable audio.");
  }

  const settings = audioTracks[0]?.getSettings?.() as { suppressLocalAudioPlayback?: boolean } | undefined;
  const localPlaybackMuted =
    typeof settings?.suppressLocalAudioPlayback === "boolean"
      ? settings.suppressLocalAudioPlayback
      : null;

  return { stream: new MediaStream(audioTracks), localPlaybackMuted };
}

export function useWebBroadcaster(auth: WebBroadcastAuth) {
  const displayName = auth.displayName;
  const [status, setStatus] = useState<WebBroadcastStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [localPlaybackMuted, setLocalPlaybackMuted] = useState<boolean | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const metadataIntervalRef = useRef<number | null>(null);
  const liveRef = useRef(false);

  const fetchWsToken = useCallback(async () => {
    if (auth.mode === "guest") {
      return api.guestBroadcasterWsToken({
        shareToken: auth.shareToken,
        guestId: auth.guestId,
        guestName: displayName,
        guestSession: auth.guestSession,
      });
    }
    return api.broadcasterWsToken();
  }, [auth, displayName]);

  const clearTimers = useCallback(() => {
    if (metadataIntervalRef.current !== null) {
      window.clearInterval(metadataIntervalRef.current);
      metadataIntervalRef.current = null;
    }
  }, []);

  const pushMetadata = useCallback(async () => {
    if (!liveRef.current) return;
    const sessionMeta = readMediaSessionMetadata();
    if (!sessionMeta) {
      setNowPlaying(`${displayName} is playing music`);
      return;
    }
    const title = sessionMeta.title;
    const artist = sessionMeta.artist;
    setNowPlaying(`${title} — ${artist}`);
    try {
      const payload = {
        title,
        artist,
        albumArt: sessionMeta?.albumArt,
        broadcasterName: BROADCASTER_LABEL,
      };
      if (auth.mode === "guest") {
        await api.postBroadcastMetadata({
          ...payload,
          shareToken: auth.shareToken,
          guestId: auth.guestId,
          guestSession: auth.guestSession,
        });
      } else {
        await api.postBroadcastMetadata(payload);
      }
    } catch {
      // Metadata is optional; audio stream continues.
    }
  }, [auth, displayName]);

  const stop = useCallback(() => {
    liveRef.current = false;
    clearTimers();
    try {
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    captureStreamRef.current?.getTracks().forEach((t) => t.stop());
    captureStreamRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;
    setStatus("idle");
    setNowPlaying(null);
    setError(null);
    setLocalPlaybackMuted(null);
  }, [clearTimers]);

  const start = useCallback(async () => {
    if (liveRef.current || status === "connecting") return;
    setError(null);
    setStatus("connecting");

    try {
      const { stream: tabAudio, localPlaybackMuted: muted } = await captureTabAudio();
      setLocalPlaybackMuted(muted);
      captureStreamRef.current = tabAudio;

      const { token } = await fetchWsToken();
      if (!token) throw new Error("Could not obtain broadcast token");

      const relayUrl = resolveRelayWsUrl();
      const url = new URL(relayUrl);
      url.searchParams.set("token", token);
      url.searchParams.set("broadcast_name", encodeBroadcastNameParam(BROADCASTER_LABEL));

      const recorderOptions = buildOpusRecorderOptions();
      const recordStream = await createBroadcastRecordStream(tabAudio, audioCtxRef);

      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Relay connection timed out")), 10_000);
        ws.onopen = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        ws.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Could not connect to relay server"));
        };
        ws.onclose = () => {
          if (liveRef.current) {
            setError("Broadcast connection closed");
            stop();
          }
        };
      });

      const recorder = new MediaRecorder(recordStream, recorderOptions);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          void event.data.arrayBuffer().then((buf) => ws.send(buf));
        }
      };
      recorder.onerror = () => stop();
      recorder.start(RECORDER_SLICE_MS);
      recorderRef.current = recorder;

      tabAudio.getAudioTracks()[0]?.addEventListener("ended", () => stop());

      liveRef.current = true;
      setStatus("live");

      await pushMetadata();
      metadataIntervalRef.current = window.setInterval(() => {
        void pushMetadata();
      }, METADATA_INTERVAL_MS);
    } catch (e) {
      stop();
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to start broadcast");
    }
  }, [fetchWsToken, pushMetadata, status, stop]);

  useEffect(() => {
    const onUnload = () => stop();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [stop]);

  return {
    status,
    error,
    nowPlaying,
    localPlaybackMuted,
    start,
    stop,
    isLive: status === "live",
    captureSupported: isDisplayCaptureAvailable(),
    captureUnsupportedMessage: getDisplayCaptureUnsupportedMessage(),
  };
}
