const SAFE_CLIENT_ERRORS = new Set([
  "Username taken",
  "Invalid request",
  "Upload failed",
  "Invalid role",
  "Not found",
  "Admin required",
  "Unauthorized",
  "Username and password required",
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
  "Could not verify Discord credentials",
  "Application ID and bot token are required",
  "Application ID must be a numeric Discord snowflake",
  "Invalid bot token — Discord rejected authentication",
  "Token is valid but does not belong to a bot account",
  "Bot token works but could not read application info — check token scopes",
  "Application ID does not match the bot token's application",
  "Could not reach Discord",
  "Discord API error",
  "Voice bot request failed",
  "Update check failed",
  "Voice bot runs as a separate Docker service (collabfm-voice). Restart it with: docker compose restart collabfm-voice",
  "Voice bot runs as a separate Docker service. Stop it with: docker compose stop collabfm-voice",
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

/**
 * Admin API error response — message must be a known safe string (never raw Error.message).
 */
export function writeAdminJsonError(res, statusCode, message) {
  const safe = SAFE_CLIENT_ERRORS.has(message) ? message : "Invalid request";
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: safe }));
}

/**
 * Admin API error object with optional ok flag (voice-bot routes).
 */
export function writeAdminJsonFailure(res, statusCode, message, extra = {}) {
  const safe = SAFE_CLIENT_ERRORS.has(message) ? message : "Invalid request";
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, ...extra, error: safe }));
}

/**
 * Pick a safe error string from a voice-bot helper result (verify/start/stop).
 */
export function voiceBotClientError(result, fallback = "Voice bot request failed") {
  const candidate = typeof result?.error === "string" ? result.error.trim() : "";
  if (candidate && SAFE_CLIENT_ERRORS.has(candidate)) return candidate;
  return fallback;
}
