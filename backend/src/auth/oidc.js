import crypto from "crypto";
import { verifyOidcIdToken } from "../security/jwtVerify.js";
import { getUserById } from "../db/index.js";
import { extractOidcProfileClaims } from "./oidcUser.js";

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

/** Resolve authorize/token/userinfo URLs from OIDC discovery. */
async function resolveOidcDiscovery(oidc) {
  const issuer = normalizeIssuer(oidc.issuer);
  if (!issuer) throw new Error("OIDC issuer not configured");

  if (oidc.authorizationEndpoint && oidc.tokenEndpoint) {
    return {
      authorizationEndpoint: oidc.authorizationEndpoint,
      tokenEndpoint: oidc.tokenEndpoint,
      userinfoEndpoint: oidc.userinfoEndpoint || null,
    };
  }

  const cached = discoveryCache.get(issuer);
  if (cached && cached.exp > Date.now()) return cached.endpoints;

  const doc = await fetchJson(`${issuer}/.well-known/openid-configuration`);
  const endpoints = {
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    userinfoEndpoint: doc.userinfo_endpoint || null,
  };
  if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
    throw new Error("OIDC discovery document missing authorization or token endpoint");
  }

  discoveryCache.set(issuer, { exp: Date.now() + 60 * 60 * 1000, endpoints });
  return endpoints;
}

async function resolveOidcEndpoints(oidc) {
  const discovery = await resolveOidcDiscovery(oidc);
  return {
    authorizationEndpoint: discovery.authorizationEndpoint,
    tokenEndpoint: discovery.tokenEndpoint,
  };
}

async function fetchOidcUserinfo(oidc, accessToken) {
  if (!accessToken) return null;
  const { userinfoEndpoint } = await resolveOidcDiscovery(oidc);
  if (!userinfoEndpoint) return null;
  try {
    return await fetchJson(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    console.warn("[oidc] userinfo fetch failed:", e.message);
    return null;
  }
}

export async function mergeOidcClaimsWithUserinfo(idTokenClaims, oidc, accessToken) {
  let claims = { ...idTokenClaims };
  if (!claims.email && accessToken) {
    const userinfo = await fetchOidcUserinfo(oidc, accessToken);
    if (userinfo && typeof userinfo === "object") {
      claims = { ...claims, ...userinfo };
    }
  }
  return claims;
}

export async function handleOidcLogin(req, res, oidc) {
  cleanupStates();
  const url = new URL(req.url, "http://localhost");
  const intent = url.searchParams.get("intent");
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, {
    exp: Date.now() + 10 * 60 * 1000,
    intent: intent === "hybrid_verify" ? "hybrid_verify" : null,
  });
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

export async function handleOidcCallback(req, res, oidc, createUserSession, getAppSession) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const pending = pendingStates.get(state);
  if (!code || !state || !pending) {
    res.writeHead(302, { Location: "/?error=oidc_state" });
    res.end();
    return;
  }
  pendingStates.delete(state);
  const intent = pending.intent;

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
    const idClaims = await verifyOidcIdToken(tokens.id_token, oidc);
    const claims = await mergeOidcClaimsWithUserinfo(
      { ...idClaims, groupClaim: oidc.groupClaim },
      oidc,
      tokens.access_token,
    );

    if (intent === "hybrid_verify") {
      const session = getAppSession?.(req);
      if (!session?.user?.id) {
        res.writeHead(302, { Location: "/?error=oidc_session_required" });
        res.end();
        return;
      }
      const subject = String(claims.sub || "");
      const sessionUser = getUserById(Number(session.user.id));
      if (!sessionUser?.oidc_subject || sessionUser.oidc_subject !== subject) {
        res.writeHead(302, { Location: "/broadcaster?error=oidc_subject_mismatch" });
        res.end();
        return;
      }
      const { syncOidcProfileOnLogin } = await import("./oidcUser.js");
      syncOidcProfileOnLogin(sessionUser, claims);
      const profile = extractOidcProfileClaims(claims);
      const emailKnown = !!profile.email;
      res.writeHead(302, {
        Location: emailKnown ? "/broadcaster?hybrid=ready" : "/broadcaster?error=oidc_no_email",
      });
      res.end();
      return;
    }

    const { provisionOidcUser } = await import("./oidcUser.js");
    const user = provisionOidcUser(claims, oidc);
    createUserSession(req, res, user.id, "oidc");
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    console.error("[oidc] callback error:", e.message);
    res.writeHead(302, { Location: "/?error=oidc_failed" });
    res.end();
  }
}
