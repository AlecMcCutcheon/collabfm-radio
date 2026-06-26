# Broadcasting & Stage

How to go on air, pair the Chrome extension, hand off the DJ role, and control media on supported sites.

---

## Who can broadcast

- **Registered users** with the **Broadcaster** or **Admin** role.
- **Guest broadcasters** via a **guest broadcaster** share link (no account required).

---

## Go live (registered user)

### Desktop or mobile

1. On the main **Radio** view, click the **microphone icon** (top area).
2. The **Go live** modal opens.

**Web UI broadcaster** (browser tab capture):

- Click **Start broadcasting** (marked *Not recommended* for quality).
- Choose the tab/window to share when the browser prompts you.
- Click **Stop broadcasting** to end.

**Chrome extension** (recommended for tab audio):

- Download the extension ZIP from **Admin → System** (or use the link in the modal).
- Pair the extension first (see below), then start broadcasting from the extension popup.

Closing the modal does **not** stop an active broadcast.

---

## Broadcaster Studio

Open Studio:

- **Desktop:** top-right **profile icon**.
- **Mobile:** bottom nav **Studio**.

Sections:

1. **Your profile** — on-air nickname, avatar, status, genre tags.
2. **DJ level** — XP rules.
3. **Share links** — create guest listener or guest broadcaster links.
4. **Party effect favorites** — if enabled for your account.
5. **Browser extension** — device pairing.

---

## Extension pairing (registered broadcaster)

### In the Chrome extension popup

1. Set **Radio host** to your station URL (e.g. `https://radio.example.com`).
2. Ensure **Pair device** mode is selected (not **Guest link**).
3. A pairing code appears (e.g. `ABCD-1234`).
4. Leave the popup open or copy the code.

### On the website

1. Open **Broadcaster Studio** (profile icon or **Studio** tab).
2. Scroll to **Browser extension**.
3. Paste the pairing code and enter a **Device name** (default: “Browser extension”).
4. Click **Pair extension**.
5. The extension should confirm within a few seconds.

To broadcast: select a **non-radio** browser tab in the extension and click **Start broadcasting**.

**Admin option:** **Admin → System → Require device pairing for the browser extension** forces pairing instead of reusing your website login in the extension.

---

## Guest broadcaster (share link)

### Create the link

**Broadcaster Studio → Share links:**

1. Optional **Label**.
2. **Guest type:** **Guest broadcaster**.
3. **Expires after** (or Never).
4. **Create & copy link**.

### Guest flow

1. Open `/listen/{token}`.
2. **Microphone icon** → **Go live** (web UI or extension).
3. For the extension: switch to **Guest link** mode, paste the share URL, optionally paste **Guest ID** from Guest Studio, then **Connect**.

**Guest Studio** (`/listen/{token}/studio` or mobile **Studio** tab):

- Set nickname and avatar.
- Copy **Guest ID** to link extension identity with the website stage.

---

## Promoting another DJ

Use this when someone else is connected and should become the active broadcaster (e.g. you are finishing your set).

**You must be** the current live DJ **or** an admin.

### Steps

1. Open **Stage** (left **STAGE** dock on desktop, or **Stage** tab on mobile).
2. Click the **avatar** of the connection you want to promote (under **Connections** in the menu).
3. Click **Promote to DJ** (circular arrows icon).
4. That connection becomes the active DJ; the stream follows them.

Guests cannot promote. Inactive connections show **Only active broadcaster or admin can switch** if you lack permission.

---

## Media controls (supported sites)

When a DJ broadcasts via the **Chrome extension** from a supported site (e.g. **YouTube Music**, **Soundcloud**), CollabFM can send play/pause/skip to that tab.

### Who can control

- The **active DJ** (their own connection).
- An **admin** (any supported connection).
- A **guest broadcaster** (only their own connection).

### Steps

1. Open **Stage**.
2. Click the DJ’s **avatar**.
3. In **Connections**, find the row with a green **music note** icon (**Control media playback**).
4. Click the music note to expand controls:
   - **Play / Pause**
   - **Previous**
   - **Next**
5. On mobile stage menu only: **Pin** / **Unpin** — pinned controls appear on the **Radio** view below the volume slider.

If there is no music note icon, that connection is not on a supported site or does not report media capability.

---

## Share links (listeners vs broadcasters)

**Broadcaster Studio → Share links**

| Guest type | Guest gets |
|------------|------------|
| **Guest listener** | Full web UI at `/listen/{token}` — listen, chat, stage |
| **Guest broadcaster** | Same + ability to go on air via web UI or extension |

Each link can also expose a **stream URL** for OBS/VLC (**Copy stream link**).

Admins can see all links under **Admin → Share links**.
