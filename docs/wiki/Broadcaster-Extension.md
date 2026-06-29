# Broadcaster Extension

How the CollabFM **Chrome extension** is organized, what each built-in site adapter does, and how to contribute new source or media-control support.

Extension source lives in the repo at `backend/broadcaster-extension/`. Admins and broadcasters install it from **Admin → System → Extension download** (bundled in the container image).

---

## Layout

```
backend/broadcaster-extension/
  content.js                    # Orchestrator: monitoring loop, backend messaging
  background.js                 # Tab capture, dynamic content-script injection
  sites/
    shared/                     # DOM helpers, MediaSession fallback, keyboard dispatch
    fma/metadata.js             # Free Music Archive — title/artist + license scraping
    jamendo/metadata.js         # Jamendo — player DOM + API license enrichment
    jamendo/mediaControls.js    # Jamendo — play/pause/skip
    ncs/metadata.js             # NoCopyrightSounds — DOM metadata
    youtube-music/mediaControls.js
    soundcloud/mediaControls.js
    ibroadcast/mediaControls.js    # iBroadcast — play/pause/skip via window.ibui
    registry.js                 # Picks the active site adapter for the tab
    content-script-files.js     # Load order (manifest + background inject)
    CONTRIBUTING.md             # Step-by-step for new adapters
  manifest.json
  popup.js, offscreen.js, …     # Pairing, broadcast UI, audio relay
```

Each site file registers on `window.__collabfmSiteRegistry`. `sites/registry.js` exposes `window.__collabfmSites` so `content.js` can delegate metadata scraping, license enrichment, and stage media controls without site-specific branches in one giant file.

**Load order matters.** Shared scripts run first, then site adapters, then `registry.js`, then `content.js`. The same list appears in `manifest.json` `content_scripts[].js` and in `sites/content-script-files.js` (imported by `background.js` for injection).

---

## Built-in site adapters

| Site folder | Host patterns (manifest) | Metadata | License enrichment | Stage media controls |
|-------------|--------------------------|----------|--------------------|----------------------|
| `fma/` | `freemusicarchive.org` | DOM scrape | Track page URL + CC license link | — |
| `jamendo/` | `jamendo.com` | DOM + API | Track page URL + CC license link | Play / pause / skip |
| `ncs/` | `ncs.io` | DOM scrape | — | — |
| `youtube-music/` | `music.youtube.com` | MediaSession fallback | — | Play / pause / skip |
| `soundcloud/` | `soundcloud.com` | MediaSession fallback | — | Play / pause / skip |
| `ibroadcast/` | `media.ibroadcast.com` | MediaSession fallback | — | Play / pause / skip (`window.ibui`) |

On any other tab, the extension can still **capture audio** if the broadcaster selects that tab. Title and artist may come from **`navigator.mediaSession`** when the page exposes it. **License metadata** is enriched where an adapter implements `enrichMetadata` (Free Music Archive and Jamendo). **Media controls** on Stage appear only when the active tab matches an adapter with `mediaControls.supports`.

See [Content Policy](./Content-Policy.md) for why FMA and Jamendo are default allowed sources and why other hostnames require manual admin allowlisting.

---

## Metadata flow

1. `content.js` asks the matched site adapter for `getPlayerMetadata()` (title, artist, album art).
2. If none, it falls back to `sites/shared/mediaSession.js`.
3. Optional `enrichMetadata()` runs asynchronously (e.g. FMA or Jamendo track URL and license after the player updates).
4. Metadata is sent to the CollabFM server over the relay WebSocket and REST `/api/metadata`.
5. The **content policy** evaluates reported source, artist, and license fields before showing track info on now-playing, Discord, and the session log.

---

## Media controls flow

When a DJ broadcasts from a tab with a **media-controls adapter**:

1. The extension reports capability to the server (`/api/capabilities`).
2. On **Stage**, connections on supported tabs show a green **music note** icon.
3. The active DJ, an admin, or the guest broadcaster (own connection only) can send play / pause / previous / next.
4. The server forwards commands to the extension, which dispatches keyboard events via `sites/shared/mediaControlsCore.js`.

Details for operators: [Broadcasting & Stage — Media controls](./Broadcasting-and-Stage.md#media-controls-supported-sites).

---

## Jamendo API and rate limits

The Jamendo adapter enriches track URLs and Creative Commons license metadata via `api.jamendo.com`. The extension ZIP from **Admin → System** uses a **shared CollabFM `client_id`** (see `sites/jamendo/metadata.js`). Jamendo rate-limits by `client_id`; heavy use across many broadcasters could occasionally delay or skip API enrichment until limits reset. DOM metadata and track-page fallback still work.

Operators who want to avoid shared limits can [load the extension unpacked](../../backend/broadcaster-extension/README.md#jamendo-api-client_id), register their own Jamendo developer application, and replace `JAMENDO_CLIENT_ID` locally. Jamendo also allows contacting them to raise limits for a registered app — see [Jamendo for developers](https://developer.jamendo.com/).

---

## Local development

1. Clone the repo and open `backend/broadcaster-extension/` in Chrome (**Load unpacked**).
2. Set **Radio host** in the popup to your dev station (`http://localhost:4002` or your homelab URL).
3. After code changes, click **Reload** on the extension card in `chrome://extensions`.
4. Bump `manifest.json` **version** before shipping so broadcasters know to re-download from Admin → System.

See [backend/broadcaster-extension/README.md](../../backend/broadcaster-extension/README.md) for a short layout summary. Step-by-step for new site adapters: [sites/CONTRIBUTING.md](../../backend/broadcaster-extension/sites/CONTRIBUTING.md).

---

## Related guides

- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — pairing, go live, promote DJ, using media controls
- [Content Policy](./Content-Policy.md) — allowlists, license rules, FMA and Jamendo defaults
- [Admin Panel — System](./Admin-Panel.md) — extension download, pairing requirement, policy settings
