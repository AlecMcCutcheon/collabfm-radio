# Roadmap

Ideas under consideration—not commitments, and not in any fixed order. If something here matters to you, [open an issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) or a PR; hearing real use cases helps prioritize.

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

## Dynamic stage layout

**Stage slot count in the UI** should reflect the configured **max stage users** setting. Today, changing the limit in admin does not resize the stage grid/slots in the interface—only the backend cap changes. Aligning the visual stage with the configured capacity is a planned polish item.

---

## How to suggest changes

- **Bug or small fix** — [issue](https://github.com/AlecMcCutcheon/collabfm-radio/issues) with repro steps.
- **Feature aligned with this roadmap** — issue referencing this doc (or a PR if you are implementing).
- **New roadmap idea** — issue with the `enhancement` label; it may be folded into this file over time.
