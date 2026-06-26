# CollabFM

**GHCR:** `ghcr.io/alecmccutcheon/collabfm-radio:latest`

Licensed under [CC BY-NC 4.0](LICENSE) — © Alec McCutcheon

CollabFM is a self-hosted collaborative internet radio: multiple people can broadcast from the browser or the Chrome extension, listeners tune in on the web or via direct stream URLs, and an optional Discord voice bot can relay the same audio into voice channels.

- **Architecture:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Audio pipeline:** [docs/audio-pipeline.md](./docs/audio-pipeline.md)

---

## About this project

CollabFM is something I have worked on off and on for quite a long time. Only recently has it become a standalone project worth sharing publicly. I plan to keep updating it—I use it myself—and I am open to [issues](https://github.com/AlecMcCutcheon/collabfm-radio/issues) (bugs, questions) and [pull requests](https://github.com/AlecMcCutcheon/collabfm-radio/pulls) (fixes, improvements, feature work).

I cannot promise fixes or features on a fixed schedule, but if you open an issue or submit a PR I will read it, reply when I can, and do my best to help. Feature requests are welcome too; hearing how people use CollabFM helps shape what gets built next.

---

## Legal & responsible use

**Content you broadcast.** You are solely responsible for the audio and other material streamed through your CollabFM instance. Only broadcast content you have the right to share—your own recordings, royalty-free or properly licensed material, or content clearly permitted for redistribution. Do not use CollabFM to redistribute copyrighted music or other protected works without authorization from the rights holder.

**Private and invited audiences.** CollabFM is intended as a self-hosted station for private or invited listeners—friends, community servers, homelab users—not as a public commercial broadcast service. You control who can listen through authentication, share links, and how you expose the service on your network.

**Software disclaimer.** CollabFM is provided as-is, without warranty. The author is not liable for operator misuse, copyright claims, or other consequences arising from how you deploy or use the software.

**License.** This project is licensed under [Creative Commons Attribution-NonCommercial 4.0 International](LICENSE). You may use and modify it for non-commercial purposes; commercial use is not permitted. If you share the software or derivatives, you must give appropriate credit to Alec McCutcheon and indicate if changes were made.

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

Mount a persistent folder to `/usr/src/app`. On **first start**, the entrypoint copies the app into that folder (`config.json` is created if missing; `storage/` and `logs/` are created at runtime). After that, app files on the volume are **not** changed unless you opt in — see [Upgrading](#upgrading) below.

```yaml
services:
  collabfm:
    image: ghcr.io/alecmccutcheon/collabfm-radio:latest
    container_name: CollabFM
    working_dir: /usr/src/app
    command: ["node", "bot.js"]
    environment:
      COLLABFM_RUNTIME: docker
      COLLABFM_SYNC_MODE: preserve
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

Compose helpers live in [`docker/`](./docker/) — copy `docker/.env.example` to `docker/.env` and use `docker-compose.yml` or `compose.unraid.yaml`.

### 2. First-time setup

1. Start the container and open the logs.
2. Find the banner:
   ```
   CollabFM — FIRST-TIME SETUP
   Username: admin
   Password: <one-time token>
   ```
3. Open **`/setup`** (e.g. `http://your-host:4002/setup`).
4. Unlock with username **`admin`** and the token from the logs.
5. Create your **real** admin username and password (do not use `admin` — that name is only for unlock).

The bootstrap token changes on every restart until setup completes.

### 3. Log in

Go to `/`, sign in with the account you created. Open **Admin** from the UI (admin role required).

---

## Upgrading

CollabFM keeps **runtime data** on your appdata volume: `config.json`, `storage/` (SQLite database, uploads), and `logs/`. Those are never overwritten by the entrypoint.

**App code** (`bot.js`, `src/`, `dist/`, extension bundle, etc.) is copied from the image **only on first run** by default. Pulling a newer GHCR image and recreating the container does **not** update those files unless you ask it to.

### `COLLABFM_SYNC_MODE`

| Value | Behavior |
|-------|----------|
| **`preserve`** (default) | Seed app files only when `package.json` is missing on the volume. Safe if you edit files under appdata. |
| **`update`** | On each container start, sync app files from the image into appdata. **Preserves** `config.json`, `storage/`, `logs/`, and `node_modules/` (dependencies are reinstalled if `package.json` changed). |

**Typical upgrade** (no local code edits):

1. Pull the new image (`docker pull ghcr.io/alecmccutcheon/collabfm-radio:latest` or recreate in Portainer/Unraid).
2. Set `COLLABFM_SYNC_MODE=update` in compose or your container env (see [`docker/.env.example`](./docker/.env.example)).
3. Recreate the container once.
4. Optional: set `COLLABFM_SYNC_MODE` back to `preserve` if you customize app files under appdata.

Compose example:

```yaml
environment:
  COLLABFM_SYNC_MODE: update
```

If you **do** customize files in appdata, leave `preserve` and merge upstream changes manually, or back up your edits before using `update` (sync uses `--delete` for app paths not in the exclude list).

Re-download the Chrome extension from **Admin → System** after upgrades if broadcasting behavior changes.

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

    location / {
        proxy_pass http://collabfm:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

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

---

## User flows

### Station listener (logged in)

1. Open `/` and sign in (local password or OIDC if enabled).
2. Use the main player: volume, chat, stage view, song search (if enabled), request queue.
3. Stream URL for this session: `/api/stream` (cookie auth).

### Guest listener (share link)

1. Admin or broadcaster creates a **share link** (see Admin below).
2. Guest opens **`/listen/{token}`** — no account required.
3. Guest gets the player, chat, stage, and party effects scoped to that link.
4. For OBS/VLC/direct players, use a **stream** link or `/api/listen/{token}/stream`.

### Broadcaster (registered user)

1. Sign in on the main site.
2. Open **Broadcaster Studio** (`/broadcaster`).
3. Go on air via **Web UI broadcaster** (browser capture) or the **Chrome extension** (tab audio).
4. Set on-air nickname, device label, and profile fields shown on stage.

**Extension pairing:**

1. Download the extension zip from **Admin → System**.
2. In the extension popup, set **Radio host** to your site (`https://radio.example.com` or `http://ip:4002`).
3. In Broadcaster Studio on the site, pair the device and approve in the extension.
4. Select a tab and start broadcasting.

### Guest broadcaster

1. Create a **guest broadcaster** share link (UI link with broadcaster mode).
2. Guest opens `/listen/{token}` → **Guest Studio** (`/listen/{token}/studio`).
3. Guest broadcasts via the web UI and/or extension (guest auth mode).

### Discord voice bot (optional)

The main container runs `bot.js` only. Discord voice needs a **second process** (`node relay-bot.js`) with the same appdata mount. Configure **Admin → Discord** (bot token, application ID, server whitelist). Use `/join` / `/leave` in a whitelisted server.

---

## Admin (`/admin`)

| Tab | What it controls |
|-----|------------------|
| **Users** | Accounts, roles, passwords, broadcast permission, leveling blocks |
| **Discord** | Voice bot credentials, runtime status, **server whitelist** |
| **Share links** | Site-wide link list (broadcasters also create links in Broadcaster Studio) |
| **OIDC** | SSO provider, group → role mapping |
| **Radio** | Max stage users (default 7, max 10), log retention, PCM/discord buffer tuning |
| **System** | Guest XP rules, extension auth, Last.fm/Giphy, Turnstile, **branding**, extension download |

**Share link types:**

| Link type | Guest experience |
|-----------|------------------|
| **Guest view** | Full web UI at `/listen/{token}` |
| **Stream** | Direct MP3 for OBS/VLC |
| **Guest broadcaster** | Guest view + on-air via web or extension |

---

## GHCR

- Package: `ghcr.io/alecmccutcheon/collabfm-radio`
- Tags: `latest`, branch name, `v*` tags, commit SHA (see `.github/workflows/publish-ghcr.yml`)
- **Private packages:** `docker login ghcr.io` in Portainer or on the host
- After pulling a new image, **recreate** the container. Set `COLLABFM_SYNC_MODE=update` for one start to refresh app files in appdata (see [Upgrading](#upgrading)); your database and `config.json` are preserved
- Re-download the extension from Admin after upgrades if broadcasting behavior changes

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Cannot reach `/setup` | Use a current image; read bootstrap token from container logs |
| Still on old version after image pull | App code lives in appdata; set `COLLABFM_SYNC_MODE=update`, recreate the container once (see [Upgrading](#upgrading)) |
| Extension cannot connect | Relay on **4001** published or proxied at `/relay`; set **Radio host** in the extension to your public URL or `http://ip:4002` |
| `Origin not allowed` | Admin allowed origins / public base URL match your browser origin |
| No Discord audio | Voice bot process running; Admin → Discord configured; server whitelisted |
| Stream works, WS fails | Proxy `/relay` → port **4001** with WebSocket Upgrade headers |

---

## Development

For hacking on the repo locally (Node 20+, ffmpeg on `PATH`):

```bash
npm install
npm run dev    # backend :4002 + Vite :5173
```

Production-style single port: `npm run build && npm start` → **http://localhost:4002**

Optional voice bot: `npm run voice`

Runtime data in dev goes under `backend/local/` (gitignored). See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for layout.

| Path | Role |
|------|------|
| `backend/` | Radio server (`bot.js`), voice bot (`relay-bot.js`), SQLite |
| `frontend/` | React UI (Vite + Tailwind) |
| `docker/` | Dockerfile, compose, entrypoint |
