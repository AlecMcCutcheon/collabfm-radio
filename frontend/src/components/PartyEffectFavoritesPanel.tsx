import { useMemo, useState } from "react";
import type { PartyEffectType } from "../types/api";
import {
  ALL_PARTY_MENU_ITEMS,
  PARTY_ARRIVAL_ITEMS,
  PARTY_EFFECT_ITEMS,
  PARTY_REACTION_ITEMS,
  getPartyMenuItem,
  type PartyMenuItem,
} from "../config/partyEffectMenu";
import { usePartyEffectFavorites } from "../hooks/usePartyEffectFavorites";

type PickerTab = "effects" | "arrivals" | "reactions";

interface PartyEffectFavoritesPanelProps {
  scope: string;
}

const TAB_ITEMS: Record<PickerTab, PartyMenuItem[]> = {
  effects: PARTY_EFFECT_ITEMS,
  arrivals: PARTY_ARRIVAL_ITEMS,
  reactions: PARTY_REACTION_ITEMS,
};

export function PartyEffectFavoritesPanel({ scope }: PartyEffectFavoritesPanelProps) {
  const { slots, setSlot, clearSlot } = usePartyEffectFavorites(scope);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [tab, setTab] = useState<PickerTab>("effects");

  const lookup = useMemo(
    () => new Map(ALL_PARTY_MENU_ITEMS.map((item) => [item.type, item])),
    [],
  );

  const assign = (type: PartyEffectType) => {
    setSlot(selectedSlot, type);
  };

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6" data-party-menu-ignore>
      <h2 className="text-lg font-semibold text-white mb-1">Effect hotkeys</h2>
      <p className="text-sm text-gray-400 mb-4">
        Pick up to 8 favorites below. On the radio view, press{" "}
        <span className="text-gray-300">1–8</span> to spawn the effect at your cursor (right-click
        still opens the full menu).
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {slots.map((type, index) => {
          const item = type ? lookup.get(type) : null;
          const isSelected = selectedSlot === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedSlot(index)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-indigo-400/80 bg-indigo-600/20 ring-1 ring-indigo-400/50"
                  : "border-gray-700 bg-gray-800/60 hover:border-gray-600 hover:bg-gray-800"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                Key {index + 1}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg leading-none shrink-0" aria-hidden>
                  {item?.icon ?? "—"}
                </span>
                <span className="text-xs text-gray-200 truncate">
                  {item?.label ?? "Empty"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(TAB_ITEMS) as PickerTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
              tab === key
                ? "bg-indigo-600/30 text-indigo-100 border border-indigo-500/40"
                : "text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            {key}
          </button>
        ))}
        {slots[selectedSlot] && (
          <button
            type="button"
            onClick={() => clearSlot(selectedSlot)}
            className="px-3 py-1.5 rounded-lg text-xs text-red-300 border border-red-900/50 hover:bg-red-950/30 ml-auto"
          >
            Clear slot {selectedSlot + 1}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500 mb-2">
        Assign to slot {selectedSlot + 1}
        {slots[selectedSlot]
          ? `: ${getPartyMenuItem(slots[selectedSlot]!)?.label ?? slots[selectedSlot]}`
          : ""}
      </p>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-700/80 divide-y divide-gray-800/80 scrollbar-party">
        {TAB_ITEMS[tab].map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => assign(item.type)}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
              slots[selectedSlot] === item.type
                ? "bg-indigo-600/25 text-indigo-100"
                : "text-gray-100 hover:bg-indigo-600/15"
            }`}
          >
            <span className="text-base leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
