const SOURCE_LABELS: Record<string, string> = {
  "freemusicarchive.org": "Free Music Archive",
  "jamendo.com": "Jamendo",
  "ncs.io": "NoCopyrightSounds",
  "music.youtube.com": "YouTube Music",
  "soundcloud.com": "SoundCloud",
};

function normalizeHost(siteOrUrl: string): string {
  const raw = String(siteOrUrl || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const withProto = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0].split(":")[0];
  }
}

/** Friendly label for a broadcaster source hostname or track URL. */
export function friendlySourceLabel(site?: string, trackUrl?: string): string {
  const host = normalizeHost(site || "") || normalizeHost(trackUrl || "");
  if (!host) return "Source";
  return SOURCE_LABELS[host] || host;
}
