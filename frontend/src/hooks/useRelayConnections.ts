import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { RelayConnectionsResponse } from "../types/api";

export function useRelayConnections(enabled: boolean, shareToken?: string) {
  const [data, setData] = useState<RelayConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setNeedsAuth(false);
      return;
    }

    const load = async () => {
      try {
        const response = await api.relayConnections(shareToken);
        setData(response);
        setNeedsAuth(false);
      } catch (err) {
        setData(null);
        const message = err instanceof Error ? err.message : "";
        setNeedsAuth(message.includes("401"));
      } finally {
        setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [enabled, shareToken]);

  return { data, loading, needsAuth };
}
