/** Safe chrome.storage.local access (offscreen/popup/service worker). */

export function getExtensionStorageLocal() {
  try {
    return globalThis.chrome?.storage?.local ?? globalThis.browser?.storage?.local ?? null;
  } catch {
    return null;
  }
}

export async function extensionStorageGet(keys) {
  const local = getExtensionStorageLocal();
  if (!local?.get) return {};
  return local.get(keys);
}

export async function extensionStorageSet(items) {
  const local = getExtensionStorageLocal();
  if (!local?.set) return false;
  await local.set(items);
  return true;
}

export async function extensionStorageRemove(keys) {
  const local = getExtensionStorageLocal();
  if (!local?.remove) return false;
  await local.remove(keys);
  return true;
}
