import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const VOICE_HEART_PREFIX = "voice-heart:";

export function voiceHeartCustomId(guildId, sessionId) {
  return `${VOICE_HEART_PREFIX}${guildId}:${sessionId}`;
}

export function parseVoiceHeartCustomId(customId) {
  if (!customId?.startsWith(VOICE_HEART_PREFIX)) return null;
  const rest = customId.slice(VOICE_HEART_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const guildId = rest.slice(0, colon);
  const sessionId = rest.slice(colon + 1);
  if (!guildId || !sessionId) return null;
  return { guildId, sessionId };
}

export function buildVoiceHeartButtonRow({ guildId, sessionId, enabled = true }) {
  const button = new ButtonBuilder()
    .setCustomId(voiceHeartCustomId(guildId, sessionId))
    .setLabel("Heart this track")
    .setEmoji("❤️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!enabled);

  return new ActionRowBuilder().addComponents(button);
}
