import { useSitePresence } from "../hooks/useSitePresence";
import type { AuthUser, GuestContext } from "../types/api";

interface SitePresenceTrackerProps {
  active?: boolean;
  listening: boolean;
  guest?: GuestContext | null;
  authUser?: AuthUser | null;
  guestName?: string;
  avatarVariant?: number;
  coverIcon?: number;
}

export function SitePresenceTracker({
  active = true,
  listening,
  guest,
  authUser,
  guestName,
  avatarVariant,
  coverIcon,
}: SitePresenceTrackerProps) {
  useSitePresence({
    active,
    listening,
    guest,
    authUser,
    guestName,
    avatarVariant,
    coverIcon,
  });
  return null;
}
