# Chat & Party Effects

CollabFM is built for a **shared listening room**: everyone on the web UI sees the same live chat and the same synced visual effects. Guests on share links get the same features scoped to that link.

---

## Live chat

### Opening chat

| Layout | How to open |
|--------|-------------|
| **Desktop** | Bottom-right **message icon** (**Open chat**) |
| **Mobile** | Bottom nav **Chat** tab |

### Chat header

- **Live Chat** title and your role badge (Admin, Broadcaster, Listener, Guest).
- **Gear icon** — admins (and some debug roles) see **Admin settings** and **Clear all chat**.
- **X** — close chat (desktop overlay only).

### Sending messages

1. Type in **Type a message…** at the bottom.
2. Press **Enter** or click **Send** (paper plane icon).

**Typing indicator** — when others are typing, the chat FAB or header can show that someone is composing a message.

### GIFs (when enabled)

If an admin configured **Giphy** (**Admin → System → Integrations**):

1. Click the **GIF** button next to the message input.
2. Browse trending GIFs or **search**.
3. Click a GIF to post it in chat.

GIF messages appear inline with optional caption text.

### Avatars in chat

| Action | How |
|--------|-----|
| **View profile** | Click someone's **avatar** |
| **Party reaction to a person** | **Right-click** their avatar (not your own) |

Profile reactions on chat avatars are the same family as stage reactions (wave, high five, party together, rock-paper-scissors).

### Song requests in chat

When song search is enabled and someone requests a track, request cards can appear in the chat thread (approve/deny flows for DJs). Use the **search icon** on the radio view to open the request queue.

### Who can chat

- **Logged-in** listeners, broadcasters, and admins.
- **Guests** on valid share links (`/listen/{token}`).

---

## Party effects (synced visuals)

When someone triggers a party effect, **everyone on the same radio view** sees it at the same time—logged-in users and guests on that station or share link. Effects stream over the live events connection (same idea as chat updates).

Party effects are only active while you are on the **Radio** view (not while the mobile **Studio** tab is full-screen).

### Open the party menu

**Right-click** (or long-press where supported) on an **empty area** of the radio page—not on buttons, inputs, or chat.

The **Party time** menu opens with three categories:

| Category | Examples | Behavior |
|----------|----------|----------|
| **Effects** | Fireworks, confetti, shockwave, love burst, lasers, bubbles, stars, musical notes | Bursts at the point you clicked |
| **Arrivals** | Rocket, comet, UFO, meteor, lightning, firefly, satellite | Flies in along a path and lands on your click |
| **Reactions** | Thumbs up/down, love, LOL, fire, applause, wow, etc. | Pops up with your avatar and an emoji at the click point |

Tap the **info (i)** icon in the menu header for a short in-app explanation.

**Rate limit** — triggering too fast shows a small “chill” bubble instead of spamming effects. Keep it fun for the room.

### Profile reactions (on a DJ or listener)

Target a **person**, not empty space:

| Where | How |
|-------|-----|
| **Stage** | **Right-click** a host **avatar** |
| **Chat** | **Right-click** someone's **avatar** in a message |

Choose from **React to {name}**: Party together, Wave, High five, Rock · Paper · Scissors.

You cannot profile-react to yourself. Reactions appear on or between the two avatars for everyone watching.

### Effect hotkeys (broadcasters)

In **Studio → Effect hotkeys** (logged-in broadcasters with a favorites scope):

1. Assign up to **8** favorite effects to keys **1–8**.
2. On the **Radio** view, press **1**–**8** to spawn that effect at your **cursor position**.
3. **Right-click** still opens the full party menu.

Guests and listeners without favorites use the right-click menu only.

### Hearts (DJ appreciation)

Separate from party effects but part of the social layer:

| Where | What |
|-------|------|
| **Now playing** (radio panel) | **Heart icon** on the current track — supports the live DJ (grants XP when allowed) |
| **Session log** | Open **LIVE** pill → heart past tracks; source and license links when reported |
| **Discord** | Heart button on the voice bot **Now Playing** embed |

Admins can tune guest heart XP under **Admin → System → DJ leveling**.

---

## What everyone sees together

On the **web UI**, these are shared in real time for the room:

- Chat messages and GIFs  
- Party effects, arrivals, and reactions  
- Profile reactions between users  
- Stage lineup and who is live  
- Now playing metadata and album art  

Discord voice is separate: each voice channel can pick **Main station** or a **specific DJ** (see [Discord Voice Bot Setup](./Discord-Voice-Bot-Setup.md)).

---

## Quick reference

```
Open chat (desktop)     → bottom-right message icon
Send GIF                → GIF button → pick or search
Party effect (spot)     → right-click radio background → Party time → Effects / Arrivals / Reactions
React to a person       → right-click their avatar (stage or chat)
Effect hotkey           → Studio → assign keys 1–8 → press on Radio view
Heart the DJ            → heart icon on now playing (when live)
```
