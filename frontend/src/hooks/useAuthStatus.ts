import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuthStatus } from "../types/api";
import { subscribeLiveEvent } from "../utils/liveEvents";

export function useAuthStatus(pollMs = 0) {
  const [status, setStatus] = useState<AuthStatus>({ authenticated: false });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setStatus(await api.authStatus());
    } catch {
      setStatus({ authenticated: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);

  useEffect(() => {
    const onProfileUpdated = () => void refresh();
    window.addEventListener("radio-profile-updated", onProfileUpdated);
    return () => {
      window.removeEventListener("radio-profile-updated", onProfileUpdated);
    };
  }, []);

  useEffect(() => {
    if (!status.authenticated) return;
    return subscribeLiveEvent("profile_changed", () => void refresh());
  }, [status.authenticated]);

  return { status, loading, refresh };
}
