import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config.json");
const isContainerRuntime = process.env.COLLABFM_RUNTIME === "docker";

const DEFAULT_CONFIG = {
  server: {
    webPort: 4002,
    wsPort: 4001,
    allowedOrigins: ["http://localhost:5173", "http://localhost:4002"],
    storageDir: isContainerRuntime ? "./storage" : "./local/storage",
    debugLogDir: isContainerRuntime ? "./logs" : "./local/logs",
    pcmRelayPort: 4100,
  },
};

if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  console.log("Created backend/config.json with default settings");
}

for (const rel of [DEFAULT_CONFIG.server.storageDir, DEFAULT_CONFIG.server.debugLogDir]) {
  const dirPath = path.join(root, rel);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
