(function () {
  function cleanDomText(el) {
    return el?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function normalizeHostname(hostname) {
    return String(hostname || "").replace(/^www\./, "");
  }

  function hostMatchesSuffix(host, suffix) {
    const normalized = normalizeHostname(host);
    return normalized === suffix || normalized.endsWith(`.${suffix}`);
  }

  window.__collabfmDomUtils = {
    cleanDomText,
    normalizeHostname,
    hostMatchesSuffix,
  };
})();
