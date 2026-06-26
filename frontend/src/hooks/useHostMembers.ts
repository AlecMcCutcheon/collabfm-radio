import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { HostMember } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

const FALLBACK_POLL_MS = 60_000;

export function useHostMembers(enabled = true, shareToken?: string) {
  const [hosts, setHosts] = useState<HostMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await api.hostMembers(shareToken);
      setHosts(res.hosts);
      setNeedsAuth(false);
    } catch (err) {
      setHosts([]);
      const message = err instanceof Error ? err.message : "";
      setNeedsAuth(message.includes("401"));
    } finally {
      setLoading(false);
    }
  }, [enabled, shareToken]);

  useEffect(() => {
    if (!enabled) {
      setHosts([]);
      setLoading(false);
      setNeedsAuth(false);
      return;
    }

    setLoading(true);
    void load();
    const pollId = window.setInterval(() => void load(), FALLBACK_POLL_MS);
    const unsubscribeProfile = subscribeLiveEvent("profile_changed", () => void load(), {
      shareToken,
    });
    const onProfileUpdated = () => void load();
    window.addEventListener("radio-profile-updated", onProfileUpdated);
    return () => {
      window.clearInterval(pollId);
      unsubscribeProfile();
      window.removeEventListener("radio-profile-updated", onProfileUpdated);
    };
  }, [enabled, load, shareToken]);

  return { hosts, loading, needsAuth };
}
