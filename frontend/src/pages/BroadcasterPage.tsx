import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { AdminBackButton, LogoutButton } from "../components/admin/AdminNavButton";
import { adminPrimaryBtnClass, adminFormControlClass, adminInlineRowClass, adminControlHeight } from "../components/admin/adminUi";
import type { BroadcastDevice, BroadcasterProfile } from "../types/api";
import { avatarSrc, hostAvatarSrc } from "../utils/avatar";
import { sanitizeNickname } from "../utils/guestIdentity";
import { ShareLinksPanel } from "../components/ShareLinksPanel";
import { PartyEffectFavoritesPanel } from "../components/PartyEffectFavoritesPanel";
import { ProfileGenrePicker } from "../components/ProfileGenrePicker";
import { LevelProgressBar } from "../components/LevelProgressBar";
import { partyFavoritesScopeForUser } from "../utils/partyEffectFavorites";
import { MAX_PROFILE_STATUS_LENGTH, normalizeProfileGenres, type MusicGenre } from "../config/musicGenres";

function profileAvatarUrl(profile: BroadcasterProfile | null): string {
  if (!profile) return avatarSrc("broadcaster", 128);
  return hostAvatarSrc(
    {
      userId: profile.userId,
      displayName: profile.displayName,
      avatar: profile.avatarUrl,
    },
    128,
  );
}

export function BroadcasterPage({ embedded = false }: { embedded?: boolean }) {
  const { status, refresh: refreshAuth } = useAuthStatus();
  const [profile, setProfile] = useState<BroadcasterProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState<MusicGenre[]>([]);
  const [userCode, setUserCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Browser extension");
  const [devices, setDevices] = useState<BroadcastDevice[]>([]);
  const [showPairForm, setShowPairForm] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [pairMessage, setPairMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    const res = await api.broadcasterProfile();
    setProfile(res.profile);
    setDisplayName(res.profile.displayName || res.profile.username);
    setBio(res.profile.bio ?? "");
    setGenres(normalizeProfileGenres(res.profile.genres));
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const res = await api.extensionDevices();
      setDevices(res.devices);
      if (res.devices.length > 0) {
        setShowPairForm(false);
      }
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadDevices();
  }, [loadProfile, loadDevices]);

  const saveProfile = async () => {
    setLoading(true);
    setError(null);
    setProfileMessage(null);
    try {
      const res = await api.updateBroadcasterProfile({
        displayName: sanitizeNickname(displayName, 64),
        bio: bio.trim() || null,
        genres,
      });
      setProfile(res.profile);
      setBio(res.profile.bio ?? "");
      setGenres(normalizeProfileGenres(res.profile.genres));
      setProfileMessage("Profile saved.");
      window.dispatchEvent(new Event("radio-profile-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onAvatarPick = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setProfileMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const res = await api.uploadBroadcasterAvatar({
        data: btoa(binary),
        mimeType: file.type || "image/png",
      });
      setProfile(res.profile);
      if (!res.profile.avatarUrl) {
        setError("Upload did not save a profile image URL. Try again or use PNG/JPEG/WebP.");
        return;
      }
      setProfileMessage("Profile image updated.");
      void refreshAuth();
      window.dispatchEvent(new Event("radio-profile-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmPair = async () => {
    setLoading(true);
    setError(null);
    setPairMessage(null);
    try {
      await api.confirmExtensionPair({ userCode, label: deviceLabel });
      setPairMessage("Extension paired. It should update within a few seconds — reopen the popup if needed.");
      setUserCode("");
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      await api.revokeExtensionDevice(id);
      await loadDevices();
      if (editingDeviceId === id) {
        setEditingDeviceId(null);
        setEditingLabel("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setLoading(false);
    }
  };

  const saveDeviceLabel = async (id: number) => {
    const label = editingLabel.trim();
    if (!label) return;
    setLoading(true);
    setError(null);
    try {
      await api.updateExtensionDevice(id, { label });
      setEditingDeviceId(null);
      setEditingLabel("");
      await loadDevices();
      setPairMessage("Device name updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setLoading(false);
    }
  };

  const startRenameDevice = (device: BroadcastDevice) => {
    setEditingDeviceId(device.id);
    setEditingLabel(device.label || "Browser extension");
  };

  if (!status.authenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        Sign in to open the broadcaster studio.
      </div>
    );
  }

  if (!status.canBroadcast && !status.isHost) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400 px-6 text-center">
        Broadcaster access is required for this page.
      </div>
    );
  }

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
            <p className="text-sm text-gray-400">Profile, share links, and extension pairing</p>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-8">
            <AdminBackButton />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Broadcaster Studio</h1>
              <p className="text-sm text-gray-400">On-air identity, profile image, and extension pairing</p>
            </div>
            <LogoutButton />
          </div>
        )}

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Your profile</h2>
          <p className="text-sm text-gray-400 mb-5">
            Your nickname and profile image appear on stage and in chat. This does not change the station visualizer logo — that is set by admins only.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3">
              <img
                key={profile?.avatarUrl ?? profile?.userId ?? "default"}
                src={profileAvatarUrl(profile)}
                alt="Your profile"
                className="w-32 h-32 rounded-2xl object-cover border-2 border-gray-600 shadow-lg"
              />
              <p className="text-xs text-gray-500 text-center max-w-[8rem]">
                {profile?.avatarUrl
                  ? "Custom profile image"
                  : "Generated avatar — upload a photo to replace"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-radio-accent hover:underline disabled:opacity-50"
              >
                Upload profile image
              </button>
            </div>

            <div className="flex-1 w-full space-y-3">
              <label className="block text-xs uppercase tracking-wide text-gray-500">On-air nickname</label>
              <input
                className={`${adminFormControlClass} flex-1`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.replace(/\s+/g, ""))}
                placeholder="How you want to appear on stage"
                maxLength={64}
              />
              <p className="text-xs text-gray-500">No spaces. Account username: {profile?.username ?? status.user?.username}</p>

              <div className="pt-2">
                <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Status
                </label>
                <input
                  className={adminFormControlClass}
                  value={bio}
                  onChange={(event) =>
                    setBio(event.target.value.replace(/\s+/g, " ").slice(0, MAX_PROFILE_STATUS_LENGTH))
                  }
                  placeholder="Short on-air status — vibes, mood, queue…"
                  maxLength={MAX_PROFILE_STATUS_LENGTH}
                />
                <p className="text-xs text-gray-500 mt-1 text-right">
                  {bio.length}/{MAX_PROFILE_STATUS_LENGTH}
                </p>
              </div>

              <ProfileGenrePicker selected={genres} onChange={setGenres} disabled={loading} />

              <button
                type="button"
                disabled={loading}
                onClick={() => void saveProfile()}
                className={`${adminPrimaryBtnClass} disabled:opacity-50`}
              >
                Save profile
              </button>
              {profileMessage && <p className="text-sm text-green-400">{profileMessage}</p>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">DJ level</h2>
          {profile?.level ? (
            <LevelProgressBar level={profile.level} showTotalXp />
          ) : (
            <p className="text-sm text-gray-500 mb-3">Level info loads with your profile.</p>
          )}
          <p className="text-sm text-gray-400 mb-3 mt-4">
            XP is awarded server-side only. Guests cannot level up, but their hearts and approvals can
            help registered DJs when allowed by admin settings.
          </p>
          <ul className="text-sm text-gray-300 space-y-1.5 list-disc pl-5">
            <li>+5 XP when someone else approves your song request</li>
            <li>+3 XP when a listener hearts your live track (once per person per track)</li>
            <li>+25 XP when you play someone else&apos;s request (verified by stream metadata)</li>
            <li>
              +5 XP when you share the DJ booth with another connection and they stay on air for 3
              minutes (must be your promote — taking DJ back early or someone else switching cancels
              it)
            </li>
          </ul>
        </section>

        <ShareLinksPanel onFlash={(msg) => setProfileMessage(msg)} />

        {partyFavoritesScopeForUser(status.user?.id) && (
          <PartyEffectFavoritesPanel scope={partyFavoritesScopeForUser(status.user?.id)!} />
        )}

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Browser extension</h2>
          <p className="text-sm text-gray-400 mb-5">
            Pair the broadcaster extension to relay tab audio. The device name appears on stage when you are broadcasting.
          </p>

          {devices.length > 0 && (
            <div className="space-y-2 mb-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">Paired devices</p>
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-3"
                >
                  {editingDeviceId === device.id ? (
                    <div className={`${adminInlineRowClass} flex-wrap`}>
                      <input
                        className={`${adminFormControlClass} flex-1 min-w-0`}
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        maxLength={64}
                        placeholder="Device name"
                      />
                      <div className={`${adminInlineRowClass} shrink-0 w-full sm:w-auto`}>
                        <button
                          type="button"
                          disabled={loading || !editingLabel.trim()}
                          onClick={() => void saveDeviceLabel(device.id)}
                          className={`${adminPrimaryBtnClass} !px-3 w-full sm:w-auto`}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setEditingDeviceId(null);
                            setEditingLabel("");
                          }}
                          className={`${adminControlHeight} inline-flex items-center justify-center w-full sm:w-auto rounded-lg border border-gray-600 px-3 text-sm text-gray-300 hover:bg-gray-700/50`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {device.label || "Browser extension"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {device.tokenPrefix}… ·{" "}
                          {device.lastUsedAt ? `Last used ${device.lastUsedAt}` : "Never used"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => startRenameDevice(device)}
                          className="text-xs text-radio-accent hover:underline disabled:opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void revoke(device.id)}
                          className="text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {devices.length === 0 || showPairForm ? (
            <>
              <p className="text-sm text-gray-400 mb-3">
                Open the extension popup, copy the pairing code, and enter it below with a name for this device.
              </p>
              <div className={`${adminInlineRowClass} flex-wrap mb-3`}>
                <input
                  className={`${adminFormControlClass} flex-1 min-w-0`}
                  placeholder="ABCD-1234"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                />
                <input
                  className={`${adminFormControlClass} w-full sm:w-48 shrink-0`}
                  placeholder="Device name"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  maxLength={64}
                />
                <button
                  type="button"
                  disabled={loading || !userCode.trim()}
                  onClick={() => void confirmPair()}
                  className={`${adminPrimaryBtnClass} w-full sm:w-auto shrink-0 disabled:opacity-50`}
                >
                  Pair extension
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowPairForm(true)}
              className="text-sm text-radio-accent hover:underline"
            >
              Pair another device
            </button>
          )}

          {pairMessage && <p className="text-sm text-green-400 mt-2">{pairMessage}</p>}
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </section>
      </div>
    </div>
  );
}
