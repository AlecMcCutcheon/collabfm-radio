/** Decode live hub MP3 (same as web listeners) → paced PCM for Discord voice relay.
 * @deprecated Replaced by PCM-native pcmStreamHub (2026-06-24). Kept for revert — see docs/audio-pipeline.md
 */

import { spawn } from "node:child_process";

const PCM_FRAME_BYTES = 3840; // 20ms @ 48kHz stereo s16le
const PCM_FRAME_MS = 20;

export function createDiscordHubPcmBridge(onFrame, options = {}) {
  const initialBufferFrames = Math.max(
    8,
    Math.floor(Number(options.initialBufferFrames) || 50),
  );
  const recoveryBufferFrames = Math.max(
    4,
    Math.floor(Number(options.recoveryBufferFrames) || Math.min(20, initialBufferFrames)),
  );
  const maxDepth = Math.max(
    initialBufferFrames * 2,
    Math.floor(Number(options.maxQueueFrames) || 400),
  );
  const underrunHoldFrames = Math.max(
    1,
    Math.floor(Number(options.underrunHoldFrames) || 20),
  );
  const decoderStallMs = Math.max(500, Math.floor(Number(options.decoderStallMs) || 2000));
  const pacerStallMs = Math.max(400, Math.floor(Number(options.pacerStallMs) || 800));
  const rebufferEmptyTicks = Math.max(3, Math.floor(Number(options.rebufferEmptyTicks) || 8));
  const onRecover = typeof options.onRecover === "function" ? options.onRecover : null;

  let proc = null;
  let pcmRemainder = Buffer.alloc(0);
  let jitterQueue = [];
  let pacerStarted = false;
  let everStarted = false;
  let pacerTimer = null;
  let pacerNextAt = 0;
  let watchdogTimer = null;
  let lastDecodedAt = 0;
  let lastMp3WriteAt = 0;
  let lastPacedEmitAt = 0;
  let lastPacedFrame = null;
  let underrunHoldRemaining = 0;
  let consecutiveEmptyTicks = 0;

  function logRecover(reason, extra = {}) {
    const payload = {
      reason,
      queueDepth: jitterQueue.length,
      pacerStarted,
      everStarted,
      lastDecodedAgeMs: lastDecodedAt ? Date.now() - lastDecodedAt : null,
      lastMp3WriteAgeMs: lastMp3WriteAt ? Date.now() - lastMp3WriteAt : null,
      lastPacedEmitAgeMs: lastPacedEmitAt ? Date.now() - lastPacedEmitAt : null,
      ...extra,
    };
    console.warn(`⚠️ [discord-pcm] recover: ${reason}`, payload);
    try {
      onRecover?.(payload);
    } catch {}
  }

  function requiredBufferFrames() {
    return everStarted ? recoveryBufferFrames : initialBufferFrames;
  }

  function stopPacerTimer() {
    if (pacerTimer) {
      clearTimeout(pacerTimer);
      pacerTimer = null;
    }
    pacerNextAt = 0;
  }

  function stopWatchdog() {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function resetPacerState({ keepEverStarted = false } = {}) {
    jitterQueue = [];
    pacerStarted = false;
    if (!keepEverStarted) everStarted = false;
    lastPacedFrame = null;
    underrunHoldRemaining = 0;
    consecutiveEmptyTicks = 0;
    lastDecodedAt = 0;
    lastMp3WriteAt = 0;
    lastPacedEmitAt = 0;
    stopPacerTimer();
    stopWatchdog();
  }

  function emitPacedFrame(frame) {
    lastPacedEmitAt = Date.now();
    try {
      onFrame(Buffer.from(frame));
    } catch {}
  }

  function emitHoldFrame() {
    if (lastPacedFrame) {
      emitPacedFrame(lastPacedFrame);
      return;
    }
    emitPacedFrame(Buffer.alloc(PCM_FRAME_BYTES));
  }

  function schedulePacerTick() {
    if (pacerTimer) return;
    const now = Date.now();
    if (!pacerNextAt) pacerNextAt = now;
    pacerNextAt += PCM_FRAME_MS;
    const delay = Math.max(0, Math.min(PCM_FRAME_MS * 2, pacerNextAt - Date.now()));
    pacerTimer = setTimeout(() => {
      pacerTimer = null;
      pacerTick();
      schedulePacerTick();
    }, delay);
  }

  function ensurePacer() {
    schedulePacerTick();
    if (!watchdogTimer) {
      watchdogTimer = setInterval(watchdogTick, 500);
    }
  }

  function enqueueDecodedFrame(frame) {
    jitterQueue.push(Buffer.from(frame));
    while (jitterQueue.length > maxDepth) {
      jitterQueue.shift();
    }
    ensurePacer();
  }

  function popOutputFrame() {
    if (jitterQueue.length > 0) {
      const frame = jitterQueue.shift();
      lastPacedFrame = frame;
      underrunHoldRemaining = underrunHoldFrames;
      consecutiveEmptyTicks = 0;
      return frame;
    }

    consecutiveEmptyTicks++;
    if (pacerStarted && consecutiveEmptyTicks >= rebufferEmptyTicks) {
      pacerStarted = false;
      consecutiveEmptyTicks = 0;
      underrunHoldRemaining = 0;
      logRecover("rebuffer_enter");
    }

    if (lastPacedFrame && underrunHoldRemaining > 0) {
      underrunHoldRemaining--;
      return lastPacedFrame;
    }
    if (lastPacedFrame) return lastPacedFrame;
    return Buffer.alloc(PCM_FRAME_BYTES);
  }

  function pacerTick() {
    const need = requiredBufferFrames();

    if (!pacerStarted) {
      if (jitterQueue.length < need) {
        emitHoldFrame();
        return;
      }
      pacerStarted = true;
      everStarted = true;
      consecutiveEmptyTicks = 0;
      logRecover("pacer_resume", { need });
    }

    const depth = jitterQueue.length;

    let framesToEmit = 1;
    if (depth > maxDepth) framesToEmit = 2;
    if (depth > Math.floor(maxDepth * 1.25)) framesToEmit = 3;

    for (let i = 0; i < framesToEmit; i++) {
      emitPacedFrame(popOutputFrame());
      if (jitterQueue.length === 0 && i === 0) break;
    }
  }

  function watchdogTick() {
    const now = Date.now();
    const mp3Recent = lastMp3WriteAt && now - lastMp3WriteAt < 8000;

    if (!pacerTimer && (jitterQueue.length > 0 || mp3Recent)) {
      schedulePacerTick();
    }

    if (mp3Recent && jitterQueue.length >= recoveryBufferFrames && !pacerStarted) {
      logRecover("pacer_stuck_waiting", { need: requiredBufferFrames() });
      pacerStarted = true;
      everStarted = true;
      consecutiveEmptyTicks = 0;
    }

    if (
      mp3Recent &&
      pacerStarted &&
      jitterQueue.length > 0 &&
      lastPacedEmitAt &&
      now - lastPacedEmitAt > pacerStallMs
    ) {
      logRecover("pacer_emit_stall");
      stopPacerTimer();
      schedulePacerTick();
    }

    if (!proc || !mp3Recent) return;

    if (!lastDecodedAt || now - lastDecodedAt > decoderStallMs) {
      logRecover("decoder_stall");
      spawnDecoder({ keepEverStarted: true });
    }
  }

  function emitFrames(chunk) {
    if (!Buffer.isBuffer(chunk) || !chunk.length) return;
    lastDecodedAt = Date.now();
    pcmRemainder = pcmRemainder.length ? Buffer.concat([pcmRemainder, chunk]) : chunk;
    while (pcmRemainder.length >= PCM_FRAME_BYTES) {
      const frame = pcmRemainder.subarray(0, PCM_FRAME_BYTES);
      pcmRemainder = pcmRemainder.subarray(PCM_FRAME_BYTES);
      enqueueDecodedFrame(frame);
    }
  }

  function spawnDecoder({ keepEverStarted = false } = {}) {
    if (proc) {
      try { proc.stdin?.end(); } catch {}
      try { proc.kill(); } catch {}
      proc = null;
    }
    pcmRemainder = Buffer.alloc(0);
    resetPacerState({ keepEverStarted });

    try {
      proc = spawn("/usr/bin/ffmpeg", [
        "-hide_banner", "-loglevel", "error",
        "-thread_queue_size", "1024",
        "-probesize", "32",
        "-analyzeduration", "0",
        "-f", "mp3",
        "-i", "pipe:0",
        "-af", "aresample=async=1:min_hard_comp=0.100:first_pts=0",
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1",
      ]);

      proc.stdout.on("data", emitFrames);

      proc.stdin.on("error", (err) => {
        if (err?.code === "EPIPE") return;
      });

      proc.on("exit", (code) => {
        proc = null;
        const recentlyActive = Date.now() - lastMp3WriteAt < 10000;
        if (recentlyActive) {
          logRecover("decoder_exit", { code });
          setTimeout(() => spawnDecoder({ keepEverStarted: true }), 100);
        }
      });
    } catch {
      proc = null;
    }
  }

  function writeMp3(chunk) {
    if (!chunk?.length) return;
    lastMp3WriteAt = Date.now();
    if (!proc) spawnDecoder();
    if (!proc?.stdin?.writable) {
      logRecover("decoder_stdin_closed");
      spawnDecoder({ keepEverStarted: true });
    }
    if (!proc?.stdin?.writable) return;

    try {
      const ok = proc.stdin.write(chunk);
      if (!ok) {
        proc.stdin.once("drain", () => {});
      }
    } catch {
      spawnDecoder({ keepEverStarted: true });
    }
  }

  function reset() {
    spawnDecoder();
  }

  function stop() {
    pcmRemainder = Buffer.alloc(0);
    resetPacerState();
    if (proc) {
      try { proc.stdin?.end(); } catch {}
      try { proc.kill(); } catch {}
      proc = null;
    }
  }

  function getHealth() {
    const now = Date.now();
    return {
      queueDepth: jitterQueue.length,
      pacerStarted,
      everStarted,
      hasDecoder: !!proc,
      lastDecodedAgeMs: lastDecodedAt ? now - lastDecodedAt : null,
      lastMp3WriteAgeMs: lastMp3WriteAt ? now - lastMp3WriteAt : null,
      lastPacedEmitAgeMs: lastPacedEmitAt ? now - lastPacedEmitAt : null,
    };
  }

  return { writeMp3, reset, stop, getHealth };
}
