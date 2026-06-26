import { Settings, Shield, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAppNavigation } from "../context/AppNavigationContext";
import type { AuthStatus } from "../types/api";

interface AdminBadgeProps {
  auth: AuthStatus;
  iconBtnClass: string;
  iconClass: string;
}

export function AdminBadge({ auth, iconBtnClass, iconClass }: AdminBadgeProps) {
  const { navigate } = useAppNavigation();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = auth.roleInfo?.roleType === "admin";
  const canToggleJoin = auth.roleInfo?.permissions.canToggleJoinDebug;
  const hasMenu = isAdmin || canToggleJoin;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!hasMenu) return null;

  const toggleJoinDebug = async () => {
    try {
      setWorking(true);
      const current = await api.joinDebugStatus();
      await api.setJoinDebug(!current.enabled);
    } finally {
      setWorking(false);
      setOpen(false);
    }
  };

  const clearChat = async () => {
    try {
      setWorking(true);
      await api.clearMessages();
    } finally {
      setWorking(false);
      setOpen(false);
    }
  };

  const menuItemClass =
    "w-full px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50";

  const items: Array<{ key: string; node: ReactNode }> = [];

  if (isAdmin) {
    items.push({
      key: "settings",
      node: (
        <button
          type="button"
          className={menuItemClass}
          onClick={() => {
            navigate("/admin");
            setOpen(false);
          }}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Admin settings
        </button>
      ),
    });
  }

  if (canToggleJoin) {
    items.push({
      key: "join-debug",
      node: (
        <button
          type="button"
          disabled={working}
          className={menuItemClass}
          onClick={() => void toggleJoinDebug()}
        >
          <Shield className="w-4 h-4 shrink-0" />
          Toggle Join Page (Debug)
        </button>
      ),
    });
  }

  if (isAdmin) {
    items.push({
      key: "clear",
      node: (
        <button
          type="button"
          disabled={working}
          className={menuItemClass}
          onClick={() => void clearChat()}
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          Clear all chat
        </button>
      ),
    });
  }

  return (
    <div className="relative inline-flex items-center self-center" ref={ref}>
      <button
        type="button"
        title="Chat actions"
        onClick={() => setOpen((v) => !v)}
        className={iconBtnClass}
      >
        <Settings className={iconClass} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden divide-y divide-gray-700/80">
          {items.map((item) => (
            <div key={item.key}>{item.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}
