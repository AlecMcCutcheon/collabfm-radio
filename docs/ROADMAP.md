# Roadmap

Ideas under consideration—not commitments, and not in any fixed order. If something here matters to you, [open an issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) or a PR; hearing real use cases helps prioritize.

---

## Completed

~~**Content policy (baseline)**~~ — **Shipped.** Configurable broadcast allowlists for permitted sources and artists, **enforced by default**. The policy engine is a **filtering tool**, not a copyright detector—it applies rules to metadata reported by the browser extension (site, title, artist), not to raw audio. Includes Admin → System configuration, extension mute and handoff behavior, synchronized metadata on the web UI and Discord, and the [Content Policy wiki](./wiki/Content-Policy.md).

~~**Content policy — licensing & stricter defaults**~~ — **Shipped.** **Free Music Archive** as the default allowed source; standard **Creative Commons** license allowlist (CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA, CC BY-ND, CC BY-NC-ND, CC0) with flexible per-kind matching; license safety rails (deny missing/unmatched license by default); FMA track URL and license scraping in the extension; source and license links on now-playing and the live session log; **deny-by-default** fallbacks for missing or unmatched metadata, source, artist, and license; content policy **re-evaluated on DJ switch** so blocked tracks do not flash real metadata.

~~**Dynamic stage UI**~~ — **Shipped.** Stage dock and mobile stage grid show empty slots matching **Admin → Radio → Max stage users** (1–9). The relay API exposes `stageLimit`; the dock height scales with slot count.

~~**Admin container update notifications**~~ — **Shipped (in-app).** Admin → System → Container updates: enable notifications; GHCR tag (`latest` or `develop`) is auto-selected from the running image's baked channel. Banner when a newer build is **published and pullable** on that tag.

---

## Container & release workflow

| Channel | GHCR tag | Git branch | Audience |
|---------|----------|------------|----------|
| Stable | `latest` | `main` | Everyone |
| Preview | `develop` / `dev` | `develop` | Operator homelab testing |

Scripts: `./scripts/push-dev.sh`, `./scripts/promote-dev-to-main.sh` (see README [Upgrading](./README.md#preview--dev-channel-homelab)).

**Future:** email or Discord DM when subscribed users/admins want off-site update alerts (beyond the Admin banner).

---

## Hybrid users & account management

Today, users may sign in through an identity provider (e.g. Authentik SSO) or local accounts, but the model is fairly either/or.

**Direction:** Support **hybrid accounts**—someone who normally signs in via SSO could **optionally set a local password** on the same account (and vice versa where it makes sense). That would make fallback login, extension use, and admin workflows easier when the IdP is down or a user prefers credentials for a specific client.

---

## Gated registration & access requests

For instances that want to grow beyond hand-picked invites, a **registration gate** instead of open signup:

1. **Public request form** — applicant submits requested **username**, required fields (e.g. why they want access, how they heard about the station), and any other admin-configured prompts.
2. **One-time token** — on submit, the system issues a **single-use enrollment token** tied to that request (not valid for normal login yet).
3. **Admin queue** — in **Admin settings**, a **request queue**: approve or deny each application.
4. **Outcomes**
   - **Pending** — token is **invalid** for login until a decision is made.
   - **Approved** — applicant signs in with **username + token**; first login **forces password creation**; token is **burned** after use.
   - **Denied** — token is **burned**; no login path remains for that request.

This keeps onboarding controlled without admins manually creating every account, while still avoiding open registration.

---

## How to suggest changes

- **Bug or small fix** — [issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) with repro steps.
- **Feature aligned with this roadmap** — issue referencing this doc (or a PR if you are implementing).
- **New roadmap idea** — issue with the `enhancement` label; it may be folded into this file over time.
