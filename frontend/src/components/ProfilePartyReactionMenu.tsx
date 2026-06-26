import type { GuestContext, ProfilePartyEffectType } from "../types/api";
import { PROFILE_PARTY_REACTION_ITEMS } from "../config/profilePartyReactions";
import { usePartyEffectActions } from "../context/PartyEffectsContext";
import type { StageHostGroup } from "../utils/stageHosts";
import { isSelfPartyTarget } from "../utils/partySelfUserId";
import { ContextMenuPanel } from "./ContextMenuPanel";

interface ProfilePartyReactionMenuProps {
  host: StageHostGroup;
  clientX: number;
  clientY: number;
  onClose: () => void;
  guest?: GuestContext | null;
  selfUserId?: string | null;
}

export function ProfilePartyReactionMenu({
  host,
  clientX,
  clientY,
  onClose,
  guest,
  selfUserId = null,
}: ProfilePartyReactionMenuProps) {
  const party = usePartyEffectActions();

  const pick = (type: ProfilePartyEffectType) => {
    if (!party?.canTrigger) return;
    party.triggerProfileReaction(type, clientX, clientY, host, guest ?? undefined);
    onClose();
  };

  if (!party?.canTrigger || isSelfPartyTarget(host.userId, selfUserId)) return null;

  return (
    <ContextMenuPanel
      anchor={{ x: clientX, y: clientY }}
      onClose={onClose}
      zIndex={230}
    >
      <div data-profile-party-root data-party-menu-ignore className="py-1">
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300/90 border-b border-gray-700/80">
          React to {host.displayName}
        </div>
        {PROFILE_PARTY_REACTION_ITEMS.map((item) => (
          <button
            key={item.type}
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-100 hover:bg-indigo-600/30 transition-colors text-left"
            onClick={() => pick(item.type)}
          >
            <span className="text-base leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </ContextMenuPanel>
  );
}
