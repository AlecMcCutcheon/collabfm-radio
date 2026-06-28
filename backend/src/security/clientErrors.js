const SAFE_CLIENT_ERRORS = new Set([
  "Username taken",
  "Invalid request",
  "Upload failed",
  "Invalid role",
  "Not found",
  "You cannot remove your own admin role",
  "Cannot set password for OIDC users",
  "Password must be at least 8 characters",
  "Cannot delete yourself",
  "Cannot delete the last admin account",
  "Missing fields",
  "guild_id required",
  "Configure Application ID and bot token first",
  "Verify credentials before starting the voice bot",
  "Credentials changed since last verification — verify again",
  "Image data required",
]);

/**
 * Map caught errors to a safe client-facing message (no stack traces or internal details).
 */
export function clientErrorMessage(error, fallback = "Invalid request") {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (message && SAFE_CLIENT_ERRORS.has(message)) return message;
  if (message.includes("UNIQUE")) return "Username taken";
  return fallback;
}
