#!/usr/bin/env node
/**
 * Stage CollabFM Broadcaster on the Chrome Web Store (upload only — no publish/review).
 *
 * Skips when a submission is PENDING_REVIEW or an async upload is in progress.
 *
 * Required env:
 *   CHROME_WEBSTORE_CLIENT_ID
 *   CHROME_WEBSTORE_CLIENT_SECRET
 *   CHROME_WEBSTORE_REFRESH_TOKEN
 *   CHROME_WEBSTORE_PUBLISHER_ID
 *   CHROME_EXTENSION_ID
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildExtensionZipBuffer } from "../backend/src/http/packExtensionZip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT, "backend/broadcaster-extension");

const REVIEW_STATES = new Set(["PENDING_REVIEW"]);
const BLOCKING_UPLOAD_STATES = new Set(["UPLOAD_IN_PROGRESS", "IN_PROGRESS"]);

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    return null;
  }
  return value;
}

function notice(message) {
  console.log(`::notice title=Chrome Web Store::${message.replace(/\n/g, " ")}`);
}

function skip(message) {
  notice(`Skipped — ${message}`);
  console.log(message);
  process.exit(0);
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `OAuth token refresh failed: ${json.error || res.status} ${json.error_description || ""}`.trim(),
    );
  }
  return json.access_token;
}

async function fetchStoreStatus(accessToken, publisherId, extensionId) {
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${publisherId}/items/${extensionId}:fetchStatus`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      `fetchStatus failed (${res.status}): ${json?.error?.message || text.slice(0, 300)}`,
    );
  }
  return json;
}

function revisionState(revision) {
  return String(revision?.state || "").trim();
}

function revisionVersion(revision) {
  if (!revision || typeof revision !== "object") return "";
  const direct = String(revision.version || "").trim();
  if (direct) return direct;
  for (const channel of revision?.distributionChannels || []) {
    const version = String(channel?.target?.version || channel?.version || "").trim();
    if (version) return version;
  }
  return "";
}

function versionsFromStatus(status) {
  const staged = revisionVersion(status.submittedItemRevisionStatus);
  const published = revisionVersion(status.publishedItemRevisionStatus);
  const candidates = new Set([staged, published].filter(Boolean));
  for (const item of status.distributionChannelItems || []) {
    const version = revisionVersion(item);
    if (version) candidates.add(version);
  }
  return { staged, published, candidates };
}

async function uploadPackage(accessToken, publisherId, extensionId, zipBuffer) {
  const url = `https://chromewebstore.googleapis.com/upload/v2/publishers/${publisherId}/items/${extensionId}:upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/zip",
      "x-goog-api-version": "2",
    },
    body: zipBuffer,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json?.error?.message || text.slice(0, 500);
    if (
      /version|already|duplicate|greater than|higher than|must be increased/i.test(message)
    ) {
      skip(`upload not needed (${message})`);
    }
    throw new Error(`upload failed (${res.status}): ${message}`);
  }
  return json;
}

async function main() {
  const clientId = requireEnv("CHROME_WEBSTORE_CLIENT_ID");
  const clientSecret = requireEnv("CHROME_WEBSTORE_CLIENT_SECRET");
  const refreshToken = requireEnv("CHROME_WEBSTORE_REFRESH_TOKEN");
  const publisherId = requireEnv("CHROME_WEBSTORE_PUBLISHER_ID");
  const extensionId = requireEnv("CHROME_EXTENSION_ID");

  if (!clientId || !clientSecret || !refreshToken || !publisherId || !extensionId) {
    skip(
      "Chrome Web Store secrets are not configured. Add CHROME_WEBSTORE_* secrets and CHROME_EXTENSION_ID variable to enable staging.",
    );
  }

  const manifestPath = path.join(EXT_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestVersion = String(manifest.version || "").trim();
  if (!manifestVersion) {
    throw new Error("manifest.json is missing version");
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  const status = await fetchStoreStatus(accessToken, publisherId, extensionId);

  const submittedState = revisionState(status.submittedItemRevisionStatus);
  if (submittedState && REVIEW_STATES.has(submittedState)) {
    skip(
      `extension submission is ${submittedState}. Cancel review or wait for approval before staging a new ZIP.`,
    );
  }

  const uploadState = String(status.lastAsyncUploadState || "").trim();
  if (uploadState && BLOCKING_UPLOAD_STATES.has(uploadState)) {
    skip(`async upload is ${uploadState}. Try again shortly.`);
  }

  const { staged, published, candidates } = versionsFromStatus(status);

  const stagedVersion = staged;
  const publishedVersion = published;
  if (candidates.has(manifestVersion)) {
    skip(
      `manifest version ${manifestVersion} is already staged or published (staged=${stagedVersion || "—"}, published=${publishedVersion || "—"}). Bump manifest.json to upload a new build.`,
    );
  }

  console.log(`Building extension ZIP from ${EXT_DIR} (v${manifestVersion})…`);
  const zipBuffer = await buildExtensionZipBuffer(EXT_DIR);
  if (!zipBuffer.length) {
    throw new Error("ZIP build produced an empty archive");
  }

  console.log(`Uploading v${manifestVersion} (${zipBuffer.length} bytes) — upload only, not submitting for review…`);
  await uploadPackage(accessToken, publisherId, extensionId, zipBuffer);

  notice(
    `Staged v${manifestVersion} on Chrome Web Store. Submit for review manually in the Developer Dashboard when ready.`,
  );
  console.log("Done. Open the Chrome Web Store Developer Dashboard to submit for review when you are ready.");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
