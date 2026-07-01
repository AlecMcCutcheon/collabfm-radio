import { useCallback, useEffect, useState } from "react";
import { useAuthStatus } from "../hooks/useAuthStatus";
import {
  AdminInput,
  AdminSelect,
  adminPrimaryBtnClass,
} from "./admin/adminUi";
import { api } from "../api/client";
import type { ShareLink } from "../types/api";
import { absolutePublicUrl } from "../utils/publicUrl";

const TTL_LABELS: Record<string, string> = {
  never: "Never",
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "72h": "3 days",
  "7d": "7 days",
  "30d": "30 days",
  "1y": "1 year",
};

const LISTENER_LINK_TTL_FALLBACK = ["24h", "72h", "7d"];
const GUEST_BROADCASTER_TTL_FALLBACK = ["1h", "6h", "24h"];

function formatExpiry(link: ShareLink) {
  if (link.revoked) return "Revoked";
  if (link.expired) return "Expired";
  if (link.expires_at == null) return "Never";
  return new Date(link.expires_at).toLocaleString();
}

function guestModeLabel(mode: ShareLink["guest_mode"]) {
  return mode === "guest_broadcaster" ? "Guest broadcaster" : "Guest listener";
}

function defaultTtlForOptions(options: string[]) {
  if (options.includes("never")) return "never";
  if (options.includes("72h")) return "72h";
  return options[0] ?? "24h";
}

interface ShareLinksPanelProps {
  onFlash?: (msg: string) => void;
}

export function ShareLinksPanel({ onFlash }: ShareLinksPanelProps) {
  const { status } = useAuthStatus();
  const canCreateGuestBroadcaster =
    status.roleInfo?.permissions?.canCreateShareLinks !== false &&
    (status.roleInfo?.roleType === "admin" || status.roleInfo?.roleType === "broadcaster");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [listenerTtlOptions, setListenerTtlOptions] = useState<string[]>(LISTENER_LINK_TTL_FALLBACK);
  const [guestBroadcasterTtlOptions, setGuestBroadcasterTtlOptions] = useState<string[]>(
    GUEST_BROADCASTER_TTL_FALLBACK,
  );
  const [maxLinks, setMaxLinks] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({
    label: "",
    guestMode: "listener" as "listener" | "guest_broadcaster",
    ttl: defaultTtlForOptions(LISTENER_LINK_TTL_FALLBACK),
  });

  const flash = (msg: string) => onFlash?.(msg);

  const ttlOptions =
    newLink.guestMode === "guest_broadcaster" ? guestBroadcasterTtlOptions : listenerTtlOptions;

  const reload = useCallback(async () => {
    try {
      const res = await api.userShareLinks();
      const listenerOpts = res.listenerTtlOptions ?? LISTENER_LINK_TTL_FALLBACK;
      const guestBroadcasterOpts =
        res.guestBroadcasterTtlOptions ?? GUEST_BROADCASTER_TTL_FALLBACK;
      setLinks(res.links);
      setListenerTtlOptions(listenerOpts);
      setGuestBroadcasterTtlOptions(guestBroadcasterOpts);
      setMaxLinks(res.maxLinks);
      setError(null);
      setNewLink((prev) => {
        const opts =
          prev.guestMode === "guest_broadcaster" ? guestBroadcasterOpts : listenerOpts;
        const ttl = opts.includes(prev.ttl) ? prev.ttl : defaultTtlForOptions(opts);
        const guestMode =
          prev.guestMode === "guest_broadcaster" && res.canCreateGuestBroadcaster === false
            ? "listener"
            : prev.guestMode;
        const nextOpts = guestMode === "guest_broadcaster" ? guestBroadcasterOpts : listenerOpts;
        return {
          ...prev,
          guestMode,
          ttl: nextOpts.includes(ttl) ? ttl : defaultTtlForOptions(nextOpts),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load share links");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.createUserShareLink({
        label: newLink.label.trim() || undefined,
        guestMode: newLink.guestMode,
        ttl: newLink.ttl,
      });
      await reload();
      if (result.link.uiUrl) {
        await navigator.clipboard.writeText(absolutePublicUrl(result.link.uiUrl));
        flash?.("Link created and copied");
      }
      setNewLink({
        label: "",
        guestMode: "listener",
        ttl: defaultTtlForOptions(listenerTtlOptions),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      await api.revokeUserShareLink(id);
      await reload();
      flash?.("Link revoked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
      <h2 className="text-lg font-semibold text-white mb-1">Share links</h2>
      <p className="text-sm text-gray-400 mb-5">
        Each link includes the guest web player and a direct stream URL. Up to {maxLinks} active links
        — expired links are removed automatically.
        {!canCreateGuestBroadcaster && (
          <span className="block mt-1 text-gray-500">
            Listener accounts can create guest-listener links only (shorter expiry options).
          </span>
        )}
      </p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="space-y-3 mb-6">
        <label className="block text-xs uppercase tracking-wide text-gray-500">Label (optional)</label>
        <AdminInput
          className="mt-0"
          value={newLink.label}
          onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
          placeholder="e.g. Discord crew"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1.5">
              Guest type
            </label>
            <AdminSelect
              className="mt-0"
              value={newLink.guestMode}
              onChange={(e) => {
                const guestMode = e.target.value as "listener" | "guest_broadcaster";
                const opts =
                  guestMode === "guest_broadcaster"
                    ? guestBroadcasterTtlOptions
                    : listenerTtlOptions;
                setNewLink({
                  ...newLink,
                  guestMode,
                  ttl: defaultTtlForOptions(opts),
                });
              }}
            >
              <option value="listener">Guest listener</option>
              {canCreateGuestBroadcaster && (
                <option value="guest_broadcaster">Guest broadcaster</option>
              )}
            </AdminSelect>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1.5">
              Expires after
            </label>
            <AdminSelect
              className="mt-0"
              value={newLink.ttl}
              onChange={(e) => setNewLink({ ...newLink, ttl: e.target.value })}
            >
              {ttlOptions.map((key) => (
                <option key={key} value={key}>
                  {TTL_LABELS[key] || key}
                </option>
              ))}
            </AdminSelect>
          </div>
        </div>
        <button
          type="button"
          disabled={loading || links.length >= maxLinks}
          onClick={() => void createLink()}
          className={`${adminPrimaryBtnClass} w-full disabled:opacity-50`}
        >
          Create & copy link
        </button>
        {links.length >= maxLinks && (
          <p className="text-xs text-amber-400">Revoke an existing link before creating another.</p>
        )}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-500">No active share links yet.</p>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.id} className="rounded-xl border border-gray-700/70 bg-gray-900/40 p-4 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{link.label || `Link #${link.id}`}</span>
                  <span className="text-[10px] uppercase tracking-wide rounded-full border border-gray-600 px-2 py-0.5 text-gray-400">
                    {guestModeLabel(link.guest_mode)}
                  </span>
                </div>
                <span className="text-gray-500 text-xs">{formatExpiry(link)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs rounded-lg border border-gray-600 px-3 py-1.5 text-gray-200 hover:bg-gray-800"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(absolutePublicUrl(link.uiUrl))
                      .then(() => flash?.("Guest link copied"))
                  }
                >
                  Copy guest link
                </button>
                <button
                  type="button"
                  className="text-xs rounded-lg border border-gray-600 px-3 py-1.5 text-gray-200 hover:bg-gray-800"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(absolutePublicUrl(link.streamUrl))
                      .then(() => flash?.("Stream link copied"))
                  }
                >
                  Copy stream link
                </button>
                <button
                  type="button"
                  className="text-xs rounded-lg border border-red-800 px-3 py-1.5 text-red-400 hover:bg-red-950/40"
                  onClick={() => void revoke(link.id)}
                  disabled={loading}
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
