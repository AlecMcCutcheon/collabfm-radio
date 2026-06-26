import { proceduralAvatarArt } from "./proceduralArt";

/** Cover icon id 25 — Lucide-style robot emblem in guestCoverIcons. */
export const DISCORD_BOT_COVER_ICON_ID = 25;

const DISCORD_BOT_AVATAR_SEED = "collabfm-discord-voice-bot";

export function discordBotReactorAvatarSrc(size = 96): string {
  return proceduralAvatarArt(DISCORD_BOT_AVATAR_SEED, size, DISCORD_BOT_COVER_ICON_ID);
}

export function isDiscordReactorUserId(userId: string): boolean {
  return String(userId || "").startsWith("discord:");
}
