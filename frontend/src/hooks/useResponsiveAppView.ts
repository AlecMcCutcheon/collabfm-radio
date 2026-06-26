import { useCallback, useEffect, useState } from "react";
import type { AppView } from "../types/api";

const MOBILE_VIEW_STORAGE_KEY = "radioMobileView";
const DESKTOP_MEDIA_QUERY = "(min-width: 640px)";

const VALID_VIEWS: AppView[] = ["radio", "chat", "stage", "studio"];

function readStoredMobileView(): AppView {
  try {
    const saved = sessionStorage.getItem(MOBILE_VIEW_STORAGE_KEY);
    if (saved && VALID_VIEWS.includes(saved as AppView)) {
      return saved as AppView;
    }
  } catch {
    /* ignore */
  }
  return "radio";
}

export function useResponsiveAppView() {
  const [view, setViewState] = useState<AppView>("radio");
  const [chatOpen, setChatOpen] = useState(false);

  const setView = useCallback((next: AppView) => {
    setViewState(next);
    try {
      if (!window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
        sessionStorage.setItem(MOBILE_VIEW_STORAGE_KEY, next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => {
      if (mq.matches) {
        setViewState("radio");
        setChatOpen(false);
      } else {
        setViewState(readStoredMobileView());
      }
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  return { view, setView, chatOpen, setChatOpen };
}
