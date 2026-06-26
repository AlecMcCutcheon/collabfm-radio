import { hasSessionOrShareToken } from "../security/access.js";
import {
  setPartyEffectPublisher,
} from "../party/partyEffectStore.js";
import {
  listSitePresenceRoster,
  pruneStaleSitePresence,
} from "../presence/sitePresence.js";
import { listChatTypers, pruneChatTyping } from "../chat/chatTypingStore.js";
import { publishChatTypingRoster } from "../chat/chatTypingPublish.js";

const clients = new Set();
const HEARTBEAT_MS = 25_000;
const PRESENCE_SWEEP_MS = 10_000;
const RETRY_MS = 2_000;

function eventIdForEffect(effect) {
  return `${effect.at}:${effect.id}`;
}

function writeEvent(res, event, data, id) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function publishPartyEffect(effect) {
  const id = eventIdForEffect(effect);
  for (const client of clients) {
    writeEvent(client.res, "party_effect", { effect }, id);
  }
}

setPartyEffectPublisher(publishPartyEffect);

export function publishChatChanged(reason = "changed", extra = {}) {
  const id = `${Date.now()}:chat`;
  const payload = { reason, at: Date.now(), ...extra };
  for (const client of clients) {
    writeEvent(client.res, "chat_changed", payload, id);
  }
}

export function publishChatTypingChanged(typers) {
  const id = `${Date.now()}:chat-typing`;
  const payload = { typers, at: Date.now() };
  for (const client of clients) {
    writeEvent(client.res, "chat_typing_changed", payload, id);
  }
}

export function publishPresenceRoster(roster) {
  const id = `${Date.now()}:presence`;
  for (const client of clients) {
    writeEvent(client.res, "presence_roster", { roster, at: Date.now() }, id);
  }
}

export function publishProfileChanged(payload = {}) {
  const id = `${Date.now()}:profile`;
  for (const client of clients) {
    writeEvent(client.res, "profile_changed", { ...payload, at: Date.now() }, id);
  }
}

export function publishNowPlayingSocialChanged(payload = {}) {
  const id = `${Date.now()}:now-playing-social`;
  for (const client of clients) {
    writeEvent(client.res, "now_playing_social_changed", { ...payload, at: Date.now() }, id);
  }
}

export function publishBroadcastStatusChanged(reason = "changed") {
  const id = `${Date.now()}:broadcast-status`;
  for (const client of clients) {
    writeEvent(client.res, "broadcast_status_changed", { reason, at: Date.now() }, id);
  }
}

export function publishBroadcastSessionLogChanged(payload = {}) {
  const id = `${Date.now()}:session-log`;
  for (const client of clients) {
    writeEvent(client.res, "broadcast_session_log_changed", { ...payload, at: Date.now() }, id);
  }
}

setInterval(() => {
  if (!pruneStaleSitePresence()) return;
  publishPresenceRoster(listSitePresenceRoster());
}, PRESENCE_SWEEP_MS);

setInterval(() => {
  if (!pruneChatTyping()) return;
  publishChatTypingRoster();
}, PRESENCE_SWEEP_MS);

export async function handleLiveEventsRoutes(req, res, pathname, method, getAppSession) {
  if (pathname !== "/api/live/events") return false;

  if (method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  if (!hasSessionOrShareToken(req, getAppSession)) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: ${RETRY_MS}\n\n`);

  const client = { res };
  clients.add(client);

  writeEvent(res, "ready", { now: Date.now() });

  const heartbeat = setInterval(() => {
    writeEvent(res, "heartbeat", { now: Date.now() });
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });

  return true;
}
