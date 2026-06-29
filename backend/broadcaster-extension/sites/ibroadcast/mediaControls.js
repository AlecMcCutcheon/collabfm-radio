(function () {
  const { hostMatchesSuffix } = window.__collabfmDomUtils || {};

  function matches(host) {
    return hostMatchesSuffix
      ? hostMatchesSuffix(host, "media.ibroadcast.com")
      : host === "media.ibroadcast.com" || host.endsWith(".media.ibroadcast.com");
  }

  function simulateMediaKey(action) {
    try {
      if (!chrome.runtime?.id) return false;
      chrome.runtime.sendMessage({ type: "EXECUTE_IBROADCAST_CONTROL", action });
      return true;
    } catch (error) {
      console.log("[Radio Broadcaster] iBroadcast control relay failed:", error.message);
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
