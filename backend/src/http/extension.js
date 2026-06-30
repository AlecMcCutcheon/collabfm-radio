import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAppSession } from "../auth/routes.js";
import { canUserBroadcastV2 } from "../bridge.js";
import { buildExtensionZipBuffer } from "./packExtensionZip.js";
import { getExtensionInstallInfo } from "./extensionInfo.js";
import {
  confirmPairRequest,
  listDevicesForUser,
  pollPairRequest,
  revokeDevice,
  startPairRequest,
  ackPairRequest,
  updateDeviceLabel,
  verifyBroadcastDeviceFromRequest,
} from "../db/broadcastDevices.js";
import { mintWsRelayToken, mintGuestBroadcastWsToken } from "../radio/wsTokenMint.js";
import { validateGuestBroadcasterLink } from "../db/shareLinks.js";
import { getPublishedGuestDisplayName, publishGuestDisplayName } from "./guestBroadcast.js";
import { isValidGuestId } from "../security/guestSession.js";
import { applyChromeExtensionCors } from "../security/extensionCors.js";
import { publicDisplayName } from "../db/userProfile.js";
import { touchRegisteredUserRequest } from "../db/userActivity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveExtensionSourceDir() {
  const candidates = [
    path.resolve(__dirname, "../../broadcaster-extension"),
    path.resolve(process.cwd(), "broadcaster-extension"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  }
  return null;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function applyExtensionCors(req, res) {
  applyChromeExtensionCors(req, res);
}

export async function handleExtensionRoutes(req, res, pathname, method) {
  if (!pathname.startsWith("/api/extension")) return false;

  applyExtensionCors(req, res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (
    (pathname === "/api/extension/public/info" || pathname === "/api/extension/info") &&
    method === "GET"
  ) {
    const isPublic = pathname === "/api/extension/public/info";
    if (!isPublic) {
      const session = getAppSession(req);
      if (!session?.user?.id) {
        json(res, 401, { error: "Unauthorized" });
        return true;
      }
      const canBroadcast = await canUserBroadcastV2(session.user.id);
      if (!canBroadcast) {
        json(res, 403, { error: "Forbidden" });
        return true;
      }
    }
    const extDir = resolveExtensionSourceDir();
    try {
      const info = await getExtensionInstallInfo(extDir);
      json(res, 200, info);
    } catch {
      json(res, 500, { error: "Failed to read extension info" });
    }
    return true;
  }

  if (
    (pathname === "/api/extension/public/download" || pathname === "/api/extension/download") &&
    method === "GET"
  ) {
    const isPublic = pathname === "/api/extension/public/download";
    if (!isPublic) {
      const session = getAppSession(req);
      if (!session?.user?.id) {
        json(res, 401, { error: "Unauthorized" });
        return true;
      }
      const canBroadcast = await canUserBroadcastV2(session.user.id);
      if (!canBroadcast) {
        json(res, 403, { error: "Forbidden" });
        return true;
      }
    }
    const extDir = resolveExtensionSourceDir();
    if (!extDir) {
      json(res, 404, { error: "Extension files not found on server" });
      return true;
    }
    try {
      const zipBuffer = await buildExtensionZipBuffer(extDir);
      if (!zipBuffer.length) {
        json(res, 500, { error: "Failed to build extension archive" });
        return true;
      }
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="collabfm-broadcaster-extension.zip"',
        "Content-Length": zipBuffer.length,
      });
      res.end(zipBuffer);
    } catch {
      json(res, 500, { error: "Failed to build extension archive" });
    }
    return true;
  }

  if (pathname === "/api/extension/pair/start" && method === "POST") {
    try {
      const body = await readBody(req);
      const result = startPairRequest(body.deviceId || null);
      json(res, 200, result);
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/extension/pair/poll" && method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const deviceId = url.searchParams.get("deviceId");
    if (!deviceId) {
      json(res, 400, { error: "deviceId required" });
      return true;
    }
    json(res, 200, pollPairRequest(deviceId));
    return true;
  }

  if (pathname === "/api/extension/pair/validate" && method === "GET") {
    const device = verifyBroadcastDeviceFromRequest(req);
    if (!device) {
      json(res, 200, { valid: false });
      return true;
    }
    const canBroadcast = await canUserBroadcastV2(device.userId);
    if (!canBroadcast) {
      json(res, 200, { valid: false });
      return true;
    }
    const { getUserById } = await import("../db/index.js");
    const user = getUserById(Number(device.userId));
    touchRegisteredUserRequest(device.userId, req);
    json(res, 200, {
      valid: true,
      username: user?.username ?? null,
      displayName: publicDisplayName(user),
      label: device.label || "Browser extension",
    });
    return true;
  }

  if (pathname === "/api/extension/pair/ack" && method === "POST") {
    try {
      const body = await readBody(req);
      const deviceId = String(body.deviceId || "").trim();
      if (!deviceId) {
        json(res, 400, { error: "deviceId required" });
        return true;
      }
      ackPairRequest(deviceId);
      json(res, 200, { ok: true });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/extension/pair/confirm" && method === "POST") {
    const session = getAppSession(req);
    if (!session?.user?.id) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const canBroadcast = await canUserBroadcastV2(session.user.id);
    if (!canBroadcast) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    try {
      const body = await readBody(req);
      const userCode = String(body.userCode || "").trim();
      const label = String(body.label || "Browser extension").trim().slice(0, 64) || "Browser extension";
      if (!userCode) {
        json(res, 400, { error: "userCode required" });
        return true;
      }
      const result = confirmPairRequest(userCode, Number(session.user.id), label);
      if (result.error === "invalid_code") {
        json(res, 404, { error: "Invalid pairing code" });
        return true;
      }
      if (result.error === "expired") {
        json(res, 410, { error: "Pairing code expired" });
        return true;
      }
      if (result.error === "already_paired") {
        json(res, 409, { error: "Already paired" });
        return true;
      }
      json(res, 200, { ok: true, deviceId: result.deviceId, label });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/extension/ws-token" && (method === "POST" || method === "GET")) {
    const device = verifyBroadcastDeviceFromRequest(req);
    if (!device) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const canBroadcast = await canUserBroadcastV2(device.userId);
    if (!canBroadcast) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    const label = device.label || "Browser extension";
    touchRegisteredUserRequest(device.userId, req);
    json(res, 200, {
      ...mintWsRelayToken(device.userId, 90 * 1000, label),
      label,
    });
    return true;
  }

  if (pathname === "/api/extension/guest/validate" && method === "POST") {
    try {
      const body = await readBody(req);
      const raw = String(body.shareToken || body.shareLink || "").trim();
      const tokenMatch = raw.match(/\/listen\/([^/?#]+)/);
      const shareToken = tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : raw.split(/[?#]/)[0];
      if (!shareToken) {
        json(res, 400, { error: "Share link or token required" });
        return true;
      }
      const link = validateGuestBroadcasterLink(shareToken);
      if (!link) {
        json(res, 403, { error: "Not a valid guest broadcaster link" });
        return true;
      }
      const guestId = String(body.guestId || "").trim();
      const guestDisplayName =
        guestId && isValidGuestId(guestId)
          ? getPublishedGuestDisplayName(link.id, guestId)
          : null;
      json(res, 200, {
        valid: true,
        label: link.label,
        expiresAt: link.expires_at,
        guestDisplayName,
      });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/extension/guest/ws-token" && method === "POST") {
    try {
      const body = await readBody(req);
      const shareToken = String(body.shareToken || "").trim();
      const guestId = String(body.guestId || "").trim();
      const guestName = String(body.guestName || "").trim().replace(/\s+/g, "").slice(0, 32);
      if (!shareToken || !guestId || !guestName) {
        json(res, 400, { error: "shareToken, guestId, and guestName required" });
        return true;
      }
      const link = validateGuestBroadcasterLink(shareToken);
      if (!link) {
        json(res, 403, { error: "Invalid or expired guest broadcaster link" });
        return true;
      }
      publishGuestDisplayName(link.id, guestId, guestName);
      const label = "Browser extension";
      json(res, 200, {
        ...mintGuestBroadcastWsToken(guestId, guestName, link.id, 90 * 1000, label),
        label,
      });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/extension/devices" && method === "GET") {
    const session = getAppSession(req);
    if (!session?.user?.id) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const devices = listDevicesForUser(Number(session.user.id)).map((d) => ({
      id: d.id,
      label: d.label,
      tokenPrefix: d.token_prefix,
      createdAt: d.created_at,
      lastUsedAt: d.last_used_at,
    }));
    json(res, 200, { devices });
    return true;
  }

  const revokeMatch = pathname.match(/^\/api\/extension\/devices\/(\d+)$/);
  if (revokeMatch && method === "DELETE") {
    const session = getAppSession(req);
    if (!session?.user?.id) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    const ok = revokeDevice(Number(revokeMatch[1]), Number(session.user.id));
    if (!ok) {
      json(res, 404, { error: "Not found" });
      return true;
    }
    json(res, 200, { ok: true });
    return true;
  }

  const deviceMatch = pathname.match(/^\/api\/extension\/devices\/(\d+)$/);
  if (deviceMatch && method === "PATCH") {
    const session = getAppSession(req);
    if (!session?.user?.id) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      const body = await readBody(req);
      const label = String(body.label || "").trim();
      if (!label) {
        json(res, 400, { error: "label required" });
        return true;
      }
      const ok = updateDeviceLabel(Number(deviceMatch[1]), Number(session.user.id), label);
      if (!ok) {
        json(res, 404, { error: "Not found" });
        return true;
      }
      json(res, 200, { ok: true, label: label.slice(0, 64) });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  return false;
}
