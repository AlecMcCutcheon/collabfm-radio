import { createContext, useContext, type ReactNode } from "react";
import type { GuestContext, PartyEffect, PartyEffectType, ProfilePartyEffectType } from "../types/api";
import type { StageHostGroup } from "../utils/stageHosts";

export interface PartyEffectActions {
  canTrigger: boolean;
  trigger: (type: PartyEffectType, x: number, y: number, guest?: GuestContext) => void;
  triggerAtPointer: (
    type: PartyEffectType,
    clientX: number,
    clientY: number,
    guest?: GuestContext,
  ) => void;
  triggerProfileReaction: (
    type: ProfilePartyEffectType,
    clientX: number,
    clientY: number,
    target: StageHostGroup,
    guest?: GuestContext,
  ) => void;
  ingestEffects: (effects: PartyEffect[]) => void;
}

const PartyEffectsContext = createContext<PartyEffectActions | null>(null);

export function PartyEffectsActionsProvider({
  value,
  children,
}: {
  value: PartyEffectActions;
  children: ReactNode;
}) {
  return <PartyEffectsContext.Provider value={value}>{children}</PartyEffectsContext.Provider>;
}

export function usePartyEffectActions(): PartyEffectActions | null {
  return useContext(PartyEffectsContext);
}
