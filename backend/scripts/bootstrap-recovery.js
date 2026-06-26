#!/usr/bin/env node
/**
 * Anti-lockout: regenerate a one-time recovery login (admin + token).
 * Run inside the container or against the same appdata/storage:
 *   node scripts/bootstrap-recovery.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase } from "../src/db/index.js";
import { loadAppConfig } from "../src/config/loadConfig.js";
import {
  activateRecoveryMode,
  printBootstrapBanner,
} from "../src/setup/bootstrapToken.js";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(backendRoot, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("config.json not found — run from app root with config present");
  process.exit(1);
}

const config = loadAppConfig(configPath, backendRoot);
const storageDir = config.server?.storageDir || path.join(backendRoot, "storage");
initDatabase(storageDir);

try {
  const token = await activateRecoveryMode();
  printBootstrapBanner(token, { recovery: true });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
