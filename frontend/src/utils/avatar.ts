import { proceduralAvatarArt } from "./proceduralArt";
import { apiUrlWithShareToken } from "../config";
import { guestAvatarSeed, guestUserId, type GuestIdentity } from "./guestIdentity";

/** Default DJ visualizer / station logo — not used for user profile avatars. */
export const DEFAULT_VISUALIZER_SRC = "/profile.webp";

export function avatarSrc(seed: string, size = 128): string {
  return proceduralAvatarArt(seed, size);
}

export function guestAvatarSrc(
  guestId: string,
  variant = 0,
  size = 128,
  coverIcon = 0,
): string {
  return proceduralAvatarArt(guestAvatarSeed(guestId, variant), size, coverIcon);
}

export function stageMemberAvatarSrc(
  host: {
    userId: string;
    displayName?: string;
    avatar?: string | null;
    avatarUrl?: string | null;
    guestAvatarVariant?: number;
    guestCoverIcon?: number;
  },
  size = 128,
  authUser?: { id: string; avatar?: string | null } | null,
  guest?: (Pick<GuestIdentity, "guestId" | "avatarVariant" | "coverIcon"> & { shareToken?: string }) | null,
): string {
  if (host.userId.startsWith("guest:")) {
    const guestId = host.userId.slice(6);
    if (guest && host.userId === guestUserId(guest.guestId)) {
      return guestAvatarSrc(
        guest.guestId,
        guest.avatarVariant ?? 0,
        size,
        guest.coverIcon ?? 0,
      );
    }
    return guestAvatarSrc(
      guestId,
      host.guestAvatarVariant ?? 0,
      size,
      host.guestCoverIcon ?? 0,
    );
  }
  return hostAvatarSrc(host, size, authUser, guest?.shareToken);
}

export function hostAvatarSrc(
  host: { displayName?: string; userId: string; avatar?: string | null; avatarUrl?: string | null },
  size = 128,
  authUser?: { id: string; avatar?: string | null } | null,
  shareToken?: string,
): string {
  const custom = host.avatar ?? host.avatarUrl;
  if (custom) return apiUrlWithShareToken(custom, shareToken);
  if (
    authUser?.avatar &&
    authUser.id &&
    String(host.userId) === String(authUser.id)
  ) {
    return apiUrlWithShareToken(authUser.avatar, shareToken);
  }
  return avatarSrc(host.userId || host.displayName || "guest", size);
}
