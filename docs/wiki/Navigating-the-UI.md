# Navigating the UI

CollabFM is a single-page web app. Layout differs on **desktop** (wide screen) and **mobile** (narrow screen), but the same features exist on both.

---

## Logging in

1. Open your station URL (e.g. `https://radio.example.com` or `http://your-ip:4002`).
2. Enter **Username** and **Password**, then click **Sign in**. You can also sign in with your **email** when the account has a login email (registration or hybrid accounts).
3. If SSO is enabled, use **Login With …** (your provider nickname) instead.
4. If **gated registration** is enabled and you do not have an account, use **Request access** on the login page — submit the form, wait for admin approval, then activate with your enrollment token.
5. If you have **two-factor authentication** enabled, enter your authenticator code (or one backup code) on the next step.
6. If the station **requires 2FA** and you have not set it up yet, complete the setup flow—or, for **admins**, choose **Skip for now**.

First-time server setup uses `/setup` with the bootstrap token from container logs — see the [README](https://github.com/AlecMcCutcheon/collabfm-radio#2-first-time-setup).

Account passwords, hybrid SSO+local login, and 2FA management live in **Studio → Account security** — see [Account Security & Studio](./Account-Security-and-Studio.md).

---

## Desktop layout (logged in)

| Area | Where | What it does |
|------|-------|----------------|
| **Radio player** | Center | Listen Live, volume, now playing, search (if enabled) |
| **Stage dock** | Left edge, vertical **STAGE** label | Who is on air; click to expand |
| **Chat** | Bottom-right round **message** button | Opens **Live Chat** overlay |
| **Studio** | Top-right round **profile** button | Profile, share links, account security (all signed-in users); extension pairing for broadcasters/admins |

---

## Mobile layout (logged in)

Bottom navigation bar:

| Tab | Icon | Purpose |
|-----|------|---------|
| **Radio** | Radio | Main player |
| **Stage** | People | Who is on air |
| **Chat** | Message | Live chat (full screen) |
| **Studio** | Sliders | Studio — profile, share links, security (all users); extension pairing for broadcasters/admins |

There is no floating chat button on mobile — use the **Chat** tab.

---

## Opening Admin settings

Admin is **not** a top-level button on the main radio screen. Use the chat menu:

### Desktop

1. Click the **message icon** in the **bottom-right** corner (**Open chat**).
2. The **Live Chat** panel opens.
3. In the chat **header** (next to “Live Chat”), click the **gear icon** (tooltip: **Chat actions**).
4. In the dropdown, click **Admin settings**.
5. You are taken to **Radio Admin** (`/admin`).

### Mobile

1. Tap **Chat** in the bottom nav.
2. Tap the **gear icon** in the chat header.
3. Tap **Admin settings**.

You must be logged in with the **Admin** role. Other users do not see **Admin settings** in the menu.

---

## Main radio screen controls

### Top-left (broadcasters only)

- **Search icon** — song search and request queue (when Last.fm is configured and someone is live).
- **Microphone icon** — **Go live** / **On air — manage broadcast** (opens the broadcast source modal).

### Top-right

- **Info icon** — About this radio.
- **Profile icon** (all signed-in users) — Studio.

### Center

- **Listen Live** / **Stop** — start or stop playback.
- **Volume** slider.
- **Stats pill** (headphones, online, stage, Discord icons) — opens the **listener roster**.

### When someone is live

- **LIVE** pill — tap to view songs played this session.

---

## Stage view

### Desktop

1. Click the vertical **STAGE** strip on the **left**.
2. The panel expands showing up to 7 avatar slots.
3. The live DJ has a **red ring** around their avatar.
4. Click an avatar to open the host menu (profile, connections, promote, media controls).

### Mobile

1. Tap **Stage** in the bottom nav.
2. The live DJ appears large at the top; others in a grid below.
3. Tap an avatar for the same host menu (slides up from the bottom).

---

## Guest links (`/listen/{token}`)

Guests see the same **Radio / Stage / Chat / Studio** bottom nav on mobile.

- **Studio** is always visible for guests (profile and, for broadcaster links, go-live tools).
- **Profile icon** on desktop opens **Guest Studio** for nickname and guest ID.

Invalid or expired links show an error page instead of the player.

---

## Back navigation

Most sub-pages have a **back arrow** (**Back to radio**) in the top-left that returns to `/`.
