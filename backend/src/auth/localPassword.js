import { hashPassword, verifyPassword } from "./session.js";
import { updateUser } from "../db/index.js";
import { hasPasswordHash } from "./hybridPassword.js";
import { validatePasswordPolicy } from "./passwordPolicy.js";

export async function resetLocalAccountPassword(user, currentPassword, newPassword) {
  if (user.auth_source !== "local") {
    return { error: "Not a local account", status: 400 };
  }
  if (!hasPasswordHash(user)) {
    return { error: "No password set yet", status: 400 };
  }
  if (!String(currentPassword || "").trim()) {
    return { error: "Current password required", status: 400 };
  }
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    return { error: policy.error, status: 400, errors: policy.errors };
  }

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    return { error: "Current password is incorrect", status: 401 };
  }

  const updated = updateUser(user.id, {
    password_hash: await hashPassword(newPassword),
    must_change_password: 0,
    temp_password_encrypted: null,
  });
  return { user: updated };
}
