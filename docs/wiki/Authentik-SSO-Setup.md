# Authentik SSO Setup

CollabFM supports **OpenID Connect (OIDC)** login. This guide uses [Authentik](https://goauthentik.io/); other OIDC providers use the same CollabFM fields with different issuer URLs.

**Callback URL CollabFM expects:**

```
https://radio.example.com/auth/oidc/callback
```

Replace `radio.example.com` with your public station host. For local testing only, use your LAN URL — production should use HTTPS behind a reverse proxy.

---

## 1. Create an OAuth2 provider in Authentik

1. Log in to Authentik as an administrator.
2. Go to **Applications → Applications**.
3. Click **Create with Provider** (or **New application** wizard).
4. **Application name:** e.g. `CollabFM Radio`.
5. **Provider type:** **OAuth2/OpenID Provider**.
6. Click **Next** through the wizard.

### Provider settings

| Setting | Value |
|---------|--------|
| **Authorization flow** | Default provider authorization flow (or your standard login flow) |
| **Client type** | **Confidential** (CollabFM stores a client secret) |
| **Redirect URIs** | `https://radio.example.com/auth/oidc/callback` |

**Authentik 2026.5+:** Add redirect URI as type **Strict** / **Authorization** (exact match).

**Older Authentik:** Add the callback URL as a single strict redirect URI.

Optional for logout:

- **Post Logout Redirect URI** or end-session URL — use Authentik’s application end-session URL in CollabFM’s **Logout URL** field later.

### Scopes

Ensure users receive a **groups** claim if you use role mapping:

- Include scope **`groups`** (or your Authentik groups scope mapping).
- Default CollabFM scopes: `openid profile email groups`.

In Authentik, add a **Scope mapping** for `groups` if it is not already included in your provider.

7. Click **Submit** to create the application and provider.

---

## 2. Copy values from Authentik

Open the new **Provider** (or application → provider link):

| Authentik | CollabFM Admin field |
|-----------|----------------------|
| **Client ID** | **Client ID** |
| **Client Secret** | **Client Secret** |
| **Issuer** or application slug URL | **Issuer URL** |

**Issuer URL format** (typical):

```
https://auth.example.com/application/o/collabfm-radio/
```

Trailing slash is fine. CollabFM fetches `/.well-known/openid-configuration` from this issuer.

**Logout URL** (optional, for full SSO sign-out):

```
https://auth.example.com/application/o/collabfm-radio/end-session/
```

Copy from Authentik’s provider or application documentation page.

---

## 3. Configure CollabFM

1. Open **Admin settings** (chat → gear → **Admin settings**).
2. Go to **OIDC / SSO** tab.
3. Enable **Enable OIDC login**.
4. Confirm the displayed **Callback URL** matches what you entered in Authentik.
5. Fill in:
   - **Issuer URL**
   - **Client ID**
   - **Client Secret**
   - **Scopes:** `openid profile email groups` (adjust if your IdP uses different group scope)
   - **Groups claim name:** `groups` (unless your JWT uses another field)
   - **Logout URL** — Authentik end-session URL (recommended)
   - **SSO button nickname** — e.g. `Authentik` (shown as “Login With Authentik”)
6. **Radio username from** — usually `preferred_username` or `sub`.
7. Optional: **Link to existing local account on name match** — links SSO to an existing local user with the same username on first login.

### Group → role mapping

Map Authentik groups to CollabFM roles:

| OIDC group name | Radio role |
|-----------------|------------|
| `radio-admins` | Admin |
| `radio-djs` | Broadcaster |
| (default) | Listener |

1. Enter exact group string from Authentik.
2. Choose **Radio role**.
3. Click **Add mapping**.

8. Click **Save OIDC settings**.

### Hybrid accounts (SSO + local password)

Enable **Allow hybrid accounts (SSO + local password)** on the same tab when you want SSO users to optionally add a local password in **Studio → Account security** (sign in with either method). On first password set, CollabFM may migrate the stored username to the user’s SSO email.

Disable this if you want SSO-only access with no self-service password setup. Existing hybrid passwords keep working.

See [Account Security & Studio](./Account-Security-and-Studio.md) for the full hybrid and 2FA flows.

---

## 4. Test login

1. Log out of CollabFM (or use a private window).
2. On the login page, click **Login With {nickname}**.
3. Complete Authentik login.
4. You should return to CollabFM logged in.

If login fails with `oidc_config` or similar, check container logs and verify issuer URL, client ID/secret, and redirect URI match exactly.

---

## 5. Authentik bindings (who can log in)

In Authentik **Applications → CollabFM Radio → Bindings**:

- Restrict which users/groups may use the application.
- Users not bound to the app cannot complete SSO.

---

## Other OIDC providers

CollabFM uses standard OIDC discovery. For Keycloak, Google Workspace OIDC, etc.:

- Register redirect URI: `https://your-radio-host/auth/oidc/callback`
- Use the provider’s issuer URL and client credentials in **Admin → OIDC / SSO**
- Map groups claim to roles the same way

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| Redirect mismatch | Callback URL in IdP matches CollabFM exactly (scheme, host, path) |
| No groups / wrong role | Groups scope issued; **Groups claim name** matches JWT |
| Login works, wrong username | **Radio username from** setting |
| Logout still logged into IdP | **Logout URL** set to provider end-session endpoint |
| `Origin not allowed` | **Admin → System** branding / allowed origins include your public URL |
