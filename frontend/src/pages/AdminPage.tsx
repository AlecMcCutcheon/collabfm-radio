import { useEffect, useRef, useState } from "react";
import { ClipboardList, FileText } from "lucide-react";
import { api } from "../api/client";
import { AppNavLink } from "../context/AppNavigationContext";
import { apiUrl } from "../config";
import { notifyStationFeaturesChanged } from "../context/BrandingFeaturesContext";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { AdminBackButton } from "../components/admin/AdminNavButton";
import { AdminUserRow } from "../components/admin/AdminUserRow";
import { ContentPolicyAdminSection } from "../components/admin/ContentPolicyAdminSection";
import {
  AdminBtn,
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminSecretInput,
  AdminSection,
  AdminSelect,
  AdminTabBar,
  adminControlHeight,
  adminInlineRowClass,
  adminListItemClass,
  RolePicker,
  RoleBadge,
  OIDC_FIELDS,
} from "../components/admin/adminUi";
import type { AdminUser, AudioPipelineSettings, BrandingSettings, BuildInfo, ContainerUpdateStatus, IntegrationsSettings, LimitsSettings, OidcConfig, ShareLink, StreamInfo, VoiceBotConfig, VoiceBotMessageCleanupScope, VoiceBotMessageCleanupTarget, VoiceBotRuntime, WhitelistEntry } from "../types/api";
import { applyStationTitle } from "../utils/stationTitle";
import { absolutePublicUrl } from "../utils/publicUrl";
import { registrationPendingCountBadgeClass } from "../utils/registrationStatus";
import { imageFallbackHandler, proceduralStationLogo, resolveBrandingImageUrl } from "../utils/brandingImage";

type Tab = "users" | "discord" | "sharing" | "oidc" | "radio" | "security" | "system";

function hasOidcProviderAdminToken(token?: string): boolean {
  return String(token ?? "").trim().length > 0;
}

const DEFAULT_LIMITS: LimitsSettings = { maxStageUsers: 7, logRetentionCount: 5 };
const MAX_STAGE_USERS = 9;
const DEFAULT_AUDIO: AudioPipelineSettings = {
  discordBufferFrames: 100,
  discordRelayBufferMs: 3000,
  pcmMaxBufferMs: 4500,
  pcmMinBufferMs: 1500,
  silenceDebounceChunks: 50,
  audioDebounceChunks: 25,
  silenceThreshold: 0.025,
};

function shareLinkOwnerLabel(link: ShareLink): string {
  if (!link.createdBy) return "Unknown owner";
  const name = link.createdBy.displayName || link.createdBy.username;
  return `${name} (${link.createdBy.role})`;
}

function formatExpiry(link: ShareLink) {
  if (link.revoked) return "Revoked";
  if (link.expired) return "Expired";
  if (link.expires_at == null) return "Unknown";
  return new Date(link.expires_at).toLocaleString();
}

function brandingPreviewUrl(b: BrandingSettings): string {
  return resolveBrandingImageUrl(b.visualizerImageUrl);
}

async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { data: btoa(binary), mimeType: file.type || "image/png" };
}

function copyText(text: string, flash: (msg: string) => void) {
  void navigator.clipboard.writeText(text).then(
    () => flash("Copied to clipboard"),
    () => flash("Copy failed"),
  );
}

export function AdminPage() {
  const { status: authStatus } = useAuthStatus();
  const currentUserId = authStatus.user?.id ?? null;
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [oidc, setOidc] = useState<OidcConfig>({ enabled: false });
  const [oidcOnlyUserCount, setOidcOnlyUserCount] = useState(0);
  const savedOidcEnabledRef = useRef(false);
  const [mappings, setMappings] = useState<Array<{ oidc_group: string; role: string }>>([]);
  const [newMapping, setNewMapping] = useState({ oidc_group: "", role: "listener" });
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [voiceBot, setVoiceBot] = useState<VoiceBotConfig>({
    clientId: "",
    botToken: "",
    enabled: true,
    publicBaseUrl: "",
    messageCleanup: { targets: "all", scope: "remembered" },
  });
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceBotRuntime | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "listener" });
  const [passwordEditId, setPasswordEditId] = useState<number | null>(null);
  const [reconcileBusyId, setReconcileBusyId] = useState<number | null>(null);
  const [refreshEmailsBusy, setRefreshEmailsBusy] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [newGuildId, setNewGuildId] = useState("");
  const [newGuildLabel, setNewGuildLabel] = useState("");
  const [branding, setBranding] = useState<BrandingSettings>({
    radioDisplayName: "CollabFM Radio",
    visualizerImageUrl: "/profile.webp",
    hasCustomVisualizer: false,
    hideDeveloperAboutMessage: false,
    branded2fa: false,
  });
  const [visualizerPreview, setVisualizerPreview] = useState(() => apiUrl("/profile.webp"));
  const [visualizerDragOver, setVisualizerDragOver] = useState(false);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationsSettings>({
    lastfmApiKey: "",
    lastfmDefaultUser: "",
    giphyApiKey: "",
  });
  const [integrationsBusy, setIntegrationsBusy] = useState(false);
  const [guestActionsGrantXp, setGuestActionsGrantXp] = useState(true);
  const [blockGuestXpMatchingStageIp, setBlockGuestXpMatchingStageIp] = useState(true);
  const [localLogin2faRequired, setLocalLogin2faRequired] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [limits, setLimits] = useState<LimitsSettings>(DEFAULT_LIMITS);
  const [audio, setAudio] = useState<AudioPipelineSettings>(DEFAULT_AUDIO);
  const [radioBusy, setRadioBusy] = useState(false);
  const [levelingBusy, setLevelingBusy] = useState(false);
  const [updatesNotify, setUpdatesNotify] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [containerUpdates, setContainerUpdates] = useState<ContainerUpdateStatus | null>(null);
  const [updatesBusy, setUpdatesBusy] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [registrationPendingCount, setRegistrationPendingCount] = useState(0);
  const visualizerInputRef = useRef<HTMLInputElement>(null);

  const resolvedTrackTag =
    containerUpdates?.current.trackTag ??
    (buildInfo?.channel === "develop" ? "develop" : "latest");

  const containerUpdatesDisabled =
    buildInfo?.revision === "local" ||
    buildInfo?.channel === "development" ||
    buildInfo?.runtime !== "docker";

  const refreshContainerUpdates = async () => {
    if (containerUpdatesDisabled) return;
    try {
      const status = await api.adminContainerUpdates();
      setContainerUpdates(status);
    } catch {
      setContainerUpdates(null);
    }
  };

  const reload = async () => {
    setError(null);
    try {
      const [u, o, w, vb, stream, links, settings, registration] = await Promise.all([
        api.adminUsers(),
        api.adminOidc(),
        api.adminWhitelist(),
        api.adminVoiceBot(),
        api.adminStream(),
        api.adminShareLinks(),
        api.adminSettings(),
        api.adminRegistration().catch(() => ({ settings: { enabled: false }, pendingCount: 0 })),
      ]);
      setUsers(u.users);
      setOidc(o.oidc);
      setOidcOnlyUserCount(o.oidcOnlyUserCount ?? 0);
      savedOidcEnabledRef.current = o.oidc.enabled === true;
      setMappings(o.mappings);
      setWhitelist(w.entries);
      setVoiceBot(vb.voiceBot);
      setVoiceRuntime(vb.runtime);
      setInviteUrl(vb.inviteUrl);
      setVoiceNote(vb.note);
      setStreamInfo(stream);
      setRegistrationEnabled(registration.settings.enabled === true);
      setRegistrationPendingCount(registration.pendingCount ?? 0);
      setShareLinks(links.links);
      setBranding(settings.branding);
      setVisualizerPreview(brandingPreviewUrl(settings.branding));
      setIntegrations(settings.integrations);
      setGuestActionsGrantXp(settings.leveling?.guestActionsGrantXp !== false);
      setBlockGuestXpMatchingStageIp(settings.leveling?.blockGuestXpMatchingStageIp !== false);
      setLocalLogin2faRequired(settings.security?.localLogin2faRequired === true);
      setLimits(settings.limits ?? DEFAULT_LIMITS);
      setAudio(settings.audio ?? DEFAULT_AUDIO);
      setUpdatesNotify(settings.updates?.notifyOnBuildAvailable === true);
      setBuildInfo(settings.build ?? null);
      const build = settings.build;
      const updatesDisabled =
        build?.revision === "local" ||
        build?.channel === "development" ||
        build?.runtime !== "docker";
      if (updatesDisabled) {
        setContainerUpdates(null);
      } else {
        await refreshContainerUpdates();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
  };

  const refreshRegistrationPendingCount = async () => {
    try {
      const registration = await api.adminRegistration();
      setRegistrationEnabled(registration.settings.enabled === true);
      setRegistrationPendingCount(registration.pendingCount ?? 0);
    } catch {
      /* Ignore transient poll errors — badge keeps last known count. */
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshRegistrationPendingCount();
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tab === "users") void refreshRegistrationPendingCount();
  }, [tab]);

  useEffect(() => {
    if (tab !== "discord") return;
    const id = window.setInterval(() => {
      void api.adminVoiceBot().then((vb) => setVoiceRuntime(vb.runtime)).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (!updatesNotify || containerUpdatesDisabled) return;
    const id = window.setInterval(() => {
      void refreshContainerUpdates();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [updatesNotify, containerUpdatesDisabled]);

  const saveUpdates = async () => {
    if (containerUpdatesDisabled) return;
    setUpdatesBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({
        updates: {
          notifyOnBuildAvailable: updatesNotify,
        },
      });
      setUpdatesNotify(res.updates?.notifyOnBuildAvailable === true);
      setBuildInfo(res.build ?? buildInfo);
      await refreshContainerUpdates();
      flash("Container update settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setUpdatesBusy(false);
    }
  };

  const flash = (msg: string) => {
    setSaved(msg);
    window.setTimeout(() => setSaved(null), 4000);
  };

  const uploadVisualizer = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setBrandingBusy(true);
    setError(null);
    try {
      const payload = await fileToBase64(file);
      const res = await api.uploadAdminVisualizer(payload);
      setBranding(res.branding);
      setVisualizerPreview(brandingPreviewUrl(res.branding));
      flash("Visualizer logo updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBrandingBusy(false);
    }
  };

  const saveIntegrations = async () => {
    setIntegrationsBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({ integrations });
      setIntegrations(res.integrations);
      notifyStationFeaturesChanged();
      flash("Integration keys saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIntegrationsBusy(false);
    }
  };

  const saveLeveling = async () => {
    setLevelingBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({
        leveling: { guestActionsGrantXp, blockGuestXpMatchingStageIp },
      });
      setGuestActionsGrantXp(res.leveling?.guestActionsGrantXp !== false);
      setBlockGuestXpMatchingStageIp(res.leveling?.blockGuestXpMatchingStageIp !== false);
      flash("Leveling settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLevelingBusy(false);
    }
  };

  const saveSecurity = async () => {
    setSecurityBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({
        security: { localLogin2faRequired },
      });
      setLocalLogin2faRequired(res.security?.localLogin2faRequired === true);
      flash("Security settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSecurityBusy(false);
    }
  };

  const saveBrandingName = async () => {
    setBrandingBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({
        branding: {
          radioDisplayName: branding.radioDisplayName,
          hideDeveloperAboutMessage: branding.hideDeveloperAboutMessage === true,
          branded2fa: branding.branded2fa === true,
        },
      });
      setBranding(res.branding);
      applyStationTitle(res.branding.radioDisplayName, "Admin");
      flash("Branding settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBrandingBusy(false);
    }
  };

  const resetBranding = async () => {
    setBrandingBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({ resetBranding: true });
      setBranding(res.branding);
      setVisualizerPreview(brandingPreviewUrl(res.branding));
      applyStationTitle(res.branding.radioDisplayName, "Admin");
      flash("Branding reset to defaults");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBrandingBusy(false);
    }
  };

  const createUser = async () => {
    await api.createAdminUser(newUser);
    setNewUser({ username: "", password: "", role: "listener" });
    await reload();
    flash("User created");
  };

  const saveUserPassword = async (userId: number) => {
    if (passwordDraft.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      const res = await api.updateAdminUser(userId, { password: passwordDraft });
      setPasswordEditId(null);
      setPasswordDraft("");
      await reload();
      const user = res.user;
      if (user?.username) {
        flash(
          res.loginEmailAssigned && res.loginEmail
            ? `Password set. Local sign-in enabled with ${res.loginEmail}.`
            : `Password updated for ${user.username}.`,
        );
      } else {
        flash("Password updated");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.deleteAdminUser(user.id);
      if (passwordEditId === user.id) {
        setPasswordEditId(null);
        setPasswordDraft("");
      }
      await reload();
      flash("User deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const saveRadio = async () => {
    setRadioBusy(true);
    setError(null);
    try {
      const res = await api.saveAdminSettings({ limits, audio });
      setLimits(res.limits ?? limits);
      setAudio(res.audio ?? audio);
      flash("Radio settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save radio settings");
    } finally {
      setRadioBusy(false);
    }
  };

  const saveOidc = async () => {
    const disabling = !oidc.enabled && savedOidcEnabledRef.current;
    if (disabling && oidcOnlyUserCount > 0) {
      const noun = oidcOnlyUserCount === 1 ? "user" : "users";
      const confirmed = window.confirm(
        `Disable OIDC login?\n\n${oidcOnlyUserCount} SSO-only ${noun} will no longer be able to sign in. Existing sessions stay active until they expire.\n\nYour provider settings and group mappings will be kept so you can turn OIDC back on later.`,
      );
      if (!confirmed) return;
    }
    await api.saveAdminOidc({ oidc, mappings });
    await reload();
    flash("OIDC settings saved");
  };

  const addMapping = () => {
    const group = newMapping.oidc_group.trim();
    if (!group) return;
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.oidc_group !== group);
      return [...filtered, { oidc_group: group, role: newMapping.role }];
    });
    setNewMapping({ oidc_group: "", role: "listener" });
  };

  const removeMapping = (group: string) => {
    setMappings((prev) => prev.filter((m) => m.oidc_group !== group));
  };

  const saveVoiceBot = async () => {
    await api.saveAdminVoiceBot(voiceBot);
    await reload();
    flash("Discord bot settings saved — verify again if you changed credentials");
  };

  const verifyVoiceBot = async () => {
    setVerifyBusy(true);
    setError(null);
    try {
      const result = await api.verifyAdminVoiceBot(voiceBot);
      if (!result.ok) {
        setError(result.error || "Verification failed");
        return;
      }
      if (result.voiceBot) {
        setVoiceBot(result.voiceBot.voiceBot);
        setVoiceRuntime(result.runtime ?? result.voiceBot.runtime);
        setInviteUrl(result.voiceBot.inviteUrl);
      } else {
        await reload();
      }
      if (result.autoStart?.ok && !result.autoStart?.alreadyRunning && !result.autoStart?.skipped) {
        flash(`Verified and started @${result.botUsername}`);
      } else {
        flash(`Verified bot @${result.botUsername}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyBusy(false);
    }
  };

  const startVoiceBot = async () => {
    setBotBusy(true);
    setError(null);
    try {
      const result = await api.startAdminVoiceBot();
      if (!result.ok) {
        setError(result.error || "Could not start voice bot");
        return;
      }
      if (result.runtime) setVoiceRuntime(result.runtime);
      await reload();
      flash(result.external ? "Voice bot runs in Docker — see note below" : "Voice bot started");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start voice bot");
    } finally {
      setBotBusy(false);
    }
  };

  const stopVoiceBot = async () => {
    setBotBusy(true);
    setError(null);
    try {
      const result = await api.stopAdminVoiceBot();
      if (!result.ok) {
        setError(result.error || "Could not stop voice bot");
        return;
      }
      if (result.runtime) setVoiceRuntime(result.runtime);
      await reload();
      flash(result.external ? "Voice bot runs in Docker — see note below" : "Voice bot stopped");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop voice bot");
    } finally {
      setBotBusy(false);
    }
  };

  const addWhitelist = async () => {
    if (!newGuildId.trim()) return;
    await api.addWhitelistEntry({ guild_id: newGuildId.trim(), label: newGuildLabel || undefined });
    setNewGuildId("");
    setNewGuildLabel("");
    await reload();
    flash("Server added to whitelist");
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "users", label: "Users" },
    { id: "discord", label: "Discord bot" },
    { id: "sharing", label: "Share links" },
    { id: "oidc", label: "OIDC / SSO" },
    { id: "radio", label: "Radio" },
    { id: "security", label: "Security" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <AdminBackButton />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Radio Admin</h1>
            <p className="text-sm text-gray-400">Manage users, streaming, Discord, and sign-in settings.</p>
          </div>
        </div>

        {updatesNotify && !containerUpdatesDisabled && containerUpdates?.updateAvailable && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium text-amber-50">New container build available</p>
            <p className="mt-1 text-amber-100/90">
              Running <span className="font-mono">{containerUpdates.current.buildId}</span>
              {" · "}
              published{" "}
              <span className="font-mono">{containerUpdates.remote?.revision.slice(0, 7)}</span>
              {" on "}
              <span className="font-mono">{containerUpdates.remote?.image}</span>
            </p>
            <p className="mt-2 text-xs text-amber-200/80">
              Pull the image, set <span className="font-mono">COLLABFM_SYNC_MODE=update</span>, recreate once, then reinstall the extension if needed.
            </p>
          </div>
        )}

        <AdminTabBar tabs={tabs} active={tab} onChange={(id) => setTab(id as Tab)} />

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        {saved && <p className="text-sm text-green-400 mb-4">{saved}</p>}

        {tab === "users" && (
          <AdminSection title="Users" description="Manage accounts, roles, passwords, and leveling controls.">
            <div className="rounded-xl border border-gray-700/90 bg-gray-900/50 p-4 space-y-4 mb-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Gated registration</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Optional access-request flow with admin approval and token-based account activation.
                </p>
              </div>
              <AdminCheckbox
                checked={registrationEnabled}
                onChange={async (checked) => {
                  try {
                    const current = await api.adminRegistration();
                    const result = await api.saveAdminRegistration({
                      ...current.settings,
                      enabled: checked,
                    });
                    setRegistrationEnabled(result.settings.enabled);
                    flash(checked ? "Gated registration enabled" : "Gated registration disabled");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to update registration");
                  }
                }}
                label="Enable gated registration"
                hint="Off by default. When on, the login page shows a registration entry point."
              />
              <div className="flex flex-wrap gap-3">
                <AppNavLink
                  to="/admin/registration/form"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-white hover:border-radio-accent/40 hover:text-radio-accent transition"
                >
                  <FileText className="w-4 h-4" aria-hidden />
                  Registration form
                </AppNavLink>
                <AppNavLink
                  to="/admin/registration/queue"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-white hover:border-radio-accent/40 hover:text-radio-accent transition"
                >
                  <ClipboardList className="w-4 h-4" aria-hidden />
                  Request queue
                  {registrationPendingCount > 0 && (
                    <span className={`ml-1 rounded-full text-xs px-2 py-0.5 ${registrationPendingCountBadgeClass()}`}>
                      {registrationPendingCount}
                    </span>
                  )}
                </AppNavLink>
              </div>
            </div>

            {oidc.enabled && hasOidcProviderAdminToken(oidc.providerAdminToken) && (
              <div className="rounded-xl border border-gray-700/90 bg-gray-900/50 p-4 space-y-3 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-white">SSO email refresh</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Fetch missing SSO login emails from the identity provider. Does not require users
                    to sign in again.
                  </p>
                </div>
                <AdminBtn
                  variant="secondary"
                  disabled={refreshEmailsBusy}
                  onClick={() => {
                    setRefreshEmailsBusy(true);
                    setError(null);
                    void api
                      .refreshLegacyOidcEmails()
                      .then((res) => {
                        const s = res.summary;
                        flash(
                          `SSO email refresh: ${s.refreshed} updated, ${s.skipped} unchanged, ${s.failed} failed (${s.scanned} scanned).`,
                        );
                        return reload();
                      })
                      .catch((err) => {
                        setError(err instanceof Error ? err.message : "Failed to refresh SSO emails");
                      })
                      .finally(() => setRefreshEmailsBusy(false));
                  }}
                >
                  {refreshEmailsBusy ? "Refreshing…" : "Refresh SSO emails"}
                </AdminBtn>
              </div>
            )}

            <ul className="space-y-4">
              {users.map((u) => {
                const isSelf = currentUserId != null && String(u.id) === currentUserId;
                const lockSelfAdmin = isSelf && u.role === "admin";
                const editingPassword = passwordEditId === u.id;
                return (
                  <AdminUserRow
                    key={u.id}
                    user={u}
                    hybridUsersEnabled={!!oidc.hybridUsersEnabled}
                    guestActionsGrantXp={guestActionsGrantXp}
                    isSelf={isSelf}
                    lockSelfAdmin={lockSelfAdmin}
                    editingPassword={editingPassword}
                    passwordDraft={passwordDraft}
                    onPasswordDraftChange={setPasswordDraft}
                    onTogglePasswordEdit={() => {
                      if (editingPassword) {
                        setPasswordEditId(null);
                        setPasswordDraft("");
                      } else {
                        setPasswordEditId(u.id);
                        setPasswordDraft("");
                      }
                    }}
                    onSavePassword={() => void saveUserPassword(u.id)}
                    onRoleChange={async (role) => {
                      try {
                        await api.updateAdminUser(u.id, { role });
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update user");
                      }
                    }}
                    onDelete={() => void deleteUser(u)}
                    onToggleBlockGuestXp={async (checked) => {
                      try {
                        await api.updateAdminUser(u.id, { blockGuestActionXp: checked });
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update user");
                      }
                    }}
                    onResetXp={async () => {
                      if (!window.confirm(`Reset all XP for ${u.username}?`)) return;
                      try {
                        await api.resetAdminUserXp(u.id);
                        await reload();
                        flash(`Reset XP for ${u.username}`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to reset XP");
                      }
                    }}
                    onResetTotp={async () => {
                      if (
                        !window.confirm(
                          `Reset 2FA for ${u.username}? They will need to set it up again on next local login.`,
                        )
                      ) {
                        return;
                      }
                      try {
                        await api.resetAdminUserTotp(u.id);
                        await reload();
                        flash(`Reset 2FA for ${u.username}`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to reset 2FA");
                      }
                    }}
                    reconcileBusy={reconcileBusyId === u.id}
                    onReconcileOidcUsername={async () => {
                      setReconcileBusyId(u.id);
                      setError(null);
                      try {
                        const res = await api.reconcileAdminUserOidcUsername(u.id);
                        await reload();
                        flash(
                          res.reconciled
                            ? `Normalized ${u.username} to provider UUID ${res.providerSub || res.user.username}.`
                            : `Identity already matches provider UUID for ${u.username}.`,
                        );
                      } catch (err) {
                        let message = err instanceof Error ? err.message : "Failed to reconcile identity";
                        try {
                          const parsed = JSON.parse(message) as {
                            error?: string;
                            needsSsoVerification?: boolean;
                          };
                          if (parsed?.error) message = parsed.error;
                          if (parsed?.needsSsoVerification) {
                            message += " Have them sign in via SSO once to refresh from the identity provider.";
                          }
                        } catch {
                          /* plain text */
                        }
                        setError(message);
                      } finally {
                        setReconcileBusyId(null);
                      }
                    }}
                  />
                );
              })}
            </ul>

            <div className="mt-6 rounded-xl border border-gray-700/90 bg-gray-900/50 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Add user</h3>
                <p className="text-xs text-gray-500 mt-1">Create a local username and password account.</p>
              </div>
              <div className={`${adminInlineRowClass} flex-wrap`}>
                <AdminInput
                  className="mt-0 sm:flex-1"
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
                <AdminInput
                  className="mt-0 sm:flex-1"
                  type="password"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
                <AdminSelect
                  className="mt-0 w-full sm:w-40 shrink-0"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="listener">Listener</option>
                  <option value="broadcaster">Broadcaster</option>
                  <option value="admin">Admin</option>
                </AdminSelect>
                <AdminBtn className="w-full sm:w-auto shrink-0" onClick={() => void createUser()}>
                  Add user
                </AdminBtn>
              </div>
            </div>
          </AdminSection>
        )}

        {tab === "discord" && (
          <>
            <AdminSection
              title="Discord voice bot"
              description="Bot for /join and /leave in voice channels. Save credentials, verify with Discord, then start the bot."
              badge={
                <span
                  className={`text-xs px-2.5 py-1 rounded-full ${
                    voiceRuntime?.running ? "bg-green-900/50 text-green-300" : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {voiceRuntime?.running ? "Running" : "Stopped"}
                </span>
              }
            >
              {voiceBot.verified && (
                <p className="text-green-400/90 text-xs rounded-lg bg-green-950/30 border border-green-900/40 px-3 py-2">
                  Verified as <strong>{voiceBot.verified.botUsername}</strong>
                  {voiceBot.verified.applicationName ? ` (${voiceBot.verified.applicationName})` : ""} —{" "}
                  {new Date(voiceBot.verified.at).toLocaleString()}
                </p>
              )}
              <AdminCheckbox
                checked={!!voiceBot.enabled}
                onChange={(checked) => setVoiceBot({ ...voiceBot, enabled: checked })}
                label="Enable voice bot"
              />
              <AdminField label="Application ID (Client ID)">
                <AdminInput className="font-mono text-xs" value={voiceBot.clientId} onChange={(e) => setVoiceBot({ ...voiceBot, clientId: e.target.value })} placeholder="123456789012345678" />
              </AdminField>
              <AdminField label="Bot Token">
                <AdminSecretInput
                  className="font-mono text-xs"
                  value={voiceBot.botToken}
                  onChange={(e) => setVoiceBot({ ...voiceBot, botToken: e.target.value })}
                  placeholder={voiceBot.botToken ? "Bot token saved" : "Paste bot token"}
                  revealLabel="Show bot token"
                  hideLabel="Hide bot token"
                  autoComplete="off"
                />
              </AdminField>
              <AdminField
                label="Public site URL"
                hint="HTTPS origin listeners use to reach CollabFM (e.g. https://radio.example.com). Required for Discord embed thumbnails and procedural cover art."
              >
                <AdminInput
                  className="font-mono text-xs"
                  value={voiceBot.publicBaseUrl ?? ""}
                  onChange={(e) => setVoiceBot({ ...voiceBot, publicBaseUrl: e.target.value })}
                  placeholder="https://radio.example.com"
                />
              </AdminField>
              {voiceNote && <p className="text-gray-500 text-xs">{voiceNote}</p>}
              {voiceRuntime?.mode === "external" && (
                <p className="text-amber-200/80 text-xs rounded-lg bg-amber-950/30 border border-amber-900/40 px-3 py-2">
                  Docker mode: restart <code className="text-amber-100">collabfm-voice</code> after token changes.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {inviteUrl && (
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`${adminControlHeight} inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700/80`}
                  >
                    Invite bot to server
                  </a>
                )}
                <AdminBtn variant="secondary" onClick={() => void saveVoiceBot()}>Save</AdminBtn>
                <AdminBtn disabled={verifyBusy} onClick={() => void verifyVoiceBot()}>{verifyBusy ? "Verifying…" : "Verify credentials"}</AdminBtn>
                <AdminBtn variant="success" disabled={botBusy || !voiceBot.verified || voiceRuntime?.mode === "external"} onClick={() => void startVoiceBot()}>Start bot</AdminBtn>
                <AdminBtn variant="danger" disabled={botBusy || !voiceRuntime?.running || voiceRuntime?.mode === "external"} onClick={() => void stopVoiceBot()}>Stop bot</AdminBtn>
              </div>
            </AdminSection>

            <AdminSection
              title="Message cleanup"
              description="Control what the voice bot deletes when it leaves voice, on startup, and on periodic sweeps. Remembered channels are text channels where /join was used."
            >
              <AdminField
                label="What to remove"
                hint="Now-playing embed is the live sync card with station selector. Slash replies are /join, /leave, and /station responses."
              >
                <AdminSelect
                  value={voiceBot.messageCleanup?.targets ?? "all"}
                  onChange={(e) =>
                    setVoiceBot({
                      ...voiceBot,
                      messageCleanup: {
                        targets: e.target.value as VoiceBotMessageCleanupTarget,
                        scope: voiceBot.messageCleanup?.scope ?? "remembered",
                      },
                    })
                  }
                >
                  <option value="off">Off — never auto-delete</option>
                  <option value="sync_embed">Now-playing embed only</option>
                  <option value="slash_replies">Slash command replies only (/join, /leave, /station)</option>
                  <option value="all">All bot messages in scope</option>
                </AdminSelect>
              </AdminField>
              <AdminField
                label="Where to scan"
                hint="Remembered channels only is safest. All text channels scans every text channel in servers where the bot is not in voice."
              >
                <AdminSelect
                  value={voiceBot.messageCleanup?.scope ?? "remembered"}
                  disabled={(voiceBot.messageCleanup?.targets ?? "all") === "off"}
                  onChange={(e) =>
                    setVoiceBot({
                      ...voiceBot,
                      messageCleanup: {
                        targets: voiceBot.messageCleanup?.targets ?? "all",
                        scope: e.target.value as VoiceBotMessageCleanupScope,
                      },
                    })
                  }
                >
                  <option value="remembered">Remembered channels only</option>
                  <option value="all_channels">All text channels in server</option>
                </AdminSelect>
              </AdminField>
            </AdminSection>

            <AdminSection title="Server whitelist" description="Only these Discord server IDs may use /join.">
              <ul className="space-y-2">
                {whitelist.map((e) => (
                  <li key={e.guild_id} className={`${adminListItemClass} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
                    <span>{e.guild_id} {e.label ? `— ${e.label}` : ""}</span>
                    <button type="button" className="text-red-400 text-sm hover:text-red-300" onClick={async () => { await api.removeWhitelistEntry(e.guild_id); await reload(); }}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className={adminInlineRowClass}>
                <AdminInput
                  className="mt-0 w-full sm:flex-1 sm:min-w-0"
                  placeholder="Guild ID"
                  value={newGuildId}
                  onChange={(e) => setNewGuildId(e.target.value)}
                />
                <AdminInput
                  className="mt-0 w-full sm:flex-1 sm:min-w-0"
                  placeholder="Label (optional)"
                  value={newGuildLabel}
                  onChange={(e) => setNewGuildLabel(e.target.value)}
                />
                <AdminBtn className="w-full sm:w-auto" onClick={() => void addWhitelist()}>
                  Add
                </AdminBtn>
              </div>
            </AdminSection>
          </>
        )}

        {tab === "sharing" && (
          <>
            <AdminSection title="Stream access" description="Logged-in users use the session stream. Broadcasters manage their own guest links in Broadcaster Studio — this view shows all links site-wide.">
              {streamInfo && <p className="text-gray-500 text-xs">Active listeners: {streamInfo.listeners}</p>}
            </AdminSection>

            <AdminSection title="All share links" description="Site-wide overview. Create and manage your own links in Broadcaster Studio.">
              {shareLinks.length === 0 && <p className="text-gray-500">No share links yet.</p>}
              <ul className="space-y-3">
                {shareLinks.map((link) => (
                  <li key={link.id} className={`${adminListItemClass} space-y-2`}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{link.label || `Link #${link.id}`}</span>
                      <span className="text-gray-500 text-xs">{formatExpiry(link)}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Created by <span className="text-gray-300">{shareLinkOwnerLabel(link)}</span>
                      {link.link_kind === "stream" ? " · Stream link" : " · Guest view"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <AdminBtn variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => copyText(absolutePublicUrl(link.uiUrl), flash)} disabled={!!link.revoked}>Copy UI link</AdminBtn>
                      <AdminBtn variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => copyText(absolutePublicUrl(link.streamUrl), flash)} disabled={!!link.revoked}>Copy stream link</AdminBtn>
                      {!link.revoked && (
                        <AdminBtn variant="danger" className="!px-3 !py-1.5 text-xs" onClick={async () => { await api.revokeShareLink(link.id); await reload(); flash("Link revoked"); }}>Revoke</AdminBtn>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 break-all font-mono">{absolutePublicUrl(link.streamUrl)}</p>
                  </li>
                ))}
              </ul>
            </AdminSection>
          </>
        )}

        {tab === "oidc" && (
          <>
            <AdminSection
              title="OpenID Connect (SSO)"
              description="Optional sign-in via Authentik or any OIDC provider. Local login always remains available."
            >
              <AdminCheckbox
                checked={!!oidc.enabled}
                onChange={(checked) => setOidc({ ...oidc, enabled: checked })}
                label="Enable OIDC login"
              />
              {!oidc.enabled && oidcOnlyUserCount > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                  OIDC is off in this draft. {oidcOnlyUserCount} SSO-only{" "}
                  {oidcOnlyUserCount === 1 ? "account" : "accounts"} cannot sign in until you re-enable
                  and save. Provider settings below are kept when disabled.
                </div>
              )}
              {oidc.enabled && oidcOnlyUserCount > 0 && (
                <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-400">
                  {oidcOnlyUserCount} SSO-only {oidcOnlyUserCount === 1 ? "user relies" : "users rely"} on
                  OIDC login. Disabling requires confirmation; configuration is preserved.
                </div>
              )}
              <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-400">
                Callback URL (register this in your OIDC app):{" "}
                <code className="text-radio-accent break-all">{apiUrl("/auth/oidc/callback")}</code>
              </div>
              {OIDC_FIELDS.map((field) => (
                <AdminField key={field.key} label={field.label} hint={field.hint}>
                  <AdminInput
                    type={field.secret ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={String(oidc[field.key] ?? "")}
                    onChange={(e) => setOidc({ ...oidc, [field.key]: e.target.value })}
                  />
                </AdminField>
              ))}
              <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-400">
                SSO accounts use the provider subject (sub) as the internal username. Display names
                come from the identity provider and appear in chat.
              </div>
              <AdminField
                label="Provider admin API token (optional)"
                hint="Authentik: create an API token with permission to read users. CollabFM uses it to fetch SSO login emails without waiting for the user's next sign-in."
              >
                <AdminInput
                  type="password"
                  placeholder="********"
                  value={oidc.providerAdminToken || ""}
                  onChange={(e) => setOidc({ ...oidc, providerAdminToken: e.target.value })}
                />
              </AdminField>
              <AdminCheckbox
                checked={!!oidc.hybridUsersEnabled}
                onChange={(checked) => setOidc({ ...oidc, hybridUsersEnabled: checked })}
                label="Allow hybrid accounts (SSO + local password)"
                hint="When enabled, SSO users can set a local password in Studio. Hybrid UI and self-service password APIs are hidden when off. Existing hybrid logins keep working."
              />
              <AdminCheckbox
                checked={!!oidc.linkByNameMatch}
                onChange={(checked) => setOidc({ ...oidc, linkByNameMatch: checked })}
                label="Link to existing local account on name match"
                hint="When enabled, first OIDC login attaches to a local user whose username matches preferred_username or name instead of creating a new account."
              />
              <AdminField
                label="SSO button nickname"
                hint='Shown on the login screen as "Login With …" — e.g. Authentik'
              >
                <AdminInput
                  placeholder="Authentik"
                  value={oidc.providerNickname || ""}
                  onChange={(e) => setOidc({ ...oidc, providerNickname: e.target.value })}
                />
              </AdminField>
            </AdminSection>

            <AdminSection
              title="Group → role mapping"
              description="When someone signs in with OIDC, the radio reads their groups from the JWT (using the Groups claim name above). Match each IdP group to a radio role. If a user matches multiple groups, the highest role wins. Unmatched users become listeners."
            >
              {mappings.length === 0 && (
                <p className="text-gray-500 text-sm">No mappings yet — all OIDC users will be listeners.</p>
              )}
              <ul className="space-y-2">
                {mappings.map((m) => (
                  <li
                    key={m.oidc_group}
                    className={`${adminListItemClass} flex items-center justify-between gap-3`}
                  >
                    <span className="font-mono text-sm text-radio-accent break-all min-w-0">{m.oidc_group}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <RoleBadge roleId={m.role} />
                      <button
                        type="button"
                        className="text-red-400 text-sm hover:text-red-300"
                        onClick={() => removeMapping(m.oidc_group)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-4 pt-4 border-t border-gray-700/80">
                <AdminField label="OIDC group name" hint="Exact string from your IdP (e.g. radio-admins)">
                  <AdminInput
                    placeholder="radio-admins"
                    value={newMapping.oidc_group}
                    onChange={(e) => setNewMapping({ ...newMapping, oidc_group: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addMapping();
                    }}
                  />
                </AdminField>
                <div>
                  <span className="block text-xs uppercase tracking-wide text-gray-500 mb-2">Radio role</span>
                  <RolePicker
                    value={newMapping.role}
                    onChange={(role) => setNewMapping({ ...newMapping, role })}
                  />
                </div>
                <AdminBtn variant="secondary" className="w-full" onClick={addMapping}>
                  Add mapping
                </AdminBtn>
              </div>
            </AdminSection>

            <AdminBtn onClick={() => void saveOidc()}>Save OIDC settings</AdminBtn>
          </>
        )}

        {tab === "radio" && (
          <>
            <AdminSection
              title="Stage & logs"
              description="Limits for who can be on stage and how many debug log files are kept. Changes apply immediately after save."
            >
              <AdminField
                label="Max stage users"
                hint={`Maximum simultaneous broadcaster WebSocket connections (1–${MAX_STAGE_USERS}, default ${DEFAULT_LIMITS.maxStageUsers}). Applies live to new connection checks.`}
              >
                <AdminInput
                  type="number"
                  min={1}
                  max={MAX_STAGE_USERS}
                  value={limits.maxStageUsers}
                  onChange={(e) =>
                    setLimits({
                      ...limits,
                      maxStageUsers: Math.min(
                        MAX_STAGE_USERS,
                        Math.max(1, Number(e.target.value) || DEFAULT_LIMITS.maxStageUsers),
                      ),
                    })
                  }
                />
              </AdminField>
              <AdminField
                label="Debug log retention"
                hint="How many stream-debug log files to keep in the logs folder. Old files are pruned on save."
              >
                <AdminInput
                  type="number"
                  min={1}
                  max={100}
                  value={limits.logRetentionCount}
                  onChange={(e) =>
                    setLimits({
                      ...limits,
                      logRetentionCount: Number(e.target.value) || DEFAULT_LIMITS.logRetentionCount,
                    })
                  }
                />
              </AdminField>
            </AdminSection>

            <AdminSection
              title="PCM pipeline"
              description="Buffering for broadcaster audio rails. PCM min/max apply live to the audio worker; no restart needed."
            >
              <AdminField label="PCM max buffer (ms)" hint="Upper rail buffer before trimming (500–30000). Live.">
                <AdminInput
                  type="number"
                  min={500}
                  max={30000}
                  step={100}
                  value={audio.pcmMaxBufferMs}
                  onChange={(e) =>
                    setAudio({ ...audio, pcmMaxBufferMs: Number(e.target.value) || DEFAULT_AUDIO.pcmMaxBufferMs })
                  }
                />
              </AdminField>
              <AdminField label="PCM min buffer (ms)" hint="Minimum adaptive buffer target (100–max). Live.">
                <AdminInput
                  type="number"
                  min={100}
                  max={audio.pcmMaxBufferMs}
                  step={100}
                  value={audio.pcmMinBufferMs}
                  onChange={(e) =>
                    setAudio({ ...audio, pcmMinBufferMs: Number(e.target.value) || DEFAULT_AUDIO.pcmMinBufferMs })
                  }
                />
              </AdminField>
              <AdminField
                label="Silence threshold"
                hint="PCM amplitude below this counts as silence (0.001–0.5). Live where silence detection runs."
              >
                <AdminInput
                  type="number"
                  min={0.001}
                  max={0.5}
                  step={0.001}
                  value={audio.silenceThreshold}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      silenceThreshold: Number(e.target.value) || DEFAULT_AUDIO.silenceThreshold,
                    })
                  }
                />
              </AdminField>
              <AdminField label="Silence debounce chunks" hint="Reserved tuning for silence detection (1–500).">
                <AdminInput
                  type="number"
                  min={1}
                  max={500}
                  value={audio.silenceDebounceChunks}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      silenceDebounceChunks: Number(e.target.value) || DEFAULT_AUDIO.silenceDebounceChunks,
                    })
                  }
                />
              </AdminField>
              <AdminField label="Audio debounce chunks" hint="Reserved tuning for audio resume detection (1–500).">
                <AdminInput
                  type="number"
                  min={1}
                  max={500}
                  value={audio.audioDebounceChunks}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      audioDebounceChunks: Number(e.target.value) || DEFAULT_AUDIO.audioDebounceChunks,
                    })
                  }
                />
              </AdminField>
            </AdminSection>

            <AdminSection
              title="Discord voice buffer"
              description="Pre-roll before Discord playback starts. Applies to the next voice join in relay-bot (reconnect voice to pick up changes on an active session)."
            >
              <AdminField
                label="Relay join buffer (ms)"
                hint="Preferred: converted to 20 ms frames (160–10000). Used by relay-bot on /join."
              >
                <AdminInput
                  type="number"
                  min={160}
                  max={10000}
                  step={20}
                  value={audio.discordRelayBufferMs}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      discordRelayBufferMs: Number(e.target.value) || DEFAULT_AUDIO.discordRelayBufferMs,
                    })
                  }
                />
              </AdminField>
              <AdminField
                label="Discord buffer frames"
                hint="Fallback frame count (8–500) when relay buffer ms is unset. Also used by in-process Discord relay paths on new joins."
              >
                <AdminInput
                  type="number"
                  min={8}
                  max={500}
                  value={audio.discordBufferFrames}
                  onChange={(e) =>
                    setAudio({
                      ...audio,
                      discordBufferFrames: Number(e.target.value) || DEFAULT_AUDIO.discordBufferFrames,
                    })
                  }
                />
              </AdminField>
            </AdminSection>

            <AdminBtn disabled={radioBusy} onClick={() => void saveRadio()}>
              Save radio settings
            </AdminBtn>
          </>
        )}

        {tab === "security" && (
          <>
            <AdminSection
              title="Local login 2FA"
              description="Require authenticator-based two-factor authentication for username/password sign-in. SSO and recovery console login are not affected. Admin accounts are prompted at login but may skip setup for now."
            >
              <AdminCheckbox
                checked={localLogin2faRequired}
                onChange={setLocalLogin2faRequired}
                label="Require 2FA for local login"
                hint="When enabled, users with a password must set up 2FA before signing in locally. Admins see the same prompt but can skip and enroll later in Studio. Existing sessions are not revoked — enforcement applies on the next local login."
              />
              <AdminBtn disabled={securityBusy} onClick={() => void saveSecurity()}>
                Save 2FA settings
              </AdminBtn>
            </AdminSection>

            <AdminSection
              title="Login bot protection (Cloudflare Turnstile)"
              description="Optional challenge on the local username/password form. SSO is not affected. Both site key and secret key are required."
            >
              <AdminField
                label="Turnstile site key"
                hint="Public key from Cloudflare Turnstile — shown on the login form."
              >
                <AdminInput
                  className="font-mono text-xs"
                  value={integrations.turnstileSiteKey || ""}
                  onChange={(e) =>
                    setIntegrations({ ...integrations, turnstileSiteKey: e.target.value })
                  }
                  placeholder="0x4AAAAAAA…"
                />
              </AdminField>
              <AdminField
                label="Turnstile secret key"
                hint="Private key used server-side to verify challenges."
              >
                <AdminInput
                  type="password"
                  className="font-mono text-xs"
                  value={integrations.turnstileSecretKey || ""}
                  onChange={(e) =>
                    setIntegrations({ ...integrations, turnstileSecretKey: e.target.value })
                  }
                  placeholder={integrations.turnstileConfigured ? "********" : "Paste secret key"}
                />
              </AdminField>
              <AdminBtn disabled={integrationsBusy} onClick={() => void saveIntegrations()}>
                Save Turnstile keys
              </AdminBtn>
            </AdminSection>

            <ContentPolicyAdminSection flash={flash} onError={setError} />
          </>
        )}

        {tab === "system" && (
          <>
            <AdminSection
              title="Container updates"
              description="Compares this instance to the matching GHCR tag (latest or develop) from the baked-in image channel — not a manual picker, so preview and stable never cross-alert."
            >
              <div className="rounded-lg border border-gray-700/80 bg-gray-900/40 px-3 py-2 text-xs text-gray-300 font-mono mb-3">
                {buildInfo ? (
                  <>
                    <div>Build ID: {buildInfo.buildId}</div>
                    <div>Channel: {buildInfo.channel}</div>
                    <div>
                      Tracking GHCR tag:{" "}
                      {containerUpdatesDisabled ? "— (not available in local dev)" : `${resolvedTrackTag} (auto)`}
                    </div>
                    <div>Revision: {buildInfo.revision.slice(0, 12)}</div>
                    {buildInfo.builtAt ? <div>Built: {new Date(buildInfo.builtAt).toLocaleString()}</div> : null}
                    <div>Runtime: {buildInfo.runtime}</div>
                  </>
                ) : (
                  <div>Build info unavailable</div>
                )}
              </div>
              <AdminCheckbox
                checked={updatesNotify}
                onChange={setUpdatesNotify}
                disabled={containerUpdatesDisabled}
                label="Notify when a newer build is available"
                hint={
                  containerUpdatesDisabled
                    ? "Only available when running a published Docker image from GHCR (not npm run dev)."
                    : `Shows a banner when a newer image is published on :${resolvedTrackTag} with a different revision than this instance.`
                }
              />
              {containerUpdatesDisabled ? (
                <p className="text-xs text-gray-500 mt-2">
                  Local development runtime — container update checks are disabled.
                </p>
              ) : containerUpdates?.error ? (
                <p className="text-xs text-amber-300/90 mt-2">Last check: {containerUpdates.error}</p>
              ) : containerUpdates?.note ? (
                <p className="text-xs text-gray-400 mt-2">{containerUpdates.note}</p>
              ) : containerUpdates && !containerUpdates.updateAvailable ? (
                <p className="text-xs text-green-400/90 mt-2">
                  Up to date for :{containerUpdates.current.trackTag || resolvedTrackTag} (checked{" "}
                  {new Date(containerUpdates.checkedAt).toLocaleTimeString()}).
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 mt-3">
                <AdminBtn
                  disabled={updatesBusy || containerUpdatesDisabled}
                  onClick={() => void saveUpdates()}
                >
                  Save update settings
                </AdminBtn>
                <AdminBtn
                  variant="secondary"
                  disabled={updatesBusy || containerUpdatesDisabled}
                  onClick={() => void refreshContainerUpdates()}
                >
                  Check now
                </AdminBtn>
              </div>
            </AdminSection>

            <AdminSection
              title="DJ leveling"
              description="XP is verified on the server. Use these controls if guests are farming hearts or approvals for a registered account."
            >
              <AdminCheckbox
                checked={guestActionsGrantXp}
                onChange={setGuestActionsGrantXp}
                label="Allow guest hearts and request approvals to grant XP"
                hint="When off, actions from guest sessions never award XP. Per-user blocks still apply when this is on."
              />
              <AdminCheckbox
                checked={blockGuestXpMatchingStageIp}
                onChange={setBlockGuestXpMatchingStageIp}
                label="Block guest XP when IP matches someone on stage"
                hint="When a guest session shares an IP with a broadcaster currently on stage, hearts and approvals from that guest won't grant XP. Helps prevent self-farming from the same machine."
              />
              <AdminBtn disabled={levelingBusy} onClick={() => void saveLeveling()}>
                Save leveling settings
              </AdminBtn>
            </AdminSection>

            <AdminSection
              title="Integrations"
              description="API keys for song search/requests (Last.fm) and chat GIFs (Giphy). Keys are stored in the database, not in config files."
            >
              <AdminField
                label="Last.fm API key"
                hint="Required for Search & Request. Get one at last.fm/api/account/create."
              >
                <AdminInput
                  type="password"
                  className="font-mono text-xs"
                  value={integrations.lastfmApiKey}
                  onChange={(e) => setIntegrations({ ...integrations, lastfmApiKey: e.target.value })}
                  placeholder={integrations.lastfmConfigured ? "********" : "Paste Last.fm API key"}
                />
              </AdminField>
              <AdminField label="Last.fm default user" hint="Fallback scrobbler username for now-playing metadata.">
                <AdminInput
                  value={integrations.lastfmDefaultUser}
                  onChange={(e) => setIntegrations({ ...integrations, lastfmDefaultUser: e.target.value })}
                  placeholder="Last.fm username"
                />
              </AdminField>
              <AdminField
                label="Giphy API key"
                hint="Required for chat GIF picker. Get one at developers.giphy.com/dashboard."
              >
                <AdminInput
                  type="password"
                  className="font-mono text-xs"
                  value={integrations.giphyApiKey}
                  onChange={(e) => setIntegrations({ ...integrations, giphyApiKey: e.target.value })}
                  placeholder={integrations.giphyConfigured ? "********" : "Paste Giphy API key"}
                />
              </AdminField>
              <AdminBtn disabled={integrationsBusy} onClick={() => void saveIntegrations()}>
                Save integration keys
              </AdminBtn>
            </AdminSection>

            <AdminSection title="Branding" description="Station name and visualizer logo. User profile images are separate — broadcasters set those in Broadcaster Studio for stage and chat only.">
              <AdminField label="Radio display name">
                <div className={adminInlineRowClass}>
                  <AdminInput
                    className="mt-0 flex-1"
                    value={branding.radioDisplayName}
                    onChange={(e) => setBranding({ ...branding, radioDisplayName: e.target.value })}
                  />
                  <AdminBtn className="w-full sm:w-auto shrink-0" disabled={brandingBusy} onClick={() => void saveBrandingName()}>
                    Save branding
                  </AdminBtn>
                </div>
              </AdminField>

              <AdminCheckbox
                checked={branding.branded2fa === true}
                onChange={(checked) => setBranding({ ...branding, branded2fa: checked })}
                label="Branded 2FA in authenticator apps"
                hint={`When on, new 2FA entries show your radio display name instead of "CollabFM". Existing entries in users' apps keep their old label until re-enrolled.`}
              />

              <AdminCheckbox
                checked={branding.hideDeveloperAboutMessage === true}
                onChange={(checked) =>
                  setBranding({ ...branding, hideDeveloperAboutMessage: checked })
                }
                label={
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden>😢</span>
                    Hide developer message & coffee button in About
                  </span>
                }
                hint="Hides the original developer's thank-you note and the Buy me a coffee button in the About dialog. Totally fair if you can't stand looking at it — I get it, and I don't like ads either. That's why this option exists. I'd appreciate something in return even if it's just a kind word on GitHub."
              />

              <AdminField label="Visualizer logo" hint="Drag and drop an image, or click to choose. Resets to the default station logo.">
                <input
                  ref={visualizerInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void uploadVisualizer(e.target.files?.[0] ?? null)}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => visualizerInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") visualizerInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setVisualizerDragOver(true); }}
                  onDragLeave={() => setVisualizerDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setVisualizerDragOver(false);
                    void uploadVisualizer(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`mt-2 rounded-2xl border-2 border-dashed p-6 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                    visualizerDragOver
                      ? "border-radio-accent bg-radio-accent/10"
                      : "border-gray-600 bg-gray-800/50 hover:border-gray-500"
                  }`}
                >
                  <img
                    src={visualizerPreview}
                    alt="Visualizer logo preview"
                    onError={imageFallbackHandler(proceduralStationLogo(branding.radioDisplayName, 128))}
                    className="w-32 h-32 rounded-2xl object-cover border border-gray-600 shadow-lg"
                  />
                  <p className="text-sm text-gray-400 text-center">
                    {branding.hasCustomVisualizer
                      ? "Custom logo active — drop a new image to replace it"
                      : "Using default logo — drop an image here to customize"}
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPEG, WebP, or GIF · max 4 MB</p>
                </div>
              </AdminField>

              <AdminBtn variant="secondary" disabled={brandingBusy} onClick={() => void resetBranding()}>
                Reset visualizer to default
              </AdminBtn>
            </AdminSection>

            <AdminSection title="System">
              <ul className="space-y-2 text-gray-400">
                <li>Database: SQLite at storage/radio.db</li>
                <li>Docker stack: radio server + voice bot</li>
                <li>Stream hub is built into the radio server</li>
              </ul>
            </AdminSection>
          </>
        )}
      </div>
    </div>
  );
}
