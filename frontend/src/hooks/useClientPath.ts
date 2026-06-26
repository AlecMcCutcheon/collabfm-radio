import { useCallback, useEffect, useState } from "react";

export function normalizeAppPath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, "");
  return trimmed || "/";
}

export function useClientPath() {
  const [path, setPath] = useState(() => normalizeAppPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPath(normalizeAppPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = normalizeAppPath(to);
    const current = normalizeAppPath(window.location.pathname);
    if (next === current) {
      setPath(next);
      return;
    }
    window.history.pushState({ spa: true }, "", next === "/" ? "/" : next);
    setPath(next);
  }, []);

  return { path, navigate };
}
