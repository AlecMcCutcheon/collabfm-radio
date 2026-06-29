(function () {
  function mapActionToKey(action) {
    switch (action) {
      case "playPause":
        return { key: " ", shiftKey: false };
      case "previous":
        return { key: "ArrowLeft", shiftKey: true };
      case "next":
        return { key: "ArrowRight", shiftKey: true };
      default:
        return null;
    }
  }

  function clickSoundCloudControl(action) {
    const buttonSelectors = {
      playPause: ".playControls__play",
      previous: ".playControls__prev",
      next: ".playControls__next",
    };

    const targetSelector = buttonSelectors[action];
    if (!targetSelector) return false;

    const playerButton = document.querySelector(targetSelector);
    if (!playerButton) {
      console.log(`[Radio Broadcaster] SoundCloud ${action} button not found: ${targetSelector}`);
      return false;
    }

    console.log(`[Radio Broadcaster] Found SoundCloud ${action} button, clicking directly`);
    try {
      playerButton.click();
      console.log(`[Radio Broadcaster] Successfully clicked SoundCloud ${action} button`);
      return true;
    } catch (error) {
      console.log("[Radio Broadcaster] Direct button click failed:", error.message);
      return false;
    }
  }

  function simulateMediaKey(action) {
    window.__collabfmMediaControlsCore?.simulateMediaKey(action, {
      hostname: window.location.hostname,
      mapActionToKey,
      onKeyboardFallbackFailed: () => clickSoundCloudControl(action),
    });
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "soundcloud",
    label: "SoundCloud",
    matches: (host) => host === "soundcloud.com",
    mediaControls: {
      supports: true,
      simulateMediaKey,
    },
  });
})();
