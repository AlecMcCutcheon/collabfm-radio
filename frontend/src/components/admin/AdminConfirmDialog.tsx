import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AdminBtn } from "./adminUi";

interface AdminConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger" | "success";
  busy?: boolean;
}

export function AdminConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  busy = false,
}: AdminConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-5 sm:p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 id="admin-confirm-title" className="text-lg font-semibold text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-white transition-colors shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-gray-400 leading-relaxed space-y-2 mb-5">{children}</div>

        <div className="flex flex-wrap gap-2 justify-end">
          <AdminBtn variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </AdminBtn>
          <AdminBtn variant={confirmVariant} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </AdminBtn>
        </div>
      </div>
    </div>
  );
}
