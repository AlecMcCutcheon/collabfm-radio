# Admin Panel

Open **Admin settings** via chat: **message icon → Live Chat header → gear → Admin settings**. You must have the **Admin** role.

Header: **Radio Admin** — *Manage users, streaming, Discord, and sign-in settings.*

Use **Back to radio** (top-left arrow) to return to the main player.

---

## Tab: Users

Manage local accounts (SSO users may also appear here after first login).

**Per user:**

- **Role** — Listener, Broadcaster, or Admin.
- **Set password** / **Save password** — local accounts only.
- **Delete** — remove account.
- **Block guest-action XP** — hearts/approvals from guests on the same IP won’t grant XP to this user.
- **Reset XP** — zero DJ level progress.

**Add user** — username, password, role, **Add user**.

---

## Tab: Discord bot

Optional voice bot that plays your station in Discord voice channels.

| Field | Purpose |
|-------|---------|
| **Enable voice bot** | Turn Discord integration on/off |
| **Application ID (Client ID)** | From Discord Developer Portal |
| **Bot Token** | Bot token (hidden by default; use the reveal control to view) |
| **Public site URL** | Your HTTPS station URL (embed thumbnails, cover art) |

**Actions:**

- **Invite bot to server** — OAuth invite link (after Client ID is saved).
- **Save** — store credentials.
- **Verify credentials** — test token with Discord API.
- **Start bot** / **Stop bot** — run `relay-bot.js` process (Docker: may need separate voice container).

**Server whitelist** — Discord **Guild ID** + optional label. The bot only joins whitelisted servers. In Discord, use `/join` and `/leave` in a voice channel.

See [Discord Voice Bot Setup](./Discord-Voice-Bot-Setup.md) for creating the Discord application.

---

## Tab: Share links

Site-wide list of guest links (broadcasters also create links in **Broadcaster Studio**).

- **Copy UI link** — guest web player.
- **Copy stream link** — direct MP3 for OBS/VLC.
- **Revoke** — invalidate link.

Shows active listener count for stream access.

---

## Tab: OIDC / SSO

Single sign-on via OpenID Connect (Authentik and other providers).

| Field | Purpose |
|-------|---------|
| **Enable OIDC login** | Show SSO button on login page |
| **Callback URL** | Read-only: `{your-site}/auth/oidc/callback` — register this in your IdP |
| **Issuer URL** | OIDC issuer (Authentik application issuer URL) |
| **Client ID** | OAuth client ID |
| **Client Secret** | OAuth client secret |
| **Redirect URI (optional)** | Usually auto-detected; must match IdP |
| **Scopes** | Default: `openid profile email groups` |
| **Groups claim name** | JWT field for groups (often `groups`) |
| **Logout URL** | IdP end-session URL for full SSO logout |
| **Radio username from** | `sub`, `preferred_username`, or `name` |
| **Link to existing local account on name match** | Attach SSO login to matching local username |
| **SSO button nickname** | Shown as “Login With …” on the login page |

**Group → role mapping** — map IdP group names to Listener / Broadcaster / Admin.

**Save OIDC settings** at the bottom.

See [Authentik SSO Setup](./Authentik-SSO-Setup.md) for a step-by-step Authentik guide.

---

## Tab: Radio

**Stage & logs**

- **Max stage users** (1–9) — simultaneous broadcaster WebSocket connections.
- **Debug log retention** — how long debug logs are kept.

**PCM pipeline** — buffer tuning for broadcaster audio (applies live).

**Discord voice buffer** — relay join buffer and Discord frame settings.

**Save radio settings**

---

## Tab: System

**Content policy** *(best-effort filtering enabled by default)*

CollabFM **does not host or provide audio content**—it relays broadcaster-supplied streams. CollabFM provides a configurable content policy to help operators manage what audio may be relayed. The policy engine is a **filtering tool**, not a copyright detector—it **attempts best-effort filtering** using source, artist, and license allowlists on reported metadata. New installs default to **[Free Music Archive](https://freemusicarchive.org/search?adv=1&music-filter-CC-attribution-only=true&music-filter-CC-attribution-sharealike=1&music-filter-CC-attribution-noderivatives=1&music-filter-CC-attribution-noncommercial=1&music-filter-CC-attribution-noncommercial-sharealike=true&music-filter-CC-attribution-noncommercial-noderivatives=true) (CC search)** and **[Jamendo](https://www.jamendo.com/explore) (explore)** because the extension can read machine-readable license metadata and track URLs per play—not because those sources are guaranteed legally safe in all contexts. Admins must verify compliance. The extension can capture audio from other tab sources; admins add hostnames to the allowlist manually when they choose to permit them.

- **Enable content policy enforcement** — on by default; turning off allows all broadcasts
- **Safety rails** — global fallbacks locked until an admin confirms responsibility
- **Fallback actions** — missing metadata, unmatched artist, unmatched source, missing/unmatched license
- **Source, artist, and license allowlists**

See [Content Policy](./Content-Policy.md) for full detail.

**DJ leveling**

- **Allow guest hearts and request approvals to grant XP**
- **Block guest XP when IP matches someone on stage**

**Extension broadcasting**

- **Require device pairing for the browser extension**

**Integrations**

- **Last.fm API key** + default user — song search and metadata.
- **Giphy API key** — GIF button in chat.

**Login security (Cloudflare Turnstile)**

- Site key + secret — bot protection for local login (SSO unaffected).

**Branding**

- **Radio display name** — station title in UI and stream metadata.
- **Hide developer message & coffee button** — removes the original developer’s thank-you note and **Buy me a coffee** link from the About dialog (optional; for operators who prefer a cleaner About screen).
- **Visualizer logo** — drag/drop or upload; **Reset visualizer to default**.

**Extension download** — ZIP served to broadcasters from this tab’s area (also linked in Go live modal).

**Container updates**

- **Build ID** — read-only; baked into each GHCR image at publish time (`channel:revision`).
- **Tracking** — `latest` or `develop` is picked automatically from the image channel (preview images track `:develop`, stable track `:latest`).
- **Notify when a newer build is available** — compares your revision to the matching GHCR tag only (no cross-channel false alerts).
- **Check now** / **Save** — refresh the comparison or persist notification preferences.

After upgrading: pull the new image, set `COLLABFM_SYNC_MODE=update` for one recreate, then reinstall the extension if needed.

**System info** — database path, runtime mode (read-only reference).
