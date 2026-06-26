import { Radio } from "lucide-react";
import { useAudioVisualizer } from "../hooks/useAudioVisualizer";
import { imageFallbackHandler, proceduralStationLogo } from "../utils/brandingImage";

interface DjProfileVisualizerProps {
  playing: boolean;
  streamActive: boolean;
  getAudio: () => HTMLAudioElement;
  profileSrc?: string | null;
  /** Procedural fallback when profileSrc fails to load (defaults to generic station art). */
  profileFallbackSrc?: string | null;
  stationName?: string;
}

export function DjProfileVisualizer({
  playing,
  streamActive,
  getAudio,
  profileSrc = null,
  profileFallbackSrc = null,
  stationName = "Radio",
}: DjProfileVisualizerProps) {
  const audioEl = playing ? getAudio() : null;
  const levels = useAudioVisualizer(audioEl, playing);
  const fallbackSrc = profileFallbackSrc || proceduralStationLogo(stationName, 128);
  const displaySrc = profileSrc || fallbackSrc;

  const t = levels.primary;
  const s = levels.secondary;
  const rot = levels.rotation;
  const offset = 5 + t * 15;

  return (
    <div className="relative flex items-center justify-center mb-6">
      <div className="relative w-32 h-32">
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `rgba(255, 206, 10, ${t * 0.07}) -${offset}px -${offset}px ${t * 220}px ${t * 100}px`,
            transform: `rotate(${rot}deg) translate(-${offset}px, -${offset}px) scale(${0.98 + t * 0.8})`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `rgba(15, 255, 207, ${t * 0.06}) 0px 0px ${t * 220}px ${t * 100}px`,
            transform: `rotate(${rot}deg) scale(${0.98 + t * 0.8})`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `rgba(206, 10, 255, ${t * 0.07}) ${offset}px ${offset}px ${t * 220}px ${t * 100}px`,
            transform: `rotate(${rot}deg) translate(${offset}px, ${offset}px) scale(${0.98 + t * 0.8})`,
          }}
        />

        {playing && (
          <>
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `-${offset}px -${offset}px ${t * 180}px ${t * 120}px rgba(255, 60, 60, ${t * 0.95})`,
                transform: `rotate(${rot}deg) translate(-${offset}px, -${offset}px) scale(${0.98 + t * 0.8})`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 ${t * 180}px ${t * 120}px rgba(60, 255, 60, ${t * 0.85})`,
                transform: `rotate(${rot}deg) scale(${0.98 + t * 0.8})`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `${offset}px ${offset}px ${t * 180}px ${t * 120}px rgba(60, 120, 255, ${t * 0.95})`,
                transform: `rotate(${rot}deg) translate(${offset}px, ${offset}px) scale(${0.98 + t * 0.8})`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 ${t * 350}px ${t * 175}px rgba(135, 206, 250, ${t * 0.15})`,
                transform: `scale(${0.98 + t * 1})`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full bg-radio-accent pointer-events-none"
              style={{
                opacity: t * 0.4,
                transform: `scale(${1 + t * 1})`,
              }}
            />
          </>
        )}

        <div
          data-radio-logo
          className={`w-32 h-32 rounded-full overflow-hidden border-4 border-radio-accent shadow-lg shadow-radio-accent/50 relative z-10 ${
            playing ? "" : "animate-pulse"
          }`}
          style={
            playing
              ? {
                  borderWidth: `${4 + t * 2}px`,
                  borderColor: `rgba(135, 206, 250, ${0.4 + s * 0.6})`,
                  boxShadow: `0 0 ${t * 110}px rgba(135, 206, 250, ${t * 0.7})`,
                  transform: `scale(${1 + t * 0.15 + s * 0.15})`,
                  transition: "border-color 0.15s ease-out",
                }
              : undefined
          }
        >
          <img
            alt="Radio DJ Profile"
            className="w-full h-full object-cover cursor-pointer"
            src={displaySrc}
            onError={imageFallbackHandler(fallbackSrc)}
            style={{
              filter: playing
                ? `hue-rotate(${s * 50}deg) saturate(${1 + s * 0.08})`
                : undefined,
              transition: "filter 0.1s ease-out",
              willChange: "filter",
            }}
          />
        </div>

        <div
          className={`absolute -bottom-2 -right-2 rounded-full p-2 z-20 transition-all duration-300 ${
            streamActive ? "bg-red-500 border-[3px]" : "bg-gray-500 border-2 border-gray-600"
          }`}
          style={streamActive ? { animation: "flash 1.5s ease-in-out infinite" } : undefined}
        >
          <Radio
            className="w-6 h-6 text-white"
            style={
              streamActive && playing
                ? { animation: "spin-slow 8s linear infinite" }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use DjProfileVisualizer */
export const AlbumArtVisualizer = DjProfileVisualizer;
