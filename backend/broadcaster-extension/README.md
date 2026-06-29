# CollabFM Broadcaster Extension

Chrome extension source served from **Admin → System → Extension download** and bundled in the CollabFM backend.

## Layout

```
sites/
  shared/           # Reusable helpers (DOM observers, MediaSession, album art, keyboard core)
  fma/              # Free Music Archive metadata + license scraping
  ncs/              # NoCopyrightSounds DOM metadata
  youtube-music/    # Media controls adapter
  soundcloud/       # Media controls adapter
  registry.js       # Resolves the active site and delegates metadata / controls
  content-script-files.js   # Single load-order list (manifest + background inject)
content.js          # Thin orchestrator (monitoring loop, messaging)
```

Each site adapter registers on `window.__collabfmSiteRegistry`. `sites/registry.js` exposes `window.__collabfmSites` for `content.js`.

## Adding a site

See [sites/CONTRIBUTING.md](./sites/CONTRIBUTING.md).

## Local development

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → select this `backend/broadcaster-extension/` directory

After changes, re-download or reload the extension and bump `manifest.json` version when shipping.
