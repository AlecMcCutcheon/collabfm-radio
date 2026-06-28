# CollabFM Wiki

Detailed guides beyond the [main README](https://github.com/AlecMcCutcheon/collabfm-radio). The README covers Docker deploy, ports, and reverse proxies; this wiki focuses on **finding things in the UI** and **integrating external services**.

## Guides

| Guide | What it covers |
|-------|----------------|
| [Navigating the UI](./Navigating-the-UI.md) | Chat, admin entry, mobile vs desktop, main radio screen |
| [Broadcasting & Stage](./Broadcasting-and-Stage.md) | Go live, extension pairing, promote a DJ, media controls |
| [Chat & Party Effects](./Chat-and-Party-Effects.md) | Live chat, GIFs, synced party effects, hearts, hotkeys |
| [Admin Panel](./Admin-Panel.md) | All admin tabs and what each setting does (including **container update notifications**) |
| [Content Policy](./Content-Policy.md) | Broadcast allowlists, enforcement, and responsible use |
| [API Access & Security](./API-Access-and-Security.md) | Which endpoints are public vs login/share-token |
| [Discord Voice Bot Setup](./Discord-Voice-Bot-Setup.md) | Discord Developer Portal → CollabFM Admin |
| [Authentik SSO Setup](./Authentik-SSO-Setup.md) | OpenID Connect app for CollabFM login |

## Quick paths

**Check for container updates (admin)**  
**Admin settings** → **System** tab → **Container updates** → enable notifications and pick `latest` or `develop`

**Admin settings (desktop)**  
Bottom-right **message icon** (Open chat) → **Live Chat** header → **gear icon** → **Admin settings**

**Admin settings (mobile)**  
Bottom nav **Chat** → chat header **gear** → **Admin settings**

**Broadcaster Studio (desktop)**  
Top-right **profile icon** → Broadcaster Studio

**Broadcaster Studio (mobile)**  
Bottom nav **Studio**

**Promote another DJ**  
Open **Stage** → click a host **avatar** → **Promote to DJ**

**Discord: shared main station**  
Voice channel → `/join` (starts on Main station — same as the website)

**Discord: one DJ only (personal feed)**  
After `/join` → `/station` or **Switch station** on the Now Playing message

**Party effects (synced for everyone)**  
Right-click **radio background** → **Party time** menu

**React to someone**  
Right-click their **avatar** on **Stage** or in **Chat**

**Open live chat (desktop)**  
Bottom-right **message icon**

**Media controls (YouTube Music, SoundCloud, etc.)**  
Open **Stage** → click host **avatar** → green **music note** icon → Play / Pause / Previous / Next
