# Roadmap

Ideas under consideration—not commitments, and not in any fixed order. If something here matters to you, [open an issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) or a PR; hearing real use cases helps prioritize.

---

## Completed

✅ ~~**Content policy (baseline)**~~  
Configurable broadcast allowlists for permitted sources and artists, **metadata-based best-effort filtering by default**. The policy engine is a **filtering tool**, not a copyright detector—it applies rules to metadata reported by the browser extension (site, title, artist), not to raw audio. Includes Admin → System configuration, extension mute and handoff behavior, synchronized metadata on the web UI and Discord, and the [Content Policy wiki](./wiki/Content-Policy.md).

✅ ~~**Content policy — licensing & stricter defaults**~~  
**Free Music Archive** as the default allowed source; standard **Creative Commons** license allowlist (CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA, CC BY-ND, CC BY-NC-ND, CC0) with flexible per-kind matching; license safety rails (deny missing/unmatched license by default); FMA track URL and license scraping in the extension; source and license links on now-playing and the live session log; **deny-by-default** fallbacks for missing or unmatched metadata, source, artist, and license; content policy **re-evaluated on DJ switch** to reduce accidental display of blocked track metadata.

✅ ~~**Dynamic stage UI**~~  
Stage dock and mobile stage grid show empty slots matching **Admin → Radio → Max stage users** (1–9). The relay API exposes `stageLimit`; the dock height scales with slot count.

✅ ~~**Admin container update notifications**~~  
Admin → System → Container updates: enable notifications; GHCR tag (`latest` or `develop`) is auto-selected from the running image's baked channel. Banner when a newer build is **published and pullable** on that tag.

✅ ~~**Broadcaster extension — site adapters**~~  
Per-site folders under `backend/broadcaster-extension/sites/` (metadata, license enrichment, media controls) with a thin `content.js` orchestrator; contributor guide in `sites/CONTRIBUTING.md` and [Broadcaster Extension wiki](./wiki/Broadcaster-Extension.md).

✅ ~~**FMA extension support**~~  
Free Music Archive site adapter (metadata + license scraping from track pages, track URL); `freemusicarchive.org` as the default allowed source; source and license links on now-playing and in the live session log.

✅ ~~**Jamendo extension support**~~  
Jamendo site adapter (metadata + license via API, track URL, stage media controls); `jamendo.com` added to default content policy allowlist; docs and About updated.

✅ ~~**Chrome Web Store listing**~~  
[CollabFM Broadcaster](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba) published for easier install and Chrome auto-updates. Go live modal offers **Download ZIP** and **Chrome Web Store** side by side with bundled vs store version comparison.

✅ ~~**Chrome Web Store stage workflow**~~  
[`.github/workflows/stage-chrome-extension.yml`](../.github/workflows/stage-chrome-extension.yml) uploads extension ZIP on `main` when `backend/broadcaster-extension/**` changes (upload only; skips when a version is **PENDING_REVIEW**). **Submit for review manually** in the Developer Dashboard when you are done iterating — intentional, so you control when Chrome review starts.

---

## Planned

⏳ **Hybrid users & account management**  
Support **hybrid accounts**—someone who normally signs in via SSO could **optionally set a local password** on the same account (and vice versa where it makes sense). That would make fallback login, extension use, and admin workflows easier when the IdP is down or a user prefers credentials for a specific client.

⏳ **Gated registration & access requests**  
A **registration gate** instead of open signup: public request form, one-time enrollment token, admin approve/deny queue, approved applicants sign in with username + token and set a password on first login.

⏳ **Off-site container update alerts**  
Email or Discord DM when subscribed users/admins want update alerts beyond the in-app Admin banner.

---

## Container & release workflow

| Channel | GHCR tag | Git branch | Audience |
|---------|----------|------------|----------|
| Stable | `latest` | `main` | Everyone |
| Preview | `develop` / `dev` | `develop` | Operator homelab testing |

Scripts: `./scripts/push-dev.sh`, `./scripts/promote-dev-to-main.sh` (see README [Upgrading](./README.md#preview--dev-channel-homelab)).

---

## Chrome Web Store (operators)

The extension is **live** on the [Chrome Web Store](https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba).

| Step | Automated? |
|------|------------|
| ZIP upload to Developer Dashboard on `main` extension changes | Yes — [stage workflow](../.github/workflows/stage-chrome-extension.yml) |
| Submit for review | **No — manual** (intentional) |
| Public listing after approval | Chrome review (expect delay) |

Bump `manifest.json` before each staged build you want uploaded. Compare server vs store versions in the **Go live** modal. See [Broadcaster Extension — Install & version sync](./wiki/Broadcaster-Extension.md#install--version-sync).

**Extension growth:** community **site adapters** (metadata, license retrieval, stage media controls) are usually backward compatible; older extensions keep working with newer servers but miss new sites until updated.

---

## How to suggest changes

- **Bug or small fix** — [issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) with repro steps.
- **Feature aligned with this roadmap** — issue referencing this doc (or a PR if you are implementing).
- **New roadmap idea** — issue with the `enhancement` label; it may be folded into this file over time.
