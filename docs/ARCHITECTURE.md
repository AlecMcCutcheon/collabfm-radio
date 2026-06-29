# CollabFM architecture

## Processes

| Process | Entry | Role |
|---------|-------|------|
| Radio server | `backend/bot.js` | HTTP API, WS ingest, PCM/MP3 hub, web chat, SQLite auth |
| Voice bot | `backend/relay-bot.js` | Discord `/join` / `/leave`, per-guild now-playing embeds, PCM consumer |

## Audio (summary)

```
Broadcaster WS → worker (20 ms PCM frames) → pcmStreamHub (live rail pointer)
                    ├─ live PCM → TCP :4100 → relay-bot → Discord voice
                    └─ per-rail MP3 encoders → GET /api/stream (web listeners)
```

Details, config, and debugging: [audio-pipeline.md](./audio-pipeline.md).

## Backend layout (`backend/src/`)

| Area | Role |
|------|------|
| `db/` | SQLite schema, migrations, settings |
| `auth/` | Local login, optional OIDC, sessions |
| `http/` | API routes (admin, listen, stream, chat, leveling, party effects) |
| `radio/` | PCM hub, MP3 publisher, broadcast session log |
| `discord/` | Voice bot embeds, station picker, heart button |
| `bridge.js` | Integration surface for `bot.js` |

## Broadcaster extension (`backend/broadcaster-extension/`)

The extension under `backend/broadcaster-extension/` captures tab audio and reports metadata to the radio server. Site-specific behavior lives in **`sites/` adapters** (metadata scraping, license enrichment, stage media controls) registered on `window.__collabfmSiteRegistry`; `content.js` is a thin orchestrator.

| Piece | Role |
|-------|------|
| `content.js` | Poll loop, relay WebSocket, delegates to `window.__collabfmSites` |
| `sites/registry.js` | Match hostname → adapter; metadata vs media-controls lookup |
| `sites/shared/` | DOM observers, MediaSession fallback, keyboard dispatch for controls |
| `sites/*/metadata.js` | Per-source title/artist and optional license URL scraping |
| `sites/*/mediaControls.js` | Per-source play/pause/skip for Stage |
| `sites/content-script-files.js` | Script load order for manifest and `background.js` inject |
| `background.js` | `tabCapture`, offscreen document, dynamic script injection |

Built-in adapters, metadata/policy interaction, and contributor workflow: [docs/wiki/Broadcaster-Extension.md](./wiki/Broadcaster-Extension.md). Operator steps: [Broadcasting & Stage](./wiki/Broadcasting-and-Stage.md).

## Auth & config

- **First boot** → `/setup` wizard creates local admin
- **Runtime settings** → Admin UI → SQLite `settings` (integrations, voice bot, branding, etc.)
- **Boot config** → `backend/config.json` only for ports, audio tuning, and paths (see `scripts/ensure-config.js` defaults)

## Stream access

| Audience | URL |
|----------|-----|
| Logged-in users | `GET /api/stream` (session cookie) |
| Guest web player | `/listen/{token}` |
| OBS / VLC | `/api/listen/{token}/stream` or `/api/stream?token=` |

Share links: admin-created tokens with TTL and revoke.

## Content policy

CollabFM **does not host or provide audio content**—it relays broadcaster-supplied streams. Configurable broadcast policy for the browser extension and metadata API paths. **Implements best-effort filtering based on metadata by default** on new installs. The engine is a **filtering tool**—it applies source, artist, and license allowlists to reported metadata; it is not a copyright detector and does not verify licensing.

Admins configure rules in **Admin → System → Content policy** (strict defaults: `freemusicarchive.org` and `jamendo.com`; CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA, CC BY-ND, CC BY-NC-ND, CC0 license patterns with flexible matching; **deny** on missing metadata, missing license, and unmatched source/artist/license). Default sources provide machine-readable license metadata that can assist with compliance checks. Inclusion does not guarantee legal compliance in all contexts. The extension can capture audio from other tab sources; they are excluded from defaults unless an admin configures additional sources at their own discretion and responsibility, because license metadata is not reported the same way as on FMA and Jamendo.

Evaluation order: known **source** is checked first when reported by the extension; otherwise the engine may defer until source or artist metadata is available. When a source or artist rule allows a track, **license metadata** is checked against the allowed-license patterns. Denied broadcasts attempt to mute relay audio and show a policy notice on now-playing. Track metadata may be withheld from the website, Discord, and the session log while a decision is pending or when policy denies the track. **DJ switches** on stage re-run policy for the promoted broadcaster.

CollabFM does not verify licensing. Defaults are conservative examples—not a guarantee that content is cleared for every use case. See [docs/wiki/Content-Policy.md](./docs/wiki/Content-Policy.md).

## API access

CollabFM is **not** a fully public API. Most `/api/*` routes require a **logged-in session** (cookie), a valid **UI share link token** (`?shareToken=` or `?token=`), or—in a few cases—a **device bearer token** (browser extension). Anonymous requests to station data return **401 Unauthorized**.

Implementation reference: `backend/src/security/access.js` and the API gate in `backend/bot.js`.

### Public (no auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/branding` | Station name, feature flags, visualizer path (login page) |
| `GET /api/branding/visualizer` | Custom visualizer image (if configured) |
| `GET /api/setup/status` | Setup wizard state |
| `GET /auth/methods` | Available login methods |
| `GET /auth/status` | Current session (returns unauthenticated when logged out) |
| `GET /api/extension/public/download` | Public extension ZIP |
| Static assets | `/`, `/assets/*`, fonts, `robots.txt`, etc. |

Before setup completes, only setup, listen, extension, avatars, broadcaster, and static paths are allowed; other routes return `503 setup_required`.

### Session cookie or share token

**Logged-in users** use the session cookie (browser sends it automatically on same-origin requests).

**Guest listen links** pass a valid UI share token as a query param: `?shareToken=…` or `?token=…`. Guest POST bodies can instead include `shareToken`, `guestId`, and `guestSession` (see guest broadcast / chat handlers).

**GET examples (share token):**

- `/api/broadcast-status`, `/api/metadata`, `/api/lastfm`, `/api/status-json.xsl`
- `/api/search`, `/api/party-effects`
- `/api/messages`, `/api/chat/unread`, `/api/requests`, `/api/host-members`
- `/api/presence/roster`, `/api/chat/typing`, `/api/users/public-profile`
- `/api/avatars/{userId}`, `/art/track`, `/api/art/track`

**POST examples (session, share token in body, or device bearer — see below):**

- Chat, media control, metadata (extension), party effects, presence heartbeat, chat typing

Invalid or expired share tokens are rejected (**401**), not treated as public.

### Share-link routes (token in path)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/listen/{token}` | Link info; mints `guestSession` when `guestId` is provided |
| `GET /api/stream?token=` | MP3 stream |
| `GET /api/listen/{token}/stream` | Same stream, token in path |

### Device bearer (browser extension)

With `Authorization: Bearer <device-token>` (no session cookie):

- `GET/POST /api/metadata`
- `GET/POST /api/capabilities`
- `GET/POST /api/ws-token`

### Internal loopback only

The radio server process may call these from **private network / localhost** (e.g. voice bot fetching metadata). They are **not** open to the public internet:

- `GET /api/metadata`, `/api/broadcast-status`, `/api/status-json.xsl`, `/art/track`

### Session required (no share-token shortcut)

Examples: admin routes, user management, share-link management, `GET /api/extension/download` (broadcaster ZIP), `GET /api/discord/whitelist/{guildId}`, most write operations not listed above.

### Quick self-test

From a machine **without** a session cookie:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://your-station.example/api/branding          # expect 200
curl -sS -o /dev/null -w "%{http_code}\n" https://your-station.example/api/metadata         # expect 401
curl -sS -o /dev/null -w "%{http_code}\n" "https://your-station.example/api/broadcast-status?shareToken=INVALID"  # expect 401
```

With a valid guest share token:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "https://your-station.example/api/metadata?shareToken=YOUR_UI_TOKEN"
```

## Discord

**In scope:** voice bot (`relay-bot.js`), guild whitelist, now-playing embeds, optional sync channel (if `config.channels.syncChannelId` is set).

**Not used for:** site login, chat sync (web-only chat), user avatars on the main app.

Voice bot credentials live in **Admin → Discord bot** (SQLite), not in `config.json`.
