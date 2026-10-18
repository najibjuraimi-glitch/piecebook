/**
 * Holdings API. Piecebook stores the rows in USER_DATA, behind Access.
 * A service token may add and update. The token is never logged or returned.
 * Each write appends the caller (service client id or Access email) and the time
 * to the history record. The client secret is not stored.
 *
 *   GET    /holdings
 *   POST   /holdings
 *   POST   /holdings/import
 *   POST   /holdings/snapshot
 *   GET    /holdings/history
 *   PATCH  /holdings/:rowId
 *   POST   /holdings/:rowId/sold
 */
import { writerAllowed } from "./access.js";
import { acceptSnapshot, createHolding, emptyHoldings, importHoldings, markSold, patchHolding } from "../../src/lib/holdings.ts";

const STORE = "holdings.v1";
const HISTORY = "holdings-history.v1";
const MAX_BODY = 2_000_000;

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function fail(result, cors) {
  const body = { error: result.error };
  if (result.detail) body.detail = result.detail;
  if (result.revision != null) body.revision = result.revision;
  return json(body, result.status, cors);
}

export const keyFor = (email, name) => `u:${String(email).toLowerCase()}:${name}`;

/**
 * One book. A signed-in phone uses its Access email. A service token has no
 * email; it is pinned to OWNER_EMAIL, the same address the phone uses.
 */
export function bookEmail(identity, env) {
  if (identity.kind === "service") return String(env.OWNER_EMAIL || "").trim().toLowerCase();
  return String(identity.email || "").trim().toLowerCase();
}

async function readDoc(kv, email) {
  const doc = await kv.get(keyFor(email, STORE), "json");
  if (!doc || typeof doc.revision !== "number" || !Array.isArray(doc.copies)) return emptyHoldings();
  return doc;
}

const MAX_WRITES = 2000;

async function loadHistory(kv, email) {
  const doc = await kv.get(keyFor(email, HISTORY), "json");
  return {
    rows: doc && Array.isArray(doc.rows) ? doc.rows : [],
    writes: doc && Array.isArray(doc.writes) ? doc.writes : [],
  };
}

/** Service token: client id (JWT common_name). Signed-in phone: Access email. Never the secret. */
export function callerOf(identity) {
  if (identity && identity.kind === "service") return String(identity.name || "").trim();
  return String((identity && identity.email) || "").trim().toLowerCase();
}

export function writeNote(identity, now, op, rowId) {
  const note = { at: new Date(now).toISOString(), caller: callerOf(identity), op };
  if (rowId) note.rowId = rowId;
  return note;
}

async function saveHistory(kv, email, rows, writes) {
  const kept = writes.length > MAX_WRITES ? writes.slice(writes.length - MAX_WRITES) : writes;
  await kv.put(keyFor(email, HISTORY), JSON.stringify({ rows, writes: kept }));
  return kept;
}

async function recordWrite(kv, email, identity, now, op, rowId) {
  const history = await loadHistory(kv, email);
  await saveHistory(kv, email, history.rows, history.writes.concat(writeNote(identity, now, op, rowId)));
}

export async function handleHoldings(req, env, identity, cors, deps = {}) {
  const kv = env.USER_DATA;
  if (!kv) return json({ error: "holdings_not_configured", detail: "no USER_DATA binding" }, 503, cors);
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "holdings") return json({ error: "not_found" }, 404, cors);
  const now = deps.now ? deps.now() : Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const log = deps.log || (() => {});
  const email = bookEmail(identity, env);
  if (!email) return json({ error: "no_identity" }, 403, cors);
  if (req.method !== "GET" && !writerAllowed(identity, env)) return json({ error: "writer_not_allowed" }, 403, cors);

  const declared = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_BODY) return json({ error: "too_large" }, 413, cors);

  if (req.method === "GET" && parts.length === 1) {
    const doc = await readDoc(kv, email);
    const history = await loadHistory(kv, email);
    return json({ source: "piecebook", revision: doc.revision, copies: doc.copies, history: history.rows, writes: history.writes }, 200, cors);
  }
  if (req.method === "GET" && parts.length === 2 && parts[1] === "history") {
    const history = await loadHistory(kv, email);
    return json({ source: "piecebook", history: history.rows, writes: history.writes }, 200, cors);
  }
  if (req.method === "GET") return json({ error: "not_found" }, 404, cors);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "too_large" }, 413, cors);
  const type = req.headers.get("Content-Type") || "";
  let body;
  if (parts[1] === "import" && type.includes("text/csv")) body = text;
  else if (!text) body = {};
  else {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "bad_request" }, 400, cors);
    }
  }

  if (req.method === "POST" && parts.length === 1) {
    const doc = await readDoc(kv, email);
    const result = createHolding(doc, body);
    if (!result.ok) return fail(result, cors);
    await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
    await recordWrite(kv, email, identity, now, "create", result.copy.rowId);
    log({ evt: "holdings_write", op: "create", rowId: result.copy.rowId, caller: callerOf(identity), at: new Date(now).toISOString() });
    return json({ source: "piecebook", revision: result.doc.revision, copy: result.copy }, 201, cors);
  }

  if (req.method === "POST" && parts.length === 2 && parts[1] === "import") {
    const doc = await readDoc(kv, email);
    const replace = url.searchParams.get("replace") === "1" || (body && body.replace === true);
    let csv = "";
    let revision;
    if (typeof body === "string") {
      csv = body;
      const q = url.searchParams.get("revision");
      revision = q == null || q === "" ? undefined : Number(q);
    } else {
      csv = typeof body.csv === "string" ? body.csv : "";
      revision = body.revision;
    }
    if (!csv.trim()) return json({ error: "bad_request", detail: "csv" }, 400, cors);
    const result = importHoldings(csv, doc, replace, revision);
    if (!result.ok) return fail(result, cors);
    await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
    await recordWrite(kv, email, identity, now, "import");
    log({ evt: "holdings_write", op: "import", imported: result.imported, caller: callerOf(identity), at: new Date(now).toISOString() });
    return json({ source: "piecebook", revision: result.doc.revision, imported: result.imported, skipped: result.skipped }, 200, cors);
  }

  if (req.method === "POST" && parts.length === 2 && parts[1] === "snapshot") {
    const history = await loadHistory(kv, email);
    const result = acceptSnapshot(history.rows, body, today);
    if (!result.ok) return fail(result, cors);
    await saveHistory(kv, email, result.history, history.writes.concat(writeNote(identity, now, "snapshot")));
    log({ evt: "holdings_write", op: "snapshot", caller: callerOf(identity), at: new Date(now).toISOString() });
    return json({ source: "piecebook", history: result.history }, 200, cors);
  }

  if (parts.length >= 2 && parts[1] !== "import" && parts[1] !== "snapshot" && parts[1] !== "history") {
    let rowId = parts[1];
    try {
      rowId = decodeURIComponent(parts[1]);
    } catch {
      return json({ error: "bad_row_id" }, 400, cors);
    }
    if (req.method === "PATCH" && parts.length === 2) {
      const doc = await readDoc(kv, email);
      const result = patchHolding(doc, rowId, body);
      if (!result.ok) return fail(result, cors);
      await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
      await recordWrite(kv, email, identity, now, "patch", rowId);
      log({ evt: "holdings_write", op: "patch", rowId, caller: callerOf(identity), at: new Date(now).toISOString() });
      return json({ source: "piecebook", revision: result.doc.revision, copy: result.copy }, 200, cors);
    }
    if (req.method === "POST" && parts.length === 3 && parts[2] === "sold") {
      const doc = await readDoc(kv, email);
      const result = markSold(doc, rowId, body);
      if (!result.ok) return fail(result, cors);
      await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
      await recordWrite(kv, email, identity, now, "sold", rowId);
      log({ evt: "holdings_write", op: "sold", rowId, caller: callerOf(identity), at: new Date(now).toISOString() });
      return json({ source: "piecebook", revision: result.doc.revision, copy: result.copy }, 200, cors);
    }
  }

  return json({ error: "method_not_allowed" }, 405, cors);
}
