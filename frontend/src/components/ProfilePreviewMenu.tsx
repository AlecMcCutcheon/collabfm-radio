import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GuestContext } from "../types/api";
import {
  PROFILE_PREVIEW_MENU_HEIGHT,
  PROFILE_PREVIEW_MENU_WIDTH,
  type MenuAnchor,
} from "../utils/contextMenuPosition";
import { isSelfPartyTarget, partySelfUserIdFromParts } from "../utils/partySelfUserId";
import type { StageHostGroup } from "../utils/stageHosts";
import { subscribeLiveEvent } from "../utils/liveEvents";
import { ContextMenuPanel } from "./ContextMenuPanel";
import { ProfilePartyReactionMenu } from "./ProfilePartyReactionMenu";
import { StageProfilePreview } from "./StageProfilePreview";

interface ProfilePreviewMenuProps {
  host: StageHostGroup;
  anchor: MenuAnchor;
  onClose: () => void;
  authUser?: { id: string; avatar?: string | null } | null;
  guest?: GuestContext | null;
}

export function ProfilePreviewMenu({
  host,
  anchor,
  onClose,
  authUser,
  guest,
}: ProfilePreviewMenuProps) {
  const [previewHost, setPreviewHost] = useState(host);
  const [partyMenu, setPartyMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPreviewHost(host);

    if (host.userId.startsWith("guest:")) return;

    let cancelled = false;
    const loadPublicProfile = () => {
      void api
        .publicUserProfile(host.userId, guest?.shareToken)
        .then(({ profile }) => {
          if (cancelled) return;
          setPreviewHost((prev) => ({
            ...prev,
            displayName: profile.displayName || prev.displayName,
            avatar: profile.avatarUrl ?? prev.avatar,
            bio: profile.bio ?? prev.bio,
            genres: profile.genres ?? prev.genres,
            level: profile.level ?? prev.level,
            roleColor: profile.roleColor ?? prev.roleColor,
          }));
        })
        .catch(() => {
          /* keep host-members / message fallback */
        });
    };
    loadPublicProfile();
    const unsubscribeProfile = subscribeLiveEvent("profile_changed", loadPublicProfile, {
      shareToken: guest?.shareToken,
    });

    return () => {
      cancelled = true;
      unsubscribeProfile();
    };
  }, [host, guest?.shareToken]);

  const selfUserId = partySelfUserIdFromParts(authUser, guest);

  return (
    <>
      <ContextMenuPanel
        anchor={anchor}
        onClose={onClose}
        menuWidth={PROFILE_PREVIEW_MENU_WIDTH}
        menuHeight={PROFILE_PREVIEW_MENU_HEIGHT}
        zIndex={220}
      >
        <div
          data-profile-party-root
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isSelfPartyTarget(previewHost.userId, selfUserId)) return;
            setPartyMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          <StageProfilePreview host={previewHost} authUser={authUser} guest={guest} />
        </div>
      </ContextMenuPanel>
      {partyMenu && (
        <ProfilePartyReactionMenu
          host={previewHost}
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
