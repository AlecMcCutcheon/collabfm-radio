import { useEffect } from "react";
import { X } from "lucide-react";
import { guestAvatarSrc } from "../utils/avatar";
import { GUEST_AVATAR_VARIANT_COUNT } from "../utils/guestIdentity";

interface GuestAvatarPickerModalProps {
  open: boolean;
  guestId: string;
  avatarVariant: number;
  coverIcon?: number;
  onSelect: (variant: number) => void;
  onReset: () => void;
  onClose: () => void;
}

export function GuestAvatarPickerModal({
  open,
  guestId,
  avatarVariant,
  coverIcon = 0,
  onSelect,
  onReset,
  onClose,
}: GuestAvatarPickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const variants = Array.from({ length: GUEST_AVATAR_VARIANT_COUNT }, (_, i) => i);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-avatar-picker-title"
      >
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div>
            <h3 id="guest-avatar-picker-title" className="text-lg font-semibold text-white">
              Choose avatar
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Same style as the station — pick a variant you like</p>
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

        <div className="p-5 grid grid-cols-4 gap-3">
          {variants.map((variant) => {
            const active = variant === avatarVariant;
            return (
              <button
                key={variant}
                type="button"
                onClick={() => onSelect(variant)}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${
                  active
                    ? "border-radio-accent ring-2 ring-radio-accent/40"
                    : "border-gray-600 hover:border-gray-500"
                }`}
                title={`Avatar style ${variant + 1}`}
              >
                <img
                  src={guestAvatarSrc(guestId, variant, 96, coverIcon)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-700 px-5 py-4">
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-gray-400 hover:text-white"
          >
            Reset to default
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
