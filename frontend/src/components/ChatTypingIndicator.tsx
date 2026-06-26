import type { AuthStatus, ChatTyper } from "../types/api";
import { hostAvatarSrc, guestAvatarSrc } from "../utils/avatar";
import { avatarImageFallbackHandler } from "../utils/brandingImage";

function typingLabel(typers: ChatTyper[]): string {
  if (typers.length === 1) {
    return `${typers[0].displayName} is typing`;
  }
  if (typers.length === 2) {
    return `${typers[0].displayName} and ${typers[1].displayName} are typing`;
  }
  if (typers.length > 2) {
    return `${typers[0].displayName}, ${typers[1].displayName} and ${typers.length - 2} others are typing`;
  }
  return "";
}

function typerAvatarSrc(
  typer: ChatTyper,
  authUser: AuthStatus["user"],
  shareToken?: string,
): string {
  const name = typer.displayName || "Someone";
  const isGuest = typer.isGuest || typer.actorId.startsWith("guest:");
  if (isGuest) {
    const guestId = typer.actorId.startsWith("guest:")
      ? typer.actorId.slice(6)
      : typer.actorId;
    return guestAvatarSrc(guestId, typer.avatarVariant ?? 0, 48, typer.coverIcon ?? 0);
  }
  return hostAvatarSrc(
    {
      userId: typer.actorId,
      displayName: name,
      avatar: typer.avatar ?? null,
    },
    48,
    authUser,
    shareToken,
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

interface ChatTypingIndicatorProps {
  typers: ChatTyper[];
  auth: AuthStatus;
  shareToken?: string;
}

export function ChatTypingIndicator({ typers, auth, shareToken }: ChatTypingIndicatorProps) {
  if (!typers.length) return null;

  const label = typingLabel(typers);
  const maxAvatars = 5;
  const shown = typers.slice(0, maxAvatars);
  const overflow = typers.length - shown.length;

  return (
    <div
      className="flex items-center gap-2 min-h-[1.75rem] px-0.5 pb-2 text-[11px] text-gray-400"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-center shrink-0">
        {shown.map((typer, index) => {
          const avatarSrc = typerAvatarSrc(typer, auth.user, shareToken);
          return (
          <span
            key={`${typer.actorId}-${typer.displayName}-${typer.avatarVariant ?? 0}-${typer.coverIcon ?? 0}-${typer.avatar ?? ""}`}
            className={`relative inline-flex rounded-full ring-2 ring-radio-accent/40 ${
              index > 0 ? "-ml-2" : ""
            }`}
            style={{ zIndex: shown.length - index }}
            title={typer.displayName}
          >
            <img
              src={avatarSrc}
              alt=""
              className="w-5 h-5 rounded-full object-cover bg-gray-700"
              onError={avatarImageFallbackHandler(typer.actorId, 48)}
            />
          </span>
          );
        })}
        {overflow > 0 ? (
          <span
            className="relative -ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-700 px-1 text-[9px] font-semibold text-gray-300 ring-2 ring-gray-800"
            style={{ zIndex: 0 }}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
      {label ? (
        <span className="truncate leading-tight">
          {label}
          <TypingDots />
        </span>
      ) : null}
    </div>
  );
}
