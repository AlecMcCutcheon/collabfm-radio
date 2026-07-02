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
import { getVoiceBotConfig, mergeSecretField, normalizeVoiceMessageCleanupSettings } from "../settings/runtime.js";
import {
  integrationsAdminPayload,
  saveIntegrationsSettings,
} from "../settings/integrations.js";
import {
  operationalSettingsAdminPayload,
  saveOperationalSettings,
} from "../settings/operational.js";
import {
  saveSecuritySettings,
  securitySettingsAdminPayload,
} from "../settings/security.js";
import { handleRegistrationAdminRoutes } from "../auth/registrationRoutes.js";
import { resolveEmailFromOidcProfile } from "../auth/oidcUser.js";
import { hasPasswordHash } from "../auth/hybridPassword.js";
import {
  legacyOidcIdentityStatus,
  reconcileOidcUsernameFromStoredProfile,
} from "../auth/legacyOidcIdentity.js";
import { getRegistrationRequestById } from "../db/registrationRequests.js";
import { looksLikeLoginEmail, normalizeLoginEmail } from "../db/index.js";
import {
  checkForContainerUpdate,
  getContainerUpdateSettings,
  saveContainerUpdateSettings,
} from "./containerUpdates.js";
import { getBuildInfo } from "../radio/buildInfo.js";
import {
  createShareLink,
  enrichShareLink,
  listShareLinks,
  revokeShareLink,
  ADMIN_LISTENER_LINK_TTL,
  ADMIN_GUEST_BROADCASTER_TTL,
  resolveTtlForCreate,
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
import {
  writeAdminJsonError,
  writeAdminJsonFailure,
  voiceBotClientError,
} from "../security/clientErrors.js";

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
      messageCleanup: normalizeVoiceMessageCleanupSettings(voiceBot.messageCleanup),
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
      } catch {
        reject(new Error("Invalid request"));
      }
    });
    req.on("error", () => reject(new Error("Invalid request")));
  });
}

function forbidden(res) {
  return writeAdminJsonError(res, 403, "Admin required");
}

function resolveAdminLoginEmail(user) {
  const stored = normalizeLoginEmail(user.login_email);
  if (stored) return stored;
  if (user.auth_source === "oidc") {
    const profileEmail = resolveEmailFromOidcProfile(user);
    if (profileEmail) return profileEmail;
    if (hasPasswordHash(user) && looksLikeLoginEmail(user.username)) {
      return normalizeLoginEmail(user.username);
    }
    return null;
  }
  if (user.registration_request_id) {
    const request = getRegistrationRequestById(user.registration_request_id);
    if (request?.email) return normalizeLoginEmail(request.email);
  }
  return null;
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
          has_password: !!(u.password_hash && String(u.password_hash).trim()),
          totp_enabled: Number(u.totp_enabled) === 1,
          level: publicLevelInfo(u),
          nickname: String(u.display_name || "").trim() || null,
          displayName: presentation?.displayName ?? u.username,
          loginEmail: resolveAdminLoginEmail(u),
          oidcSubject: u.oidc_subject || null,
          legacyOidcIdentity: legacyOidcIdentityStatus(u),
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
      if (!username || !password) return writeAdminJsonError(res, 400, "Username and password required");
      if (!["admin", "broadcaster", "listener"].includes(role)) {
        return writeAdminJsonError(res, 400, "Invalid role");
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
      console.error("[admin] create user failed:", e);
      if (String(e?.message || "").includes("UNIQUE")) {
        return writeAdminJsonError(res, 409, "Username taken");
      }
      return writeAdminJsonError(res, 400, "Invalid request");
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
        if (!existing) return writeAdminJsonError(res, 404, "Not found");

        if (
          session &&
          String(id) === session.user.id &&
          existing.role === "admin" &&
          body.role &&
          body.role !== "admin"
        ) {
          return writeAdminJsonError(res, 400, "You cannot remove your own admin role");
        }

        const fields = {};
        if (body.role && ["admin", "broadcaster", "listener"].includes(body.role)) {
          fields.role = body.role;
        }
        if (typeof body.enabled === "boolean") fields.enabled = body.enabled ? 1 : 0;
        if (body.username) fields.username = String(body.username).trim();
        if (body.password) {
          const { normalizeOidcConfig } = await import("../auth/oidcUser.js");
          const { applyHybridOidcPassword, hasPasswordHash } = await import(
            "../auth/hybridPassword.js"
          );
          const oidcCfg = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
          const password = String(body.password);
          if (password.length < 8) {
            return writeAdminJsonError(res, 400, "Password must be at least 8 characters");
          }

          if (existing.auth_source === "oidc") {
            if (oidcCfg.hybridUsersEnabled !== true) {
              return writeAdminJsonError(res, 400, "Cannot set password for OIDC users");
            }
            const isFirstPassword = !hasPasswordHash(existing);
            const hybridResult = await applyHybridOidcPassword(existing, password, {
              requireEmailOnFile: isFirstPassword,
            });
            if (hybridResult.error) {
              return writeAdminJsonError(res, hybridResult.status, hybridResult.error);
            }
            const user = hybridResult.user;
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
                auth_source: user.auth_source,
                enabled: !!user.enabled,
                has_password: true,
                experience_points: user.experience_points ?? 0,
                block_guest_action_xp: !!user.block_guest_action_xp,
                level: publicLevelInfo(user),
              },
              loginEmailAssigned: hybridResult.loginEmailAssigned === true,
              loginEmail: hybridResult.loginEmail || null,
            });
          }

          if (existing.auth_source !== "local") {
            return writeAdminJsonError(res, 400, "Cannot set password for this account type");
          }
          fields.password_hash = await hashPassword(password);
        }
        if (typeof body.blockGuestActionXp === "boolean") {
          fields.block_guest_action_xp = body.blockGuestActionXp ? 1 : 0;
        }
        const user = updateUser(id, fields);
        if (!user) return writeAdminJsonError(res, 404, "Not found");
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
      } catch (e) {
        console.error("[admin] update user failed:", e);
        return writeAdminJsonError(res, 400, "Invalid request");
      }
    }
    if (method === "DELETE") {
      const session = getAppSession(req);
      if (String(id) === session?.user?.id) {
        return writeAdminJsonError(res, 400, "Cannot delete yourself");
      }
      const existing = getUserById(id);
      if (!existing) return writeAdminJsonError(res, 404, "Not found");
      if (existing.role === "admin") {
        const adminCount = listUsers().filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return writeAdminJsonError(res, 400, "Cannot delete the last admin account");
        }
      }
      deleteUser(id);
      return json(res, 200, { ok: true });
    }
  }

  const refreshOidcEmailMatch = pathname.match(
    /^\/api\/admin\/users\/(\d+)\/refresh-oidc-email$/,
  );
  if (refreshOidcEmailMatch && method === "POST") {
    const id = Number(refreshOidcEmailMatch[1]);
    const existing = getUserById(id);
    if (!existing) return writeAdminJsonError(res, 404, "Not found");
    const { normalizeOidcConfig } = await import("../auth/oidcUser.js");
    const { refreshOidcLoginEmail } = await import("../auth/oidcEmailRefresh.js");
    const oidc = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
    const result = await refreshOidcLoginEmail(existing, oidc);
    if (result.error) {
      return json(res, result.status || 400, {
        error: result.error,
        needsSsoVerification: result.needsSsoVerification === true,
        needsIdpAdminToken: result.needsIdpAdminToken === true,
      });
    }
    const user = result.user;
    const { publicLevelInfo } = await import("../db/userLevel.js");
    const presentation = publicUserPresentation(user);
    const roleInfo = roleInfoForUser(user);
    return json(res, 200, {
      ok: true,
      refreshed: result.refreshed === true,
      email: result.email,
      source: result.source,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        auth_source: user.auth_source,
        enabled: !!user.enabled,
        has_password: !!(user.password_hash && String(user.password_hash).trim()),
        totp_enabled: Number(user.totp_enabled) === 1,
        level: publicLevelInfo(user),
        nickname: String(user.display_name || "").trim() || null,
        displayName: presentation?.displayName ?? user.username,
        loginEmail: resolveAdminLoginEmail(user),
        oidcSubject: user.oidc_subject || null,
        legacyOidcIdentity: legacyOidcIdentityStatus(user),
        avatar: presentation?.avatar ?? null,
        roleColor: roleInfo.roleColor,
      },
    });
  }

  const reconcileOidcMatch = pathname.match(
    /^\/api\/admin\/users\/(\d+)\/reconcile-oidc-username$/,
  );
  if (reconcileOidcMatch && method === "POST") {
    const id = Number(reconcileOidcMatch[1]);
    const existing = getUserById(id);
    if (!existing) return writeAdminJsonError(res, 404, "Not found");
    const result = reconcileOidcUsernameFromStoredProfile(existing);
    if (result.error) {
      return json(res, result.status || 400, {
        error: result.error,
        needsSsoVerification: result.needsSsoVerification === true,
      });
    }
    const user = result.user;
    const { publicLevelInfo } = await import("../db/userLevel.js");
    const presentation = publicUserPresentation(user);
    const roleInfo = roleInfoForUser(user);
    return json(res, 200, {
      ok: true,
      reconciled: result.reconciled === true,
      providerSub: result.providerSub,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        auth_source: user.auth_source,
        enabled: !!user.enabled,
        has_password: !!(user.password_hash && String(user.password_hash).trim()),
        totp_enabled: Number(user.totp_enabled) === 1,
        experience_points: user.experience_points ?? 0,
        block_guest_action_xp: !!user.block_guest_action_xp,
        level: publicLevelInfo(user),
        nickname: String(user.display_name || "").trim() || null,
        displayName: presentation?.displayName ?? user.username,
        loginEmail: resolveAdminLoginEmail(user),
        oidcSubject: user.oidc_subject || null,
        legacyOidcIdentity: legacyOidcIdentityStatus(user),
        avatar: presentation?.avatar ?? null,
        bio: presentation?.bio ?? null,
        genres: presentation?.genres ?? [],
        roleColor: roleInfo.roleColor,
        last_login_ip: user.last_login_ip ?? null,
      },
    });
  }

  const resetTotpMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/reset-totp$/);
  if (resetTotpMatch && method === "POST") {
    const id = Number(resetTotpMatch[1]);
    const existing = getUserById(id);
    if (!existing) return writeAdminJsonError(res, 404, "Not found");
    const { adminResetUserTotp } = await import("../auth/totp.js");
    const { deleteUserSessions } = await import("../db/index.js");
    adminResetUserTotp(id);
    deleteUserSessions(id);
    const user = getUserById(id);
    const { publicLevelInfo } = await import("../db/userLevel.js");
    return json(res, 200, {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        auth_source: user.auth_source,
        enabled: !!user.enabled,
        has_password: !!(user.password_hash && String(user.password_hash).trim()),
        totp_enabled: false,
        experience_points: user.experience_points ?? 0,
        block_guest_action_xp: !!user.block_guest_action_xp,
        level: publicLevelInfo(user),
      },
    });
  }

  const resetXpMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/reset-xp$/);
  if (resetXpMatch && method === "POST") {
    const id = Number(resetXpMatch[1]);
    const { resetUserXp, publicLevelInfo } = await import("../db/userLevel.js");
    const existing = getUserById(id);
    if (!existing) return writeAdminJsonError(res, 404, "Not found");
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
      oidc: {
        ...oidc,
        clientSecret: oidc.clientSecret ? "********" : "",
        providerAdminToken: oidc.providerAdminToken ? "********" : "",
      },
      mappings: listOidcGroupMappings(),
      oidcOnlyUserCount: countOidcOnlyUsers(),
    });
  }

  if (pathname === "/api/admin/oidc/refresh-legacy-emails" && method === "POST") {
    const { normalizeOidcConfig } = await import("../auth/oidcUser.js");
    const { refreshAllLegacyOidcEmails } = await import("../auth/oidcEmailRefresh.js");
    const oidc = normalizeOidcConfig(getSetting("oidc", { enabled: false }));
    if (oidc.enabled !== true) {
      return writeAdminJsonError(res, 400, "OIDC must be enabled to refresh SSO emails");
    }
    const summary = await refreshAllLegacyOidcEmails(oidc);
    return json(res, 200, { ok: true, summary });
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
    } catch (e) {
      console.error("[admin] save OIDC failed:", e);
      return writeAdminJsonError(res, 400, "Invalid request");
    }
  }

  if (pathname === "/api/admin/oidc/mappings" && method === "POST") {
    const body = await readBody(req);
    if (!body.oidc_group || !body.role) return writeAdminJsonError(res, 400, "Missing fields");
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
    if (!body.guild_id) return writeAdminJsonError(res, 400, "guild_id required");
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
      updates: getContainerUpdateSettings(),
      build: getBuildInfo(),
      security: securitySettingsAdminPayload(),
      ...operationalSettingsAdminPayload(),
    });
  }

  if (pathname === "/api/admin/container-updates" && method === "GET") {
    const status = await checkForContainerUpdate();
    return json(res, 200, status);
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
        return writeAdminJsonFailure(
          res,
          400,
          voiceBotClientError(result, "Could not verify Discord credentials"),
        );
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
    } catch (e) {
      console.error("[admin] verify voice bot failed:", e);
      return writeAdminJsonFailure(res, 400, "Invalid request");
    }
  }

  if (pathname === "/api/admin/voice-bot/start" && method === "POST") {
    const voiceBot = getVoiceBotConfig();
    if (!voiceBot.clientId || !voiceBot.botToken) {
      return writeAdminJsonFailure(res, 400, "Configure Application ID and bot token first");
    }
    if (!voiceBot.verified?.at) {
      return writeAdminJsonFailure(res, 400, "Verify credentials before starting the voice bot");
    }
    const fp = credentialsFingerprint(voiceBot.clientId, voiceBot.botToken);
    if (voiceBot.verified.fingerprint && voiceBot.verified.fingerprint !== fp) {
      return writeAdminJsonFailure(
        res,
        400,
        "Credentials changed since last verification — verify again",
      );
    }
    const result = startManagedVoiceBot();
    if (!result.ok) {
      return writeAdminJsonFailure(res, 400, voiceBotClientError(result));
    }
    return json(res, 200, { ...result, runtime: getVoiceBotRuntimeStatus() });
  }

  if (pathname === "/api/admin/voice-bot/stop" && method === "POST") {
    const result = stopManagedVoiceBot();
    if (!result.ok) {
      return writeAdminJsonFailure(res, 400, voiceBotClientError(result));
    }
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
      if (body.messageCleanup != null) {
        next.messageCleanup = normalizeVoiceMessageCleanupSettings(body.messageCleanup);
      }
      const fp = credentialsFingerprint(clientId, botToken);
      if (current.verified?.fingerprint && current.verified.fingerprint !== fp) {
        delete next.verified;
      }
      setSetting("voiceBot", next);
      const autoStart = maybeAutoStartManagedVoiceBot({ reason: "save" });
      return json(res, 200, { ok: true, voiceBot: voiceBotPayload(), autoStart });
    } catch (e) {
      console.error("[admin] save voice bot failed:", e);
      return writeAdminJsonError(res, 400, "Invalid request");
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
      ttlOptions: ADMIN_LISTENER_LINK_TTL,
      listenerTtlOptions: ADMIN_LISTENER_LINK_TTL,
      guestBroadcasterTtlOptions: ADMIN_GUEST_BROADCASTER_TTL,
    });
  }

  if (pathname === "/api/admin/share-links" && method === "POST") {
    try {
      const body = await readBody(req);
      const session = getAppSession(req);
      const guestMode = body.guestMode === "guest_broadcaster" ? "guest_broadcaster" : "listener";
      const creatorRole = session?.user?.role === "admin" ? "admin" : "broadcaster";
      const ttl = resolveTtlForCreate({ role: creatorRole, guestMode, ttl: body.ttl });
      const link = createShareLink({
        label: body.label ? String(body.label).trim() : null,
        linkKind: "ui",
        guestMode,
        ttl,
        createdBy: session?.user?.id ? Number(session.user.id) : null,
        creatorRole,
      });
      const base = resolvePublicBaseUrl(req);
      return json(res, 201, { link: enrichShareLink(link, base) });
    } catch (e) {
      console.error("[admin] create share link failed:", e);
      return writeAdminJsonError(res, 400, "Invalid request");
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
      if (!data) return writeAdminJsonError(res, 400, "Image data required");
      const buffer = Buffer.from(data, "base64");
      saveCustomVisualizer(buffer, mimeType);
      return json(res, 200, { ok: true, branding: getBrandingSettings() });
    } catch (e) {
      console.error("[admin] visualizer upload failed:", e);
      return writeAdminJsonError(res, 400, "Upload failed");
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
      if (body.branding && typeof body.branding.hideDeveloperAboutMessage === "boolean") {
        setSetting(
          "branding.hideDeveloperAboutMessage",
          body.branding.hideDeveloperAboutMessage,
        );
      }
      if (body.branding && typeof body.branding.branded2fa === "boolean") {
        setSetting("branding.branded2fa", body.branding.branded2fa);
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
      let security = securitySettingsAdminPayload();
      if (body.security && typeof body.security.localLogin2faRequired === "boolean") {
        security = saveSecuritySettings({
          localLogin2faRequired: body.security.localLogin2faRequired,
        });
      }
      let updates = getContainerUpdateSettings();
      if (body.updates) {
        updates = saveContainerUpdateSettings(body.updates);
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
        updates,
        build: getBuildInfo(),
        security,
        ...operational,
      });
    } catch (e) {
      console.error("[admin] save settings failed:", e);
      return writeAdminJsonError(res, 400, "Invalid request");
    }
  }

  const adminSession = getAppSession(req);
  const registrationAdminResult = await handleRegistrationAdminRoutes(
    req,
    res,
    pathname,
    method,
    adminSession ? Number(adminSession.user.id) : null,
  );
  if (registrationAdminResult !== false) return registrationAdminResult;

  return writeAdminJsonError(res, 404, "Not found");
}

export async function handlePublicDiscordRoutes(req, res, pathname, method) {
  const wlMatch = pathname.match(/^\/api\/discord\/whitelist\/(.+)$/);
  if (wlMatch && method === "GET") {
    if (!getAppSession(req)) {
      return writeAdminJsonError(res, 401, "Unauthorized");
    }
    const { isGuildWhitelisted } = await import("../db/index.js");
    const guildId = decodeURIComponent(wlMatch[1]);
    return json(res, 200, { guildId, allowed: isGuildWhitelisted(guildId) });
  }
  return false;
}
