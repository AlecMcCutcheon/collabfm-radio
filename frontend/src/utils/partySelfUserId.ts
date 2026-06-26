import type { AuthStatus, GuestContext } from "../types/api";

export function partySelfUserId(auth: AuthStatus, guest?: GuestContext | null): string | null {
  if (guest?.guestId) return `guest:${guest.guestId}`;
  if (auth.user?.id) return String(auth.user.id);
  return null;
}

export function partySelfUserIdFromParts(
  authUser?: { id: string } | null,
  guest?: GuestContext | null,
): string | null {
  if (guest?.guestId) return `guest:${guest.guestId}`;
  if (authUser?.id) return String(authUser.id);
  return null;
}

export function isSelfPartyTarget(targetUserId: string, selfUserId: string | null): boolean {
  if (!selfUserId) return false;
  const target = String(targetUserId).trim();
  const self = String(selfUserId).trim();
  if (target === self) return true;
  const targetGuest = target.startsWith("guest:") ? target.slice(6) : target;
  const selfGuest = self.startsWith("guest:") ? self.slice(6) : self;
  return targetGuest === selfGuest && (target.startsWith("guest:") || self.startsWith("guest:"));
}
