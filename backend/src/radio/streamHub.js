/**
 * Broadcast hub facade — PCM-native rails (pcmStreamHub) + live MP3 edge (liveMp3Publisher).
 * @see docs/audio-pipeline.md
 */

export {
  configurePcmStreamHub,
  setStreamHubHandoffHandler,
  setRailDrainHandler,
  setLivePcmFrameSink,
  registerBroadcasterRail,
  unregisterBroadcasterRail,
  setLiveRail,
  publishPcmFrame,
  flushStreamHubForBroadcasterSwitch,
  getWebStreamDelayMs,
  getDelayQueueDepthMs,
  getStagingQueueDepthMs,
  getLiveRailId,
  isStreamPublishing,
  PCM_FRAME_BYTES,
} from "./pcmStreamHub.js";

export {
  configureMp3Publisher,
  initLiveMp3Publisher,
  restartLiveMp3Publisher,
  stopLiveMp3Publisher,
  writeLiveMp3Pcm,
  getActiveListenerCount,
  subscribeToStream,
} from "./liveMp3Publisher.js";

import { buildStreamStatusJson as buildPcmHubStatusJson } from "./pcmStreamHub.js";
import { getActiveListenerCount } from "./liveMp3Publisher.js";
import { configurePcmStreamHub } from "./pcmStreamHub.js";
import { configureMp3Publisher, initLiveMp3Publisher } from "./liveMp3Publisher.js";
import { setRailDrainHandler, setStreamHubHandoffHandler as setPcmHandoffHandler, setPcmRelaySink, setLiveRailChangeHandler } from "./pcmStreamHub.js";

export function configureStreamHub(options = {}) {
  configurePcmStreamHub(options);
  configureMp3Publisher(options);
}

export function buildStreamStatusJson(options) {
  const json = buildPcmHubStatusJson(options);
  const count = getActiveListenerCount();
  const source = json?.icestats?.source;
  if (source) source.listeners = count;
  return json;
}

/** Wire live PCM tee: Discord relay (live rail). MP3 encodes immediately; delay is post-encode. */
export function wireLivePcmOutputs(onPcmFrame) {
  wirePcmRelayOutputs(
    (_railId, frame, isLive) => {
      if (isLive && typeof onPcmFrame === "function") onPcmFrame(frame);
    },
    () => {},
  );
}

/** Wire tagged PCM relay for per-station Discord routing (all rails + live pointer). */
export function wirePcmRelayOutputs(onTaggedFrame, onLiveRailChange) {
  initLiveMp3Publisher();
  setPcmRelaySink(({ frame, railId, isLive }) => {
    if (typeof onTaggedFrame !== "function") return;
    try {
      onTaggedFrame(railId, frame, isLive);
    } catch {}
  });
  setLiveRailChangeHandler((railId) => {
    if (typeof onLiveRailChange !== "function") return;
    try {
      onLiveRailChange(railId);
    } catch {}
  });
}

/** @deprecated MP3 rails removed — use publishPcmFrame from worker pcm_frame. */
export function publishEncodedChunk() {}

/** @deprecated use wireLivePcmOutputs */
export function setOutboundChunkTap() {}

/** @deprecated staging replaced by per-rail void warm-up */
export function beginBroadcasterStaging() {}

/** @deprecated use setStreamHubHandoffHandler */
export function setStreamHubStagingCommittedHandler(handler) {
  setPcmHandoffHandler(handler);
}
