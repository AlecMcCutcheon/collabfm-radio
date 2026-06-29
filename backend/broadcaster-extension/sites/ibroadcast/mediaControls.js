(function () {
  const { hostMatchesSuffix } = window.__collabfmDomUtils || {};

  function matches(host) {
    return hostMatchesSuffix
      ? hostMatchesSuffix(host, "media.ibroadcast.com")
      : host === "media.ibroadcast.com" || host.endsWith(".media.ibroadcast.com");
  }

  function ibuiReady() {
    return typeof window.ibui !== "undefined";
  }

  function simulateMediaKey(action) {
    if (!ibuiReady()) {
      console.log("[Radio Broadcaster] iBroadcast ibui API not available");
      return false;
    }

    try {
      switch (action) {
        case "playPause":
          window.ibui.togglePlay();
          return true;
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
    } catch (error) {
      console.log("[Radio Broadcaster] iBroadcast media control failed:", error.message);
      return false;
    }
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "ibroadcast",
    label: "iBroadcast",
    matches,
    mediaControls: {
      supports: true,
      simulateMediaKey,
    },
  });
})();
