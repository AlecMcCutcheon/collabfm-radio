import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useWebBroadcaster,
  type WebBroadcastAuth,
  type WebBroadcastStatus,
} from "../hooks/useWebBroadcaster";

export interface WebBroadcastContextValue {
  enabled: boolean;
  status: WebBroadcastStatus;
  error: string | null;
  nowPlaying: string | null;
  isLive: boolean;
  localPlaybackMuted: boolean | null;
  captureSupported: boolean;
  captureUnsupportedMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const WebBroadcastContext = createContext<WebBroadcastContextValue | null>(null);

const PLACEHOLDER_AUTH: WebBroadcastAuth = { mode: "session", displayName: "Broadcaster" };

export function WebBroadcastProvider({
  auth,
  children,
}: {
  auth: WebBroadcastAuth | null;
  children: ReactNode;
}) {
  const broadcaster = useWebBroadcaster(auth ?? PLACEHOLDER_AUTH);
  const value = useMemo<WebBroadcastContextValue>(
    () => ({
      enabled: !!auth,
      status: broadcaster.status,
      error: broadcaster.error,
      nowPlaying: broadcaster.nowPlaying,
      isLive: broadcaster.isLive,
      localPlaybackMuted: broadcaster.localPlaybackMuted,
      captureSupported: broadcaster.captureSupported,
      captureUnsupportedMessage: broadcaster.captureUnsupportedMessage,
      start: broadcaster.start,
      stop: broadcaster.stop,
    }),
    [auth, broadcaster],
  );

  return <WebBroadcastContext.Provider value={value}>{children}</WebBroadcastContext.Provider>;
}

export function useWebBroadcast(): WebBroadcastContextValue {
  const ctx = useContext(WebBroadcastContext);
  if (!ctx) {
    throw new Error("useWebBroadcast must be used within WebBroadcastProvider");
  }
  return ctx;
}

export function useWebBroadcastOptional(): WebBroadcastContextValue | null {
  return useContext(WebBroadcastContext);
}
