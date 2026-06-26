import { verifyGuestSession, isValidGuestId } from "../security/guestSession.js";
import { validateShareToken } from "../db/shareLinks.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import {
  countTrackHearts,
  isRegisteredUserId,
  publicLevelInfo,
  recordTrackHeart,
  tryAwardTrackHeartXp,
  userHasHeartedTrack,
} from "../db/userLevel.js";
import { getUserById } from "../db/index.js";
import { publishNowPlayingSocialChanged, publishBroadcastSessionLogChanged } from "./liveEvents.js";
import { appendSessionTrack } from "../radio/broadcastSessionLog.js";
import { pushDiscordHeartReaction } from "./partyEffects.js";

let trackSessionId = "";

/** @type {{ getBroadcastStatus?: () => object, getCurrentSong?: () => { title: string, artist: string }, isMetadataDisabled?: () => boolean, getAlbumArtForTrack?: (title: string, artist: string) => string | null }} */
let broadcastCtx = {};

export function setLevelingContext(ctx = {}) {
  broadcastCtx = { ...broadcastCtx, ...ctx };
}

export function bumpTrackSession(title, artist, albumArt = null) {
  trackSessionId = `${String(title || "").trim()}|||${String(artist || "").trim()}:${Date.now()}`;
  const status = broadcastCtx.getBroadcastStatus?.() ?? {};
  const trackTitle = String(title || "").trim();
  const trackArtist = String(artist || "").trim();
  const resolvedArt =
    albumArt ||
    broadcastCtx.getAlbumArtForTrack?.(trackTitle, trackArtist) ||
    null;
  appendSessionTrack({
    trackSessionId,
    title: trackTitle,
    artist: trackArtist,
    albumArt: resolvedArt,
    broadcasterUserId: status.broadcasterUserId ? String(status.broadcasterUserId) : null,
    broadcasterDisplayName: status.broadcasterDisplayName ? String(status.broadcasterDisplayName) : null,
    startedAt: Date.now(),
  });
  publishNowPlayingSocialChanged({
    trackSessionId,
    title: String(title || ""),
    artist: String(artist || ""),
    reason: "track",
  });
  publishBroadcastSessionLogChanged({ trackSessionId, reason: "track" });
  return trackSessionId;
}

export function getTrackSessionId() {
  return trackSessionId;
}

export function heartCurrentTrackFromDiscord(discordUserId) {
  const actorId = `discord:${String(discordUserId || "").trim()}`;
  if (!actorId || actorId === "discord:") {
    return { ok: false, error: "Invalid Discord user" };
  }

  const social = nowPlayingSocialPayload(null);
  if (!social.canHeart || !social.trackSessionId || !social.broadcasterUserId) {
    return { ok: false, error: "Cannot heart the current track" };
  }

  const result = recordTrackHeart({
    actorId,
    broadcasterUserId: social.broadcasterUserId,
    trackSessionId: social.trackSessionId,
  });

  const heartCount = countTrackHearts(social.broadcasterUserId, social.trackSessionId);

  if (result.recorded) {
    publishNowPlayingSocialChanged({
      trackSessionId: social.trackSessionId,
      broadcasterUserId: social.broadcasterUserId,
      heartCount,
      title: social.title,
      artist: social.artist,
    });
    publishBroadcastSessionLogChanged({
      trackSessionId: social.trackSessionId,
      heartCount,
    });
    pushDiscordHeartReaction(discordUserId);
  }

  return {
    ok: true,
    duplicate: !!result.duplicate,
    recorded: !!result.recorded,
    heartCount,
    trackSessionId: social.trackSessionId,
    title: social.title,
    artist: social.artist,
  };
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function liveDjUserId() {
  const status = broadcastCtx.getBroadcastStatus?.() ?? {};
  const djId = status.broadcasterUserId ? String(status.broadcasterUserId) : "";
  if (!djId || !isRegisteredUserId(djId)) return null;
  return djId;
}

function resolveActor(req, body, getAppSession) {
  const shareToken = String(body.shareToken || "").trim();
  const guestId = String(body.guestId || "").trim();
  const guestSession = String(body.guestSession || "").trim();

  if (shareToken && guestId && guestSession) {
    if (!isValidGuestId(guestId) || !verifyGuestSession(guestSession, shareToken, guestId)) {
      return { error: "Invalid guest session", status: 403 };
    }
    const link = validateShareToken(shareToken);
    if (!link || link.link_kind !== "ui") {
      return { error: "Invalid share link", status: 403 };
    }
    return { actorId: `guest:${guestId}` };
  }

  const session = getAppSession(req);
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }
  return { actorId: String(session.user.id) };
}

function nowPlayingSocialPayload(actorId = null) {
  const status = broadcastCtx.getBroadcastStatus?.() ?? {};
  const live = !!status.active;
  const disabled = !!broadcastCtx.isMetadataDisabled?.();
  const { title = "", artist = "" } = broadcastCtx.getCurrentSong?.() ?? {};
  const hasTrack = !!(title && artist && !disabled);
  const djUserId = liveDjUserId();
  const sessionId = trackSessionId;

  let heartCount = 0;
  let userHasHearted = false;
  let broadcasterLevel = null;
  const isOwnBroadcast =
    !!(actorId && djUserId && String(actorId) === String(djUserId));

  if (djUserId && sessionId) {
    heartCount = countTrackHearts(djUserId, sessionId);
    if (actorId) {
      userHasHearted = userHasHeartedTrack(djUserId, sessionId, actorId);
    }
    const dj = getUserById(Number(djUserId));
    broadcasterLevel = publicLevelInfo(dj);
  }

  return {
    live,
    hasTrack,
    title,
    artist,
    trackSessionId: sessionId || null,
    broadcasterUserId: djUserId,
    heartCount,
    userHasHearted,
    isOwnBroadcast,
    canHeart: live && hasTrack && !!djUserId && !!sessionId,
    broadcasterLevel,
  };
}

export async function handleLevelingRoutes(req, res, pathname, method, getAppSession) {
  if (pathname === "/api/now-playing/social" && method === "GET") {
    try {
      let actorId = null;
      const session = getAppSession(req);
      if (session?.user?.id) {
        actorId = String(session.user.id);
      } else {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const shareToken = String(url.searchParams.get("shareToken") || "").trim();
        const guestId = String(url.searchParams.get("guestId") || "").trim();
        const guestSession = String(url.searchParams.get("guestSession") || "").trim();
        if (shareToken && guestId && guestSession && isValidGuestId(guestId)) {
          if (verifyGuestSession(guestSession, shareToken, guestId)) {
            const link = validateShareToken(shareToken);
            if (link?.link_kind === "ui") {
              actorId = `guest:${guestId}`;
            }
          }
        }
      }
      json(res, 200, nowPlayingSocialPayload(actorId));
    } catch {
      json(res, 500, { error: "Failed to load now-playing social state" });
    }
    return true;
  }

  if (pathname === "/api/now-playing/heart" && method === "POST") {
    try {
      const body = await readBody(req);
      const actor = resolveActor(req, body, getAppSession);
      if (actor.error) {
        json(res, actor.status, { error: actor.error });
        return true;
      }

      const social = nowPlayingSocialPayload(actor.actorId);
      if (!social.canHeart) {
        json(res, 400, { error: "Cannot heart the current track" });
        return true;
      }

      const ip = clientIp(req);
      const rl = consumeRateLimit(`heart:${actor.actorId}:${ip}`, { windowMs: 8000, max: 4 });
      if (!rl.allowed) {
        json(res, 429, { error: "Rate limited", retryAfterMs: rl.retryAfterMs });
        return true;
      }

      const result = tryAwardTrackHeartXp({
        actorId: actor.actorId,
        broadcasterUserId: social.broadcasterUserId,
        trackSessionId: social.trackSessionId,
        title: social.title,
        artist: social.artist,
      });
      const nextSocial = nowPlayingSocialPayload(actor.actorId);

      publishNowPlayingSocialChanged({
        trackSessionId: nextSocial.trackSessionId,
        broadcasterUserId: nextSocial.broadcasterUserId,
        heartCount: nextSocial.heartCount,
        title: nextSocial.title,
        artist: nextSocial.artist,
      });

      json(res, 200, {
        ok: true,
        awarded: !!result.awarded,
        duplicate: !!result.duplicate,
        heartCount: nextSocial.heartCount,
        userHasHearted: true,
        levelUpEffect: result.levelUpEffect ?? null,
        ...nextSocial,
      });
    } catch {
      json(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  return false;
}
