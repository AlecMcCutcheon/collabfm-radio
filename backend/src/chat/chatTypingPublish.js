import {
  hasChatTypingActor,
  listChatTypers,
  updateChatTypingActorProfile,
} from "./chatTypingStore.js";
import { enrichChatTyperForApi } from "../http/chatMessages.js";
import { publishChatTypingChanged } from "../http/liveEvents.js";

export function listEnrichedChatTypers() {
  return listChatTypers().map((entry) => enrichChatTyperForApi(entry));
}

export function publishChatTypingRoster() {
  publishChatTypingChanged(listEnrichedChatTypers());
}

export function refreshChatTypingForActor(actorId, patch = {}) {
  const id = String(actorId || "").trim();
  if (!id) return false;

  if (patch && Object.keys(patch).length > 0) {
    updateChatTypingActorProfile(id, patch);
  }

  if (!hasChatTypingActor(id)) return false;
  publishChatTypingRoster();
  return true;
}
