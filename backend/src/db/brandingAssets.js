import fs from "fs";
import path from "path";
import { getSetting, setSetting, getStorageDir } from "./index.js";

const VISUALIZER_BASENAME = "visualizer-custom";
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function brandingDir() {
  const dir = path.join(getStorageDir(), "branding");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mimeToExt(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function extToMime(ext) {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function removeCustomVisualizerFiles() {
  const dir = brandingDir();
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(VISUALIZER_BASENAME)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {}
    }
  }
}

export function hasCustomVisualizer() {
  return !!getSetting("visualizerCustom", false);
}

export function resolveCustomVisualizerFile() {
  if (!hasCustomVisualizer()) return null;
  const dir = brandingDir();
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(VISUALIZER_BASENAME)) continue;
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) continue;
    return { filePath, mime: extToMime(path.extname(name).toLowerCase()) };
  }
  return null;
}

export function saveCustomVisualizer(buffer, mimeType) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Unsupported image type");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("Image too large (max 4 MB)");
  }
  removeCustomVisualizerFiles();
  const ext = mimeToExt(mimeType);
  const filePath = path.join(brandingDir(), `${VISUALIZER_BASENAME}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  setSetting("visualizerCustom", true);
}

export function clearCustomVisualizer() {
  removeCustomVisualizerFiles();
  setSetting("visualizerCustom", false);
}
