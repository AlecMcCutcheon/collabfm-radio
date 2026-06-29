// NoCopyrightSounds — DOM metadata (title, artist, cover art).
(function () {
  const { cleanDomText, hostMatchesSuffix } = window.__collabfmDomUtils || {};
  const { createDomObserver } = window.__collabfmDomObserver || {};

  let domObserverHandle = null;

  function matches(host) {
    return hostMatchesSuffix ? hostMatchesSuffix(host, "ncs.io") : host === "ncs.io" || host.endsWith(".ncs.io");
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

  function getPlayerMetadata() {
    return getNcsPageMeta() || getNcsPlayerMeta();
  }

  function startDomObserver(onCheck) {
    if (!createDomObserver) return;
    domObserverHandle?.stop();
    domObserverHandle = createDomObserver(onCheck);
    domObserverHandle.start();
  }

  function stopDomObserver() {
    domObserverHandle?.stop();
    domObserverHandle = null;
  }

  window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
  window.__collabfmSiteRegistry.push({
    id: "ncs",
    label: "NoCopyrightSounds",
    matches,
    metadata: {
      getPlayerMetadata,
      enrichMetadata: async (meta) => meta,
      startDomObserver,
      stopDomObserver,
      clearState: stopDomObserver,
    },
  });
})();
