/**
 * Content script load order for dynamic injection (background service worker).
 * Keep in sync with manifest.json content_scripts[].js for the metadata bundle.
 */
export const CONTENT_SCRIPT_FILES = [
  "sites/shared/domUtils.js",
  "sites/shared/albumArt.js",
  "sites/shared/domObserver.js",
  "sites/shared/mediaSession.js",
  "sites/shared/mediaControlsCore.js",
  "sites/fma/metadata.js",
  "sites/jamendo/metadata.js",
  "sites/ncs/metadata.js",
  "sites/jamendo/mediaControls.js",
  "sites/youtube-music/mediaControls.js",
  "sites/soundcloud/mediaControls.js",
  "sites/ibroadcast/mediaControls.js",
  "sites/registry.js",
  "content.js",
];

/** Host match patterns for manifest content_scripts (document in sites/CONTRIBUTING.md). */
export const CONTENT_SCRIPT_MATCHES = [
  "https://music.youtube.com/*",
  "https://soundcloud.com/*",
  "https://ncs.io/*",
  "https://*.ncs.io/*",
  "https://freemusicarchive.org/*",
  "https://*.freemusicarchive.org/*",
  "https://www.jamendo.com/*",
  "https://jamendo.com/*",
  "https://media.ibroadcast.com/*",
];
