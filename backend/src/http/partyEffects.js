import { verifyGuestSession, isValidGuestId } from "../security/guestSession.js";
import { validateShareToken } from "../db/shareLinks.js";
import { consumeRateLimit, clientIp } from "../security/rateLimit.js";
import { apiJsonHeaders } from "../security/httpHeaders.js";
import { hasSessionOrShareToken } from "../security/access.js";
import { avatarUrlForUserId } from "../db/userProfile.js";
import { resolveProfileRps } from "../party/profileRps.js";
import { petHeartDelayMs, petVariantForEffectId } from "../party/petTiming.js";
import { listPartyEffectsSince, notifyPartyEffect, pushEffect, pushLevelUpEffect } from "../party/partyEffectStore.js";

export { pushLevelUpEffect, listPartyEffectsSince };

/** Cover icon id 25 — robot emblem; matches frontend guestCoverIcons Bot. */
export const DISCORD_BOT_COVER_ICON_ID = 25;

const EFFECT_TYPES = new Set([
  "fireworks", "confetti", "shockwave", "hearts", "lasers", "bubbles", "stars", "notes", "spotlight",
  "rocket", "comet", "ufo", "meteor", "lightning", "firefly", "satellite",
  "react_thumbs_up", "react_thumbs_down", "react_love", "react_laugh",
  "react_fire", "react_clap", "react_wow", "react_devil", "react_wink",
  "react_jammin", "react_cry", "react_kiss", "react_pet", "react_pet_hearts",
  "react_profile_party", "react_profile_wave", "react_profile_highfive", "react_profile_rps",
  "level_up",
]);

const PROFILE_REACTION_TYPES = new Set([
  "react_profile_party",
  "react_profile_wave",
  "react_profile_highfive",
  "react_profile_rps",
]);

const SERVER_ONLY_EFFECT_TYPES = new Set(["react_pet_hearts", "level_up"]);
const PARTY_EFFECT_RATE = { windowMs: 15_000, max: 30 };

export function setPartyEffectsContext() {
  /* reserved for future broadcast-aware rules */
}

function json(res, status, body) {
  res.writeHead(status, apiJsonHeaders());
  res.end(JSON.stringify(body));
}

function normalizeCoord(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function isReactionType(type) {
  return String(type).startsWith("react_");
}

function normalizePartyUserId(userId) {
  return String(userId || "").trim();
}

function isSamePartyUser(a, b) {
  const na = normalizePartyUserId(a);
  const nb = normalizePartyUserId(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ga = na.startsWith("guest:") ? na.slice(6) : na;
  const gb = nb.startsWith("guest:") ? nb.slice(6) : nb;
  return ga === gb;
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function reactorForGuest(body, triggeredBy) {
  return {
    userId: triggeredBy,
    avatarUrl: null,
    avatarVariant: clampInt(body.avatarVariant, 0, 11, 0),
    coverIcon: clampInt(body.coverIcon, 0, 64, 0),
  };
}

function reactorForUser(userId) {
  return {
    userId: String(userId),
    avatarUrl: avatarUrlForUserId(userId),
    avatarVariant: 0,
    coverIcon: 0,
  };
}

export function reactorForDiscord(discordUserId) {
  const id = String(discordUserId || "").trim();
  return {
    userId: `discord:${id}`,
    avatarUrl: null,
    avatarVariant: 0,
    coverIcon: DISCORD_BOT_COVER_ICON_ID,
  };
}

/** Broadcast react_love for a Discord embed heart (no XP; robot avatar on clients). */
export function pushDiscordHeartReaction(discordUserId) {
  const id = String(discordUserId || "").trim();
  if (!id) return null;
  const actorId = `discord:${id}`;
  const x = 0.42 + Math.random() * 0.16;
  const y = 0.34 + Math.random() * 0.14;
  const effect = pushEffect("react_love", x, y, actorId, reactorForDiscord(id));
  notifyPartyEffect(effect);
  return effect;
}

function reactorForTarget(body) {
  const targetUserId = String(body.targetUserId || "").trim();
  if (!targetUserId) return null;
  if (targetUserId.startsWith("guest:")) {
    const guestId = targetUserId.slice(6);
    if (!isValidGuestId(guestId)) return null;
    return {
      userId: targetUserId,
      avatarUrl: null,
      avatarVariant: clampInt(body.targetAvatarVariant, 0, 11, 0),
      coverIcon: clampInt(body.targetCoverIcon, 0, 64, 0),
    };
  }
  return reactorForUser(targetUserId);
}

function schedulePetHearts(parentEffect) {
  const variant = parentEffect.petVariant ?? 0;
  const delayMs = petHeartDelayMs(variant);
  setTimeout(() => {
    const effect = pushEffect("react_pet_hearts", parentEffect.x, parentEffect.y, parentEffect.by, null, {
      petVariant: variant,
      parentId: parentEffect.id,
    });
    notifyPartyEffect(effect);
  }, delayMs);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function handlePartyEffectsRoutes(req, res, pathname, method, getAppSession) {
  if (pathname !== "/api/party-effects") return false;

  if (method === "GET") {
    if (!hasSessionOrShareToken(req, getAppSession)) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const since = Number(url.searchParams.get("since") || "0");
      json(res, 200, { effects: listPartyEffectsSince(since) });
    } catch {
      json(res, 500, { error: "Failed to list party effects" });
    }
    return true;
  }

  if (method === "POST") {
    try {
      const body = await readBody(req);
      const type = String(body.type || "").trim();
      const x = normalizeCoord(body.x);
      const y = normalizeCoord(body.y);
      if (!EFFECT_TYPES.has(type) || SERVER_ONLY_EFFECT_TYPES.has(type) || x == null || y == null) {
        json(res, 400, { error: "Invalid party effect" });
        return true;
      }

      const shareToken = String(body.shareToken || "").trim();
      const guestId = String(body.guestId || "").trim();
      const guestSession = String(body.guestSession || "").trim();
      let triggeredBy = null;
      let reactor = null;

      if (shareToken && guestId && guestSession) {
        if (!isValidGuestId(guestId) || !verifyGuestSession(guestSession, shareToken, guestId)) {
          json(res, 403, { error: "Invalid guest session" });
          return true;
        }
        const link = validateShareToken(shareToken);
        if (!link || link.link_kind !== "ui") {
          json(res, 403, { error: "Invalid share link" });
          return true;
        }
        triggeredBy = `guest:${guestId}`;
        if (isReactionType(type)) {
          reactor = reactorForGuest(body, triggeredBy);
        }
      } else {
        const session = getAppSession(req);
        if (!session?.user?.id) {
          json(res, 401, { error: "Unauthorized" });
          return true;
        }
        triggeredBy = String(session.user.id);
        if (isReactionType(type)) {
          reactor = reactorForUser(session.user.id);
        }
      }

      const ip = clientIp(req);
      const rl = consumeRateLimit(`party:${triggeredBy}:${ip}`, PARTY_EFFECT_RATE);
      if (!rl.allowed) {
        json(res, 429, { error: "Rate limited", retryAfterMs: rl.retryAfterMs });
        return true;
      }

      const extra = {};
      if (PROFILE_REACTION_TYPES.has(type)) {
        const target = reactorForTarget(body);
        if (!target) {
          json(res, 400, { error: "Profile reaction requires a valid targetUserId" });
          return true;
        }
        extra.target = target;
        if (isSamePartyUser(triggeredBy, target.userId)) {
          json(res, 400, { error: "Cannot react to your own profile" });
          return true;
        }
      }

      const effect = pushEffect(type, x, y, triggeredBy, reactor, extra);

      if (type === "react_profile_rps") {
        effect.profileDuel = resolveProfileRps(effect.id);
      }

      if (type === "react_pet") {
        effect.petVariant = petVariantForEffectId(effect.id);
        schedulePetHearts(effect);
      }

      notifyPartyEffect(effect);
      json(res, 201, { ok: true, effect });
    } catch {
      json(res, 400, { error: "Invalid request" });
    }
    return true;
  }

  json(res, 405, { error: "Method not allowed" });
  return true;
}
