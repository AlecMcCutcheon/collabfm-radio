import fs from "fs";
import { getSetting, setSetting } from "../db/index.js";
import {
  clearCustomVisualizer,
  hasCustomVisualizer,
  resolveCustomVisualizerFile,
} from "../db/brandingAssets.js";
import { getIntegrationsConfig } from "../settings/integrations.js";

export const DEFAULT_RADIO_DISPLAY_NAME = "CollabFM Radio";
export const DEFAULT_VISUALIZER_IMAGE = "/profile.webp";
export const CUSTOM_VISUALIZER_PATH = "/api/branding/visualizer";

export function getBrandingSettings() {
  const custom = hasCustomVisualizer();
  const integrations = getIntegrationsConfig({});
  return {
    radioDisplayName: getSetting("radioDisplayName", DEFAULT_RADIO_DISPLAY_NAME),
    visualizerImageUrl: custom ? CUSTOM_VISUALIZER_PATH : DEFAULT_VISUALIZER_IMAGE,
    hasCustomVisualizer: custom,
    hideDeveloperAboutMessage:
      getSetting("branding.hideDeveloperAboutMessage", false) === true,
    branded2fa: getSetting("branding.branded2fa", false) === true,
    features: {
      songSearch: !!integrations.lastfmApiKey,
      chatGifs: !!integrations.giphyApiKey,
    },
  };
}

export function resetBrandingSettings() {
  setSetting("radioDisplayName", DEFAULT_RADIO_DISPLAY_NAME);
  setSetting("branding.hideDeveloperAboutMessage", false);
  setSetting("branding.branded2fa", false);
  clearCustomVisualizer();
  return getBrandingSettings();
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function handleBrandingRoutes(req, res, pathname, method) {
  if (pathname === "/api/branding" && method === "GET") {
    return json(res, 200, getBrandingSettings());
  }

  if (pathname === "/api/branding/visualizer" && method === "GET") {
    const file = resolveCustomVisualizerFile();
    if (!file) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No custom visualizer" }));
      return true;
    }
    res.writeHead(200, {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=300",
    });
    fs.createReadStream(file.filePath).pipe(res);
    return true;
  }

  return false;
}

export { readBody as readBrandingBody };
