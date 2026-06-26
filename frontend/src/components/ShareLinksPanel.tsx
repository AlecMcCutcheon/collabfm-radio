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

const LISTENER_TTL_FALLBACK = ["never", "24h", "72h", "7d", "30d", "1y"];
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

interface ShareLinksPanelProps {
  onFlash?: (msg: string) => void;
}

export function ShareLinksPanel({ onFlash }: ShareLinksPanelProps) {
  const { status } = useAuthStatus();
  const canCreateGuestBroadcaster =
    status.roleInfo?.roleType === "admin" || status.roleInfo?.roleType === "broadcaster";
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [listenerTtlOptions, setListenerTtlOptions] = useState<string[]>(LISTENER_TTL_FALLBACK);
  const [guestBroadcasterTtlOptions, setGuestBroadcasterTtlOptions] = useState<string[]>(
    GUEST_BROADCASTER_TTL_FALLBACK,
  );
  const [maxLinks, setMaxLinks] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({
    label: "",
    guestMode: "listener" as "listener" | "guest_broadcaster",
    ttl: "never",
  });

  const flash = (msg: string) => onFlash?.(msg);

  const ttlOptions =
    newLink.guestMode === "guest_broadcaster" ? guestBroadcasterTtlOptions : listenerTtlOptions;

  const reload = useCallback(async () => {
    try {
      const res = await api.userShareLinks();
      setLinks(res.links);
      setListenerTtlOptions(res.listenerTtlOptions ?? res.ttlOptions ?? LISTENER_TTL_FALLBACK);
      setGuestBroadcasterTtlOptions(
        res.guestBroadcasterTtlOptions ?? GUEST_BROADCASTER_TTL_FALLBACK,
      );
      setMaxLinks(res.maxLinks);
      setError(null);
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
        ttl: "never",
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
                const nextTtl =
                  guestMode === "guest_broadcaster"
                    ? guestBroadcasterTtlOptions[0] ?? "24h"
                    : "never";
                setNewLink({ ...newLink, guestMode, ttl: nextTtl });
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
