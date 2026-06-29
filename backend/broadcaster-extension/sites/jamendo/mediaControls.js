(function () {
  const { hostMatchesSuffix } = window.__collabfmDomUtils || {};

  function matches(host) {
    return hostMatchesSuffix
      ? hostMatchesSuffix(host, "jamendo.com")
      : host === "jamendo.com" || host.endsWith(".jamendo.com");
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  function getPlayButton() {
    return qs(".js-player-play-pause");
  }

  function isPlaying() {
    const btn = getPlayButton();
    if (!btn) return false;

    const pauseIcon = btn.querySelector(".icon-pause");
    const playIcon = btn.querySelector(".icon-play");

    if (pauseIcon && getComputedStyle(pauseIcon).display !== "none") return true;
    if (playIcon && getComputedStyle(playIcon).display === "none") return true;
    return false;
  }

  function clickControl(selector) {
    const el = qs(selector);
    if (!el) return false;
    el.click();
    return true;
  }

  function simulateMediaKey(action) {
    switch (action) {
      case "playPause": {
        const btn = getPlayButton();
        if (!btn) return false;
        btn.click();
        return true;
      }
      case "play": {
        if (isPlaying()) return true;
        return clickControl(".js-player-play-pause");
      }
      case "pause": {
        if (!isPlaying()) return true;
        return clickControl(".js-player-play-pause");
      }
      case "next":
        return clickControl(".js-player-next");
      case "previous":
        return clickControl(".js-player-previous");
      default:
        return false;
    }
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "jamendo",
    label: "Jamendo",
    matches,
    mediaControls: {
      supports: true,
      simulateMediaKey,
    },
  });
})();
