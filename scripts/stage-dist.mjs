import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "frontend", "dist");
const dest = path.join(root, "backend", "dist");

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("Missing frontend/dist — run vite build first");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Staged UI: frontend/dist → backend/dist`);
