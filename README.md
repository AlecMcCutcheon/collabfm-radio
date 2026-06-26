# CollabFM v2

Evolution of the recovered radio stack: local/OIDC auth, SQLite config, universal voice bot, built-in stream hub.

- **Reference (frozen):** [`../jebes_cust_radio_recovered`](../jebes_cust_radio_recovered)
- **Architecture:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## Quick start

From the project root:

```bash
npm install          # installs root + backend + frontend deps
npm run dev          # backend on :4002 + Vite on :5173 (proxied API)
```

Open **http://localhost:5173** for development. The first visit runs the **setup wizard** when no users exist in `storage/radio.db`. Check the backend console for the one-time setup token (username `admin`).

### Locked out of admin?

Inside the container or appdata directory:

```bash
npm run bootstrap-recovery --prefix backend
# or: node scripts/bootstrap-recovery.js
```

Use the printed **admin + recovery token** on the normal login page (single use). Reset your password in Admin, then log out.

Production-style (backend serves built UI from `backend/dist`):

```bash
npm start            # builds frontend, stages to backend/dist, starts backend on :4002
```

Or manually: `npm run build` then open **http://localhost:4002**.

Optional Discord voice bot (separate process):

```bash
npm run voice
```

### Requirements

- **Node.js 20+**
- **ffmpeg** on `PATH` (used by the audio worker; included in the Docker image)

On first run, `npm run dev` / `npm start` creates `backend/config.json` from `backend/config.example.json` defaults if it is missing. Local SQLite, logs, and uploads go under **`backend/local/`** (gitignored).

## Project layout

| Path | Role |
|------|------|
| `backend/` | Radio server (`bot.js`), voice bot (`relay-bot.js`), SQLite, stream hub |
| `backend/local/` | **Local dev only** — storage, logs (gitignored) |
| `frontend/` | React UI (Vite + Tailwind) |
| `docker/` | Dockerfile, compose, GHCR-oriented deploy |
| `.github/workflows/` | CI — build & push to GHCR on push to main |

## Admin (after setup)

- **Discord bot** — Application ID + Bot Token for `/join` / `/leave`
- **Server whitelist** — which Discord servers may use `/join`
- **Share links** — guest listen URLs (web UI or direct MP3 for OBS/VLC), configurable TTL, revocable
- **OIDC** — optional Authentik SSO

## Docker (GHCR + appdata volume)

Images are built in GitHub Actions and pushed to **`ghcr.io/<owner>/<repo>`** (see `.github/workflows/publish-ghcr.yml`).

### First run (appdata seed)

Mount a host folder to `/usr/src/app`. On first start the entrypoint **copies the image contents** into that folder so you get `config.json`, `storage/`, `logs/`, and app code on disk. Later runs use your local copy.

**First-time setup:** watch the container logs for a bootstrap token. Open `/setup`, unlock with username `admin` and that token, then create your real admin account. The token is regenerated on every restart until setup completes.

**Admin lockout:** run `node scripts/bootstrap-recovery.js` in the container (or `npm run bootstrap-recovery --prefix backend` from appdata). Log in with `admin` + the printed recovery token, reset your password in Admin, log out.

### Ports via compose env

Set in `docker/.env` (copy from `docker/.env.example`):

| Variable | Default | Overrides `config.json` |
|----------|---------|-------------------------|
| `WEB_PORT` | 4002 | `server.webPort` |
| `WS_PORT` | 4001 | `server.wsPort` |
| `PCM_RELAY_PORT` | 4100 | `server.pcmRelayPort` |

Host and container use the **same** port numbers — map `${WEB_PORT}:${WEB_PORT}` in compose.

### Local compose (build or pull)

```bash
cd docker
cp .env.example .env   # edit APP_DATA, ports, IMAGE
docker compose up -d --build
```

### Unraid

Use `docker/compose.unraid.yaml` — set `APP_DATA` and `IMAGE=ghcr.io/you/collabfm:latest`. Ensure the **`matrix`** network exists or remove the `networks:` block.

| Port | Role |
|------|------|
| `${WEB_PORT}` | Web UI + API |
| `${WS_PORT}` | WebSocket relay (`/relay`) |

Optional: run the voice bot with `docker compose run --rm collabfm node relay-bot.js` (same appdata mount).

## Listening

| Audience | URL |
|----------|-----|
| Logged-in users | `/api/stream` (session cookie) |
| Guest web player | `/listen/{token}` (admin share link) |
| OBS / VLC / other players | `/api/listen/{token}/stream` or `/api/stream?token={token}` |

Share links are created in **Admin → Share links** with TTL options from 24 hours through permanent.
