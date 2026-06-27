// Content script to monitor MediaSession metadata on the recorded tab
// Prevent duplicate injection by checking if script is already loaded
if (window.radioBroadcasterContentScriptLoaded) {
  // Script already loaded, exit early
  console.log('[Radio Broadcaster] Content script already loaded, preventing duplicate injection');
} else {
  // Mark as loaded to prevent duplicates
  window.radioBroadcasterContentScriptLoaded = true;
  
  console.log('[Radio Broadcaster] Content script loaded successfully');
  console.log('[Radio Broadcaster] Page URL:', window.location.href);
  console.log('[Radio Broadcaster] Navigator.mediaSession available:', !!navigator.mediaSession);
  
  let metadataInterval = null;
  let metadataBootstrapTimers = [];
  let ncsDomObserver = null;
  let ncsDomCheckTimer = null;
  let ncsDomReadyListener = null;
  let lastSentMetadata = null;
  let metadataUnavailableCount = 0;
  let isPageUnloading = false;
  let lastSentCapabilities = null;
  const MAX_UNAVAILABLE_COUNT = 3; // Only clear metadata after 3 consecutive failed checks

  function isNcsSite() {
    try {
      const host = window.location.hostname.replace(/^www\./, "");
      return host === "ncs.io" || host.endsWith(".ncs.io");
    } catch {
      return false;
    }
  }

  function cleanDomText(el) {
    return el?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function getNcsCoverArt(root = document) {
    const img =
      root.querySelector("div.cover img.x-player-cover") ||
      root.querySelector("img.x-player-cover");
    const src = String(img?.getAttribute("src") || img?.src || "").trim();
    if (!src || src.startsWith("data:")) return null;
    return src;
  }

  function getNcsPlayerMeta() {
    const title = cleanDomText(document.querySelector(".x-player-track"));
    const artist = cleanDomText(document.querySelector(".x-player-artist"));
    if (!title || !artist) return null;
    return { title, artist, albumArt: getNcsCoverArt() };
  }

  function getNcsPageMeta() {
    const section = document.querySelector("section.player-nest");
    if (!section) return null;

    const titleEl = section.querySelector("h2");
    if (!titleEl) return null;

    const artists = Array.from(titleEl.querySelectorAll("a"))
      .map(cleanDomText)
      .filter(Boolean);
    const artist = artists.join(", ");
    if (!artist) return null;

    const titleClone = titleEl.cloneNode(true);
    for (const link of titleClone.querySelectorAll("a")) {
      link.remove();
    }
    const title = cleanDomText(titleClone);
    if (!title) return null;

    return { title, artist, albumArt: getNcsCoverArt(section) || getNcsCoverArt() };
  }

  function getNcsDomMetadata() {
    return getNcsPageMeta() || getNcsPlayerMeta();
  }

  function stopNcsDomObserver() {
    if (ncsDomObserver) {
      ncsDomObserver.disconnect();
      ncsDomObserver = null;
    }
    if (ncsDomReadyListener) {
      document.removeEventListener("DOMContentLoaded", ncsDomReadyListener);
      ncsDomReadyListener = null;
    }
    if (ncsDomCheckTimer) {
      clearTimeout(ncsDomCheckTimer);
      ncsDomCheckTimer = null;
    }
  }

  function scheduleNcsDomCheck() {
    if (ncsDomCheckTimer) clearTimeout(ncsDomCheckTimer);
    ncsDomCheckTimer = setTimeout(() => {
      ncsDomCheckTimer = null;
      void checkMetadata();
    }, 150);
  }

  function startNcsDomObserver() {
    stopNcsDomObserver();

    const attach = () => {
      if (!document.body) return;
      ncsDomObserver = new MutationObserver(() => {
        scheduleNcsDomCheck();
      });
      ncsDomObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };

    if (document.body) {
      attach();
      return;
    }

    ncsDomReadyListener = () => {
      ncsDomReadyListener = null;
      attach();
    };
    document.addEventListener("DOMContentLoaded", ncsDomReadyListener);
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

  function bindMediaSessionMetadataEvents() {
    if (!navigator.mediaSession || bindMediaSessionMetadataEvents.bound) return;
    bindMediaSessionMetadataEvents.bound = true;
    try {
      navigator.mediaSession.addEventListener("metadatachange", () => {
        void checkMetadata();
      });
    } catch {}
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  async function chooseAlbumArt(artwork) {
    if (!Array.isArray(artwork) || artwork.length === 0) return null;

    const sorted = [...artwork].sort((a, b) => {
      const aSize = Number.parseInt(String(a?.sizes || "0").split("x")[0], 10) || 0;
      const bSize = Number.parseInt(String(b?.sizes || "0").split("x")[0], 10) || 0;
      return bSize - aSize;
    });

    const durable = sorted.find((item) => {
      const src = String(item?.src || "").trim();
      return src.startsWith("https://") || src.startsWith("http://");
    });

    const inline = sorted.find((item) => {
      const src = String(item?.src || "").trim();
      return src.startsWith("data:image/");
    });

    if (durable?.src) return durable.src;
    if (inline?.src) return inline.src;

    const blobArt = sorted.find((item) => String(item?.src || "").trim().startsWith("blob:"));
    if (blobArt?.src) {
      try {
        const response = await fetch(blobArt.src);
        const blob = await response.blob();
        if (blob.type.startsWith("image/")) return await blobToDataUrl(blob);
      } catch {}
    }

    return null;
  }

  // Function to get current metadata (site-specific DOM scrapers, then MediaSession)
  async function getCurrentMetadata() {
    if (isNcsSite()) {
      const ncsMeta = getNcsDomMetadata();
      if (ncsMeta?.title && ncsMeta?.artist) {
        return ncsMeta;
      }
    }

    try {
      if (!navigator.mediaSession) {
        console.log('[Radio Broadcaster] Navigator.mediaSession not available');
        return null;
      }
      
      if (!navigator.mediaSession.metadata) {
        console.log('[Radio Broadcaster] No MediaSession metadata available');
        return null;
      }
      
      const metadata = navigator.mediaSession.metadata;
      const albumArt = await chooseAlbumArt(metadata.artwork);
      
      let title = String(metadata.title || "").trim();
      let artist = String(metadata.artist || "").trim();

      // YouTube Music sometimes omits artist briefly or embeds it in the title ("Track · Artist").
      if (!artist && title.includes(" · ")) {
        const parts = title.split(" · ").map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
          artist = parts.pop() || "";
          title = parts.join(" · ");
        }
      }
      if (!artist && String(metadata.album || "").trim()) {
        artist = String(metadata.album).trim();
      }

      console.log('[Radio Broadcaster] Raw MediaSession metadata:', {
        title,
        artist,
        album: metadata.album,
        artworkCount: metadata.artwork ? metadata.artwork.length : 0,
        albumArt,
      });
      
      // Only return metadata if we have both title and artist
      if (title && artist) {
        console.log('[Radio Broadcaster] Valid metadata detected:', { title, artist, albumArt });
        return { title, artist, albumArt };
      } else {
        console.log('[Radio Broadcaster] Metadata found but missing title/artist or empty:', { 
          hasTitle: !!title, 
          titleValue: title,
          hasArtist: !!artist, 
          artistValue: artist,
        });
      }
      
      return null;
    } catch (error) {
      console.error('[Radio Broadcaster] Error getting MediaSession metadata:', error);
      return null;
    }
  }

  // Function to send metadata update to offscreen script
  function sendMetadataUpdate(metadata) {
    try {
      // Guard against extension context invalidation during navigations/reloads
      if (!chrome.runtime || !chrome.runtime.id) return;
      // Skip sends during page unload or prerender/hidden transitions
      try {
        if (isPageUnloading || (document && (document.visibilityState === 'prerender'))) return;
      } catch {}
      chrome.runtime.sendMessage({
        type: 'METADATA_FROM_CONTENT_SCRIPT',
        metadata: metadata,
        origin: window.location.origin
      }).then(() => {}).catch(() => {});
    } catch (error) {
      // Fully suppress sync send errors
      return;
    }
  }

  // Function to send capability update to offscreen script
  function sendCapabilityUpdate(capabilities) {
    try {
      // Guard against extension context invalidation during navigations/reloads
      if (!chrome.runtime || !chrome.runtime.id) return;
      // Skip sends during page unload or prerender/hidden transitions
      try {
        if (isPageUnloading || (document && (document.visibilityState === 'prerender'))) return;
      } catch {}
      chrome.runtime.sendMessage({
        type: 'CAPABILITY_FROM_CONTENT_SCRIPT',
        capabilities: capabilities,
        origin: window.location.origin
      }).then(() => {}).catch(() => {});
    } catch (error) {
      // Fully suppress sync send errors
      return;
    }
  }

  // Function to check for metadata changes
  async function checkMetadata() {
    console.log('[Radio Broadcaster] Checking for metadata changes...');
    const currentMetadata = await getCurrentMetadata();
    
    if (currentMetadata) {
      // Valid metadata detected - reset unavailable counter
      metadataUnavailableCount = 0;
      
      // Check if metadata has actually changed from what we last sent
      const hasChanged = !lastSentMetadata || 
        lastSentMetadata.title !== currentMetadata.title || 
        lastSentMetadata.artist !== currentMetadata.artist ||
        String(lastSentMetadata.albumArt || "") !== String(currentMetadata.albumArt || "");
      
      console.log('[Radio Broadcaster] Metadata change check:', {
        currentMetadata,
        lastSentMetadata,
        hasChanged
      });
      
      if (hasChanged) {
        console.log('[Radio Broadcaster] MediaSession metadata changed, sending update:', currentMetadata);
        lastSentMetadata = { ...currentMetadata };
        sendMetadataUpdate(currentMetadata);
      } else {
        console.log('[Radio Broadcaster] No metadata changes detected');
      }
    } else {
      // Transient MediaSession gaps are common during connect — keep last known track.
      metadataUnavailableCount++;
      console.log(
        `[Radio Broadcaster] No metadata detected (count: ${metadataUnavailableCount}/${MAX_UNAVAILABLE_COUNT}) — preserving last known track`,
      );
    }
  }

  // Check if current site supports media controls
  function isSupportedMediaSite() {
    try {
      const hostname = window.location.hostname;
      return hostname === 'music.youtube.com' || hostname === 'soundcloud.com';
    } catch (e) {
      return false;
    }
  }

  // Function to simulate keyboard events for media controls
  function simulateMediaKey(action) {
    // Only allow media controls on supported sites
    if (!isSupportedMediaSite()) {
      console.log('[Radio Broadcaster] Media controls blocked - unsupported site');
      return;
    }

    const hostname = window.location.hostname;
    let key, shiftKey = false;

    if (hostname === 'music.youtube.com') {
      // YouTube Music shortcuts
      switch (action) {
        case 'playPause':
          key = ' '; // Spacebar
          break;
        case 'previous':
          key = 'P';
          shiftKey = true; // Shift + P
          break;
        case 'next':
          key = 'N';
          shiftKey = true; // Shift + N
          break;
        default:
          return;
      }
    } else if (hostname === 'soundcloud.com') {
      // SoundCloud shortcuts
      switch (action) {
        case 'playPause':
          key = ' '; // Spacebar
          break;
        case 'previous':
          key = 'ArrowLeft';
          shiftKey = true; // Shift + Left Arrow
          break;
        case 'next':
          key = 'ArrowRight';
          shiftKey = true; // Shift + Right Arrow
          break;
        default:
          return;
      }
    } else {
      console.log(`[Radio Broadcaster] Unsupported site: ${hostname}`);
      return; // Unsupported site
    }

    console.log(`[Radio Broadcaster] Simulating ${hostname} keyboard event: ${shiftKey ? 'Shift+' : ''}${key} for ${action}`);

    // Try using MediaSession API first if available
    if (navigator.mediaSession && navigator.mediaSession.setActionHandler) {
      console.log(`[Radio Broadcaster] Trying MediaSession API for ${action}`);

      try {
        // Map our actions to MediaSession actions
        const mediaSessionAction = action === 'playPause' ? 'play' :
                                   action === 'next' ? 'nexttrack' :
                                   action === 'previous' ? 'previoustrack' : null;

        if (mediaSessionAction) {
          // Trigger the MediaSession action by calling the handler directly
          const handler = navigator.mediaSession.actionHandlers?.[mediaSessionAction];
          if (handler && typeof handler === 'function') {
            console.log(`[Radio Broadcaster] Calling MediaSession ${mediaSessionAction} handler`);
            handler();
            console.log(`[Radio Broadcaster] MediaSession ${mediaSessionAction} handler called successfully`);
            return;
          } else {
            console.log(`[Radio Broadcaster] No MediaSession ${mediaSessionAction} handler found`);
          }
        }
      } catch (e) {
        console.log('[Radio Broadcaster] MediaSession API failed:', e.message);
      }
    }

    // Fallback to keyboard events
    console.log(`[Radio Broadcaster] Falling back to keyboard events for ${action}`);

    // Create a more realistic keyboard event
    const eventInit = {
      key: key,
      shiftKey: shiftKey,
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      view: window,
      detail: 0,
      sourceCapabilities: null,
      isTrusted: true, // This might help
    };

    // Add appropriate code and keyCode for different key types
    if (key === ' ') {
      eventInit.code = 'Space';
      eventInit.keyCode = 32;
      eventInit.which = 32;
    } else if (key === 'ArrowLeft') {
      eventInit.code = 'ArrowLeft';
      eventInit.keyCode = 37;
      eventInit.which = 37;
    } else if (key === 'ArrowRight') {
      eventInit.code = 'ArrowRight';
      eventInit.keyCode = 39;
      eventInit.which = 39;
    } else {
      eventInit.code = key.toUpperCase();
      eventInit.keyCode = key.charCodeAt(0);
      eventInit.which = key.charCodeAt(0);
    }

    const event = new KeyboardEvent('keydown', eventInit);

    console.log('[Radio Broadcaster] Created event:', {
      type: event.type,
      key: event.key,
      shiftKey: event.shiftKey,
      code: event.code,
      keyCode: event.keyCode,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      isTrusted: event.isTrusted
    });

    // Dispatch keyboard events on document (proper keyboard simulation)
    console.log(`[Radio Broadcaster] Dispatching ${action} keyboard events on document`);

    try {
      // Dispatch keydown event
      const keydownResult = document.dispatchEvent(event);
      console.log('[Radio Broadcaster] Keydown dispatched on document:', keydownResult);

      if (keydownResult !== false) {
        // Dispatch keyup event after a small delay
        setTimeout(() => {
          try {
            const keyupEvent = new KeyboardEvent('keyup', eventInit);
            const keyupResult = document.dispatchEvent(keyupEvent);
            console.log('[Radio Broadcaster] Keyup dispatched on document:', keyupResult);

            if (keyupResult !== false) {
              console.log('[Radio Broadcaster] Successfully dispatched keyboard events on document');
            } else {
              console.log('[Radio Broadcaster] Keyup was cancelled');
            }
          } catch (e) {
            console.log('[Radio Broadcaster] Keyup dispatch failed:', e.message);
          }
        }, 10); // Small delay for realistic keyup timing

        return; // Consider it successful if keydown worked
      } else {
        console.log('[Radio Broadcaster] Keydown was cancelled');
      }
    } catch (e) {
      console.log('[Radio Broadcaster] Document dispatch failed:', e.message);
    }

    // For SoundCloud, try direct button clicking as fallback
    if (hostname === 'soundcloud.com') {
      console.log('[Radio Broadcaster] SoundCloud fallback - trying direct button clicking');

      // Define the specific SoundCloud button selectors
      const buttonSelectors = {
        playPause: '.playControls__play',
        previous: '.playControls__prev',
        next: '.playControls__next'
      };

      const targetSelector = buttonSelectors[action];
      if (targetSelector) {
        const playerButton = document.querySelector(targetSelector);
        if (playerButton) {
          console.log(`[Radio Broadcaster] Found SoundCloud ${action} button, clicking directly`);
          try {
            playerButton.click();
            console.log(`[Radio Broadcaster] Successfully clicked SoundCloud ${action} button`);
            return;
          } catch (e) {
            console.log(`[Radio Broadcaster] Direct button click failed:`, e.message);
          }
        } else {
          console.log(`[Radio Broadcaster] SoundCloud ${action} button not found: ${targetSelector}`);
        }
      }
    }

    console.log(`[Radio Broadcaster] All methods failed for ${hostname} - may be blocking extension events`);
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Radio Broadcaster] Received message:', message.type);

    if (message.type === 'PING_CONTENT_SCRIPT') {
      console.log('[Radio Broadcaster] Responding to ping');
      sendResponse({ success: true });
      return;
    }

    if (message.type === 'GET_CURRENT_METADATA_FROM_CONTENT') {
      console.log('[Radio Broadcaster] Getting current metadata on request');
      getCurrentMetadata().then((currentMetadata) => {
        console.log('[Radio Broadcaster] Current metadata response:', currentMetadata);
        sendResponse({ metadata: currentMetadata });
      });
      return true;
    }

    if (message.type === 'GET_MEDIA_CAPABILITIES') {
      sendResponse({
        supportsMediaControls: isSupportedMediaSite(),
        site: window.location.hostname,
      });
      return;
    }

    if (message.type === 'MEDIA_CONTROL') {
      // Handle media control commands
      console.log('[Radio Broadcaster] Processing media control:', message.action);

      try {
        simulateMediaKey(message.action);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Radio Broadcaster] Media control simulation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (message.type === 'START_METADATA_MONITORING') {
      console.log('[Radio Broadcaster] Starting MediaSession metadata monitoring');
      console.log('[Radio Broadcaster] Current MediaSession state:', {
        hasMediaSession: !!navigator.mediaSession,
        hasMetadata: !!(navigator.mediaSession && navigator.mediaSession.metadata),
        playbackState: navigator.mediaSession ? navigator.mediaSession.playbackState : 'unknown'
      });

      // Stop any existing monitoring interval/timers before restarting
      if (metadataInterval) {
        console.log('[Radio Broadcaster] Stopping existing monitoring interval');
        clearInterval(metadataInterval);
        metadataInterval = null;
      }
      clearMetadataBootstrapTimers();
      stopNcsDomObserver();

      // Always restart fresh so reconnect picks up MediaSession without a page reload.
      lastSentMetadata = null;
      metadataUnavailableCount = 0;

      // Send initial capability information
      const capabilities = {
        supportsMediaControls: isSupportedMediaSite(),
        site: window.location.hostname
      };

      // Check if capabilities changed
      const capabilitiesChanged = !lastSentCapabilities ||
        lastSentCapabilities.supportsMediaControls !== capabilities.supportsMediaControls ||
        lastSentCapabilities.site !== capabilities.site;

      if (capabilitiesChanged) {
        console.log('[Radio Broadcaster] Sending capability update:', capabilities);
        lastSentCapabilities = { ...capabilities };
        sendCapabilityUpdate(capabilities);
      }

      // Bootstrap checks catch MediaSession metadata that appears shortly after connect.
      console.log('[Radio Broadcaster] Performing initial metadata bootstrap checks');
      bindMediaSessionMetadataEvents();
      scheduleMetadataBootstrapChecks();
      if (isNcsSite()) {
        startNcsDomObserver();
      }
      void checkMetadata();

      if (message.forceRestart !== false) {
        void getCurrentMetadata().then((currentMetadata) => {
          if (!currentMetadata?.title || !currentMetadata?.artist) return;
          lastSentMetadata = { ...currentMetadata };
          sendMetadataUpdate(currentMetadata);
        });
      }

      // Start monitoring every 2 seconds
      console.log('[Radio Broadcaster] Starting monitoring interval (2 seconds)');
      metadataInterval = setInterval(() => {
        console.log('[Radio Broadcaster] Interval check triggered');
        checkMetadata();
      }, 2000);

      console.log('[Radio Broadcaster] Metadata monitoring started successfully');
      sendResponse({ success: true });
      return;
    }

    if (message.type === 'STOP_METADATA_MONITORING') {
      console.log('[Radio Broadcaster] Stopping MediaSession metadata monitoring');

      if (metadataInterval) {
        console.log('[Radio Broadcaster] Clearing monitoring interval');
        clearInterval(metadataInterval);
        metadataInterval = null;
      }
      clearMetadataBootstrapTimers();
      stopNcsDomObserver();

      lastSentMetadata = null;

      // Send final update that monitoring stopped
      console.log('[Radio Broadcaster] Sending stop notification');
      sendMetadataUpdate(null);

      sendResponse({ success: true });
      return;
    }

    return false;
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    console.log('[Radio Broadcaster] Page unloading, cleaning up');
    isPageUnloading = true;
    if (metadataInterval) {
      clearInterval(metadataInterval);
      metadataInterval = null;
    }
    clearMetadataBootstrapTimers();
    stopNcsDomObserver();
  });
  try {
    window.addEventListener('pagehide', () => { isPageUnloading = true; });
  } catch {}
  
  console.log('[Radio Broadcaster] Content script setup complete, ready for messages');
  bindMediaSessionMetadataEvents();
}