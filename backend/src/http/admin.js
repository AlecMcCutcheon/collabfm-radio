import { isAdminSession } from "./setup.js";
import { getAppSession } from "../auth/routes.js";
import { hashPassword } from "../auth/session.js";
import {
  deleteUser,
  getSetting,
  getUserById,
  getUserByUsername,
  listOidcGroupMappings,
  countOidcOnlyUsers,
  listUsers,
  listWhitelist,
  removeOidcGroupMapping,
  removeWhitelistEntry,
  replaceOidcGroupMappings,
  setOidcGroupMapping,
  setSetting,
  updateUser,
  upsertWhitelistEntry,
} from "../db/index.js";
import { getVoiceBotConfig, mergeSecretField } from "../settings/runtime.js";
import {
  integrationsAdminPayload,
  saveIntegrationsSettings,
} from "../settings/integrations.js";
import {
  operationalSettingsAdminPayload,
  saveOperationalSettings,
} from "../settings/operational.js";
import {
  createShareLink,
  enrichShareLink,
  listShareLinks,
  revokeShareLink,
  LISTENER_TTL_OPTIONS,
  GUEST_BROADCASTER_TTL_OPTIONS,
} from "../db/shareLinks.js";
import { resolvePublicBaseUrl } from "./publicBaseUrl.js";
import {
  getBrandingSettings,
  readBrandingBody,
  resetBrandingSettings,
} from "../http/branding.js";
import { saveCustomVisualizer } from "../db/brandingAssets.js";
import { publicDisplayName, publicUserPresentation } from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import { publishPresenceRoster, publishProfileChanged } from "./liveEvents.js";
import {
  listSitePresenceRoster,
  updateSitePresenceActorProfile,
} from "../presence/sitePresence.js";
import { refreshChatTypingForActor } from "../chat/chatTypingPublish.js";
import { getActiveListenerCount } from "../radio/streamHub.js";
import { verifyVoiceBotCredentials, credentialsFingerprint } from "../discord/verifyBot.js";
import {
  getVoiceBotRuntimeStatus,
  maybeAutoStartManagedVoiceBot,
  startManagedVoiceBot,
  stopManagedVoiceBot,
} from "../voice/voiceBotManager.js";

function voiceBotPayload() {
  const voiceBot = getVoiceBotConfig();
  const runtime = getVoiceBotRuntimeStatus();
  return {
    voiceBot: {
      clientId: voiceBot.clientId || "",
      botToken: voiceBot.botToken || "",
      botTokenConfigured: !!voiceBot.botToken,
      enabled: voiceBot.enabled !== false,
      publicBaseUrl: getSetting("publicBaseUrl", ""),
      verified: voiceBot.verified
        ? {
            at: voiceBot.verified.at,
            botId: voiceBot.verified.botId,
            botUsername: voiceBot.verified.botUsername,
            applicationId: voiceBot.verified.applicationId,
            applicationName: voiceBot.verified.applicationName ?? null,
          }
        : null,
    },
    runtime,
    inviteUrl: voiceBot.clientId
      ? `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(voiceBot.clientId)}&permissions=36700160&scope=bot%20applications.commands`
      : null,
    note: runtime.mode === "external"
      ? "Voice bot runs as the collabfm-voice Docker service. Verify credentials here; restart that container to apply token changes."
      : "Save credentials, verify them, then use Start bot — or leave enabled and the backend will start it automatically after verify/startup.",
  };
}

function resolveVoiceBotCredentials(body = {}) {
  const current = getSetting("voiceBot", {});
  const clientId = body.clientId != null ? String(body.clientId).trim() : current.clientId;
  const botToken = mergeSecretField(body.botToken, current.botToken);
  return { clientId, botToken, current };
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

function forbidden(res) {
  return json(res, 403, { error: "Admin required" });
}

export async function handleAdminRoutes(req, res, pathname, method) {
  if (!pathname.startsWith("/api/admin")) return false;
  if (!isAdminSession(req)) return forbidden(res);

  if (pathname === "/api/admin/users" && method === "GET") {
    const { publicLevelInfo } = await import("../db/userLevel.js");
    return json(res, 200, {
      users: listUsers().map((u) => {
        const presentation = publicUserPresentation(u);
        const roleInfo = roleInfoForUser(u);
        return {
          ...u,
          block_guest_action_xp: !!u.block_guest_action_xp,
          level: publicLevelInfo(u),
          nickname: String(u.display_name || "").trim() || null,
          displayName: presentation?.displayName ?? u.username,
          avatar: presentation?.avatar ?? null,
          bio: presentation?.bio ?? null,
          genres: presentation?.genres ?? [],
          roleColor: roleInfo.roleColor,
          last_login_ip: u.last_login_ip ?? null,
        };
      }),
    });
  }

  if (pathname === "/api/admin/users" && method === "POST") {
    try {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const role = body.role || "listener";
      if (!username || !password) return json(res, 400, { error: "Username and password required" });
      if (!["admin", "broadcaster", "listener"].includes(role)) {
        return json(res, 400, { error: "Invalid role" });
      }
      const passwordHash = await hashPassword(password);
      const { createLocalUser } = await import("../db/index.js");
      const user = createLocalUser({ username, passwordHash, role });
      return json(res, 201, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          auth_source: user.auth_source,
        },
      });
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return json(res, 409, { error: "Username taken" });
      return json(res, 400, { error: "Invalid request" });
    }
  }

  const userMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch) {
    const id = Number(userMatch[1]);
    if (method === "PATCH") {
      try {
        const body = await readBody(req);
        const session = getAppSession(req);
        const existing = getUserById(id);
        if (!existing) return json(res, 404, { error: "Not found" });

        if (
          session &&
          String(id) === session.user.id &&
          existing.role === "admin" &&
          body.role &&
          body.role !== "admin"
        ) {
          return json(res, 400, { error: "You cannot remove your own admin role" });
        }

        const fields = {};
        if (body.role && ["admin", "broadcaster", "listener"].includes(body.role)) {
          fields.role = body.role;
        }
        if (typeof body.enabled === "boolean") fields.enabled = body.enabled ? 1 : 0;
        if (body.username) fields.username = String(body.username).trim();
        if (body.password) {
          if (existing.auth_source !== "local") {
            return json(res, 400, { error: "Cannot set password for OIDC users" });
          }
          const password = String(body.password);
          if (password.length < 8) {
            return json(res, 400, { error: "Password must be at least 8 characters" });
          }
          fields.password_hash = await hashPassword(password);
        }
        if (typeof body.blockGuestActionXp === "boolean") {
          fields.block_guest_action_xp = body.blockGuestActionXp ? 1 : 0;
        }
        const user = updateUser(id, fields);
        if (!user) return json(res, 404, { error: "Not found" });
        const { publicLevelInfo } = await import("../db/userLevel.js");
        const presentation = publicUserPresentation(user);
        const roleInfo = roleInfoForUser(user);
        updateSitePresenceActorProfile(String(user.id), {
          displayName: presentation.displayName || user.username,
          avatar: presentation.avatar,
          roleColor: roleInfo.roleColor,
          roleType: user.role,
          level: presentation.level?.level,
        });
        publishPresenceRoster(listSitePresenceRoster());
        publishProfileChanged({
          userId: String(user.id),
          isGuest: false,
          profile: {
            userId: String(user.id),
            username: user.username,
            displayName: presentation.displayName || user.username,
            avatarUrl: presentation.avatar,
            bio: presentation.bio,
            genres: presentation.genres,
            level: presentation.level,
            roleColor: roleInfo.roleColor,
            roleType: user.role,
            enabled: !!user.enabled,
          },
        });
        refreshChatTypingForActor(String(user.id), {
          displayName: presentation.displayName || user.username,
          avatar: presentation.avatar,
          roleType: user.role,
          isGuest: false,
        });
        return json(res, 200, {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            enabled: !!user.enabled,
            experience_points: user.experience_points ?? 0,
            block_guest_action_xp: !!user.block_guest_action_xp,
            level: publicLevelInfo(user),
          },
        });
      } catch {
        return json(res, 400, { error: "Invalid request" });
      }
    }
    if (method === "DELETE") {
      const session = getAppSession(req);
      if (String(id) === session?.user?.id) {
        return json(res, 400, { error: "Cannot delete yourself" });
      }
      const existing = getUserById(id);
      if (!existing) return json(res, 404, { error: "Not found" });
      if (existing.role === "admin") {
        const adminCount = listUsers().filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return json(res, 400, { error: "Cannot delete the last admin account" });
        }
      }
      deleteUser(id);
      return json(res, 200, { ok: true });
    }
  }

  const resetXpMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/reset-xp$/);
  if (resetXpMatch && method === "POST") {
    const id = Number(resetXpMatch[1]);
    const { resetUserXp, publicLevelInfo } = await import("../db/userLevel.js");
    const existing = getUserById(id);
    if (!existing) return json(res, 404, { error: "Not found" });
    resetUserXp(id);
    const user = getUserById(id);
    return json(res, 200, {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        experience_points: user.experience_points ?? 0,
        level: publicLevelInfo(user),
      },
    });
  }

  if (pathname === "/api/admin/oidc" && method === "GET") {
    const { normalizeOidcConfig } = await import("../auth/oidcUser.js");
    const oidc = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
    return json(res, 200, {
      oidc: { ...oidc, clientSecret: oidc.clientSecret ? "********" : "" },
      mappings: listOidcGroupMappings(),
      oidcOnlyUserCount: countOidcOnlyUsers(),
    });
  }

  if (pathname === "/api/admin/oidc" && method === "PUT") {
    try {
      const body = await readBody(req);
      const { mergeOidcConfigUpdate, normalizeOidcConfig } = await import("../auth/oidcUser.js");
      const current = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
      const next = mergeOidcConfigUpdate(current, body.oidc ?? {});
      setSetting("oidc", next);
      if (Array.isArray(body.mappings)) {
        replaceOidcGroupMappings(body.mappings);
      }
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/api/admin/oidc/mappings" && method === "POST") {
    const body = await readBody(req);
    if (!body.oidc_group || !body.role) return json(res, 400, { error: "Missing fields" });
    setOidcGroupMapping(body.oidc_group, body.role);
    return json(res, 200, { ok: true });
  }

  const mapDel = pathname.match(/^\/api\/admin\/oidc\/mappings\/(.+)$/);
  if (mapDel && method === "DELETE") {
    removeOidcGroupMapping(decodeURIComponent(mapDel[1]));
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/discord/whitelist" && method === "GET") {
    return json(res, 200, { entries: listWhitelist() });
  }

  if (pathname === "/api/admin/discord/whitelist" && method === "POST") {
    const body = await readBody(req);
    if (!body.guild_id) return json(res, 400, { error: "guild_id required" });
    upsertWhitelistEntry(String(body.guild_id), body.label, body.enabled !== false);
    return json(res, 200, { ok: true });
  }

  const wlDel = pathname.match(/^\/api\/admin\/discord\/whitelist\/(.+)$/);
  if (wlDel && method === "DELETE") {
    removeWhitelistEntry(decodeURIComponent(wlDel[1]));
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/settings" && method === "GET") {
    return json(res, 200, {
      publicBaseUrl: getSetting("publicBaseUrl", ""),
      allowedOrigins: getSetting("allowedOrigins", ["*"]),
      maintenanceMode: getSetting("maintenanceMode", false),
      database: { type: "sqlite", path: "storage/radio.db" },
      branding: getBrandingSettings(),
      integrations: integrationsAdminPayload(),
      leveling: {
        guestActionsGrantXp: getSetting("leveling.guestActionsGrantXp", true) !== false,
        blockGuestXpMatchingStageIp:
          getSetting("leveling.blockGuestXpMatchingStageIp", true) !== false,
      },
      broadcast: {
        extensionRequirePairing:
          getSetting("broadcast.extensionRequirePairing", true) !== false,
      },
      ...operationalSettingsAdminPayload(),
    });
  }

  if (pathname === "/api/admin/voice-bot" && method === "GET") {
    return json(res, 200, voiceBotPayload());
  }

  if (pathname === "/api/admin/voice-bot/status" && method === "GET") {
    return json(res, 200, { runtime: getVoiceBotRuntimeStatus() });
  }

  if (pathname === "/api/admin/voice-bot/verify" && method === "POST") {
    try {
      const body = await readBody(req);
      const { clientId, botToken } = resolveVoiceBotCredentials(body);
      const result = await verifyVoiceBotCredentials({ clientId, botToken });
      if (!result.ok) {
        return json(res, 400, { ok: false, ...result });
      }

      const current = getSetting("voiceBot", {});
      const fingerprint = credentialsFingerprint(clientId, botToken);
      setSetting("voiceBot", {
        ...current,
        clientId,
        botToken,
        verified: {
          at: Date.now(),
          botId: result.botId,
          botUsername: result.botUsername,
          applicationId: result.applicationId,
          applicationName: result.applicationName,
          fingerprint,
        },
      });

      const autoStart = maybeAutoStartManagedVoiceBot({ reason: "verify" });

      return json(res, 200, {
        ok: true,
        botUsername: result.botUsername,
        botId: result.botId,
        applicationName: result.applicationName,
        voiceBot: voiceBotPayload(),
        autoStart,
        runtime: getVoiceBotRuntimeStatus(),
      });
    } catch {
      return json(res, 400, { ok: false, error: "Invalid request" });
    }
  }

  if (pathname === "/api/admin/voice-bot/start" && method === "POST") {
    const voiceBot = getVoiceBotConfig();
    if (!voiceBot.clientId || !voiceBot.botToken) {
      return json(res, 400, { ok: false, error: "Configure Application ID and bot token first" });
    }
    if (!voiceBot.verified?.at) {
      return json(res, 400, { ok: false, error: "Verify credentials before starting the voice bot" });
    }
    const fp = credentialsFingerprint(voiceBot.clientId, voiceBot.botToken);
    if (voiceBot.verified.fingerprint && voiceBot.verified.fingerprint !== fp) {
      return json(res, 400, { ok: false, error: "Credentials changed since last verification — verify again" });
    }
    const result = startManagedVoiceBot();
    if (!result.ok) return json(res, 400, result);
    return json(res, 200, { ...result, runtime: getVoiceBotRuntimeStatus() });
  }

  if (pathname === "/api/admin/voice-bot/stop" && method === "POST") {
    const result = stopManagedVoiceBot();
    if (!result.ok) return json(res, 400, result);
    return json(res, 200, { ...result, runtime: getVoiceBotRuntimeStatus() });
  }

  if (pathname === "/api/admin/voice-bot" && method === "PUT") {
    try {
      const body = await readBody(req);
      const { clientId, botToken, current } = resolveVoiceBotCredentials(body);
      const next = {
        ...current,
        clientId,
        enabled: body.enabled != null ? !!body.enabled : current.enabled !== false,
        botToken,
      };
      if (body.publicBaseUrl != null) {
        setSetting(
          "publicBaseUrl",
          String(body.publicBaseUrl).trim().replace(/\/+$/, ""),
        );
      }
      const fp = credentialsFingerprint(clientId, botToken);
      if (current.verified?.fingerprint && current.verified.fingerprint !== fp) {
        delete next.verified;
      }
      setSetting("voiceBot", next);
      const autoStart = maybeAutoStartManagedVoiceBot({ reason: "save" });
      return json(res, 200, { ok: true, voiceBot: voiceBotPayload(), autoStart });
    } catch {
      return json(res, 400, { error: "Invalid request" });
    }
  }

  if (pathname === "/api/admin/stream" && method === "GET") {
    return json(res, 200, {
      listeners: getActiveListenerCount(),
      sessionStreamUrl: "/api/stream",
      note: "Stream is encoded once in-process and fan-out to authenticated listeners. Use share links for guests or OBS.",
    });
  }

  if (pathname === "/api/admin/share-links" && method === "GET") {
    const base = resolvePublicBaseUrl(req);
    const links = listShareLinks().map((row) => {
      const link = enrichShareLink(row, base);
      if (row.created_by) {
        const user = getUserById(Number(row.created_by));
        if (user) {
          link.createdBy = {
            id: user.id,
            username: user.username,
            displayName: publicDisplayName(user),
            role: user.role,
          };
        }
      }
      return link;
    });
    return json(res, 200, {
      links,
      ttlOptions: LISTENER_TTL_OPTIONS,
      listenerTtlOptions: LISTENER_TTL_OPTIONS,
      guestBroadcasterTtlOptions: GUEST_BROADCASTER_TTL_OPTIONS,
    });
  }

  if (pathname === "/api/admin/share-links" && method === "POST") {
    try {
      const body = await readBody(req);
      const session = getAppSession(req);
      const guestMode = body.guestMode === "guest_broadcaster" ? "guest_broadcaster" : "listener";
      const ttl =
        guestMode === "guest_broadcaster"
          ? GUEST_BROADCASTER_TTL_OPTIONS.includes(body.ttl)
            ? body.ttl
            : "24h"
          : LISTENER_TTL_OPTIONS.includes(body.ttl)
            ? body.ttl
            : "never";
      const link = createShareLink({
        label: body.label ? String(body.label).trim() : null,
        linkKind: "ui",
        guestMode,
        ttl,
        createdBy: session?.user?.id ? Number(session.user.id) : null,
      });
      const base = resolvePublicBaseUrl(req);
      return json(res, 201, { link: enrichShareLink(link, base) });
    } catch (e) {
      return json(res, 400, { error: e.message || "Invalid request" });
    }
  }

  const shareDel = pathname.match(/^\/api\/admin\/share-links\/(\d+)$/);
  if (shareDel && method === "DELETE") {
    revokeShareLink(Number(shareDel[1]));
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/branding/visualizer" && method === "POST") {
    try {
      const body = await readBrandingBody(req);
      const data = String(body.data || "");
      const mimeType = String(body.mimeType || "image/png");
      if (!data) return json(res, 400, { error: "Image data required" });
      const buffer = Buffer.from(data, "base64");
      saveCustomVisualizer(buffer, mimeType);
      return json(res, 200, { ok: true, branding: getBrandingSettings() });
    } catch (e) {
      return json(res, 400, { error: e.message || "Upload failed" });
    }
  }

  if (pathname === "/api/admin/settings" && method === "PUT") {
    try {
      const body = await readBody(req);
      if (body.publicBaseUrl != null) setSetting("publicBaseUrl", body.publicBaseUrl);
      if (body.allowedOrigins != null) setSetting("allowedOrigins", body.allowedOrigins);
      if (body.maintenanceMode != null) setSetting("maintenanceMode", !!body.maintenanceMode);
      if (body.branding?.radioDisplayName != null) {
        setSetting(
          "radioDisplayName",
          String(body.branding.radioDisplayName).trim() || "CollabFM Radio",
        );
      }
      if (body.resetBranding) {
        resetBrandingSettings();
      }
      if (body.integrations) {
        saveIntegrationsSettings(body.integrations);
      }
      if (body.leveling && typeof body.leveling.guestActionsGrantXp === "boolean") {
        setSetting("leveling.guestActionsGrantXp", body.leveling.guestActionsGrantXp);
      }
      if (body.leveling && typeof body.leveling.blockGuestXpMatchingStageIp === "boolean") {
        setSetting("leveling.blockGuestXpMatchingStageIp", body.leveling.blockGuestXpMatchingStageIp);
      }
      if (body.broadcast && typeof body.broadcast.extensionRequirePairing === "boolean") {
        setSetting("broadcast.extensionRequirePairing", body.broadcast.extensionRequirePairing);
      }
      let operational = operationalSettingsAdminPayload();
      if (body.limits || body.audio) {
        operational = saveOperationalSettings({ limits: body.limits, audio: body.audio });
      }
      return json(res, 200, {
        ok: true,
        branding: getBrandingSettings(),
        integrations: integrationsAdminPayload(),
        leveling: {
          guestActionsGrantXp: getSetting("leveling.guestActionsGrantXp", true) !== false,
          blockGuestXpMatchingStageIp:
            getSetting("leveling.blockGuestXpMatchingStageIp", true) !== false,
        },
        broadcast: {
          extensionRequirePairing:
            getSetting("broadcast.extensionRequirePairing", true) !== false,
        },
        ...operational,
      });
    } catch (e) {
      return json(res, 400, { error: e.message || "Invalid request" });
    }
  }

  return json(res, 404, { error: "Not found" });
}

export async function handlePublicDiscordRoutes(req, res, pathname, method) {
  const wlMatch = pathname.match(/^\/api\/discord\/whitelist\/(.+)$/);
  if (wlMatch && method === "GET") {
    if (!getAppSession(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }
    const { isGuildWhitelisted } = await import("../db/index.js");
    const guildId = decodeURIComponent(wlMatch[1]);
    return json(res, 200, { guildId, allowed: isGuildWhitelisted(guildId) });
  }
  return false;
}
