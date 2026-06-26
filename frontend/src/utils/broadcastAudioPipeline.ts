/** Match extension offscreen.js — 128 kbps Opus in WebM. */
export const BROADCAST_OPUS_BITRATE = 128_000;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm; codecs=opus",
  "audio/webm",
];

export function pickOpusMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm;codecs=opus";
  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return "audio/webm;codecs=opus";
}

export function buildOpusRecorderOptions(): MediaRecorderOptions {
  const options: MediaRecorderOptions & { audioBitrateMode?: "constant" | "variable" } = {
    mimeType: pickOpusMimeType(),
    audioBitsPerSecond: BROADCAST_OPUS_BITRATE,
  };
  // Chrome 100+ — constant bitrate tends to sound steadier for music streaming.
  if (typeof MediaRecorder !== "undefined") {
    options.audioBitrateMode = "constant";
  }
  return options;
}

/** Route tab audio through Web Audio like the extension (48 kHz stereo destination). */
export async function createBroadcastRecordStream(
  captureStream: MediaStream,
  audioCtxOut: { current: AudioContext | null },
): Promise<MediaStream> {
  const audioCtx = new AudioContext();
  audioCtxOut.current = audioCtx;
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  const source = audioCtx.createMediaStreamSource(captureStream);
  const destination = audioCtx.createMediaStreamDestination();
  source.connect(destination);
  return destination.stream;
}
