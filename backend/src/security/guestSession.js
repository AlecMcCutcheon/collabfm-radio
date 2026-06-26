import crypto from "crypto";
import { getSetting, setSetting } from "../db/index.js";

const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  let secret = getSetting("wsTokenSecret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    setSetting("wsTokenSecret", secret);
  }
  return secret;
}

export function isValidGuestId(raw) {
  const t = String(raw || "").trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t) ||
    /^g-\d+-[a-z0-9]+$/i.test(t)
  );
}

function sign(body) {
  return crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function mintGuestSession(shareToken, guestId) {
  const payload = {
    st: String(shareToken),
    gid: String(guestId),
    exp: Date.now() + GUEST_SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyGuestSession(token, shareToken, guestId) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig || sig !== sign(body)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.st !== String(shareToken)) return false;
    if (payload.gid !== String(guestId)) return false;
    if (!payload.exp || Number(payload.exp) < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
