(function () {
  function mapActionToKey(action) {
    switch (action) {
      case "playPause":
        return { key: " ", shiftKey: false };
      case "previous":
        return { key: "P", shiftKey: true };
      case "next":
        return { key: "N", shiftKey: true };
      default:
        return null;
    }
  }

  function simulateMediaKey(action) {
    window.__collabfmMediaControlsCore?.simulateMediaKey(action, {
      hostname: window.location.hostname,
      mapActionToKey,
    });
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "youtube-music",
    label: "YouTube Music",
    matches: (host) => host === "music.youtube.com",
    mediaControls: {
      supports: true,
      simulateMediaKey,
    },
  });
})();
