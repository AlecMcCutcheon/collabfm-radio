import { createContext, useContext, type ReactNode } from "react";
import { useRadioPlayer } from "../hooks/useRadioPlayer";

type RadioPlayerValue = ReturnType<typeof useRadioPlayer>;

const RadioPlayerContext = createContext<RadioPlayerValue | null>(null);

export function RadioPlayerProvider({
  children,
  shareToken,
}: {
  children: ReactNode;
  shareToken?: string;
}) {
  const player = useRadioPlayer(shareToken ? { shareToken } : undefined);
  return <RadioPlayerContext.Provider value={player}>{children}</RadioPlayerContext.Provider>;
}

export function useRadioPlayerContext(): RadioPlayerValue {
  const ctx = useContext(RadioPlayerContext);
  if (!ctx) {
    throw new Error("useRadioPlayerContext must be used within RadioPlayerProvider");
  }
  return ctx;
}
