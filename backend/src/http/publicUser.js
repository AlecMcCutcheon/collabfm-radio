import { getUserById } from "../db/index.js";
import { getBroadcasterProfile } from "../db/userProfile.js";
import { roleInfoForUser } from "../auth/permissions.js";
import { hasSessionOrShareToken } from "../security/access.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handlePublicUserRoutes(req, res, pathname, method, getAppSession) {
  if (pathname !== "/api/users/public-profile" || method !== "GET") return false;

  if (!hasSessionOrShareToken(req, getAppSession)) {
    json(res, 401, { error: "Unauthorized" });
    return true;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const userId = Number(url.searchParams.get("userId"));
    if (!Number.isFinite(userId) || userId <= 0) {
      json(res, 400, { error: "Invalid userId" });
      return true;
    }

    const profile = getBroadcasterProfile(userId);
    if (!profile) {
      json(res, 404, { error: "Not found" });
      return true;
    }

    const user = getUserById(userId);
    json(res, 200, {
      profile: {
        ...profile,
        roleColor: user ? roleInfoForUser(user).roleColor : null,
      },
    });
  } catch {
    json(res, 500, { error: "Failed to load profile" });
  }
  return true;
}
