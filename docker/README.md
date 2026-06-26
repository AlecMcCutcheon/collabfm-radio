# CollabFM (container image)

**GHCR:** `ghcr.io/alecmccutcheon/collabfm-radio:latest`

CollabFM is a self-hosted collaborative internet radio: multiple people can broadcast from the browser or the Chrome extension, listeners tune in on the web or via direct stream URLs, and an optional Discord voice bot can relay the same audio into voice channels.

This document is the public deploy guide for the Docker image. For development and architecture detail, see the [repository README](../README.md) and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

---

## What you get

| Area | Summary |
|------|---------|
| **Main station** | Live MP3 stream, now-playing metadata, album art, chat, party effects, request queue |
| **Stage** | See who is on air, promote DJs, tune Discord bots per host, hearts / leveling |
| **Broadcasters** | Chrome extension (tab audio), in-browser Web UI broadcaster, guest broadcaster links |
| **Listeners** | Log in on the main site, or use **share links** for guest access without an account |
| **Discord** | Optional voice bot (`relay-bot.js`) joins channels and plays the station; slash commands for join/leave |
| **Auth** | Local accounts, optional OIDC (Authentik, etc.), device pairing for the extension |
| **Admin** | Users, Discord bot, share links, SSO, audio tuning, branding, integrations |

---

## Quick start (Docker)

### 1. Pull and run

Mount a persistent folder to `/usr/src/app`. On **first start**, the entrypoint copies the app into that folder (config, code seed, empty `storage/`).

```yaml
services:
  collabfm:
    image: ghcr.io/alecmccutcheon/collabfm-radio:latest
    container_name: CollabFM
    working_dir: /usr/src/app
    command: ["node", "bot.js"]
    environment:
      COLLABFM_RUNTIME: docker
      WEB_PORT: "4002"
      WS_PORT: "4001"
      PCM_RELAY_PORT: "4100"
    ports:
      - "4002:4002"
      - "4001:4001"
    volumes:
      - /path/to/appdata/collabfm-radio:/usr/src/app
    restart: unless-stopped
```

Copy `docker/.env.example` to `docker/.env` if you use the included compose files.

### 2. First-time setup (bootstrap)

1. Start the container and open the logs.
2. Find the banner:
   ```
   CollabFM — FIRST-TIME SETUP
   Username: admin
   Password: <one-time token>
   ```
3. Open **`/setup`** on your server (e.g. `http://your-host:4002/setup`).
4. Unlock with username **`admin`** and the token from the logs.
5. Create your **real** admin username and password (do not use `admin` — that name is only for unlock).

The bootstrap token changes on every restart until setup completes.

### 3. Log in

Go to the site root (`/`), sign in with the account you created. Open **Admin** from the UI (admin role required).

### Locked out?

Inside the container or appdata directory:

```bash
node scripts/bootstrap-recovery.js
```

Log in with **`admin`** + the printed recovery token (single use), reset your password in Admin, then log out.

---

## Ports

| Port | Env var | Purpose |
|------|---------|---------|
| **4002** | `WEB_PORT` | Web UI, REST API, MP3 streams, static assets |
| **4001** | `WS_PORT` | Browser relay WebSocket (extension + web broadcaster) |
| **4100** | `PCM_RELAY_PORT` | Internal PCM feed to `relay-bot.js` (voice bot only; do not expose publicly) |

Host and container use the **same** port numbers in the default compose layout.

### Without a reverse proxy (LAN / homelab)

Publish **4002** and **4001**. Use:

- Site: `http://<ip>:4002`
- Relay (automatic in app/extension): `ws://<ip>:4001/relay`

In the extension, set the radio host to `http://<ip>:4002` or `<ip>:4002`.

### With a reverse proxy (recommended for the internet)

Terminate TLS on the proxy. Route:

- **Everything except relay** → `http://<container>:4002`
- **`/relay` (WebSocket upgrade)** → `http://<container>:4001`

Clients on HTTPS use `wss://your-domain/relay` on the **same public host** as the website. The path `/relay` is what matters on the proxy; internally it forwards to port **4001**, not 4002.

After setup, set **Admin → System → Branding** / public base URL and ensure **allowed origins** include your public URL (setup usually seeds the origin you used during bootstrap).

---

## Reverse proxy examples

Replace `collabfm` with your container name or `127.0.0.1` if the proxy runs on the same host.

### nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name radio.example.com;

    # ssl_certificate ...;

    # Web UI, API, MP3
    location / {
        proxy_pass http://collabfm:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    # Browser relay (extension + web broadcaster)
    location /relay {
        proxy_pass http://collabfm:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Caddy

```caddy
radio.example.com {
    reverse_proxy /relay collabfm:4001 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
    reverse_proxy collabfm:4002 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Caddy handles WebSocket upgrades on `/relay` automatically when the upstream speaks WebSocket.

---

## User flows

### Station listener (logged in)

1. Open `/` and sign in (local password or OIDC if enabled).
2. Use the main player: volume, chat, stage view, song search (if enabled), request queue.
3. Stream URL for this session: `/api/stream` (cookie auth).

### Guest listener (share link)

1. Admin or broadcaster creates a **share link** (see below).
2. Guest opens **`/listen/{token}`** — no account required.
3. Guest gets the player, chat (when the link allows), stage, and party effects scoped to that link.
4. For OBS/VLC/direct players, use a **stream** link or `/api/listen/{token}/stream`.

### Broadcaster (registered user)

1. Sign in on the main site.
2. Open **Broadcaster Studio** (`/broadcaster`).
3. Choose how to go on air:
   - **Web UI broadcaster** — capture from the browser (same machine).
   - **Chrome extension** — pair the extension to your account, pick a tab, broadcast tab audio.
4. Set on-air nickname, device label, and optional profile fields shown on stage.
5. Appear on the **stage** dock on the main UI; other DJs can promote you or interact via chat.

**Extension pairing (typical):**

1. Install the extension (download zip from **Admin → System → Extension**, or use a packed build).
2. In the extension popup, set **Radio host** to your site (`https://radio.example.com` or `http://ip:4002`).
3. On the website, Broadcaster Studio → pair device → approve in the extension.
4. Select a tab and start broadcasting.

### Guest broadcaster

1. A user with share-link permission creates a **guest broadcaster** link (UI share link with broadcaster mode).
2. Guest opens `/listen/{token}` and is guided to **Guest Studio** (`/listen/{token}/studio`).
3. Guest can use the web broadcaster and/or paste the link into the extension (guest auth mode).
4. Guest appears on stage under their guest name; XP/leveling rules follow admin **System** settings.

### Discord voice bot (optional)

The main container runs `bot.js` only. Discord voice needs a **second process**:

```bash
node relay-bot.js
```

Same appdata mount, env `VOICE_BOT_MANAGED=1`, `PCM_RELAY_HOST` / `BROADCAST_API_HOST` pointing at the main service (see compose examples in the repo). Configure **Admin → Discord** (bot token, application ID, server whitelist). In Discord, use `/join` / `/leave` in a whitelisted server.

---

## Admin settings (`/admin`)

Available after login as an **admin** user.

| Tab | What it controls |
|-----|------------------|
| **Users** | Accounts, roles, passwords, per-user broadcast permission, leveling blocks |
| **Discord** | Voice bot token & application ID, runtime status, **server whitelist** (which guild IDs may `/join`) |
| **Share links** | Site-wide list of links; broadcasters also create their own in Broadcaster Studio |
| **OIDC** | Enable SSO, provider URLs, client secret, group → role mapping, link-to-existing-user |
| **Radio** | Max stage users (default 7, hard max 10), debug log retention, PCM/discord buffer tuning (live where noted) |
| **System** | Guest XP rules, extension auth strictness, Last.fm/Giphy keys, Turnstile, **branding** (station name, logo), extension download |

**Branding / public URL:** set station name and logo under **System**. Set public base URL and allowed origins so links, album art, and CORS work behind your domain.

**Share links (create in Broadcaster Studio or view all in Admin → Share links):**

| Link type | Guest experience |
|-----------|------------------|
| **Guest view** | Full web UI at `/listen/{token}` |
| **Stream** | Direct MP3 for external players |
| **Guest broadcaster** | Guest view + permission to go on air via web or extension |

TTL options range from 24 hours through permanent; links can be revoked.

---

## GHCR pull notes

- Package: `ghcr.io/alecmccutcheon/collabfm-radio`
- Tags: `latest`, branch name, `v*` release tags, commit SHA (see GitHub Actions workflow).
- **Private packages:** configure `docker login ghcr.io` in Portainer or on the host.
- After pulling a new image, **recreate** the container. Appdata on the volume is preserved.
- Re-download the **browser extension** from Admin after upgrades if broadcasting behavior changes.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Redirect to `/auth/login` before setup | Use image **≥** setup-bootstrap fix; go to `/setup`; read bootstrap token from logs |
| Extension cannot connect | Relay on **4001** published or proxied at `/relay`; host field uses `http://ip:4002` on LAN |
| `Origin not allowed` | Admin allowed origins / public base URL include your browser origin |
| No Discord audio | Voice bot process running; Admin → Discord configured; server on whitelist |
| Stream works, WS fails | Proxy `location /relay` → port **4001** with Upgrade headers |

---

## Links

- [Repository](https://github.com/AlecMcCutcheon/collabfm-radio)
- [Audio pipeline notes](../docs/audio-pipeline.md)
- [Local compose](./docker-compose.yml) · [Unraid example](./compose.unraid.yaml)
