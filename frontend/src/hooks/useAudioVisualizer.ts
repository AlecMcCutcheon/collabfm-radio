import { useEffect, useRef, useState } from "react";
import { getActiveAnalyser } from "../utils/audioGraph";

export interface VisualizerLevels {
  primary: number;
  secondary: number;
  rotation: number;
}

const ATTACK = 0.6;
const DECAY = 0.96;
const PRIMARY_GAIN = 1.45;
const SECONDARY_GAIN = 1;

export function useAudioVisualizer(audio: HTMLAudioElement | null, active: boolean) {
  const [levels, setLevels] = useState<VisualizerLevels>({
    primary: 0.14,
    secondary: 0.14,
    rotation: 138,
  });

  const frameRef = useRef<number | null>(null);
  const smoothPrimaryRef = useRef(0);
  const rotationRef = useRef(138);

  useEffect(() => {
    const stop = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const startFallback = () => {
      stop();
      const tick = () => {
        const t = Date.now() / 1000;
        const a = Math.sin(t * 2) * 0.5 + 0.5;
        const r = Math.sin(t * 2.67) * 0.3 + 0.3;
        const n = Math.random() * 0.2;
        const primary = Math.max(0, Math.min(1, a * 0.5 + r * 0.3 + n * 0.2));
        const secondary = Math.max(0, Math.min(1, a * 0.4 + r * 0.4 + n * 0.2));
        rotationRef.current += 0.5;
        setLevels({ primary, secondary, rotation: rotationRef.current });
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    };

    const startAnalyser = (analyser: AnalyserNode) => {
      stop();
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let smoothPrimary = smoothPrimaryRef.current;

      const tick = () => {
        analyser.getByteFrequencyData(buffer);

        let bass = 0;
        for (let i = 0; i < 12; i++) bass += buffer[i];
        let total = 0;
        for (let i = 0; i < buffer.length; i++) total += buffer[i];

        const avg = total / buffer.length / 255;
        const bassNorm = (bass / 12 / 255) * SECONDARY_GAIN;

        if (bassNorm > smoothPrimary) {
          smoothPrimary = smoothPrimary * ATTACK + bassNorm * (1 - ATTACK);
        } else {
          smoothPrimary *= DECAY;
        }

        const primary = Math.min(1, Math.max(0, Math.pow(smoothPrimary, 1.5) / PRIMARY_GAIN));
        const secondary = Math.min(1, Math.max(0, Math.pow(avg, 0.7) * 2));
        smoothPrimaryRef.current = smoothPrimary;
        rotationRef.current += 0.5 + primary * 1.5;

        setLevels({ primary, secondary, rotation: rotationRef.current });
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    };

    if (!active || !audio) {
      startFallback();
      return stop;
    }

    const analyser = getActiveAnalyser();
    if (analyser) {
      startAnalyser(analyser);
      return stop;
    }

    startFallback();
    const waitForGraph = window.setInterval(() => {
      const ready = getActiveAnalyser();
      if (ready) {
        window.clearInterval(waitForGraph);
        startAnalyser(ready);
      }
    }, 50);

    return () => {
      window.clearInterval(waitForGraph);
      stop();
    };
  }, [audio, active]);

  return levels;
}
