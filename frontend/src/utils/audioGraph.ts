interface AudioGraph {
  audio: HTMLAudioElement;
  ctx: AudioContext;
  analyser: AnalyserNode;
  outputGain: GainNode;
}

/** Fixed visualizer input level — independent of user volume, but below full digital hot signal. */
const VISUALIZER_TAP_GAIN = 0.2;

let activeGraph: AudioGraph | null = null;

/**
 * Wire the stream audio element through Web Audio during a user gesture (play click).
 * Browsers suspend AudioContext created outside a gesture, which silences output.
 */
export async function ensureAudioGraph(
  audio: HTMLAudioElement,
  volume: number,
): Promise<AudioGraph | null> {
  if (activeGraph?.audio === audio) {
    activeGraph.outputGain.gain.value = volume;
    if (activeGraph.ctx.state === "suspended") {
      await activeGraph.ctx.resume();
    }
    return activeGraph;
  }

  disposeAudioGraph();

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    const analyserGain = ctx.createGain();
    const outputGain = ctx.createGain();

    analyser.fftSize = 512;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.8;
    analyserGain.gain.value = VISUALIZER_TAP_GAIN;
    outputGain.gain.value = 0;

    source.connect(analyserGain);
    analyserGain.connect(analyser);
    source.connect(outputGain);
    outputGain.connect(ctx.destination);

    await ctx.resume();

    activeGraph = { audio, ctx, analyser, outputGain };
    return activeGraph;
  } catch {
    return null;
  }
}

export function setAudioGraphVolume(volume: number): void {
  if (activeGraph) {
    activeGraph.outputGain.gain.value = volume;
  }
}

export function duckPlayback(): void {
  if (activeGraph) {
    activeGraph.outputGain.gain.value = 0;
  }
}

export async function fadeInPlayback(targetVolume: number, durationMs = 700): Promise<void> {
  if (!activeGraph) {
    return;
  }
  const { ctx, outputGain } = activeGraph;
  const now = ctx.currentTime;
  outputGain.gain.cancelScheduledValues(now);
  outputGain.gain.setValueAtTime(0, now);
  outputGain.gain.linearRampToValueAtTime(targetVolume, now + durationMs / 1000);
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

export function getActiveAnalyser(): AnalyserNode | null {
  return activeGraph?.analyser ?? null;
}

export function disposeAudioGraph(): void {
  if (activeGraph) {
    void activeGraph.ctx.close();
    activeGraph = null;
  }
}
