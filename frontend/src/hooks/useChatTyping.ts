import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ChatTyper, GuestContext } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

const TYPING_HEARTBEAT_MS = 2000;
const TYPING_PAUSE_MS = 1200;

function parseTypingEvent(raw: string): ChatTyper[] {
  try {
    const data = JSON.parse(raw) as { typers?: ChatTyper[] };
    return Array.isArray(data.typers) ? data.typers : [];
  } catch {
    return [];
  }
}

function filterTypers(list: ChatTyper[], selfUserId: string | null): ChatTyper[] {
  return list.filter((t) => t.actorId !== selfUserId);
}

function applyProfilePatchToTypers(
  typers: ChatTyper[],
  userId: string,
  profile: {
    displayName?: string | null;
    avatarUrl?: string | null;
    avatarVariant?: number | null;
    coverIcon?: number | null;
  },
): ChatTyper[] {
  return typers.map((typer) => {
    if (typer.actorId !== userId) return typer;
    return {
      ...typer,
      displayName:
        profile.displayName != null
          ? String(profile.displayName || typer.displayName || "Someone")
          : typer.displayName,
      avatar: profile.avatarUrl !== undefined ? profile.avatarUrl : typer.avatar,
      avatarVariant:
        profile.avatarVariant != null
          ? Number(profile.avatarVariant) || 0
          : typer.avatarVariant,
      coverIcon:
        profile.coverIcon != null ? Number(profile.coverIcon) || 0 : typer.coverIcon,
    };
  });
}

export function useChatTyping({
  canChat,
  shareToken,
  selfUserId,
}: {
  canChat: boolean;
  shareToken?: string;
  selfUserId: string | null;
}) {
  const [typers, setTypers] = useState<ChatTyper[]>([]);
  const selfUserIdRef = useRef(selfUserId);
  selfUserIdRef.current = selfUserId;

  const load = useCallback(async () => {
    if (!canChat) {
      setTypers([]);
      return;
    }
    try {
      const data = await api.chatTypers(shareToken);
      const list = Array.isArray(data.typers) ? data.typers : [];
      setTypers(filterTypers(list, selfUserIdRef.current));
    } catch {
      setTypers([]);
    }
  }, [canChat, shareToken]);

  useEffect(() => {
    void load();
    if (!canChat) return;

    const unsubscribeTyping = subscribeLiveEvent(
      "chat_typing_changed",
      (event) => {
        const list = parseTypingEvent(event.data);
        setTypers(filterTypers(list, selfUserIdRef.current));
      },
      { shareToken },
    );
    const unsubscribeProfile = subscribeLiveEvent(
      "profile_changed",
      (event) => {
        try {
          const data = JSON.parse(event.data) as {
            userId?: string;
            profile?: {
              displayName?: string | null;
              avatarUrl?: string | null;
              avatarVariant?: number | null;
              coverIcon?: number | null;
            };
          };
          if (data.userId && data.profile) {
            setTypers((current) =>
              filterTypers(
                applyProfilePatchToTypers(current, data.userId!, data.profile!),
                selfUserIdRef.current,
              ),
            );
          }
        } catch {
          /* fall through to reload */
        }
        void load();
      },
      { shareToken },
    );
    return () => {
      unsubscribeTyping();
      unsubscribeProfile();
    };
  }, [canChat, load, shareToken]);

  return { typers };
}

export function useChatTypingEmitter({
  canChat,
  chatOpen,
  guest,
  draft,
  inputFocused,
}: {
  canChat: boolean;
  chatOpen: boolean;
  guest?: GuestContext;
  draft: string;
  inputFocused: boolean;
}) {
  const guestRef = useRef(guest);
  guestRef.current = guest;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const registeredRef = useRef(false);
  const heartbeatRef = useRef<number | null>(null);
  const pauseRef = useRef<number | null>(null);

  const stopTimers = useCallback(() => {
    if (pauseRef.current) {
      window.clearTimeout(pauseRef.current);
      pauseRef.current = null;
    }
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const emitLeave = useCallback(() => {
    if (!canChat) return;
    void api.reportChatTyping({ leave: true }, guestRef.current ?? null).catch(() => {});
  }, [canChat]);

  const stopAndLeave = useCallback(
    (force = false) => {
      stopTimers();
      const wasRegistered = registeredRef.current;
      registeredRef.current = false;
      if (force || wasRegistered) emitLeave();
    },
    [emitLeave, stopTimers],
  );

  const sendTyping = useCallback(() => {
    if (!canChat) return;
    registeredRef.current = true;
    void api.reportChatTyping({ typing: true }, guestRef.current ?? null).catch(() => {});
  }, [canChat]);

  const startTyping = useCallback(() => {
    if (pauseRef.current) {
      window.clearTimeout(pauseRef.current);
      pauseRef.current = null;
    }
    sendTyping();
    if (!heartbeatRef.current) {
      heartbeatRef.current = window.setInterval(sendTyping, TYPING_HEARTBEAT_MS);
    }
  }, [sendTyping]);

  const schedulePauseLeave = useCallback(() => {
    if (pauseRef.current) return;
    pauseRef.current = window.setTimeout(() => {
      pauseRef.current = null;
      if (draftRef.current.trim().length > 0) return;
      stopAndLeave(false);
    }, TYPING_PAUSE_MS);
  }, [stopAndLeave]);

  useEffect(() => {
    if (!canChat || !chatOpen || !inputFocused) {
      stopAndLeave(false);
      return;
    }

    if (draft.trim().length > 0) {
      startTyping();
      return () => {
        stopTimers();
      };
    }

    if (registeredRef.current) {
      stopTimers();
      schedulePauseLeave();
      return () => {
        if (pauseRef.current) {
          window.clearTimeout(pauseRef.current);
          pauseRef.current = null;
        }
      };
    }

    return undefined;
  }, [
    canChat,
    chatOpen,
    draft,
    inputFocused,
    schedulePauseLeave,
    stopAndLeave,
    startTyping,
    stopTimers,
  ]);

  useEffect(() => {
    if (!canChat) return;
    return () => {
      stopTimers();
      if (registeredRef.current) {
        registeredRef.current = false;
        void api.reportChatTyping({ leave: true }, guestRef.current ?? null).catch(() => {});
      }
    };
  }, [canChat, stopTimers]);

  const clearTyping = useCallback(() => {
    stopAndLeave(true);
  }, [stopAndLeave]);

  return { clearTyping };
}
