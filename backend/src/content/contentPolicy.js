import crypto from "crypto";
import {
  DEFAULT_ALLOWED_ARTISTS,
  DEFAULT_ALLOWED_SOURCES,
  DEFAULT_ALLOWED_LICENSES,
} from "./defaultArtists.js";

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

  if (decision.matchType === "license_missing") {
    const host = normalizeHost(input?.source ?? input?.site ?? null);
    const isFmaHost =
      host === "freemusicarchive.org" || host.endsWith(".freemusicarchive.org");
    if (isFmaHost && hasTrackMetadata(input?.artist, input?.title)) {
      return true;
    }
    return false;
  }

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
    licenseMissing: "deny",
    licenseNoMatch: "deny",
    allowedLicenses: [...DEFAULT_ALLOWED_LICENSES],
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

  const isLegacyPolicy = !Object.prototype.hasOwnProperty.call(raw, "licenseMissing");

  return {
    enabled: raw.enabled !== false,
    rules,
    metadataMissing: normalizeAction(raw.metadataMissing) || base.metadataMissing,
    sourceNoMatch: normalizeAction(raw.sourceNoMatch) || base.sourceNoMatch,
    artistNoMatch: normalizeAction(raw.artistNoMatch) || base.artistNoMatch,
    defaultAction: normalizeAction(raw.defaultAction) || base.defaultAction,
    licenseMissing:
      normalizeAction(raw.licenseMissing) || (isLegacyPolicy ? "allow" : base.licenseMissing),
    licenseNoMatch:
      normalizeAction(raw.licenseNoMatch) || (isLegacyPolicy ? "allow" : base.licenseNoMatch),
    allowedLicenses: Array.isArray(raw.allowedLicenses)
      ? raw.allowedLicenses
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : isLegacyPolicy
        ? []
        : base.allowedLicenses,
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

function hasLicenseMetadata(input) {
  const type = String(input?.licenseType || "").trim();
  const url = String(input?.licenseUrl || "").trim();
  return !!(type || url);
}

function licenseEnforcementActive(policy) {
  const hasAllowlist =
    Array.isArray(policy.allowedLicenses) && policy.allowedLicenses.length > 0;
  return policy.licenseMissing !== "allow" || hasAllowlist;
}

function matchesCcByLicense(hay) {
  if (/\/licenses\/by-nc/.test(hay)) return false;
  if (/\/licenses\/by-nd/.test(hay)) return false;
  if (/\/licenses\/by-sa/.test(hay)) return false;
  if (/\/licenses\/by\//.test(hay)) return true;
  return /\bcc[\s-]by(\s+\d|\/|$)/.test(hay) && !/\bcc[\s-]by[\s-](nc|nd|sa)/.test(hay);
}

function matchesCcBySaLicense(hay) {
  if (/\/licenses\/by-nc-sa\//.test(hay)) return false;
  if (/\/licenses\/by-sa\//.test(hay)) return true;
  return /\bcc[\s-]by[\s-]sa/.test(hay);
}

function matchesCcByNcLicense(hay) {
  if (/\/licenses\/by-nc-sa\//.test(hay)) return false;
  if (/\/licenses\/by-nc-nd\//.test(hay)) return false;
  if (/\/licenses\/by-nc\//.test(hay)) return true;
  return /\bcc[\s-]by[\s-]nc(\s+\d|\/|$)/.test(hay) && !/\bcc[\s-]by[\s-]nc[\s-](sa|nd)/.test(hay);
}

function matchesCcByNcSaLicense(hay) {
  if (/\/licenses\/by-nc-sa\//.test(hay)) return true;
  return /\bcc[\s-]by[\s-]nc[\s-]sa/.test(hay);
}

function matchesCcByNdLicense(hay) {
  if (/\/licenses\/by-nc/.test(hay)) return false;
  if (/\/licenses\/by-nc-nd\//.test(hay)) return false;
  if (/\/licenses\/by-nd\//.test(hay)) return true;
  return /\bcc[\s-]by[\s-]nd(\s+\d|\/|$)/.test(hay);
}

function matchesCcByNcNdLicense(hay) {
  if (/\/licenses\/by-nc-nd\//.test(hay)) return true;
  return /\bcc[\s-]by[\s-]nc[\s-]nd/.test(hay);
}

function matchesCc0License(hay) {
  return (
    /creativecommons\.org\/publicdomain\/zero\//.test(hay) ||
    /\bcc[\s-]?0(\s+\d|\/|$)/.test(hay)
  );
}

const CC_KIND_MATCHERS = {
  by: matchesCcByLicense,
  "by-sa": matchesCcBySaLicense,
  "by-nc": matchesCcByNcLicense,
  "by-nc-sa": matchesCcByNcSaLicense,
  "by-nd": matchesCcByNdLicense,
  "by-nc-nd": matchesCcByNcNdLicense,
  cc0: matchesCc0License,
};

function tokenizeLicensePattern(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/creativecommons\.org\//g, "")
    .replace(/\blicenses\//g, "")
    .replace(/\bpublicdomain\//g, "publicdomain ")
    .replace(/[/_]+/g, " ")
    .replace(/[^\w\s-]+/g, " ")
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function modifiersToCcKind(modifiers) {
  const set = new Set(modifiers);
  if (set.has("sa") && set.has("nd")) return null;
  if (set.has("nc") && set.has("sa") && set.has("nd")) return null;

  if (set.has("nc") && set.has("sa")) return "by-nc-sa";
  if (set.has("nc") && set.has("nd")) return "by-nc-nd";
  if (set.has("sa")) return "by-sa";
  if (set.has("nc")) return "by-nc";
  if (set.has("nd")) return "by-nd";
  if (modifiers.length === 0) return "by";
  return null;
}

/** Map admin-entered CC text/URL to a canonical license kind, or null for custom patterns. */
function resolveCcLicenseKind(pattern) {
  const raw = String(pattern || "").trim().toLowerCase();
  if (!raw) return null;

  if (/\bcc\s*0\b/.test(raw) || raw.includes("publicdomain/zero") || raw.includes("publicdomain zero")) {
    return "cc0";
  }

  const tokens = tokenizeLicensePattern(raw);
  const versionIdx = tokens.findIndex((token) => /^\d/.test(token));
  const licenseTokens = versionIdx >= 0 ? tokens.slice(0, versionIdx) : tokens;

  if (licenseTokens[0] === "zero" || (licenseTokens[0] === "publicdomain" && licenseTokens[1] === "zero")) {
    return "cc0";
  }

  let idx = 0;
  if (licenseTokens[idx] === "cc") idx += 1;
  if (licenseTokens[idx] !== "by") return null;
  idx += 1;

  const modifiers = licenseTokens.slice(idx).filter((token) => ["nc", "nd", "sa"].includes(token));
  if (modifiers.length !== licenseTokens.length - idx) return null;

  return modifiersToCcKind(modifiers);
}

function licensePatternMatches(hay, pattern) {
  const p = String(pattern || "").trim().toLowerCase();
  if (!p) return false;

  const kind = resolveCcLicenseKind(pattern);
  if (kind && CC_KIND_MATCHERS[kind]) {
    return CC_KIND_MATCHERS[kind](hay);
  }

  return hay.includes(p);
}

function licenseMatchesAllowed(input, allowedLicenses) {
  if (!Array.isArray(allowedLicenses) || allowedLicenses.length === 0) return true;
  const hay = `${input?.licenseType || ""} ${input?.licenseUrl || ""}`.toLowerCase();
  return allowedLicenses.some((pattern) => licensePatternMatches(hay, pattern));
}

function applyLicenseGate(priorAction, summary, extra, input, policy) {
  if (!licenseEnforcementActive(policy)) {
    return buildDecision(priorAction, summary, extra);
  }

  if (!hasLicenseMetadata(input)) {
    return buildDecision(policy.licenseMissing, "License metadata missing", {
      ...extra,
      matchType: "license_missing",
      licenseType: null,
      licenseUrl: null,
    });
  }

  if (!licenseMatchesAllowed(input, policy.allowedLicenses)) {
    return buildDecision(policy.licenseNoMatch, "License not in allowlist", {
      ...extra,
      matchType: "license_no_match",
      licenseType: input?.licenseType ?? null,
      licenseUrl: input?.licenseUrl ?? null,
    });
  }

  return buildDecision(priorAction, summary, extra);
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
        const baseDecision = {
          ruleId: rule.id,
          matchType: "source",
          ruleLabel: rule.value,
          source: host,
          artist,
          title,
        };
        if (rule.action !== "allow") {
          return buildDecision(rule.action, `Rule matched: source (${rule.value})`, baseDecision);
        }
        return applyLicenseGate(
          rule.action,
          `Rule matched: approved source (${rule.value})`,
          baseDecision,
          input,
          normalizedPolicy,
        );
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
      const baseDecision = {
        ruleId: rule.id,
        matchType: "artist",
        ruleLabel: rule.value,
        source: null,
        artist,
        title,
      };
      if (rule.action !== "allow") {
        return buildDecision(rule.action, `Rule matched: artist (${rule.value})`, baseDecision);
      }
      return applyLicenseGate(
        rule.action,
        `Rule matched: approved artist (${rule.value})`,
        baseDecision,
        input,
        normalizedPolicy,
      );
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
