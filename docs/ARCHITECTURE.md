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

## Discord

**In scope:** voice bot (`relay-bot.js`), guild whitelist, now-playing embeds, optional sync channel (if `config.channels.syncChannelId` is set).

**Not used for:** site login, chat sync (web-only chat), user avatars on the main app.

Voice bot credentials live in **Admin → Discord bot** (SQLite), not in `config.json`.
