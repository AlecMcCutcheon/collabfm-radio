import type { DiscordBotConnection } from "../types/api";
import type { StageHostGroup } from "./stageHosts";

export function formatDiscordBotStationLabel(connection: DiscordBotConnection): string {
  if (connection.stationMode === "dj" && connection.stationRailId) {
    return connection.stationLabel?.trim() || "DJ station";
  }
  return connection.stationLabel?.trim() || "Main station";
}

export function countDiscordBotsForHost(
  host: StageHostGroup,
  botConnections: DiscordBotConnection[],
): number {
  if (!botConnections.length || !host.connections.length) return 0;

  const hostWsIds = new Set(host.connections.map((connection) => connection.wsId));
  let count = 0;
  for (const connection of botConnections) {
    if (connection.stationMode !== "dj" || !connection.stationRailId) continue;
    if (hostWsIds.has(connection.stationRailId)) {
      count += 1;
    }
  }
  return count;
}

export function buildDiscordBotCountsByHostUserId(
  hosts: StageHostGroup[],
  botConnections: DiscordBotConnection[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const host of hosts) {
    const count = countDiscordBotsForHost(host, botConnections);
    if (count > 0) counts.set(host.userId, count);
  }
  return counts;
}
