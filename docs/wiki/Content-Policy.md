# Content Policy

CollabFM includes a **content policy** to help server operators and broadcasters manage what audio sources are permitted during live broadcasts. The platform ships with conservative default settings intended to reduce accidental misuse and encourage responsible streaming practices.

CollabFM does **not** verify licensing or guarantee legal compliance. Administrators and broadcasters remain responsible for this instance's configuration and for ensuring broadcasts comply with applicable copyright and licensing requirements.

---

## What the policy does

When enforcement is enabled, the policy engine evaluates broadcasts using metadata from the **browser extension** (and related API paths). It checks:

1. **Source** — the website hostname reported by the extension (e.g. `ncs.io`, `pixabay.com`).
2. **Artist / title** — track metadata when source alone is not enough to decide.

The **first matching rule** wins. Fallback actions apply when metadata is missing or does not match an allowlist.

| Outcome | Listener experience |
|---------|---------------------|
| **Allow** | Normal now-playing metadata and audio |
| **Deny** | Stream audio is muted; now-playing shows a policy notice |
| **Warn** | Logged server-side; broadcast continues (if configured) |

Decisions are logged on the server for admin review.

---

## Default settings (new installs)

Out of the box, CollabFM enables a strict policy with example allowlists—not a licensing guarantee:

| Type | Default examples |
|------|------------------|
| **Allowed sources** | `ncs.io`, `pixabay.com` |
| **Allowed artists** | NoCopyrightSounds (NCS) |
| **Missing metadata** | Deny |
| **Unmatched source / artist** | Deny |

Default configurations may reference royalty-free or creator-friendly platforms as **starting points**. Content from those sites is **not** automatically cleared for every use case. You are responsible for securing appropriate rights and licenses.

These controls are intended to **support responsible use**, not replace legal obligations. CollabFM does not condone intentional misuse or misconfiguration of this policy.

---

## Admin configuration

**Admin → System → Content policy**

| Area | Purpose |
|------|---------|
| **Enable enforcement** | When off, broadcasts are allowed (denials are not enforced) |
| **Safety rails** | Global fallbacks and the enable toggle are locked until an admin confirms responsibility |
| **When metadata is missing** | Action if the extension cannot report usable artist/title |
| **When artist does not match** | Action if artist is not on the allowlist |
| **When source does not match** | Action if the tab hostname is not on the allowlist |
| **Source allowlist** | Hostnames (e.g. `ncs.io`, `pixabay.com`) |
| **Artist allowlist** | Names and optional alternate names |

**Save content policy** applies changes immediately for new metadata and capability updates.

**Reset to defaults** restores the conservative starter policy.

---

## Broadcaster behavior

- The extension reports the active tab **site** and **track metadata** to the server.
- If the source is unknown while metadata arrives, the server may **hold** now-playing updates until the source is known—avoiding a flash of blocked track titles on the website or Discord.
- When a source is **denied**, relay audio is muted and listeners see the policy notice until an allowed source is used.

Broadcast only content you have the right to share. CollabFM is intended for **private or invited audiences**—friends, community servers, homelab listeners—not as a public commercial broadcast service.

---

## Related

- [Admin Panel](./Admin-Panel.md) — System tab overview
- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — extension pairing and go-live
- [Main README — Legal & responsible use](https://github.com/AlecMcCutcheon/collabfm-radio#legal--responsible-use)
