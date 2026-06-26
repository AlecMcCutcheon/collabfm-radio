const ROLE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

export function sanitizeRoleColor(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return ROLE_COLOR_RE.test(s) ? s : null;
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isAllowedHttpsImageUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
