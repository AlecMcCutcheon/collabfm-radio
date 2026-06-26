export type SongRequestStatus = "requested" | "approved" | "denied" | "playing" | "played";

export function songRequestKey(title: string, artist: string): string {
  return `${title}|||${artist}`;
}

export function parseRequestMessageContent(content: string): { title: string; artist: string } | null {
  const match = String(content || "").match(/requested "([^"]+)" by (.+)$/);
  if (!match) return null;
  return { title: match[1], artist: match[2].trim() };
}

export const REQUEST_STATUS_LABELS: Record<
  SongRequestStatus,
  { emoji: string; label: string; note: string; colorClass: string }
> = {
  requested: {
    emoji: "⏳",
    label: "Requested",
    note: "Pending approval",
    colorClass: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  approved: {
    emoji: "✅",
    label: "Approved",
    note: "Will play soon",
    colorClass: "bg-green-500/20 text-green-300 border-green-500/40",
  },
  playing: {
    emoji: "▶️",
    label: "Playing",
    note: "Currently on air",
    colorClass: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
  played: {
    emoji: "✔️",
    label: "Played",
    note: "Already aired",
    colorClass: "bg-gray-500/20 text-gray-300 border-gray-500/40",
  },
  denied: {
    emoji: "❌",
    label: "Denied",
    note: "Not this time",
    colorClass: "bg-red-500/20 text-red-300 border-red-500/40",
  },
};

export function normalizeRequestStatus(raw?: string | null): SongRequestStatus {
  const status = String(raw || "requested").toLowerCase();
  if (status === "approved" || status === "denied" || status === "playing" || status === "played") {
    return status;
  }
  return "requested";
}

export function canModerateSongRequests(
  auth: { user?: { id: string } | null; roleInfo?: { permissions?: { canApproveRequests?: boolean; canPromoteWhenInactive?: boolean } } | null },
  guest: { guestId: string } | null | undefined,
  broadcasterUserId: string | null | undefined,
): boolean {
  const perms = auth.roleInfo?.permissions;
  if (perms?.canApproveRequests) {
    if (perms.canPromoteWhenInactive) return true;
    if (auth.user?.id && broadcasterUserId && String(auth.user.id) === String(broadcasterUserId)) {
      return true;
    }
  }
  if (guest && broadcasterUserId === `guest:${guest.guestId}`) return true;
  return false;
}
