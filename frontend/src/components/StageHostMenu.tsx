import { useState } from "react";
import type { GuestContext } from "../types/api";
import {
  PROFILE_PREVIEW_MENU_HEIGHT,
  PROFILE_PREVIEW_MENU_WIDTH,
  type MenuAnchor,
} from "../utils/contextMenuPosition";
import { isSelfPartyTarget, partySelfUserIdFromParts } from "../utils/partySelfUserId";
import type { StageHostGroup } from "../utils/stageHosts";
import { ContextMenuPanel } from "./ContextMenuPanel";
import { ProfilePartyReactionMenu } from "./ProfilePartyReactionMenu";
import { StageConnectionsSection } from "./StageConnectionsMenu";
import { StageProfilePreview } from "./StageProfilePreview";

interface StageHostMenuProps {
  host: StageHostGroup;
  anchor: MenuAnchor;
  variant: "anchored" | "sheet";
  onClose: () => void;
  showConnections: boolean;
  canPromote: boolean;
  canMediaControl: boolean;
  isAdmin: boolean;
  switching: boolean;
  onPromote: (wsId: string) => void;
  authUser?: { id: string; avatar?: string | null } | null;
  guest?: GuestContext | null;
}

export function StageHostMenu({
  host,
  anchor,
  variant,
  onClose,
  showConnections,
  canPromote,
  canMediaControl,
  isAdmin,
  switching,
  onPromote,
  authUser,
  guest,
}: StageHostMenuProps) {
  const [partyMenu, setPartyMenu] = useState<{ x: number; y: number } | null>(null);
  const selfUserId = partySelfUserIdFromParts(authUser, guest);

  return (
    <>
      <ContextMenuPanel
        anchor={anchor}
        onClose={onClose}
        variant={variant}
        menuWidth={PROFILE_PREVIEW_MENU_WIDTH}
        menuHeight={PROFILE_PREVIEW_MENU_HEIGHT}
      >
        <div
          data-profile-party-root
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isSelfPartyTarget(host.userId, selfUserId)) return;
            setPartyMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          <StageProfilePreview host={host} authUser={authUser} guest={guest} />
        </div>

        {showConnections && host.connections.length > 0 && (
          <div className="border-t border-gray-700/80 mx-1 pt-1">
            <StageConnectionsSection
              connections={host.connections}
              canPromote={canPromote}
              canMediaControl={canMediaControl}
              isAdmin={isAdmin}
              switching={switching}
              onPromote={onPromote}
              guest={guest}
              compact={variant === "anchored"}
            />
          </div>
        )}
      </ContextMenuPanel>
      {partyMenu && (
        <ProfilePartyReactionMenu
          host={host}
          clientX={partyMenu.x}
          clientY={partyMenu.y}
          onClose={() => setPartyMenu(null)}
          guest={guest}
          selfUserId={selfUserId}
        />
      )}
    </>
  );
}
