// audio-processor-worker.js — per-broadcaster PCM pacing rails → pcm_frame to main process

import { parentPort, workerData } from "node:worker_threads";

try {
  const noop = () => {};
  // @ts-ignore
  console.log = noop;
  // @ts-ignore
  console.info = noop;
  // @ts-ignore
  console.warn = noop;
} catch {}

const PCM_FRAME_BYTES = 3840;
const PCM_FRAME_MS = 20;

let runtimeConfig = {
  pcmMaxBufferMs: Number(workerData.PCM_MAX_BUFFER_MS || 4500),
  pcmMinBufferMs: Number(workerData.PCM_MIN_BUFFER_MS || 1500),
  pcmInitialBufferMs: Number(workerData.PCM_INITIAL_BUFFER_MS ?? 0),
  pcmUnderrunHoldMs: Number(workerData.PCM_UNDERRUN_HOLD_MS || 120),
};

function computeDerivedConfig() {
  const maxBufferMs = runtimeConfig.pcmMaxBufferMs;
  const minBufferMs = runtimeConfig.pcmMinBufferMs;
  const initialBufferMs = runtimeConfig.pcmInitialBufferMs;
  const underrunHoldMs = runtimeConfig.pcmUnderrunHoldMs;
  return {
    MAX_BUFFER_BYTES: PCM_FRAME_BYTES * Math.max(1, Math.floor(maxBufferMs / 20)),
    MIN_ADAPTIVE_BUFFER: PCM_FRAME_BYTES * Math.max(1, Math.floor(minBufferMs / 20)),
    MAX_ADAPTIVE_BUFFER: PCM_FRAME_BYTES * Math.max(150, Math.floor(maxBufferMs / 20) * 2),
    INITIAL_BUFFER_REQUIREMENT:
      initialBufferMs <= 0 ? 0 : PCM_FRAME_BYTES * Math.max(1, Math.floor(initialBufferMs / 20)),
    UNDERRUN_HOLD_FRAMES: Math.max(0, Math.floor(underrunHoldMs / 20)),
  };
}

let derived = computeDerivedConfig();

const rails = new Map();
let pacerTimer = null;
let pacerNextAt = 0;

function workerDebugLog(event, data = {}) {
  try {
    if (parentPort) {
      parentPort.postMessage({ type: "worker_log", event: `worker_${event}`, data });
    }
  } catch {}
}

function applyRuntimeConfig(next = {}) {
  if (next.pcmMaxBufferMs != null) {
    runtimeConfig.pcmMaxBufferMs = Number(next.pcmMaxBufferMs) || runtimeConfig.pcmMaxBufferMs;
  }
  if (next.pcmMinBufferMs != null) {
    runtimeConfig.pcmMinBufferMs = Number(next.pcmMinBufferMs) || runtimeConfig.pcmMinBufferMs;
  }
  derived = computeDerivedConfig();
  for (const rail of rails.values()) {
    rail.adaptiveBufferThreshold = derived.MAX_BUFFER_BYTES;
  }
  workerDebugLog("config_updated", {
    runtimeConfig,
    derived: { MAX_BUFFER_BYTES: derived.MAX_BUFFER_BYTES },
  });
}

function createRail(railId) {
  return {
    railId,
    pcmWriteRemainder: Buffer.alloc(0),
    adaptiveBufferThreshold: derived.MAX_BUFFER_BYTES,
    lastRealFrame: null,
    lastRealAudioTs: 0,
    underrunHoldRemaining: 0,
    lastPcmDebugTime: 0,
  };
}

function ensureRail(railId) {
  if (!railId) return null;
  if (!rails.has(railId)) {
    rails.set(railId, createRail(railId));
    workerDebugLog("rail_created", { railId });
  }
  return rails.get(railId);
}

function removeRail(railId) {
  if (!rails.has(railId)) return;
  rails.delete(railId);
  workerDebugLog("rail_removed", { railId });
}

function emitPcmFrame(rail, frame) {
  try {
    parentPort.postMessage({
      type: "pcm_frame",
      railId: rail.railId,
      data: Buffer.from(frame),
    });
  } catch {}
}

function pacerTick(rail) {
  try {
    const bufferLevel = rail.pcmWriteRemainder.length;

    if (derived.INITIAL_BUFFER_REQUIREMENT > 0 && bufferLevel < derived.INITIAL_BUFFER_REQUIREMENT) {
      emitPcmFrame(rail, Buffer.alloc(PCM_FRAME_BYTES));
      return;
    }

    let frame;

    if (bufferLevel >= PCM_FRAME_BYTES) {
      frame = rail.pcmWriteRemainder.subarray(0, PCM_FRAME_BYTES);
      rail.pcmWriteRemainder = rail.pcmWriteRemainder.subarray(PCM_FRAME_BYTES);
      rail.lastRealFrame = Buffer.from(frame);
      rail.underrunHoldRemaining = derived.UNDERRUN_HOLD_FRAMES;
      rail.lastRealAudioTs = Date.now();
    } else if (
      rail.lastRealFrame &&
      rail.underrunHoldRemaining > 0 &&
      rail.lastRealAudioTs > 0 &&
      Date.now() - rail.lastRealAudioTs < 5000
    ) {
      frame = rail.lastRealFrame;
      rail.underrunHoldRemaining--;
    } else {
      frame = Buffer.alloc(PCM_FRAME_BYTES);
      rail.underrunHoldRemaining = 0;
    }

    emitPcmFrame(rail, frame);
  } catch (error) {
    workerDebugLog("pacer_error", { railId: rail.railId, error: error.message });
  }
}

function schedulePacerTick() {
  if (pacerTimer) return;
  const now = Date.now();
  if (!pacerNextAt) pacerNextAt = now;
  pacerNextAt += PCM_FRAME_MS;
  const delay = Math.max(0, Math.min(PCM_FRAME_MS * 2, pacerNextAt - Date.now()));
  pacerTimer = setTimeout(() => {
    pacerTimer = null;
    for (const rail of rails.values()) {
      pacerTick(rail);
    }
    schedulePacerTick();
  }, delay);
}

function startGlobalPacer() {
  if (pacerTimer) return;
  pacerNextAt = 0;
  schedulePacerTick();
  workerDebugLog("pacer_started", { railCount: rails.size });
}

function stopGlobalPacer() {
  if (pacerTimer) {
    clearTimeout(pacerTimer);
    pacerTimer = null;
  }
  pacerNextAt = 0;
  for (const railId of [...rails.keys()]) {
    removeRail(railId);
  }
  workerDebugLog("pacer_stopped");
}

function appendPcm(rail, dataBuffer) {
  rail.pcmWriteRemainder = rail.pcmWriteRemainder.length
    ? Buffer.concat([rail.pcmWriteRemainder, dataBuffer])
    : dataBuffer;

  const bufferLimit = Math.max(rail.adaptiveBufferThreshold, derived.MAX_BUFFER_BYTES);
  if (rail.pcmWriteRemainder.length > bufferLimit) {
    rail.pcmWriteRemainder = rail.pcmWriteRemainder.subarray(rail.pcmWriteRemainder.length - bufferLimit);
  }

  const now = Date.now();
  if (now - rail.lastPcmDebugTime > 10000) {
    workerDebugLog("pcm_data_received", {
      railId: rail.railId,
      chunkSize: dataBuffer.length,
      totalBufferSize: rail.pcmWriteRemainder.length,
    });
    rail.lastPcmDebugTime = now;
  }
}

function decodePcmPayload(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (raw && raw.type === "Buffer" && Array.isArray(raw.data)) return Buffer.from(raw.data);
  if (Array.isArray(raw)) return Buffer.from(raw);
  if (raw && typeof raw === "object" && raw.data) return Buffer.from(raw.data);
  return null;
}

parentPort.on("message", (message) => {
  try {
    switch (message.type) {
      case "start":
        startGlobalPacer();
        parentPort.postMessage({ type: "started" });
        break;

      case "stop":
        stopGlobalPacer();
        parentPort.postMessage({ type: "stopped" });
        break;

      case "ensure_rail":
        ensureRail(message.railId);
        break;

      case "remove_rail":
        removeRail(message.railId);
        break;

      case "update_config":
        applyRuntimeConfig(message.config || {});
        break;

      case "pcm_data": {
        const railId = message.railId;
        if (!railId) break;
        const rail = ensureRail(railId);
        const dataBuffer = decodePcmPayload(message.data);
        if (rail && dataBuffer?.length) {
          appendPcm(rail, dataBuffer);
        }
        break;
      }

      default:
        workerDebugLog("unknown_message_type", { type: message.type });
    }
  } catch (error) {
    workerDebugLog("message_error", { error: error.message, type: message.type });
  }
});

process.on("exit", () => {
  stopGlobalPacer();
});

workerDebugLog("worker_ready", { workerId: workerData.workerId, mode: "pcm-rail-pacer" });
