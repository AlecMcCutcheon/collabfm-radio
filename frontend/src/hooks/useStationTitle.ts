import { useEffect } from "react";
import { api } from "../api/client";
import { applyStationTitle, DEFAULT_STATION_TITLE } from "../utils/stationTitle";

export function useStationTitle(suffix?: string) {
  useEffect(() => {
    let cancelled = false;

    void api
      .branding()
      .then((b) => {
        if (cancelled) return;
        applyStationTitle(b.radioDisplayName, suffix);
      })
      .catch(() => {
        if (cancelled) return;
        applyStationTitle(DEFAULT_STATION_TITLE, suffix);
      });

    return () => {
      cancelled = true;
    };
  }, [suffix]);
}
