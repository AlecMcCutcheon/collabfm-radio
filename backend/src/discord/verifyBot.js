import crypto from "node:crypto";
import fetch from "node-fetch";

/**
 * Verify Discord application ID + bot token against the Discord API.
 */
export async function verifyVoiceBotCredentials({ clientId, botToken }) {
  const appId = String(clientId || "").trim();
  const token = String(botToken || "").trim();

  if (!appId || !token) {
    return { ok: false, error: "Application ID and bot token are required" };
  }
  if (!/^\d{17,20}$/.test(appId)) {
    return { ok: false, error: "Application ID must be a numeric Discord snowflake" };
  }

  try {
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (userRes.status === 401) {
      return { ok: false, error: "Invalid bot token — Discord rejected authentication" };
    }
    if (!userRes.ok) {
      console.error(
        "[VoiceBot] Discord users/@me failed:",
        userRes.status,
        (await userRes.text()).slice(0, 200),
      );
      return { ok: false, error: "Discord API error" };
    }

    const botUser = await userRes.json();
    if (!botUser?.bot) {
      return { ok: false, error: "Token is valid but does not belong to a bot account" };
    }

    const appRes = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!appRes.ok) {
      console.error("[VoiceBot] Discord applications/@me failed:", appRes.status);
      return {
        ok: false,
        error: "Bot token works but could not read application info — check token scopes",
      };
    }

    const application = await appRes.json();
    const applicationId = String(application.id || "");
    if (applicationId !== appId) {
      return {
        ok: false,
        error: "Application ID does not match the bot token's application",
        botUsername: botUser.username,
        botId: botUser.id,
        applicationId,
      };
    }

    return {
      ok: true,
      botId: botUser.id,
      botUsername: botUser.username,
      botDiscriminator: botUser.discriminator,
      applicationId,
      applicationName: application.name || null,
    };
  } catch (err) {
    console.error("[VoiceBot] verify credentials failed:", err);
    return { ok: false, error: "Could not reach Discord" };
  }
}

export function credentialsFingerprint(clientId, botToken) {
  return crypto
    .createHash("sha256")
    .update(`${String(clientId || "").trim()}|${String(botToken || "").trim()}`)
    .digest("hex");
}
