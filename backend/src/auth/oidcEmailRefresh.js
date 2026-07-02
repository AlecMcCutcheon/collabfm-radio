import {
  getDb,
  getUserById,
  isLoginEmailAvailable,
  looksLikeLoginEmail,
  normalizeLoginEmail,
  updateUser,
} from "../db/index.js";
import {
  normalizeEmailUsername,
  parseOidcProfileJson,
  resolveEmailFromOidcProfile,
} from "./oidcUser.js";

function deriveAuthentikApiRoot(issuer) {
  try {
    const u = new URL(String(issuer || "").trim());
    return `${u.origin}/api/v3`;
  } catch {
    return null;
  }
}

async function fetchIdpJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchIdpEmailForSubject(oidcConfig, sub) {
  const token = String(oidcConfig?.providerAdminToken || "").trim();
  if (!token || token === "********") {
    return { email: null, source: null, skipped: "no_admin_token" };
  }
  const apiRoot = deriveAuthentikApiRoot(oidcConfig?.issuer);
  if (!apiRoot || !sub) {
    return { email: null, source: null, skipped: "no_api_root_or_sub" };
  }

  const encoded = encodeURIComponent(String(sub));
  const direct = await fetchIdpJson(`${apiRoot}/core/users/${encoded}/`, token);
  if (direct?.email) {
    return { email: normalizeEmailUsername(direct.email), source: "idp_admin_api" };
  }

  const listed = await fetchIdpJson(`${apiRoot}/core/users/?uuid=${encoded}`, token);
  const match = listed?.results?.[0];
  if (match?.email) {
    return { email: normalizeEmailUsername(match.email), source: "idp_admin_api" };
  }

  return { email: null, source: null, skipped: "not_found" };
}

export function resolveStoredOidcEmail(user) {
  const profileEmail = resolveEmailFromOidcProfile(user);
  if (profileEmail) {
    return { email: profileEmail, source: "oidc_profile_json" };
  }
  if (looksLikeLoginEmail(user?.username)) {
    const email = normalizeLoginEmail(user.username);
    if (email) return { email, source: "legacy_username" };
  }
  return { email: null, source: null };
}

export async function refreshOidcLoginEmail(user, oidcConfig, { allowIdpLookup = true } = {}) {
  if (!user || user.auth_source !== "oidc") {
    return { error: "Only SSO-linked accounts support email refresh", status: 400 };
  }

  const current = normalizeLoginEmail(user.login_email);
  let resolved = resolveStoredOidcEmail(user);

  if (!resolved.email && allowIdpLookup) {
    const sub =
      user.oidc_subject || parseOidcProfileJson(user.oidc_profile_json)?.sub || null;
    if (sub) {
      const idp = await fetchIdpEmailForSubject(oidcConfig, sub);
      if (idp.email) {
        resolved = { email: idp.email, source: idp.source };
      }
    }
  }

  if (!resolved.email) {
    const hasSub =
      user.oidc_subject || parseOidcProfileJson(user.oidc_profile_json)?.sub || null;
    return {
      error: hasSub
        ? "No email found in stored profile. Add a provider admin API token on the OIDC tab to fetch from the identity provider, or have the user sign in via SSO once."
        : "No provider subject on file. Have the user sign in via SSO once so CollabFM can link their account.",
      status: 400,
      needsSsoVerification: !hasSub,
      needsIdpAdminToken:
        !!hasSub &&
        !String(oidcConfig?.providerAdminToken || "").trim().replace("********", ""),
    };
  }

  if (current === resolved.email) {
    return {
      user,
      refreshed: false,
      email: resolved.email,
      source: resolved.source,
    };
  }

  const availability = isLoginEmailAvailable(resolved.email, user.id);
  if (!availability.ok) {
    return { error: availability.error, status: 409 };
  }

  const updated = updateUser(user.id, { login_email: availability.email });
  return {
    user: updated,
    refreshed: true,
    email: availability.email,
    source: resolved.source,
  };
}

export async function refreshAllLegacyOidcEmails(oidcConfig) {
  const rows = getDb()
    .prepare(
      `SELECT id FROM users
       WHERE auth_source = 'oidc'
         AND (login_email IS NULL OR trim(login_email) = '')`,
    )
    .all();

  const summary = {
    scanned: rows.length,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    const user = getUserById(row.id);
    if (!user) continue;
    try {
      const result = await refreshOidcLoginEmail(user, oidcConfig);
      if (result.error) {
        summary.failed += 1;
        if (summary.errors.length < 25) {
          summary.errors.push({
            userId: user.id,
            username: user.username,
            error: result.error,
          });
        }
      } else if (result.refreshed) {
        summary.refreshed += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (e) {
      summary.failed += 1;
      if (summary.errors.length < 25) {
        summary.errors.push({
          userId: user.id,
          username: user.username,
          error: String(e?.message || e),
        });
      }
    }
  }

  return summary;
}
