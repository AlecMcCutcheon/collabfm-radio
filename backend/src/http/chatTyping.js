import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { hasSessionOrShareToken } from "../security/access.js";
import {
  clearChatTyping,
  touchChatTyping,
} from "../chat/chatTypingStore.js";
import {
  listEnrichedChatTypers,
  publishChatTypingRoster,
} from "../chat/chatTypingPublish.js";
import { resolvePresenceActor } from "./presence.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function handleChatTypingRoutes(req, res, pathname, method, getAppSession) {
  if (pathname !== "/api/chat/typing") return false;

  if (method === "GET") {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    json(res, 200, { typers: listEnrichedChatTypers() });
    return true;
  }

  if (method === "POST") {
    try {
      const body = await readBody(req);
      const resolved = resolvePresenceActor(req, body, getAppSession);
      if (resolved.error) {
        json(res, resolved.status, { error: resolved.error });
        return true;
      }

      if (body.leave === true) {
        clearChatTyping(resolved.actor.actorId);
        publishChatTypingRoster();
        json(res, 200, { ok: true });
        return true;
      }

      if (body.typing !== true) {
        json(res, 400, { error: "typing or leave required" });
        return true;
      }

      const ip = clientIp(req);
      const rl = consumeRateLimit(`chat-typing:${resolved.actor.actorId}:${ip}`, {
        windowMs: 15_000,
        max: 60,
      });

      touchChatTyping(resolved.actor.actorId, resolved.actor);
      publishChatTypingRoster();
      json(res, 200, { ok: true, throttled: !rl.ok });
    } catch {
      json(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  json(res, 405, { error: "Method not allowed" });
  return true;
}
