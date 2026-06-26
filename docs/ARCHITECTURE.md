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
