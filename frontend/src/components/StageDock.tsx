import { useEffect, useRef, useState } from "react";
import type { AuthStatus, GuestContext, HostMember } from "../types/api";
import { api } from "../api/client";
import { useRelayConnections } from "../hooks/useRelayConnections";
import { usePresenceRoster } from "../hooks/usePresenceRoster";
import { canInteractWithStage, canPromoteDj, canSendMediaControl, isAdminUser } from "../utils/stagePermissions";
import {
  buildStageSlots,
  type StageHostGroup,
} from "../utils/stageHosts";
import { buildDiscordBotCountsByHostUserId } from "../utils/discordBotStage";
import { stageMemberAvatarSrc } from "../utils/avatar";
import { avatarImageFallbackHandler } from "../utils/brandingImage";
import { StageHostMenu } from "./StageHostMenu";
import { ProfilePartyReactionMenu } from "./ProfilePartyReactionMenu";
import { isSelfPartyTarget, partySelfUserId } from "../utils/partySelfUserId";

const DOCK_HEIGHT = 591;
/** Fixed rail width: w-12 avatar + horizontal padding (p-3) + label room. */
const STAGE_DOCK_PANEL_CLASS = "w-[6rem]";

interface StageDockProps {
  hosts: HostMember[];
  loading?: boolean;
  needsAuth?: boolean;
  visible?: boolean;
  broadcasterUserId?: string | null;
  streamActive?: boolean;
  auth: AuthStatus;
  guest?: GuestContext | null;
  /** Guest credentials for party API calls (listeners); stage control uses `guest`. */
  partyGuest?: GuestContext | null;
  /** Share link token for guest listeners (relay/stage read APIs). */
  shareToken?: string;
}

function EmptyStageSlot() {
  return (
    <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-600/80 bg-gray-800/30 shrink-0" aria-hidden="true" />
  );
}

function DiscordBotTuneBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="absolute -top-1.5 -right-1.5 z-50 min-w-[1.25rem] h-5 px-1 rounded-full bg-indigo-400/10 border border-indigo-300/30 text-indigo-200 text-[10px] font-bold leading-none inline-flex items-center justify-center shadow-md pointer-events-none"
      aria-label={`${count} Discord voice ${count === 1 ? "connection" : "connections"} tuned in`}
      title={`${count} Discord ${count === 1 ? "server" : "servers"} tuned in`}
    >
      {label}
    </span>
  );
}

function StageDockHostRow({
  host,
  streamActive,
  broadcasterUserId,
  authUser,
  guest,
  onToggleMenu,
  onProfileParty,
  selfUserId,
  discordBotCount = 0,
}: {
  host: StageHostGroup;
  streamActive: boolean;
  broadcasterUserId: string | null;
  authUser?: { id: string; avatar?: string | null } | null;
  guest?: GuestContext | null;
  onToggleMenu: (anchor: HTMLElement) => void;
  onProfileParty: (clientX: number, clientY: number) => void;
  selfUserId: string | null;
  discordBotCount?: number;
}) {
  const src = stageMemberAvatarSrc(host, 96, authUser, guest);
  const isLiveDj = streamActive && broadcasterUserId && host.userId === broadcasterUserId;
  const hasConnections = host.connections.length > 0;

  const ringClass =
    host.hasActiveConnection || isLiveDj
      ? "border-2 border-radio-red"
      : hasConnections
        ? "border border-white/70"
        : "border border-gray-600 saturate-0 opacity-50";

  return (
    <div className="relative flex flex-col items-center justify-center w-full min-w-0">
      <div className="relative w-12 h-12 shrink-0">
        <button
          type="button"
          onClick={(event) => onToggleMenu(event.currentTarget)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isSelfPartyTarget(host.userId, selfUserId)) return;
            onProfileParty(event.clientX, event.clientY);
          }}
          className={`block w-full h-full rounded-full p-0 border-0 bg-transparent shadow-lg overflow-hidden ${ringClass}`}
          title={`${host.displayName} (right-click for party reactions)`}
        >
          <img
            key={src}
            alt={host.displayName}
            className="w-full h-full object-cover"
            src={src}
            onError={avatarImageFallbackHandler(host.userId || host.displayName, 96)}
          />
        </button>
        <DiscordBotTuneBadge count={discordBotCount} />
      </div>
      <div
        className="mt-0.5 text-xs text-center w-full min-w-0 truncate leading-tight"
        style={{ color: host.roleColor ?? "#9ca3af" }}
        title={host.displayName}
      >
        {host.displayName}
      </div>
    </div>
  );
}

export function StageDock({
  hosts,
  loading = false,
  needsAuth = false,
  visible = true,
  broadcasterUserId = null,
  streamActive = false,
  auth,
  guest = null,
  partyGuest = null,
  shareToken,
}: StageDockProps) {
  const [expanded, setExpanded] = useState(true);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [switching, setSwitching] = useState(false);
  const [partyMenu, setPartyMenu] = useState<{
    host: StageHostGroup;
    x: number;
    y: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const relayEnabled = !needsAuth;
  const relay = useRelayConnections(relayEnabled, shareToken ?? guest?.shareToken);
  const presence = usePresenceRoster(relayEnabled, shareToken ?? guest?.shareToken);
  const stageSlots = buildStageSlots(relay.data?.connections ?? [], hosts);
  const occupiedHosts = stageSlots
    .filter((slot): slot is { type: "occupied"; host: StageHostGroup } => slot.type === "occupied")
    .map((slot) => slot.host);
  const discordBotCounts = buildDiscordBotCountsByHostUserId(
    occupiedHosts,
    presence.roster.botConnections ?? [],
  );
  const hasAnyoneOnStage = stageSlots.some((slot) => slot.type === "occupied");
  const canPromote = canPromoteDj(auth, broadcasterUserId, guest);
  const canMediaControl = canSendMediaControl(auth, broadcasterUserId, guest);
  const isAdmin = isAdminUser(auth);
  const canStageControl = canInteractWithStage(auth, broadcasterUserId, guest);
  const selfUserId = partySelfUserId(auth, partyGuest ?? guest);

  const openHost =
    openMenuUserId &&
    stageSlots.find(
      (slot): slot is { type: "occupied"; host: StageHostGroup } =>
        slot.type === "occupied" && slot.host.userId === openMenuUserId,
    )?.host;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!openMenuUserId) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof HTMLElement && target.closest("[data-party-menu-ignore]")) return;
      setOpenMenuUserId(null);
      setMenuAnchor(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openMenuUserId]);

  const toggleHostMenu = (hostUserId: string, anchor: HTMLElement) => {
    if (openMenuUserId === hostUserId) {
      setOpenMenuUserId(null);
      setMenuAnchor(null);
      return;
    }
    setMenuAnchor(anchor.getBoundingClientRect());
    setOpenMenuUserId(hostUserId);
  };

  const promoteDj = async (wsId: string) => {
    setSwitching(true);
    try {
      await api.switchBroadcaster(wsId);
      setOpenMenuUserId(null);
      setMenuAnchor(null);
    } catch {
      /* ignore */
    } finally {
      setSwitching(false);
    }
  };

  if (!visible) return null;

  return (
    <div ref={rootRef} className="hidden sm:block fixed left-2 top-1/2 -translate-y-1/2 z-[65]" data-stage-dock>
      <div className="flex items-stretch">
        <button
          type="button"
          title="Stage"
          onClick={() => setExpanded((value) => !value)}
          className={`bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 px-2 flex items-center justify-center shadow-lg ${
            expanded ? "rounded-l-2xl rounded-r-none" : "rounded-2xl"
          }`}
          style={{ height: DOCK_HEIGHT }}
        >
          <span className="text-xs tracking-widest text-gray-300 rotate-180 [writing-mode:vertical-rl]">
            STAGE
          </span>
        </button>

        {expanded && (
          <div
            className={`ml-2 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-r-2xl rounded-l-none p-3 shadow-2xl flex flex-col items-center justify-between shrink-0 overflow-visible ${STAGE_DOCK_PANEL_CLASS}`}
            style={{ height: DOCK_HEIGHT }}
          >
            {loading && !hasAnyoneOnStage ? (
              <p className="text-xs text-gray-500 px-2 text-center m-auto">Loading stage…</p>
            ) : needsAuth ? (
              <div className="px-3 text-center max-w-[8rem] m-auto">
                <p className="text-xs text-gray-400">Sign in to view hosts</p>
              </div>
            ) : (
              stageSlots.map((slot, index) => (
                <div
                  key={slot.type === "empty" ? `empty-${index}` : slot.host.userId}
                  className="flex flex-1 flex-col items-center justify-center min-h-0 w-full min-w-0"
                >
                  {slot.type === "empty" ? (
                    <EmptyStageSlot />
                  ) : (
                    <StageDockHostRow
                      host={slot.host}
                      streamActive={streamActive}
                      broadcasterUserId={broadcasterUserId}
                      authUser={auth.user ?? null}
                      guest={guest}
                      selfUserId={selfUserId}
                      discordBotCount={discordBotCounts.get(slot.host.userId) ?? 0}
                      onToggleMenu={(anchor) => toggleHostMenu(slot.host.userId, anchor)}
                      onProfileParty={(x, y) => setPartyMenu({ host: slot.host, x, y })}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {openHost && menuAnchor && (
        <StageHostMenu
          host={openHost}
          anchor={menuAnchor}
          variant="anchored"
          onClose={() => {
            setOpenMenuUserId(null);
            setMenuAnchor(null);
          }}
          showConnections={canStageControl}
          canPromote={canPromote}
          canMediaControl={canMediaControl}
          isAdmin={isAdmin}
          switching={switching}
          guest={guest}
          authUser={auth.user ?? null}
          onPromote={(wsId) => void promoteDj(wsId)}
        />
      )}
      {partyMenu && (
        <ProfilePartyReactionMenu
          host={partyMenu.host}
          clientX={partyMenu.x}
          clientY={partyMenu.y}
          onClose={() => setPartyMenu(null)}
          guest={partyGuest ?? guest}
          selfUserId={selfUserId}
        />
      )}
    </div>
  );
}

export function StageGrid({
  hosts,
  loading,
  needsAuth,
  broadcasterUserId = null,
  streamActive = false,
  auth,
  guest = null,
  partyGuest = null,
  shareToken,
}: StageDockProps) {
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [switching, setSwitching] = useState(false);
  const [partyMenu, setPartyMenu] = useState<{
    host: StageHostGroup;
    x: number;
    y: number;
  } | null>(null);

  const relayEnabled = !needsAuth;
  const relay = useRelayConnections(relayEnabled, shareToken ?? guest?.shareToken);
  const presence = usePresenceRoster(relayEnabled, shareToken ?? guest?.shareToken);
  const stageSlots = buildStageSlots(relay.data?.connections ?? [], hosts);
  const occupiedHosts = stageSlots
    .filter((slot): slot is { type: "occupied"; host: StageHostGroup } => slot.type === "occupied")
    .map((slot) => slot.host);
  const discordBotCounts = buildDiscordBotCountsByHostUserId(
    occupiedHosts,
    presence.roster.botConnections ?? [],
  );
  const hasAnyoneOnStage = stageSlots.some((slot) => slot.type === "occupied");
  const canPromote = canPromoteDj(auth, broadcasterUserId, guest);
  const canMediaControl = canSendMediaControl(auth, broadcasterUserId, guest);
  const isAdmin = isAdminUser(auth);
  const canStageControl = canInteractWithStage(auth, broadcasterUserId, guest);
  const selfUserId = partySelfUserId(auth, partyGuest ?? guest);

  const featuredHost =
    streamActive && broadcasterUserId
      ? stageSlots.find(
          (slot): slot is { type: "occupied"; host: StageHostGroup } =>
            slot.type === "occupied" && slot.host.userId === broadcasterUserId,
        )?.host ?? null
      : null;

  const gridSlots =
    featuredHost != null
      ? stageSlots.filter(
          (slot) => slot.type === "empty" || slot.host.userId !== featuredHost.userId,
        )
      : stageSlots;

  const openHost =
    openMenuUserId &&
    stageSlots.find(
      (slot): slot is { type: "occupied"; host: StageHostGroup } =>
        slot.type === "occupied" && slot.host.userId === openMenuUserId,
    )?.host;

  const promoteDj = async (wsId: string) => {
    setSwitching(true);
    try {
      await api.switchBroadcaster(wsId);
      setOpenMenuUserId(null);
      setMenuAnchor(null);
    } catch {
      /* ignore */
    } finally {
      setSwitching(false);
    }
  };

  const toggleHostMenu = (hostUserId: string, anchor: HTMLElement) => {
    if (openMenuUserId === hostUserId) {
      setOpenMenuUserId(null);
      setMenuAnchor(null);
      return;
    }
    setMenuAnchor(anchor.getBoundingClientRect());
    setOpenMenuUserId(hostUserId);
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="flex items-center gap-3 p-5 border-b border-gray-700">
        <UsersRoundIcon />
        <h3 className="text-xl font-bold text-white">Stage</h3>
      </div>
      <div className="relative flex-1 p-6 overflow-hidden">
        {loading && !hasAnyoneOnStage ? (
          <p className="text-gray-400 text-sm text-center py-6">Loading stage…</p>
        ) : needsAuth ? (
          <p className="text-gray-400 text-sm text-center py-6">Sign in to view the stage roster.</p>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            {featuredHost && (
              <div className="flex justify-center mb-4">
                <StageHostTile
                  host={featuredHost}
                  size="featured"
                  streamActive={streamActive}
                  broadcasterUserId={broadcasterUserId}
                  authUser={auth.user ?? null}
                  guest={guest}
                  selfUserId={selfUserId}
                  discordBotCount={discordBotCounts.get(featuredHost.userId) ?? 0}
                  onToggle={(anchor) => toggleHostMenu(featuredHost.userId, anchor)}
                  onProfileParty={(x, y) => setPartyMenu({ host: featuredHost, x, y })}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
              {gridSlots.map((slot, index) =>
                slot.type === "empty" ? (
                  <div key={`empty-${index}`} className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600/80 bg-gray-800/30" />
                  </div>
                ) : (
                  <StageHostTile
                    key={slot.host.userId}
                    host={slot.host}
                    size="lg"
                    streamActive={streamActive}
                    broadcasterUserId={broadcasterUserId}
                    authUser={auth.user ?? null}
                    guest={guest}
                    selfUserId={selfUserId}
                    discordBotCount={discordBotCounts.get(slot.host.userId) ?? 0}
                    onToggle={(anchor) => toggleHostMenu(slot.host.userId, anchor)}
                    onProfileParty={(x, y) => setPartyMenu({ host: slot.host, x, y })}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {openHost && menuAnchor && (
        <StageHostMenu
          host={openHost}
          anchor={menuAnchor}
          variant="sheet"
          onClose={() => {
            setOpenMenuUserId(null);
            setMenuAnchor(null);
          }}
          showConnections={canStageControl}
          canPromote={canPromote}
          canMediaControl={canMediaControl}
          isAdmin={isAdmin}
          switching={switching}
          guest={guest}
          authUser={auth.user ?? null}
          onPromote={(wsId) => void promoteDj(wsId)}
        />
      )}
      {partyMenu && (
        <ProfilePartyReactionMenu
          host={partyMenu.host}
          clientX={partyMenu.x}
          clientY={partyMenu.y}
          onClose={() => setPartyMenu(null)}
          guest={partyGuest ?? guest}
          selfUserId={selfUserId}
        />
      )}
    </div>
  );
}

function StageHostTile({
  host,
  size,
  streamActive,
  broadcasterUserId,
  authUser,
  guest,
  selfUserId,
  discordBotCount = 0,
  onToggle,
  onProfileParty,
}: {
  host: StageHostGroup;
  size: "lg" | "featured";
  streamActive?: boolean;
  broadcasterUserId?: string | null;
  authUser?: { id: string; avatar?: string | null } | null;
  guest?: GuestContext | null;
  selfUserId: string | null;
  discordBotCount?: number;
  onToggle?: (anchor: HTMLElement) => void;
  onProfileParty?: (clientX: number, clientY: number) => void;
}) {
  const pixelSize = size === "featured" ? 160 : 128;
  const src = stageMemberAvatarSrc(host, pixelSize, authUser, guest);

  const isLiveDj = streamActive && broadcasterUserId && host.userId === broadcasterUserId;
  const imgSize = size === "featured" ? "w-20 h-20" : "w-16 h-16";
  const ringClass =
    host.hasActiveConnection || isLiveDj
      ? "ring-2 ring-radio-red"
      : host.connections.length > 0
        ? "ring ring-white/70"
        : "ring ring-gray-600 saturate-0 opacity-60";

  const avatar = (
    <>
      <span className="block w-full h-full rounded-full overflow-hidden shadow-lg">
        <img
          key={src}
          alt={host.displayName}
          className="w-full h-full object-cover"
          src={src}
          onError={avatarImageFallbackHandler(host.userId || host.displayName, pixelSize)}
        />
      </span>
      <DiscordBotTuneBadge count={discordBotCount} />
    </>
  );

  return (
    <div className="flex flex-col items-center w-full min-w-0 max-w-[5.5rem]">
      {onToggle ? (
        <button
          type="button"
          onClick={(event) => onToggle(event.currentTarget)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isSelfPartyTarget(host.userId, selfUserId)) return;
            onProfileParty?.(event.clientX, event.clientY);
          }}
          className={`relative shrink-0 rounded-full p-0 border-0 bg-transparent ${imgSize} ${ringClass}`}
          title={`${host.displayName} (right-click for party reactions)`}
        >
          {avatar}
        </button>
      ) : (
        <div className={`relative shrink-0 rounded-full ${imgSize} ${ringClass}`} title={host.displayName}>
          {avatar}
        </div>
      )}
      <div
        className={
          size === "featured"
            ? "mt-2 text-sm w-full min-w-0 truncate text-center font-medium"
            : "mt-1 text-xs w-full min-w-0 px-1 text-center leading-tight truncate"
        }
        style={{ color: host.roleColor ?? "#9ca3af" }}
        title={host.displayName}
      >
        {host.displayName}
      </div>
    </div>
  );
}

function UsersRoundIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6 text-radio-accent"
      aria-hidden="true"
    >
      <path d="M18 21a8 8 0 0 0-16 0" />
      <circle cx="10" cy="8" r="5" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </svg>
  );
}
