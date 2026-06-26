/** Server-side web stream delay (fixed at 0 — lowest latency). */
export const DEFAULT_WEB_STREAM_DELAY_MS = 0;

/** Require this much decoded audio ahead before audible playback starts. */
export const MIN_DECODE_AHEAD_SEC = 2.0;

/** Lower bar when re-priming after a broadcaster switch. */
export const SWITCH_DECODE_AHEAD_SEC = 1.5;

/** Minimum time receiving/decoding before unmuting — avoids starting on the first tiny chunk. */
export const MIN_CONNECT_MS = 1200;

export const PLAYBACK_READY_MAX_WAIT_MS = 12000;

/** Ignore decode stalls during this window after audible playback begins. */
export const PLAYBACK_WARMUP_MS = 15000;

export function getBufferedAheadSec(audio: HTMLAudioElement): number | null {
  const t = audio.currentTime;
  for (let i = 0; i < audio.buffered.length; i++) {
    const start = audio.buffered.start(i);
    const end = audio.buffered.end(i);
    if (t >= start && t <= end) {
      return Math.max(0, end - t);
    }
  }
  return null;
}

export function getBufferedAheadMs(audio: HTMLAudioElement): number | null {
  const sec = getBufferedAheadSec(audio);
  return sec === null ? null : Math.round(sec * 1000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Wait until enough MP3 has been received and decoded — in parallel, not after a fixed
 * server-delay sleep. On a live stream the hub queue is usually already full when you connect.
 */
export async function waitForPlaybackReady(
  audio: HTMLAudioElement,
  minAheadSec = MIN_DECODE_AHEAD_SEC,
  maxWaitMs = PLAYBACK_READY_MAX_WAIT_MS,
): Promise<number | null> {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  let bestAhead: number | null = null;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - startedAt;
    const ahead = getBufferedAheadSec(audio);

    if (ahead !== null) {
      bestAhead = ahead;
      if (ahead >= minAheadSec && elapsed >= MIN_CONNECT_MS) {
        return ahead;
      }
    } else if (
      elapsed >= MIN_CONNECT_MS &&
      audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    ) {
      await sleep(300);
      return getBufferedAheadSec(audio);
    }

    await sleep(100);
  }

  return bestAhead;
}

export class PlaybackClockMonitor {
  private lastCurrentTime: number | null = null;
  private lastWallMs: number | null = null;
  private inStall = false;

  reset(): void {
    this.lastCurrentTime = null;
    this.lastWallMs = null;
    this.inStall = false;
  }

  tick(
    audio: HTMLAudioElement,
    onStallStart: () => void,
    onStallEnd: () => void,
  ): void {
    if (audio.paused || audio.ended) {
      if (this.inStall) {
        this.inStall = false;
        onStallEnd();
      }
      this.lastCurrentTime = null;
      this.lastWallMs = null;
      return;
    }

    const now = Date.now();
    const currentTime = audio.currentTime;

    if (this.lastCurrentTime !== null && this.lastWallMs !== null) {
      const wallDeltaMs = now - this.lastWallMs;
      const timeDeltaSec = currentTime - this.lastCurrentTime;

      if (wallDeltaMs >= 350 && timeDeltaSec < 0.08) {
        if (!this.inStall) {
          this.inStall = true;
          onStallStart();
        }
      } else if (this.inStall && timeDeltaSec >= 0.05) {
        this.inStall = false;
        onStallEnd();
      }
    }

    this.lastCurrentTime = currentTime;
    this.lastWallMs = now;
  }
}
