// Offscreen document - handles actual audio capture and streaming
import { extensionLog } from "./extension-log.js";
import { resolveRadioEndpoints } from "./radio-config.js";
import { syncGuestAuthDisplayName } from "./guest-auth.js";
import { syncPairedDeviceDisplayName } from "./pair-auth.js";
import {
  extensionStorageGet,
  extensionStorageRemove,
  extensionStorageSet,
} from "./extension-storage.js";

/** Route to background only — offscreen must not intercept its own proxy requests. */
function sendToBackground(message) {
  return chrome.runtime.sendMessage({ ...message, _backgroundTarget: true });
}

let ws = null;
let recorder = null;
let audioCtx = null;
let gainNode = null;
let tabStream = null;
let currentTabId = null;
let currentAudioSource = null; // Track current audio source for proper cleanup
let broadcastStatus = 'disconnected';
let contentPolicyMuted = false;
let currentStreamVolume = 1;
let isOperating = false; // Prevent overlapping operations
let isCleaningUp = false; // Prevent overlapping cleanups

// Native metadata tracking
let currentMetadata = null;
let lastSentMetadata = null;
let currentRelayUrl = null;
let lastKnownTabId = null; // Track tab changes to reset metadata state
let contentHeartbeatTimer = null; // periodic check to ensure content script exists
let metadataBootstrapPollTimer = null;
let metadataMonitoringActive = false;
let metadataMonitoringStarting = false;
let contentScriptMissCount = 0;
let currentBroadcastName = null; // Store current broadcaster name for metadata routing
let currentRailId = null; // Server-assigned wsId for this relay session
// Auth gating for metadata POSTs
let metadataAuthCooldownUntil = 0;
let capabilitiesAuthCooldownUntil = 0;
const AUTH_CACHE_MS = 60000; // cache auth status for 60s
let currentApiOrigin = null;
let currentDeviceToken = null;
let currentGuestAuth = null;
let lastTabCapabilities = null;
let capabilityResyncTimer = null;
let metadataResyncTimer = null;

function metadataPayload(base) {
  const payload = { ...base };
  if (currentGuestAuth) {
    payload.shareToken = currentGuestAuth.shareToken;
    payload.guestId = currentGuestAuth.guestId;
    payload.guestName = currentGuestAuth.guestName;
  }
  return payload;
}
// Function to get API base URL for metadata requests
function getApiBaseUrl() {
  if (currentApiOrigin) return currentApiOrigin;
  if (currentRelayUrl) {
    try {
      return resolveRadioEndpoints(currentRelayUrl).apiOrigin;
    } catch {}
  }
  return "http://localhost:4002";
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentDeviceToken) headers.Authorization = `Bearer ${currentDeviceToken}`;
  return headers;
}

async function reloadAuthFromStorage() {
  try {
    const stored = await extensionStorageGet([
      "pairedDevice",
      "guestAuth",
      "apiOrigin",
    ]);
    if (!currentDeviceToken && stored.pairedDevice?.deviceToken) {
      currentDeviceToken = stored.pairedDevice.deviceToken;
    }
    if (!currentGuestAuth && stored.guestAuth) {
      currentGuestAuth = stored.guestAuth;
    }
    if (!currentApiOrigin) {
      currentApiOrigin =
        stored.apiOrigin ||
        stored.pairedDevice?.apiOrigin ||
        stored.guestAuth?.apiOrigin ||
        null;
    }
  } catch {}
}

async function ensureAuthenticated() {
  await reloadAuthFromStorage();
  return !!(currentDeviceToken || (currentGuestAuth?.shareToken && currentGuestAuth?.guestId));
}

function applyContentPolicyMuteState(muted, summary) {
  const nextMuted = !!muted;
  const wasMuted = contentPolicyMuted;
  contentPolicyMuted = nextMuted;
  if (gainNode) {
    gainNode.gain.value = contentPolicyMuted ? 0 : currentStreamVolume;
  }
  if (nextMuted && !wasMuted) {
    const message = summary
      ? `Content policy: ${summary} — stream muted until an allowed track plays.`
      : "Content policy: stream muted until an allowed track plays.";
    extensionLog("offscreen", "Content policy mute active", { message }, "warn");
    chrome.runtime.sendMessage({ type: "POLICY_MUTED", message }).catch(() => {});
  } else if (!nextMuted && wasMuted) {
    chrome.runtime.sendMessage({ type: "POLICY_UNMUTED" }).catch(() => {});
  }
}

// Function to send metadata to backend (gated by broadcast + auth)
async function sendMetadataToBackend(metadata) {
  try {
    if (broadcastStatus !== "connected" && broadcastStatus !== "connecting") return;
    await reloadAuthFromStorage();
    const now = Date.now();
    if (now < metadataAuthCooldownUntil) {
      extensionLog("offscreen", "Metadata POST skipped (auth cooldown)");
      return;
    }
    const apiBase = getApiBaseUrl();
    const authed = await ensureAuthenticated();
    if (!authed) {
      extensionLog("offscreen", "Metadata POST skipped (not signed in)", null, "warn");
      return;
    }

    if (broadcastStatus === "connected" && !currentRailId) {
      extensionLog("offscreen", "Metadata POST skipped (rail not assigned yet)");
      return;
    }

    // Include broadcaster name in metadata for smart routing
    const metadataWithBroadcaster = metadataPayload({
      ...metadata,
      broadcasterName: currentBroadcastName,
      railId: currentRailId,
      source: lastTabCapabilities?.site || null,
    });

    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      try {
        const response = await fetch(`${apiBase}/api/metadata`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(metadataWithBroadcaster)
        });
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (result?.muted) {
            applyContentPolicyMuteState(true, result?.policy?.summary || null);
          } else {
            applyContentPolicyMuteState(false);
          }
          extensionLog("offscreen", "Metadata synced to radio site", {
            api: apiBase,
            title: metadataWithBroadcaster.title,
            artist: metadataWithBroadcaster.artist,
            muted: !!result?.muted,
            deferred: !!result?.deferred,
            result,
          });
          void publishTabCapabilities();
          return;
        }
        const errText = await response.text().catch(() => '');
        if (response.status === 401) {
          metadataAuthCooldownUntil = Date.now() + 60000;
          extensionLog("offscreen", "Metadata POST unauthorized", { api: apiBase }, "error");
          return;
        }
        if (response.status === 403 && errText.includes('No active websocket')) {
          extensionLog("offscreen", "Metadata POST waiting for relay", { attempt: attempt + 1 }, "warn");
          lastError = new Error('Relay not ready');
        } else if (response.status === 403) {
          extensionLog("offscreen", "Metadata POST forbidden", { api: apiBase, body: errText }, "error");
          return;
        } else {
          lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
        }
      } catch (e) {
        lastError = e;
      }
      attempt++;
      if (attempt < maxAttempts) {
        // simple backoff 500ms, 1500ms
        const delay = attempt === 1 ? 500 : 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    if (lastError) {
      extensionLog("offscreen", "Metadata POST failed after retries", {
        api: apiBase,
        error: lastError?.message || String(lastError),
        track: `${metadataWithBroadcaster.title} — ${metadataWithBroadcaster.artist}`,
      }, "error");
    }
  } catch (error) {
    extensionLog("offscreen", "Metadata POST error", { error: error?.message || String(error) }, "error");
  }
}

// Function to send capability update to backend (gated by broadcast + auth)
async function sendCapabilityToBackend(capabilities) {
  try {
    if (broadcastStatus !== 'connected') return;
    const now = Date.now();
    if (now < capabilitiesAuthCooldownUntil) return;
    const apiBase = getApiBaseUrl();
    const authed = await ensureAuthenticated();
    if (!authed) return;

    // Include broadcaster name in capabilities for identification
    const capabilitiesWithBroadcaster = metadataPayload({
      ...capabilities,
      broadcasterName: currentBroadcastName,
    });

    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      try {
        const response = await fetch(`${apiBase}/api/capabilities`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(capabilitiesWithBroadcaster)
        });
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (result?.muted) {
            applyContentPolicyMuteState(true, result?.policy?.summary || null);
          } else {
            applyContentPolicyMuteState(false);
          }
          extensionLog("offscreen", "Media controls registered on site", {
            api: apiBase,
            supportsMediaControls: capabilitiesWithBroadcaster.supportsMediaControls,
            site: capabilitiesWithBroadcaster.site,
            muted: !!result?.muted,
            deferred: !!result?.deferred,
          });
          return;
        }
        const errText = await response.text().catch(() => '');
        if (response.status === 401) {
          capabilitiesAuthCooldownUntil = Date.now() + 60000;
          extensionLog("offscreen", "Capabilities POST unauthorized", { api: apiBase }, "error");
          return;
        }
        if (response.status === 403 && errText.includes('No active websocket')) {
          lastError = new Error('Relay not ready');
        } else if (response.status === 403) {
          capabilitiesAuthCooldownUntil = Date.now() + 60000;
          extensionLog("offscreen", "Capabilities POST forbidden", { api: apiBase, body: errText }, "error");
          return;
        } else {
          lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
        }
      } catch (e) {
        lastError = e;
      }
      attempt++;
      if (attempt < maxAttempts) {
        const delay = attempt === 1 ? 500 : 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    if (lastError) {
      extensionLog("offscreen", "Capabilities POST failed after retries", {
        api: apiBase,
        error: lastError?.message || String(lastError),
      }, "warn");
    }
  } catch (error) {
    extensionLog("offscreen", "Capabilities POST error", { error: error?.message || String(error) }, "error");
  }
}

function rememberTabCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== 'object') return;
  lastTabCapabilities = {
    supportsMediaControls: !!capabilities.supportsMediaControls,
    site: capabilities.site || null,
  };
}

async function publishTabCapabilities(capabilities = lastTabCapabilities) {
  if (!capabilities) return;
  rememberTabCapabilities(capabilities);
  if (broadcastStatus !== 'connected') return;
  await sendCapabilityToBackend(lastTabCapabilities);
}

function startMetadataResync() {
  if (metadataResyncTimer) clearInterval(metadataResyncTimer);
  metadataResyncTimer = setInterval(() => {
    if (broadcastStatus !== "connected") return;
    if (currentMetadata?.title && currentMetadata?.artist) {
      void sendMetadataToBackend(currentMetadata);
      return;
    }
    if (currentTabId) {
      void syncCurrentMetadataToBackend({ reason: "resync-empty", attempts: 1, delayMs: 0 });
    }
  }, 30000);
}

function stopMetadataResync() {
  if (metadataResyncTimer) {
    clearInterval(metadataResyncTimer);
    metadataResyncTimer = null;
  }
}

function startCapabilityResync() {
  if (capabilityResyncTimer) clearInterval(capabilityResyncTimer);
  capabilityResyncTimer = setInterval(() => {
    void (async () => {
      if (currentGuestAuth && currentApiOrigin) {
        try {
          const stored = await extensionStorageGet(["guestAuth"]);
          if (
            stored.guestAuth?.guestId === currentGuestAuth.guestId &&
            stored.guestAuth?.guestName
          ) {
            currentGuestAuth = stored.guestAuth;
          }
        } catch {
          /* ignore */
        }
        let synced = currentGuestAuth;
        try {
          synced = await syncGuestAuthDisplayName(currentGuestAuth, currentApiOrigin);
        } catch {
          /* ignore */
        }
        if (synced.guestName !== currentGuestAuth.guestName) {
          currentGuestAuth = synced;
          await extensionStorageSet({ guestAuth: synced });
        }
      } else if (currentDeviceToken && currentApiOrigin) {
        try {
          const stored = await extensionStorageGet(["pairedDevice"]);
          const paired = stored.pairedDevice;
          if (paired?.deviceToken) {
            await syncPairedDeviceDisplayName(paired, currentApiOrigin);
          }
        } catch {
          /* ignore */
        }
      }
      await publishTabCapabilities();
    })();
  }, 15000);
}

function stopCapabilityResync() {
  if (capabilityResyncTimer) {
    clearInterval(capabilityResyncTimer);
    capabilityResyncTimer = null;
  }
  stopMetadataResync();
  lastTabCapabilities = null;
}

async function refreshCapabilitiesFromTab() {
  if (!currentTabId) return;
  try {
    const caps = await sendToBackground({
      type: 'GET_MEDIA_CAPABILITIES_FROM_CONTENT',
      tabId: currentTabId,
    });
    if (caps) await publishTabCapabilities(caps);
  } catch (error) {
    console.log('[Offscreen] Could not refresh tab capabilities:', error?.message || error);
  }
}

function startMetadataBootstrapPoll() {
  if (metadataBootstrapPollTimer) clearInterval(metadataBootstrapPollTimer);
  metadataBootstrapPollTimer = setInterval(() => {
    if (!currentTabId || (broadcastStatus !== "connected" && broadcastStatus !== "connecting")) {
      return;
    }
    if (currentMetadata?.title && currentMetadata?.artist) {
      clearInterval(metadataBootstrapPollTimer);
      metadataBootstrapPollTimer = null;
      return;
    }
    void syncCurrentMetadataToBackend({ reason: "bootstrap-poll", attempts: 1, delayMs: 0 });
  }, 2000);
}

function stopMetadataBootstrapPoll() {
  if (metadataBootstrapPollTimer) {
    clearInterval(metadataBootstrapPollTimer);
    metadataBootstrapPollTimer = null;
  }
}

async function ensureContentScriptReady(maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (await checkContentScriptAvailability()) return true;
  }

  try {
    const ensure = await sendToBackground({
      type: "ENSURE_CONTENT_SCRIPT",
      tabId: currentTabId,
    });
    if (ensure?.success && ensure.injected) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (await checkContentScriptAvailability()) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    extensionLog("offscreen", "ENSURE_CONTENT_SCRIPT failed", {
      error: error?.message || String(error),
    }, "warn");
  }

  return false;
}

async function checkContentScriptAvailability() {
  if (!currentTabId) {
    console.log('[Offscreen] No current tab ID for content script check');
    return false;
  }

  try {
    console.log(`[Offscreen] Pinging content script in tab ${currentTabId} via background script`);
    
    // Use background script as proxy since offscreen documents can't use chrome.tabs API
    const response = await sendToBackground({
      type: 'PING_CONTENT_SCRIPT',
      tabId: currentTabId
    });
    
    console.log('[Offscreen] Content script ping response received:', response);
    
    if (response && response.success) {
      console.log('[Offscreen] Content script ping successful');
      return true;
    } else {
      console.log('[Offscreen] Content script ping failed - invalid response:', response);
      return false;
    }
  } catch (error) {
    console.log('[Offscreen] Content script not available - error details:', {
      message: error.message,
      name: error.name
    });
    return false;
  }
}

async function pullMetadataFromTab() {
  if (!currentTabId) return null;
  try {
    const response = await sendToBackground({
      type: "GET_CURRENT_METADATA_FROM_CONTENT",
      tabId: currentTabId,
    });
    const metadata = response?.metadata || null;
    if (metadata?.title && metadata?.artist) {
      currentMetadata = metadata;
      return metadata;
    }
  } catch {}
  return null;
}

// Function to start metadata monitoring via content script
async function startContentScriptMetadataMonitoring() {
  if (metadataMonitoringStarting) {
    return;
  }
  metadataMonitoringStarting = true;
  try {
  console.log('[Offscreen] startContentScriptMetadataMonitoring called');
  
  if (!currentTabId) {
    console.log('[Offscreen] No current tab ID, skipping metadata monitoring');
    return;
  }

  console.log(`[Offscreen] Starting metadata monitoring for tab ${currentTabId}`);

  try {
    const contentScriptReady = await ensureContentScriptReady();

    if (!contentScriptReady) {
      console.log('[Offscreen] Content script not available after ensure/retry');
      setTimeout(() => {
        if (currentTabId && (broadcastStatus === 'connected' || broadcastStatus === 'connecting')) {
          void startContentScriptMetadataMonitoring();
        }
      }, 2500);
      return;
    }

    console.log('[Offscreen] Content script is ready, starting monitoring');
    
    // Send message to content script to start monitoring via background script
    console.log('[Offscreen] Sending START_METADATA_MONITORING message to content script via background');
    const response = await sendToBackground({
      type: 'START_METADATA_MONITORING',
      tabId: currentTabId,
      forceRestart: true,
    });
    
    console.log('[Offscreen] Content script monitoring response:', response);
    
    if (response && response.success) {
      console.log('[Offscreen] Content script metadata monitoring started successfully');
      await pullMetadataFromTab();
      sendMetadataUpdateToPopup(
        currentMetadata,
        currentMetadata ? 'Active metadata detected' : 'Monitoring metadata from tab...',
      );
      await refreshCapabilitiesFromTab();
      startCapabilityResync();
      startMetadataResync();
      startMetadataBootstrapPoll();
      void syncCurrentMetadataToBackend({ reason: "monitoring-started", attempts: 10, delayMs: 750 });
    } else {
      console.error('[Offscreen] Failed to start content script monitoring, response:', response);
      try {
        const ensured = await sendToBackground({
          type: 'ENSURE_CONTENT_SCRIPT',
          tabId: currentTabId,
        });
        if (ensured?.success) {
          const retry = await sendToBackground({
            type: 'START_METADATA_MONITORING',
            tabId: currentTabId,
            forceRestart: true,
          });
          if (retry?.success) {
            console.log('[Offscreen] Metadata monitoring started after ENSURE_CONTENT_SCRIPT retry');
            await pullMetadataFromTab();
            sendMetadataUpdateToPopup(
              currentMetadata,
              currentMetadata ? 'Active metadata detected' : 'Monitoring metadata from tab...',
            );
            await refreshCapabilitiesFromTab();
            startCapabilityResync();
            startMetadataResync();
            startMetadataBootstrapPoll();
            void syncCurrentMetadataToBackend({ reason: "monitoring-retry", attempts: 10, delayMs: 750 });
            return;
          }
        }
      } catch (retryError) {
        console.error('[Offscreen] Metadata monitoring retry failed:', retryError);
      }
    }
  } catch (error) {
    console.error('[Offscreen] Error starting content script metadata monitoring:', error);
  }
  } finally {
    metadataMonitoringStarting = false;
  }
}

// Function to stop metadata monitoring via content script
async function stopContentScriptMetadataMonitoring(tabId = currentTabId) {
  const targetTabId = tabId;
  if (!targetTabId) {
    return;
  }

  try {
    // Send message to content script to stop monitoring via background script
    await sendToBackground({
      type: 'STOP_METADATA_MONITORING',
      tabId: targetTabId
    });
    console.log(`Content script metadata monitoring stopped for tab ${targetTabId}`);
  } catch (error) {
    // Tab might have closed or navigation occurred - this is expected
    console.log(`Could not stop content script monitoring for tab ${targetTabId}:`, error.message);
  }

  if (targetTabId === currentTabId) {
    try { if (contentHeartbeatTimer) clearInterval(contentHeartbeatTimer); } catch {}
    contentHeartbeatTimer = null;
  }
}

// Function to send metadata update to popup for display
function mergeTrackMetadata(incoming, previous) {
  if (!incoming?.title || !incoming?.artist) return incoming;
  if (!previous?.title || !previous?.artist) return incoming;
  if (incoming.title !== previous.title || incoming.artist !== previous.artist) {
    return incoming;
  }
  const merged = { ...incoming };
  if (previous.albumArt && !merged.albumArt) merged.albumArt = previous.albumArt;
  if (previous.licenseType && !merged.licenseType) merged.licenseType = previous.licenseType;
  if (previous.licenseUrl && !merged.licenseUrl) merged.licenseUrl = previous.licenseUrl;
  if (previous.url && !merged.url) merged.url = previous.url;
  return merged;
}

function sendMetadataUpdateToPopup(metadata, status = null, { allowClear = false } = {}) {
  try {
    const isLive = broadcastStatus === "connected" || broadcastStatus === "connecting";

    let displayMetadata = metadata;
    if (allowClear) {
      currentMetadata = null;
      displayMetadata = null;
    } else if (metadata?.title && metadata?.artist) {
      currentMetadata = mergeTrackMetadata(metadata, currentMetadata);
      displayMetadata = currentMetadata;
    } else if (isLive && currentMetadata?.title && currentMetadata?.artist) {
      displayMetadata = currentMetadata;
    }

    const message = {
      type: 'METADATA_UPDATE',
      metadata: displayMetadata,
    };
    
    if (status) {
      message.status = status;
    } else if (!displayMetadata?.title) {
      message.status = 'No media session detected';
    } else {
      message.status = 'Active metadata detected';
    }
    
    chrome.runtime.sendMessage(message).catch(error => {
      // Ignore errors - popup might not be open
      console.log('Could not send metadata update to popup:', error.message);
    });
  } catch (error) {
    console.error('Error sending metadata update to popup:', error);
  }
}


// Function to start monitoring metadata using content script
async function startMetadataMonitoring() {
  console.log('[Offscreen] startMetadataMonitoring called');
  console.log(`[Offscreen] Current tab ID: ${currentTabId}`);
  console.log(`[Offscreen] Broadcast status: ${broadcastStatus}`);

  const tabChanged = lastKnownTabId != null && lastKnownTabId !== currentTabId;
  if (tabChanged) {
    currentMetadata = null;
    lastSentMetadata = null;
  }
  lastKnownTabId = currentTabId;
  
  console.log(`[Offscreen] Starting content script metadata monitoring for tab ${currentTabId}`);
  
  metadataMonitoringActive = true;
  await startContentScriptMetadataMonitoring();

  // Start heartbeat to ensure content script remains present during operation
  try { if (contentHeartbeatTimer) clearInterval(contentHeartbeatTimer); } catch {}
  contentHeartbeatTimer = setInterval(async () => {
    try {
      if (
        !currentTabId ||
        (broadcastStatus !== "connected" && broadcastStatus !== "connecting")
      ) {
        return;
      }
      // Ping content script; if missing, ensure and restart monitoring
      const ok = await checkContentScriptAvailability();
      if (!ok) {
        contentScriptMissCount += 1;
        if (contentScriptMissCount < 4) {
          return;
        }
        contentScriptMissCount = 0;
        console.log('[Offscreen] Heartbeat: content script missing, re-injecting and restarting monitoring');
        try {
          await sendToBackground({ type: 'ENSURE_CONTENT_SCRIPT', tabId: currentTabId });
        } catch {}
        await startContentScriptMetadataMonitoring();
      } else {
        contentScriptMissCount = 0;
      }
    } catch (e) {
      // ignore
    }
  }, 3000);
}

async function syncCurrentMetadataToBackend({ reason = "connect", attempts = 6, delayMs = 1000 } = {}) {
  if (
    !currentTabId ||
    (broadcastStatus !== "connected" && broadcastStatus !== "connecting")
  ) {
    return null;
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (!currentTabId || (broadcastStatus !== "connected" && broadcastStatus !== "connecting")) {
        return null;
      }

      const response = await sendToBackground({
        type: 'GET_CURRENT_METADATA_FROM_CONTENT',
        tabId: currentTabId,
      });
      const metadata = response?.metadata || null;
      if (!metadata?.title || !metadata?.artist) continue;

      currentMetadata = metadata;
      lastSentMetadata = { ...metadata };
      sendMetadataUpdateToPopup(metadata, 'Current track synced');
      if (broadcastStatus === "connected" || broadcastStatus === "connecting") {
        await sendMetadataToBackend(metadata);
      }
      extensionLog("offscreen", "Metadata synced to backend", {
        reason,
        attempt: attempt + 1,
        railId: currentRailId,
        title: metadata.title,
        artist: metadata.artist,
        hasAlbumArt: !!metadata.albumArt,
      });
      return metadata;
    } catch (error) {
      extensionLog("offscreen", "Metadata sync attempt failed", {
        reason,
        attempt: attempt + 1,
        error: error?.message || String(error),
      }, attempt + 1 >= attempts ? "warn" : "info");
    }
  }

  extensionLog("offscreen", "Metadata sync exhausted retries", { reason, attempts }, "warn");
  return null;
}

// Function to stop monitoring metadata using content script
async function stopMetadataMonitoring() {
  stopCapabilityResync();
  stopMetadataBootstrapPoll();
  metadataMonitoringActive = false;
  // Stop content script monitoring
  await stopContentScriptMetadataMonitoring();
  
  currentMetadata = null;
  lastSentMetadata = null;
  lastKnownTabId = null;
  
  // Clear popup display when monitoring stops
  sendMetadataUpdateToPopup(null, null, { allowClear: true });
  
  console.log('Stopped content script metadata monitoring');
}

// Listen for commands from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message._backgroundTarget) {
    return false;
  }

  // Handle synchronous status requests immediately
  if (message.type === 'GET_BROADCAST_STATUS') {
    sendResponse({ 
      status: broadcastStatus,
      tabId: currentTabId
    });
    return; // Don't return true - response is synchronous
  }

  if (message.type === 'GET_CURRENT_METADATA') {
    console.log('[Offscreen] GET_CURRENT_METADATA requested, current metadata:', currentMetadata);

    sendMetadataUpdateToPopup(currentMetadata);

    if (currentTabId && broadcastStatus === 'connected') {
      void (async () => {
        try {
          console.log('[Offscreen] Popup requested metadata, ensuring monitoring is active');
          await startContentScriptMetadataMonitoring();
          const response = await sendToBackground({
            type: 'GET_CURRENT_METADATA_FROM_CONTENT',
            tabId: currentTabId
          });
          if (response && response.metadata) {
            currentMetadata = response.metadata;
            sendMetadataUpdateToPopup(response.metadata, 'Fresh metadata retrieved');
          } else if (currentMetadata) {
            sendMetadataUpdateToPopup(currentMetadata, 'Monitoring metadata from tab...');
          }
        } catch (error) {
          console.log('[Offscreen] Could not get fresh metadata from content script:', error);
        }
      })();
    }

    sendResponse({ success: true });
    return;
  }

  // Handle metadata updates from content script
  if (message.type === 'METADATA_FROM_CONTENT_SCRIPT') {
    const { metadata, origin, tabId } = message;
    
    // Only process metadata if it's from the current recorded tab
    // Use tabId from message (set by background script) since message comes through proxy
    if (tabId === currentTabId) {
      console.log(`Metadata received from content script (tab ${currentTabId}, origin: ${origin}):`, metadata);
      
      if (metadata) {
        // Check if metadata has actually changed from what we last sent
        const hasChanged = !lastSentMetadata || 
          lastSentMetadata.title !== metadata.title || 
          lastSentMetadata.artist !== metadata.artist ||
          String(lastSentMetadata.albumArt || "") !== String(metadata.albumArt || "");
        
        console.log(`[Offscreen] Metadata change check:`, {
          lastSent: lastSentMetadata,
          current: metadata,
          hasChanged
        });
        
        currentMetadata = metadata;
        sendMetadataUpdateToPopup(currentMetadata, 'Active metadata detected');
        const shouldPost = hasChanged || broadcastStatus === "connecting";
        if (shouldPost) {
          if (broadcastStatus === "connected" || broadcastStatus === "connecting") {
            void sendMetadataToBackend(metadata);
          }
          lastSentMetadata = { ...metadata };
        }
      } else if (broadcastStatus !== 'connected') {
        // Explicit stop/disconnect — allow clearing. Ignore transient nulls while live.
        if (currentMetadata) {
          console.log(`Metadata cleared from content script (tab ${currentTabId})`);
          currentMetadata = null;
          lastSentMetadata = null;
          sendMetadataUpdateToPopup(null, 'No metadata in tab');
        }
      } else {
        console.log(`[Offscreen] Ignoring transient null metadata while broadcasting (tab ${currentTabId})`);
      }
    } else {
      console.log(`[Offscreen] Ignoring metadata from tab ${tabId}, current tab is ${currentTabId}`);
    }
    return; // Don't return true - not expecting response
  }

  // Handle capability updates from content script
  if (message.type === 'CAPABILITY_FROM_CONTENT_SCRIPT') {
    const { capabilities, origin, tabId } = message;

    // Only process capabilities if it's from the current recorded tab
    // Use tabId from message (set by background script) since message comes through proxy
    if (tabId === currentTabId) {
      console.log(`Capabilities received from content script (tab ${currentTabId}, origin: ${origin}):`, capabilities);

      // Send capabilities to backend when broadcasting
      if (broadcastStatus === 'connected') {
        void publishTabCapabilities(capabilities);
      }
    } else {
      console.log(`[Offscreen] Ignoring capabilities from tab ${tabId}, current tab is ${currentTabId}`);
    }
    return; // Don't return true - not expecting response
  }

  if (!message._offscreenTarget) {
    return false;
  }

  const offscreenCommandTypes = new Set([
    'START_BROADCAST',
    'STOP_BROADCAST',
    'SWITCH_TAB',
  ]);
  if (!offscreenCommandTypes.has(message.type)) {
    return false;
  }

  (async () => {
    try {
      if (message.type === 'START_BROADCAST') {
        const result = await startBroadcast(
          message.tabId,
          message.streamId,
          message.relayUrl,
          message.volume,
          message.apiOrigin,
          message.deviceToken,
          message.guestAuth
        );
        sendResponse(result);
      } 
      else if (message.type === 'STOP_BROADCAST') {
        await stopBroadcastAsync();
        sendResponse({ success: true, status: 'disconnected' });
      }
      else if (message.type === 'SWITCH_TAB') {
        const result = await switchTab(
          message.tabId,
          message.streamId,
          message.volume || 1
        );
        sendResponse(result);
      }
    } catch (error) {
      // Don't log the expected "not fully stopped" error
      if (!error.message.includes('Previous broadcast not fully stopped')) {
        console.error('Offscreen error:', error);
      }
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true;
});

async function startBroadcast(tabId, streamId, relayUrl, volume, apiOriginOpt, deviceTokenOpt, guestAuthOpt) {
  // Prevent overlapping operations
  if (isOperating) {
    console.log('Operation already in progress, waiting...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (isOperating) {
      throw new Error('Another operation is in progress. Please wait.');
    }
  }
  
  // Check if there's already an active broadcast
  if (broadcastStatus === 'connected' || recorder || ws || tabStream || audioCtx) {
    console.log('Previous broadcast still active. Waiting for cleanup...');
    console.log('  broadcastStatus:', broadcastStatus);
    console.log('  recorder:', recorder ? 'exists' : 'null');
    console.log('  ws:', ws ? 'exists' : 'null');
    console.log('  tabStream:', tabStream ? 'exists' : 'null');
    console.log('  audioCtx:', audioCtx ? 'exists' : 'null');
    
    throw new Error('Previous broadcast not fully stopped. Please wait 2 seconds and try again.');
  }
  
  isOperating = true;
  
  try {
    console.log('Starting fresh broadcast with streamId:', streamId, 'relayUrl:', relayUrl);
    
    currentRelayUrl = relayUrl;
    currentApiOrigin = apiOriginOpt || null;
    currentDeviceToken = deviceTokenOpt || null;
    currentGuestAuth = guestAuthOpt || null;
    if (!currentDeviceToken && !currentGuestAuth) {
      try {
        const stored = await extensionStorageGet(['pairedDevice', 'guestAuth', 'apiOrigin']);
        currentDeviceToken = stored.pairedDevice?.deviceToken || null;
        currentGuestAuth = stored.guestAuth || null;
        currentApiOrigin = currentApiOrigin || stored.apiOrigin || stored.pairedDevice?.apiOrigin || null;
      } catch {}
    }
    if (!currentApiOrigin) {
      currentApiOrigin = getApiBaseUrl();
    }
    if (!currentDeviceToken && !currentGuestAuth) {
      throw new Error('Extension is not signed in. Pair on the radio site or paste a guest broadcaster link.');
    }

    currentTabId = tabId;
    broadcastStatus = 'connecting';
    currentStreamVolume = volume || 1;
    contentPolicyMuted = false;
    currentMetadata = null;
    lastSentMetadata = null;
    lastTabCapabilities = null;
    void startMetadataMonitoring();

    // Get the media stream using the stream ID from popup
    // This is the correct way to access tab audio in offscreen documents
    try {
      tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
    } catch (captureError) {
      // Log detailed error information
      console.error('getUserMedia error details:');
      console.error('  Name:', captureError.name);
      console.error('  Message:', captureError.message);
      console.error('  Full error:', captureError);
      console.error('  Stream ID was:', streamId);
      
      // Provide helpful error message based on error type
      let errorMsg = 'Tab capture failed';
      if (captureError.name === 'NotAllowedError') {
        errorMsg = 'Permission denied for tab capture';
      } else if (captureError.name === 'InvalidStateError') {
        errorMsg = 'Stream ID already used or invalid. This is a bug - please reload extension.';
      } else if (captureError.name === 'NotFoundError') {
        errorMsg = 'Tab not found or no longer exists';
      } else {
        errorMsg = `Tab capture failed: ${captureError.name} - ${captureError.message}`;
      }
      
      throw new Error(errorMsg);
    }

    if (!tabStream) {
      throw new Error('Failed to capture tab audio - stream is null');
    }

    console.log('Successfully captured tab audio');

    // Setup audio context and processing
    audioCtx = new AudioContext();
    currentAudioSource = audioCtx.createMediaStreamSource(tabStream);

    // Volume control
    gainNode = audioCtx.createGain();
    currentStreamVolume = volume || 1;
    gainNode.gain.value = contentPolicyMuted ? 0 : currentStreamVolume;
    currentAudioSource.connect(gainNode);

    const destination = audioCtx.createMediaStreamDestination();
    gainNode.connect(destination);

    // Connect to relay WebSocket with host token via Sec-WebSocket-Protocol
    console.log('Connecting to WebSocket:', relayUrl);

    const apiOrigin = currentApiOrigin;

    let token = null;
    let deviceLabel = '';
    try {
      let tokenRes;
      if (currentGuestAuth) {
        currentGuestAuth = await syncGuestAuthDisplayName(currentGuestAuth, apiOrigin);
        await extensionStorageSet({ guestAuth: currentGuestAuth });
        tokenRes = await fetch(`${apiOrigin}/api/extension/guest/ws-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shareToken: currentGuestAuth.shareToken,
            guestId: currentGuestAuth.guestId,
            guestName: currentGuestAuth.guestName,
            deviceLabel: 'Browser extension',
          }),
        });
        if (tokenRes.status === 403) {
          try {
            await extensionStorageRemove(['guestAuth']);
          } catch {}
          throw new Error('Guest broadcaster link expired or invalid. Paste a new link in the extension.');
        }
      } else {
        tokenRes = await fetch(`${apiOrigin}/api/extension/ws-token`, {
          method: 'POST',
          headers: authHeaders(),
        });
        if (tokenRes.status === 401 || tokenRes.status === 403) {
          try {
            await extensionStorageRemove(['pairedDevice', 'pendingPair']);
          } catch {}
          throw new Error('Device pairing is no longer valid. Open the extension and pair again.');
        }
      }
      if (!tokenRes.ok) {
        throw new Error(`ws-token request failed: HTTP ${tokenRes.status}`);
      }
      const tokenJson = await tokenRes.json();
      token = tokenJson.token;
      if (!token) throw new Error('ws-token response missing token');
      deviceLabel =
        typeof tokenJson.label === 'string' ? tokenJson.label.trim().slice(0, 64) : '';
    } catch (e) {
      throw new Error(`Unable to obtain WebSocket token. Sign in again in the extension. (${e.message})`);
    }

    try {
      let finalUrl = relayUrl;
      try {
        const u = new URL(relayUrl);
        u.searchParams.set('token', token);
        if (deviceLabel) {
          const encodedName = btoa(encodeURIComponent(deviceLabel));
          u.searchParams.set('broadcast_name', encodedName);
          currentBroadcastName = deviceLabel;
        } else {
          currentBroadcastName = null;
        }
        finalUrl = u.toString();
      } catch {}
      ws = new WebSocket(finalUrl);
    } catch (wsError) {
      throw new Error(`Invalid WebSocket URL: ${wsError.message}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error(`WebSocket connection timeout. Is your relay server running at ${relayUrl}?`);
        reject(error);
      }, 10000);

      ws.onopen = () => {
        console.log('WebSocket connected!');
        clearTimeout(timeout);
        broadcastStatus = 'connected';
        metadataAuthCooldownUntil = 0;
        capabilitiesAuthCooldownUntil = 0;
        lastTabCapabilities = null;
        void publishTabCapabilities({ supportsMediaControls: false, site: null });
        extensionLog("offscreen", "Relay connected — broadcasting", {
          api: currentApiOrigin || getApiBaseUrl(),
          relay: currentRelayUrl,
          tabId: currentTabId,
          device: currentBroadcastName || null,
        });

        // Notify background/popup (don't wait for response)
        try {
          chrome.runtime.sendMessage({
            type: 'BROADCAST_STATUS_UPDATE',
            status: 'connected',
            tabId: currentTabId
          });
        } catch (error) {
          // Ignore - listener might not exist
        }

        // Handle incoming messages from server (media controls)
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'relay_session') {
              const railId = message.railId || message.wsId || null;
              if (railId) {
                currentRailId = String(railId);
                extensionLog("offscreen", "Relay session assigned", { railId: currentRailId });
                void syncCurrentMetadataToBackend({ reason: "relay-session", attempts: 6, delayMs: 750 });
              }
            } else if (message.type === 'media_control' && message.action) {
              console.log('📡 Received media control command from server:', message.action);

              // Forward the command to content script to simulate keyboard events
              try {
                chrome.runtime.sendMessage({
                  type: 'MEDIA_CONTROL_FROM_SERVER',
                  action: message.action,
                  tabId: currentTabId
                });
              } catch (error) {
                console.error('Failed to forward media control to content script:', error);
              }
            }
          } catch (error) {
            // Not a JSON message, ignore (likely audio data or other)
          }
        };

        // Start recording and streaming
        const mimeType = "audio/webm;codecs=opus";
        recorder = new MediaRecorder(destination.stream, { 
          mimeType, 
          audioBitsPerSecond: 128000 
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
            event.data.arrayBuffer().then(buf => ws.send(buf));
          }
        };

        recorder.onerror = (error) => {
          console.error('Recorder error:', error);
          stopBroadcastAsync();
        };

        recorder.start(250);

        if (!metadataMonitoringActive) {
          startMetadataMonitoring().catch((error) => {
            console.error('Failed to start metadata monitoring:', error);
          });
        } else {
          void syncCurrentMetadataToBackend({ reason: "relay-connected", attempts: 10, delayMs: 750 });
          if (currentMetadata?.title && currentMetadata?.artist) {
            void sendMetadataToBackend(currentMetadata);
          }
          startMetadataBootstrapPoll();
        }
        
        resolve({
          success: true, 
          status: 'connected',
          message: 'Broadcasting started successfully'
        });
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error event:', error);
    stopBroadcastAsync();
        reject(new Error(`WebSocket connection failed. Check that your relay server is running at ${relayUrl}`));
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed, code:', event.code, 'reason:', event.reason);
        stopBroadcastAsync();
      };
    });

  } catch (error) {
    console.error('Start broadcast error:', error);
    await stopBroadcastAsync();
    return { 
      success: false, 
      error: error.message,
      status: 'disconnected'
    };
  } finally {
    isOperating = false;
  }
}

// Async version of stopBroadcast for thorough cleanup
async function stopBroadcastAsync() {
  // Prevent overlapping cleanup calls
  if (isCleaningUp) {
    console.log('Cleanup already in progress, skipping...');
    return;
  }
  
  isCleaningUp = true;
  console.log('Stopping broadcast (async cleanup)...');
  
  // Stop metadata monitoring first
  stopMetadataMonitoring();
  
  // Stop recorder first
  if (recorder) {
    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      // Remove event handlers to prevent callbacks from firing
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder = null;
      console.log('  Recorder stopped');
    } catch (error) {
      console.error('Error stopping recorder:', error);
    }
  }
  
  // Close WebSocket properly
  if (ws) {
    try {
      const currentState = ws.readyState;
      console.log('  WebSocket state before close:', currentState);
      
      // Remove all event handlers FIRST to prevent callbacks
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.onmessage = null;
      
      if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
        ws.close(1000, 'Broadcast stopped'); // Normal closure
        // Wait for close to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      ws = null;
      console.log('  WebSocket closed');
    } catch (error) {
      console.error('Error closing WebSocket:', error);
      ws = null;
    }
  }
  
  // Stop all tracks in the stream
  if (tabStream) {
    try {
      const tracks = tabStream.getTracks();
      console.log('  Stopping', tracks.length, 'track(s)');
      tracks.forEach(track => {
        track.stop();
      });
      tabStream = null;
      console.log('  Tracks stopped');
    } catch (error) {
      console.error('Error stopping tracks:', error);
      tabStream = null;
    }
  }
  
  // Close audio context and wait for it
  if (audioCtx) {
    try {
      if (audioCtx.state !== 'closed') {
        console.log('  Closing AudioContext, state:', audioCtx.state);
        await audioCtx.close();
        console.log('  AudioContext closed');
      }
      audioCtx = null;
    } catch (error) {
      console.error('Error closing audio context:', error);
      audioCtx = null;
    }
  }

  gainNode = null;
  currentAudioSource = null;
  currentTabId = null;
  currentRelayUrl = null;
  currentApiOrigin = null;
  currentDeviceToken = null;
  currentGuestAuth = null;
  currentBroadcastName = null;
  currentRailId = null;
  broadcastStatus = 'disconnected';

  console.log('Cleanup complete');

  // Notify background/popup (don't wait for response)
  try {
    chrome.runtime.sendMessage({
      type: 'BROADCAST_STATUS_UPDATE',
      status: 'disconnected'
    });
  } catch (error) {
    // Ignore - listener might not exist
  }
  
  // Clear flags last
  isCleaningUp = false;
  isOperating = false;
}

// Switch tab while maintaining WebSocket connection
async function switchTab(newTabId, newStreamId, volume = 1) {
  // Only allow if currently broadcasting
  if (broadcastStatus !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'Not currently broadcasting or WebSocket not connected' };
  }

  // Prevent overlapping operations
  if (isOperating) {
    return { success: false, error: 'Another operation is in progress' };
  }

  isOperating = true;

  const previousTabId = currentTabId;

  try {
    console.log('Switching tab from', previousTabId, 'to', newTabId, 'with streamId:', newStreamId);

    // Get the new media stream using the new stream ID
    let newTabStream;
    let audioCaptureFailed = false;
    try {
      newTabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: newStreamId
          }
        }
      });
    } catch (captureError) {
      console.error('Tab switch capture error:', captureError);
      console.log('Continuing with existing audio stream - tab switch will work but audio may be from old tab');
      audioCaptureFailed = true;
      newTabStream = null;
    }

    if (!newTabStream && !audioCaptureFailed) {
      throw new Error('Failed to capture new tab audio - stream is null');
    }

    // Stop the old tab stream tracks
    if (tabStream) {
      try {
        const tracks = tabStream.getTracks();
        tracks.forEach(track => track.stop());
        console.log('Stopped old tab tracks');
      } catch (error) {
        console.error('Error stopping old tracks:', error);
      }
    }

    // Replace the audio source in the existing AudioContext (only if capture succeeded)
    if (!audioCaptureFailed && audioCtx && audioCtx.state !== 'closed') {
      // Disconnect the old source
      if (currentAudioSource) {
        try {
          currentAudioSource.disconnect();
          console.log('Disconnected old audio source');
        } catch (error) {
          console.error('Error disconnecting old source:', error);
        }
      }

      // Create new source from new stream
      currentAudioSource = audioCtx.createMediaStreamSource(newTabStream);

      // Update volume if provided
      if (gainNode) {
        if (typeof volume === "number") {
          currentStreamVolume = volume;
        }
        gainNode.gain.value = contentPolicyMuted ? 0 : currentStreamVolume;
      }

      // Connect new source to the existing processing chain
      currentAudioSource.connect(gainNode);

      // Update stream reference
      tabStream = newTabStream;
      console.log('Successfully switched to new tab audio source');
    } else if (audioCaptureFailed) {
      console.log('Audio capture failed - keeping existing audio stream');
      // Don't update tabStream - keep the old one
    } else {
      throw new Error('Audio context is closed or not available');
    }

    if (previousTabId != null && previousTabId !== newTabId) {
      console.log(`Tab switched from ${previousTabId} to ${newTabId}, resetting metadata state`);

      stopCapabilityResync();
      stopMetadataBootstrapPoll();
      stopMetadataResync();

      await stopContentScriptMetadataMonitoring(previousTabId);

      currentMetadata = null;
      lastSentMetadata = null;
      lastKnownTabId = null;
      lastTabCapabilities = null;

      if (broadcastStatus === "connected") {
        void publishTabCapabilities({ supportsMediaControls: false, site: null });
      }
    }

    currentTabId = newTabId;

    // Notify background/popup of successful tab switch (don't wait for response)
    try {
      chrome.runtime.sendMessage({
        type: 'BROADCAST_STATUS_UPDATE',
        status: 'connected',
        tabId: currentTabId,
        tabSwitched: true
      });
    } catch (error) {
      // Ignore - listener might not exist
    }

    await startMetadataMonitoring();

    return {
      success: true,
      status: 'connected',
      message: audioCaptureFailed ? 'Tab switched successfully (audio capture failed - using previous tab\'s audio)' : 'Tab switched successfully',
      tabId: currentTabId,
      audioCaptureFailed: audioCaptureFailed
    };

  } catch (error) {
    console.error('Tab switch error:', error);
    return { 
      success: false, 
      error: error.message,
      status: broadcastStatus
    };
  } finally {
    isOperating = false;
  }
}

// Synchronous version for quick cleanup (doesn't wait for async operations)
function stopBroadcast() {
  console.log('Quick stop (synchronous)');
  // Just call the async version without waiting
  stopBroadcastAsync();
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  stopBroadcast();
});


