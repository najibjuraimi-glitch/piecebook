// Cloudflare Access JWT verification. Access puts a signed JWT on every request
// it lets through (`Cf-Access-Jwt-Assertion` header, or the `CF_Authorization`
// cookie). The Worker checks the signature against the team's public keys so a
// misconfigured policy, or a caller that reaches workers.dev directly, cannot
// get in by sending the email header on its own.
//
// Env:
//   ACCESS_TEAM_DOMAIN   https://<team>.cloudflareaccess.com
//   ACCESS_AUD           comma-separated Access application audience tags
//   OWNER_EMAIL          the identity a service token reads as
//   SERVICE_TOKEN_WRITE  "1" lets service tokens write; anything else is read-only
//   ACCESS_DEV_IDENTITY  wrangler dev only: honoured when the request host is localhost

const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;

let jwksCache = { domain: null, fetchedAt: 0, keys: [] };

/** When WRITE_CLIENT_IDS is set, only those service-token client ids may write. A signed-in phone is always allowed. Empty means no allowlist. */
export function writerAllowed(identity, env) {
  const raw = String((env && env.WRITE_CLIENT_IDS) || "").trim();
  if (!raw) return true;
  if (!identity) return false;
  if (identity.kind === "user") return true;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(String(identity.name || "").trim());
}

export function accessConfigured(env) {
  return Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
}

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(seg) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

function tokenFrom(req) {
  const h = req.headers.get("Cf-Access-Jwt-Assertion");
  if (h) return h.trim();
  const cookie = req.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? m[1].trim() : null;
}

async function loadJwks(domain, fetcher, force) {
  const fresh = jwksCache.domain === domain && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache.keys;
  const r = await fetcher(`${domain}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`jwks_${r.status}`);
  const body = await r.json();
  const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => k && k.kty === "RSA" && k.kid && k.n && k.e) : [];
  jwksCache = { domain, fetchedAt: Date.now(), keys };
  return keys;
}

async function verifySignature(jwk, signingInput, signature) {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(signingInput));
}

function audiences(env) {
  return String(env.ACCESS_AUD || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function identityFromClaims(claims, env) {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (email) return { email, kind: "user", name: email, readOnly: false };
  // Service tokens carry the client id as common_name and no email. They act as the owner.
  const cn = typeof claims.common_name === "string" ? claims.common_name : "";
  if (cn) {
    const owner = String(env.OWNER_EMAIL || "").trim().toLowerCase();
    if (!owner) return null;
    return { email: owner, kind: "service", name: cn, readOnly: env.SERVICE_TOKEN_WRITE !== "1" };
  }
  return null;
}

/**
 * Resolve the caller. Returns { ok: true, identity } or { ok: false, status, error }.
 * `deps.fetcher` and `deps.now` exist for tests.
 */
export async function verifyAccess(req, env, deps = {}) {
  const fetcher = deps.fetcher || ((u, i) => fetch(u, i));
  const nowS = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const host = new URL(req.url).hostname;
  if (env.ACCESS_DEV_IDENTITY && (host === "localhost" || host === "127.0.0.1")) {
    const email = String(env.ACCESS_DEV_IDENTITY).trim().toLowerCase();
    return { ok: true, identity: { email, kind: "user", name: email, readOnly: false, dev: true } };
  }
  if (!accessConfigured(env)) return { ok: false, status: 503, error: "access_not_configured" };
  const token = tokenFrom(req);
  if (!token) return { ok: false, status: 401, error: "unauthorized", detail: "no_access_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 401, error: "unauthorized", detail: "malformed_token" };
  let header, claims;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return { ok: false, status: 401, error: "unauthorized", detail: "malformed_token" };
  }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, status: 401, error: "unauthorized", detail: "bad_alg" };

  const domain = String(env.ACCESS_TEAM_DOMAIN).replace(/\/+$/, "");
  let keys;
  try {
    keys = await loadJwks(domain, fetcher, false);
    if (!keys.some((k) => k.kid === header.kid)) keys = await loadJwks(domain, fetcher, true);
  } catch {
    return { ok: false, status: 503, error: "access_keys_unavailable" };
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, status: 401, error: "unauthorized", detail: "unknown_kid" };

  let valid = false;
  try {
    valid = await verifySignature(jwk, `${parts[0]}.${parts[1]}`, b64urlToBytes(parts[2]));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, error: "unauthorized", detail: "bad_signature" };

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const wanted = audiences(env);
  if (!aud.some((a) => wanted.includes(a))) return { ok: false, status: 401, error: "unauthorized", detail: "bad_aud" };
  if (claims.iss && String(claims.iss).replace(/\/+$/, "") !== domain) return { ok: false, status: 401, error: "unauthorized", detail: "bad_iss" };
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) return { ok: false, status: 401, error: "unauthorized", detail: "expired" };
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) return { ok: false, status: 401, error: "unauthorized", detail: "not_yet_valid" };

  const identity = identityFromClaims(claims, env);
  if (!identity) return { ok: false, status: 403, error: "no_identity" };
  return { ok: true, identity };
}

/** Test seam. */
export function resetAccessCacheForTests() {
  jwksCache = { domain: null, fetchedAt: 0, keys: [] };
}
