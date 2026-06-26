import type { GuestContext } from "../types/api";
import { stageMemberAvatarSrc } from "../utils/avatar";
import { avatarImageFallbackHandler } from "../utils/brandingImage";
import type { StageHostGroup } from "../utils/stageHosts";
import { LevelProgressBar } from "./LevelProgressBar";

interface StageProfilePreviewProps {
  host: StageHostGroup;
  authUser?: { id: string; avatar?: string | null } | null;
  guest?: GuestContext | null;
}

function guestSubtitle(host: StageHostGroup): string {
  if (host.onStage || host.hasActiveConnection) return "Guest broadcaster";
  if (host.listening) return "Guest listener";
  return "Guest";
}

export function StageProfilePreview({ host, authUser, guest }: StageProfilePreviewProps) {
  const isGuestHost = host.userId.startsWith("guest:");
  const src = stageMemberAvatarSrc(host, 128, authUser, guest);
  const status = !isGuestHost ? host.bio?.trim() : "";
  const genres = !isGuestHost ? (host.genres ?? []) : [];

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden ring-2 ring-gray-600/80 shadow-md">
          <img
            src={src}
            alt={host.displayName}
            className="w-full h-full object-cover"
            onError={avatarImageFallbackHandler(host.userId || host.displayName, 128)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold truncate"
            style={{ color: host.roleColor ?? "#f3f4f6" }}
            title={host.displayName}
          >
            {host.displayName}
          </div>
          {status ? (
            <p className="text-xs text-gray-400 mt-0.5 leading-snug break-words">{status}</p>
          ) : isGuestHost ? (
            <p className="text-[11px] text-gray-500 mt-0.5">{guestSubtitle(host)}</p>
          ) : null}
          {!isGuestHost && <LevelProgressBar level={host.level} compact />}
        </div>
      </div>

      {genres.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {genres.map((genre) => (
            <span
              key={genre}
              className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-600/15 px-2 py-0.5 text-[10px] text-indigo-100"
            >
              {genre}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
