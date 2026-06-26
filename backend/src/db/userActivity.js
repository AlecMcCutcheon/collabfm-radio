import { updateUser } from "./index.js";
import { clientIp } from "../security/rateLimit.js";

const VISIT_TOUCH_INTERVAL_MS = 60_000;

/** @type {Map<string, { at: number, ip: string }>} */
const visitTouchCache = new Map();

export function isRegisteredUserId(userId) {
  const id = String(userId || "");
  if (!id || id.startsWith("guest:")) return false;
  const n = Number(id);
  return Number.isFinite(n) && n > 0;
}

export function touchUserVisit(userId, ip, { force = false } = {}) {
  if (!isRegisteredUserId(userId)) return;

  const uid = Number(userId);
  const ipStr = String(ip || "unknown").trim().slice(0, 64) || "unknown";
  const key = String(uid);
  const now = Date.now();
  const prev = visitTouchCache.get(key);

  if (!force && prev && prev.ip === ipStr && now - prev.at < VISIT_TOUCH_INTERVAL_MS) {
    return;
  }

  visitTouchCache.set(key, { at: now, ip: ipStr });
  updateUser(uid, {
    last_login: new Date(now).toISOString(),
    last_login_ip: ipStr,
  });
}

export function touchRegisteredUserRequest(userId, req, options = {}) {
  touchUserVisit(userId, clientIp(req), options);
}
