import { useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import type { AuthUser, GuestContext } from "../types/api";
import { getPresenceClientId } from "../utils/presenceClientId";

const HEARTBEAT_MS = 10_000;
type PresenceHeartbeatBody = Parameters<typeof api.presenceHeartbeat>[0];

interface UseSitePresenceOptions {
  active: boolean;
  listening: boolean;
  guest?: GuestContext | null;
  authUser?: AuthUser | null;
  guestName?: string;
  avatarVariant?: number;
  coverIcon?: number;
}

export function useSitePresence({
  active,
  listening,
  guest,
  authUser,
  guestName,
  avatarVariant,
  coverIcon,
}: UseSitePresenceOptions) {
  const clientIdRef = useRef(getPresenceClientId());
  const canPingRef = useRef(false);
  const bodyRef = useRef<PresenceHeartbeatBody | null>(null);
  const canPing = active && (!!authUser?.id || !!guest?.guestSession);

  const heartbeatBody = useCallback(
    (opts?: { leave?: boolean; listeningOverride?: boolean }) =>
      guest?.guestSession
        ? {
            clientId: clientIdRef.current,
            listening: opts?.listeningOverride ?? listening,
            leave: opts?.leave,
            shareToken: guest.shareToken,
            guestId: guest.guestId,
            guestSession: guest.guestSession,
            guestName: guestName ?? guest.guestName,
            avatarVariant,
            coverIcon,
          }
        : {
            clientId: clientIdRef.current,
            listening: opts?.listeningOverride ?? listening,
            leave: opts?.leave,
          },
    [guest, guestName, avatarVariant, coverIcon, listening],
  );

  useEffect(() => {
    canPingRef.current = canPing;
    bodyRef.current = heartbeatBody();
  }, [canPing, heartbeatBody]);

  const sendHeartbeat = useCallback(async (opts?: { leave?: boolean; listeningOverride?: boolean }) => {
    if (!canPingRef.current && !opts?.leave) return;
    const base = bodyRef.current;
    if (!base) return;
    const body = {
      ...base,
      leave: opts?.leave,
      listening: opts?.listeningOverride ?? base.listening,
    };
    try {
      await api.presenceHeartbeat(body);
    } catch {
      /* ignore transient presence errors */
    }
  }, []);

  const sendLeaveBeacon = useCallback(() => {
    if (!canPingRef.current) return;
    const base = bodyRef.current;
    if (!base) return;
    api.presenceHeartbeatBeacon({
      ...base,
      leave: true,
      listening: false,
    });
  }, []);

  useEffect(() => {
    if (!canPing) return;

    void sendHeartbeat();
    const id = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);
    window.addEventListener("pagehide", sendLeaveBeacon);
    window.addEventListener("beforeunload", sendLeaveBeacon);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", sendLeaveBeacon);
      window.removeEventListener("beforeunload", sendLeaveBeacon);
      sendLeaveBeacon();
      void sendHeartbeat({ leave: true, listeningOverride: false });
    };
  }, [canPing, sendHeartbeat, sendLeaveBeacon]);

  useEffect(() => {
    if (!canPing) return;
    void sendHeartbeat();
  }, [
    canPing,
    listening,
    guest?.guestId,
    guest?.guestName,
    guest?.guestSession,
    guestName,
    avatarVariant,
    coverIcon,
    authUser?.id,
    sendHeartbeat,
  ]);
}
