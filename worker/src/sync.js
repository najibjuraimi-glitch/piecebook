// Cloud copy of the collector's piecebook.* keys, one KV entry per key per
// identity. Last-write-wins on the ISO `updatedAt` stamp; the Worker never
// merges inside a value. Binding: USER_DATA (KV).

const KEY_RE = /^piecebook\.[A-Za-z0-9.]{1,48}$/;
const MAX_DOCS = 32;
const MAX_VALUE_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

const prefix = (identity) => `u:${identity.toLowerCase()}:`;

const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

async function readAll(kv, identity) {
  const docs = {};
  let cursor;
  do {
    const page = await kv.list({ prefix: prefix(identity), cursor, limit: 100 });
    for (const k of page.keys) {
      const key = k.name.slice(prefix(identity).length);
      if (!KEY_RE.test(key)) continue;
      const doc = await kv.get(k.name, "json");
      if (doc && typeof doc.updatedAt === "string" && "value" in doc) docs[key] = { value: doc.value, updatedAt: doc.updatedAt };
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return docs;
}

function cleanIncoming(raw, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "docs_required" };
  const entries = Object.entries(raw);
  if (entries.length > MAX_DOCS) return { error: "too_many_keys" };
  const docs = {};
  for (const [key, d] of entries) {
    if (!KEY_RE.test(key)) return { error: "bad_key", key };
    if (!d || typeof d !== "object" || !("value" in d)) return { error: "bad_doc", key };
    const t = Date.parse(d.updatedAt);
    if (!Number.isFinite(t)) return { error: "bad_updated_at", key };
    // A clock far ahead would win forever; clamp to now.
    const updatedAt = t > nowMs + FUTURE_SKEW_MS ? new Date(nowMs).toISOString() : new Date(t).toISOString();
    const size = JSON.stringify(d.value === undefined ? null : d.value).length;
    if (size > MAX_VALUE_BYTES) return { error: "value_too_large", key };
    docs[key] = { value: d.value === undefined ? null : d.value, updatedAt };
  }
  return { docs };
}

/**
 * GET  /sync       → { identity, kind, readOnly, docs }
 * PUT  /sync       ← { docs }  → { identity, kind, readOnly, docs: winners for the keys sent }
 * GET  /sync/<key> → { identity, kind, readOnly, key, doc | null }
 */
export async function handleSync(req, env, identity, cors, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const kv = env.USER_DATA;
  if (!kv) return json({ error: "sync_not_configured", detail: "no USER_DATA binding" }, 503, cors);
  const url = new URL(req.url);
  const base = { identity: identity.email, kind: identity.kind, readOnly: Boolean(identity.readOnly) };
  const sub = url.pathname.replace(/^\/sync\/?/, "");

  if (req.method === "GET" && sub) {
    if (!KEY_RE.test(sub)) return json({ error: "bad_key" }, 400, cors);
    const doc = await kv.get(prefix(identity.email) + sub, "json");
    return json({ ...base, key: sub, doc: doc || null }, 200, cors);
  }
  if (req.method === "GET") return json({ ...base, docs: await readAll(kv, identity.email) }, 200, cors);

  if (req.method !== "PUT") return json({ error: "method_not_allowed" }, 405, cors);
  if (identity.readOnly) return json({ error: "read_only", ...base }, 403, cors);
  const declared = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_BODY_BYTES) return json({ error: "too_large" }, 413, cors);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  const cleaned = cleanIncoming(body?.docs, now);
  if (cleaned.error) return json({ error: cleaned.error, key: cleaned.key }, 400, cors);

  const winners = {};
  for (const [key, incoming] of Object.entries(cleaned.docs)) {
    const name = prefix(identity.email) + key;
    const existing = await kv.get(name, "json");
    if (existing && typeof existing.updatedAt === "string" && existing.updatedAt >= incoming.updatedAt) {
      winners[key] = { value: existing.value, updatedAt: existing.updatedAt };
      continue;
    }
    await kv.put(name, JSON.stringify(incoming));
    winners[key] = incoming;
  }
  return json({ ...base, docs: winners }, 200, cors);
}
