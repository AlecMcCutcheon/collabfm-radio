import { useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { PartyEffectType } from "../types/api";
import {
  PARTY_ARRIVAL_ITEMS,
  PARTY_EFFECT_ITEMS,
  PARTY_PET_REACTION_ITEM,
  PARTY_REACTION_ITEMS,
  type PartyMenuItem,
} from "../config/partyEffectMenu";
import { PARTY_EFFECTS_HELP_MODAL_Z } from "../utils/partyEffectsZIndex";

type MenuSection = "effects" | "arrivals" | "reactions" | null;

function MenuItems({ items, onPick }: { items: PartyMenuItem[]; onPick: (type: PartyEffectType) => void }) {
  return (
    <>
      {items.map((action) => (
        <button
          key={action.type}
          type="button"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-100 hover:bg-indigo-600/30 transition-colors text-left"
          onClick={() => onPick(action.type)}
        >
          <span className="text-base leading-none" aria-hidden>
            {action.icon}
          </span>
          {action.label}
        </button>
      ))}
    </>
  );
}

function PartyTimeHelpModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: PARTY_EFFECTS_HELP_MODAL_Z }}
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-md border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="party-time-help-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="party-time-help-title" className="text-lg font-bold text-white">
            Party time
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            Right-click the radio view to open this menu. Pick an effect, arrival, or reaction and
            it plays where you clicked.
          </p>
          <p>
            <span className="text-gray-200">Effects</span> burst on the spot.{" "}
            <span className="text-gray-200">Arrivals</span> fly in along a path and land there.{" "}
            <span className="text-gray-200">Reactions</span> pop up with your avatar and an emoji.
          </p>
          <p className="text-gray-400">
            Everyone on the radio view can see what you trigger — have fun, but go easy so the vibe
            stays chill.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PartyTimeMenuSectionProps {
  onPick: (type: PartyEffectType) => void;
  showPetReaction?: boolean;
}

export function PartyTimeMenuSection({ onPick, showPetReaction = false }: PartyTimeMenuSectionProps) {
  const [section, setSection] = useState<MenuSection>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const reactionItems = showPetReaction
    ? [
        ...PARTY_REACTION_ITEMS.slice(0, 5),
        PARTY_PET_REACTION_ITEM,
        ...PARTY_REACTION_ITEMS.slice(5),
      ]
    : PARTY_REACTION_ITEMS;

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-700/80 mb-1 mt-1">
        <span>Party time</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setHelpOpen(true);
          }}
          className="shrink-0 text-gray-500 hover:text-radio-accent transition-colors p-0.5 -mr-0.5 normal-case"
          title="How party time works"
          aria-label="How party time works"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {section === null && (
        <>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm text-gray-100 hover:bg-indigo-600/30 transition-colors text-left"
            onClick={() => setSection("effects")}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>✨</span>
              Effects
            </span>
            <span className="text-gray-500 text-xs">▸</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm text-gray-100 hover:bg-indigo-600/30 transition-colors text-left"
            onClick={() => setSection("arrivals")}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>🚀</span>
              Arrivals
            </span>
            <span className="text-gray-500 text-xs">▸</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm text-gray-100 hover:bg-indigo-600/30 transition-colors text-left"
            onClick={() => setSection("reactions")}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>😄</span>
              Reactions
            </span>
            <span className="text-gray-500 text-xs">▸</span>
          </button>
        </>
      )}

      {section === "effects" && (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-700/60"
            onClick={() => setSection(null)}
          >
            ← Back
          </button>
          <MenuItems items={PARTY_EFFECT_ITEMS} onPick={onPick} />
        </>
      )}

      {section === "arrivals" && (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-700/60"
            onClick={() => setSection(null)}
          >
            ← Back
          </button>
          <p className="px-3 py-2 text-[11px] text-gray-500 leading-snug">
            Flies in along a curved path and lands on your click
          </p>
          <MenuItems items={PARTY_ARRIVAL_ITEMS} onPick={onPick} />
        </>
      )}

      {section === "reactions" && (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-700/60"
            onClick={() => setSection(null)}
          >
            ← Back
          </button>
          <div className="max-h-[min(320px,52vh)] overflow-y-auto scrollbar-party">
            <MenuItems items={reactionItems} onPick={onPick} />
          </div>
        </>
      )}

      {helpOpen && <PartyTimeHelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}
