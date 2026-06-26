import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

type JoinState = "checking" | "in-guild" | "not-in-guild" | "error";

declare global {
  interface Window {
    __JOIN_NAME__?: string;
  }
}

const DISCORD_INVITE = "https://discord.gg/6cWb933Eku";

export function JoinRequiredPage() {
  const [state, setState] = useState<JoinState>("checking");
  const [auth, setAuth] = useState<Awaited<ReturnType<typeof api.authStatus>> | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [working, setWorking] = useState(false);

  const greetingName = useMemo(
    () => window.__JOIN_NAME__ || auth?.user?.username || "there",
    [auth],
  );

  const refresh = async () => {
    try {
      const status = await api.authStatus();
      setAuth(status);
      if (status.authenticated && (status.isHost || status.canBroadcast)) {
        setState("in-guild");
      } else if (status.authenticated) {
        setState("not-in-guild");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    void refresh();
    void api.joinDebugStatus().then((r) => setDebugEnabled(!!r.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
      if (state === "in-guild") {
        window.location.href = "/";
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [state]);

  const returnToApp = async () => {
    try {
      setWorking(true);
      await api.setJoinDebug(false);
      window.location.href = "/";
    } catch {
      setWorking(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#0b1220,#1f2937)",
      }}
    >
      <div
        style={{
          width: "min(680px, 92vw)",
          background: "#111827",
          border: "1px solid #374151",
          borderRadius: 12,
          padding: 24,
          color: "#e5e7eb",
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Join Required</h1>
        <p style={{ marginTop: 10 }}>
          Hi {greetingName}, you are authenticated with Discord, but you must join our server to access the site.
        </p>
        <p style={{ marginTop: 10 }}>
          Join using this invite, then return here. This page will auto-refresh every 5 seconds.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => window.open(DISCORD_INVITE, "_blank", "noopener")} style={btn("#5865F2")}>
            Join Discord Server
          </button>
          {debugEnabled ? (
            <button type="button" disabled={working} onClick={() => void returnToApp()} style={btn("#374151")}>
              {working ? "Working…" : "Return to App"}
            </button>
          ) : (
            <button type="button" onClick={() => void refresh()} style={btn("#374151")}>
              Refresh
            </button>
          )}
        </div>
        <small style={{ display: "block", marginTop: 10, color: "#9ca3af" }}>
          If you aren’t logged in, click “Login” to continue.
        </small>
        <div style={{ marginTop: 14 }}>
          <a href="/" style={ghostBtn()}>
            Login
          </a>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: 0,
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 8,
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    background: "transparent",
    color: "#9ca3af",
    border: "1px solid #374151",
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: 8,
  };
}
