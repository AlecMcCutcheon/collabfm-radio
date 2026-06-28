const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * CORS for the broadcaster extension only. Auth uses Authorization headers, not cookies.
 * Returns true when extension CORS headers were applied.
 */
export function applyChromeExtensionCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!CHROME_EXTENSION_ORIGIN.test(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  return true;
}
