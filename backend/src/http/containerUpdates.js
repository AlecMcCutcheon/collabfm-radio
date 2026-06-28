import { getSetting, setSetting } from "../db/index.js";
import { getBuildInfo } from "../radio/buildInfo.js";

const TRACK_TAGS = new Set(["latest", "develop"]);
const TAG_TO_BRANCH = {
  latest: "main",
  develop: "develop",
};
const CHECK_CACHE_MS = 3 * 60 * 1000;
const FETCH_HEADERS = { "User-Agent": "CollabFM-Update-Check" };
const MANIFEST_ACCEPT =
  "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json";

/** @type {{ key: string, result: object, expiresAt: number } | null} */
let publishedRevisionCache = null;

function normalizeTrackTag(value) {
  const tag = String(value || "latest").trim().toLowerCase();
  if (tag === "dev") return "develop";
  return TRACK_TAGS.has(tag) ? tag : "latest";
}

function parseImageRepository(imageRepository) {
  const normalized = String(imageRepository || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .toLowerCase();
  const match = normalized.match(/^(?:ghcr\.io\/)?([^/]+\/[^/]+)$/);
  if (!match) {
    throw new Error(`Unsupported image repository: ${imageRepository}`);
  }
  return match[1];
}

async function fetchGhcrPullToken(repoPath) {
  const url = `https://ghcr.io/token?service=ghcr.io&scope=repository:${repoPath}:pull`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`GHCR token request returned ${res.status}`);
  }
  const data = await res.json();
  const token = String(data?.token || "").trim();
  if (!token) throw new Error("GHCR token response missing token");
  return token;
}

async function fetchRegistryJson(repoPath, resourcePath, token) {
  const url = `https://ghcr.io/v2/${repoPath}/${resourcePath}`;
  const res = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: MANIFEST_ACCEPT,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`GHCR registry returned ${res.status} for ${resourcePath}`);
  }
  return res.json();
}

function revisionFromManifest(manifest) {
  const revision = String(
    manifest?.annotations?.["org.opencontainers.image.revision"] || ""
  ).trim();
  const version = String(
    manifest?.annotations?.["org.opencontainers.image.version"] || ""
  ).trim();
  if (revision) {
    return {
      revision,
      version: version || revision.slice(0, 7),
    };
  }
  return null;
}

async function fetchPublishedImageRevision(imageRepository, tag) {
  const cacheKey = `${imageRepository}:${tag}`;
  const now = Date.now();
  if (
    publishedRevisionCache &&
    publishedRevisionCache.key === cacheKey &&
    publishedRevisionCache.expiresAt > now
  ) {
    return publishedRevisionCache.result;
  }

  const repoPath = parseImageRepository(imageRepository);
  const token = await fetchGhcrPullToken(repoPath);
  let manifest = await fetchRegistryJson(repoPath, `manifests/${tag}`, token);

  let published = revisionFromManifest(manifest);
  if (!published && Array.isArray(manifest?.manifests) && manifest.manifests.length) {
    const preferred =
      manifest.manifests.find(
        (entry) =>
          entry?.platform?.os === "linux" && entry?.platform?.architecture === "amd64"
      ) || manifest.manifests[0];
    const digest = String(preferred?.digest || "").trim();
    if (digest) {
      manifest = await fetchRegistryJson(repoPath, `manifests/${digest}`, token);
      published = revisionFromManifest(manifest);
    }
  }

  if (!published && manifest?.config?.digest) {
    const configBlob = await fetchRegistryJson(
      repoPath,
      `blobs/${manifest.config.digest}`,
      token
    );
    const revision = String(
      configBlob?.config?.Labels?.["org.opencontainers.image.revision"] || ""
    ).trim();
    const version = String(
      configBlob?.config?.Labels?.["org.opencontainers.image.version"] || ""
    ).trim();
    if (revision) {
      published = { revision, version: version || revision.slice(0, 7) };
    }
  }

  if (!published?.revision) {
    throw new Error(`Published image :${tag} is missing revision metadata`);
  }

  publishedRevisionCache = {
    key: cacheKey,
    result: published,
    expiresAt: now + CHECK_CACHE_MS,
  };
  return published;
}

export function getContainerUpdateSettings() {
  return {
    notifyOnBuildAvailable: getSetting("updates.notifyOnBuildAvailable", false) === true,
    trackTag: normalizeTrackTag(getSetting("updates.trackTag", "latest")),
  };
}

export function saveContainerUpdateSettings(body = {}) {
  const current = getContainerUpdateSettings();
  const next = {
    notifyOnBuildAvailable:
      typeof body.notifyOnBuildAvailable === "boolean"
        ? body.notifyOnBuildAvailable
        : current.notifyOnBuildAvailable,
    trackTag:
      body.trackTag != null ? normalizeTrackTag(body.trackTag) : current.trackTag,
  };
  setSetting("updates.notifyOnBuildAvailable", next.notifyOnBuildAvailable);
  setSetting("updates.trackTag", next.trackTag);
  return next;
}

export async function checkForContainerUpdate(trackTagInput = null) {
  const settings = getContainerUpdateSettings();
  const trackTag = normalizeTrackTag(trackTagInput || settings.trackTag);
  const build = getBuildInfo();
  const branch = TAG_TO_BRANCH[trackTag] || "main";
  const checkedAt = new Date().toISOString();

  const current = {
    buildId: build.buildId,
    revision: build.revision,
    version: build.version,
    channel: build.channel,
    builtAt: build.builtAt,
    imageRepository: build.imageRepository,
    trackTag,
  };

  if (build.revision === "local" || build.channel === "development") {
    return {
      updateAvailable: false,
      current,
      remote: null,
      checkedAt,
      note: "Local or development runtime — remote update check skipped.",
    };
  }

  try {
    const remote = await fetchPublishedImageRevision(build.imageRepository, trackTag);
    const updateAvailable =
      remote.revision.length >= 7 &&
      build.revision.length >= 7 &&
      remote.revision.slice(0, 40) !== build.revision.slice(0, 40);

    return {
      updateAvailable,
      current,
      remote: {
        revision: remote.revision,
        version: remote.version,
        tag: trackTag,
        branch,
        image: `${build.imageRepository}:${trackTag}`,
      },
      checkedAt,
    };
  } catch (error) {
    console.error("[ContainerUpdates] check failed:", error);
    return {
      updateAvailable: false,
      current,
      remote: null,
      checkedAt,
      error: "Update check failed",
    };
  }
}
