export interface RolePermissions {
  canBroadcast: boolean;
  canPromoteUsers: boolean;
  canPromoteWhenInactive: boolean;
  canClearMessages: boolean;
  canDeleteMessages: boolean;
  canToggleJoinDebug: boolean;
  canApproveRequests: boolean;
  canDenyRequests: boolean;
  canCreateShareLinks?: boolean;
}

export interface RoleInfo {
  level: number;
  roleType: string;
  permissions: RolePermissions;
  roleColor: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  avatar: string | null;
  authSource?: string;
  hasPassword?: boolean;
}

export interface LevelInfo {
  level: number;
  experiencePoints: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
}

export interface BroadcasterProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string | null;
  genres?: string[];
  level?: LevelInfo | null;
}

export interface AccountSecurityStatus {
  hybridEnabled: boolean;
  authSource: string;
  hasPassword: boolean;
  canSetPassword: boolean;
  canResetPassword: boolean;
  emailKnown: boolean;
  needsOidcVerification: boolean;
  oidcVerifyUrl: string | null;
  ssoNickname: string | null;
  canManageTotp?: boolean;
  totpEnabled?: boolean;
  localLogin2faRequired?: boolean;
  canDisableTotp?: boolean;
  totpExempt?: boolean;
}

export interface SecuritySettings {
  localLogin2faRequired: boolean;
}

export interface LocalLoginResult {
  authenticated?: boolean;
  requires2fa?: boolean;
  requires2faSetup?: boolean;
  optional2faSetup?: boolean;
  pending2fa?: "verify" | "setup" | "setup_optional";
  user?: { username: string; role: string };
  permissions?: Record<string, boolean>;
  backupCodes?: string[];
  ok?: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  pending2fa?: "verify" | "setup" | "setup_optional";
  canSkip2faSetup?: boolean;
  /** How this browser session was established */
  sessionLoginMethod?: "local" | "oidc";
  /** Set when sessionLoginMethod is oidc */
  ssoNickname?: string | null;
  isHost?: boolean;
  canBroadcast?: boolean;
  roleInfo?: RoleInfo;
  user?: AuthUser;
  oidcAvailable?: boolean;
  hybridUsersEnabled?: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  nickname?: string | null;
  displayName?: string;
  avatar?: string | null;
  bio?: string | null;
  genres?: string[];
  roleColor?: string | null;
  auth_source: string;
  role: string;
  enabled: number;
  has_password?: boolean;
  totp_enabled?: boolean;
  created_at?: string;
  last_login?: string | null;
  last_login_ip?: string | null;
  experience_points?: number;
  block_guest_action_xp?: boolean;
  level?: LevelInfo | null;
}

export interface LevelingSettings {
  guestActionsGrantXp: boolean;
  blockGuestXpMatchingStageIp: boolean;
}

export interface ContainerUpdateSettings {
  notifyOnBuildAvailable: boolean;
  /** Resolved from baked image channel — not user-configurable */
  trackTag: "latest" | "develop";
}

/** Save payload — trackTag is derived server-side from baked build info */
export type ContainerUpdateSettingsInput = Pick<
  ContainerUpdateSettings,
  "notifyOnBuildAvailable"
>;

export interface BuildInfo {
  imageRepository: string;
  githubRepository: string;
  channel: string;
  revision: string;
  version: string;
  builtAt: string | null;
  buildId: string;
  runtime: string;
}

export interface ContainerUpdateStatus {
  updateAvailable: boolean;
  current: BuildInfo & { trackTag?: string };
  remote: {
    revision: string;
    version: string;
    tag: string;
    branch: string;
    image: string;
  } | null;
  checkedAt: string;
  note?: string;
  error?: string;
}

export interface LimitsSettings {
  maxStageUsers: number;
  logRetentionCount: number;
}

export interface AudioPipelineSettings {
  discordBufferFrames: number;
  discordRelayBufferMs: number;
  pcmMaxBufferMs: number;
  pcmMinBufferMs: number;
  silenceDebounceChunks: number;
  audioDebounceChunks: number;
  silenceThreshold: number;
}

export interface NowPlayingSocial {
  live: boolean;
  hasTrack: boolean;
  title: string;
  artist: string;
  trackSessionId: string | null;
  broadcasterUserId: string | null;
  heartCount: number;
  userHasHearted: boolean;
  isOwnBroadcast?: boolean;
  canHeart: boolean;
  broadcasterLevel?: LevelInfo | null;
}

export interface SessionSongLogEntry {
  trackSessionId: string;
  title: string;
  artist: string;
  albumArt?: string | null;
  url?: string | null;
  sourceSite?: string | null;
  sourceLabel?: string | null;
  licenseType?: string | null;
  licenseUrl?: string | null;
  fromRequest?: boolean;
  requestSongKey?: string | null;
  broadcasterUserId: string | null;
  broadcasterDisplayName: string | null;
  startedAt: number;
  endedAt: number | null;
  isCurrent: boolean;
  isOwnBroadcast?: boolean;
  heartCount: number;
  userHasHearted: boolean;
  canHeart: boolean;
}

export interface BroadcastSessionLog {
  active: boolean;
  startTime: string | null;
  songs: SessionSongLogEntry[];
}

export interface PresenceMember {
  userId: string;
  displayName: string;
  avatar: string | null;
  avatarVariant?: number;
  coverIcon?: number;
  roleColor?: string | null;
  roleType?: string;
  level?: number;
  isGuest: boolean;
  listening?: boolean;
  online?: boolean;
  onStage?: boolean;
}

export interface DiscordBotConnection {
  id: string;
  guildId: string | null;
  guildName: string;
  channelId: string | null;
  channelName: string;
  botName: string;
  connectedAt?: number;
  lastSeen?: number;
  stationMode?: "main" | "dj";
  stationRailId?: string | null;
  stationLabel?: string;
}

export interface PresenceRoster {
  stage?: PresenceMember[];
  listening: PresenceMember[];
  online: PresenceMember[];
  botConnections?: DiscordBotConnection[];
  listeningCount: number;
  onlineCount: number;
  totalCount: number;
  stageCount?: number;
  botConnectionCount?: number;
  /** Discord voice bots following main/live (included in listeningCount). */
  mainStationBotCount?: number;
}

export interface BroadcastDevice {
  id: number;
  label: string | null;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ExtensionInstallInfo {
  bundledVersion: string | null;
  webStoreVersion: string | null;
  webStoreUrl: string;
  webStoreError?: string | null;
  versionComparison:
    | "match"
    | "bundled_newer"
    | "store_newer"
    | "bundled_only"
    | "store_only"
    | "unknown";
}

export interface OidcConfig {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
  groupClaim?: string;
  /** Radio login username source: sub (default), preferred_username, name, or email */
  usernameFrom?: "sub" | "preferred_username" | "name" | "email";
  /** Link OIDC login to an existing local account when names match */
  linkByNameMatch?: boolean;
  /** Allow SSO users to optionally set a local password on the same account */
  hybridUsersEnabled?: boolean;
  /** Short name shown on the login SSO button, e.g. "Authentik" */
  providerNickname?: string;
  /** Provider end-session URL — OIDC users are redirected here after logout */
  logoutUrl?: string;
}

export interface WhitelistEntry {
  guild_id: string;
  label: string | null;
  enabled: number;
  created_at?: string;
}

export type ContentPolicyAction = "allow" | "warn" | "deny";
export type ContentPolicyMatch = "source" | "artist" | "metadata_missing";

export interface ContentPolicyRule {
  id: string;
  match: ContentPolicyMatch;
  value: string;
  action: ContentPolicyAction;
  altNames?: string[];
}

export interface ContentPolicy {
  enabled: boolean;
  rules: ContentPolicyRule[];
  metadataMissing: ContentPolicyAction;
  sourceNoMatch: ContentPolicyAction;
  artistNoMatch: ContentPolicyAction;
  defaultAction: ContentPolicyAction;
  licenseMissing: ContentPolicyAction;
  licenseNoMatch: ContentPolicyAction;
  allowedLicenses: string[];
}

export type VoiceBotMessageCleanupTarget = "off" | "sync_embed" | "slash_replies" | "all";
export type VoiceBotMessageCleanupScope = "remembered" | "all_channels";

export interface VoiceBotMessageCleanupSettings {
  targets: VoiceBotMessageCleanupTarget;
  scope: VoiceBotMessageCleanupScope;
}

export interface VoiceBotConfig {
  clientId: string;
  botToken: string;
  botTokenConfigured?: boolean;
  enabled: boolean;
  publicBaseUrl?: string;
  messageCleanup?: VoiceBotMessageCleanupSettings;
  verified?: VoiceBotVerified | null;
}

export interface VoiceBotVerified {
  at: number;
  botId: string;
  botUsername: string;
  applicationId: string;
  applicationName?: string | null;
}

export interface VoiceBotRuntime {
  mode: "managed" | "external";
  running: boolean;
  localProcessRunning: boolean;
  pid: number | null;
  localStartedAt: number | null;
  lastHeartbeat: number | null;
  credentialsConfigured: boolean;
  enabled: boolean;
  verified: VoiceBotVerified | null;
}

export interface VoiceBotAdminResponse {
  voiceBot: VoiceBotConfig;
  runtime: VoiceBotRuntime;
  inviteUrl: string | null;
  note: string;
}

export interface ShareLink {
  id: number;
  token: string;
  label: string | null;
  link_kind: "ui" | "stream";
  guest_mode?: "listener" | "guest_broadcaster";
  expires_at: number | null;
  revoked: number;
  created_at?: string;
  last_used_at?: string | null;
  uiUrl?: string;
  streamUrl?: string;
  expired?: boolean;
  createdBy?: {
    id: number;
    username: string;
    displayName: string | null;
    role: string;
  };
}

export interface StreamInfo {
  listeners: number;
  sessionStreamUrl: string;
  note: string;
}

export interface SongMetadata {
  title: string;
  artist: string;
  albumArt?: string;
  url?: string;
  sourceSite?: string;
  sourceLabel?: string;
  licenseType?: string;
  licenseUrl?: string;
}

export interface BroadcastStatus {
  active: boolean;
  startTime: string | null;
  lastDisconnect: string | null;
  broadcasterUserId: string | null;
  broadcasterDisplayName: string | null;
  title?: string;
  artist?: string;
  listeners?: number;
}

export interface RelayConnection {
  wsId: string;
  userId: string;
  displayName: string;
  avatar?: string | null;
  roleColor?: string | null;
  guestAvatarVariant?: number;
  guestCoverIcon?: number;
  bio?: string | null;
  genres?: string[];
  level?: LevelInfo | null;
  broadcastName: string | null;
  connectedAt: string;
  isActive: boolean;
  capabilities: {
    supportsMediaControls: boolean;
    site: string | null;
  };
}

export interface RelayConnectionsResponse {
  activeWsId: string | null;
  connections: RelayConnection[];
  /** Max stage slots (from admin limits.maxStageUsers). */
  stageLimit?: number;
}

export interface HostMember {
  userId: string;
  displayName: string;
  avatar: string | null;
  roleColor: string | null;
  guestAvatarVariant?: number;
  guestCoverIcon?: number;
  bio?: string | null;
  genres?: string[];
  level?: LevelInfo | null;
}

export type ChatRoleType = "admin" | "broadcaster" | "listener" | "guest";

export type ChatMessageType = "text" | "gif";

export interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

export interface ChatTyper {
  actorId: string;
  displayName: string;
  avatar?: string | null;
  avatarVariant?: number;
  coverIcon?: number;
  roleType?: ChatRoleType | string;
  isGuest?: boolean;
  active?: boolean;
  typing?: boolean;
}

export interface IntegrationsSettings {
  lastfmApiKey: string;
  lastfmDefaultUser: string;
  giphyApiKey: string;
  lastfmConfigured?: boolean;
  giphyConfigured?: boolean;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  turnstileConfigured?: boolean;
}

export interface ChatMessage {
  id: string;
  content: string;
  userId?: string;
  username?: string;
  displayName?: string;
  avatar?: string | null;
  roleType?: ChatRoleType | string;
  roleColor?: string | null;
  isGuest?: boolean;
  isHost?: boolean;
  guestAvatarVariant?: number;
  guestCoverIcon?: number;
  type?: ChatMessageType | string;
  songKey?: string | null;
  requestTitle?: string | null;
  requestArtist?: string | null;
  requestStatus?: string | null;
  requestUrl?: string | null;
  requestVotesUp?: number;
  requestVotesDown?: number;
  requestApprovalPct?: number;
  requestUserVote?: number | null;
  gifUrl?: string;
  timestamp?: number | string;
}

export interface SongRequest {
  title: string;
  artist: string;
  url?: string;
  status?: string;
  votes?: Array<{ userId: string; host: boolean; vote: number }>;
}

export interface SongRequestActionResponse {
  success: boolean;
  messageId?: string;
  songKey?: string;
  title?: string;
  artist?: string;
  status?: string;
  error?: string;
}

export type AppView = "radio" | "chat" | "stage" | "studio";

export interface GuestContext {
  guestId: string;
  guestName: string;
  shareToken: string;
  guestSession: string;
  avatarVariant: number;
  coverIcon: number;
  originalGuestId: string;
}

export interface BrandingSettings {
  radioDisplayName: string;
  visualizerImageUrl: string;
  hasCustomVisualizer?: boolean;
  hideDeveloperAboutMessage?: boolean;
  branded2fa?: boolean;
  features?: {
    songSearch: boolean;
    chatGifs: boolean;
  };
}

export type PartyEffectType =
  | "fireworks"
  | "confetti"
  | "shockwave"
  | "hearts"
  | "lasers"
  | "bubbles"
  | "stars"
  | "notes"
  | "rocket"
  | "comet"
  | "ufo"
  | "meteor"
  | "lightning"
  | "firefly"
  | "satellite"
  | "react_thumbs_up"
  | "react_thumbs_down"
  | "react_love"
  | "react_laugh"
  | "react_fire"
  | "react_clap"
  | "react_wow"
  | "react_devil"
  | "react_wink"
  | "react_jammin"
  | "react_cry"
  | "react_kiss"
  | "react_pet"
  | "react_pet_hearts"
  | "react_profile_party"
  | "react_profile_wave"
  | "react_profile_highfive"
  | "react_profile_rps"
  | "level_up";

export type ProfilePartyEffectType =
  | "react_profile_party"
  | "react_profile_wave"
  | "react_profile_highfive"
  | "react_profile_rps";

export type RpsChoice = "rock" | "paper" | "scissors";

export type ProfileDuelOutcome = "reactor" | "target" | "tie";

export interface PartyEffectProfileDuel {
  reactorChoice: RpsChoice;
  targetChoice: RpsChoice;
  outcome: ProfileDuelOutcome;
}

export interface PartyEffectReactor {
  userId: string;
  avatarUrl?: string | null;
  avatarVariant?: number;
  coverIcon?: number;
}

export interface PartyEffect {
  id: string;
  type: PartyEffectType;
  x: number;
  y: number;
  at: number;
  by?: string;
  reactor?: PartyEffectReactor;
  target?: PartyEffectReactor;
  profileDuel?: PartyEffectProfileDuel;
  petVariant?: number;
  parentId?: string;
  levelUpLevel?: number;
  levelUpUserId?: string;
  levelUpDisplayName?: string | null;
  /** Client-only: positive mount delay so poll batches replay in trigger order. */
  playbackStaggerMs?: number;
}
