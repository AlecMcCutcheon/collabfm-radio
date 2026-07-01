# Broadcaster Extension

How the CollabFM **Chrome extension** is organized, what each built-in site adapter does, and how to contribute new source or media-control support.

Extension source lives in the repo at `backend/broadcaster-extension/`. It is bundled in each container image as a ZIP and published on the **[Chrome Web Store](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba)** as **CollabFM Broadcaster**.

---

## Install & version sync

### Where to install

| Method | How | Updates |
|--------|-----|---------|
| **Chrome Web Store** | [CollabFM Broadcaster](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba) | Chrome auto-updates when Google publishes a new version |
| **ZIP from your server** | **Go live** modal (mic icon) → **Download ZIP**, then load unpacked in `chrome://extensions` | Re-download when you upgrade the container (or when the bundled version changes) |

The **Go live** modal shows **both versions** — the ZIP build from your running image (`manifest.json`) and the current **Chrome Web Store** version — so you can see if they match.

### Store vs server (important)

- **Stage via CI on `main`.** When `backend/broadcaster-extension/` changes, [`.github/workflows/stage-chrome-extension.yml`](https://github.com/AlecMcCutcheon/collabfm-radio/blob/main/.github/workflows/stage-chrome-extension.yml) uploads a ZIP to the Developer Dashboard (**upload only** — not submitted for review). Skips if a version is already **PENDING_REVIEW**. You **submit for review manually** when finished iterating. The Web Store public version still **lags** until Google approves.
- **Review delay.** Even after upload (or once automation exists), expect roughly **20–40 minutes** plus **Chrome Web Store review** before the new version is live for everyone.
- **Paired releases.** Some changes touch **both** the server and extension (pairing, relay protocol, content-policy handoffs). Those should stay on matching versions when possible. As CollabFM matures, breaking paired changes should become less common — but that is not guaranteed.
- **Site adapters only.** New metadata, license, or media-control support for a site usually does **not** require a container upgrade. An older extension still works with a newer server; you only miss the new site until you update the extension.
- **Extension ahead of server.** If Chrome auto-updates your extension but your instance is still on an older image, you can hit issues when both sides changed significantly. Prefer pulling the server image and checking Go live version labels before relying on a fresh store build.

**Choose your workflow**

- **Web Store** — easiest install and auto-updates; accept possible lag vs your self-hosted image.
- **Server ZIP** — stays aligned with the extension bundled in your container; reinstall after upgrades.

Watch the repo’s `backend/broadcaster-extension/manifest.json`, the versions in **Go live**, and your installed build at `chrome://extensions`.

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
| `ibroadcast/` | `media.ibroadcast.com` | MediaSession fallback | — | Play / pause / skip via `window.ibui` in the **page** context (not visible to content scripts) |

On any other tab, the extension can still **capture audio** if the broadcaster selects that tab. Title and artist may come from **`navigator.mediaSession`** when the page exposes it. **License metadata** is enriched where an adapter implements `enrichMetadata` (Free Music Archive and Jamendo). **Media controls** on Stage appear only when the active tab matches an adapter with `mediaControls.supports`.

See [Content Policy](./Content-Policy.md) for why FMA and Jamendo are default allowed sources (machine-readable license metadata to assist compliance checks—not a guarantee of legal clearance) and why other sources require admin configuration at the operator’s discretion and responsibility.

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

The Jamendo adapter enriches track URLs and Creative Commons license metadata via `api.jamendo.com`. The extension ZIP from your server (and the Web Store build) uses a **shared CollabFM `client_id`** (see `sites/jamendo/metadata.js`). Jamendo rate-limits by `client_id`; heavy use across many broadcasters could occasionally delay or skip API enrichment until limits reset. DOM metadata and track-page fallback still work.

Operators who want to avoid shared limits can [load the extension unpacked](../../backend/broadcaster-extension/README.md#jamendo-api-client_id), register their own Jamendo developer application, and replace `JAMENDO_CLIENT_ID` locally. Jamendo also allows contacting them to raise limits for a registered app — see [Jamendo for developers](https://developer.jamendo.com/).

---

## Local development

1. Clone the repo and open `backend/broadcaster-extension/` in Chrome (**Load unpacked**).
2. Set **Radio host** in the popup to your dev station (`http://localhost:4002` or your homelab URL).
3. After code changes, click **Reload** on the extension card in `chrome://extensions`.
4. Bump `manifest.json` **version** before shipping so broadcasters can compare builds in **Go live** and on the [Chrome Web Store](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba). CI stages uploads on `main`; submit for review in the Developer Dashboard when ready — see [Install & version sync](#install--version-sync).

See [backend/broadcaster-extension/README.md](../../backend/broadcaster-extension/README.md) for a short layout summary. Step-by-step for new site adapters: [sites/CONTRIBUTING.md](../../backend/broadcaster-extension/sites/CONTRIBUTING.md).

---

## Related guides

- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — pairing, go live, promote DJ, using media controls
- [Content Policy](./Content-Policy.md) — allowlists, license rules, FMA and Jamendo defaults
- [Admin Panel — System](./Admin-Panel.md) — extension download, pairing requirement, policy settings
