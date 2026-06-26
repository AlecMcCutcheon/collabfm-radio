import type { HostMember, RelayConnection, LevelInfo } from "../types/api";

export const STAGE_SLOT_COUNT = 7;

export interface StageHostGroup {
  userId: string;
  displayName: string;
  avatar: string | null;
  roleColor: string | null;
  guestAvatarVariant?: number;
  guestCoverIcon?: number;
  bio?: string | null;
  genres?: string[];
  level?: LevelInfo | null;
  connections: RelayConnection[];
  hasActiveConnection: boolean;
  isGhost: boolean;
  onStage?: boolean;
  listening?: boolean;
}

export type StageSlot =
  | { type: "occupied"; host: StageHostGroup }
  | { type: "empty" };

export function groupStageHosts(
  connections: RelayConnection[],
  members: HostMember[],
): StageHostGroup[] {
  const byUser = new Map<string, RelayConnection[]>();
  for (const connection of connections) {
    const key = String(connection.userId);
    const list = byUser.get(key) ?? [];
    list.push(connection);
    byUser.set(key, list);
  }

  const connected: StageHostGroup[] = Array.from(byUser.entries()).map(([userId, userConnections]) => {
    const member = members.find((m) => String(m.userId) === userId);
    const connection = userConnections[0];
    return {
      userId,
      displayName: member?.displayName ?? connection?.displayName ?? userId,
      avatar:
        member?.avatar ??
        (connection as { avatarUrl?: string | null }).avatarUrl ??
        connection?.avatar ??
        null,
      roleColor: member?.roleColor ?? connection?.roleColor ?? null,
      guestAvatarVariant:
        member?.guestAvatarVariant ?? connection?.guestAvatarVariant ?? 0,
      guestCoverIcon: member?.guestCoverIcon ?? connection?.guestCoverIcon ?? 0,
      bio: member?.bio ?? connection?.bio ?? null,
      genres: member?.genres ?? connection?.genres ?? [],
      level: member?.level ?? connection?.level ?? null,
      connections: userConnections,
      hasActiveConnection: userConnections.some((c) => c.isActive),
      isGhost: false,
      onStage: true,
      listening: false,
    };
  });

  const connectedIds = new Set(connected.map((h) => h.userId));
  const ghosts: StageHostGroup[] = members
    .filter((member) => !connectedIds.has(String(member.userId)))
    .map((member) => ({
      userId: String(member.userId),
      displayName: member.displayName,
      avatar: member.avatar,
      roleColor: member.roleColor,
      guestAvatarVariant: member.guestAvatarVariant ?? 0,
      guestCoverIcon: member.guestCoverIcon ?? 0,
      bio: member.bio ?? null,
      genres: member.genres ?? [],
      level: member.level ?? null,
      connections: [],
      hasActiveConnection: false,
      isGhost: true,
      onStage: false,
      listening: false,
    }));

  return [...connected, ...ghosts];
}

/** Connected hosts only, padded with empty slots up to slotCount. */
export function buildStageSlots(
  connections: RelayConnection[],
  members: HostMember[],
  slotCount = STAGE_SLOT_COUNT,
): StageSlot[] {
  const occupied = groupStageHosts(connections, members)
    .filter((host) => !host.isGhost)
    .map((host) => ({ type: "occupied" as const, host }));

  const slots: StageSlot[] = [...occupied];
  while (slots.length < slotCount) {
    slots.push({ type: "empty" });
  }
  return slots.slice(0, slotCount);
}