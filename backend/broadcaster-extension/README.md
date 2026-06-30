# CollabFM Broadcaster Extension

Chrome extension bundled in the CollabFM backend and published on the **[Chrome Web Store](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba)**.

**Docs:** [Broadcaster Extension (wiki)](../../docs/wiki/Broadcaster-Extension.md) · [Install & version sync](../../docs/wiki/Broadcaster-Extension.md#install--version-sync) · [Contributing site adapters](./sites/CONTRIBUTING.md)

## Install (broadcasters)

| Source | How |
|--------|-----|
| **Chrome Web Store** | [CollabFM Broadcaster](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba) — Chrome auto-updates |
| **Server ZIP** | CollabFM **Go live** modal → **Download ZIP** → load unpacked in `chrome://extensions` |

The Go live modal shows the ZIP version (from this folder’s `manifest.json` in your image) and the Web Store version. Store publishes from `main` are **manual** today; see the wiki for sync caveats.

## Layout

```
sites/
  shared/           # Reusable helpers (DOM observers, MediaSession, album art, keyboard core)
  jamendo/              # Jamendo metadata, license API enrichment, media controls
  fma/              # Free Music Archive metadata + license scraping
  ncs/              # NoCopyrightSounds DOM metadata
  youtube-music/    # Media controls adapter
  soundcloud/       # Media controls adapter
  ibroadcast/       # iBroadcast media controls (MediaSession metadata)
  registry.js       # Resolves the active site and delegates metadata / controls
  content-script-files.js   # Single load-order list (manifest + background inject)
content.js          # Thin orchestrator (monitoring loop, messaging)
```

Each site adapter registers on `window.__collabfmSiteRegistry`. `sites/registry.js` exposes `window.__collabfmSites` for `content.js`.

## Adding a site

See [sites/CONTRIBUTING.md](./sites/CONTRIBUTING.md). Site-adapter-only changes are usually backward compatible with older extension builds (you miss the new site until you update).

## Local development

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → select this `backend/broadcaster-extension/` directory

After changes, reload the extension and bump `manifest.json` **version** when shipping.

## Jamendo API (`client_id`)

License enrichment on [Jamendo](https://www.jamendo.com/) calls the public [Jamendo API](https://developer.jamendo.com/) (`api.jamendo.com`) using a **shared CollabFM `client_id`** baked into `sites/jamendo/metadata.js` (`JAMENDO_CLIENT_ID`). That keeps the extension download-and-go for most stations.

**Rate limits.** Jamendo applies per–`client_id` limits. A busy station—or many stations on the same shipped ID—could eventually hit them. When that happens, license links may stop enriching until the limit resets; title/artist from the player DOM still work, and the adapter can fall back to scraping the track page HTML.

**What you can do**

- **Contact Jamendo** — their developer docs describe requesting higher limits for a registered application ([Jamendo for developers](https://developer.jamendo.com/)).
- **Use your own `client_id`** — register an app with Jamendo, then **Load unpacked** from this folder, set `JAMENDO_CLIENT_ID` in `sites/jamendo/metadata.js`, and reload the extension. That avoids sharing CollabFM’s quota entirely. Re-downloading the ZIP from Go live restores the default ID.

Do not commit a personal `client_id` to the upstream repo unless the project explicitly switches to a configurable ID later.
