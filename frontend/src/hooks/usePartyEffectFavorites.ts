import { useCallback, useEffect, useState } from "react";
import type { PartyEffectType } from "../types/api";
import {
  PARTY_FAVORITES_CHANGED_EVENT,
  emptyPartyFavoriteSlots,
  loadPartyFavorites,
  savePartyFavorites,
  type PartyFavoriteSlots,
} from "../utils/partyEffectFavorites";

export function usePartyEffectFavorites(scope: string | null | undefined) {
  const [slots, setSlots] = useState<PartyFavoriteSlots>(() =>
    scope ? loadPartyFavorites(scope) : emptyPartyFavoriteSlots(),
  );

  useEffect(() => {
    if (!scope) {
      setSlots(emptyPartyFavoriteSlots());
      return;
    }
    setSlots(loadPartyFavorites(scope));
  }, [scope]);

  useEffect(() => {
    if (!scope) return;
    const sync = () => setSlots(loadPartyFavorites(scope));
    window.addEventListener(PARTY_FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PARTY_FAVORITES_CHANGED_EVENT, sync);
  }, [scope]);

  const persist = useCallback(
    (next: PartyFavoriteSlots) => {
      if (!scope) return;
      setSlots(next);
      savePartyFavorites(scope, next);
    },
    [scope],
  );

  const setSlot = useCallback(
    (index: number, type: PartyEffectType | null) => {
      if (!scope || index < 0 || index >= slots.length) return;
      const next = [...slots];
      next[index] = type;
      persist(next);
    },
    [persist, scope, slots],
  );

  const clearSlot = useCallback(
    (index: number) => setSlot(index, null),
    [setSlot],
  );

  return { slots, setSlot, clearSlot };
}
