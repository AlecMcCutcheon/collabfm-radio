const CLIENT_ID_KEY = "radioPresenceClientId_v1";

export function getPresenceClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
