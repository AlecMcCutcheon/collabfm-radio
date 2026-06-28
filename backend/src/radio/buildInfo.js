import fs from "node:fs";
import path from "node:path";

const BUILD_INFO_PATHS = [
  "/usr/share/collabfm/build-info.json",
  path.resolve(process.cwd(), "build-info.json"),
  path.resolve(process.cwd(), "../docker/build-info.json"),
];

const DEFAULT_BUILD_INFO = {
  imageRepository: "ghcr.io/alecmccutcheon/collabfm-radio",
  githubRepository: "AlecMcCutcheon/collabfm-radio",
  channel: "development",
  revision: "local",
  version: "local-dev",
  builtAt: null,
};

let cachedBuildInfo = null;

function readBuildInfoFile() {
  for (const filePath of BUILD_INFO_PATHS) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try next path */
    }
  }
  return null;
}

export function getBuildInfo() {
  if (cachedBuildInfo) return cachedBuildInfo;

  const fromFile = readBuildInfoFile();
  const merged = {
    ...DEFAULT_BUILD_INFO,
    ...(fromFile || {}),
  };

  const revision = String(merged.revision || "local").trim() || "local";
  const channel = String(merged.channel || "development").trim() || "development";
  const version = String(merged.version || revision.slice(0, 7)).trim();

  cachedBuildInfo = {
    imageRepository: String(merged.imageRepository || DEFAULT_BUILD_INFO.imageRepository).trim(),
    githubRepository: String(merged.githubRepository || DEFAULT_BUILD_INFO.githubRepository).trim(),
    channel,
    revision,
    version,
    builtAt: merged.builtAt || null,
    buildId: `${channel}:${revision.slice(0, 12)}`,
    runtime: process.env.COLLABFM_RUNTIME === "docker" ? "docker" : "node",
  };

  return cachedBuildInfo;
}

export function clearBuildInfoCache() {
  cachedBuildInfo = null;
}
