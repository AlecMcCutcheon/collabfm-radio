import type { ChatMessage, HostMember } from "../types/api";
import type { StageHostGroup } from "./stageHosts";

export function profileHostFromChatMessage(
  message: ChatMessage,
  hosts: HostMember[],
): StageHostGroup {
  const userId = String(message.userId ?? message.username ?? "unknown");
  const member = hosts.find((host) => String(host.userId) === userId);

  return {
    userId,
    displayName: message.displayName ?? message.username ?? "Someone",
    avatar: message.avatar ?? member?.avatar ?? null,
    roleColor: message.roleColor ?? member?.roleColor ?? null,
    guestAvatarVariant: message.guestAvatarVariant ?? member?.guestAvatarVariant ?? 0,
    guestCoverIcon: message.guestCoverIcon ?? member?.guestCoverIcon ?? 0,
    bio: member?.bio ?? null,
    genres: member?.genres ?? [],
    level: member?.level ?? null,
    connections: [],
    hasActiveConnection: false,
    isGhost: true,
  };
}
