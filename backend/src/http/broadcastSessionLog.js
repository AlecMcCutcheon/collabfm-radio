import { hasSessionOrShareToken } from "../security/access.js";
import { verifyGuestSession, isValidGuestId } from "../security/guestSession.js";
import { validateShareToken } from "../db/shareLinks.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import {
  countTrackHearts,
  isRegisteredUserId,
  recordTrackHeart,
  tryAwardTrackHeartXp,
  userHasHeartedTrack,
} from "../db/userLevel.js";
import { getUserById, isSetupComplete } from "../db/index.js";
import { publicUserPresentation } from "../db/userProfile.js";
import { getBroadcastSessionLogSnapshot } from "../radio/broadcastSessionLog.js";
import { guestStageProfile } from "./guestBroadcast.js";
import { getTrackSessionId } from "./leveling.js";
import { publishBroadcastSessionLogChanged, publishNowPlayingSocialChanged } from "./liveEvents.js";

/** @type {{ getBroadcastStatus?: () => object }} */
let ctx = {};

export function setBroadcastSessionLogContext(next = {}) {
  ctx = { ...ctx, ...next };
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

function resolveActorFromQuery(req, getAppSession) {
  const session = getAppSession(req);
  if (session?.user?.id) {
    return { actorId: String(session.user.id) };
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const shareToken = String(url.searchParams.get("shareToken") || "").trim();
  const guestId = String(url.searchParams.get("guestId") || "").trim();
  const guestSession = String(url.searchParams.get("guestSession") || "").trim();
  if (shareToken && guestId && guestSession && isValidGuestId(guestId)) {
    if (verifyGuestSession(guestSession, shareToken, guestId)) {
      const link = validateShareToken(shareToken);
      if (link?.link_kind === "ui") {
        return { actorId: `guest:${guestId}` };
      }
    }
  }
  return { actorId: null };
}

function safeSetupComplete() {
  try {
    return isSetupComplete();
  } catch {
    return false;
  }
}

function resolveBroadcasterDisplayName(userId, storedName) {
  const id = String(userId || "").trim();
  if (!id) return storedName?.trim() || null;

  if (id.startsWith("guest:")) {
    const profile = guestStageProfile(id, storedName || "Guest", null);
    return profile.displayName || storedName || "Guest";
  }

  if (safeSetupComplete()) {
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      const user = getUserById(numericId);
      if (user) {
        const presentation = publicUserPresentation(user);
        return presentation.displayName || user.username || storedName || null;
      }
    }
  }

  return storedName?.trim() || null;
}

function enrichSessionLog(actorId = null) {
  const status = ctx.getBroadcastStatus?.() ?? {};
  const { sessionKey, songs } = getBroadcastSessionLogSnapshot();
  const currentTrackSessionId = getTrackSessionId();

  const enriched = songs
    .slice()
    .reverse()
    .map((song) => {
      const djUserId = song.broadcasterUserId;
      const registeredDj = djUserId && isRegisteredUserId(djUserId);
      let heartCount = 0;
      let userHasHearted = false;
      if (registeredDj && song.trackSessionId) {
        heartCount = countTrackHearts(djUserId, song.trackSessionId);
        if (actorId) {
          userHasHearted = userHasHeartedTrack(djUserId, song.trackSessionId, actorId);
        }
      }
      const isCurrent = song.trackSessionId === currentTrackSessionId && !!status.active;
      const isOwnBroadcast =
        !!(actorId && djUserId && String(actorId) === String(djUserId));
      return {
        trackSessionId: song.trackSessionId,
        title: song.title,
        artist: song.artist,
        albumArt: song.albumArt ?? null,
        fromRequest: !!song.fromRequest,
        requestSongKey: song.requestSongKey ?? null,
        broadcasterUserId: song.broadcasterUserId,
        broadcasterDisplayName: resolveBroadcasterDisplayName(
          song.broadcasterUserId,
          song.broadcasterDisplayName,
        ),
        startedAt: song.startedAt,
        endedAt: song.endedAt,
        isCurrent,
        isOwnBroadcast: isCurrent ? isOwnBroadcast : false,
        heartCount,
        userHasHearted,
        canHeart: !!registeredDj && !!actorId && !userHasHearted,
      };
    });

  return {
    active: !!status.active,
    startTime: status.startTime ?? sessionKey,
    songs: enriched,
  };
}

export async function handleBroadcastSessionLogRoutes(req, res, pathname, method, getAppSession) {
  if (pathname === "/api/broadcast/session/log" && method === "GET") {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      const actor = resolveActorFromQuery(req, getAppSession);
      json(res, 200, enrichSessionLog(actor.actorId));
    } catch {
      json(res, 500, { error: "Failed to load session log" });
    }
    return true;
  }

  if (pathname === "/api/broadcast/session/heart" && method === "POST") {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      const body = await readBody(req);
      const actor = resolveActor(req, body, getAppSession);
      if (actor.error) {
        json(res, actor.status, { error: actor.error });
        return true;
      }

      const trackSessionId = String(body.trackSessionId || "").trim();
      if (!trackSessionId) {
        json(res, 400, { error: "Missing trackSessionId" });
        return true;
      }

      const { songs } = getBroadcastSessionLogSnapshot();
      const entry = songs.find((song) => song.trackSessionId === trackSessionId);
      if (!entry?.broadcasterUserId || !isRegisteredUserId(entry.broadcasterUserId)) {
        json(res, 400, { error: "Cannot heart this track" });
        return true;
      }

      const status = ctx.getBroadcastStatus?.() ?? {};
      const currentTrackSessionId = getTrackSessionId();
      const isCurrentLive =
        trackSessionId === currentTrackSessionId && !!status.active;

      const ip = clientIp(req);
      const rl = consumeRateLimit(
        isCurrentLive ? `heart:${actor.actorId}:${ip}` : `session-heart:${actor.actorId}:${ip}`,
        isCurrentLive ? { windowMs: 8000, max: 4 } : { windowMs: 8000, max: 6 },
      );
      if (!rl.allowed) {
        json(res, 429, { error: "Rate limited", retryAfterMs: rl.retryAfterMs });
        return true;
      }

      let duplicate = false;
      let recorded = false;
      let awarded = false;
      let levelUpEffect = null;

      if (isCurrentLive) {
        const result = tryAwardTrackHeartXp({
          actorId: actor.actorId,
          broadcasterUserId: entry.broadcasterUserId,
          trackSessionId,
          title: entry.title,
          artist: entry.artist,
        });
        duplicate = !!result.duplicate;
        recorded = !!result.heartRecorded || !!result.awarded;
        awarded = !!result.awarded;
        levelUpEffect = result.levelUpEffect ?? null;

        publishNowPlayingSocialChanged({
          trackSessionId,
          broadcasterUserId: entry.broadcasterUserId,
          heartCount: countTrackHearts(entry.broadcasterUserId, trackSessionId),
          title: entry.title,
          artist: entry.artist,
        });
      } else {
        const heart = recordTrackHeart({
          actorId: actor.actorId,
          broadcasterUserId: entry.broadcasterUserId,
          trackSessionId,
        });
        duplicate = !!heart.duplicate;
        recorded = !!heart.recorded;
      }

      publishBroadcastSessionLogChanged({
        trackSessionId,
        heartCount: countTrackHearts(entry.broadcasterUserId, trackSessionId),
      });

      json(res, 200, {
        ok: true,
        duplicate,
        recorded,
        awarded,
        levelUpEffect,
        ...enrichSessionLog(actor.actorId),
      });
    } catch {
      json(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  return false;
}
