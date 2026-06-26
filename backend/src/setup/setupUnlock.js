import crypto from "crypto";

const SETUP_UNLOCK_COOKIE = "radio_setup_unlock";
const UNLOCK_TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, number>} */
const activeUnlocks = new Map();

function isSecureRequest(req) {
  if (req?.headers?.["x-forwarded-proto"] === "https") return true;
  return false;
}

export function createSetupUnlockToken() {
  const token = crypto.randomBytes(32).toString("hex");
  activeUnlocks.set(token, Date.now() + UNLOCK_TTL_MS);
  return token;
}

export function revokeSetupUnlockToken(token) {
  if (token) activeUnlocks.delete(token);
}

export function clearAllSetupUnlocks() {
  activeUnlocks.clear();
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export function hasSetupUnlock(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  const token = cookies[SETUP_UNLOCK_COOKIE];
  if (!token) return false;
  const exp = activeUnlocks.get(token);
  if (!exp || exp < Date.now()) {
    activeUnlocks.delete(token);
    return false;
  }
  return true;
}

export function setSetupUnlockCookie(req, res, token) {
  const secure = isSecureRequest(req);
  const parts = [
    `${SETUP_UNLOCK_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(UNLOCK_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSetupUnlockCookie(req, res) {
  const secure = isSecureRequest(req);
  const parts = [`${SETUP_UNLOCK_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function getSetupUnlockTokenFromRequest(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  return cookies[SETUP_UNLOCK_COOKIE] || null;
}
