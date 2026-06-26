# Navigating the UI

CollabFM is a single-page web app. Layout differs on **desktop** (wide screen) and **mobile** (narrow screen), but the same features exist on both.

---

## Logging in

1. Open your station URL (e.g. `https://radio.example.com` or `http://your-ip:4002`).
2. Enter **Username** and **Password**, then click **Sign in**.
3. If SSO is enabled, use **Login With …** (your provider nickname) instead.

First-time server setup uses `/setup` with the bootstrap token from container logs — see the [README](https://github.com/AlecMcCutcheon/collabfm-radio#2-first-time-setup).

---

## Desktop layout (logged in)

| Area | Where | What it does |
|------|-------|----------------|
| **Radio player** | Center | Listen Live, volume, now playing, search (if enabled) |
| **Stage dock** | Left edge, vertical **STAGE** label | Who is on air; click to expand |
| **Chat** | Bottom-right round **message** button | Opens **Live Chat** overlay |
| **Broadcaster Studio** | Top-right round **profile** button | Opens `/broadcaster` (broadcasters and admins only) |

---

## Mobile layout (logged in)

Bottom navigation bar:

| Tab | Icon | Purpose |
|-----|------|---------|
| **Radio** | Radio | Main player |
| **Stage** | People | Who is on air |
| **Chat** | Message | Live chat (full screen) |
| **Studio** | Sliders | Broadcaster Studio (broadcasters/admins only) |

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
- **Profile icon** (broadcasters/admins) — Broadcaster Studio.

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
