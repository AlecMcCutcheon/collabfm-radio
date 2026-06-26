import { DEFAULT_WEB_STREAM_DELAY_MS } from "./streamPlaybackBuffer";

export type StreamStallCause = "waiting" | "stalled" | "clock";

export interface StreamStallEvent {
  type: "stall" | "warmup";
  cause?: StreamStallCause;
  at: number;
  durationMs?: number;
  decodeAheadMs: number | null;
  stallStartDecodeAheadMs?: number | null;
}

export interface StreamStallTelemetry {
  serverStreamDelayMs: number;
  serverDelayQueueMs: number | null;
  stallCount: number;
  totalStallMs: number;
  lastStallDurationMs: number | null;
  lastStallAt: number | null;
  bufferedAheadMs: number | null;
  minBufferedAheadMs: number | null;
  decodeAheadAvailable: boolean;
  inWarmup: boolean;
  events: StreamStallEvent[];
  sessionStartedAt: number | null;
}

export const MAX_STALL_EVENTS = 24;

export function createEmptyStreamStallTelemetry(): StreamStallTelemetry {
  return {
    serverStreamDelayMs: DEFAULT_WEB_STREAM_DELAY_MS,
    serverDelayQueueMs: null,
    stallCount: 0,
    totalStallMs: 0,
    lastStallDurationMs: null,
    lastStallAt: null,
    bufferedAheadMs: null,
    minBufferedAheadMs: null,
    decodeAheadAvailable: false,
    inWarmup: false,
    events: [],
    sessionStartedAt: null,
  };
}

export class StreamStallRecorder {
  private stallStartAt: number | null = null;
  private activeStallCause: StreamStallCause | null = null;
  private stallStartDecodeAheadMs: number | null = null;
  private minBufferedAheadMs: number | null = null;
  private warmupUntilMs = 0;
  private state: StreamStallTelemetry = createEmptyStreamStallTelemetry();

  reset(): void {
    this.stallStartAt = null;
    this.activeStallCause = null;
    this.stallStartDecodeAheadMs = null;
    this.minBufferedAheadMs = null;
    this.warmupUntilMs = 0;
    this.state = createEmptyStreamStallTelemetry();
  }

  beginSession(serverStreamDelayMs = DEFAULT_WEB_STREAM_DELAY_MS): void {
    this.reset();
    this.state = {
      ...this.state,
      serverStreamDelayMs,
      sessionStartedAt: Date.now(),
    };
  }

  setWarmupUntil(untilMs: number): void {
    this.warmupUntilMs = untilMs;
    this.stallStartAt = null;
    this.activeStallCause = null;
    this.stallStartDecodeAheadMs = null;
    this.state = {
      ...this.state,
      inWarmup: Date.now() < untilMs,
    };
  }

  isWarmup(): boolean {
    return Date.now() < this.warmupUntilMs;
  }

  setServerStreamDelayMs(serverStreamDelayMs: number): void {
    this.state = {
      ...this.state,
      serverStreamDelayMs,
    };
  }

  setServerDelayQueueMs(serverDelayQueueMs: number | null): void {
    this.state = {
      ...this.state,
      serverDelayQueueMs,
    };
  }

  snapshot(): StreamStallTelemetry {
    return {
      ...this.state,
      inWarmup: this.isWarmup(),
      events: [...this.state.events],
    };
  }

  sampleBuffer(bufferedAheadMs: number | null): void {
    const decodeAheadAvailable = bufferedAheadMs !== null;
    this.state = {
      ...this.state,
      bufferedAheadMs,
      decodeAheadAvailable,
      inWarmup: this.isWarmup(),
    };
    if (bufferedAheadMs === null) return;
    if (this.minBufferedAheadMs === null || bufferedAheadMs < this.minBufferedAheadMs) {
      this.minBufferedAheadMs = bufferedAheadMs;
      this.state = {
        ...this.state,
        minBufferedAheadMs: bufferedAheadMs,
      };
    }
  }

  markWaiting(decodeAheadMs: number | null): void {
    this.beginStall("waiting", decodeAheadMs);
  }

  markStalled(decodeAheadMs: number | null): void {
    this.beginStall("stalled", decodeAheadMs);
  }

  markClockStall(decodeAheadMs: number | null): void {
    this.beginStall("clock", decodeAheadMs);
  }

  markRecovered(decodeAheadMs: number | null): void {
    const startedAt = this.stallStartAt;
    const cause = this.activeStallCause;
    if (startedAt === null || cause === null) return;

    const durationMs = Date.now() - startedAt;
    const startAheadMs = this.stallStartDecodeAheadMs;
    this.stallStartAt = null;
    this.activeStallCause = null;
    this.stallStartDecodeAheadMs = null;

    if (this.isWarmup()) {
      this.pushEvent({
        type: "warmup",
        cause,
        at: Date.now(),
        durationMs,
        decodeAheadMs,
        stallStartDecodeAheadMs: startAheadMs,
      });
      return;
    }

    this.pushEvent({
      type: "stall",
      cause,
      at: Date.now(),
      durationMs,
      decodeAheadMs,
      stallStartDecodeAheadMs: startAheadMs,
    });

    this.state = {
      ...this.state,
      stallCount: this.state.stallCount + 1,
      totalStallMs: this.state.totalStallMs + durationMs,
      lastStallDurationMs: durationMs,
      lastStallAt: Date.now(),
    };
  }

  private beginStall(cause: StreamStallCause, decodeAheadMs: number | null): void {
    if (this.stallStartAt !== null) {
      if (cause === "clock" && this.activeStallCause !== "clock") {
        this.activeStallCause = "clock";
      }
      return;
    }
    this.stallStartAt = Date.now();
    this.activeStallCause = cause;
    this.stallStartDecodeAheadMs = decodeAheadMs;
    this.sampleBuffer(decodeAheadMs);
  }

  private pushEvent(event: StreamStallEvent): void {
    const events = [...this.state.events, event];
    if (events.length > MAX_STALL_EVENTS) {
      events.splice(0, events.length - MAX_STALL_EVENTS);
    }
    this.state = {
      ...this.state,
      events,
    };
  }
}
