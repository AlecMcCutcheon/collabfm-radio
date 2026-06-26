import type { PresenceMember } from "../types/api";

const ROLE_ORDER = ["admin", "broadcaster", "listener", "guest"] as const;

export const PRESENCE_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  broadcaster: "Broadcaster",
  listener: "Listener",
  guest: "Guest",
};

export interface PresenceRoleGroup {
  roleType: string;
  label: string;
  members: PresenceMember[];
}

function normalizeRole(member: PresenceMember): string {
  if (member.isGuest || member.roleType === "guest") return "guest";
  return String(member.roleType || "listener").toLowerCase();
}

function roleRank(roleType: string): number {
  const idx = ROLE_ORDER.indexOf(roleType as (typeof ROLE_ORDER)[number]);
  return idx >= 0 ? idx : ROLE_ORDER.length;
}

export function comparePresenceMembers(a: PresenceMember, b: PresenceMember): number {
  const roleDiff = roleRank(normalizeRole(a)) - roleRank(normalizeRole(b));
  if (roleDiff !== 0) return roleDiff;
  const levelDiff = (b.level ?? 0) - (a.level ?? 0);
  if (levelDiff !== 0) return levelDiff;
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

export function groupPresenceMembers(members: PresenceMember[]): PresenceRoleGroup[] {
  const sorted = [...members].sort(comparePresenceMembers);
  const groups: PresenceRoleGroup[] = [];

  for (const member of sorted) {
    const roleType = normalizeRole(member);
    const last = groups[groups.length - 1];
    if (last?.roleType === roleType) {
      last.members.push(member);
    } else {
      groups.push({
        roleType,
        label: PRESENCE_ROLE_LABELS[roleType] ?? roleType,
        members: [member],
      });
    }
  }

  return groups;
}
