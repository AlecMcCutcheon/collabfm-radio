// Background service worker - manages offscreen document for broadcasting
import { extensionLog } from "./extension-log.js";
import { applyLocalGuestProfile } from "./guest-auth.js";
import { CONTENT_SCRIPT_FILES } from "./sites/content-script-files.js";

let offscreenDocumentReady = false;
const recentExtensionLogs = [];
const MAX_RECENT_LOGS = 50;

function pushExtensionLog(payload) {
  recentExtensionLogs.push(payload);
  while (recentExtensionLogs.length > MAX_RECENT_LOGS) {
    recentExtensionLogs.shift();
  }
  try {
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch {}
}

// Track pending broadcast requests
let pendingBroadcast = null;
let tabActivationListener = null;

// Create offscreen document when needed
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenDocumentReady = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture and broadcast tab audio to Icecast server'
  });

  offscreenDocumentReady = true;
}

async function waitForContentScript(tabId, { maxAttempts = 24, delayMs = 150 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT_SCRIPT" });
      if (response?.success) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

function isIbroadcastHostname(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  return host === "media.ibroadcast.com" || host.endsWith(".media.ibroadcast.com");
}

/** iBroadcast exposes window.ibui in the page main world — content scripts cannot see it. */
async function executeIbroadcastControl(tabId, action) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (mediaAction) => {
      if (typeof window.ibui === "undefined") return false;
      try {
        switch (mediaAction) {
          case "playPause":
          case "play":
          case "pause":
            window.ibui.togglePlay();
            return true;
          case "next":
            window.ibui.next();
            return true;
          case "previous":
            window.ibui.previous();
            return true;
          default:
            return false;
        }
      } catch {
        return false;
      }
    },
    args: [action],
  });
  return results?.[0]?.result === true;
}

async function tabHostname(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return new URL(tab.url || "").hostname;
  } catch {
    return "";
  }
}

async function forwardMediaControlToTab(tabId, action) {
  const hostname = await tabHostname(tabId);
  if (isIbroadcastHostname(hostname)) {
    return executeIbroadcastControl(tabId, action);
  }
  await chrome.tabs.sendMessage(tabId, { type: "MEDIA_CONTROL", action });
  return true;
}

async function ensureTabContentScript(tabId) {
  if (typeof tabId !== "number") return false;

  let pingOk = false;
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT_SCRIPT" });
    pingOk = !!response?.success;
  } catch {}

  if (!pingOk) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES,
      });
    } catch (error) {
      extensionLog("background", "Content script inject failed", {
        tabId,
        error: error?.message || String(error),
      }, "error");
      return false;
    }
  }

  const ready = await waitForContentScript(tabId);
  if (!ready) {
    extensionLog("background", "Content script not responding after ensure", { tabId }, "warn");
  }
  return ready;
}

async function forwardToOffscreen(message) {
  return chrome.runtime.sendMessage({ ...message, _offscreenTarget: true });
}

// Single message listener to handle all messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message._offscreenTarget) {
    return false;
  }

  const isExtensionSender = sender?.id === chrome.runtime.id;
  const popupOnlyTypes = new Set([
    'START_BROADCAST',
    'STOP_BROADCAST',
    'SWITCH_TAB',
    'GET_BROADCAST_STATUS',
    'GET_PENDING_BROADCAST',
    'CANCEL_PENDING_BROADCAST',
  ]);

  if (popupOnlyTypes.has(message.type)) {
    if (!isExtensionSender || sender.tab) {
      sendResponse({ success: false, error: 'Forbidden' });
      return false;
    }
  }

  // Handle status updates from offscreen (no async needed)
  if (message.type === 'BROADCAST_STATUS_UPDATE') {
    // Badge updates
    if (message.status === 'connected') {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
    // Don't return true - no response needed
    return;
  }

  if (message.type === 'EXT_LOG' && message.payload) {
    pushExtensionLog(message.payload);
    return;
  }

  if (message.type === 'GET_EXT_LOGS') {
    sendResponse({ logs: recentExtensionLogs });
    return false;
  }

  if (message.type === 'SYNC_GUEST_PROFILE_FROM_PAGE') {
    if (!isExtensionSender || !sender.tab) return false;
    void applyLocalGuestProfile(message).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // Handle messages from content scripts that need forwarding to offscreen
  if (message.type === 'METADATA_FROM_CONTENT_SCRIPT') {
    if (!isExtensionSender || !sender.tab) return;
    try {
      chrome.runtime.sendMessage({
        ...message,
        tabId: sender.tab.id
      });
    } catch (error) {
      extensionLog("background", "Could not forward metadata to offscreen", {
        error: error?.message || String(error),
      }, "warn");
    }
    return;
  }

  // Handle capability updates from content scripts
  if (message.type === 'CAPABILITY_FROM_CONTENT_SCRIPT') {
    if (!isExtensionSender || !sender.tab) return;
    // Forward capability updates from content script to offscreen script
    // Include tab ID since the offscreen script needs it for validation
    try {
      chrome.runtime.sendMessage({
        ...message,
        tabId: sender.tab.id
      });
    } catch (error) {
      extensionLog("background", "Could not forward capabilities to offscreen", {
        error: error?.message || String(error),
      }, "warn");
    }
    return; // Don't call sendResponse for forwarded messages
  }

  // Handle media control commands from server (forwarded via offscreen)
  if (message.type === "MEDIA_CONTROL_FROM_SERVER") {
    const { action, tabId } = message;
    void forwardMediaControlToTab(tabId, action).catch((error) => {
      console.log("Background: Could not forward media control:", error);
    });
    return;
  }

  if (message.type === "EXECUTE_IBROADCAST_CONTROL") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return false;
    }
    void executeIbroadcastControl(tabId, message.action)
      .then((success) => sendResponse({ success: !!success }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  // Handle messages from popup that need forwarding
  (async () => {
    try {
      if (message.type === 'START_BROADCAST') {
        if (!message.deviceToken && !message.guestAuth) {
          sendResponse({ success: false, error: 'Extension is not signed in' });
          return;
        }

        await setupOffscreenDocument();

        await ensureTabContentScript(message.tabId);

        const response = await forwardToOffscreen({
          type: 'START_BROADCAST',
          tabId: message.tabId,
          streamId: message.streamId,
          relayUrl: message.relayUrl,
          apiOrigin: message.apiOrigin,
          deviceToken: message.deviceToken,
          guestAuth: message.guestAuth || null,
          volume: message.volume,
        });

        sendResponse(response || { success: true });
      }
      // Auto-start on activate removed by request
      else if (message.type === 'CANCEL_PENDING_BROADCAST') {
        pendingBroadcast = null;
        sendResponse({ success: true });
      } 
      else if (message.type === 'STOP_BROADCAST') {
        // Forward to offscreen document
        const response = await forwardToOffscreen({
          type: 'STOP_BROADCAST'
        });
        sendResponse(response || { success: true });
      }
      else if (message.type === 'GET_BROADCAST_STATUS') {
        // Forward to offscreen document
        try {
          const response = await forwardToOffscreen({
            type: 'GET_BROADCAST_STATUS'
          });
          sendResponse(response);
        } catch (error) {
          // Offscreen document might not exist yet
          sendResponse({ status: 'disconnected', tabId: null });
        }
      }
      else if (message.type === 'SWITCH_TAB') {
        await ensureTabContentScript(message.tabId);

        try {
          const response = await forwardToOffscreen({
            type: 'SWITCH_TAB',
            tabId: message.tabId,
            streamId: message.streamId,
            volume: message.volume
          });
          sendResponse(response);
        } catch (error) {
          sendResponse({ success: false, error: 'Failed to switch tab' });
        }
      }
      else if (message.type === 'GET_PENDING_BROADCAST') {
        // Check if there's a pending broadcast request
        if (pendingBroadcast) {
          sendResponse({ 
            pending: true,
            tabId: pendingBroadcast.tabId,
            relayUrl: pendingBroadcast.relayUrl,
            volume: pendingBroadcast.volume
          });
        } else {
          sendResponse({ pending: false });
        }
      }
      else if (message.type === 'PING_CONTENT_SCRIPT') {
        try {
          const response = await chrome.tabs.sendMessage(message.tabId, { 
            type: 'PING_CONTENT_SCRIPT' 
          });
          sendResponse(response);
        } catch (error) {
          extensionLog("background", "Content script ping failed", {
            tabId: message.tabId,
            error: error.message,
          }, "warn");
          sendResponse({ success: false, error: error.message });
        }
      }
      else if (message.type === 'GET_CURRENT_METADATA_FROM_CONTENT') {
        try {
          const response = await chrome.tabs.sendMessage(message.tabId, { 
            type: 'GET_CURRENT_METADATA_FROM_CONTENT' 
          });
          sendResponse(response);
        } catch (error) {
          extensionLog("background", "Metadata read from tab failed", {
            tabId: message.tabId,
            error: error.message,
          }, "warn");
          sendResponse({ success: false, error: error.message });
        }
      }
      else if (message.type === 'ENSURE_CONTENT_SCRIPT') {
        // Ensure content script is present in the given tab; inject if missing
        try {
          const tabId = message.tabId;
          if (typeof tabId !== 'number') {
            sendResponse({ success: false, error: 'Invalid tabId' });
            return;
          }
          try {
            await chrome.tabs.sendMessage(tabId, { type: 'PING_CONTENT_SCRIPT' });
            // Already present
            sendResponse({ success: true, injected: false });
          } catch {
            // Not present, inject
            try {
              await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
              sendResponse({ success: true, injected: true });
            } catch (injectError) {
              sendResponse({ success: false, error: injectError.message || 'Inject failed' });
            }
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      }
      else if (message.type === 'GET_MEDIA_CAPABILITIES_FROM_CONTENT') {
        try {
          const response = await chrome.tabs.sendMessage(message.tabId, {
            type: 'GET_MEDIA_CAPABILITIES',
          });
          sendResponse(response);
        } catch (error) {
          sendResponse({ supportsMediaControls: false, site: null });
        }
      }
      else if (message.type === 'START_METADATA_MONITORING') {
        try {
          const tabId = message.tabId;
          if (typeof tabId !== 'number') {
            sendResponse({ success: false, error: 'Invalid tabId' });
            return;
          }
          const ready = await ensureTabContentScript(tabId);
          if (!ready) {
            sendResponse({ success: false, error: 'Content script unavailable' });
            return;
          }
          const tabResponse = await chrome.tabs.sendMessage(tabId, {
            type: 'START_METADATA_MONITORING',
            forceRestart: message.forceRestart !== false,
          });
          if (tabResponse?.success === false) {
            sendResponse(tabResponse);
            return;
          }
          extensionLog("background", "Metadata monitoring started", { tabId: message.tabId });
          sendResponse({ success: true });
        } catch (error) {
          extensionLog("background", "Metadata monitoring failed to start", {
            tabId: message.tabId,
            error: error.message,
          }, "error");
          sendResponse({ success: false, error: error.message });
        }
      }
      else if (message.type === 'STOP_METADATA_MONITORING') {
        try {
          await chrome.tabs.sendMessage(message.tabId, { 
            type: 'STOP_METADATA_MONITORING' 
          });
          sendResponse({ success: true });
        } catch (error) {
          extensionLog("background", "Stop metadata monitoring failed", {
            tabId: message.tabId,
            error: error.message,
          }, "warn");
          sendResponse({ success: false, error: error.message });
        }
      }
    } catch (error) {
      console.error('Background error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

