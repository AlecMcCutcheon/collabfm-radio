import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import archiver from "archiver";

const SKIP_NAMES = new Set([".DS_Store", "Thumbs.db"]);
const SKIP_REL_PATHS = new Set([
  "README.md",
  "test-websocket.html",
  "create_icons.html",
  "sites/CONTRIBUTING.md",
]);

function shouldInclude(relPath) {
  const base = path.basename(relPath);
  if (SKIP_NAMES.has(base)) return false;
  if (base.startsWith(".")) return false;
  if (SKIP_REL_PATHS.has(relPath.replace(/\\/g, "/"))) return false;
  return true;
}

function addDirectory(archive, dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!shouldInclude(rel)) continue;
    if (entry.isDirectory()) {
      addDirectory(archive, abs, rel);
    } else if (entry.isFile()) {
      archive.file(abs, { name: rel });
    }
  }
}

/** Build a zip buffer from an unpacked extension directory (no external zip CLI). */
export function buildExtensionZipBuffer(extDir) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const out = new PassThrough();
    out.on("data", (chunk) => chunks.push(chunk));
    out.on("end", () => resolve(Buffer.concat(chunks)));
    out.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(out);
    addDirectory(archive, extDir);
    archive.finalize();
  });
}
