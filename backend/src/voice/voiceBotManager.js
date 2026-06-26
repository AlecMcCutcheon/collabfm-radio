import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSetting } from "../db/index.js";
import { credentialsFingerprint } from "../discord/verifyBot.js";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HEARTBEAT_STALE_MS = 90_000;

let voiceBotChild = null;
let localStartedAt = null;
let lastLocalExit = null;

export function isExternalVoiceBotMode() {
  // npm run dev (RADIO_DEV=1) always uses the managed subprocess so admin Start/Stop works locally.
  if (process.env.RADIO_DEV === "1") return false;
  return process.env.VOICE_BOT_EXTERNAL === "1";
}

function heartbeatFresh(lastHeartbeat) {
  return typeof lastHeartbeat === "number" && Date.now() - lastHeartbeat < HEARTBEAT_STALE_MS;
}

export function getVoiceBotRuntimeStatus() {
  const voiceBot = getSetting("voiceBot", {});
  const heartbeatOk = heartbeatFresh(voiceBot.lastHeartbeat);
  const localRunning = voiceBotChild != null && voiceBotChild.exitCode == null;
  const external = isExternalVoiceBotMode();
  // Managed mode: only the local subprocess counts. Heartbeat alone is stale after restarts.
  const running = external ? heartbeatOk : localRunning;

  return {
    mode: external ? "external" : "managed",
    running,
    heartbeatOk,
    localProcessRunning: localRunning,
    pid: localRunning ? voiceBotChild.pid : null,
    localStartedAt,
    lastHeartbeat: voiceBot.lastHeartbeat ?? null,
    lastExit: lastLocalExit,
    verified: voiceBot.verified ?? null,
    credentialsConfigured: !!(voiceBot.clientId && voiceBot.botToken),
    enabled: voiceBot.enabled !== false,
  };
}

export function canManagedVoiceBotAutoStart() {
  if (isExternalVoiceBotMode()) return false;
  const voiceBot = getSetting("voiceBot", {});
  if (voiceBot.enabled === false) return false;
  if (!voiceBot.clientId || !voiceBot.botToken) return false;
  if (!voiceBot.verified?.at) return false;
  const fp = credentialsFingerprint(voiceBot.clientId, voiceBot.botToken);
  if (voiceBot.verified.fingerprint && voiceBot.verified.fingerprint !== fp) return false;
  return true;
}

export function maybeAutoStartManagedVoiceBot({ reason = "auto" } = {}) {
  if (!canManagedVoiceBotAutoStart()) {
    console.log(`[VoiceBot] Auto-start skipped (${reason}): credentials not verified or disabled`);
    return { ok: false, skipped: true, reason: "not_ready" };
  }
  const status = getVoiceBotRuntimeStatus();
  if (status.running) {
    return { ok: true, alreadyRunning: true, status: getVoiceBotRuntimeStatus() };
  }
  const result = startManagedVoiceBot();
  if (result.ok && !result.alreadyRunning) {
    console.log(`[VoiceBot] Started managed voice bot (${reason}) pid=${result.pid ?? "?"}`);
  }
  return result;
}

export function startManagedVoiceBot() {
  if (isExternalVoiceBotMode()) {
    return {
      ok: false,
      external: true,
      error:
        "Voice bot runs as a separate Docker service (collabfm-voice). Restart it with: docker compose restart collabfm-voice",
    };
  }

  const status = getVoiceBotRuntimeStatus();
  if (status.running) {
    return { ok: true, alreadyRunning: true, status: getVoiceBotRuntimeStatus() };
  }
  if (voiceBotChild) {
    return { ok: true, alreadyRunning: true, status: getVoiceBotRuntimeStatus() };
  }

  const scriptPath = path.join(backendRoot, "relay-bot.js");
  voiceBotChild = spawn(process.execPath, [scriptPath], {
    cwd: backendRoot,
    env: {
      ...process.env,
      VOICE_BOT_MANAGED: "1",
      BROADCAST_API_HOST: process.env.BROADCAST_API_HOST || "127.0.0.1",
    },
    stdio: "inherit",
  });
  localStartedAt = Date.now();
  lastLocalExit = null;

  voiceBotChild.on("exit", (code, signal) => {
    lastLocalExit = { code, signal, at: Date.now() };
    voiceBotChild = null;
    localStartedAt = null;
  });

  return { ok: true, pid: voiceBotChild.pid, status: getVoiceBotRuntimeStatus() };
}

export function stopManagedVoiceBot() {
  if (isExternalVoiceBotMode()) {
    return {
      ok: false,
      external: true,
      error:
        "Voice bot runs as a separate Docker service. Stop it with: docker compose stop collabfm-voice",
    };
  }

  if (!voiceBotChild) {
    return { ok: true, stopped: false, message: "Voice bot process is not running locally", status: getVoiceBotRuntimeStatus() };
  }

  try {
    voiceBotChild.kill("SIGTERM");
  } catch {}

  const ref = voiceBotChild;
  setTimeout(() => {
    try {
      if (ref && ref.exitCode == null) ref.kill("SIGKILL");
    } catch {}
  }, 5000);

  return { ok: true, stopped: true, status: getVoiceBotRuntimeStatus() };
}

export function shutdownManagedVoiceBot() {
  if (voiceBotChild) {
    try {
      voiceBotChild.kill("SIGTERM");
    } catch {}
  }
}
