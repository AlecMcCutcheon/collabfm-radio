import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { PresenceRoster } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

const FALLBACK_POLL_MS = 60_000;

const EMPTY_ROSTER: PresenceRoster = {
  stage: [],
  listening: [],
  online: [],
  botConnections: [],
  listeningCount: 0,
  onlineCount: 0,
  totalCount: 0,
  stageCount: 0,
  botConnectionCount: 0,
};

export function usePresenceRoster(active: boolean, shareToken?: string) {
  const [roster, setRoster] = useState<PresenceRoster>(EMPTY_ROSTER);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const refresh = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const data = await api.presenceRoster(shareToken);
      setRoster(data);
      setFetched(true);
    } catch {
      setRoster(EMPTY_ROSTER);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [active, shareToken]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const unsubscribe = subscribeLiveEvent(
      "presence_roster",
      (event) => {
        try {
          const data = JSON.parse(event.data) as { roster?: PresenceRoster };
          if (!data.roster) return;
          setRoster(data.roster);
          setFetched(true);
        } catch {
          /* Keep the fallback poll for malformed stream messages. */
        }
      },
      { shareToken },
    );
    const unsubscribeProfile = subscribeLiveEvent("profile_changed", () => void refresh(), {
      shareToken,
    });
    const id = window.setInterval(() => void refresh(), FALLBACK_POLL_MS);
    return () => {
      unsubscribe();
      unsubscribeProfile();
      window.clearInterval(id);
    };
  }, [active, refresh, shareToken]);

  return { roster, loading, fetched, refresh };
}
