export function isChromeExtensionClient(req) {
  const origin = req.headers.origin;
  if (origin && String(origin).startsWith("chrome-extension://")) return true;
  const referer = req.headers.referer || req.headers.referrer;
  if (referer && String(referer).startsWith("chrome-extension://")) return true;
  return false;
}

export function extensionPairingRequiredMessage() {
  return "Browser extension must use device pairing. Open the extension and pair with your account, or use a guest broadcaster link.";
}

export function rejectExtensionOnWebBroadcasterRoute(req, res, json) {
  if (!isChromeExtensionClient(req)) return false;
  json(res, 403, { error: extensionPairingRequiredMessage() });
  return true;
}

/**
 * Legacy relay endpoints (/api/ws-token, /api/metadata, /api/capabilities) must not
 * fall back to website session auth when the caller is the browser extension.
 */
export function extensionClientBlocksSessionFallback(req) {
  return isChromeExtensionClient(req);
}

export function legacyWsTokenRequiresDeviceAuth() {
  return true;
}
