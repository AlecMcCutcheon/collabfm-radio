import { getSetting, setSetting } from "../db/index.js";
import { getBuildInfo } from "../radio/buildInfo.js";

const TRACK_TAGS = new Set(["latest", "develop"]);
const TAG_TO_BRANCH = {
  latest: "main",
  develop: "develop",
};

function normalizeTrackTag(value) {
  const tag = String(value || "latest").trim().toLowerCase();
  if (tag === "dev") return "develop";
  return TRACK_TAGS.has(tag) ? tag : "latest";
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

async function fetchGitHubBranchHeadSha(githubRepository, branch) {
  const url = `https://api.github.com/repos/${githubRepository}/commits/${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CollabFM-Update-Check",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub commits API returned ${res.status}`);
  }
  const data = await res.json();
  const sha = String(data?.sha || "").trim();
  if (!sha) throw new Error("GitHub commits API missing sha");
  return {
    revision: sha,
    version:
      String(data?.commit?.message || "")
        .split("\n")[0]
        .trim()
        .slice(0, 180) || sha.slice(0, 7),
  };
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
    const remote = await fetchGitHubBranchHeadSha(build.githubRepository, branch);
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
    return {
      updateAvailable: false,
      current,
      remote: null,
      checkedAt,
      error: error?.message || String(error),
    };
  }
}
