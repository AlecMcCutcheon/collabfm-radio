import { extensionStorageSet } from "./extension-storage.js";

/** On-air label for paired extension auth (profile nickname, not device label). */
export function pairedAuthDisplayName(paired) {
  const name = paired?.displayName || paired?.username || paired?.label;
  return name ? String(name).trim() : "broadcaster";
}

export function formatPairedAuthStatus(paired) {
  return `Paired — ${pairedAuthDisplayName(paired)}`;
}

/** Refresh broadcaster display name from the server (Studio profile sync). */
export async function syncPairedDeviceDisplayName(paired, apiOrigin, { requireValid = false } = {}) {
  const result = await checkStoredPairing(paired, apiOrigin);
  if (result.status === "valid") {
    const next = result.paired;
    const changed =
      next.displayName !== paired.displayName ||
      next.username !== paired.username ||
      next.label !== paired.label;
    if (changed) {
      await extensionStorageSet({ pairedDevice: next });
    }
    return next;
  }
  if (result.status === "offline") return requireValid ? null : paired;
  return requireValid ? null : paired;
}

/** Distinguish revoked pairing from temporary server/network issues. */
export async function checkStoredPairing(paired, apiOrigin) {
  if (!paired?.deviceToken || !apiOrigin) return { status: "invalid" };
  try {
    const res = await fetch(`${apiOrigin}/api/extension/pair/validate`, {
      headers: { Authorization: `Bearer ${paired.deviceToken}` },
    });
    if (!res.ok) {
      return { status: "offline", paired };
    }
    const data = await res.json();
    if (!data.valid) return { status: "invalid" };
    return {
      status: "valid",
      paired: {
        ...paired,
        username: data.username ?? paired.username,
        displayName: data.displayName ?? paired.displayName,
        label: data.label ?? paired.label,
      },
    };
  } catch {
    return { status: "offline", paired };
  }
}
