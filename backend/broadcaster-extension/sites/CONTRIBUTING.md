# Site adapters — contributor guide

This guide splits per-site compatibility into small files so pull requests can add or update one source without editing a monolithic `content.js`.

## What belongs in a site folder

| Capability | Typical file | Registers |
|------------|--------------|-----------|
| DOM metadata scraping | `metadata.js` | `metadata.getPlayerMetadata`, optional `enrichMetadata`, DOM observer hooks |
| License / URL enrichment | `metadata.js` | `metadata.enrichMetadata` (async) |
| Stage media controls | `mediaControls.js` | `mediaControls.supports`, `mediaControls.simulateMediaKey` |

Use **`sites/shared/`** for logic shared across sites (observers, MediaSession fallback, keyboard dispatch).

## Registration pattern

At the end of your site file:

```javascript
window.__collabfmSiteRegistry = window.__collabfmSiteRegistry || [];
window.__collabfmSiteRegistry.push({
  id: "my-site",
  label: "My Site",
  matches(host) {
    return host === "example.com";
  },
  metadata: {
    getPlayerMetadata() { /* return { title, artist, albumArt? } or null */ },
    async enrichMetadata(baseMeta) { return baseMeta; },
    startDomObserver(onCheck) { /* optional */ },
    stopDomObserver() {},
    clearState() {},
  },
  // mediaControls: { supports: true, simulateMediaKey(action) {} },
});
```

Only implement the sections your site needs. Media-only sites can omit `metadata`; metadata-only sites can omit `mediaControls`.

## Files to update when adding a site

1. **New folder** under `sites/<id>/` (copy `sites/ncs/metadata.js` or `sites/fma/metadata.js` as a template).
2. **`sites/content-script-files.js`** — append your script path **before** `sites/registry.js`.
3. **`manifest.json`** — duplicate the same path in `content_scripts[].js` (must match load order).
4. **`manifest.json`** — add URL `matches` for your host (see `CONTENT_SCRIPT_MATCHES` in `content-script-files.js`).

`background.js` imports `CONTENT_SCRIPT_FILES` for dynamic injection — no extra edit if step 2 is done.

## Metadata vs MediaSession fallback

`content.js` asks the matched site adapter for metadata first, then falls back to `navigator.mediaSession` via `sites/shared/mediaSession.js`. If your site already exposes good MediaSession data, you may only need `enrichMetadata` (e.g. license URLs) rather than full DOM scraping.

## Testing checklist

- [ ] Load unpacked from `backend/broadcaster-extension/`
- [ ] Broadcast from the new tab; title/artist appear on now playing
- [ ] If license scraping: license link appears when applicable
- [ ] If media controls: Stage → music note → play/pause/skip
- [ ] Tab switch / reconnect without page reload

## Shipping

Bump `manifest.json` version, test locally, then download from Admin → System or zip this folder for distribution.

## Pull requests

- **One site per PR** when possible — keeps review focused and load order / manifest diffs easy to follow.
- **Describe behavior** — what metadata or controls you tested, and on which URL patterns.
- **Policy note** — new hostnames are **not** allowed by default content policy; mention in the PR if operators must add the hostname under Admin → System → Content policy.
- **No unrelated refactors** — shared helpers belong in `sites/shared/`; keep site folders limited to that source’s DOM or keyboard behavior.
