import { ImageIcon, MessageCircle, Music2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseChatChangedEvent,
  type ChatMessagePingKind,
  type ChatMessagePingPayload,
} from "../hooks/useChatUnread";
import { subscribeLiveEvent } from "../utils/liveEvents";

const PING_MS: Record<ChatMessagePingKind, number> = {
  text: 2200,
  gif: 2600,
  request: 2400,
};

const DESKTOP_MEDIA_QUERY = "(min-width: 640px)";

function useIsMobileLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia(DESKTOP_MEDIA_QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setMobile(!mq.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  return mobile;
}

interface ChatMessagePingItem extends ChatMessagePingPayload {
  pingId: string;
  x: number;
  y: number;
}

interface ChatMessagePingLayerProps {
  active: boolean;
  shareToken?: string;
  selfUserId: string | null;
  chatVisible: boolean;
  mobileChatAnchorX?: number;
}

function pingAnchor(
  chatVisible: boolean,
  mobileLayout: boolean,
  mobileChatAnchorX: number,
): { x: number; y: number } {
  if (chatVisible) {
    return { x: 0.5, y: 0.07 };
  }
  if (mobileLayout) {
    return { x: mobileChatAnchorX, y: 0.945 };
  }
  return { x: 0.93, y: 0.88 };
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function TextPingBubble() {
  return (
    <span className="chat-ping-text">
      <span className="chat-ping-text-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <MessageCircle className="w-4 h-4 opacity-90" strokeWidth={2.25} />
    </span>
  );
}

function GifPingBubble({ gifUrl }: { gifUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!gifUrl && !failed;

  return (
    <span className="chat-ping-gif">
      <span className="chat-ping-gif-shimmer" aria-hidden />
      {showImage ? (
        <img
          src={gifUrl}
          alt=""
          className="chat-ping-gif-img"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="chat-ping-gif-fallback">
          <ImageIcon className="w-5 h-5" strokeWidth={2} />
        </span>
      )}
      <span className="chat-ping-gif-label">GIF</span>
    </span>
  );
}

function RequestPingBubble({
  requestTitle,
  requestArtist,
}: {
  requestTitle?: string | null;
  requestArtist?: string | null;
}) {
  const title = requestTitle ? truncate(requestTitle, 22) : "Song request";
  const artist = requestArtist ? truncate(requestArtist, 18) : null;

  return (
    <span className="chat-ping-request">
      <span className="chat-ping-request-ring" aria-hidden />
      <span className="chat-ping-request-disc">
        <Music2 className="w-5 h-5 text-emerald-100" strokeWidth={2.25} />
      </span>
      <span className="chat-ping-request-copy">
        <span className="chat-ping-request-title">{title}</span>
        {artist ? <span className="chat-ping-request-artist">{artist}</span> : null}
      </span>
    </span>
  );
}

function ChatPingBubble({ ping }: { ping: ChatMessagePingItem }) {
  if (ping.kind === "gif") {
    return <GifPingBubble gifUrl={ping.gifUrl} />;
  }
  if (ping.kind === "request") {
    return (
      <RequestPingBubble requestTitle={ping.requestTitle} requestArtist={ping.requestArtist} />
    );
  }
  return <TextPingBubble />;
}

export function ChatMessagePingLayer({
  active,
  shareToken,
  selfUserId,
  chatVisible,
  mobileChatAnchorX = 0.625,
}: ChatMessagePingLayerProps) {
  const [pings, setPings] = useState<ChatMessagePingItem[]>([]);
  const mobileLayout = useIsMobileLayout();

  useEffect(() => {
    if (!active) return;

    const unsubscribe = subscribeLiveEvent(
      "chat_changed",
      (event) => {
        const payload = parseChatChangedEvent(event.data);
        if (
          (payload?.reason !== "message" && payload?.reason !== "request") ||
          !payload.latestMessage
        ) {
          return;
        }
        if (selfUserId && payload.latestMessage.userId === selfUserId) return;

        const msg = payload.latestMessage;
        if (!msg.id || !msg.userId) return;

        const anchor = pingAnchor(chatVisible, mobileLayout, mobileChatAnchorX);
        const kind = msg.kind ?? "text";
        const duration = PING_MS[kind] ?? PING_MS.text;
        const pingId = `${msg.id}-${Date.now()}`;
        setPings((prev) => [
          ...prev,
          {
            pingId,
            x: anchor.x,
            y: anchor.y,
            id: msg.id,
            userId: msg.userId,
            timestamp: msg.timestamp ?? Date.now(),
            kind,
            gifUrl: msg.gifUrl,
            requestTitle: msg.requestTitle,
            requestArtist: msg.requestArtist,
          },
        ]);
        window.setTimeout(() => {
          setPings((prev) => prev.filter((item) => item.pingId !== pingId));
        }, duration);
      },
      { shareToken },
    );

    return unsubscribe;
  }, [active, chatVisible, mobileChatAnchorX, mobileLayout, selfUserId, shareToken]);

  if (!pings.length || typeof document === "undefined") return null;

  const layer = (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[85]" aria-hidden>
      <style>{`
        @keyframes chat-ping-rise {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
          }
          14% {
            opacity: 1;
            transform: translate(-50%, -58%) scale(1.06);
          }
          36% {
            transform: translate(-50%, -72%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -125%) scale(0.94);
          }
        }
        @keyframes chat-ping-sway {
          0%, 100% { margin-left: 0; }
          50% { margin-left: 6px; }
        }
        @keyframes chat-ping-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes chat-ping-gif-tilt {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }
        @keyframes chat-ping-shimmer {
          0% { transform: translateX(-120%) rotate(12deg); opacity: 0; }
          35% { opacity: 0.85; }
          100% { transform: translateX(120%) rotate(12deg); opacity: 0; }
        }
        @keyframes chat-ping-disc-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes chat-ping-ring-pulse {
          0% { transform: scale(0.85); opacity: 0.75; }
          70% { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .chat-message-ping {
          position: absolute;
          animation: chat-ping-rise var(--ping-ms, 2200ms) cubic-bezier(0.22, 0.82, 0.24, 1) forwards,
            chat-ping-sway calc(var(--ping-ms, 2200ms) * 0.9) ease-in-out;
        }
        .chat-ping-text {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 0.65rem;
          border-radius: 1rem 1rem 1rem 0.35rem;
          background: linear-gradient(135deg, rgba(30, 64, 175, 0.96), rgba(59, 130, 246, 0.92));
          border: 1px solid rgba(191, 219, 254, 0.55);
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.35),
            0 0 18px rgba(96, 165, 250, 0.35);
          color: #eff6ff;
        }
        .chat-ping-text-dots {
          display: inline-flex;
          align-items: center;
          gap: 0.15rem;
        }
        .chat-ping-text-dots span {
          width: 0.28rem;
          height: 0.28rem;
          border-radius: 9999px;
          background: rgba(239, 246, 255, 0.95);
          animation: chat-ping-dot 900ms ease-in-out infinite;
        }
        .chat-ping-text-dots span:nth-child(2) { animation-delay: 120ms; }
        .chat-ping-text-dots span:nth-child(3) { animation-delay: 240ms; }
        .chat-ping-gif {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          width: 3.65rem;
          padding: 0.2rem;
          border-radius: 0.65rem;
          background: linear-gradient(145deg, rgba(88, 28, 135, 0.95), rgba(190, 24, 93, 0.9));
          border: 2px solid rgba(244, 114, 182, 0.75);
          box-shadow:
            0 10px 26px rgba(0, 0, 0, 0.38),
            0 0 20px rgba(236, 72, 153, 0.4);
          overflow: hidden;
          animation: chat-ping-gif-tilt calc(var(--ping-ms, 2600ms) * 0.85) ease-in-out;
        }
        .chat-ping-gif-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.45),
            transparent
          );
          animation: chat-ping-shimmer 1.1s ease-out 0.15s;
          pointer-events: none;
        }
        .chat-ping-gif-img,
        .chat-ping-gif-fallback {
          width: 3.15rem;
          height: 3.15rem;
          border-radius: 0.45rem;
          object-fit: cover;
          background: rgba(15, 23, 42, 0.65);
        }
        .chat-ping-gif-fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fce7f3;
        }
        .chat-ping-gif-label {
          margin-top: 0.15rem;
          font-size: 0.55rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #fce7f3;
        }
        .chat-ping-request {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          min-width: 5.5rem;
          max-width: 9rem;
          padding: 0.35rem 0.55rem 0.45rem;
          border-radius: 0.9rem;
          background: linear-gradient(145deg, rgba(6, 78, 59, 0.95), rgba(16, 120, 80, 0.92));
          border: 1px solid rgba(110, 231, 183, 0.55);
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.35),
            0 0 18px rgba(52, 211, 153, 0.35);
        }
        .chat-ping-request-ring {
          position: absolute;
          top: 0.45rem;
          width: 2.6rem;
          height: 2.6rem;
          border-radius: 9999px;
          border: 2px solid rgba(110, 231, 183, 0.65);
          animation: chat-ping-ring-pulse 1.4s ease-out infinite;
        }
        .chat-ping-request-disc {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.35rem;
          height: 2.35rem;
          border-radius: 9999px;
          background: conic-gradient(from 210deg, #064e3b, #10b981, #6ee7b7, #064e3b);
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.15);
          animation: chat-ping-disc-spin 2.4s linear infinite;
        }
        .chat-ping-request-copy {
          margin-top: 0.35rem;
          text-align: center;
          line-height: 1.15;
        }
        .chat-ping-request-title {
          display: block;
          font-size: 0.62rem;
          font-weight: 700;
          color: #ecfdf5;
        }
        .chat-ping-request-artist {
          display: block;
          margin-top: 0.1rem;
          font-size: 0.55rem;
          font-weight: 500;
          color: rgba(209, 250, 229, 0.85);
        }
      `}</style>
      {pings.map((ping) => (
        <div
          key={ping.pingId}
          className="chat-message-ping"
          style={{
            left: `${ping.x * 100}vw`,
            top: `${ping.y * 100}vh`,
            ["--ping-ms" as string]: `${PING_MS[ping.kind] ?? PING_MS.text}ms`,
          }}
        >
          <ChatPingBubble ping={ping} />
        </div>
      ))}
    </div>
  );

  return createPortal(layer, document.body);
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none inline-flex items-center justify-center border-2 border-gray-900 shadow-md"
      aria-label={`${count} unread chat messages`}
    >
      {label}
    </span>
  );
}

export function ChatFabWithUnread({
  visible,
  unreadCount,
  othersTyping = false,
  onClick,
}: {
  visible: boolean;
  unreadCount: number;
  othersTyping?: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="hidden sm:block fixed bottom-6 right-6 z-40">
      <button
        type="button"
        onClick={onClick}
        title={othersTyping ? "Someone is typing — open chat" : "Open chat"}
        className="relative bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-white rounded-full p-4 shadow-lg hover:scale-110 transition-all duration-300"
      >
        <MessageCircle
          className={`w-6 h-6 ${othersTyping ? "chat-typing-icon-pulse-fab" : ""}`}
        />
        <UnreadBadge count={unreadCount} />
      </button>
    </div>
  );
}

export function MobileNavChatBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute top-1 right-[18%] min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none inline-flex items-center justify-center">
      {label}
    </span>
  );
}
