import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { GuestContext } from "../types/api";

export interface PinnedMediaTarget {
  wsId: string;
  userId: string;
  displayName: string;
  broadcastName: string | null;
  site: string | null;
}

interface PinnedMediaControlContextValue {
  pinned: PinnedMediaTarget | null;
  guest: GuestContext | null;
  togglePin: (target: PinnedMediaTarget) => void;
  clearPin: () => void;
  isPinned: (wsId: string) => boolean;
}

const PinnedMediaControlContext = createContext<PinnedMediaControlContextValue | null>(null);

export function PinnedMediaControlProvider({
  children,
  guest = null,
}: {
  children: ReactNode;
  guest?: GuestContext | null;
}) {
  const [pinned, setPinned] = useState<PinnedMediaTarget | null>(null);

  const togglePin = useCallback((target: PinnedMediaTarget) => {
    setPinned((current) => (current?.wsId === target.wsId ? null : target));
  }, []);

  const clearPin = useCallback(() => setPinned(null), []);

  const isPinned = useCallback((wsId: string) => pinned?.wsId === wsId, [pinned]);

  const value = useMemo(
    () => ({ pinned, guest, togglePin, clearPin, isPinned }),
    [pinned, guest, togglePin, clearPin, isPinned],
  );

  return (
    <PinnedMediaControlContext.Provider value={value}>
      {children}
    </PinnedMediaControlContext.Provider>
  );
}

export function usePinnedMediaControl() {
  const ctx = useContext(PinnedMediaControlContext);
  if (!ctx) {
    throw new Error("usePinnedMediaControl must be used within PinnedMediaControlProvider");
  }
  return ctx;
}
