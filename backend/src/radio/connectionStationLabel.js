/** Count relay connections per user (for disambiguating multi-browser DJs). */
export function buildConnectionCountByUser(wsConnections) {
  const counts = new Map();
  for (const info of wsConnections.values()) {
    const uid = String(info.userId);
    counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return counts;
}

/**
 * Label for stage / Discord station pickers.
 * When a user has multiple connections, append the device label: "DJ - Chrome".
 */
export function formatConnectionStationLabel(info, connectionCountForUser = 1) {
  const username = String(info?.displayName || "DJ").trim() || "DJ";
  const deviceLabel = String(info?.broadcastName || "").trim();

  if (connectionCountForUser > 1) {
    const suffix = deviceLabel || "Browser extension";
    return `${username} - ${suffix}`.slice(0, 100);
  }

  return username.slice(0, 100);
}
