/** Pace live hub PCM for Discord — jitter buffer + 20ms wall-clock emit. */

const PCM_FRAME_BYTES = 3840;
const PCM_FRAME_MS = 20;

export function createDiscordPcmPacer(onFrame, options = {}) {
  const initialBufferFrames = Math.max(
    8,
    Math.floor(Number(options.initialBufferFrames) || 50),
  );
  const recoveryBufferFrames = Math.max(
    4,
    Math.floor(Number(options.recoveryBufferFrames) || 20),
  );
  const maxDepth = Math.max(
    initialBufferFrames * 2,
    Math.floor(Number(options.maxQueueFrames) || 300),
  );
  const underrunHoldFrames = Math.max(
    1,
    Math.floor(Number(options.underrunHoldFrames) || 15),
  );
  const rebufferEmptyTicks = Math.max(3, Math.floor(Number(options.rebufferEmptyTicks) || 8));

  let jitterQueue = [];
  let pacerStarted = false;
  let everStarted = false;
  let pacerTimer = null;
  let pacerNextAt = 0;
  let lastPacedFrame = null;
  let underrunHoldRemaining = 0;
  let consecutiveEmptyTicks = 0;

  function requiredBufferFrames() {
    return everStarted ? recoveryBufferFrames : initialBufferFrames;
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
  }

  function emitPacedFrame(frame) {
    try {
      onFrame(Buffer.from(frame));
    } catch {}
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
        emitPacedFrame(lastPacedFrame || Buffer.alloc(PCM_FRAME_BYTES));
        return;
      }
      pacerStarted = true;
      everStarted = true;
      consecutiveEmptyTicks = 0;
    }

    emitPacedFrame(popOutputFrame());
  }

  return {
    pushFrame(frame) {
      if (!Buffer.isBuffer(frame) || frame.length !== PCM_FRAME_BYTES) return;
      jitterQueue.push(Buffer.from(frame));
      while (jitterQueue.length > maxDepth) jitterQueue.shift();
      ensurePacer();
    },
    destroy() {
      if (pacerTimer) clearTimeout(pacerTimer);
      pacerTimer = null;
      jitterQueue = [];
      pacerStarted = false;
      everStarted = false;
      lastPacedFrame = null;
    },
  };
}
