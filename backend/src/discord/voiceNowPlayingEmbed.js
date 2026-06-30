import { EmbedBuilder } from "discord.js";
import { friendlySourceLabel } from "../content/sourceLabel.js";

/** Discord can fetch this; used when no HTTPS art is available. */
const FALLBACK_ART_URL =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbdbe1be9204750171f9b30e40.jpg";

function normalizeTitle(title) {
  if (title == null) return null;
  const trimmed = String(title).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "n/a" || lower === "unknown" || lower === "unknown title") return null;
  return trimmed;
}

function normalizeArtist(artist) {
  if (artist == null) return null;
  const trimmed = String(artist).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "n/a" || lower === "unknown") return null;
  return trimmed;
}

function isDiscordReachableUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.16.") ||
      host.startsWith("172.17.") ||
      host.startsWith("172.18.") ||
      host.startsWith("172.19.") ||
      host.startsWith("172.2") ||
      host.startsWith("172.30.") ||
      host.startsWith("172.31.")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveDiscordEmbedArtUrl(albumArtUrl) {
  const candidate = String(albumArtUrl || "").trim();
  if (isDiscordReachableUrl(candidate)) return candidate;
  return FALLBACK_ART_URL;
}

function isPublicHttpUrl(url) {
  return isDiscordReachableUrl(url);
}

function escapeDiscordMarkdownLabel(label) {
  return String(label || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function formatDiscordMarkdownLink(label, url) {
  const href = String(url || "").trim();
  const text = escapeDiscordMarkdownLabel(label);
  if (!href || !text || !isPublicHttpUrl(href)) return null;
  return `[${text}](${href})`;
}

export function extractTrackLinkFields(metadata) {
  if (!metadata) return {};
  const url = String(metadata.url || "").trim() || null;
  const licenseUrl = String(metadata.licenseUrl || "").trim() || null;
  const licenseType = String(metadata.licenseType || "").trim() || null;
  const sourceLabel = String(metadata.sourceLabel || "").trim() || null;
  const sourceSite = String(metadata.sourceSite || "").trim() || null;
  return { url, licenseUrl, licenseType, sourceLabel, sourceSite };
}

function buildArtistLineWithLinks(artist, linkFields) {
  if (!artist) return null;
  const links = [];
  const sourceLink = linkFields.url
    ? formatDiscordMarkdownLink(
        friendlySourceLabel(linkFields.sourceSite, linkFields.url, linkFields.sourceLabel),
        linkFields.url,
      )
    : null;
  const licenseLink = linkFields.licenseUrl
    ? formatDiscordMarkdownLink(linkFields.licenseType || "License", linkFields.licenseUrl)
    : null;
  if (sourceLink) links.push(sourceLink);
  if (licenseLink) links.push(licenseLink);
  if (!links.length) return `*${artist}*`;
  return `*${artist}* ${links.join(" ")}`;
}

export function formatNowPlayingTrack(title, artist) {
  const normalizedTitle = normalizeTitle(title);
  const normalizedArtist = normalizeArtist(artist);
  if (normalizedTitle && normalizedArtist) {
    return `${normalizedTitle} by ${normalizedArtist}`;
  }
  if (normalizedTitle) return normalizedTitle;
  return null;
}

export function voiceNoticeSnapshot(
  playback,
  menuKey = "",
  stationKey = "",
  radioDisplayName = "",
) {
  return [
    stationKey,
    playback.stationLabel || "",
    playback.djName || "",
    playback.title || "",
    playback.artist || "",
    playback.albumArtUrl || "",
    playback.url || "",
    playback.licenseUrl || "",
    playback.licenseType || "",
    playback.sourceLabel || "",
    playback.broadcastActive ? "1" : "0",
    playback.isLive ? "1" : "0",
    menuKey,
    String(radioDisplayName || "").trim(),
  ].join("\0");
}

export function buildVoiceNowPlayingEmbed({
  stationLabel,
  djName,
  title,
  artist,
  broadcastActive,
  isLive,
  radioDisplayName,
  albumArtUrl,
  url,
  licenseUrl,
  licenseType,
  sourceLabel,
  sourceSite,
}) {
  const normalizedTitle = normalizeTitle(title);
  const normalizedArtist = normalizeArtist(artist);
  const station = String(stationLabel || "Main station").trim() || "Main station";
  const brand = String(radioDisplayName || "Radio").trim() || "Radio";
  const dj = String(djName || "").trim();
  const artUrl = resolveDiscordEmbedArtUrl(albumArtUrl);
  const linkFields = extractTrackLinkFields({
    url,
    licenseUrl,
    licenseType,
    sourceLabel,
    sourceSite,
  });

  let statusText;
  let color;
  if (!broadcastActive) {
    statusText = "Waiting for broadcast";
    color = 0x334155;
  } else if (isLive) {
    statusText = "● LIVE";
    color = 0xdc2626;
  } else {
    statusText = "On stage";
    color = 0x9333ea;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: brand })
    .setColor(color)
    .setTitle("Now Playing")
    .setThumbnail(artUrl);

  if (normalizedTitle || normalizedArtist) {
    const lines = [];
    if (normalizedTitle) lines.push(`**${normalizedTitle}**`);
    const artistLine = buildArtistLineWithLinks(normalizedArtist, linkFields);
    if (artistLine) lines.push(artistLine);
    embed.setDescription(lines.join("\n"));
  } else {
    embed.setDescription(
      broadcastActive ? "_Track info pending…_" : "_Nothing on air yet_",
    );
  }

  embed.addFields({ name: "\u200b", value: "\u200b" });

  const rowFields = [
    { name: "Station", value: station, inline: true },
    { name: "Status", value: statusText, inline: true },
  ];
  if (dj) rowFields.push({ name: "DJ", value: dj, inline: true });
  embed.addFields(rowFields);

  embed.setFooter({ text: "Switch station ↓" });

  return embed;
}
