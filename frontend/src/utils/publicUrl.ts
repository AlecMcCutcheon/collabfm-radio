/** Build a share/listen URL using the origin the user is currently viewing. */
export function absolutePublicUrl(url: string | undefined): string {
  if (!url) return "";

  try {
    const parsed = url.startsWith("http") ? new URL(url) : new URL(url, window.location.origin);
    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${window.location.origin}${path}`;
  }
}
