import { apiUrl } from "../config";
import type { PartyEffectReactor } from "../types/api";
import { avatarSrc, guestAvatarSrc } from "./avatar";
import {
  discordBotReactorAvatarSrc,
  isDiscordReactorUserId,
} from "./discordBotReactorAvatar";

export function partyReactorAvatarSrc(reactor: PartyEffectReactor, size = 96): string {
  if (reactor.avatarUrl) return apiUrl(reactor.avatarUrl);
  if (isDiscordReactorUserId(reactor.userId)) {
    return discordBotReactorAvatarSrc(size);
  }
  if (reactor.userId.startsWith("guest:")) {
    const guestId = reactor.userId.slice(6);
    return guestAvatarSrc(
      guestId,
      reactor.avatarVariant ?? 0,
      size,
      reactor.coverIcon ?? 0,
    );
  }
  return avatarSrc(reactor.userId, size);
}
