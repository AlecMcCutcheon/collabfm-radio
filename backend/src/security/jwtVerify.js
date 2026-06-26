import crypto from "crypto";

const jwksCache = new Map();

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

async function fetchJson(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getJwksForIssuer(issuer) {
  const key = String(issuer).replace(/\/$/, "");
  const cached = jwksCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.jwks;

  const doc = await fetchJson(`${key}/.well-known/openid-configuration`);
  const jwksUri = doc.jwks_uri;
  if (!jwksUri) throw new Error("OIDC discovery missing jwks_uri");
  const jwks = await fetchJson(jwksUri);
  jwksCache.set(key, { exp: Date.now() + 60 * 60 * 1000, jwks });
  return jwks;
}

function rsaKeyFromJwk(jwk) {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) throw new Error("Unsupported JWK");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/**
 * Verify OIDC id_token signature and standard claims.
 */
export async function verifyOidcIdToken(idToken, oidc) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token format");

  const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  const signature = base64UrlDecode(parts[2]);

  const issuer = String(oidc.issuer || "").replace(/\/$/, "");
  const jwks = await getJwksForIssuer(issuer);
  const jwk = (jwks.keys || []).find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error("No matching JWK for id_token");

  const key = rsaKeyFromJwk(jwk);
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const ok = crypto.verify("RSA-SHA256", data, key, signature);
  if (!ok) throw new Error("id_token signature invalid");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp != null && now >= Number(payload.exp)) throw new Error("id_token expired");
  if (payload.nbf != null && now < Number(payload.nbf)) throw new Error("id_token not yet valid");

  const iss = String(payload.iss || "").replace(/\/$/, "");
  if (iss !== issuer) throw new Error("id_token issuer mismatch");

  const aud = payload.aud;
  const clientId = String(oidc.clientId || "");
  const audOk = Array.isArray(aud) ? aud.includes(clientId) : aud === clientId;
  if (!audOk) throw new Error("id_token audience mismatch");

  return payload;
}
