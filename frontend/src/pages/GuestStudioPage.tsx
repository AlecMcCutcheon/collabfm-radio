import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/client";
import { AppNavLink } from "../context/AppNavigationContext";
import { GuestAvatarPickerModal } from "../components/GuestAvatarPickerModal";
import { GuestCoverIconPickerModal } from "../components/GuestCoverIconPickerModal";
import { PartyEffectFavoritesPanel } from "../components/PartyEffectFavoritesPanel";
import {
  adminFormControlClass,
  adminPrimaryBtnClass,
} from "../components/admin/adminUi";
import type { GuestContext } from "../types/api";
import { guestAvatarSrc } from "../utils/avatar";
import {
  getGuestIdentity,
  hasCustomGuestNickname,
  isGuestIdLinked,
  linkGuestId,
  parseGuestIdInput,
  proceduralNameForCurrentGuest,
  resetGuestAvatarVariant,
  resetGuestCoverIcon,
  resetGuestIdToOriginal,
  resetGuestNickname,
  setGuestAvatarVariant,
  setGuestCoverIcon,
  setGuestNickname,
} from "../utils/guestIdentity";
import { partyFavoritesScopeForGuest } from "../utils/partyEffectFavorites";

interface GuestStudioPageProps {
  shareToken: string;
  guest: GuestContext;
  guestBroadcaster: boolean;
  embedded?: boolean;
  onGuestChange: (guest: GuestContext) => void;
}

interface LinkInfo {
  label: string | null;
  guestMode: "listener" | "guest_broadcaster";
  expiresAt: number | null;
}

function formatExpiryCountdown(expiresAt: number | null): string {
  if (expiresAt == null) return "Never expires";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Expired";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `Expires in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 48) {
    return minutes > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `Expires in ${days}d ${remHours}h` : `Expires in ${days}d`;
}

function guestTypeLabel(mode: LinkInfo["guestMode"]) {
  return mode === "guest_broadcaster" ? "Guest broadcaster" : "Guest listener";
}

export function GuestStudioPage({
  shareToken,
  guest,
  guestBroadcaster,
  embedded = false,
  onGuestChange,
}: GuestStudioPageProps) {
  const [displayName, setDisplayName] = useState(guest.guestName);
  const [avatarVariant, setAvatarVariant] = useState(guest.avatarVariant ?? 0);
  const [coverIcon, setCoverIcon] = useState(guest.coverIcon ?? 0);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [linkIdDraft, setLinkIdDraft] = useState("");
  const [now, setNow] = useState(Date.now());

  const radioPath = `/listen/${encodeURIComponent(shareToken)}`;
  const proceduralName = useMemo(
    () => proceduralNameForCurrentGuest(shareToken),
    [shareToken, guest.guestId],
  );
  const nicknameIsCustom = hasCustomGuestNickname(shareToken);
  const idIsLinked = guestBroadcaster && isGuestIdLinked(shareToken);

  useEffect(() => {
    setDisplayName(guest.guestName);
    setAvatarVariant(guest.avatarVariant ?? 0);
    setCoverIcon(guest.coverIcon ?? 0);
  }, [guest.guestId, guest.guestName, guest.avatarVariant, guest.coverIcon]);

  useEffect(() => {
    void api
      .listenInfo(shareToken)
      .then((info) => {
        setLinkInfo({
          label: info.label,
          guestMode: info.guestMode === "guest_broadcaster" ? "guest_broadcaster" : "listener",
          expiresAt: info.expiresAt ?? null,
        });
      })
      .catch(() => setLinkInfo(null));
  }, [shareToken]);

  useEffect(() => {
    if (linkInfo?.expiresAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [linkInfo?.expiresAt]);

  const pushGuest = (identity: ReturnType<typeof getGuestIdentity>, guestSession?: string) => {
    const next: GuestContext = {
      ...identity,
      shareToken,
      guestSession:
        guestSession ??
        (identity.guestId === guest.guestId ? guest.guestSession : ""),
    };
    onGuestChange(next);
    setDisplayName(next.guestName);
    setAvatarVariant(next.avatarVariant);
    setCoverIcon(next.coverIcon);
  };

  const syncGuestProfileToServer = async (
    identity: ReturnType<typeof getGuestIdentity>,
  ): Promise<boolean> => {
    let guestSession = "";
    try {
      const info = await api.listenInfo(shareToken, identity.guestId);
      guestSession = info.guestSession || "";
    } catch {
      setError("Could not save profile to the server. Try again in a moment.");
      return false;
    }
    if (!guestSession) {
      setError("Could not save profile to the server. Try again in a moment.");
      return false;
    }

    try {
      await api.updateGuestProfile({
        ...identity,
        shareToken,
        guestSession,
      });
      pushGuest(identity, guestSession);
      window.dispatchEvent(new Event("radio-profile-updated"));
      return true;
    } catch {
      setError("Could not save profile to the server. Try again in a moment.");
      return false;
    }
  };

  const saveProfile = () => {
    setError(null);
    setMessage(null);
    let identity = getGuestIdentity(shareToken);
    if (guestBroadcaster && linkIdDraft.trim()) {
      const linked = linkGuestId(linkIdDraft, shareToken);
      if (!linked) {
        setError("That does not look like a valid guest ID.");
        return;
      }
      identity = linked;
    } else if (guestBroadcaster && parseGuestIdInput(displayName)) {
      const linked = linkGuestId(displayName, shareToken);
      if (linked) identity = linked;
    } else {
      identity = setGuestNickname(displayName, shareToken);
    }
    pushGuest(identity);
    setLinkIdDraft("");
    void syncGuestProfileToServer(identity).then((ok) => {
      if (ok) setMessage("Profile saved.");
    });
  };

  const handleResetNickname = () => {
    setError(null);
    setMessage(null);
    const identity = resetGuestNickname(shareToken);
    pushGuest(identity);
    setMessage(`Nickname reset to ${identity.guestName}.`);
    window.dispatchEvent(new Event("radio-profile-updated"));
    void syncGuestProfileToServer(identity);
  };

  const copyGuestId = () => {
    void navigator.clipboard.writeText(guest.guestId).catch(() => {});
    setMessage("Guest ID copied.");
  };

  const handleResetGuestId = () => {
    setError(null);
    setMessage(null);
    const identity = resetGuestIdToOriginal(shareToken);
    pushGuest(identity);
    setLinkIdDraft("");
    setMessage("Guest ID restored to this link's original.");
    void syncGuestProfileToServer(identity);
  };

  const handleAvatarSelect = (variant: number) => {
    const v = setGuestAvatarVariant(variant, shareToken);
    setAvatarVariant(v);
    const identity = getGuestIdentity(shareToken);
    pushGuest(identity);
    window.dispatchEvent(new Event("radio-profile-updated"));
    void syncGuestProfileToServer(identity);
    setMessage("Avatar updated.");
  };

  const handleAvatarReset = () => {
    resetGuestAvatarVariant(shareToken);
    setAvatarVariant(0);
    const identity = getGuestIdentity(shareToken);
    pushGuest(identity);
    window.dispatchEvent(new Event("radio-profile-updated"));
    void syncGuestProfileToServer(identity);
    setMessage("Avatar reset to default.");
  };

  const handleIconSelect = (iconId: number) => {
    const id = setGuestCoverIcon(iconId, shareToken);
    setCoverIcon(id);
    const identity = getGuestIdentity(shareToken);
    pushGuest(identity);
    window.dispatchEvent(new Event("radio-profile-updated"));
    void syncGuestProfileToServer(identity);
    setMessage(id === 0 ? "Cover icon removed." : "Cover icon updated.");
  };

  const handleIconReset = () => {
    resetGuestCoverIcon(shareToken);
    setCoverIcon(0);
    const identity = getGuestIdentity(shareToken);
    pushGuest(identity);
    window.dispatchEvent(new Event("radio-profile-updated"));
    void syncGuestProfileToServer(identity);
    setMessage("Cover icon reset to none.");
  };

  const expiryLabel = linkInfo
    ? formatExpiryCountdown(linkInfo.expiresAt)
    : "Loading…";

  return (
    <div
      className={
        embedded
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 min-h-full"
          : "min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100"
      }
    >
      <div className={embedded ? "px-4 py-4" : "max-w-3xl mx-auto px-4 py-8"}>
        {embedded ? (
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Studio</h1>
            <p className="text-sm text-gray-400">Profile and guest identity</p>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-8">
            <AppNavLink
              to={radioPath}
              title="Back to radio"
              className="inline-flex items-center justify-center rounded-full p-3.5 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-gray-300 shadow-lg hover:scale-105 hover:text-radio-accent hover:border-gray-600 transition-all duration-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </AppNavLink>
            <div>
              <h1 className="text-2xl font-bold text-white">Guest Studio</h1>
              <p className="text-sm text-gray-400">Profile and guest identity</p>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Your profile</h2>
          <p className="text-sm text-gray-400 mb-5">
            Your nickname, avatar style, and cover icon appear on stage and in chat. Each share link
            has its own guest identity — opening a different link starts fresh.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3">
              <div className="relative rounded-2xl border-2 border-gray-600 shadow-lg overflow-hidden w-32 h-32">
                <img
                  src={guestAvatarSrc(guest.guestId, avatarVariant, 128, coverIcon)}
                  alt="Your profile"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="text-sm text-radio-accent hover:underline"
                >
                  Choose avatar
                </button>
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(true)}
                  className="text-sm text-gray-300 hover:text-white hover:underline"
                >
                  {coverIcon === 0 ? "Choose icon" : "Change icon"}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full min-w-0 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                  On-air nickname
                </label>
                <input
                  className={adminFormControlClass}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.replace(/\s+/g, ""))}
                  placeholder="How you want to appear on stage"
                  maxLength={32}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-generated for this link:{" "}
                  <span className="text-gray-400 font-medium">{proceduralName}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveProfile} className={adminPrimaryBtnClass}>
                  Save profile
                </button>
                {(nicknameIsCustom || displayName !== proceduralName) && (
                  <button
                    type="button"
                    onClick={handleResetNickname}
                    className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    Reset nickname
                  </button>
                )}
              </div>
              {message && <p className="text-sm text-green-400">{message}</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Your guest ID</h2>
          <p className="text-sm text-gray-400 mb-4">
            This ID is tied to <span className="text-gray-300">this share link only</span>. It keeps
            you recognizable in chat and on stage here. A different link gets a different ID, even
            in the same browser.
            {guestBroadcaster
              ? " Copy it into the browser extension before connecting, or paste your extension ID below."
              : null}
          </p>

          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
            Guest ID for this link
          </label>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              className={`${adminFormControlClass} font-mono text-xs min-w-0 flex-1`}
              value={guest.guestId}
              readOnly
            />
            <button
              type="button"
              onClick={copyGuestId}
              className="shrink-0 w-full sm:w-auto px-4 py-2.5 rounded-lg border border-gray-600 text-sm text-gray-200 hover:bg-gray-800"
            >
              Copy
            </button>
          </div>

          {guestBroadcaster && (
            <>
              {idIsLinked && (
                <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
                  Linked to an extension ID. Original ID for this link:{" "}
                  <span className="font-mono">{guest.originalGuestId}</span>
                </div>
              )}

              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                Link extension ID
              </label>
              <input
                className={`${adminFormControlClass} font-mono text-xs mb-3`}
                value={linkIdDraft}
                onChange={(e) => setLinkIdDraft(e.target.value.trim())}
                placeholder="Paste guest ID from extension (optional — save profile to apply)"
              />

              <div className="flex flex-wrap gap-2">
                {idIsLinked && (
                  <button
                    type="button"
                    onClick={handleResetGuestId}
                    className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    Reset ID
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {partyFavoritesScopeForGuest(shareToken, guest.guestId) && (
          <PartyEffectFavoritesPanel
            scope={partyFavoritesScopeForGuest(shareToken, guest.guestId)!}
          />
        )}

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">About this link</h2>
          <p className="text-sm text-gray-400 mb-4">
            You are listening through a private share link from the station host.
          </p>
          <dl className="grid gap-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-gray-500">Type</dt>
              <dd className="text-white font-medium">
                {linkInfo ? guestTypeLabel(linkInfo.guestMode) : "—"}
              </dd>
            </div>
            {linkInfo?.label && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Label</dt>
                <dd className="text-white">{linkInfo.label}</dd>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-gray-500">Access</dt>
              <dd
                className={
                  expiryLabel === "Expired"
                    ? "text-red-400 font-medium"
                    : linkInfo?.expiresAt == null
                      ? "text-green-400"
                      : "text-amber-300"
                }
              >
                {expiryLabel}
                {linkInfo?.expiresAt != null && linkInfo.expiresAt > now && (
                  <span className="block text-xs text-gray-500 font-normal mt-0.5">
                    {new Date(linkInfo.expiresAt).toLocaleString()}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <GuestAvatarPickerModal
        open={avatarPickerOpen}
        guestId={guest.guestId}
        avatarVariant={avatarVariant}
        coverIcon={coverIcon}
        onSelect={handleAvatarSelect}
        onReset={handleAvatarReset}
        onClose={() => setAvatarPickerOpen(false)}
      />

      <GuestCoverIconPickerModal
        open={iconPickerOpen}
        guestId={guest.guestId}
        avatarVariant={avatarVariant}
        selectedIcon={coverIcon}
        onSelect={handleIconSelect}
        onReset={handleIconReset}
        onClose={() => setIconPickerOpen(false)}
      />
    </div>
  );
}
