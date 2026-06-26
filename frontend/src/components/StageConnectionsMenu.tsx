import { useState } from "react";
import { Music, RefreshCcw } from "lucide-react";
import type { GuestContext, RelayConnection } from "../types/api";
import { usePinnedMediaControl } from "../context/PinnedMediaControlContext";
import { MediaControlPanel, pinnedTargetFromConnection } from "./MediaControlPanel";

interface StageConnectionsSectionProps {
  connections: RelayConnection[];
  canPromote: boolean;
  canMediaControl: boolean;
  isAdmin: boolean;
  switching: boolean;
  onPromote: (wsId: string) => void;
  guest?: GuestContext | null;
  compact?: boolean;
}

function showMediaButton(
  connection: RelayConnection,
  canMediaControl: boolean,
  isAdmin: boolean,
): boolean {
  if (!connection.capabilities.supportsMediaControls || !canMediaControl) return false;
  return isAdmin || connection.isActive;
}

function connectionDeviceLabel(connection: RelayConnection): string {
  return connection.broadcastName?.trim() || "Browser extension";
}

export function StageConnectionsSection({
  connections,
  canPromote,
  canMediaControl,
  isAdmin,
  switching,
  onPromote,
  guest = null,
  compact = false,
}: StageConnectionsSectionProps) {
  const [expandedMediaWsId, setExpandedMediaWsId] = useState<string | null>(null);
  const { togglePin, isPinned, guest: pinGuest } = usePinnedMediaControl();

  const sorted = [...connections].sort(
    (a, b) => new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime(),
  );

  return (
    <>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1 px-3 pt-1">
        Connections
      </div>
      <div className={compact ? "space-y-1 px-1" : "space-y-2 max-h-[45vh] overflow-y-auto px-1"}>
        {sorted.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-3">No active connections</div>
        ) : (
          sorted.map((connection) => {
            const isActive = connection.isActive;
            const label = connectionDeviceLabel(connection);
            const promoteDisabled = isActive || !canPromote || switching;
            const mediaExpanded = expandedMediaWsId === connection.wsId;
            const hasMedia = showMediaButton(connection, canMediaControl, isAdmin);
            const mediaTarget = pinnedTargetFromConnection(connection);

            return (
              <div key={connection.wsId} className="rounded-lg hover:bg-gray-800/70">
                <div className="flex items-center justify-between gap-2 px-2 py-1" title={label}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        isActive ? "bg-green-500" : "bg-gray-600"
                      }`}
                    />
                    <span className="text-xs text-white/90 truncate">{label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasMedia && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setExpandedMediaWsId((current) =>
                            current === connection.wsId ? null : connection.wsId,
                          );
                        }}
                        className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center ${
                          mediaExpanded ? "bg-green-700" : "bg-green-600"
                        } text-white hover:bg-green-700`}
                        title="Control media playback"
                      >
                        <Music className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={promoteDisabled}
                      onClick={() => onPromote(connection.wsId)}
                      className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1 ${
                        promoteDisabled
                          ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                          : "bg-radio-accent text-white hover:brightness-110"
                      }`}
                      title={
                        isActive
                          ? "Current"
                          : canPromote
                            ? "Promote to DJ"
                            : "Only active broadcaster or admin can switch"
                      }
                    >
                      <RefreshCcw className="w-3 h-3" />
                      {!compact && <span className="hidden sm:inline">Promote to DJ</span>}
                    </button>
                  </div>
                </div>

                {hasMedia && mediaExpanded && (
                  <div className="mt-1 mx-2 mb-2">
                    <MediaControlPanel
                      target={mediaTarget}
                      guest={guest ?? pinGuest}
                      showPin={!compact}
                      pinned={isPinned(connection.wsId)}
                      onTogglePin={() => togglePin(mediaTarget)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

interface StageConnectionsMenuProps {
  connections: RelayConnection[];
  canPromote: boolean;
  canMediaControl: boolean;
  isAdmin: boolean;
  switching: boolean;
  onPromote: (wsId: string) => void;
  variant: "dock" | "sheet";
  onClose?: () => void;
  guest?: GuestContext | null;
}

export function StageConnectionsMenu({
  connections,
  canPromote,
  canMediaControl,
  isAdmin,
  switching,
  onPromote,
  variant,
  onClose,
  guest = null,
}: StageConnectionsMenuProps) {
  const content = (
    <StageConnectionsSection
      connections={connections}
      canPromote={canPromote}
      canMediaControl={canMediaControl}
      isAdmin={isAdmin}
      switching={switching}
      onPromote={onPromote}
      guest={guest}
      compact={variant === "dock"}
    />
  );

  if (variant === "sheet") {
    return (
      <>
        <div className="fixed inset-0 z-[80] sm:hidden bg-black/40" onClick={onClose} />
        <div
          className="fixed inset-x-0 bottom-16 z-[81] sm:hidden bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-t-2xl p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </>
    );
  }
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl p-3 w-max max-w-[80vw] overflow-x-auto">
      {content}
    </div>
  );
}
