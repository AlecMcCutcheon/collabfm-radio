import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  imageFallbackHandler,
  proceduralStationLogo,
  resolveBrandingImageUrl,
} from "../utils/brandingImage";

interface ShareLinkErrorPageProps {
  message: string;
}

export function ShareLinkErrorPage({ message }: ShareLinkErrorPageProps) {
  const [radioTitle, setRadioTitle] = useState("CollabFM Radio");
  const [visualizerSrc, setVisualizerSrc] = useState<string | null>(null);
  const logoFallback = proceduralStationLogo(radioTitle, 96);

  useEffect(() => {
    void api
      .branding()
      .then((b) => {
        setRadioTitle(b.radioDisplayName);
        setVisualizerSrc(resolveBrandingImageUrl(b.visualizerImageUrl));
      })
      .catch(() => {
        setVisualizerSrc(null);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-8 shadow-2xl text-center space-y-4">
        <img
          src={visualizerSrc || logoFallback}
          alt=""
          onError={imageFallbackHandler(logoFallback)}
          className="w-24 h-24 rounded-2xl object-cover mx-auto border border-gray-600 shadow-lg"
        />
        <h1 className="text-2xl font-bold text-radio-accent">{radioTitle}</h1>
        <p className="text-red-400 text-sm">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-gray-400 hover:text-radio-accent transition-colors"
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}
