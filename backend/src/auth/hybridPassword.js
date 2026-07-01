import { hashPassword } from "./session.js";
import { getUserByUsername, updateUser } from "../db/index.js";
import {
  normalizeEmailUsername,
  normalizeOidcConfig,
  resolveEmailFromOidcProfile,
} from "./oidcUser.js";
import { getSetting } from "../db/index.js";

export function hasPasswordHash(user) {
  return !!(user?.password_hash && String(user.password_hash).trim());
}

export function migrateUsernameToEmail(user, email) {
  const normalized = normalizeEmailUsername(email);
  if (!normalized) {
    return {
      error:
        "No SSO email on file for this account. Have them sign in via SSO once (or use Studio verify), then set the password again.",
      status: 400,
    };
  }
  if (user.username.toLowerCase() === normalized.toLowerCase()) {
    return { username: user.username, email: normalized, migrated: false };
  }
  const taken = getUserByUsername(normalized);
  if (taken && taken.id !== user.id) {
    return { error: "That email is already used as a username on this station", status: 409 };
  }
  return { username: normalized, email: normalized, migrated: true };
}

/**
 * Set or reset a hybrid OIDC user's local password.
 * When requireEmailMigration is true, email must be on file (first-time set).
 * When migrateIfNeeded is true, username moves to email whenever profile has one and differs.
 */
export async function applyHybridOidcPassword(
  user,
  password,
  { requireEmailMigration = false, migrateIfNeeded = false } = {},
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

  const fields = {
    password_hash: await hashPassword(password),
  };
  let migrated = false;

  const email = resolveEmailFromOidcProfile(user);
  const shouldMigrate =
    requireEmailMigration ||
    (migrateIfNeeded &&
      !!email &&
      user.username.toLowerCase() !== email.toLowerCase());

  if (shouldMigrate) {
    const migration = migrateUsernameToEmail(user, email);
    if (migration.error) {
      return { error: migration.error, status: migration.status };
    }
    fields.username = migration.username;
    fields.oidc_username_from = "email";
    migrated = migration.migrated === true;
  }

  try {
    const updated = updateUser(user.id, fields);
    return { user: updated, migrated, username: updated.username };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE")) {
      return { error: "That email is already used as a username on this station", status: 409 };
    }
    throw e;
  }
}
