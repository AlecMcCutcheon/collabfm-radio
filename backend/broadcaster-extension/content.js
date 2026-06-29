// Content script orchestrator — site-specific logic lives under sites/.
if (window.radioBroadcasterContentScriptLoaded) {
  console.log("[Radio Broadcaster] Content script already loaded, preventing duplicate injection");
} else {
  window.radioBroadcasterContentScriptLoaded = true;

  const sites = () => window.__collabfmSites;
  const mediaSession = () => window.__collabfmMediaSession;

  console.log("[Radio Broadcaster] Content script loaded successfully");
  console.log("[Radio Broadcaster] Page URL:", window.location.href);
  console.log("[Radio Broadcaster] Navigator.mediaSession available:", !!navigator.mediaSession);

  let metadataInterval = null;
  let metadataBootstrapTimers = [];
  let lastSentMetadata = null;
  let metadataUnavailableCount = 0;
  let isPageUnloading = false;
  let lastSentCapabilities = null;
  const MAX_UNAVAILABLE_COUNT = 3;

  function normalizedPageSite() {
    return (
      window.__collabfmDomUtils?.normalizeHostname?.(window.location.hostname) ||
      window.location.hostname.replace(/^www\./, "")
    );
  }

  function withSourceLabel(metadata) {
    if (!metadata?.title || !metadata?.artist) return metadata;
    const label = sites()?.getSourceLabel?.();
    if (!label) return metadata;
    return { ...metadata, sourceLabel: label };
  }

  function metadataHasChanged(previous, current) {
    if (!previous) return true;
    return (
      previous.title !== current.title ||
      previous.artist !== current.artist ||
      String(previous.albumArt || "") !== String(current.albumArt || "") ||
      String(previous.licenseType || "") !== String(current.licenseType || "") ||
      String(previous.licenseUrl || "") !== String(current.licenseUrl || "") ||
      String(previous.url || "") !== String(current.url || "") ||
      String(previous.sourceLabel || "") !== String(current.sourceLabel || "")
    );
  }

  function clearMetadataBootstrapTimers() {
    for (const timer of metadataBootstrapTimers) {
      clearTimeout(timer);
    }
    metadataBootstrapTimers = [];
  }

  function scheduleMetadataBootstrapChecks() {
    clearMetadataBootstrapTimers();
    const delaysMs = [0, 250, 500, 1000, 1500, 2000, 4000, 8000, 12000];
    for (const delayMs of delaysMs) {
      metadataBootstrapTimers.push(
        setTimeout(() => {
          void checkMetadata();
        }, delayMs),
      );
    }
  }

  async function getCurrentMetadata() {
    const siteMeta = await sites()?.getPlayerMetadata?.();
    if (siteMeta?.title && siteMeta?.artist) {
      return siteMeta;
    }

    return mediaSession()?.getMediaSessionMetadata?.() ?? null;
  }

  function sendMetadataUpdate(metadata) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      try {
        if (isPageUnloading || (document && document.visibilityState === "prerender")) return;
      } catch {}
      chrome.runtime
        .sendMessage({
          type: "METADATA_FROM_CONTENT_SCRIPT",
          metadata,
          origin: window.location.origin,
        })
        .then(() => {})
        .catch(() => {});
    } catch {
      return;
    }
  }

  function sendCapabilityUpdate(capabilities) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      try {
        if (isPageUnloading || (document && document.visibilityState === "prerender")) return;
      } catch {}
      chrome.runtime
        .sendMessage({
          type: "CAPABILITY_FROM_CONTENT_SCRIPT",
          capabilities,
          origin: window.location.origin,
        })
        .then(() => {})
        .catch(() => {});
    } catch {
      return;
    }
  }

  async function checkMetadata() {
    console.log("[Radio Broadcaster] Checking for metadata changes...");
    let currentMetadata = await getCurrentMetadata();

    if (currentMetadata) {
      currentMetadata = await sites()?.enrichMetadata?.(currentMetadata);
      currentMetadata = withSourceLabel(currentMetadata);
    }

    if (currentMetadata) {
      metadataUnavailableCount = 0;

      const hasChanged = metadataHasChanged(lastSentMetadata, currentMetadata);

      console.log("[Radio Broadcaster] Metadata change check:", {
        currentMetadata,
        lastSentMetadata,
        hasChanged,
      });

      if (hasChanged) {
        console.log("[Radio Broadcaster] MediaSession metadata changed, sending update:", currentMetadata);
        lastSentMetadata = { ...currentMetadata };
        sendMetadataUpdate(currentMetadata);
      } else {
        console.log("[Radio Broadcaster] No metadata changes detected");
      }
    } else {
      metadataUnavailableCount++;
      console.log(
        `[Radio Broadcaster] No metadata detected (count: ${metadataUnavailableCount}/${MAX_UNAVAILABLE_COUNT}) — preserving last known track`,
      );
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Radio Broadcaster] Received message:", message.type);

    if (message.type === "PING_CONTENT_SCRIPT") {
      console.log("[Radio Broadcaster] Responding to ping");
      sendResponse({ success: true });
      return;
    }

    if (message.type === "GET_CURRENT_METADATA_FROM_CONTENT") {
      console.log("[Radio Broadcaster] Getting current metadata on request");
      getCurrentMetadata()
        .then((currentMetadata) => sites()?.enrichMetadata?.(currentMetadata))
        .then((currentMetadata) => withSourceLabel(currentMetadata))
        .then((currentMetadata) => {
          console.log("[Radio Broadcaster] Current metadata response:", currentMetadata);
          sendResponse({ metadata: currentMetadata });
        });
      return true;
    }

    if (message.type === "GET_MEDIA_CAPABILITIES") {
      sendResponse({
        supportsMediaControls: sites()?.supportsMediaControls?.() === true,
        site: normalizedPageSite(),
      });
      return;
    }

    if (message.type === "MEDIA_CONTROL") {
      console.log("[Radio Broadcaster] Processing media control:", message.action);

      try {
        sites()?.simulateMediaKey?.(message.action);
        sendResponse({ success: true });
      } catch (error) {
        console.error("[Radio Broadcaster] Media control simulation failed:", error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (message.type === "START_METADATA_MONITORING") {
      console.log("[Radio Broadcaster] Starting MediaSession metadata monitoring");
      console.log("[Radio Broadcaster] Current MediaSession state:", {
        hasMediaSession: !!navigator.mediaSession,
        hasMetadata: !!(navigator.mediaSession && navigator.mediaSession.metadata),
        playbackState: navigator.mediaSession ? navigator.mediaSession.playbackState : "unknown",
      });

      if (metadataInterval) {
        console.log("[Radio Broadcaster] Stopping existing monitoring interval");
        clearInterval(metadataInterval);
        metadataInterval = null;
      }
      clearMetadataBootstrapTimers();
      sites()?.stopMetadataObservers?.();
      sites()?.clearSiteState?.();

      lastSentMetadata = null;
      metadataUnavailableCount = 0;

      const capabilities = {
        supportsMediaControls: sites()?.supportsMediaControls?.() === true,
        site: normalizedPageSite(),
      };

      const capabilitiesChanged =
        !lastSentCapabilities ||
        lastSentCapabilities.supportsMediaControls !== capabilities.supportsMediaControls ||
        lastSentCapabilities.site !== capabilities.site;

      if (capabilitiesChanged) {
        console.log("[Radio Broadcaster] Sending capability update:", capabilities);
        lastSentCapabilities = { ...capabilities };
        sendCapabilityUpdate(capabilities);
      }

      console.log("[Radio Broadcaster] Performing initial metadata bootstrap checks");
      mediaSession()?.bindMediaSessionMetadataEvents?.(() => checkMetadata());
      scheduleMetadataBootstrapChecks();
      sites()?.startMetadataObservers?.(() => checkMetadata());
      void checkMetadata();

      if (message.forceRestart !== false) {
        void getCurrentMetadata()
          .then((currentMetadata) => sites()?.enrichMetadata?.(currentMetadata))
        .then((currentMetadata) => withSourceLabel(currentMetadata))
          .then((currentMetadata) => {
            if (!currentMetadata?.title || !currentMetadata?.artist) return;
            lastSentMetadata = { ...currentMetadata };
            sendMetadataUpdate(currentMetadata);
          });
      }

      console.log("[Radio Broadcaster] Starting monitoring interval (2 seconds)");
      metadataInterval = setInterval(() => {
        console.log("[Radio Broadcaster] Interval check triggered");
        checkMetadata();
      }, 2000);

      console.log("[Radio Broadcaster] Metadata monitoring started successfully");
      sendResponse({ success: true });
      return;
    }

    if (message.type === "STOP_METADATA_MONITORING") {
      console.log("[Radio Broadcaster] Stopping MediaSession metadata monitoring");

      if (metadataInterval) {
        console.log("[Radio Broadcaster] Clearing monitoring interval");
        clearInterval(metadataInterval);
        metadataInterval = null;
      }
      clearMetadataBootstrapTimers();
      sites()?.stopMetadataObservers?.();
      sites()?.clearSiteState?.();

      lastSentMetadata = null;

      console.log("[Radio Broadcaster] Sending stop notification");
      sendMetadataUpdate(null);

      sendResponse({ success: true });
      return;
    }

    return false;
  });

  window.addEventListener("beforeunload", () => {
    console.log("[Radio Broadcaster] Page unloading, cleaning up");
    isPageUnloading = true;
    if (metadataInterval) {
      clearInterval(metadataInterval);
      metadataInterval = null;
    }
    clearMetadataBootstrapTimers();
    sites()?.stopMetadataObservers?.();
    sites()?.clearSiteState?.();
  });
  try {
    window.addEventListener("pagehide", () => {
      isPageUnloading = true;
    });
  } catch {}

  console.log("[Radio Broadcaster] Content script setup complete, ready for messages");
  mediaSession()?.bindMediaSessionMetadataEvents?.(() => checkMetadata());
}
