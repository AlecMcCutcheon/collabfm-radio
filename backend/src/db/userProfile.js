import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDb, getStorageDir, getUserById } from "./index.js";
import {
  normalizeProfileBio,
  normalizeProfileGenres,
} from "./musicGenres.js";
import { publicLevelInfo } from "./userLevel.js";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function avatarsDir() {
  const dir = path.join(getStorageDir(), "avatars");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function publicDisplayName(user) {
  if (!user) return null;
  const custom = String(user.display_name || "").trim();
  return custom || user.username || null;
}

export function avatarUrlForUserId(userId) {
  const user = getUserById(Number(userId));
  if (!user?.avatar_filename) return null;
  return `/api/avatars/${userId}?v=${encodeURIComponent(user.avatar_filename)}`;
}

export function getBroadcasterProfile(userId) {
  const user = getUserById(Number(userId));
  if (!user) return null;
  return {
    userId: String(user.id),
    username: user.username,
    displayName: publicDisplayName(user),
    avatarUrl: avatarUrlForUserId(user.id),
    bio: normalizeProfileBio(user.bio),
    genres: normalizeProfileGenres(user.genres),
    level: publicLevelInfo(user),
  };
}

export function updateBroadcasterProfile(userId, { displayName, bio, genres }) {
  const trimmed = String(displayName || "").trim().replace(/\s+/g, "").slice(0, 64);
  const nextBio = bio !== undefined ? normalizeProfileBio(bio) : undefined;
  const nextGenres = genres !== undefined ? normalizeProfileGenres(genres) : undefined;

  const user = getUserById(Number(userId));
  if (!user) return null;

  const bioValue = nextBio !== undefined ? nextBio : normalizeProfileBio(user.bio);
  const genresValue =
    nextGenres !== undefined ? nextGenres : normalizeProfileGenres(user.genres);

  getDb()
    .prepare("UPDATE users SET display_name = ?, bio = ?, genres = ? WHERE id = ?")
    .run(
      trimmed || null,
      bioValue,
      genresValue.length ? JSON.stringify(genresValue) : null,
      userId,
    );
  return getBroadcasterProfile(userId);
}

export function saveBroadcasterAvatar(userId, buffer, mimeType) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Unsupported image type");
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new Error("Image too large (max 2 MB)");
  }

  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";
  const filename = `${userId}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const dir = avatarsDir();

  const user = getUserById(Number(userId));
  if (user?.avatar_filename) {
    try {
      fs.unlinkSync(path.join(dir, user.avatar_filename));
    } catch {}
  }

  fs.writeFileSync(path.join(dir, filename), buffer);
  getDb().prepare("UPDATE users SET avatar_filename = ? WHERE id = ?").run(filename, userId);
  return getBroadcasterProfile(userId);
}

export function resolveAvatarFile(userId) {
  const user = getUserById(Number(userId));
  if (!user?.avatar_filename) return null;
  const filePath = path.join(avatarsDir(), user.avatar_filename);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(user.avatar_filename).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return { filePath, mime };
}

export function publicUserPresentation(user) {
  if (!user) return null;
  return {
    displayName: publicDisplayName(user),
    username: user.username,
    avatar: avatarUrlForUserId(user.id),
    bio: normalizeProfileBio(user.bio),
    genres: normalizeProfileGenres(user.genres),
    level: publicLevelInfo(user),
  };
}
