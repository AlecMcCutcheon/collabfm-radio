import { api } from "../api/client";

type LiveEventName =
  | "party_effect"
  | "chat_changed"
  | "chat_typing_changed"
  | "presence_roster"
  | "profile_changed"
  | "now_playing_social_changed"
  | "broadcast_status_changed"
  | "broadcast_session_log_changed";

interface SubscribeLiveEventOptions {
  since?: number;
  shareToken?: string;
  onOpen?: () => void;
  onError?: () => void;
}

interface LiveStream {
  source: EventSource;
  handlers: Map<LiveEventName, Set<(event: MessageEvent<string>) => void>>;
  statusHandlers: Set<{
    onOpen?: () => void;
    onError?: () => void;
  }>;
}

const streams = new Map<string, LiveStream>();

function streamKey(shareToken?: string): string {
  return shareToken ? `share:${shareToken}` : "session";
}

function createStream(key: string, options: SubscribeLiveEventOptions): LiveStream {
  const source = new EventSource(api.liveEventsUrl(options.since ?? 0, options.shareToken), {
    withCredentials: true,
  });
  const stream: LiveStream = {
    source,
    handlers: new Map(),
    statusHandlers: new Set(),
  };

  source.addEventListener("open", () => {
    for (const handler of stream.statusHandlers) handler.onOpen?.();
  });

  source.addEventListener("error", () => {
    for (const handler of stream.statusHandlers) handler.onError?.();
  });

  for (const eventName of [
    "party_effect",
    "chat_changed",
    "chat_typing_changed",
    "presence_roster",
    "profile_changed",
    "now_playing_social_changed",
    "broadcast_status_changed",
    "broadcast_session_log_changed",
  ] as const) {
    source.addEventListener(eventName, (event) => {
      const handlers = stream.handlers.get(eventName);
      if (!handlers) return;
      for (const handler of handlers) handler(event as MessageEvent<string>);
    });
  }

  streams.set(key, stream);
  return stream;
}

function closeIfUnused(key: string, stream: LiveStream) {
  const hasEventHandlers = Array.from(stream.handlers.values()).some((handlers) => handlers.size > 0);
  if (hasEventHandlers || stream.statusHandlers.size > 0) return;
  stream.source.close();
  streams.delete(key);
}

export function subscribeLiveEvent(
  eventName: LiveEventName,
  handler: (event: MessageEvent<string>) => void,
  options: SubscribeLiveEventOptions = {},
): () => void {
  if (typeof EventSource === "undefined") {
    options.onError?.();
    return () => {};
  }

  const key = streamKey(options.shareToken);
  const stream = streams.get(key) ?? createStream(key, options);
  const statusHandler = {
    onOpen: options.onOpen,
    onError: options.onError,
  };
  const handlers = stream.handlers.get(eventName) ?? new Set();

  handlers.add(handler);
  stream.handlers.set(eventName, handlers);
  stream.statusHandlers.add(statusHandler);
  if (stream.source.readyState === EventSource.OPEN) {
    statusHandler.onOpen?.();
  }

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) stream.handlers.delete(eventName);
    stream.statusHandlers.delete(statusHandler);
    closeIfUnused(key, stream);
  };
}
