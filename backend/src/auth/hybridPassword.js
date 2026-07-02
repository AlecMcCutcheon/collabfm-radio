import { hashPassword } from "./session.js";
import { updateUser } from "../db/index.js";
import { isLoginEmailAvailable } from "../db/index.js";
import {
  normalizeOidcConfig,
  resolveEmailFromOidcProfile,
} from "./oidcUser.js";
import { getSetting } from "../db/index.js";

export function hasPasswordHash(user) {
  return !!(user?.password_hash && String(user.password_hash).trim());
}

export function assignHybridLoginEmail(user, email) {
  const availability = isLoginEmailAvailable(email, user.id);
  if (!availability.ok) {
    return { error: availability.error, status: availability.error.includes("valid") ? 400 : 409 };
  }
  const current = String(user.login_email || "").trim().toLowerCase();
  if (current === availability.email) {
    return { email: availability.email, assigned: false };
  }
  return { email: availability.email, assigned: true };
}

/**
 * Set or reset a hybrid OIDC user's local password.
 * When requireEmailOnFile is true, SSO email must be on file (first-time set).
 * Sets login_email from SSO profile; username is never changed.
 */
export async function applyHybridOidcPassword(
  user,
  password,
  { requireEmailOnFile = false } = {},
) {
  const oidc = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
  if (oidc.hybridUsersEnabled !== true) {
    return { error: "Hybrid accounts are disabled", status: 403 };
  }
  if (user.auth_source !== "oidc" || !user.oidc_subject) {
    return { error: "Password can only be set on SSO-linked accounts", status: 400 };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }

  const email = resolveEmailFromOidcProfile(user);
  if (requireEmailOnFile && !email) {
    return {
      error:
        "No SSO email on file for this account. Have them sign in via SSO once (or use Studio verify), then set the password again.",
      status: 400,
    };
  }

  const fields = {
    password_hash: await hashPassword(password),
  };
  let loginEmailAssigned = false;

  if (email) {
    const assignment = assignHybridLoginEmail(user, email);
    if (assignment.error) {
      return { error: assignment.error, status: assignment.status };
    }
    if (assignment.assigned) {
      fields.login_email = assignment.email;
      loginEmailAssigned = true;
    }
  }

  try {
    const updated = updateUser(user.id, fields);
    return {
      user: updated,
      loginEmailAssigned,
      loginEmail: updated.login_email || email || null,
    };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE")) {
      return { error: "That email is already used for local sign-in on this station", status: 409 };
    }
    throw e;
  }
}
