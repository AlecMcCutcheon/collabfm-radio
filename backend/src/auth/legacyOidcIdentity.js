import {
  getUserById,
  getUserByUsername,
  isLoginEmailAvailable,
  looksLikeLoginEmail,
  normalizeLoginEmail,
  updateUser,
} from "../db/index.js";
import { hasPasswordHash } from "./hybridPassword.js";
import { parseOidcProfileJson, usernameForOidcSubject } from "./oidcUser.js";

function usernamesEquivalent(current, expected) {
  return String(current || "").trim().toLowerCase() === String(expected || "").trim().toLowerCase();
}

export function resolveStoredProviderSub(user) {
  if (user?.oidc_subject) {
    return { sub: String(user.oidc_subject), source: "oidc_subject" };
  }
  const profile = parseOidcProfileJson(user?.oidc_profile_json);
  if (profile?.sub) {
    return { sub: String(profile.sub), source: "oidc_profile_json" };
  }
  return null;
}

export function legacyOidcIdentityStatus(user) {
  if (user?.auth_source !== "oidc" || !hasPasswordHash(user)) {
    return null;
  }

  const stored = resolveStoredProviderSub(user);
  const expectedUsername = stored ? usernameForOidcSubject(stored.sub) : null;
  const matchesExpected = expectedUsername
    ? usernamesEquivalent(user.username, expectedUsername)
    : false;
  const matchesRawSub = stored ? usernamesEquivalent(user.username, stored.sub) : false;
  const needsReconciliation = stored ? !(matchesExpected || matchesRawSub) : true;

  return {
    needsReconciliation,
    providerSub: stored?.sub ?? null,
    providerSubSource: stored?.source ?? null,
    expectedUsername,
    canReconcileFromStored: !!stored,
    verifiedViaIdpAvailable: true,
  };
}

export function reconcileOidcUsername(user, sub, { verifiedViaIdp = false } = {}) {
  if (!user || user.auth_source !== "oidc") {
    return { error: "Only SSO-linked accounts can be reconciled", status: 400 };
  }
  const providerSub = String(sub || "").trim();
  if (!providerSub) {
    return { error: "Provider subject (sub) is required", status: 400 };
  }

  if (user.oidc_subject && user.oidc_subject !== providerSub) {
    return {
      error: verifiedViaIdp
        ? "Provider subject from sign-in does not match the stored SSO link for this account"
        : "Stored provider subject does not match the reconciliation target",
      status: 409,
    };
  }

  const targetUsername = usernameForOidcSubject(providerSub);
  if (usernamesEquivalent(user.username, targetUsername)) {
    return { user, reconciled: false, username: user.username, providerSub };
  }

  const taken = getUserByUsername(targetUsername);
  if (taken && taken.id !== user.id) {
    return {
      error: "The provider UUID username is already used by another account on this station",
      status: 409,
    };
  }

  const fields = { username: targetUsername };
  if (!user.oidc_subject) {
    fields.oidc_subject = providerSub;
  }
  if (!user.login_email && looksLikeLoginEmail(user.username)) {
    const availability = isLoginEmailAvailable(user.username, user.id);
    if (availability.ok) {
      fields.login_email = availability.email;
    }
  } else if (!user.login_email) {
    const profile = parseOidcProfileJson(user.oidc_profile_json);
    const profileEmail = normalizeLoginEmail(profile?.email);
    if (profileEmail) {
      const availability = isLoginEmailAvailable(profileEmail, user.id);
      if (availability.ok) {
        fields.login_email = availability.email;
      }
    }
  }
  if (user.oidc_username_from === "email") {
    fields.oidc_username_from = null;
  }

  try {
    const updated = updateUser(user.id, fields);
    return {
      user: updated,
      reconciled: true,
      username: updated.username,
      providerSub,
      verifiedViaIdp,
    };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE")) {
      return {
        error: "The provider UUID username is already used by another account on this station",
        status: 409,
      };
    }
    throw e;
  }
}

export function maybeReconcileLegacyHybridOnLogin(user, claims) {
  if (!user || user.auth_source !== "oidc" || !hasPasswordHash(user)) {
    return user;
  }
  const status = legacyOidcIdentityStatus(user);
  if (!status?.needsReconciliation) {
    return user;
  }

  const sub = String(claims?.sub || "").trim();
  if (!sub) return user;
  if (user.oidc_subject && user.oidc_subject !== sub) {
    return user;
  }

  const result = reconcileOidcUsername(user, sub, { verifiedViaIdp: true });
  if (result.error) {
    console.warn(
      `[oidc] legacy hybrid username reconcile skipped for user ${user.id}: ${result.error}`,
    );
    return getUserById(user.id);
  }
  if (result.reconciled) {
    console.log(
      `[oidc] reconciled legacy hybrid username for user ${user.id} → ${result.username} (verified via IdP)`,
    );
  }
  return result.user;
}

export function reconcileOidcUsernameFromStoredProfile(user) {
  const stored = resolveStoredProviderSub(user);
  if (!stored) {
    return {
      error:
        "No provider subject on file for this account. Have them sign in via SSO once so CollabFM can read their UUID from the identity provider.",
      status: 400,
      needsSsoVerification: true,
    };
  }
  return reconcileOidcUsername(user, stored.sub, { verifiedViaIdp: false });
}
