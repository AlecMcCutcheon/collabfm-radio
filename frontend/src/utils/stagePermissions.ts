import type { AuthStatus, GuestContext } from "../types/api";
import { guestUserId } from "./guestIdentity";

export function isCurrentBroadcaster(
  auth: AuthStatus,
  broadcasterUserId: string | null,
): boolean {
  if (!broadcasterUserId || !auth.user?.id) return false;
  return String(auth.user.id) === String(broadcasterUserId);
}

export function isGuestLiveBroadcaster(
  guest: GuestContext | null | undefined,
  broadcasterUserId: string | null,
): boolean {
  if (!guest || !broadcasterUserId) return false;
  return broadcasterUserId === guestUserId(guest.guestId);
}

/** Admin (can promote when inactive) or active DJ with stage pass. */
export function canPromoteDj(
  auth: AuthStatus,
  broadcasterUserId: string | null,
  guest?: GuestContext | null,
): boolean {
  if (isGuestLiveBroadcaster(guest, broadcasterUserId)) return false;
  const perms = auth.roleInfo?.permissions;
  if (!perms?.canPromoteUsers) return false;
  if (perms.canPromoteWhenInactive) return true;
  return isCurrentBroadcaster(auth, broadcasterUserId);
}

/** Admin, live DJ, or linked guest controlling their own broadcast. */
export function canSendMediaControl(
  auth: AuthStatus,
  broadcasterUserId: string | null,
  guest?: GuestContext | null,
): boolean {
  if (isGuestLiveBroadcaster(guest, broadcasterUserId)) return true;
  if (auth.roleInfo?.permissions?.canPromoteWhenInactive) return true;
  return isCurrentBroadcaster(auth, broadcasterUserId);
}

/** Anyone listening can trigger party effects (auth or guest session required server-side). */
export function canTriggerPartyEffects(
  auth: AuthStatus,
  guest?: GuestContext | null,
): boolean {
  if (guest?.guestSession) return true;
  return auth.authenticated;
}

export function isAdminUser(auth: AuthStatus): boolean {
  return !!auth.roleInfo?.permissions?.canPromoteWhenInactive;
}

/** Stage host tiles are interactive for admins, DJs, or linked guest broadcasters. */
export function canInteractWithStage(
  auth: AuthStatus,
  broadcasterUserId: string | null,
  guest?: GuestContext | null,
): boolean {
  return (
    canPromoteDj(auth, broadcasterUserId, guest) ||
    canSendMediaControl(auth, broadcasterUserId, guest) ||
    isAdminUser(auth)
  );
}
