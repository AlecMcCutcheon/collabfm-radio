import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { GuestContext } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

interface UseChatUnreadOptions {
  enabled: boolean;
  shareToken?: string;
  guest?: GuestContext | null;
  chatVisible: boolean;
}

export function useChatUnread({
  enabled,
  shareToken,
  guest,
  chatVisible,
}: UseChatUnreadOptions) {
  const [unreadCount, setUnreadCount] = useState(0);
  const chatVisibleRef = useRef(chatVisible);

  useEffect(() => {
    chatVisibleRef.current = chatVisible;
  }, [chatVisible]);

  const refreshUnread = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await api.chatUnread(shareToken, guest?.guestId, guest?.guestSession);
      if (!chatVisibleRef.current) {
        setUnreadCount(Math.max(0, data.unreadCount ?? 0));
      }
    } catch {
      /* keep prior count on transient errors */
    }
  }, [enabled, guest?.guestId, guest?.guestSession, shareToken]);

  const markRead = useCallback(async () => {
    if (!enabled) return;
    try {
      await api.markChatRead(guest ?? null);
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }, [enabled, guest]);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    void refreshUnread();
    const unsubscribe = subscribeLiveEvent(
      "chat_changed",
      () => {
        if (chatVisibleRef.current) {
          void markRead();
          return;
        }
        void refreshUnread();
      },
      { shareToken },
    );
    return unsubscribe;
  }, [enabled, guest?.guestId, guest?.guestSession, markRead, refreshUnread, shareToken]);

  useEffect(() => {
    if (!enabled || !chatVisible) return;
    void markRead();
  }, [chatVisible, enabled, markRead]);

  return { unreadCount, refreshUnread, markRead };
}

export type ChatMessagePingKind = "text" | "gif" | "request";

export interface ChatMessagePingPayload {
  id: string;
  userId: string;
  timestamp: number;
  kind: ChatMessagePingKind;
  gifUrl?: string;
  requestTitle?: string | null;
  requestArtist?: string | null;
}

export function parseChatChangedEvent(data: string): {
  reason?: string;
  latestMessage?: ChatMessagePingPayload;
} | null {
  try {
    return JSON.parse(data) as {
      reason?: string;
      latestMessage?: ChatMessagePingPayload;
    };
  } catch {
    return null;
  }
}
