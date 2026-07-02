# Account Security, Studio & Sign-In

How signed-in users manage their profile, passwords, two-factor authentication, and share links.

---

## Listener Studio vs Broadcaster Studio

Every logged-in user opens **Studio** from the profile icon (desktop) or bottom nav **Studio** tab (mobile).

| | **Listener Studio** | **Broadcaster Studio** |
|---|---------------------|------------------------|
| **Who** | Listener role | Broadcaster or Admin |
| **Profile** | Nickname, avatar, bio, genres | Same |
| **Share links** | Guest-listener links only | Guest listener + guest broadcaster links |
| **Account security** | Password, 2FA (when applicable) | Same |
| **Party favorites** | If enabled for your account | Same |
| **Extension pairing** | — | Pair browser extension devices |
| **Go live** | — | Web UI or extension (from main radio screen) |

---

## Gated registration

When an admin enables **gated registration** (Admin → Users):

1. The login page shows **Request access** instead of open signup.
2. Applicants submit name/handle, email, and any custom application questions.
3. Admins review the **Request queue**, approve or deny, and share the one-time enrollment token.
4. Approved applicants open the activation link, choose a **username** and **password**, and sign in locally (username or email + password).

Admins can edit the public form under **Registration form** and toggle the gate on the Users tab.

---

## Hybrid accounts (SSO + local password)

When an admin enables **Allow hybrid accounts (SSO + local password)** under **Admin → OIDC / SSO**:

1. Users who signed in with SSO can open **Studio → Account security**.
2. **Set password** — adds a local password so they can sign in with either SSO or email/password.
3. On first set, **`login_email`** is stored from the SSO profile so local login uses their email; the internal username stays the provider subject.
4. If the IdP profile has no email yet, Studio prompts an **OIDC verify** step before setting a password.
5. **Reset password** — change an existing hybrid local password (SSO login still works; no current password required).

When hybrid accounts are **disabled**, hybrid users who already have a password keep working; new password setup is hidden.

---

## Local account password (Studio)

Users who sign in with **username and password** (registration-activated or admin-created accounts) can open **Studio → Account security** and click **Reset password**. They must enter their **current password** plus the new password twice. This is self-service only — admins can still reset any account from **Admin → Users** without the current password.

---

## Two-factor authentication (2FA)

2FA applies to **local username/password login only**. SSO sign-in is not affected.

### For users (Studio)

Open **Studio → Account security**:

- **Enable 2FA** — scan the QR code in an authenticator app (Google Authenticator, Authy, etc.), confirm with a 6-digit code, save **backup codes**.
- **Disable 2FA** — only if station policy allows it.
- **New backup codes** — regenerate after confirming with your authenticator.

### Login with 2FA enabled

1. Enter username and password.
2. Enter a 6-digit code from your app, or a **single** backup code (each works once).

### When the station requires 2FA

If an admin turns on **Require 2FA for local login** (Admin → **Security**):

- **Listeners and broadcasters** with a password must complete 2FA setup before getting a full session.
- **Admins** see a prompt at login and can **set up now** or **skip for now**; they can enroll later in Studio.

Pending setup does not grant full station access until 2FA is finished (or an admin skips at login).

Refreshing the login page or choosing **Back to login** clears a pending setup session.

### Anti-lockout

| Situation | What to do |
|-----------|------------|
| Lost phone / authenticator | Use a **backup code** once, then set up 2FA again in Studio |
| No backup codes | Admin → Users → **Reset 2FA** on your account |
| Only admin locked out | Console **recovery login** (`admin` + recovery token) — bypasses 2FA |

### Branded authenticator label

Admins can enable **Branded 2FA in authenticator apps** under **Admin → System → Branding**. New enrollments show your **radio display name** instead of “CollabFM”. Existing app entries keep their old label until re-enrolled.

---

## Share links (Studio)

Signed-in users create links under **Studio → Share links** (up to **3** active links per user). Each link includes a guest web player URL and a direct stream URL.

### Guest types

| Type | What guests get |
|------|-----------------|
| **Guest listener** | `/listen/{token}` — player, chat, stage |
| **Guest broadcaster** | Same + go-live via web UI or extension (broadcaster/admin creators only) |

### Expiry options (by creator role)

**Guest listener links**

| Creator role | Expires after |
|--------------|---------------|
| Listener | 24 hours, 3 days, 7 days |
| Broadcaster | Never, 24 hours, 3 days, 7 days, 30 days |
| Admin | Never, 24 hours, 3 days, 7 days, 30 days, 1 year |

**Guest broadcaster links** (no “Never”)

| Creator role | Expires after |
|--------------|---------------|
| Broadcaster | 1 hour, 6 hours, 24 hours |
| Admin | 1 hour, 6 hours, 24 hours, 3 days, 7 days |

Expired links are removed automatically. Admins can see all site links under **Admin → Share links**.

---

## Related guides

- [Navigating the UI](./Navigating-the-UI.md) — where Studio and login live
- [Authentik SSO Setup](./Authentik-SSO-Setup.md) — OIDC and hybrid accounts
- [Admin Panel](./Admin-Panel.md) — Security tab, user reset 2FA, OIDC hybrid toggle
- [Broadcasting & Stage](./Broadcasting-and-Stage.md) — guest broadcaster links, extension pairing
