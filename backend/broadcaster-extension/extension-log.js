/**
 * Forward extension diagnostics to the popup console (popup DevTools is the
 * only practical log surface for most users). Background keeps a short ring
 * buffer so opening the popup mid-broadcast still shows recent events.
 */
const MAX_RECENT_LOGS = 50;

export function extensionLog(source, message, detail = null, level = "info") {
  const payload = {
    type: "POPUP_DEBUG_LOG",
    source: String(source || "ext"),
    level: level === "error" || level === "warn" ? level : "info",
    message: String(message || ""),
    detail: detail ?? null,
    ts: Date.now(),
  };
  try {
    chrome.runtime.sendMessage({ type: "EXT_LOG", payload }).catch(() => {});
  } catch {
    // service worker unavailable
  }
}

export function formatExtensionLogLine(message) {
  const detail =
    message.detail != null
      ? typeof message.detail === "string"
        ? message.detail
        : JSON.stringify(message.detail)
      : "";
  const line = detail ? `${message.message} ${detail}` : message.message;
  return `[${message.source}] ${line}`;
}

export { MAX_RECENT_LOGS };
