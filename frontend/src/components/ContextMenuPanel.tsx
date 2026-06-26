import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  computeContextMenuStyle,
  DEFAULT_MENU_HEIGHT,
  DEFAULT_MENU_WIDTH,
  type MenuAnchor,
} from "../utils/contextMenuPosition";

interface ContextMenuPanelProps {
  anchor: MenuAnchor;
  onClose: () => void;
  children: ReactNode;
  variant?: "anchored" | "sheet";
  className?: string;
  menuWidth?: number;
  menuHeight?: number;
  zIndex?: number;
}

export function ContextMenuPanel({
  anchor,
  onClose,
  children,
  variant = "anchored",
  className = "",
  menuWidth,
  menuHeight,
  zIndex = 210,
}: ContextMenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof HTMLElement && target.closest("[data-party-menu-ignore]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const panelClass = menuWidth
    ? "max-h-[min(480px,85vh)] overflow-y-auto rounded-xl border border-gray-600/80 bg-gray-900/95 shadow-2xl backdrop-blur-md py-1.5 scrollbar-party"
    : "min-w-[200px] max-w-[min(320px,calc(100vw-24px))] max-h-[min(480px,85vh)] overflow-y-auto rounded-xl border border-gray-600/80 bg-gray-900/95 shadow-2xl backdrop-blur-md py-1.5 scrollbar-party";

  if (variant === "sheet") {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[80] bg-black/40 sm:hidden" onClick={onClose} />
        <div
          ref={panelRef}
          className={`fixed inset-x-0 bottom-16 z-[81] sm:hidden border border-gray-700 rounded-t-2xl p-3 shadow-2xl bg-gray-900/98 max-h-[min(70vh,520px)] overflow-y-auto scrollbar-party ${className}`}
          data-party-menu-ignore
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </>,
      document.body,
    );
  }

  const style: CSSProperties = computeContextMenuStyle(
    anchor,
    menuWidth ?? DEFAULT_MENU_WIDTH,
    menuHeight ?? DEFAULT_MENU_HEIGHT,
  );

  const widthStyle: CSSProperties =
    menuWidth != null
      ? { width: style.width, minWidth: style.width, maxWidth: style.width }
      : {};

  return createPortal(
    <div
      ref={panelRef}
      className={`fixed ${panelClass} ${className}`}
      style={{ left: style.left, top: style.top, ...widthStyle, zIndex }}
      data-party-menu-ignore
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
