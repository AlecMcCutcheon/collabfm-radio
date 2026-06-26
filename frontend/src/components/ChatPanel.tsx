import { MessageCircle, Radio, Send, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useBrandingFeatures } from "../context/BrandingFeaturesContext";
import { useHostMembers } from "../hooks/useHostMembers";
import { useChatTyping, useChatTypingEmitter } from "../hooks/useChatTyping";
import type { AuthStatus, AppView, ChatMessage, GifResult, GuestContext } from "../types/api";
import { hostAvatarSrc, guestAvatarSrc } from "../utils/avatar";
import { profileHostFromChatMessage } from "../utils/chatProfile";
import { ProfilePartyReactionMenu } from "./ProfilePartyReactionMenu";
import { guestUserId } from "../utils/guestIdentity";
import { avatarImageFallbackHandler } from "../utils/brandingImage";
import { subscribeLiveEvent } from "../utils/liveEvents";
import { AdminBadge } from "./AdminBadge";
import { GifPicker } from "./GifPicker";
import { ProfilePreviewMenu } from "./ProfilePreviewMenu";
import { SongRequestChatCard } from "./SongRequestChatCard";
import { ChatTypingIndicator } from "./ChatTypingIndicator";
import { ChatFabWithUnread, MobileNavChatBadge } from "./ChatMessagePing";

interface ChatPanelProps {
  auth: AuthStatus;
  guest?: GuestContext;
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  onShareLinkInvalid?: () => void;
  broadcasterUserId?: string | null;
}

const CHAT_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  broadcaster: "Broadcaster",
  listener: "Listener",
  guest: "Guest",
};

const CHAT_ROLE_COLORS: Record<string, string> = {
  admin: "#87CEFA",
  broadcaster: "#90EE90",
  listener: "#9ca3af",
  guest: "#c4b5fd",
};

const chatHeaderIconBtnClass =
  "inline-flex items-center justify-center shrink-0 p-0.5 text-gray-400 hover:text-radio-accent transition-colors";

const chatHeaderIconClass = "w-4 h-4";

function ChatRoleBadge({
  roleType,
  roleColor,
}: {
  roleType: string;
  roleColor?: string | null;
}) {
  const normalized = roleType.toLowerCase();
  const label = CHAT_ROLE_LABELS[normalized] ?? roleType;
  const color = roleColor ?? CHAT_ROLE_COLORS[normalized] ?? "#9ca3af";

  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0 leading-none"
      style={{
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

function selfMessageUserId(auth: AuthStatus, guest?: GuestContext): string | null {
  if (guest) return `guest:${guest.guestId}`;
  if (auth.user?.id) return String(auth.user.id);
  return null;
}

function isOwnMessage(message: ChatMessage, selfUserId: string | null): boolean {
  if (!selfUserId || !message.userId) return false;
  return String(message.userId) === selfUserId;
}

function ChatMessageRow({
  message,
  auth,
  guest,
  selfUserId,
  canDelete,
  broadcasterUserId,
  onDeleted,
  onUpdated,
  onProfileOpen,
  onProfilePartyOpen,
}: {
  message: ChatMessage;
  auth: AuthStatus;
  guest?: GuestContext;
  selfUserId: string | null;
  canDelete: boolean;
  broadcasterUserId?: string | null;
  onDeleted: () => void;
  onUpdated: () => void;
  onProfileOpen: (anchor: HTMLElement, message: ChatMessage) => void;
  onProfilePartyOpen: (clientX: number, clientY: number, message: ChatMessage) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSelf = isOwnMessage(message, selfUserId);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteMessage(message.id);
      onDeleted();
    } catch {
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const deleteControl =
    canDelete && message.id ? (
      <div className={`absolute top-0 shrink-0 ${isSelf ? "right-0" : "left-0"}`}>
        {confirming ? (
          <div className="flex items-center gap-1 rounded-lg border border-gray-600 bg-gray-800/95 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="text-[10px] font-semibold uppercase tracking-wide text-red-400 hover:text-red-300 px-1 disabled:opacity-50"
            >
              Remove
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-200 px-1 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            title="Remove message"
            aria-label="Remove message"
            onClick={() => setConfirming(true)}
            className="rounded-md p-0.5 text-gray-500 opacity-60 hover:text-red-400 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    ) : null;

  if (message.type === "SYSTEM_REQUEST") {
    return (
      <SongRequestChatCard
        message={message}
        auth={auth}
        guest={guest}
        broadcasterUserId={broadcasterUserId}
        canDelete={canDelete}
        onUpdated={onUpdated}
        deleteControl={deleteControl}
      />
    );
  }

  const name = message.displayName ?? message.username ?? "Someone";
  const roleType =
    message.roleType ??
    (message.isGuest || message.userId?.startsWith("guest:") ? "guest" : "listener");
  const isGuest = roleType === "guest" || message.isGuest === true;
  const seed = message.userId ?? name;
  const isSelfGuest = isSelf && guest && message.userId === guestUserId(guest.guestId);
  const guestIdFromMessage =
    isGuest && message.userId?.startsWith("guest:") ? message.userId.slice(6) : null;
  const imageSrc = isSelfGuest
    ? guestAvatarSrc(guest.guestId, guest.avatarVariant ?? 0, 72, guest.coverIcon ?? 0)
    : guestIdFromMessage
      ? guestAvatarSrc(
          guestIdFromMessage,
          message.guestAvatarVariant ?? 0,
          72,
          message.guestCoverIcon ?? 0,
        )
      : hostAvatarSrc(
          {
            userId: message.userId ?? seed,
            displayName: name,
            avatar: message.avatar,
          },
          72,
          auth.user,
        );

  return (
    <div className={`group relative flex w-full ${isSelf ? "justify-start" : "justify-end"}`}>
      <div
        className={`relative flex gap-2.5 items-start max-w-[88%] ${
          isSelf ? "flex-row pr-6" : "flex-row-reverse pl-6"
        }`}
      >
        <button
          type="button"
          onClick={(event) => onProfileOpen(event.currentTarget, message)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isSelf) return;
            onProfilePartyOpen(event.clientX, event.clientY, message);
          }}
          className="w-9 h-9 shrink-0 rounded-full overflow-hidden ring-1 ring-gray-600/80 bg-gray-700 hover:ring-gray-500 transition-shadow"
          title={`View ${name}'s profile (right-click for party reactions)`}
        >
          <img
            src={imageSrc}
            alt=""
            onError={avatarImageFallbackHandler(seed, 72)}
            className="w-full h-full object-cover"
          />
        </button>
        <div className={`flex-1 min-w-0 ${isSelf ? "" : "text-right"}`}>
          <div
            className={`flex items-center gap-1.5 flex-wrap mb-0.5 ${
              isSelf ? "" : "justify-end"
            }`}
          >
            <span className="font-semibold text-sm text-white truncate max-w-[9rem] sm:max-w-[11rem]">
              {name}
            </span>
            <ChatRoleBadge roleType={roleType} roleColor={message.roleColor} />
          </div>
          {message.type === "gif" && message.gifUrl ? (
            <div className={`space-y-1 ${isSelf ? "" : "flex flex-col items-end"}`}>
              {message.content ? (
                <p
                  className={`text-sm text-gray-200 break-words leading-snug rounded-xl px-3 py-2 ${
                    isSelf ? "bg-gray-700/80" : "bg-gray-700/50"
                  }`}
                >
                  {message.content}
                </p>
              ) : null}
              <img
                src={message.gifUrl}
                alt="GIF"
                className="max-w-full rounded-lg max-h-48 object-contain bg-gray-800/50"
                loading="lazy"
              />
            </div>
          ) : (
            <p
              className={`inline-block text-sm text-gray-200 break-words leading-snug rounded-xl px-3 py-2 ${
                isSelf ? "bg-gray-700/80" : "bg-gray-700/50"
              }`}
            >
              {message.content}
            </p>
          )}
        </div>
        {deleteControl}
      </div>
    </div>
  );
}

function selfChatRole(auth: AuthStatus, guest?: GuestContext): { roleType: string; roleColor?: string | null } {
  if (guest) return { roleType: "guest", roleColor: CHAT_ROLE_COLORS.guest };
  const roleType = auth.roleInfo?.roleType ?? "listener";
  return {
    roleType,
    roleColor: auth.roleInfo?.roleColor ?? CHAT_ROLE_COLORS[roleType] ?? CHAT_ROLE_COLORS.listener,
  };
}

export function ChatPanel({
  auth,
  guest,
  open,
  onClose,
  embedded = false,
  onShareLinkInvalid,
  broadcasterUserId = null,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState<{
    message: ChatMessage;
    anchor: DOMRect;
  } | null>(null);
  const [profilePartyMenu, setProfilePartyMenu] = useState<{
    message: ChatMessage;
    x: number;
    y: number;
  } | null>(null);
  const { chatGifs: chatGifsEnabled } = useBrandingFeatures();
  const listRef = useRef<HTMLDivElement>(null);

  const canChat = auth.authenticated || !!guest;
  const canDeleteMessages = auth.roleInfo?.permissions.canDeleteMessages === true;
  const selfUserId = selfMessageUserId(auth, guest);
  const { hosts: stageHosts } = useHostMembers(canChat, guest?.shareToken);
  const chatOpen = open || embedded;
  const { typers } = useChatTyping({
    canChat,
    shareToken: guest?.shareToken,
    selfUserId,
  });
  const { clearTyping } = useChatTypingEmitter({
    canChat,
    chatOpen,
    guest,
    draft,
    inputFocused,
  });

  const openProfileMenu = (anchor: HTMLElement, message: ChatMessage) => {
    setProfileMenu((current) => {
      if (current?.message.id === message.id) return null;
      return {
        message,
        anchor: anchor.getBoundingClientRect(),
      };
    });
  };

  const profileHost = profileMenu
    ? profileHostFromChatMessage(profileMenu.message, stageHosts)
    : null;
  const profilePartyHost = profilePartyMenu
    ? profileHostFromChatMessage(profilePartyMenu.message, stageHosts)
    : null;

  const openProfilePartyMenu = (clientX: number, clientY: number, message: ChatMessage) => {
    setProfilePartyMenu({ message, x: clientX, y: clientY });
  };

  useEffect(() => {
    if (!gifOpen || chatGifsEnabled) return;
    setGifOpen(false);
  }, [chatGifsEnabled, gifOpen]);

  const load = useCallback(async () => {
    if (!canChat) return;
    try {
      const data = await api.messages(guest?.shareToken, guest?.guestId);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    }
  }, [canChat, guest?.shareToken, guest?.guestId]);

  useEffect(() => {
    void load();
    if (!canChat) return;
    const unsubscribe = subscribeLiveEvent("chat_changed", () => void load(), {
      shareToken: guest?.shareToken,
    });
    const unsubscribeProfile = subscribeLiveEvent("profile_changed", () => void load(), {
      shareToken: guest?.shareToken,
    });
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      unsubscribe();
      unsubscribeProfile();
      window.clearInterval(id);
    };
  }, [canChat, guest?.shareToken, load]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const notifyIfShareInvalid = () => {
    if (!guest || !onShareLinkInvalid) return;
    void api.listenInfo(guest.shareToken).catch(() => onShareLinkInvalid());
  };

  const sendGif = async (gif: GifResult) => {
    if (!canChat) return;
    try {
      if (guest) {
        await api.sendGuestGifMessage(gif.url, guest);
      } else {
        await api.sendGifMessage(gif.url);
      }
      await load();
    } catch {
      notifyIfShareInvalid();
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || !canChat) return;
    try {
      if (guest) {
        await api.sendGuestMessage(draft.trim(), guest);
      } else {
        await api.sendMessage(draft.trim());
      }
      setDraft("");
      clearTyping();
      await load();
    } catch {
      notifyIfShareInvalid();
    }
  };

  if (!open && !embedded) return null;

  const youAre = selfChatRole(auth, guest);

  const panel = (
    <div
      className={`bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl border-gray-700 flex flex-col transition-all duration-300 ${
        embedded
          ? "w-full h-full border-0 rounded-none"
          : "hidden sm:flex sm:fixed sm:bottom-6 sm:right-6 sm:z-[70] sm:rounded-2xl sm:border sm:w-80 md:w-96 sm:h-[clamp(500px,calc(100vh-8rem),720px)]"
      }`}
    >
      <div className="flex items-center justify-between p-5 sm:p-4 border-b border-gray-700">
        <div className="flex items-center gap-3 sm:gap-2">
          <MessageCircle className="w-6 h-6 sm:w-5 sm:h-5 text-radio-accent" />
          <h3 className="text-xl sm:text-lg font-bold text-white">Live Chat</h3>
        </div>
        <div className="flex items-center gap-2">
          {canChat && (
            <ChatRoleBadge roleType={youAre.roleType} roleColor={youAre.roleColor} />
          )}
          {auth.authenticated && (
            <AdminBadge
              auth={auth}
              iconBtnClass={chatHeaderIconBtnClass}
              iconClass={chatHeaderIconClass}
            />
          )}
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              title="Close chat"
              className={chatHeaderIconBtnClass}
            >
              <X className={chatHeaderIconClass} />
            </button>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
        style={{ willChange: "scroll-position" }}
      >
        {!canChat ? (
          <p className="text-gray-400 text-center text-sm mt-8">Sign in to participate in chat.</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 text-center text-sm mt-8">
            No messages yet. Be the first to chat!
          </p>
        ) : (
          messages.slice(-50).map((m) => (
            <ChatMessageRow
              key={m.id}
              message={m}
              auth={auth}
              guest={guest}
              selfUserId={selfUserId}
              canDelete={canDeleteMessages}
              broadcasterUserId={broadcasterUserId}
              onDeleted={() => void load()}
              onUpdated={() => void load()}
              onProfileOpen={openProfileMenu}
              onProfilePartyOpen={openProfilePartyMenu}
            />
          ))
        )}
      </div>

      <div className="p-5 sm:p-4 border-t border-gray-700 relative">
        {chatGifsEnabled && (
          <GifPicker
            open={gifOpen && canChat}
            onClose={() => setGifOpen(false)}
            onSelect={(gif) => void sendGif(gif)}
            shareToken={guest?.shareToken}
          />
        )}
        <ChatTypingIndicator typers={typers} auth={auth} />
        <form className="flex gap-2" onSubmit={(e) => void send(e)}>
          {chatGifsEnabled && (
            <button
              type="button"
              disabled={!canChat}
              onClick={() => setGifOpen((v) => !v)}
              title="Send a GIF"
              aria-label="Send a GIF"
              aria-pressed={gifOpen}
              className={`shrink-0 inline-flex items-center justify-center rounded-xl px-2.5 py-3 sm:py-2 min-w-[2.75rem] text-[11px] font-bold tracking-wide uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                gifOpen
                  ? "bg-radio-accent/20 text-radio-accent ring-2 ring-radio-accent/40"
                  : "bg-gray-700 text-gray-300 hover:text-radio-accent hover:bg-gray-600"
              }`}
            >
              GIF
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              clearTyping();
              setInputFocused(false);
            }}
            maxLength={200}
            disabled={!canChat}
            placeholder="Type a message..."
            aria-label="Chat message"
            className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-3 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-radio-accent"
          />
          <button
            type="submit"
            disabled={!canChat || !draft.trim()}
            className="bg-gradient-to-br from-radio-accent to-blue-500 text-white rounded-xl p-3 sm:p-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {panel}
      {profileMenu && profileHost && (
        <ProfilePreviewMenu
          host={profileHost}
          anchor={profileMenu.anchor}
          onClose={() => setProfileMenu(null)}
          authUser={auth.user ?? null}
          guest={guest}
        />
      )}
      {profilePartyMenu && profilePartyHost && (
        <ProfilePartyReactionMenu
          host={profilePartyHost}
          clientX={profilePartyMenu.x}
          clientY={profilePartyMenu.y}
          onClose={() => setProfilePartyMenu(null)}
          guest={guest}
          selfUserId={selfUserId}
        />
      )}
    </>
  );
}

interface MobileNavProps {
  view: AppView;
  onChange: (view: AppView) => void;
  showStudio?: boolean;
  chatUnreadCount?: number;
  othersTyping?: boolean;
}

export function MobileNav({
  view,
  onChange,
  showStudio = false,
  chatUnreadCount = 0,
  othersTyping = false,
}: MobileNavProps) {
  const chatTypingPulse = othersTyping && view !== "chat";
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900/95 border-t border-gray-700 sm:hidden">
      <div className={`flex py-2 ${showStudio ? "[&_button]:text-xs [&_button]:px-0" : ""}`}>
        <NavButton active={view === "radio"} onClick={() => onChange("radio")} icon={<Radio className="w-5 h-5" />} label="Radio" />
        <NavButton active={view === "stage"} onClick={() => onChange("stage")} icon={<UsersRound className="w-5 h-5" />} label="Stage" />
        <NavButton
          active={view === "chat"}
          onClick={() => onChange("chat")}
          icon={
            <MessageCircle
              className={`w-5 h-5 ${chatTypingPulse ? "chat-typing-icon-pulse-nav" : ""}`}
            />
          }
          label="Chat"
          badge={view !== "chat" ? <MobileNavChatBadge count={chatUnreadCount} /> : null}
        />
        {showStudio && (
          <NavButton
            active={view === "studio"}
            onClick={() => onChange("studio")}
            icon={<SlidersHorizontal className="w-5 h-5" />}
            label="Studio"
          />
        )}
      </div>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge = null,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 py-3 text-sm font-semibold ${active ? "text-white" : "text-gray-400"}`}
    >
      <span className="inline-flex items-center justify-center gap-2">
        <span className="relative inline-flex">
          {icon}
          {badge}
        </span>
        <span>{label}</span>
      </span>
    </button>
  );
}

export function ChatFab({
  onClick,
  visible,
  unreadCount = 0,
  othersTyping = false,
}: {
  onClick: () => void;
  visible: boolean;
  unreadCount?: number;
  othersTyping?: boolean;
}) {
  return (
    <ChatFabWithUnread
      visible={visible}
      unreadCount={unreadCount}
      othersTyping={othersTyping}
      onClick={onClick}
    />
  );
}
