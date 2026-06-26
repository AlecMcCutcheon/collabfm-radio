/**
 * API origin for fetch/stream URLs.
 * Empty string = same origin (use Vite dev proxy or deployed backend).
 * Set VITE_API_ORIGIN to call the remote host directly from the browser.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) return `${API_ORIGIN}/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
}

export function authLogoutUrl(): string {
  return apiUrl("/auth/logout");
}
