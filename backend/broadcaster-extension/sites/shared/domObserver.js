(function () {
  function createDomObserver(onCheck) {
    let domObserver = null;
    let checkTimer = null;
    let readyListener = null;

    function stop() {
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }
      if (readyListener) {
        document.removeEventListener("DOMContentLoaded", readyListener);
        readyListener = null;
      }
      if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
      }
    }

    function scheduleCheck() {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(() => {
        checkTimer = null;
        void onCheck();
      }, 150);
    }

    function start() {
      stop();

      const attach = () => {
        if (!document.body) return;
        domObserver = new MutationObserver(() => {
          scheduleCheck();
        });
        domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      };

      if (document.body) {
        attach();
        return;
      }

      readyListener = () => {
        readyListener = null;
        attach();
      };
      document.addEventListener("DOMContentLoaded", readyListener);
    }

    return { start, stop };
  }

  window.__collabfmDomObserver = { createDomObserver };
})();
