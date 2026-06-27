import crypto from "crypto";
import { DEFAULT_ALLOWED_ARTISTS, DEFAULT_ALLOWED_SOURCES } from "./defaultArtists.js";

const UNKNOWN_ARTISTS = new Set([
  "",
  "unknown",
  "unknown artist",
  "n/a",
  "na",
  "various artists",
]);

export const CONTENT_POLICY_MUTED_TITLE = "Song Muted due to Content policy";
export const CONTENT_POLICY_MUTED_ARTIST = "Please play an allowed song or source";

export function isContentPolicyMutedMetadata(title, artist) {
  return (
    String(title || "").trim() === CONTENT_POLICY_MUTED_TITLE &&
    String(artist || "").trim() === CONTENT_POLICY_MUTED_ARTIST
  );
}

/** Defer deny while source is unknown and source or artist allowlist rules may still apply. */
export function shouldDeferContentPolicyEnforcement(decision, input, policy) {
  if (decision?.action !== "deny") return false;
  if (decision.matchType !== "metadata_missing") return false;
  const host = normalizeHost(input?.source ?? input?.site ?? null);
  if (host) return false;
  const normalized = normalizePolicy(policy);
  if (normalized.rules.some((rule) => rule.match === "source" && rule.action === "allow")) {
    return true;
  }
  return normalized.rules.some((rule) => rule.match === "artist" && rule.action === "allow");
}

function policyHasArtistAllowRules(policy) {
  return normalizePolicy(policy).rules.some(
    (rule) => rule.match === "artist" && rule.action === "allow",
  );
}

function policyHasSourceAllowRules(policy) {
  return normalizePolicy(policy).rules.some(
    (rule) => rule.match === "source" && rule.action === "allow",
  );
}

export function buildDefaultContentPolicy() {
  const rules = [];
  for (const value of DEFAULT_ALLOWED_SOURCES) {
    rules.push(newRule("source", value, "allow"));
  }
  for (const entry of DEFAULT_ALLOWED_ARTISTS) {
    const name = typeof entry === "string" ? entry : entry.name;
    const altNames = typeof entry === "string" ? undefined : entry.altNames;
    rules.push(newRule("artist", name, "allow", altNames));
  }

  return {
    enabled: true,
    rules,
    metadataMissing: "deny",
    sourceNoMatch: "deny",
    artistNoMatch: "deny",
    defaultAction: "deny",
  };
}

function newRule(match, value, action, altNames) {
  const rule = {
    id: crypto.randomUUID(),
    match,
    value: String(value || ""),
    action,
  };
  const normalizedAltNames = normalizeAltNames(altNames);
  if (normalizedAltNames.length > 0) {
    rule.altNames = normalizedAltNames;
  }
  return rule;
}

function normalizeAltNames(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

/** Split legacy "Name (Alt)" values into primary name + alt names. */
function parseParentheticalArtistName(value) {
  const match = String(value || "").match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;
  const name = match[1].trim();
  const altNames = match[2]
    .split(/[,&]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!name || altNames.length === 0) return null;
  return { name, altNames };
}

function normalizeRule(raw) {
  const match = normalizeMatch(raw?.match);
  if (!match || match === "metadata_missing") return null;

  let value = String(raw?.value ?? "");
  let altNames = normalizeAltNames(raw?.altNames);

  if (match === "artist" && altNames.length === 0) {
    const parsed = parseParentheticalArtistName(value);
    if (parsed) {
      value = parsed.name;
      altNames = parsed.altNames;
    }
  }

  const rule = {
    id: String(raw?.id || crypto.randomUUID()),
    match,
    value,
    action: normalizeAction(raw?.action) || "allow",
  };
  if (altNames.length > 0) {
    rule.altNames = altNames;
  }
  return rule;
}

export function normalizePolicy(raw) {
  const base = buildDefaultContentPolicy();
  if (!raw || typeof raw !== "object") return base;

  const rules = Array.isArray(raw.rules)
    ? raw.rules.map((rule) => normalizeRule(rule)).filter(Boolean)
    : base.rules;

  return {
    enabled: raw.enabled !== false,
    rules,
    metadataMissing: normalizeAction(raw.metadataMissing) || base.metadataMissing,
    sourceNoMatch: normalizeAction(raw.sourceNoMatch) || base.sourceNoMatch,
    artistNoMatch: normalizeAction(raw.artistNoMatch) || base.artistNoMatch,
    defaultAction: normalizeAction(raw.defaultAction) || base.defaultAction,
  };
}

function normalizeMatch(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "source" || v === "artist" || v === "metadata_missing") return v;
  return null;
}

function normalizeAction(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "allow" || v === "warn" || v === "deny") return v;
  if (v === "block") return "deny";
  return null;
}

function normalizeHost(source) {
  const raw = String(source || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const withProto = raw.includes("://") ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0].split(":")[0];
  }
}

function normalizeArtistText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasTrackMetadata(artist, title) {
  const a = normalizeArtistText(artist);
  const t = String(title || "").trim();
  if (!t || t.toLowerCase() === "n/a") return false;
  if (!a || UNKNOWN_ARTISTS.has(a)) return false;
  return true;
}

function sourceMatches(host, pattern) {
  const h = normalizeHost(host);
  const p = String(pattern || "").trim().toLowerCase();
  if (!h || !p) return false;
  if (p === "*") return true;
  const patHost = normalizeHost(p);
  return h === patHost || h.endsWith(`.${patHost}`);
}

function artistMatches(artist, pattern) {
  const a = normalizeArtistText(artist);
  const p = normalizeArtistText(pattern);
  if (!a || !p) return false;
  if (a === p) return true;
  if (a.includes(p) || p.includes(a)) return true;

  const stripParens = (s) =>
    s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const aCore = stripParens(a);
  const pCore = stripParens(p);
  if (aCore && pCore && (aCore.includes(pCore) || pCore.includes(aCore))) return true;

  const aParts = a.split(/[(&]/).map((x) => x.trim()).filter(Boolean);
  const pParts = p.split(/[(&]/).map((x) => x.trim()).filter(Boolean);
  return aParts.some((part) => pParts.some((pp) => part.includes(pp) || pp.includes(part)));
}

function ruleArtistMatches(artist, rule) {
  if (artistMatches(artist, rule.value)) return true;
  if (!Array.isArray(rule.altNames)) return false;
  return rule.altNames.some((alt) => artistMatches(artist, alt));
}

function outcomeForAction(action) {
  if (action === "allow") return "allowed";
  if (action === "warn") return "warned";
  return "denied";
}

function buildDecision(action, summary, extra = {}) {
  return {
    allowed: action !== "deny",
    action,
    outcome: outcomeForAction(action),
    summary,
    ...extra,
  };
}

/**
 * Evaluate content policy for a broadcast track.
 * Known sources are checked first (allow/deny before metadata).
 * Unknown sources defer to artist rules when configured, otherwise deny immediately.
 */
export function evaluateBroadcastContent(input, policy) {
  const normalizedPolicy = normalizePolicy(policy);
  if (!normalizedPolicy.enabled) {
    return buildDecision("allow", "Content policy disabled");
  }

  const source = input?.source ?? input?.site ?? null;
  const artist = input?.artist ?? null;
  const title = input?.title ?? null;
  const host = normalizeHost(source);
  const hasMetadata = hasTrackMetadata(artist, title);

  if (host) {
    for (const rule of normalizedPolicy.rules) {
      if (rule.match === "source" && sourceMatches(host, rule.value)) {
        return buildDecision(rule.action, `Rule matched: approved source (${rule.value})`, {
          ruleId: rule.id,
          matchType: "source",
          ruleLabel: rule.value,
          source: host,
          artist,
          title,
        });
      }
    }
    return buildDecision(
      normalizedPolicy.sourceNoMatch,
      "Source not in allowlist",
      { matchType: "source_no_match", source: host, artist, title },
    );
  }

  if (policyHasSourceAllowRules(normalizedPolicy)) {
    return buildDecision(
      normalizedPolicy.metadataMissing,
      "Awaiting source for source allowlist",
      { matchType: "metadata_missing", source: null, artist, title },
    );
  }

  if (!policyHasArtistAllowRules(normalizedPolicy)) {
    return buildDecision(
      normalizedPolicy.sourceNoMatch,
      "Source not reported and no artist allowlist configured",
      { matchType: "source_unknown", source: null, artist, title },
    );
  }

  if (!hasMetadata) {
    return buildDecision(
      normalizedPolicy.metadataMissing,
      "Awaiting track metadata for artist allowlist",
      { matchType: "metadata_missing", source: null, artist: artist || null, title: title || null },
    );
  }

  for (const rule of normalizedPolicy.rules) {
    if (rule.match === "artist" && ruleArtistMatches(artist, rule)) {
      return buildDecision(rule.action, `Rule matched: approved artist (${rule.value})`, {
        ruleId: rule.id,
        matchType: "artist",
        ruleLabel: rule.value,
        source: null,
        artist,
        title,
      });
    }
  }

  return buildDecision(
    normalizedPolicy.artistNoMatch,
    "Artist not in allowlist",
    { matchType: "artist_no_match", source: null, artist, title },
  );
}

export function logContentPolicyDecision(decision, context = {}) {
  const prefix =
    decision.outcome === "denied"
      ? "🚫 Content policy denied"
      : decision.outcome === "warned"
        ? "⚠️ Content policy warning"
        : "✅ Content policy allowed";
  console.log(
    `${prefix}: ${decision.summary}` +
      (context.userId ? ` user=${context.userId}` : "") +
      (decision.source ? ` source=${decision.source}` : "") +
      (decision.artist ? ` artist=${decision.artist}` : "") +
      (decision.title ? ` title="${decision.title}"` : ""),
  );
}
