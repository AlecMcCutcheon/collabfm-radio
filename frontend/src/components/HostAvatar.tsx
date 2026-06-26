import type { HostMember } from "../types/api";
import { hostAvatarSrc } from "../utils/avatar";

interface HostAvatarProps {
  host: HostMember;
  size?: "sm" | "lg" | "featured";
  active?: boolean;
  variant?: "dock" | "grid";
}

export function HostAvatar({
  host,
  size = "lg",
  active = false,
  variant = "grid",
}: HostAvatarProps) {
  const imgSize =
    size === "featured" ? "w-20 h-20" : size === "lg" ? "w-16 h-16" : "w-12 h-12";
  const pixelSize = size === "featured" ? 160 : size === "lg" ? 128 : 96;
  const src = hostAvatarSrc(host, pixelSize);

  const avatarClass =
    variant === "dock"
      ? active
        ? "border-2 border-radio-red saturate-100 opacity-100"
        : "border border-gray-600 saturate-0 opacity-50"
      : active
        ? "ring-2 ring-radio-red saturate-100 opacity-100"
        : "ring ring-gray-600 saturate-0 opacity-60";

  const nameClass =
    size === "featured"
      ? "mt-2 text-sm max-w-[8rem] truncate text-center font-medium"
      : variant === "dock"
        ? "mt-1 text-xs text-center max-w-[8rem] break-words leading-tight"
        : "mt-1 text-xs w-full px-1 text-center leading-tight";

  return (
    <div className="flex flex-col items-center">
      <div
        className={`${imgSize} rounded-full overflow-hidden shadow-lg ${avatarClass}`}
        title={host.displayName}
      >
        <button type="button" className="w-full h-full">
          <img alt={host.displayName} className="w-full h-full object-cover" src={src} />
        </button>
      </div>
      <div
        className={`${nameClass}${!active && variant === "dock" ? " opacity-60" : ""}`}
        style={{ color: host.roleColor ?? "#9ca3af" }}
      >
        {host.displayName}
      </div>
    </div>
  );
}
