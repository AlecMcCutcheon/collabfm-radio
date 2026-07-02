import { hashPassword, verifyPassword } from "./session.js";
import { updateUser } from "../db/index.js";
import { hasPasswordHash } from "./hybridPassword.js";

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
  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    return { error: "Current password is incorrect", status: 401 };
  }

  const updated = updateUser(user.id, {
    password_hash: await hashPassword(newPassword),
  });
  return { user: updated };
}
