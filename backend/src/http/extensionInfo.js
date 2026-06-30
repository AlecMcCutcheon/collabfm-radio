import fs from "fs";
import path from "path";
import {
  CHROME_WEB_STORE_URL,
  getChromeWebStoreVersion,
} from "./chromeWebStoreVersion.js";

export function readBundledExtensionVersion(extDir) {
  if (!extDir) return null;
  try {
    const manifestPath = path.join(extDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const version = String(manifest?.version || "").trim();
    return version || null;
  } catch {
    return null;
  }
}

function compareSemver(a, b) {
  const pa = String(a || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export async function getExtensionInstallInfo(extDir) {
  const bundledVersion = readBundledExtensionVersion(extDir);
  const webStore = await getChromeWebStoreVersion();
  const webStoreVersion = webStore.version || null;

  let versionComparison = "unknown";
  if (bundledVersion && webStoreVersion) {
    const cmp = compareSemver(bundledVersion, webStoreVersion);
    if (cmp === 0) versionComparison = "match";
    else if (cmp > 0) versionComparison = "bundled_newer";
    else versionComparison = "store_newer";
  } else if (bundledVersion) {
    versionComparison = "bundled_only";
  } else if (webStoreVersion) {
    versionComparison = "store_only";
  }

  return {
    bundledVersion,
    webStoreVersion,
    webStoreUrl: CHROME_WEB_STORE_URL,
    webStoreError: webStore.error || null,
    versionComparison,
  };
}
