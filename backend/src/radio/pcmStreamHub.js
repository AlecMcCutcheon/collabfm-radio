/** PCM rail registry — live pointer + Discord tee. No PCM delay (encode is immediate). */

import {
  ensureRailEncoder,
  removeRailEncoder,
  setLiveMp3Rail,
  flushMp3OutboundBatch,
  feedRailPcm,
  getWebStreamDelayMs,
  getMp3DelayQueueDepthMs,
} from "./liveMp3Publisher.js";

export const PCM_FRAME_BYTES = 3840; // 20ms @ 48kHz stereo s16le

let publishing = false;
let liveRailId = null;
let onHandoffCommitted = null;
/** @type {((ctx: { frame: Buffer, railId: string, isLive: boolean }) => void) | null} */
let railDrainHandler = null;
/** @type {((ctx: { frame: Buffer, railId: string, isLive: boolean }) => void) | null} */
let pcmRelaySink = null;
/** @type {((liveRailId: string | null) => void) | null} */
let onLiveRailChanged = null;

const registeredRails = new Set();

export function configurePcmStreamHub() {
  /* webStreamDelayMs is configured on liveMp3Publisher via configureStreamHub. */
}

export function setStreamHubHandoffHandler(handler) {
  onHandoffCommitted = typeof handler === "function" ? handler : null;
}

export function setRailDrainHandler(handler) {
  railDrainHandler = typeof handler === "function" ? handler : null;
}

export function setPcmRelaySink(handler) {
  pcmRelaySink = typeof handler === "function" ? handler : null;
}

export function setLiveRailChangeHandler(handler) {
  onLiveRailChanged = typeof handler === "function" ? handler : null;
}

function notifyLiveRailChanged() {
  try {
    onLiveRailChanged?.(liveRailId);
  } catch {}
}

/** @deprecated use setRailDrainHandler */
export function setLivePcmFrameSink(handler) {
  setRailDrainHandler(({ frame, isLive }) => {
    if (isLive && handler) handler(frame);
  });
}

export { getWebStreamDelayMs };

export function getDelayQueueDepthMs() {
  return getMp3DelayQueueDepthMs();
}

export function getStagingQueueDepthMs() {
  return 0;
}

export function getLiveRailId() {
  return liveRailId;
}

export function isStreamPublishing() {
  return publishing;
}

function teeLiveDiscordFrame(frame, railId) {
  if (railId !== liveRailId || !railDrainHandler) return;
  try {
    railDrainHandler({ frame, railId, isLive: true });
  } catch {}
}

function teePcmRelayFrame(frame, railId) {
  if (!pcmRelaySink) return;
  try {
    pcmRelaySink({ frame, railId, isLive: railId === liveRailId });
  } catch {}
}

export function registerBroadcasterRail(railId) {
  if (!railId) return;
  registeredRails.add(railId);
  ensureRailEncoder(railId);
  if (!liveRailId) {
    liveRailId = railId;
    setLiveMp3Rail(railId);
    notifyLiveRailChanged();
  }
}

export function unregisterBroadcasterRail(railId) {
  registeredRails.delete(railId);
  removeRailEncoder(railId);
  if (liveRailId === railId) {
    liveRailId = null;
    setLiveMp3Rail(null);
    notifyLiveRailChanged();
  }
}

export function setLiveRail(railId) {
  if (!railId) return false;

  const prevRailId = liveRailId;
  if (prevRailId === railId) return false;

  registeredRails.add(railId);
  ensureRailEncoder(railId);
  flushMp3OutboundBatch();

  liveRailId = railId;
  setLiveMp3Rail(railId);
  notifyLiveRailChanged();

  try {
    onHandoffCommitted?.({ prevRailId, liveRailId: railId });
  } catch {}

  return true;
}

export function publishPcmFrame(frame, railId) {
  if (!frame?.length || !railId) return;
  if (frame.length !== PCM_FRAME_BYTES) return;

  publishing = true;
  const pcm = Buffer.from(frame);

  teeLiveDiscordFrame(pcm, railId);
  teePcmRelayFrame(pcm, railId);
  feedRailPcm(railId, pcm);
}

export function flushStreamHubForBroadcasterSwitch() {
  registeredRails.clear();
  liveRailId = null;
  setLiveMp3Rail(null);
  publishing = false;
  notifyLiveRailChanged();
}

export function buildStreamStatusJson({ title, artist, active }) {
  return {
    icestats: {
      source: {
        listenurl: "/api/stream",
        server_name: "CollabFM Radio",
        stream_start: active ? new Date().toISOString() : null,
        title: title && artist ? `${title} - ${artist}` : title || "Music playing",
        streamHubDelayQueueMs: getDelayQueueDepthMs(),
        streamHubLiveRailId: liveRailId,
        streamHubWarmRailCount: registeredRails.size,
        streamHubWarmRailQueueMs: 0,
        webStreamDelayMs: getWebStreamDelayMs(),
        pcmHub: true,
      },
    },
  };
}
