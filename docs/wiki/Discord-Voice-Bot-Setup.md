# Discord Voice Bot Setup

CollabFM can relay your live stream into Discord voice channels using a **Discord bot** (`relay-bot.js`). You configure credentials in **Admin → Discord bot** and whitelist servers.

---

## 1. Create a Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, name it (e.g. “CollabFM Radio”), accept terms.
3. Open **OAuth2** in the sidebar (optional: note **Client ID** — same as Application ID).

---

## 2. Create a bot user

1. Open **Bot** in the sidebar.
2. Click **Add Bot** (or **Reset Token** if recreating).
3. Click **Reset Token** and copy the **Bot Token** — store it securely; Discord shows it once.
4. Under **Privileged Gateway Intents**, enable what you need:
   - **Message Content Intent** — if your deployment uses message features.
   - **Server Members Intent** — usually not required for voice relay.

---

## 3. Note the Application ID

1. Open **General Information** (or **OAuth2**).
2. Copy **Application ID** — this is the **Client ID** in CollabFM Admin.

---

## 4. Invite the bot to your server

After saving Client ID in CollabFM, use **Invite bot to server** in **Admin → Discord bot**, or build an invite URL manually:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=36700160&scope=bot%20applications.commands
```

Replace `YOUR_APPLICATION_ID` with your Application ID.

The bot needs permission to **Connect**, **Speak**, and use **Slash Commands** in voice channels.

---

## 5. Configure CollabFM Admin

1. Open **Admin settings** (chat → gear → **Admin settings**).
2. Go to **Discord bot** tab.
3. Enable **Enable voice bot**.
4. Paste **Application ID (Client ID)**.
5. Paste **Bot Token**.
6. Set **Public site URL** to your station’s public HTTPS URL (e.g. `https://radio.example.com`) — used for rich embeds and artwork.
7. Click **Save**.
8. Click **Verify credentials** — should show bot username if valid.
9. Click **Start bot** (or run `relay-bot.js` separately in Docker).

---

## 6. Whitelist your Discord server

Still on **Discord bot** tab, scroll to **Server whitelist**:

1. Copy your Discord **Server ID** (enable Developer Mode in Discord → right-click server → **Copy Server ID**).
2. Enter **Guild ID** and optional **Label**.
3. Click **Add**.

The bot refuses `/join` on non-whitelisted servers.

---

## 7. Use in Discord

In a whitelisted server, join a voice channel and run:

- `/join` — bot joins your channel and plays the station.
- `/leave` — bot disconnects.

---

## Docker notes

- The main container runs `bot.js` (web + stream).
- Voice relay may run as a **separate process** (`node relay-bot.js`) with the **same appdata mount**.
- After changing the bot token in Admin, restart the voice bot container if you use a split layout (`collabfm-voice` in compose examples).

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| Verify fails | Token copied correctly; bot not deleted in Developer Portal |
| Bot won’t join | Server Guild ID in whitelist; bot invited to server |
| No audio | Voice bot process running; station is live; check Admin runtime **Running** |
| Embeds broken | **Public site URL** matches your real HTTPS origin |
