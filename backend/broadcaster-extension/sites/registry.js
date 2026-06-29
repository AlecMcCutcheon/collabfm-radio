(function () {
  const { normalizeHostname } = window.__collabfmDomUtils || {};
  const sites = window.__collabfmSiteRegistry || [];

  function currentHost() {
    try {
      return normalizeHostname
        ? normalizeHostname(window.location.hostname)
        : window.location.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function matchSite() {
    const host = currentHost();
    for (const site of sites) {
      if (site.matches?.(host)) return site;
    }
    return null;
  }

  function findMetadataSite() {
    const site = matchSite();
    return site?.metadata ? site : null;
  }

  function findMediaControlsSite() {
    const host = currentHost();
    for (const site of sites) {
      if (site.mediaControls?.supports && site.matches?.(host)) return site;
    }
    return null;
  }

  window.__collabfmSites = {
    list: () => sites.map((site) => ({ id: site.id, label: site.label })),

    matchSite,

    async getPlayerMetadata() {
      const site = findMetadataSite();
      if (site?.metadata?.getPlayerMetadata) {
        return site.metadata.getPlayerMetadata() || null;
      }
      return null;
    },

    async enrichMetadata(metadata) {
      if (!metadata?.title || !metadata?.artist) return metadata;
      const site = findMetadataSite();
      if (site?.metadata?.enrichMetadata) {
        const enriched = await site.metadata.enrichMetadata(metadata);
        return enriched || metadata;
      }
      return metadata;
    },

    startMetadataObservers(onCheck) {
      const site = findMetadataSite();
      site?.metadata?.startDomObserver?.(onCheck);
    },

    stopMetadataObservers() {
      for (const site of sites) {
        site.metadata?.stopDomObserver?.();
      }
    },

    clearSiteState() {
      for (const site of sites) {
        site.metadata?.clearState?.();
      }
    },

    supportsMediaControls() {
      return !!findMediaControlsSite();
    },

    simulateMediaKey(action) {
      const site = findMediaControlsSite();
      if (!site?.mediaControls?.simulateMediaKey) {
        console.log("[Radio Broadcaster] Media controls blocked - unsupported site");
        return;
      }
      site.mediaControls.simulateMediaKey(action);
    },
  };
})();
