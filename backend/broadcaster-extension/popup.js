import { resolveRadioEndpoints, isSameRadioHost, normalizeApiOrigin, isRadioConnectionTabUrl, DEFAULT_RADIO_HOST } from "./radio-config.js";
import {
  parseShareToken,
  resolveGuestIdentity,
  syncGuestAuthDisplayName,
  formatGuestAuthStatus,
  checkStoredGuestAuth,
} from "./guest-auth.js";
import { formatPairedAuthStatus, syncPairedDeviceDisplayName, checkStoredPairing } from "./pair-auth.js";
import { extensionLog } from "./extension-log.js";

const STREAM_VOLUME = 1;
const GUEST_FORM_DRAFT_KEY = "guestFormDraft";

const STATUS_ICON = {
  info: "fa-solid fa-circle-info",
  success: "fa-solid fa-circle-check",
  error: "fa-solid fa-circle-exclamation",
  broadcasting: "fa-solid fa-tower-broadcast",
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStatusContent(text, type = "info") {
  const icon = STATUS_ICON[type] || STATUS_ICON.info;
  return `<span class="status-with-icon"><i class="${icon}" aria-hidden="true"></i><span>${escapeHtml(text)}</span></span>`;
}

function isBroadcastableTab(tab, connectionInput) {
  if (!tab?.url) return false;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) return false;
  return !isRadioConnectionTabUrl(tab.url, connectionInput);
}

let selectedTabId = null;
let userPickedTab = false;
let isBroadcasting = false;
let broadcastingTabId = null;
let isAuthenticated = false;
let hasBroadcasterRole = false;
let pairPollTimer = null;
let currentPairing = null;
let authMode = "pair";

window.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.local.get([
    "radioHost",
    "relayUrl",
    "pairedDevice",
    "guestAuth",
    "authMode",
  ]);

  authMode = settings.authMode === "guest" ? "guest" : "pair";
  setAuthModeUi(authMode);

  const defaultHost = settings.radioHost || DEFAULT_RADIO_HOST;
  document.getElementById("radioHost").value = defaultHost;

  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_BROADCAST_STATUS" });
    if (response && response.status === "connected") {
      isBroadcasting = true;
      broadcastingTabId = response.tabId;
      selectedTabId = response.tabId;
      await updateBroadcastButton();
      updateStatus("Broadcasting", "broadcasting");
      document.getElementById("metadataDisplay").style.display = "block";
      try {
        await chrome.runtime.sendMessage({ type: "GET_CURRENT_METADATA" });
      } catch {}
    }
  } catch {
  }

  if (!isBroadcasting) {
    const stored = await chrome.storage.local.get(["rememberedTabId"]);
    if (stored.rememberedTabId) {
      selectedTabId = stored.rememberedTabId;
      userPickedTab = true;
      await updateBroadcastButton();
      try {
        const tab = await chrome.tabs.get(selectedTabId);
        if (tab.active) {
          updateStatus("Ready to broadcast", "success");
        } else {
          updateStatus("Switch to selected tab to start", "info");
        }
      } catch {
        await chrome.storage.local.remove("rememberedTabId");
        selectedTabId = null;
        userPickedTab = false;
      }
    }

    if (!selectedTabId) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        const radioHost = document.getElementById("radioHost").value.trim();
        if (activeTab && isBroadcastableTab(activeTab, radioHost)) {
          selectedTabId = activeTab.id;
          userPickedTab = false;
          await updateBroadcastButton();
          updateStatus("Ready to broadcast", "success");
        }
      } catch {}
    }
  }

  setTimeout(() => {
    refreshTabs();
  }, 100);

  await refreshAuthState();

  document.getElementById("authModePairBtn")?.addEventListener("click", () => void switchAuthMode("pair"));
  document.getElementById("authModeGuestBtn")?.addEventListener("click", () => void switchAuthMode("guest"));
  document.getElementById("guestConnectBtn")?.addEventListener("click", () => void connectGuestLink());
  document.getElementById("guestDisconnectBtn")?.addEventListener("click", () => void clearGuestAuth(true));
  document.getElementById("guestCopyIdBtn")?.addEventListener("click", () => void copyGuestLinkedId());

  document.getElementById("refreshPairBtn")?.addEventListener("click", async () => {
    await startNewPairing();
  });

  document.getElementById("unpairBtn")?.addEventListener("click", async () => {
    if (authMode === "guest") {
      await clearGuestAuth(true);
      return;
    }
    await chrome.storage.local.remove(["pairedDevice", "pendingPair"]);
    await startNewPairing();
  });

  document.getElementById("openRadioBtn")?.addEventListener("click", async () => {
    try {
      const { webOrigin, apiOrigin } = getEndpoints();
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find((t) => {
        try {
          const u = new URL(t.url || "");
          const target = new URL(webOrigin);
          return u.origin === target.origin;
        } catch {
          return false;
        }
      });
      if (existing) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId !== undefined) {
          try {
            await chrome.windows.update(existing.windowId, { focused: true });
          } catch {}
        }
        return;
      }
          await chrome.tabs.create({ url: isAuthenticated ? `${webOrigin}/` : `${webOrigin}/broadcaster` });
    } catch (e) {
      console.log("Open Radio failed:", e);
    }
  });
});

window.addEventListener("beforeunload", () => {
  if (pairPollTimer) clearInterval(pairPollTimer);
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (guestDraftTimer) clearTimeout(guestDraftTimer);
  void autosave();
  void saveGuestFormDraft();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void saveGuestFormDraft();
  }
});

function getEndpoints() {
  const radioHost = document.getElementById("radioHost").value.trim() || DEFAULT_RADIO_HOST;
  return resolveRadioEndpoints(radioHost);
}

async function clearStoredPairing() {
  await chrome.storage.local.remove(["pairedDevice", "pendingPair"]);
  isAuthenticated = false;
  hasBroadcasterRole = false;
}

async function clearGuestAuth(showForm = false) {
  if (isBroadcasting) {
    await stopBroadcast();
  }
  await chrome.storage.local.remove(["guestAuth"]);
  isAuthenticated = false;
  hasBroadcasterRole = false;
  setGuestFormVisible(showForm);
  if (showForm) {
    updateAuthStatus("Paste a guest broadcaster link", "info");
    await loadGuestFormDraft();
    await prefillGuestLinkFromActiveTab();
  }
  updateBroadcastButton();
}

function setAuthModeUi(mode) {
  authMode = mode === "guest" ? "guest" : "pair";
  const pairBtn = document.getElementById("authModePairBtn");
  const guestBtn = document.getElementById("authModeGuestBtn");
  if (pairBtn) pairBtn.classList.toggle("active", authMode === "pair");
  if (guestBtn) guestBtn.classList.toggle("active", authMode === "guest");
  const guestSection = document.getElementById("guestSection");
  if (guestSection) guestSection.style.display = authMode === "guest" ? "block" : "none";
  if (authMode === "pair") {
    setGuestFormVisible(false);
  }
}

function setGuestFormVisible(showInputs) {
  const linkTitle = document.getElementById("guestLinkTitle");
  const linkHint = document.getElementById("guestLinkHint");
  const linkEl = document.getElementById("guestShareLink");
  const idEl = document.getElementById("guestGuestId");
  const connectBtn = document.getElementById("guestConnectBtn");
  const disconnectBtn = document.getElementById("guestDisconnectBtn");
  const linkedRow = document.getElementById("guestLinkedIdRow");
  if (linkTitle) linkTitle.style.display = showInputs ? "block" : "none";
  if (linkHint) linkHint.style.display = showInputs ? "block" : "none";
  if (linkEl) linkEl.style.display = showInputs ? "block" : "none";
  if (idEl) idEl.style.display = showInputs ? "block" : "none";
  if (connectBtn) connectBtn.style.display = showInputs ? "block" : "none";
  if (disconnectBtn) disconnectBtn.style.display = showInputs ? "none" : "block";
  if (linkedRow) linkedRow.style.display = showInputs ? "none" : "block";
}

function updateGuestLinkedId(guestId) {
  const el = document.getElementById("guestLinkedIdValue");
  if (el) el.textContent = guestId || "—";
}

async function copyGuestLinkedId() {
  const el = document.getElementById("guestLinkedIdValue");
  const text = el?.textContent?.trim();
  if (!text || text === "—") return;
  try {
    await navigator.clipboard.writeText(text);
    updateAuthStatus("Guest ID copied — paste on the website to link", "success");
  } catch {
    updateAuthStatus("Could not copy guest ID", "error");
  }
}

async function switchAuthMode(mode) {
  const next = mode === "guest" ? "guest" : "pair";
  if (authMode === next) return;
  stopPairPolling();
  authMode = next;
  await chrome.storage.local.set({ authMode: next });
  setAuthModeUi(next);
  isAuthenticated = false;
  hasBroadcasterRole = false;
  if (next === "guest") {
    await chrome.storage.local.remove(["pairedDevice", "pendingPair"]);
    setPairingVisible(false);
    await refreshGuestAuthState();
  } else {
    await chrome.storage.local.remove(["guestAuth"]);
    await refreshPairingState();
  }
  updateBroadcastButton();
}

async function loadGuestFormDraft() {
  const linkEl = document.getElementById("guestShareLink");
  const idEl = document.getElementById("guestGuestId");
  if (!linkEl && !idEl) return;

  const radioHost = document.getElementById("radioHost").value.trim() || DEFAULT_RADIO_HOST;
  const stored = await chrome.storage.local.get([GUEST_FORM_DRAFT_KEY]);
  const draft = stored[GUEST_FORM_DRAFT_KEY];

  if (draft && isSameRadioHost(draft.radioHost || DEFAULT_RADIO_HOST, radioHost)) {
    if (linkEl) linkEl.value = draft.shareLink || "";
    if (idEl) idEl.value = draft.guestId || "";
  } else {
    if (linkEl) linkEl.value = "";
    if (idEl) idEl.value = "";
  }
}

async function saveGuestFormDraft() {
  const radioHost = document.getElementById("radioHost").value.trim() || DEFAULT_RADIO_HOST;
  const shareLink = document.getElementById("guestShareLink")?.value || "";
  const guestId = document.getElementById("guestGuestId")?.value || "";
  if (!shareLink.trim() && !guestId.trim()) {
    await chrome.storage.local.remove(GUEST_FORM_DRAFT_KEY);
    return;
  }
  await chrome.storage.local.set({
    [GUEST_FORM_DRAFT_KEY]: { radioHost, shareLink, guestId },
  });
}

async function clearGuestFormDraft() {
  await chrome.storage.local.remove(GUEST_FORM_DRAFT_KEY);
}

async function prefillGuestLinkFromActiveTab() {
  const linkEl = document.getElementById("guestShareLink");
  if (!linkEl || linkEl.value.trim()) return;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url || "";
    if (url.includes("/listen/")) linkEl.value = url;
  } catch {}
}

async function refreshGuestAuthState() {
  const { apiOrigin } = getEndpoints();
  const normalizedOrigin = normalizeApiOrigin(apiOrigin);
  const stored = await chrome.storage.local.get(["guestAuth"]);

  if (authMode !== "guest") return;

  setPairingVisible(false);
  const guestAuth = stored.guestAuth;
  if (
    guestAuth?.shareToken &&
    guestAuth?.guestId &&
    guestAuth?.guestName &&
    normalizeApiOrigin(guestAuth.apiOrigin) === normalizedOrigin
  ) {
    const result = await checkStoredGuestAuth(guestAuth, normalizedOrigin);
    if (result.status === "valid") {
      const synced = await syncGuestAuthDisplayName(result.guestAuth, normalizedOrigin);
      await chrome.storage.local.set({ guestAuth: synced });
      isAuthenticated = true;
      hasBroadcasterRole = true;
      setGuestFormVisible(false);
      updateGuestLinkedId(synced.guestId);
      updateAuthStatus(formatGuestAuthStatus(synced), "success");
      updateBroadcastButton();
      return;
    }
    if (result.status === "offline") {
      isAuthenticated = true;
      hasBroadcasterRole = true;
      setGuestFormVisible(false);
      updateGuestLinkedId(guestAuth.guestId);
      updateAuthStatus(`${formatGuestAuthStatus(guestAuth)} — server unreachable`, "error");
      updateBroadcastButton();
      return;
    }
    if (isBroadcasting) {
      await stopBroadcast();
    }
    await chrome.storage.local.remove(["guestAuth"]);
    isAuthenticated = false;
    hasBroadcasterRole = false;
    setGuestFormVisible(true);
    updateAuthStatus("Guest link expired — paste a new one", "error");
    await loadGuestFormDraft();
    updateBroadcastButton();
    return;
  }

  setGuestFormVisible(true);
  updateAuthStatus("Paste a guest broadcaster link", "info");
  await loadGuestFormDraft();
  await prefillGuestLinkFromActiveTab();
  updateBroadcastButton();
}

async function connectGuestLink() {
  const { apiOrigin } = getEndpoints();
  const normalizedOrigin = normalizeApiOrigin(apiOrigin);
  const rawLink = document.getElementById("guestShareLink")?.value || "";
  const guestIdDraft = document.getElementById("guestGuestId")?.value || "";
  const shareToken = parseShareToken(rawLink);
  if (!shareToken) {
    updateAuthStatus("Paste a valid share link", "error");
    return;
  }

  updateAuthStatus("Checking link…", "info");
  try {
    const res = await fetch(`${normalizedOrigin}/api/extension/guest/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      updateAuthStatus(data.error || "Not a valid guest broadcaster link", "error");
      return;
    }
    const guestIdentity = await resolveGuestIdentity(shareToken, { guestIdDraft });
    let guestAuth = {
      apiOrigin: normalizedOrigin,
      shareToken,
      guestId: guestIdentity.guestId,
      guestName: guestIdentity.guestName,
      label: data.label || null,
      expiresAt: data.expiresAt || null,
    };
    guestAuth = await syncGuestAuthDisplayName(guestAuth, normalizedOrigin);
    await chrome.storage.local.set({
      guestAuth,
      authMode: "guest",
      radioHost: document.getElementById("radioHost").value.trim(),
      pendingPair: null,
      pairedDevice: null,
    });
    await clearGuestFormDraft();
    isAuthenticated = true;
    hasBroadcasterRole = true;
    setGuestFormVisible(false);
    updateGuestLinkedId(guestAuth.guestId);
    updateAuthStatus(formatGuestAuthStatus(guestAuth), "success");
    updateBroadcastButton();
  } catch (error) {
    console.error("Guest connect error:", error);
    updateAuthStatus("Cannot reach radio server", "error");
  }
}

async function refreshAuthState() {
  if (authMode === "guest") {
    await refreshGuestAuthState();
  } else {
    await refreshPairingState();
  }
}

async function refreshPairingState() {
  if (authMode !== "pair") return;

  const { apiOrigin } = getEndpoints();
  const normalizedOrigin = normalizeApiOrigin(apiOrigin);
  const stored = await chrome.storage.local.get(["pairedDevice", "pendingPair"]);

  const paired = stored.pairedDevice;
  if (paired?.deviceToken && normalizeApiOrigin(paired.apiOrigin) === normalizedOrigin) {
    const result = await checkStoredPairing(paired, normalizedOrigin);
    if (result.status === "valid") {
      await chrome.storage.local.set({ pairedDevice: result.paired });
      isAuthenticated = true;
      hasBroadcasterRole = true;
      setPairingVisible(false);
      updateAuthStatus(formatPairedAuthStatus(result.paired), "success");
      updateBroadcastButton();
      return;
    }
    if (result.status === "offline") {
      isAuthenticated = true;
      hasBroadcasterRole = true;
      setPairingVisible(false);
      updateAuthStatus(`${formatPairedAuthStatus(paired)} — server unreachable`, "error");
      updateBroadcastButton();
      return;
    }
    await clearStoredPairing();
  }

  const pending = stored.pendingPair;
  if (pending?.deviceId && normalizeApiOrigin(pending.apiOrigin) === normalizedOrigin) {
    currentPairing = pending;
    setPairingVisible(true);
    if (pending.expiresAt > Date.now()) {
      updatePairingUi(pending.userCode, "Enter this code in Broadcaster Studio on the radio site");
      updateAuthStatus("Waiting for approval on the radio site", "info");
      startPairPolling(pending.deviceId, normalizedOrigin, true);
    } else {
      updatePairingUi(pending.userCode, "Pairing code expired — tap Refresh for a new code");
      updateAuthStatus("Pairing code expired", "error");
    }
    updateBroadcastButton();
    return;
  }

  setPairingVisible(true);
  const hasAnyStoredPairing = Boolean(stored.pairedDevice?.deviceToken || stored.pendingPair?.deviceId);
  if (hasAnyStoredPairing) {
    updatePairingUi(null, "Tap Refresh to generate a pairing code for this server");
    updateAuthStatus("No pairing for this server address", "info");
    updateBroadcastButton();
    return;
  }

  await startNewPairing();
}

async function startNewPairing() {
  stopPairPolling();
  isAuthenticated = false;
  hasBroadcasterRole = false;
  updateBroadcastButton();
  setPairingVisible(true);

  const { apiOrigin } = getEndpoints();
  const normalizedOrigin = normalizeApiOrigin(apiOrigin);
  try {
    const res = await fetch(`${normalizedOrigin}/api/extension/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      updateAuthStatus("Cannot reach radio server — pairing kept", "error");
      const stored = await chrome.storage.local.get(["pendingPair"]);
      const pending = stored.pendingPair;
      if (pending?.userCode && normalizeApiOrigin(pending.apiOrigin) === normalizedOrigin) {
        updatePairingUi(pending.userCode, "Server unreachable — code kept, try again later");
      } else {
        updatePairingUi(null, "Server unreachable — tap Refresh when the server is back");
      }
      return;
    }
    const data = await res.json();
    const pendingPair = {
      deviceId: data.deviceId,
      userCode: data.userCode,
      apiOrigin: normalizedOrigin,
      expiresAt: Date.now() + (data.expiresIn || 600000),
    };
    currentPairing = pendingPair;
    await chrome.storage.local.set({ pendingPair });
    updatePairingUi(data.userCode, "Enter this code in Broadcaster Studio on the radio site");
    updateAuthStatus("Waiting for approval on the radio site", "info");
    startPairPolling(data.deviceId, normalizedOrigin, true);
  } catch (error) {
    console.error("Pair start error:", error);
    updateAuthStatus("Cannot reach radio server — pairing kept", "error");
    const stored = await chrome.storage.local.get(["pendingPair"]);
    const pending = stored.pendingPair;
    if (pending?.userCode && normalizeApiOrigin(pending.apiOrigin) === normalizedOrigin) {
      updatePairingUi(pending.userCode, "Server unreachable — code kept, try again later");
    } else {
      updatePairingUi(null, "Server unreachable — tap Refresh when the server is back");
    }
  }
}

async function pollPairOnce(deviceId, apiOrigin) {
  const res = await fetch(
    `${apiOrigin}/api/extension/pair/poll?deviceId=${encodeURIComponent(deviceId)}`,
  );
  if (!res.ok) {
    throw new Error(`Poll failed: HTTP ${res.status}`);
  }
  return res.json();
}

async function completePairing(data, deviceId, apiOrigin) {
  stopPairPolling();
  const pairedDevice = {
    apiOrigin,
    deviceToken: data.deviceToken,
    deviceId,
    username: data.username || null,
    displayName: data.displayName || null,
    label: data.label || null,
  };
  await chrome.storage.local.set({
    pairedDevice,
    authMode: "pair",
    radioHost: document.getElementById("radioHost").value.trim(),
    pendingPair: null,
    guestAuth: null,
  });
  try {
    await fetch(`${apiOrigin}/api/extension/pair/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
  } catch {}
  isAuthenticated = true;
  hasBroadcasterRole = true;
  setPairingVisible(false);
  updateAuthStatus(formatPairedAuthStatus(pairedDevice), "success");
  updateBroadcastButton();
}

function startPairPolling(deviceId, apiOrigin, pollImmediately = false) {
  stopPairPolling();

  const runPoll = async () => {
    try {
      const data = await pollPairOnce(deviceId, apiOrigin);
      if (data.status === "expired" || data.status === "revoked") {
        stopPairPolling();
        await chrome.storage.local.remove("pendingPair");
        if (data.status === "revoked") {
          await clearStoredPairing();
          updateAuthStatus("Pairing was revoked — pair again on the radio site", "error");
        } else {
          updateAuthStatus("Pairing code expired — generating new code", "error");
        }
        await startNewPairing();
        return;
      }
      if (data.status === "paired" && data.deviceToken) {
        await completePairing(data, deviceId, apiOrigin);
      }
    } catch (error) {
      console.log("Pair poll error:", error);
    }
  };

  if (pollImmediately) {
    void runPoll();
  }
  pairPollTimer = setInterval(runPoll, 2000);
}

function stopPairPolling() {
  if (pairPollTimer) {
    clearInterval(pairPollTimer);
    pairPollTimer = null;
  }
}

function setPairingVisible(visible) {
  const section = document.getElementById("pairingSection");
  const show = visible && authMode === "pair";
  if (section) section.style.display = show ? "block" : "none";
  const unpairBtn = document.getElementById("unpairBtn");
  if (unpairBtn) {
    unpairBtn.style.display = !show && authMode === "pair" && isAuthenticated ? "block" : "none";
    unpairBtn.textContent = "Pair a different device";
  }
}

function updatePairingUi(userCode, subtitle) {
  const codeEl = document.getElementById("pairCode");
  const subEl = document.getElementById("pairSubtitle");
  if (codeEl) codeEl.textContent = userCode || "— — — —";
  if (subEl) subEl.textContent = subtitle || "";
}

function updateAuthStatus(message, type) {
  const authStatusEl = document.getElementById("authStatus");
  authStatusEl.className = `auth-status ${type}`;
  authStatusEl.innerHTML = renderStatusContent(message, type);
}

function tabUrlSupportsMediaControls(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "music.youtube.com" || hostname === "soundcloud.com";
  } catch {
    return false;
  }
}

async function tabSupportsMediaControls(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_MEDIA_CAPABILITIES" });
    if (response?.supportsMediaControls) return true;
  } catch {}
  try {
    const tab = await chrome.tabs.get(tabId);
    return tabUrlSupportsMediaControls(tab.url);
  } catch {
    return false;
  }
}

function createTabMediaControls(tabId) {
  const bar = document.createElement("div");
  bar.className = "tab-media-controls";
  [
    { action: "previous", label: "⏮", title: "Previous" },
    { action: "playPause", label: "⏯", title: "Play/Pause" },
    { action: "next", label: "⏭", title: "Next" },
  ].forEach(({ action, label, title }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "media-ctrl-btn";
    btn.title = title;
    btn.textContent = label;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMediaControl(action, tabId);
    });
    bar.appendChild(btn);
  });
  return bar;
}

async function refreshTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    let activeInWindow = null;
    try {
      const activeArr = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeArr && activeArr.length > 0) activeInWindow = activeArr[0];
    } catch {}
    const tabList = document.getElementById("tabList");
    const radioHost = document.getElementById("radioHost").value.trim();

    const allValidTabs = tabs.filter((tab) => isBroadcastableTab(tab, radioHost));

    const validTabs = allValidTabs
      .filter(
        (tab) =>
          tab.active ||
          (broadcastingTabId && tab.id === broadcastingTabId) ||
          (selectedTabId && tab.id === selectedTabId),
      )
      .sort((a, b) => {
        if (broadcastingTabId) {
          if (a.id === broadcastingTabId && b.id !== broadcastingTabId) return -1;
          if (b.id === broadcastingTabId && a.id !== broadcastingTabId) return 1;
        }
        return (b.lastAccessed || 0) - (a.lastAccessed || 0);
      });

    if (validTabs.length === 0) {
      let message = "No active tabs found. Switch to a tab to see it here!";
      try {
        if (activeInWindow?.url) {
          if (activeInWindow.url.startsWith("chrome://") || activeInWindow.url.startsWith("chrome-extension://")) {
            message = "This tab cannot be captured. Switch to a regular website tab.";
          } else if (isRadioConnectionTabUrl(activeInWindow.url, radioHost)) {
            message = "The radio site tab can't be broadcast. Switch to your music tab.";
          }
        }
      } catch {}
      tabList.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    tabList.innerHTML = "";
    for (const tab of validTabs) {
      const tabItem = document.createElement("div");
      tabItem.className = "tab-item";
      tabItem.dataset.tabId = tab.id;
      if (tab.id === selectedTabId) tabItem.classList.add("selected");
      if (tab.id === broadcastingTabId) tabItem.classList.add("broadcasting");

      const tabItemMain = document.createElement("div");
      tabItemMain.className = "tab-item-main";

      const favicon = document.createElement("img");
      favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="12" font-size="12">🌐</text></svg>';

      const tabInfo = document.createElement("div");
      tabInfo.className = "tab-info";
      const title = document.createElement("div");
      title.className = "tab-title";
      title.textContent = tab.title || "Untitled";
      const url = document.createElement("div");
      url.className = "tab-url";
      try {
        const urlObj = new URL(tab.url);
        url.textContent = urlObj.hostname + urlObj.pathname;
      } catch {
        url.textContent = tab.url;
      }
      tabInfo.appendChild(title);
      tabInfo.appendChild(url);
      tabItemMain.appendChild(favicon);
      tabItemMain.appendChild(tabInfo);

      if (tab.id === broadcastingTabId) {
        const indicator = document.createElement("div");
        indicator.className = "broadcast-indicator";
        indicator.innerHTML = '<i class="fa-solid fa-circle" style="color:#ef4444"></i><span> LIVE</span>';
        tabItemMain.appendChild(indicator);
      } else if (tab.audible) {
        const indicator = document.createElement("div");
        indicator.className = "audio-indicator";
        indicator.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        tabItemMain.appendChild(indicator);
      }

      if (isBroadcasting && tab.id !== broadcastingTabId) {
        const switchBadge = document.createElement("div");
        switchBadge.className = "switch-badge";
        switchBadge.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i><span>Switch</span>';
        switchBadge.addEventListener("click", async (e) => {
          e.stopPropagation();
          await switchToTab(tab.id);
        });
        tabItemMain.appendChild(switchBadge);
      }

      tabItem.appendChild(tabItemMain);

      if (isBroadcasting && tab.id === broadcastingTabId && (await tabSupportsMediaControls(tab.id))) {
        tabItem.appendChild(createTabMediaControls(tab.id));
      }

      tabItem.addEventListener("click", () => {
        if (isBroadcasting && tab.id !== broadcastingTabId) return;
        selectTab(tab.id, tabItem);
      });
      tabList.appendChild(tabItem);
    }

    if (selectedTabId && !validTabs.some((tab) => tab.id === selectedTabId)) {
      selectedTabId = null;
      userPickedTab = false;
      if (!isBroadcasting) {
        await updateBroadcastButton();
      }
    }
  } catch (error) {
    console.error("Error fetching tabs:", error);
    updateStatus("Error loading tabs", "error");
  }
}

setInterval(() => {
  refreshTabs();
}, 5000);

async function selectTab(tabId, clickedElement = null) {
  selectedTabId = tabId;
  userPickedTab = true;
  document.querySelectorAll(".tab-item").forEach((item) => item.classList.remove("selected"));
  if (clickedElement) {
    clickedElement.classList.add("selected");
  } else {
    document.querySelectorAll(".tab-item").forEach((item) => {
      if (item.dataset.tabId === tabId.toString()) item.classList.add("selected");
    });
  }
  updateStatus("Ready to broadcast", "success");
  await updateBroadcastButton();
}

async function switchToTab(tabId) {
  if (!isBroadcasting) {
    updateStatus("Not currently broadcasting", "error");
    return;
  }
  try {
    updateStatus("Switching to new tab…", "info");
    const newStreamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const response = await chrome.runtime.sendMessage({
      type: "SWITCH_TAB",
      tabId,
      streamId: newStreamId,
      volume: STREAM_VOLUME,
    });
    if (response?.success) {
      broadcastingTabId = tabId;
      selectedTabId = tabId;
      updateStatus(
        response.audioCaptureFailed ? "Tab switched (audio capture issue)" : "Switched to new tab",
        response.audioCaptureFailed ? "error" : "success",
      );
      setTimeout(() => refreshTabs(), 100);
    } else {
      updateStatus(`Tab switch failed: ${response?.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    updateStatus(`Error switching tab: ${error.message}`, "error");
  }
}

document.getElementById("broadcastBtn").addEventListener("click", async () => {
  const btn = document.getElementById("broadcastBtn");
  if (btn.disabled) return;
  if (isBroadcasting) {
    await stopBroadcast();
  } else {
    try {
      const tab = await chrome.tabs.get(selectedTabId);
      if (!tab.active) {
        await chrome.storage.local.set({ rememberedTabId: selectedTabId });
        await chrome.tabs.update(selectedTabId, { active: true });
        updateStatus("Tab switched — open the extension again to start", "success");
        return;
      }
    } catch {}
    await startBroadcast();
  }
});

async function startBroadcast() {
  const btn = document.getElementById("broadcastBtn");
  if (!isAuthenticated || !hasBroadcasterRole) {
    updateStatus(
      authMode === "guest" ? "Connect with a guest broadcaster link first" : "Pair the extension on the radio site first",
      "error",
    );
    return;
  }
  if (!selectedTabId) {
    updateStatus("Please select a tab first", "error");
    return;
  }

  const { wsUrl, apiOrigin } = getEndpoints();
  const stored = await chrome.storage.local.get(["pairedDevice", "guestAuth"]);
  const paired = stored.pairedDevice;
  const guestAuth = authMode === "guest" ? stored.guestAuth : null;

  try {
    await chrome.storage.local.set({
      radioHost: document.getElementById("radioHost").value.trim(),
      relayUrl: wsUrl,
      apiOrigin,
    });
  } catch {}

  try {
    btn.disabled = true;
    btn.textContent = "Starting…";
    btn.className = "btn-broadcast-locked";
    updateStatus("Preparing to broadcast…", "info");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: selectedTabId });
    if (!streamId) throw new Error("Failed to get stream ID");

    btn.textContent = "Connecting…";
    updateStatus("Connecting to relay server…", "info");

    const response = await chrome.runtime.sendMessage({
      type: "START_BROADCAST",
      tabId: selectedTabId,
      streamId,
      relayUrl: wsUrl,
      apiOrigin,
      deviceToken: guestAuth ? null : paired?.deviceToken || null,
      guestAuth: guestAuth || null,
      volume: STREAM_VOLUME,
    });

    if (response?.success) {
      isBroadcasting = true;
      broadcastingTabId = selectedTabId;
      await chrome.storage.local.remove("rememberedTabId");
      btn.textContent = "Stop broadcasting";
      btn.className = "btn-broadcast-stop";
      btn.disabled = false;
      updateStatus("Broadcasting", "broadcasting");
      document.getElementById("metadataDisplay").style.display = "block";
      extensionLog("popup", "Broadcast started", { tabId: selectedTabId });
      try {
        await chrome.runtime.sendMessage({ type: "GET_CURRENT_METADATA" });
      } catch {}
      setTimeout(() => refreshTabs(), 100);
    } else {
      throw new Error(response?.error || "Failed to start broadcast");
    }
  } catch (error) {
    updateStatus(error.message || "Unknown error", "error");
    isBroadcasting = false;
    broadcastingTabId = null;
    btn.disabled = false;
    await updateBroadcastButton();
  }
}

async function stopBroadcast() {
  const btn = document.getElementById("broadcastBtn");
  try {
    btn.disabled = true;
    btn.textContent = "Stopping…";
    btn.className = "btn-broadcast-locked";
    updateStatus("Stopping broadcast…", "info");
    await chrome.runtime.sendMessage({ type: "STOP_BROADCAST" });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    isBroadcasting = false;
    broadcastingTabId = null;
    await chrome.storage.local.remove("rememberedTabId");
    btn.disabled = false;
    await updateBroadcastButton();
    updateStatus("Stopped — ready to start again", "success");
    refreshTabs();
  } catch (error) {
    updateStatus(`Error stopping: ${error.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Stop broadcasting";
    btn.className = "btn-broadcast-stop";
  }
}

async function updateBroadcastButton() {
  const btn = document.getElementById("broadcastBtn");
  if (!isAuthenticated || !hasBroadcasterRole) {
    btn.textContent = authMode === "guest" ? "Connect guest link first" : "Pair extension first";
    btn.className = "btn-broadcast-locked";
    btn.disabled = true;
    return;
  }
  if (isBroadcasting) {
    btn.textContent = "Stop broadcasting";
    btn.className = "btn-broadcast-stop";
    btn.disabled = false;
    return;
  }
  if (selectedTabId) {
    try {
      const tab = await chrome.tabs.get(selectedTabId);
      btn.textContent = tab.active ? "Start broadcasting" : "Switch to tab";
      btn.className = tab.active ? "btn-broadcast-idle" : "btn-primary";
      btn.disabled = false;
    } catch {
      btn.textContent = "Start broadcasting";
      btn.className = "btn-broadcast-idle";
      btn.disabled = false;
    }
  } else {
    btn.textContent = "Start broadcasting";
    btn.className = "btn-broadcast-idle";
    btn.disabled = true;
  }
}

async function autosave() {
  const radioHost = document.getElementById("radioHost").value.trim();
  const { wsUrl, apiOrigin } = resolveRadioEndpoints(radioHost);
  await chrome.storage.local.set({ radioHost, relayUrl: wsUrl, apiOrigin });
}

let autosaveTimer = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, 250);
}

let guestDraftTimer = null;
function scheduleGuestDraftSave() {
  if (guestDraftTimer) clearTimeout(guestDraftTimer);
  guestDraftTimer = setTimeout(() => void saveGuestFormDraft(), 250);
}

["radioHost"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", scheduleAutosave);
  el.addEventListener("change", scheduleAutosave);
});

["guestShareLink", "guestGuestId"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", scheduleGuestDraftSave);
  el.addEventListener("change", scheduleGuestDraftSave);
  el.addEventListener("blur", () => void saveGuestFormDraft());
});

document.getElementById("radioHost")?.addEventListener("change", async () => {
  await refreshAuthState();
  await refreshTabs();
});

function updateStatus(_text, type = "info") {
  if (type !== "error") return;
}

function updateMetadataDisplay(metadata) {
  const metadataDisplay = document.getElementById("metadataDisplay");
  const titleEl = document.getElementById("metadataTitle");
  const artistEl = document.getElementById("metadataArtist");
  const artworkImgEl = document.getElementById("metadataArtworkImg");
  const artworkPhEl = document.getElementById("metadataArtworkPlaceholder");

  if (!isBroadcasting) {
    metadataDisplay.style.display = "none";
    return;
  }

  metadataDisplay.style.display = "block";

  if (!metadata?.title || !metadata?.artist) {
    titleEl.textContent = "Waiting for track info…";
    artistEl.textContent = "—";
    if (artworkImgEl) artworkImgEl.style.display = "none";
    if (artworkPhEl) artworkPhEl.style.display = "inline";
    return;
  }

  titleEl.textContent = metadata.title;
  artistEl.textContent = metadata.artist;
  if (metadata.albumArt && artworkImgEl) {
    artworkImgEl.src = metadata.albumArt;
    artworkImgEl.onload = () => {
      artworkImgEl.style.display = "block";
      if (artworkPhEl) artworkPhEl.style.display = "none";
    };
  } else if (artworkImgEl) {
    artworkImgEl.style.display = "none";
    if (artworkPhEl) artworkPhEl.style.display = "inline";
  }
}

function hideMetadataDisplay() {
  document.getElementById("metadataDisplay").style.display = "none";
}

async function sendMediaControl(action, tabId = broadcastingTabId) {
  if (!isBroadcasting || !tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "MEDIA_CONTROL", action });
  } catch (error) {
    console.log(`Media control "${action}" failed:`, error);
  }
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "BROADCAST_STATUS_UPDATE") {
    if (message.status === "disconnected") {
      isBroadcasting = false;
      broadcastingTabId = null;
      hideMetadataDisplay();
      await updateBroadcastButton();
      updateStatus("Connection lost", "error");
    } else if (message.status === "connected" && message.tabSwitched) {
      broadcastingTabId = message.tabId;
      selectedTabId = message.tabId;
      setTimeout(() => refreshTabs(), 100);
    }
  } else if (message.type === "METADATA_UPDATE") {
    updateMetadataDisplay(message.metadata);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || authMode !== "guest") return;
  const next = changes.guestAuth?.newValue;
  if (next?.guestName && isAuthenticated) {
    updateAuthStatus(formatGuestAuthStatus(next), "success");
  }
});
