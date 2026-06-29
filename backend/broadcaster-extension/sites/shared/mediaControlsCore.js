(function () {
  function buildKeyboardEventInit(key, shiftKey) {
    const eventInit = {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      view: window,
      detail: 0,
      sourceCapabilities: null,
      isTrusted: true,
    };

    if (key === " ") {
      eventInit.code = "Space";
      eventInit.keyCode = 32;
      eventInit.which = 32;
    } else if (key === "ArrowLeft") {
      eventInit.code = "ArrowLeft";
      eventInit.keyCode = 37;
      eventInit.which = 37;
    } else if (key === "ArrowRight") {
      eventInit.code = "ArrowRight";
      eventInit.keyCode = 39;
      eventInit.which = 39;
    } else {
      eventInit.code = key.toUpperCase();
      eventInit.keyCode = key.charCodeAt(0);
      eventInit.which = key.charCodeAt(0);
    }

    return eventInit;
  }

  function tryMediaSessionAction(action) {
    if (!navigator.mediaSession || !navigator.mediaSession.setActionHandler) return false;

    console.log(`[Radio Broadcaster] Trying MediaSession API for ${action}`);

    try {
      const mediaSessionAction =
        action === "playPause" ? "play" : action === "next" ? "nexttrack" : action === "previous" ? "previoustrack" : null;

      if (!mediaSessionAction) return false;

      const handler = navigator.mediaSession.actionHandlers?.[mediaSessionAction];
      if (handler && typeof handler === "function") {
        console.log(`[Radio Broadcaster] Calling MediaSession ${mediaSessionAction} handler`);
        handler();
        console.log(`[Radio Broadcaster] MediaSession ${mediaSessionAction} handler called successfully`);
        return true;
      }

      console.log(`[Radio Broadcaster] No MediaSession ${mediaSessionAction} handler found`);
    } catch (error) {
      console.log("[Radio Broadcaster] MediaSession API failed:", error.message);
    }

    return false;
  }

  function dispatchKeyboard(action, eventInit) {
    const event = new KeyboardEvent("keydown", eventInit);

    console.log("[Radio Broadcaster] Created event:", {
      type: event.type,
      key: event.key,
      shiftKey: event.shiftKey,
      code: event.code,
      keyCode: event.keyCode,
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      isTrusted: event.isTrusted,
    });

    console.log(`[Radio Broadcaster] Dispatching ${action} keyboard events on document`);

    try {
      const keydownResult = document.dispatchEvent(event);
      console.log("[Radio Broadcaster] Keydown dispatched on document:", keydownResult);

      if (keydownResult !== false) {
        setTimeout(() => {
          try {
            const keyupEvent = new KeyboardEvent("keyup", eventInit);
            const keyupResult = document.dispatchEvent(keyupEvent);
            console.log("[Radio Broadcaster] Keyup dispatched on document:", keyupResult);
          } catch (error) {
            console.log("[Radio Broadcaster] Keyup dispatch failed:", error.message);
          }
        }, 10);
        return true;
      }

      console.log("[Radio Broadcaster] Keydown was cancelled");
    } catch (error) {
      console.log("[Radio Broadcaster] Document dispatch failed:", error.message);
    }

    return false;
  }

  function simulateMediaKey(action, { hostname, mapActionToKey, onKeyboardFallbackFailed }) {
    const mapped = mapActionToKey(action);
    if (!mapped) return;

    const { key, shiftKey } = mapped;
    console.log(
      `[Radio Broadcaster] Simulating ${hostname} keyboard event: ${shiftKey ? "Shift+" : ""}${key} for ${action}`,
    );

    if (tryMediaSessionAction(action)) return;

    console.log(`[Radio Broadcaster] Falling back to keyboard events for ${action}`);

    const eventInit = buildKeyboardEventInit(key, shiftKey);
    if (dispatchKeyboard(action, eventInit)) return;

    if (typeof onKeyboardFallbackFailed === "function") {
      onKeyboardFallbackFailed();
      return;
    }

    console.log(`[Radio Broadcaster] All methods failed for ${hostname} - may be blocking extension events`);
  }

  window.__collabfmMediaControlsCore = { simulateMediaKey };
})();
