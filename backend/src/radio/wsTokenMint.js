import crypto from "crypto";
import { getWsTokenSecret, persistWsTokenToDb } from "../bridge.js";

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signPayload(payload) {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", getWsTokenSecret()).update(body).digest();
  return { token: `${body}.${base64url(sig)}`, expiresInMs: payload.exp - Date.now() };
}

export function mintWsRelayToken(userId, ttlMs = 90 * 1000, deviceLabel = null) {
  const payload = {
    userId: String(userId),
    aud: "ws-relay",
    jti: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + ttlMs,
  };
  if (typeof deviceLabel === "string" && deviceLabel.trim()) {
    payload.deviceLabel = deviceLabel.trim().slice(0, 64);
  }
  persistWsTokenToDb(payload.jti, Number(payload.userId), payload.exp);
  return signPayload(payload);
}

export function mintGuestBroadcastWsToken(
  guestId,
  guestName,
  shareLinkId,
  ttlMs = 90 * 1000,
  deviceLabel = "Web UI",
) {
  const payload = {
    userId: `guest:${String(guestId)}`,
    aud: "ws-relay",
    jti: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + ttlMs,
    deviceLabel: String(deviceLabel || "Web UI").trim().slice(0, 64) || "Web UI",
    displayName: String(guestName || "Guest").trim().slice(0, 64) || "Guest",
    guestShareId: Number(shareLinkId),
  };
  persistWsTokenToDb(payload.jti, 0, payload.exp);
  return signPayload(payload);
}
