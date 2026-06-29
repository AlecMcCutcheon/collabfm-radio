# Content policy

CollabFM **does not host, store, or provide any audio content.** It relays streams that broadcasters supply from their own sources. CollabFM provides a configurable content policy to help server operators and broadcasters manage what audio may be relayed through their station. New installations ship with conservative default rules intended to **mitigate accidental misuse** and encourage responsible streaming practices.

The policy engine evaluates metadata provided by the browser extension or submitted through the CollabFM API. Source and artist rules are checked in order, and the first matching rule determines the outcome. When a source or artist rule **allows** a track, license metadata may be required depending on your safety rail settings. Configurable fallback actions apply when metadata is missing or no rule matches.

**The policy engine is a filtering tool, not a copyright detector.** It **attempts best-effort filtering** using your configured allowlists and fallbacks on reported source, track, and license metadata. It does not analyze audio, fingerprint tracks, verify licenses, or determine whether content is legally cleared to stream.

CollabFM does not verify copyright ownership, licensing status, or legal compliance. Server administrators and individual broadcasters are solely responsible for ensuring they have the necessary rights, licenses, or permissions to stream any audio through their CollabFM instance.

These controls are intended to promote responsible use and help reduce accidental policy violations. They are not a substitute for understanding and complying with applicable copyright, licensing, or other legal requirements. CollabFM does not condone intentional misuse or deliberate circumvention of this policy.

For the reasoning behind conservative defaults—not legal guarantees, but why the project ships locked down and what that does and does not try to solve—see [Why the defaults are strict](../WHY.md).

---

## Outcomes

| Outcome | Listener experience |
|---------|---------------------|
| **Allow** | Normal now-playing metadata and audio |
| **Deny** | Stream audio is muted; now-playing shows a policy notice |
| **Warn** | Logged server-side; broadcast continues (if configured) |

Decisions are logged on the server for admin review.

---

## Default settings (new installs)

| Type | Default |
|------|---------|
| **Allowed sources** | `freemusicarchive.org`, `jamendo.com` |
| **Allowed artists** | *(none)* |
| **Allowed licenses** | CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA, CC BY-ND, CC BY-NC-ND, CC0 (one line per kind; flexible CC spelling and URLs) |
| **Missing metadata** | Deny |
| **Missing license** | Deny |
| **Unmatched license** | Deny |
| **Unmatched source / artist** | Deny |

Upgraded instances keep their saved policy until an admin resets defaults. Legacy policies without license fields do not enforce license rules until license safety rails are configured.

**Why Free Music Archive and Jamendo by default?** CollabFM can report Creative Commons license metadata and link listeners to the specific track URL on [Free Music Archive (CC search)](https://freemusicarchive.org/search?adv=1&music-filter-CC-attribution-only=true&music-filter-CC-attribution-sharealike=1&music-filter-CC-attribution-noderivatives=1&music-filter-CC-attribution-noncommercial=1&music-filter-CC-attribution-noncommercial-sharealike=true&music-filter-CC-attribution-noncommercial-noderivatives=true) and [Jamendo](https://www.jamendo.com/explore). **They are default allowed sources because the extension can read machine-readable license metadata there—not because every track is guaranteed legally safe to stream.** CC works can still require attribution, impose share-alike obligations, or carry platform-specific restrictions; metadata can be wrong or incomplete. FMA offers a browsable CC-filtered search; Jamendo reads each track’s license when you play. Pick tracks that match your license allowlist and verify compliance for your station. Default allowed licenses are the standard CC suite appropriate for non-commercial community radio—matching CollabFM’s own [CC BY-NC 4.0](https://github.com/AlecMcCutcheon/collabfm-radio/blob/main/LICENSE) software license. You only need one line per license kind in the allowlist; the matcher normalizes spacing, dashes, and `creativecommons.org` URLs.

Other tab sources do not report license metadata in a verifiable way—the extension can still capture audio from many sites, but admins must add those hostnames to the allowlist manually if they choose to permit them.

---

## Admin configuration

**Admin → System → Content policy**

| Area | Purpose |
|------|---------|
| **Enable enforcement** | When off, policy filtering is disabled and broadcasts are allowed regardless of rules |
| **Safety rails** | Global fallbacks and the enable toggle are locked until an admin confirms responsibility |
| **When metadata is missing** | Action if the extension cannot report usable artist/title |
| **When artist does not match** | Action if artist is not on the allowlist |
| **When source does not match** | Action if the tab hostname is not on the allowlist |
| **When license is missing** | Action if no license type/URL is reported for an allowed track |
| **When license is not allowed** | Action if license metadata does not match the allowlist |
| **Allowed licenses** | One line per CC kind (flexible spelling/URLs) or custom substring against license type and URL |
| **Source allowlist** | Hostnames (e.g. `freemusicarchive.org`, `jamendo.com`) |
| **Artist allowlist** | Names and optional alternate names |

**Save content policy** applies changes immediately for new metadata and capability updates.

**Reset to defaults** restores the conservative starter policy.

---

## Broadcaster behavior

- The extension reports the active tab **site**, **track metadata**, and **license metadata** (when available) to the server.
- On [Free Music Archive](https://freemusicarchive.org/search?adv=1&music-filter-CC-attribution-only=true&music-filter-CC-attribution-sharealike=1&music-filter-CC-attribution-noderivatives=1&music-filter-CC-attribution-noncommercial=1&music-filter-CC-attribution-noncommercial-sharealike=true&music-filter-CC-attribution-noncommercial-noderivatives=true) and [Jamendo](https://www.jamendo.com/explore), the extension enriches metadata with the track page URL and Creative Commons license link after the player updates. Now-playing and session log show source and license links when metadata is available.
- If the source is unknown while metadata arrives, the server may **hold** now-playing updates until the source is known—intended to reduce accidental display of blocked track titles on the website or Discord.
- When the live DJ is **switched** on stage, content policy is re-evaluated for the new broadcaster—intended to reduce accidental display of blocked track metadata on now-playing and in the session log.
- If license metadata is still loading on FMA or Jamendo, the server may **defer** a license-missing deny until enrichment completes.
- When a source is **denied**, relay audio is muted and listeners see the policy notice until an allowed source is used.

Broadcast only content you have the right to share. CollabFM is intended for **private or invited audiences**—friends, community servers, homelab listeners—not as a public commercial broadcast service.

---

## Related

- [Admin Panel](./Admin-Panel.md) — System tab overview
- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — extension pairing and go-live
- [Broadcaster Extension](./Broadcaster-Extension.md) — site adapters and where license metadata is scraped
- [Why the defaults are strict](../WHY.md) — design rationale (not legal advice)
- [Main README — Legal & responsible use](https://github.com/AlecMcCutcheon/collabfm-radio#legal--responsible-use)
