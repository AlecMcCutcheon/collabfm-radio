import { getUserById, isSetupComplete } from "../db/index.js";
import { publicUserPresentation } from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import { sanitizeRoleColor } from "../security/sanitize.js";
import { guestStageProfile } from "./guestBroadcast.js";

const GUEST_ROLE_COLOR = "#c4b5fd";

export function normalizeChatRoleType(raw, isGuest = false) {
  if (isGuest || raw === "guest") return "guest";
  if (!raw) return "listener";
  const role = String(raw).toLowerCase();
  if (role === "admin" || role === "administrator") return "admin";
  if (role === "broadcaster" || role === "moderator" || role === "host") return "broadcaster";
  return "listener";
}

function safeSetupComplete() {
  try {
    return isSetupComplete();
  } catch {
    return false;
  }
}

function discordAvatarUrl(userId, avatarHash) {
  if (!userId || !avatarHash || String(avatarHash).includes("/")) return null;
  const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
}

function profileAuthorForUserId(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return null;
  const user = getUserById(id);
  if (!user) return null;
  const presentation = publicUserPresentation(user);
  const role = roleInfoForUser(user);
  return {
    userId: String(userId),
    username: presentation.displayName || user.username,
    displayName: presentation.displayName || user.username,
    avatar: presentation.avatar || null,
    roleType: normalizeChatRoleType(user.role, false),
    roleColor: sanitizeRoleColor(role.roleColor) || null,
    isGuest: false,
  };
}

export function guestChatAuthor(guestId, guestName) {
  const label = String(guestName || "Guest").trim().replace(/\s+/g, "").slice(0, 32) || "Guest";
  return {
    userId: `guest:${String(guestId)}`,
    username: label,
    displayName: label,
    avatar: null,
    isGuest: true,
    roleType: "guest",
    roleColor: GUEST_ROLE_COLOR,
  };
}

export async function buildChatAuthorFromUserId(userId, getUserRoleInfoFn, fallback = {}) {
  if (safeSetupComplete()) {
    const fromProfile = profileAuthorForUserId(userId);
    if (fromProfile) return fromProfile;
  }

  let roleType = "listener";
  let roleColor = null;
  if (getUserRoleInfoFn) {
    try {
      const roleInfo = await getUserRoleInfoFn(userId);
      roleType = normalizeChatRoleType(roleInfo.roleType || roleInfo.level, false);
      roleColor = sanitizeRoleColor(roleInfo.roleColor) || null;
    } catch {
      /* ignore */
    }
  }

  const username = fallback.username ?? String(userId);
  const avatar =
    fallback.avatar ||
    discordAvatarUrl(userId, fallback.discordAvatar) ||
    null;

  return {
    userId: String(userId),
    username,
    displayName: fallback.displayName ?? username,
    avatar,
    roleType: normalizeChatRoleType(fallback.role ?? roleType, false),
    roleColor,
    isGuest: false,
  };
}

export function parseRequestMessageContent(content) {
  const match = String(content || "").match(/requested "([^"]+)" by (.+)$/);
  if (!match) return null;
  return { title: match[1], artist: match[2].trim() };
}

export function formatRequestMessageContent(displayName, title, artist) {
  const label = String(displayName || "Someone").trim() || "Someone";
  return `🎵 ${label} requested "${title}" by ${artist}`;
}

export function findRequestUserVote(votes, viewer) {
  if (!viewer || !Array.isArray(votes)) return null;
  if (String(viewer.userId).startsWith("guest:")) {
    return votes.find((v) => v.userId === viewer.userId)?.vote ?? null;
  }
  return (
    votes.find((v) => v.userId === viewer.userId && !!v.host === !!viewer.isHost)?.vote ??
    null
  );
}

export async function enrichChatMessagesForApi(
  messages,
  { getUserRoleInfoFn, getSongRequestForMessage, viewerContext, guestShareLinkId } = {},
) {
  const enriched = [];

  for (const message of messages) {
    if (message.type === "SYSTEM_REQUEST") {
      const isGuest = message.isGuest || String(message.userId || "").startsWith("guest:");
      const requestMeta = getSongRequestForMessage?.(message) ?? null;
      const parsed = requestMeta
        ? null
        : parseRequestMessageContent(message.content);
      const requestTitle =
        requestMeta?.title ?? message.requestTitle ?? parsed?.title ?? null;
      const requestArtist =
        requestMeta?.artist ?? message.requestArtist ?? parsed?.artist ?? null;

      let displayName = message.displayName ?? message.username ?? null;
      let guestAvatarVariant = message.guestAvatarVariant ?? 0;
      let guestCoverIcon = message.guestCoverIcon ?? 0;

      if (isGuest) {
        const guestId = String(message.userId || "").startsWith("guest:")
          ? String(message.userId).slice(6)
          : null;
        const shareLinkId = message.guestShareLinkId ?? guestShareLinkId ?? null;
        const profile = guestId
          ? guestStageProfile(
              `guest:${guestId}`,
              displayName ?? "Guest",
              shareLinkId,
            )
          : null;
        displayName = profile?.displayName ?? displayName ?? "Guest";
        guestAvatarVariant = profile?.avatarVariant ?? guestAvatarVariant;
        guestCoverIcon = profile?.coverIcon ?? guestCoverIcon;
      } else if (message.userId && safeSetupComplete()) {
        const fromProfile = profileAuthorForUserId(message.userId);
        if (fromProfile) displayName = fromProfile.displayName;
      }

      const content =
        requestTitle && requestArtist
          ? formatRequestMessageContent(displayName ?? "Someone", requestTitle, requestArtist)
          : message.content;

      enriched.push({
        ...message,
        content,
        roleType: isGuest ? "guest" : "listener",
        displayName,
        roleColor: isGuest ? GUEST_ROLE_COLOR : null,
        guestAvatarVariant,
        guestCoverIcon,
        songKey: requestMeta?.songKey ?? message.songKey ?? null,
        requestTitle,
        requestArtist,
        requestStatus: requestMeta?.status ?? message.requestStatus ?? "requested",
        requestUrl: requestMeta?.url ?? message.requestUrl ?? null,
        requestVotesUp: requestMeta?.votesUp ?? message.requestVotesUp ?? 0,
        requestVotesDown: requestMeta?.votesDown ?? message.requestVotesDown ?? 0,
        requestApprovalPct: requestMeta?.approvalPct ?? message.requestApprovalPct ?? 0,
        requestUserVote: requestMeta?.requestUserVote ?? message.requestUserVote ?? null,
      });
      continue;
    }

    const isGuest = message.isGuest || String(message.userId || "").startsWith("guest:");
    if (isGuest) {
      const guestId = String(message.userId || "").startsWith("guest:")
        ? String(message.userId).slice(6)
        : null;
      const shareLinkId = message.guestShareLinkId ?? null;
      const profile = guestId
        ? guestStageProfile(
            `guest:${guestId}`,
            message.displayName ?? message.username ?? "Guest",
            shareLinkId,
          )
        : null;
      enriched.push({
        ...message,
        roleType: "guest",
        displayName:
          profile?.displayName ?? message.displayName ?? message.username ?? "Guest",
        avatar: null,
        roleColor: GUEST_ROLE_COLOR,
        guestAvatarVariant: profile?.avatarVariant ?? 0,
        guestCoverIcon: profile?.coverIcon ?? 0,
      });
      continue;
    }

    let authorFields = safeSetupComplete() ? profileAuthorForUserId(message.userId) : null;
    if (!authorFields) {
      authorFields = await buildChatAuthorFromUserId(message.userId, getUserRoleInfoFn, {
        username: message.username,
        displayName: message.displayName,
        avatar: message.avatar,
        role: message.roleType,
      });
    }

    enriched.push({
      ...message,
      ...authorFields,
    });
  }

  return enriched;
}

export function enrichChatTyperForApi(entry) {
  const actorId = String(entry?.actorId || "").trim();
  if (!actorId) return entry;

  if (actorId.startsWith("guest:")) {
    const profile = guestStageProfile(
      actorId,
      entry.displayName || "Guest",
      null,
    );
    return {
      actorId,
      displayName: profile.displayName || entry.displayName || "Guest",
      avatar: null,
      avatarVariant: profile.avatarVariant ?? entry.avatarVariant ?? 0,
      coverIcon: profile.coverIcon ?? entry.coverIcon ?? 0,
      roleType: "guest",
      isGuest: true,
      typing: true,
    };
  }

  const author = safeSetupComplete() ? profileAuthorForUserId(actorId) : null;
  if (!author) {
    return {
      actorId,
      displayName: entry.displayName || "Someone",
      avatar: entry.avatar ?? null,
      avatarVariant: 0,
      coverIcon: 0,
      roleType: entry.roleType || "listener",
      isGuest: false,
      typing: true,
    };
  }

  return {
    actorId,
    displayName: author.displayName,
    avatar: author.avatar,
    avatarVariant: 0,
    coverIcon: 0,
    roleType: author.roleType,
    isGuest: false,
    typing: true,
  };
}
