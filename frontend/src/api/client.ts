import { apiUrl } from "../config";
import type {
  AdminUser,
  AuthStatus,
  BrandingSettings,
  BroadcastStatus,
  ChatMessage,
  ChatTyper,
  GuestContext,
  GifResult,
  HostMember,
  IntegrationsSettings,
  LimitsSettings,
  AudioPipelineSettings,
  OidcConfig,
  RelayConnectionsResponse,
  SongRequest,
  SongRequestActionResponse,
  WhitelistEntry,
  VoiceBotConfig,
  VoiceBotAdminResponse,
  VoiceBotRuntime,
  ShareLink,
  BroadcastDevice,
  PartyEffect,
  PartyEffectType,
  ProfilePartyEffectType,
  BroadcasterProfile,
  StreamInfo,
  NowPlayingSocial,
  PresenceRoster,
  LevelingSettings,
  BroadcastSettings,
  BroadcastSessionLog,
  ContentPolicy,
} from "../types/api";

const API = apiUrl("/api");

function shareTokenQuery(
  shareToken?: string,
  guestId?: string,
  guestSession?: string,
): string {
  const params = new URLSearchParams();
  if (shareToken) params.set("shareToken", shareToken);
  if (guestId) params.set("guestId", guestId);
  if (guestSession) params.set("guestSession", guestSession);
  const q = params.toString();
  return q ? `?${q}` : "";
}

function guestPayload(guest: GuestContext, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    shareToken: guest.shareToken,
    guestId: guest.guestId,
    guestName: guest.guestName,
    guestSession: guest.guestSession,
    avatarVariant: guest.avatarVariant,
    coverIcon: guest.coverIcon,
  };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  setupStatus: () =>
    json<{
      complete: boolean;
      bootstrapRequired?: boolean;
      unlocked?: boolean;
      bootstrapUsername?: string;
    }>(`${API}/setup/status`),

  setupUnlock: (body: { username: string; bootstrapToken: string }) =>
    json<{ ok: boolean; unlocked: boolean }>(`${API}/setup/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  completeSetup: (body: {
    username: string;
    password: string;
    publicBaseUrl?: string;
    allowedOrigins?: string[];
  }) =>
    json<{ ok: boolean }>(`${API}/setup/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  authMethods: () =>
    json<{
      local: boolean;
      oidc: boolean;
      turnstileSiteKey?: string | null;
      ssoNickname?: string | null;
    }>(apiUrl("/auth/methods")),

  localLogin: (username: string, password: string, turnstileToken?: string) =>
    json<AuthStatus>(apiUrl("/auth/local/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    }),

  authStatus: () => json<AuthStatus>(apiUrl("/auth/status")),

  broadcastStatus: (shareToken?: string) =>
    json<BroadcastStatus>(apiUrl(`/api/broadcast-status${shareTokenQuery(shareToken)}`)),

  metadataRaw: (shareToken?: string) =>
    json<unknown>(apiUrl(`/api/metadata${shareTokenQuery(shareToken)}`)),

  statusJson: (shareToken?: string) =>
    json<unknown>(apiUrl(`/api/status-json.xsl${shareTokenQuery(shareToken)}`)),

  streamUrl: (token?: string) => {
    const live = `_live=${Date.now()}`;
    if (token) {
      return apiUrl(`/api/stream?token=${encodeURIComponent(token)}&${live}`);
    }
    return apiUrl(`/api/stream?${live}`);
  },

  sendMediaControl: (targetUserId: string, action: "playPause" | "previous" | "next") =>
    json<{ success: boolean; message?: string }>(`${API}/media-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, action }),
    }),

  sendGuestMediaControl: (
    targetUserId: string,
    action: "playPause" | "previous" | "next",
    guest: GuestContext,
  ) =>
    json<{ success: boolean; message?: string }>(`${API}/media-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { targetUserId, action })),
    }),

  listenInfo: (token: string, guestId?: string) => {
    const base = `${API}/listen/${encodeURIComponent(token)}`;
    const qs = guestId ? `?${new URLSearchParams({ guestId })}` : "";
    return json<{
      ok: boolean;
      linkKind: string;
      guestMode?: "listener" | "guest_broadcaster";
      label: string | null;
      expiresAt: number | null;
      guestSession?: string | null;
      guestDisplayName?: string | null;
      guestProfile?: {
        displayName: string;
        avatarVariant: number;
        coverIcon: number;
      } | null;
    }>(`${base}${qs}`);
  },

  branding: () => json<BrandingSettings>(`${API}/branding`),

  userShareLinks: () =>
    json<{
      links: ShareLink[];
      ttlOptions: string[];
      listenerTtlOptions?: string[];
      guestBroadcasterTtlOptions?: string[];
      maxLinks: number;
    }>(`${API}/share-links`),

  createUserShareLink: (body: {
    label?: string;
    guestMode: "listener" | "guest_broadcaster";
    ttl: string;
  }) =>
    json<{ link: ShareLink }>(`${API}/share-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  revokeUserShareLink: (id: number) =>
    json<{ ok: boolean }>(`${API}/share-links/${id}`, { method: "DELETE" }),

  sendGuestMessage: (content: string, guest: GuestContext) =>
    json<{ success: boolean }>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { content })),
    }),

  requestGuestSong: (title: string, artist: string, guest: GuestContext, url?: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "request", title, artist, url })),
    }),

  voteGuestSong: (title: string, artist: string, vote: number, guest: GuestContext) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "vote", title, artist, vote })),
    }),

  approveGuestRequest: (songKey: string, guest: GuestContext) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "approve-request", songKey })),
    }),

  denyGuestRequest: (songKey: string, guest: GuestContext) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "deny-request", songKey })),
    }),

  markGuestRequestPlaying: (songKey: string, guest: GuestContext) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "mark-request-playing", songKey })),
    }),

  markGuestRequestPlayed: (songKey: string, guest: GuestContext) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { action: "mark-request-played", songKey })),
    }),

  relayConnections: (shareToken?: string) =>
    json<RelayConnectionsResponse>(`${API}/relay-connections${shareTokenQuery(shareToken)}`),

  hostMembers: (shareToken?: string) =>
    json<{ hosts: HostMember[] }>(`${API}/host-members${shareTokenQuery(shareToken)}`),

  publicUserProfile: (userId: string, shareToken?: string) =>
    json<{ profile: BroadcasterProfile & { roleColor?: string | null } }>(
      `${API}/users/public-profile?userId=${encodeURIComponent(userId)}${shareToken ? `&shareToken=${encodeURIComponent(shareToken)}` : ""}`,
    ),

  switchBroadcaster: (wsId: string) =>
    json<{ ok: boolean }>(`${API}/switch?wsId=${encodeURIComponent(wsId)}`, {
      method: "POST",
    }),

  messages: (shareToken?: string, guestId?: string) =>
    json<ChatMessage[]>(`${API}/messages${shareTokenQuery(shareToken, guestId)}`),

  chatUnread: (
    shareToken?: string,
    guestId?: string,
    guestSession?: string,
  ) =>
    json<{ unreadCount: number }>(
      `${API}/chat/unread${shareTokenQuery(shareToken, guestId, guestSession)}`,
    ),

  markChatRead: (guest?: GuestContext | null) =>
    json<{ ok: boolean; unreadCount: number; lastReadAt: number }>(
      `${API}/chat/read${guest?.shareToken ? shareTokenQuery(guest.shareToken) : ""}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guest?.guestSession ? guestPayload(guest) : {}),
      },
    ),

  chatTypers: (shareToken?: string) =>
    json<{ typers: ChatTyper[] }>(`${API}/chat/typing${shareTokenQuery(shareToken)}`),

  reportChatTyping: (
    state: { active?: boolean; typing?: boolean; leave?: boolean },
    guest?: GuestContext | null,
  ) =>
    json<{ ok: boolean }>(`${API}/chat/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guest ? guestPayload(guest, state) : state),
    }),

  sendMessage: (content: string) =>
    json<ChatMessage>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),

  sendGifMessage: (gifUrl: string) =>
    json<{ success: boolean }>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "gif", gifUrl }),
    }),

  sendGuestGifMessage: (gifUrl: string, guest: GuestContext) =>
    json<{ success: boolean }>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest, { type: "gif", gifUrl })),
    }),

  giphyTrending: (offset = 0, shareToken?: string) =>
    json<{ results: GifResult[] }>(
      `${API}/giphy/trending?${new URLSearchParams({
        offset: String(offset),
        ...(shareToken ? { shareToken } : {}),
      })}`,
    ),

  giphySearch: (q: string, offset = 0, shareToken?: string) =>
    json<{ results: GifResult[] }>(
      `${API}/giphy/search?${new URLSearchParams({
        q,
        offset: String(offset),
        ...(shareToken ? { shareToken } : {}),
      })}`,
    ),

  clearMessages: () =>
    json<{ ok: boolean }>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    }),

  deleteMessage: (targetId: string) =>
    json<{ success: boolean; deleted?: boolean }>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", targetId }),
    }),

  requests: (shareToken?: string) =>
    json<Record<string, SongRequest>>(`${API}/requests${shareTokenQuery(shareToken)}`),

  searchSongs: (track: string, artist?: string, page = 1, shareToken?: string) => {
    const params = new URLSearchParams({
      track,
      page: String(page),
      ...(artist ? { artist } : {}),
    });
    if (shareToken) params.set("shareToken", shareToken);
    return json<{ results: unknown[]; total: number; page: number }>(
      `${API}/search?${params}`,
    );
  },

  requestSong: (title: string, artist: string, url?: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", title, artist, url }),
    }),

  voteSong: (title: string, artist: string, vote: number) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vote", title, artist, vote }),
    }),

  approveRequest: (songKey: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve-request", songKey }),
    }),

  denyRequest: (songKey: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deny-request", songKey }),
    }),

  markRequestPlaying: (songKey: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-request-playing", songKey }),
    }),

  markRequestPlayed: (songKey: string) =>
    json<SongRequestActionResponse>(`${API}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-request-played", songKey }),
    }),

  resolveUsers: (ids: string[]) =>
    json<Record<string, { displayName: string; username: string | null; avatar: string | null; roleColor: string | null }>>(
      `${apiUrl("/api/users")}?ids=${encodeURIComponent(ids.join(","))}`,
    ),

  joinDebugStatus: () => json<{ enabled: boolean }>(apiUrl("/api/join-debug")),

  setJoinDebug: (enabled: boolean) =>
    json<{ enabled: boolean }>(apiUrl("/api/join-debug"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),

  adminUsers: () => json<{ users: AdminUser[] }>(`${API}/admin/users`),

  createAdminUser: (body: { username: string; password: string; role: string }) =>
    json(`${API}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateAdminUser: (id: number, body: Record<string, unknown>) =>
    json(`${API}/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  deleteAdminUser: (id: number) =>
    json<{ ok: boolean }>(`${API}/admin/users/${id}`, { method: "DELETE" }),

  resetAdminUserXp: (id: number) =>
    json<{ ok: boolean; user: AdminUser }>(`${API}/admin/users/${id}/reset-xp`, { method: "POST" }),

  nowPlayingSocial: (guest?: Pick<GuestContext, "shareToken" | "guestId" | "guestSession"> | null) => {
    const params = new URLSearchParams();
    if (guest?.shareToken) params.set("shareToken", guest.shareToken);
    if (guest?.guestId) params.set("guestId", guest.guestId);
    if (guest?.guestSession) params.set("guestSession", guest.guestSession);
    const qs = params.toString();
    return json<NowPlayingSocial>(`${API}/now-playing/social${qs ? `?${qs}` : ""}`);
  },

  heartNowPlaying: (body?: {
    shareToken?: string;
    guestId?: string;
    guestSession?: string;
  }) =>
    json<NowPlayingSocial & { ok: boolean; awarded?: boolean; levelUpEffect?: PartyEffect | null }>(
      `${API}/now-playing/heart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      },
    ),

  broadcastSessionLog: (guest?: Pick<GuestContext, "shareToken" | "guestId" | "guestSession"> | null) => {
    const params = new URLSearchParams();
    if (guest?.shareToken) params.set("shareToken", guest.shareToken);
    if (guest?.guestId) params.set("guestId", guest.guestId);
    if (guest?.guestSession) params.set("guestSession", guest.guestSession);
    const qs = params.toString();
    return json<BroadcastSessionLog>(`${API}/broadcast/session/log${qs ? `?${qs}` : ""}`);
  },

  heartSessionTrack: (
    trackSessionId: string,
    guest?: Pick<GuestContext, "shareToken" | "guestId" | "guestSession"> | null,
  ) =>
    json<BroadcastSessionLog & { ok: boolean; duplicate?: boolean; awarded?: boolean; levelUpEffect?: PartyEffect | null }>(
      `${API}/broadcast/session/heart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          guest?.guestSession
            ? {
                trackSessionId,
                shareToken: guest.shareToken,
                guestId: guest.guestId,
                guestSession: guest.guestSession,
              }
            : { trackSessionId },
        ),
      },
    ),

  adminOidc: () =>
    json<{ oidc: OidcConfig; mappings: Array<{ oidc_group: string; role: string }>; oidcOnlyUserCount: number }>(
      `${API}/admin/oidc`,
    ),

  saveAdminOidc: (body: {
    oidc: OidcConfig;
    mappings: Array<{ oidc_group: string; role: string }>;
  }) =>
    json(`${API}/admin/oidc`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  adminWhitelist: () => json<{ entries: WhitelistEntry[] }>(`${API}/admin/discord/whitelist`),

  addWhitelistEntry: (body: { guild_id: string; label?: string }) =>
    json(`${API}/admin/discord/whitelist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  removeWhitelistEntry: (guildId: string) =>
    json(`${API}/admin/discord/whitelist/${encodeURIComponent(guildId)}`, { method: "DELETE" }),

  adminVoiceBot: () => json<VoiceBotAdminResponse>(`${API}/admin/voice-bot`),

  saveAdminVoiceBot: (body: Partial<VoiceBotConfig>) =>
    json<{ ok: boolean; voiceBot?: VoiceBotAdminResponse }>(`${API}/admin/voice-bot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  verifyAdminVoiceBot: (body?: Partial<VoiceBotConfig>) =>
    json<{
      ok: boolean;
      error?: string;
      botUsername?: string;
      voiceBot?: VoiceBotAdminResponse;
      runtime?: VoiceBotRuntime;
      autoStart?: { ok: boolean; skipped?: boolean; alreadyRunning?: boolean; reason?: string };
    }>(`${API}/admin/voice-bot/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),

  startAdminVoiceBot: () =>
    json<{ ok: boolean; error?: string; external?: boolean; runtime?: VoiceBotAdminResponse["runtime"] }>(
      `${API}/admin/voice-bot/start`,
      { method: "POST" },
    ),

  stopAdminVoiceBot: () =>
    json<{ ok: boolean; error?: string; external?: boolean; runtime?: VoiceBotAdminResponse["runtime"] }>(
      `${API}/admin/voice-bot/stop`,
      { method: "POST" },
    ),

  adminStream: () => json<StreamInfo>(`${API}/admin/stream`),

  adminContentPolicy: () =>
    json<{ policy: ContentPolicy }>(`${API}/admin/content-policy`),

  saveAdminContentPolicy: (policy: ContentPolicy) =>
    json<{ ok: boolean; policy: ContentPolicy }>(
      `${API}/admin/content-policy`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      },
    ),

  resetAdminContentPolicy: () =>
    json<{ ok: boolean; policy: ContentPolicy }>(
      `${API}/admin/content-policy`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetDefaults: true }),
      },
    ),

  adminShareLinks: () =>
    json<{ links: ShareLink[]; ttlOptions: string[] }>(`${API}/admin/share-links`),

  createShareLink: (body: { label?: string; linkKind: "ui" | "stream"; ttl: string }) =>
    json<{ link: ShareLink }>(`${API}/admin/share-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  revokeShareLink: (id: number) =>
    json<{ ok: boolean }>(`${API}/admin/share-links/${id}`, { method: "DELETE" }),

  adminSettings: () =>
    json<{
      publicBaseUrl: string;
      branding: BrandingSettings;
      integrations: IntegrationsSettings;
      leveling?: LevelingSettings;
      broadcast?: BroadcastSettings;
      limits?: LimitsSettings;
      audio?: AudioPipelineSettings;
    }>(`${API}/admin/settings`),

  saveAdminSettings: (body: {
    branding?: Pick<BrandingSettings, "radioDisplayName" | "hideDeveloperAboutMessage">;
    resetBranding?: boolean;
    integrations?: IntegrationsSettings;
    leveling?: LevelingSettings;
    broadcast?: BroadcastSettings;
    limits?: LimitsSettings;
    audio?: AudioPipelineSettings;
  }) =>
    json<{
      ok: boolean;
      branding: BrandingSettings;
      integrations: IntegrationsSettings;
      leveling?: LevelingSettings;
      broadcast?: BroadcastSettings;
      limits?: LimitsSettings;
      audio?: AudioPipelineSettings;
    }>(
      `${API}/admin/settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),

  uploadAdminVisualizer: (body: { data: string; mimeType: string }) =>
    json<{ ok: boolean; branding: BrandingSettings }>(`${API}/admin/branding/visualizer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  confirmExtensionPair: (body: { userCode: string; label?: string }) =>
    json<{ ok: boolean; deviceId?: string; label?: string }>(`${API}/extension/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  extensionDevices: () =>
    json<{ devices: BroadcastDevice[] }>(`${API}/extension/devices`),

  revokeExtensionDevice: (id: number) =>
    json<{ ok: boolean }>(`${API}/extension/devices/${id}`, { method: "DELETE" }),

  updateExtensionDevice: (id: number, body: { label: string }) =>
    json<{ ok: boolean; label: string }>(`${API}/extension/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  broadcasterProfile: () => json<{ profile: BroadcasterProfile }>(`${API}/broadcaster/profile`),

  broadcasterWsToken: () =>
    json<{ token: string; expiresInMs: number; label: string }>(`${API}/broadcaster/ws-token`, {
      method: "POST",
    }),

  postBroadcastMetadata: (body: {
    title: string;
    artist: string;
    albumArt?: string;
    broadcasterName?: string;
    shareToken?: string;
    guestId?: string;
    guestSession?: string;
  }) =>
    json<{ message?: string }>(`${API}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  guestBroadcasterWsToken: (body: {
    shareToken: string;
    guestId: string;
    guestName: string;
    guestSession: string;
  }) =>
    json<{ token: string; expiresInMs: number; label: string }>(`${API}/guest-broadcast/ws-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateGuestDisplayName: (guest: GuestContext) =>
    json<{
      ok: boolean;
      displayName: string;
      avatarVariant?: number;
      coverIcon?: number;
    }>(`${API}/guest-broadcast/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest)),
    }),

  updateGuestProfile: (guest: GuestContext) =>
    json<{
      ok: boolean;
      displayName: string;
      avatarVariant: number;
      coverIcon: number;
    }>(`${API}/guest-broadcast/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guestPayload(guest)),
    }),

  downloadExtensionZip: async () => {
    const res = await fetch(apiUrl("/api/extension/download"), { credentials: "include" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Download failed: ${res.status}`);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error("Empty extension archive");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "collabfm-broadcaster-extension.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  },

  downloadExtensionZipPublic: async () => {
    const res = await fetch(apiUrl("/api/extension/public/download"));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Download failed: ${res.status}`);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error("Empty extension archive");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "collabfm-broadcaster-extension.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  },

  updateBroadcasterProfile: (body: { displayName: string; bio?: string | null; genres?: string[] }) =>
    json<{ profile: BroadcasterProfile }>(`${API}/broadcaster/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  uploadBroadcasterAvatar: (body: { data: string; mimeType: string }) =>
    json<{ profile: BroadcasterProfile }>(`${API}/broadcaster/profile/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  partyEffects: async (since = 0, shareToken?: string) => {
    const res = await fetch(
      `${API}/party-effects?since=${since}${shareToken ? `&shareToken=${encodeURIComponent(shareToken)}` : ""}`,
      { credentials: "include" },
    );
    if (res.status === 429) {
      let retryAfterMs = 5000;
      try {
        const body = (await res.json()) as { retryAfterMs?: number };
        if (typeof body.retryAfterMs === "number" && body.retryAfterMs > 0) {
          retryAfterMs = body.retryAfterMs;
        }
      } catch {
        /* ignore */
      }
      return { effects: [] as PartyEffect[], rateLimited: true as const, retryAfterMs };
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { effects: PartyEffect[] };
    return { effects: data.effects || [], rateLimited: false as const, retryAfterMs: 0 };
  },

  liveEventsUrl: (since = 0, shareToken?: string) => {
    const params = new URLSearchParams({ since: String(since) });
    if (shareToken) params.set("shareToken", shareToken);
    return `${API}/live/events?${params.toString()}`;
  },

  presenceRoster: (shareToken?: string) => {
    const qs = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : "";
    return json<PresenceRoster>(`${API}/presence/roster${qs}`);
  },

  presenceHeartbeat: (body: {
    clientId: string;
    listening: boolean;
    leave?: boolean;
    shareToken?: string;
    guestId?: string;
    guestSession?: string;
    guestName?: string;
    avatarVariant?: number;
    coverIcon?: number;
  }) =>
    json<{ ok: boolean }>(`${API}/presence/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  presenceHeartbeatBeacon: (body: {
    clientId: string;
    listening: boolean;
    leave?: boolean;
    shareToken?: string;
    guestId?: string;
    guestSession?: string;
    guestName?: string;
    avatarVariant?: number;
    coverIcon?: number;
  }) => {
    const payload = JSON.stringify(body);
    const url = `${API}/presence/heartbeat`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      return navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    }
    void fetch(url, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {});
    return true;
  },

  triggerPartyEffect: async (type: PartyEffectType, x: number, y: number, guest?: GuestContext) => {
    const res = await fetch(`${API}/party-effects`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guest ? guestPayload(guest, { type, x, y }) : { type, x, y }),
    });
    if (res.status === 429) {
      return { ok: false as const, rateLimited: true as const };
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { ok: boolean; effect: PartyEffect };
    return { ok: true as const, rateLimited: false as const, effect: data.effect };
  },

  triggerProfilePartyEffect: async (
    type: ProfilePartyEffectType,
    x: number,
    y: number,
    target: { userId: string; avatarVariant?: number; coverIcon?: number },
    guest?: GuestContext,
  ) => {
    const body = {
      type,
      x,
      y,
      targetUserId: target.userId,
      targetAvatarVariant: target.avatarVariant ?? 0,
      targetCoverIcon: target.coverIcon ?? 0,
    };
    const res = await fetch(`${API}/party-effects`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guest ? guestPayload(guest, body) : body),
    });
    if (res.status === 429) {
      return { ok: false as const, rateLimited: true as const };
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { ok: boolean; effect: PartyEffect };
    return { ok: true as const, rateLimited: false as const, effect: data.effect };
  },
};
