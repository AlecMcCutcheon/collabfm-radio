import { getDb, getSetting, getUserById } from "./index.js";
import { publicDisplayName } from "./userProfile.js";
import { pushLevelUpEffect } from "../party/partyEffectStore.js";
import { guestIpMatchesOnStage } from "../presence/sitePresence.js";

export const XP_APPROVAL = 5;
export const XP_HEART = 3;
export const XP_REQUEST_PLAY = 25;
export const XP_STAGE_SHARE = 5;
export const LEVEL_XP_DIVISOR = 25;

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / LEVEL_XP_DIVISOR)) + 1;
}

export function xpProgressForAmount(xp) {
  const total = Math.max(0, Number(xp) || 0);
  const level = levelFromXp(total);
  const currentFloor = (level - 1) ** 2 * LEVEL_XP_DIVISOR;
  const nextFloor = level ** 2 * LEVEL_XP_DIVISOR;
  const into = total - currentFloor;
  const need = nextFloor - currentFloor;
  return {
    level,
    experiencePoints: total,
    xpIntoLevel: into,
    xpForNextLevel: need,
    progressPct: need ? Math.min(100, Math.round((into / need) * 100)) : 100,
  };
}

export function publicLevelInfo(user) {
  if (!user) return null;
  return xpProgressForAmount(user.experience_points ?? 0);
}

export function isGuestActor(actorId) {
  return String(actorId || "").startsWith("guest:");
}

export function isDiscordActor(actorId) {
  return String(actorId || "").startsWith("discord:");
}

export function isRegisteredUserId(userId) {
  const id = String(userId || "");
  if (!id || id.startsWith("guest:")) return false;
  const n = Number(id);
  return Number.isFinite(n) && n > 0;
}

export function guestActionsGrantXp() {
  return getSetting("leveling.guestActionsGrantXp", true) !== false;
}

export function blockGuestXpMatchingStageIp() {
  return getSetting("leveling.blockGuestXpMatchingStageIp", true) !== false;
}

export function recipientBlocksGuestActionXp(recipientUserId) {
  const user = getUserById(Number(recipientUserId));
  return !!user?.block_guest_action_xp;
}

export function canGrantXpFromActor(actorId, recipientUserId) {
  if (isDiscordActor(actorId)) return false;
  if (!isGuestActor(actorId)) return true;
  if (!guestActionsGrantXp()) return false;
  if (recipientBlocksGuestActionXp(recipientUserId)) return false;
  if (blockGuestXpMatchingStageIp() && guestIpMatchesOnStage(actorId)) return false;
  return true;
}

function awardXp(userId, amount, { eventKey, source, actorId = null, meta = null }) {
  if (!isRegisteredUserId(userId)) {
    return { awarded: false, reason: "guest_recipient" };
  }
  const uid = Number(userId);
  const db = getDb();
  try {
    db.prepare("BEGIN").run();
    const existing = db.prepare("SELECT id FROM xp_events WHERE event_key = ?").get(eventKey);
    if (existing) {
      db.prepare("ROLLBACK").run();
      return { awarded: false, reason: "duplicate" };
    }
    const xpRow = db.prepare("SELECT experience_points FROM users WHERE id = ?").get(uid);
    const xpBefore = xpRow?.experience_points ?? 0;
    const levelBefore = levelFromXp(xpBefore);
    db.prepare(
      `INSERT INTO xp_events (user_id, event_key, source, amount, actor_id, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uid, eventKey, source, amount, actorId, meta ? JSON.stringify(meta) : null);
    db.prepare("UPDATE users SET experience_points = experience_points + ? WHERE id = ?").run(amount, uid);
    db.prepare("COMMIT").run();
    const xpAfter = xpBefore + amount;
    const levelAfter = levelFromXp(xpAfter);
    const result = { awarded: true, amount, userId: uid };
    if (levelAfter > levelBefore) {
      result.levelUp = { level: levelAfter, previousLevel: levelBefore };
      const user = getUserById(uid);
      result.levelUpEffect = pushLevelUpEffect({
        userId: uid,
        level: levelAfter,
        displayName: publicDisplayName(user),
      });
    }
    return result;
  } catch {
    try {
      db.prepare("ROLLBACK").run();
    } catch {}
    return { awarded: false, reason: "error" };
  }
}

export function getRequesterUserId(request) {
  if (!request) return null;
  if (request.requesterUserId) return String(request.requesterUserId);
  const vote = request.votes?.find((v) => v.vote === 1) ?? request.votes?.[0];
  return vote?.userId ? String(vote.userId) : null;
}

export function tryAwardApprovalXp({ songKey, request, approverUserId }) {
  const requesterUserId = getRequesterUserId(request);
  if (!requesterUserId || !isRegisteredUserId(requesterUserId)) {
    return { awarded: false, reason: "no_requester" };
  }
  if (String(approverUserId) === String(requesterUserId)) {
    return { awarded: false, reason: "self_approval" };
  }
  if (!canGrantXpFromActor(approverUserId, requesterUserId)) {
    return { awarded: false, reason: "guest_action_blocked" };
  }
  return awardXp(requesterUserId, XP_APPROVAL, {
    eventKey: `approval:${songKey}:${requesterUserId}:${approverUserId}`,
    source: "approval",
    actorId: String(approverUserId),
    meta: { songKey, title: request.title, artist: request.artist },
  });
}

export function tryAwardRequestPlayXp({ songKey, request, broadcasterUserId = null }) {
  if (request.playingSource !== "metadata") {
    return { awarded: false, reason: "not_metadata_verified" };
  }
  const playedSource = request.playedSource;
  const completedViaMetadata = playedSource === "metadata";
  const completedViaTimeout = playedSource === "timeout";
  const completedManuallyAfterAutoPlay = playedSource === "manual";
  if (!completedViaMetadata && !completedViaTimeout && !completedManuallyAfterAutoPlay) {
    return { awarded: false, reason: "not_metadata_verified" };
  }

  let djUserId = request.djUserId ? String(request.djUserId) : null;
  if ((!djUserId || !isRegisteredUserId(djUserId)) && broadcasterUserId) {
    djUserId = String(broadcasterUserId);
  }
  if (!djUserId || !isRegisteredUserId(djUserId)) {
    return { awarded: false, reason: "no_dj" };
  }
  const requesterUserId = getRequesterUserId(request);
  if (!requesterUserId) {
    return { awarded: false, reason: "no_requester" };
  }
  if (String(djUserId) === String(requesterUserId)) {
    return { awarded: false, reason: "self_request" };
  }
  return awardXp(djUserId, XP_REQUEST_PLAY, {
    eventKey: `request_play:${songKey}:${djUserId}`,
    source: "request_play",
    meta: { songKey, requesterUserId, title: request.title, artist: request.artist },
  });
}

export function recordTrackHeart({ actorId, broadcasterUserId, trackSessionId }) {
  if (!isRegisteredUserId(broadcasterUserId)) {
    return { recorded: false, reason: "guest_broadcaster" };
  }
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO track_hearts (broadcaster_user_id, track_session_id, actor_id)
       VALUES (?, ?, ?)`,
    ).run(Number(broadcasterUserId), String(trackSessionId), String(actorId));
    return { recorded: true, duplicate: false };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE")) {
      return { recorded: false, duplicate: true };
    }
    return { recorded: false, reason: "error" };
  }
}

export function tryAwardTrackHeartXp({ actorId, broadcasterUserId, trackSessionId, title, artist }) {
  const heart = recordTrackHeart({ actorId, broadcasterUserId, trackSessionId });
  if (heart.duplicate) {
    return { awarded: false, duplicate: true, heartRecorded: false };
  }
  if (!heart.recorded) {
    return { awarded: false, ...heart };
  }
  if (String(actorId) === String(broadcasterUserId)) {
    return { awarded: false, reason: "self_heart", heartRecorded: true };
  }
  if (!canGrantXpFromActor(actorId, broadcasterUserId)) {
    return { awarded: false, reason: "guest_action_blocked", heartRecorded: true };
  }
  return awardXp(broadcasterUserId, XP_HEART, {
    eventKey: `heart:${broadcasterUserId}:${trackSessionId}:${actorId}`,
    source: "heart",
    actorId: String(actorId),
    meta: { trackSessionId, title, artist },
  });
}

export function tryAwardStageShareXp({ promoterUserId, targetUserId, targetWsId, sharedAt }) {
  if (!isRegisteredUserId(promoterUserId)) {
    return { awarded: false, reason: "guest_recipient" };
  }
  return awardXp(promoterUserId, XP_STAGE_SHARE, {
    eventKey: `stage_share:${promoterUserId}:${targetUserId}:${sharedAt}`,
    source: "stage_share",
    meta: { targetUserId, targetWsId, sharedAt },
  });
}

export function countTrackHearts(broadcasterUserId, trackSessionId) {
  if (!isRegisteredUserId(broadcasterUserId) || !trackSessionId) return 0;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM track_hearts
       WHERE broadcaster_user_id = ? AND track_session_id = ?`,
    )
    .get(Number(broadcasterUserId), String(trackSessionId));
  return row?.c ?? 0;
}

export function userHasHeartedTrack(broadcasterUserId, trackSessionId, actorId) {
  if (!broadcasterUserId || !trackSessionId || !actorId) return false;
  const row = getDb()
    .prepare(
      `SELECT 1 FROM track_hearts
       WHERE broadcaster_user_id = ? AND track_session_id = ? AND actor_id = ?`,
    )
    .get(Number(broadcasterUserId), String(trackSessionId), String(actorId));
  return !!row;
}

export function resetUserXp(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return false;
  const db = getDb();
  db.prepare("DELETE FROM xp_events WHERE user_id = ?").run(uid);
  db.prepare("UPDATE users SET experience_points = 0 WHERE id = ?").run(uid);
  return true;
}

export function setUserBlockGuestActionXp(userId, blocked) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  getDb()
    .prepare("UPDATE users SET block_guest_action_xp = ? WHERE id = ?")
    .run(blocked ? 1 : 0, uid);
  return getUserById(uid);
}
