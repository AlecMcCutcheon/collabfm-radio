import { useEffect, useState } from "react";
import { api } from "../api/client";
import { apiUrl } from "../config";
import { RadioPlayerProvider } from "../context/RadioPlayerContext";
import { GuestApp } from "../components/GuestApp";
import { ShareLinkErrorPage } from "../components/ShareLinkErrorPage";

export function ListenPage() {
  const rawSegment =
    window.location.pathname.replace(/^\/listen\/?/, "").split("/")[0] || "";
  const token = rawSegment ? decodeURIComponent(rawSegment) : "";
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing listen token");
      return;
    }
    void api
      .listenInfo(token)
      .then((info) => {
        if (info.linkKind === "stream") {
          setError("This link is for direct stream access (OBS/VLC). Use a guest view link instead.");
          return;
        }
        setReady(true);
      })
      .catch(async (err) => {
        if (err instanceof Error && err.message.includes("Invalid or expired")) {
          setError("Invalid or expired link");
          return;
        }
        try {
          const res = await fetch(apiUrl(`/api/listen/${encodeURIComponent(token)}`));
          if (res.status === 404) {
            setError("Invalid or expired link");
            return;
          }
        } catch {
          // fall through
        }
        setError("Could not verify this link. The station may be restarting — try again in a moment.");
      });
  }, [token]);

  if (error) {
    return <ShareLinkErrorPage message={error} />;
  }

  if (!ready || !token) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <RadioPlayerProvider shareToken={token}>
      <GuestApp shareToken={token} />
    </RadioPlayerProvider>
  );
}
