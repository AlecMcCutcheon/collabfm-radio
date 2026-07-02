# API access & security

CollabFM is built for **private or invited audiences**, not anonymous public scraping. Most station APIs require you to be **logged in** or to present a valid **guest share link token**.

Full technical detail (including extension bearer tokens and internal loopback): **[docs/ARCHITECTURE.md — API access](https://github.com/AlecMcCutcheon/collabfm-radio/blob/main/docs/ARCHITECTURE.md#api-access)** in the repo.

## What stays public

These work without logging in (needed for the login page and first-time setup):

- Station branding (`/api/branding`)
- Setup status (`/api/setup/status`)
- Auth discovery (`/auth/methods`, `/auth/status`)
- Registration gate config (`/auth/registration/config`) when gated registration is enabled
- Public extension download (`/api/extension/public/download`)
- Static web assets

## What requires auth

Without a session cookie or share token, these return **401 Unauthorized**:

- Now playing / metadata (`/api/metadata`, `/api/broadcast-status`, `/api/status-json.xsl`)
- Song search (`/api/search`)
- Chat, requests, party effects, presence, avatars, album art URLs

This is intentional: it reduces abuse (e.g. burning your Last.fm quota) and matches the “invited listeners” model.

## Guests and share links

**Web guest player** — open `/listen/{token}` in the browser. The app passes the token to APIs automatically.

**OBS / VLC** — use `/api/listen/{token}/stream` or `/api/stream?token=`.

**API integrators** — append `?shareToken=` (or `?token=`) to GET requests, or include `shareToken`, `guestId`, and `guestSession` in POST bodies for guest actions. Invalid tokens are rejected; there is no anonymous fallback.

## Logged-in members

Use the site normally; the browser sends the session cookie. Stream URL: `GET /api/stream`.

**Studio account APIs** (`/api/account/*`) require a session and let users manage passwords and 2FA. **Admin registration and SSO helper routes** (`/api/admin/registration/*`, `/api/admin/oidc/refresh-legacy-emails`, etc.) require an admin session. See [ARCHITECTURE.md — Auth endpoints](https://github.com/AlecMcCutcheon/collabfm-radio/blob/main/docs/ARCHITECTURE.md#registration-when-enabled) for the full list.

## Browser extension

Uses a **device bearer token** (paired in Admin) for metadata and relay auth — not the public anonymous API.

## Verify your instance

Replace the host with your station URL:

```bash
# Should succeed (public)
curl -sS -o /dev/null -w "%{http_code}\n" https://radio.example.com/api/branding

# Should fail without auth (401)
curl -sS -o /dev/null -w "%{http_code}\n" https://radio.example.com/api/metadata
```

If you previously had widgets or scripts polling `/api/status-json.xsl` or `/api/metadata` without auth, update them to use a share token or run behind a logged-in session.

## Related

- [Admin Panel](./Admin-Panel.md) — share links, allowed origins, integrations
- [Authentik SSO Setup](./Authentik-SSO-Setup.md) — member login
- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — guest broadcaster links
