import crypto from "crypto";
import { verifyOidcIdToken } from "../security/jwtVerify.js";

const pendingStates = new Map();
const discoveryCache = new Map();

function cleanupStates() {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v.exp < now) pendingStates.delete(k);
  }
}

function normalizeIssuer(issuer) {
  return String(issuer || "").replace(/\/$/, "");
}

async function fetchJson(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OIDC request failed: ${r.status} ${text}`);
  }
  return r.json();
}

/** Resolve authorize/token URLs from OIDC discovery (Authentik uses shared /application/o/authorize/). */
async function resolveOidcEndpoints(oidc) {
  const issuer = normalizeIssuer(oidc.issuer);
  if (!issuer) throw new Error("OIDC issuer not configured");

  if (oidc.authorizationEndpoint && oidc.tokenEndpoint) {
    return {
      authorizationEndpoint: oidc.authorizationEndpoint,
      tokenEndpoint: oidc.tokenEndpoint,
    };
  }

  const cached = discoveryCache.get(issuer);
  if (cached && cached.exp > Date.now()) return cached.endpoints;

  const doc = await fetchJson(`${issuer}/.well-known/openid-configuration`);
  const endpoints = {
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
  };
  if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
    throw new Error("OIDC discovery document missing authorization or token endpoint");
  }

  discoveryCache.set(issuer, { exp: Date.now() + 60 * 60 * 1000, endpoints });
  return endpoints;
}

export async function handleOidcLogin(req, res, oidc) {
  cleanupStates();
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { exp: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: oidc.clientId,
    response_type: "code",
    scope: oidc.scopes || "openid profile email groups",
    redirect_uri: oidc.redirectUri,
    state,
  });

  try {
    const { authorizationEndpoint } = await resolveOidcEndpoints(oidc);
    const joiner = authorizationEndpoint.includes("?") ? "&" : "?";
    res.writeHead(302, { Location: `${authorizationEndpoint}${joiner}${params}` });
    res.end();
  } catch (e) {
    console.error("[oidc] login error:", e.message);
    res.writeHead(302, { Location: "/?error=oidc_config" });
    res.end();
  }
}

export async function handleOidcCallback(req, res, oidc, createUserSession) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !pendingStates.has(state)) {
    res.writeHead(302, { Location: "/?error=oidc_state" });
    res.end();
    return;
  }
  pendingStates.delete(state);

  try {
    const { tokenEndpoint } = await resolveOidcEndpoints(oidc);
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oidc.redirectUri,
      client_id: oidc.clientId,
      client_secret: oidc.clientSecret,
    });
    const tokens = await fetchJson(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const claims = await verifyOidcIdToken(tokens.id_token, oidc);
    const { provisionOidcUser } = await import("./oidcUser.js");
    const user = provisionOidcUser({ ...claims, groupClaim: oidc.groupClaim }, oidc);
    createUserSession(req, res, user.id);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    console.error("[oidc] callback error:", e.message);
    res.writeHead(302, { Location: "/?error=oidc_failed" });
    res.end();
  }
}
