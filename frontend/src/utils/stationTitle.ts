export const DEFAULT_STATION_TITLE = "CollabFM Radio";

export function formatStationTitle(name: string, suffix?: string): string {
  const base = name.trim() || DEFAULT_STATION_TITLE;
  return suffix ? `${suffix} · ${base}` : base;
}

export function applyStationTitle(name: string, suffix?: string): void {
  document.title = formatStationTitle(name, suffix);
}

export function pageTitleSuffix(
  path: string,
  setupComplete: boolean | null,
  options?: { canBroadcast?: boolean },
): string | undefined {
  if (setupComplete === false) return "Setup";
  if (path === "/admin") return "Admin";
  if (path === "/broadcaster") {
    return options?.canBroadcast === false ? "Listener Studio" : "Broadcaster Studio";
  }
  if (/^\/listen\/[^/]+\/studio$/.test(path)) return "Guest Studio";
  if (path.startsWith("/listen/")) return "Listen";
  return undefined;
}
