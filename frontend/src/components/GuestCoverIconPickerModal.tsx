import { useEffect } from "react";
import { X } from "lucide-react";
import { guestAvatarSrc } from "../utils/avatar";
import { GUEST_COVER_ICONS } from "../utils/guestCoverIcons";

interface GuestCoverIconPickerModalProps {
  open: boolean;
  guestId: string;
  avatarVariant: number;
  selectedIcon: number;
  onSelect: (iconId: number) => void;
  onReset: () => void;
  onClose: () => void;
}

export function GuestCoverIconPickerModal({
  open,
  guestId,
  avatarVariant,
  selectedIcon,
  onSelect,
  onReset,
  onClose,
}: GuestCoverIconPickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-cover-icon-picker-title"
      >
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4 shrink-0">
          <div>
            <h3 id="guest-cover-icon-picker-title" className="text-lg font-semibold text-white">
              Choose cover icon
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Centered on your procedural artwork — stage, chat, and profile
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-4 sm:grid-cols-5 gap-3 overflow-y-auto">
          {GUEST_COVER_ICONS.map((icon) => {
            const active = icon.id === selectedIcon;
            return (
              <button
                key={icon.id}
                type="button"
                onClick={() => onSelect(icon.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 border-2 transition-all hover:scale-[1.03] ${
                  active
                    ? "border-radio-accent ring-2 ring-radio-accent/40"
                    : "border-gray-600 hover:border-gray-500"
                }`}
                title={icon.label}
              >
                <div className="aspect-square w-full rounded-lg overflow-hidden bg-gray-800">
                  <img
                    src={guestAvatarSrc(guestId, avatarVariant, 72, icon.id)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[10px] text-gray-400 truncate w-full text-center leading-tight">
                  {icon.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-700 px-5 py-4 shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-gray-400 hover:text-white"
          >
            None (default)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-radio-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
