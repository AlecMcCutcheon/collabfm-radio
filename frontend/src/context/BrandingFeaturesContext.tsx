import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api/client";

export const STATION_FEATURES_CHANGED = "station-features-changed";

export function notifyStationFeaturesChanged() {
  window.dispatchEvent(new Event(STATION_FEATURES_CHANGED));
}

interface BrandingFeatures {
  songSearch: boolean;
  chatGifs: boolean;
}

const defaultFeatures: BrandingFeatures = { songSearch: false, chatGifs: false };

const BrandingFeaturesContext = createContext<BrandingFeatures>(defaultFeatures);

const POLL_MS = 8_000;

export function BrandingFeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<BrandingFeatures>(defaultFeatures);

  const refresh = useCallback(() => {
    void api
      .branding()
      .then((b) => {
        setFeatures({
          songSearch: b.features?.songSearch === true,
          chatGifs: b.features?.chatGifs === true,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const pollId = window.setInterval(refresh, POLL_MS);
    const onEvent = () => refresh();
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(STATION_FEATURES_CHANGED, onEvent);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener(STATION_FEATURES_CHANGED, onEvent);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <BrandingFeaturesContext.Provider value={features}>
      {children}
    </BrandingFeaturesContext.Provider>
  );
}

export function useBrandingFeatures() {
  return useContext(BrandingFeaturesContext);
}
