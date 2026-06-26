/** Per-rail MP3 encoders (warm on standby) — live rail MP3 fans out to HTTP. */

import { spawn } from "node:child_process";

const OUTBOUND_FLUSH_MS = 80;
const OUTBOUND_FLUSH_BYTES = 8192;
const PCM_FRAME_BYTES = 3840;
const MAX_RAIL_PCM_PENDING = 250;
const MAX_SUB_PENDING_BYTES = 256 * 1024;
const MP3_STALL_MS = 4000;
const MP3_WATCHDOG_MS = 2000;
/** While a broadcaster WS session is active, listeners stay connected through long pauses. */
const MP3_FIRST_BYTE_TIMEOUT_MS = 5000;
const MP3_FIRST_BYTE_TIMEOUT_BROADCAST_MS = 20_000;

const subscribers = new Map();
const railEncoders = new Map();

let outboundBuffer = Buffer.alloc(0);
let outboundFlushTimer = null;
let liveMp3RailId = null;
let mp3BytesOut = 0;
let streamActive = false;
/** True while at least one authorized broadcaster relay WS is connected. */
let broadcastSessionActive = false;
let lastLiveMp3OutAt = 0;
let mp3WatchdogTimer = null;
let webStreamDelayMs = 0;
/** @type {{ chunk: Buffer, releaseAt: number }[]} */
let mp3DelayQueue = [];
let mp3DelayDrainTimer = null;
const MAX_MP3_DELAY_ENTRIES = 256;

export function setMp3BroadcastSessionActive(active) {
  broadcastSessionActive = !!active;
}

export function configureMp3Publisher(options = {}) {
  const next = Number(options.webStreamDelayMs);
  if (Number.isFinite(next) && next >= 0) {
    webStreamDelayMs = Math.floor(next);
  }
}

export function getWebStreamDelayMs() {
  return webStreamDelayMs;
}

export function getMp3DelayQueueDepthMs() {
  if (!mp3DelayQueue.length) return 0;
  const now = Date.now();
  return Math.max(0, mp3DelayQueue[mp3DelayQueue.length - 1].releaseAt - now);
}

function clearMp3DelayDrainTimer() {
  if (mp3DelayDrainTimer !== null) {
    clearTimeout(mp3DelayDrainTimer);
    mp3DelayDrainTimer = null;
  }
}

function queueMp3ToOutbound(chunk) {
  outboundBuffer = outboundBuffer.length ? Buffer.concat([outboundBuffer, chunk]) : chunk;
  if (outboundBuffer.length >= OUTBOUND_FLUSH_BYTES) {
    if (outboundFlushTimer !== null) {
      clearTimeout(outboundFlushTimer);
      outboundFlushTimer = null;
    }
    flushOutboundToListeners();
    return;
  }
  scheduleOutboundFlush();
}

function drainMp3DelayQueue() {
  const now = Date.now();
  while (mp3DelayQueue.length && mp3DelayQueue[0].releaseAt <= now) {
    const entry = mp3DelayQueue.shift();
    if (entry?.chunk?.length) queueMp3ToOutbound(entry.chunk);
  }
}

function scheduleMp3DelayDrain() {
  drainMp3DelayQueue();
  if (!mp3DelayQueue.length) {
    clearMp3DelayDrainTimer();
    return;
  }
  if (mp3DelayDrainTimer !== null) return;

  const waitMs = mp3DelayQueue[0].releaseAt <= Date.now()
    ? 0
    : Math.max(10, mp3DelayQueue[0].releaseAt - Date.now());
  mp3DelayDrainTimer = setTimeout(() => {
    mp3DelayDrainTimer = null;
    scheduleMp3DelayDrain();
  }, waitMs);
}

function enqueueLiveMp3Chunk(chunk) {
  if (webStreamDelayMs <= 0) {
    queueMp3ToOutbound(chunk);
    return;
  }

  mp3DelayQueue.push({
    chunk,
    releaseAt: Date.now() + webStreamDelayMs,
  });
  while (mp3DelayQueue.length > MAX_MP3_DELAY_ENTRIES) {
    mp3DelayQueue.shift();
  }
  scheduleMp3DelayDrain();
}

function removeSubscriber(id) {
  subscribers.delete(id);
}

function flushSubscriber(sub) {
  if (!sub?.res || sub.res.writableEnded) return;

  while (sub.pending.length > 0) {
    const chunk = sub.pending[0];
    try {
      const ok = sub.res.write(chunk);
      if (!ok) {
        sub.paused = true;
        sub.res.once("drain", () => {
          sub.paused = false;
          flushSubscriber(sub);
        });
        return;
      }
      sub.pending.shift();
      sub.pendingBytes -= chunk.length;
      sub.lastWriteAt = Date.now();
    } catch {
      removeSubscriber(sub.id);
      return;
    }
  }
}

function trimSubscriberPending(sub, chunk) {
  while (sub.pending.length > 0 && sub.pendingBytes + chunk.length > MAX_SUB_PENDING_BYTES) {
    const dropped = sub.pending.shift();
    sub.pendingBytes -= dropped.length;
  }
}

function writeSubscriberChunk(sub, chunk) {
  if (!sub?.res || sub.res.writableEnded) return;

  if (sub.paused) {
    trimSubscriberPending(sub, chunk);
    if (sub.pendingBytes + chunk.length <= MAX_SUB_PENDING_BYTES) {
      sub.pending.push(chunk);
      sub.pendingBytes += chunk.length;
    }
    return;
  }

  try {
    const ok = sub.res.write(chunk);
    if (!ok) {
      sub.paused = true;
      trimSubscriberPending(sub, chunk);
      sub.pending.push(chunk);
      sub.pendingBytes += chunk.length;
      sub.res.once("drain", () => {
        sub.paused = false;
        flushSubscriber(sub);
      });
      return;
    }
    sub.lastWriteAt = Date.now();
  } catch {
    removeSubscriber(sub.id);
  }
}

function flushOutboundToListeners() {
  if (!outboundBuffer.length) return;
  const chunk = outboundBuffer;
  outboundBuffer = Buffer.alloc(0);
  mp3BytesOut += chunk.length;
  for (const [id, sub] of subscribers) {
    writeSubscriberChunk(sub, chunk);
    if (!subscribers.has(id)) continue;
  }
}

function scheduleOutboundFlush() {
  if (outboundFlushTimer !== null) return;
  outboundFlushTimer = setTimeout(() => {
    outboundFlushTimer = null;
    flushOutboundToListeners();
  }, OUTBOUND_FLUSH_MS);
}

function publishMp3Chunk(chunk, railId) {
  if (!chunk?.length) return;
  if (railId !== liveMp3RailId) return;

  lastLiveMp3OutAt = Date.now();
  enqueueLiveMp3Chunk(chunk);
}

function stopRailEncoder(rail) {
  if (!rail) return;
  if (rail.keepalive) {
    clearInterval(rail.keepalive);
    rail.keepalive = null;
  }
  if (rail.proc) {
    try { rail.proc.stdin?.end(); } catch {}
    try { rail.proc.kill(); } catch {}
    rail.proc = null;
  }
  rail.backpressure = false;
}

function drainRailPcmIn(rail) {
  if (!rail?.proc?.stdin?.writable) return;

  while (rail.pcmPending.length > 0) {
    const frame = rail.pcmPending[0];
    try {
      const ok = rail.proc.stdin.write(frame);
      if (!ok) {
        rail.backpressure = true;
        return;
      }
      rail.pcmPending.shift();
      rail.lastWriteTs = Date.now();
      rail.backpressure = false;
    } catch {
      restartRailEncoder(rail.railId);
      return;
    }
  }
}

function pushRailPcmPending(rail, frame) {
  if (rail.pcmPending.length >= MAX_RAIL_PCM_PENDING) {
    rail.pcmPending.shift();
  }
  rail.pcmPending.push(Buffer.isBuffer(frame) ? frame : Buffer.from(frame));
}

function restartRailEncoder(railId) {
  if (!railId) return;

  const existing = railEncoders.get(railId);
  const savedPending = existing?.pcmPending?.length
    ? existing.pcmPending.slice(-MAX_RAIL_PCM_PENDING)
    : [];

  if (existing) {
    stopRailEncoder(existing);
    railEncoders.delete(railId);
  }

  const rail = createRailEncoder(railId);
  railEncoders.set(railId, rail);

  if (savedPending.length) {
    rail.pcmPending.push(...savedPending);
    drainRailPcmIn(rail);
  }
}

function createRailEncoder(railId) {
  const rail = {
    railId,
    proc: null,
    backpressure: false,
    lastWriteTs: 0,
    keepalive: null,
    pcmPending: [],
  };

  try {
    rail.proc = spawn("/usr/bin/ffmpeg", [
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "-i", "pipe:0",
      "-bufsize", "128k",
      "-rtbufsize", "64k",
      "-async", "1",
      "-max_interleave_delta", "0",
      "-c:a", "libmp3lame",
      "-b:a", "128k",
      "-af", "aresample=async=1",
      "-metadata", "StreamTitle=Music playing",
      "-metadata", "title=Music playing",
      "-metadata", "artist=CollabFM Radio",
      "-content_type", "audio/mpeg",
      "-flush_packets", "1",
      "-f", "mp3",
      "pipe:1",
    ]);

    rail.proc.stdout.on("data", (chunk) => {
      try {
        publishMp3Chunk(chunk, railId);
      } catch {}
    });

    rail.proc.stdin.on("drain", () => {
      rail.backpressure = false;
      drainRailPcmIn(rail);
    });

    rail.proc.stdin.on("error", (err) => {
      if (err?.code === "EPIPE") return;
    });

    rail.proc.on("exit", (code, signal) => {
      rail.proc = null;
      if (railEncoders.get(railId) !== rail) return;
      console.warn(`⚠️ [mp3-pub] encoder exited rail=${railId} code=${code} signal=${signal || ""}`);
      setTimeout(() => {
        if (railEncoders.get(railId) === rail && !rail.proc) {
          restartRailEncoder(railId);
        }
      }, 100);
    });

    rail.lastWriteTs = Date.now();
    rail.keepalive = setInterval(() => {
      try {
        if (!rail.proc || rail.proc.killed) return;
        if (Date.now() - rail.lastWriteTs > 40) {
          const silence = Buffer.alloc(PCM_FRAME_BYTES);
          if (!rail.backpressure && rail.proc.stdin?.writable) {
            const ok = rail.proc.stdin.write(silence);
            if (!ok) rail.backpressure = true;
            else rail.lastWriteTs = Date.now();
          } else if (rail.backpressure) {
            pushRailPcmPending(rail, silence);
          }
        }
      } catch {}
    }, 200);
  } catch (err) {
    console.error(`❌ [mp3-pub] failed to spawn encoder rail=${railId}:`, err?.message || err);
    rail.proc = null;
  }

  return rail;
}

export function ensureRailEncoder(railId) {
  if (!railId) return;
  const existing = railEncoders.get(railId);
  if (existing?.proc && !existing.proc.killed) return;
  if (existing) {
    restartRailEncoder(railId);
    return;
  }
  railEncoders.set(railId, createRailEncoder(railId));
}

export function removeRailEncoder(railId) {
  const rail = railEncoders.get(railId);
  if (!rail) return;
  stopRailEncoder(rail);
  railEncoders.delete(railId);
  if (liveMp3RailId === railId) liveMp3RailId = null;
}

export function setLiveMp3Rail(railId) {
  liveMp3RailId = railId || null;
  if (railId) ensureRailEncoder(railId);
}

export function flushMp3OutboundBatch() {
  if (outboundFlushTimer !== null) {
    clearTimeout(outboundFlushTimer);
    outboundFlushTimer = null;
  }
  flushOutboundToListeners();
}

function startMp3Watchdog() {
  if (mp3WatchdogTimer) return;
  mp3WatchdogTimer = setInterval(() => {
    if (!liveMp3RailId || !streamActive) return;

    const rail = railEncoders.get(liveMp3RailId);
    if (!rail?.proc || rail.proc.killed) {
      console.warn(`⚠️ [mp3-pub] live encoder missing — restarting rail ${liveMp3RailId}`);
      restartRailEncoder(liveMp3RailId);
      return;
    }

    const mp3Stale = !lastLiveMp3OutAt || Date.now() - lastLiveMp3OutAt > MP3_STALL_MS;
    const pcmStale = !rail.lastWriteTs || Date.now() - rail.lastWriteTs > MP3_STALL_MS;
    // Only restart when PCM has also stopped — silence/pause still feeds PCM keepalive.
    if (mp3Stale && pcmStale) {
      console.warn(`⚠️ [mp3-pub] live encoder stalled — restarting rail ${liveMp3RailId}`);
      restartRailEncoder(liveMp3RailId);
    }
  }, MP3_WATCHDOG_MS);
}

export function initLiveMp3Publisher() {
  startMp3Watchdog();
}

/** @deprecated Handoff only flushes the MP3 batch — encoders stay warm. */
export function restartLiveMp3Publisher() {
  flushMp3OutboundBatch();
}

export function stopLiveMp3Publisher() {
  flushMp3OutboundBatch();
  clearMp3DelayDrainTimer();
  mp3DelayQueue = [];
  if (mp3WatchdogTimer) {
    clearInterval(mp3WatchdogTimer);
    mp3WatchdogTimer = null;
  }
  for (const railId of [...railEncoders.keys()]) {
    removeRailEncoder(railId);
  }
  streamActive = false;
  lastLiveMp3OutAt = 0;
}

export function feedRailPcm(railId, frame) {
  if (!railId || !Buffer.isBuffer(frame) || frame.length !== PCM_FRAME_BYTES) return;

  streamActive = true;
  ensureRailEncoder(railId);
  const rail = railEncoders.get(railId);
  if (!rail) return;

  if (!rail.proc?.stdin?.writable) {
    pushRailPcmPending(rail, frame);
    return;
  }

  if (rail.backpressure || rail.pcmPending.length > 0) {
    pushRailPcmPending(rail, frame);
    drainRailPcmIn(rail);
    return;
  }

  try {
    const ok = rail.proc.stdin.write(frame);
    if (!ok) {
      rail.backpressure = true;
      pushRailPcmPending(rail, frame);
    }
    rail.lastWriteTs = Date.now();
  } catch {
    restartRailEncoder(railId);
  }
}

/** @deprecated use feedRailPcm(railId, frame) */
export function writeLiveMp3Pcm(frame) {
  if (liveMp3RailId) feedRailPcm(liveMp3RailId, frame);
}

export function getActiveListenerCount() {
  return subscribers.size;
}

export function isMp3StreamActive() {
  if (!liveMp3RailId) return false;

  let rail = railEncoders.get(liveMp3RailId);
  if (!rail?.proc || rail.proc.killed) {
    if (broadcastSessionActive) {
      ensureRailEncoder(liveMp3RailId);
      rail = railEncoders.get(liveMp3RailId);
    }
    if (!rail?.proc || rail.proc.killed) return false;
  }

  // Broadcaster still connected — stream stays available through long music pauses.
  if (broadcastSessionActive) return true;

  if (!streamActive) return false;

  const mp3Recent = lastLiveMp3OutAt && Date.now() - lastLiveMp3OutAt < MP3_STALL_MS;
  if (mp3Recent) return true;

  // Brief window after encoder restart while PCM is flowing but MP3 not yet.
  const pcmRecent = rail.lastWriteTs && Date.now() - rail.lastWriteTs < 2000;
  return pcmRecent;
}

export function subscribeToStream(res, meta = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let cleaned = false;
  let subKeepalive = null;
  let headerTimeout = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (subKeepalive) clearInterval(subKeepalive);
    if (headerTimeout) clearTimeout(headerTimeout);
    removeSubscriber(id);
    try {
      if (!res.writableEnded) res.end();
    } catch {}
  };

  if (!isMp3StreamActive()) {
    res.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Stream offline");
    return null;
  }

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store, private, no-cache",
    "icy-name": "CollabFM Radio",
    Connection: "close",
  });
  res.flushHeaders?.();

  const sub = {
    id,
    res,
    meta,
    startedAt: Date.now(),
    paused: false,
    pending: [],
    pendingBytes: 0,
    lastWriteAt: 0,
  };
  subscribers.set(id, sub);
  res.on("close", cleanup);
  res.on("error", cleanup);

  if (outboundBuffer.length) {
    writeSubscriberChunk(sub, Buffer.from(outboundBuffer));
  }

  const firstByteTimeoutMs = broadcastSessionActive
    ? MP3_FIRST_BYTE_TIMEOUT_BROADCAST_MS
    : MP3_FIRST_BYTE_TIMEOUT_MS;
  headerTimeout = setTimeout(() => {
    if (!subscribers.has(id)) return;
    if (sub.lastWriteAt > 0) return;
    console.warn("⚠️ [mp3-pub] subscriber timed out waiting for first MP3 byte");
    cleanup();
  }, firstByteTimeoutMs);

  subKeepalive = setInterval(() => {
    if (!subscribers.has(id)) return;
    if (!sub.lastWriteAt) return;
    if (!liveMp3RailId) return;
    // Keep HTTP listeners connected while the broadcaster session is still up.
    if (broadcastSessionActive) return;
    if (!streamActive) return;
    const idleMs = Date.now() - (sub.lastWriteAt || 0);
    if (idleMs < MP3_STALL_MS) return;
    console.warn("⚠️ [mp3-pub] closing idle subscriber (no MP3 bytes)");
    cleanup();
  }, MP3_WATCHDOG_MS);

  return id;
}
