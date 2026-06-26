const TYPING_TTL_MS = 4500;

const byActor = new Map();

function toPublicTyper(entry) {
  return {
    actorId: entry.actorId,
    displayName: entry.displayName,
    avatar: entry.avatar ?? null,
    avatarVariant: entry.avatarVariant ?? 0,
    coverIcon: entry.coverIcon ?? 0,
    roleType: entry.roleType ?? "listener",
    isGuest: !!entry.isGuest,
    typing: true,
  };
}

export function touchChatTyping(actorId, actor) {
  const id = String(actorId || "").trim();
  if (!id) return;

  byActor.set(id, {
    actorId: id,
    displayName: String(actor.displayName || "Someone").slice(0, 64),
    avatar: actor.avatar ?? null,
    avatarVariant: Number(actor.avatarVariant) || 0,
    coverIcon: Number(actor.coverIcon) || 0,
    roleType: String(actor.roleType || "listener"),
    isGuest: !!actor.isGuest,
    lastSeen: Date.now(),
  });
}

export function clearChatTyping(actorId) {
  return byActor.delete(String(actorId || "").trim());
}

export function hasChatTypingActor(actorId) {
  return byActor.has(String(actorId || "").trim());
}

export function updateChatTypingActorProfile(actorId, patch = {}) {
  const id = String(actorId || "").trim();
  const entry = byActor.get(id);
  if (!entry) return false;

  if (patch.displayName != null) {
    entry.displayName = String(patch.displayName || "Someone").slice(0, 64);
  }
  if (patch.avatar !== undefined) entry.avatar = patch.avatar;
  if (patch.avatarVariant !== undefined) {
    entry.avatarVariant = Number(patch.avatarVariant) || 0;
  }
  if (patch.coverIcon !== undefined) entry.coverIcon = Number(patch.coverIcon) || 0;
  if (patch.roleType != null) entry.roleType = String(patch.roleType || "listener");
  if (patch.isGuest !== undefined) entry.isGuest = !!patch.isGuest;
  return true;
}

export function listChatTypers(now = Date.now()) {
  const out = [];
  for (const [id, entry] of byActor) {
    if (now - Number(entry.lastSeen || 0) > TYPING_TTL_MS) {
      byActor.delete(id);
      continue;
    }
    out.push(toPublicTyper(entry));
  }
  return out.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}

export function pruneChatTyping(now = Date.now()) {
  const before = byActor.size;
  listChatTypers(now);
  return byActor.size !== before;
}
