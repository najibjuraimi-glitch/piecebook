/**
 * Watchlist API. Rows live in USER_DATA, behind Access, in the same book a
 * service token and the owner's phone share.
 *
 *   GET    /watchlist
 *   POST   /watchlist
 *   PATCH  /watchlist/:id
 *   POST   /watchlist/:id/price
 *   DELETE /watchlist/:id
 *
 * Each write appends the caller (service client id or Access email) and the
 * time. The client secret is not stored. A fresh English stored quote wins.
 * Otherwise a manual market figure Cards typed is the price. A missing one
 * is "No price yet". Japanese prices are not used. PriceCharting is not fetched.
 */
import { singaporeToday } from "../../src/lib/boughtBook.ts";
import { parallelLabel, resolveHoldingPrint } from "../../src/lib/printResolve.ts";
import { createWatchItem, deleteWatchItem, emptyWatch, patchWatchItem, setWatchPrice, valueWatchItems } from "../../src/lib/watchlist.ts";
import { writerAllowed } from "./access.js";
import { forgetWatchAlert } from "./alerts.js";
import { bookEmail, callerOf, keyFor, writeNote } from "./holdings.js";
import { seedPrints, storedQuote } from "./storedPrice.js";

const STORE = "watchlist.v1";
const HISTORY = "watchlist-history.v1";
const MAX_BODY = 2_000_000;
const MAX_WRITES = 2000;

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
  if (result.candidates) body.candidates = result.candidates;
  return json(body, result.status, cors);
}

function quoteFor(code, grade) {
  return storedQuote(code, grade);
}

async function readDoc(kv, email) {
  const doc = await kv.get(keyFor(email, STORE), "json");
  if (!doc || typeof doc.revision !== "number" || !Array.isArray(doc.items)) return emptyWatch();
  doc.items = doc.items.map((item) => ({ ...item, language: item?.language === "JP" ? "JP" : "EN" }));
  return doc;
}

async function loadWrites(kv, email) {
  const doc = await kv.get(keyFor(email, HISTORY), "json");
  return doc && Array.isArray(doc.writes) ? doc.writes : [];
}

async function recordWrite(kv, email, identity, now, op, rowId) {
  const writes = (await loadWrites(kv, email)).concat(writeNote(identity, now, op, rowId));
  const kept = writes.length > MAX_WRITES ? writes.slice(writes.length - MAX_WRITES) : writes;
  await kv.put(keyFor(email, HISTORY), JSON.stringify({ writes: kept }));
  return kept;
}

export async function handleWatchlist(req, env, identity, cors, deps = {}) {
  const kv = env.USER_DATA;
  if (!kv) return json({ error: "watchlist_not_configured", detail: "no USER_DATA binding" }, 503, cors);
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "watchlist") return json({ error: "not_found" }, 404, cors);
  const now = deps.now ? deps.now() : Date.now();
  const today = singaporeToday(now);
  const log = deps.log || (() => {});
  const email = bookEmail(identity, env);
  if (!email) return json({ error: "no_identity" }, 403, cors);
  if (req.method !== "GET" && !writerAllowed(identity, env)) return json({ error: "writer_not_allowed" }, 403, cors);

  const declared = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_BODY) return json({ error: "too_large" }, 413, cors);

  if (req.method === "GET" && parts.length === 1) {
    const doc = await readDoc(kv, email);
    const prints = seedPrints();
    if (url.searchParams.get("format") === "targets") {
      const valuedById = new Map(valueWatchItems(doc.items, quoteFor, today).map((item) => [item.id, item]));
      const targets = doc.items.map((item) => {
        const print = resolveHoldingPrint(item.code, prints);
        const valued = valuedById.get(item.id);
        return {
          print: print ? print.cardNumber : item.code,
          parallel: print ? parallelLabel(print) : null,
          language: item.language === "JP" ? "JP" : "EN",
          grade: item.grade,
          targetSgd: item.targetSgd ?? null,
          id: item.id,
          externalId: item.externalId ?? null,
          marketSgd: item.marketSgd ?? null,
          marketAsOf: item.marketAsOf ?? null,
          marketSource: item.marketSource ?? null,
          marketUrl: item.marketUrl ?? null,
          priceSgd: valued.priceSgd,
          source: valued.source,
          asOf: valued.asOf,
          url: valued.url,
          stale: valued.stale,
          hit: valued.hit,
        };
      });
      return json({ source: "piecebook", revision: doc.revision, targets }, 200, cors);
    }
    const writes = await loadWrites(kv, email);
    return json({ source: "piecebook", revision: doc.revision, items: valueWatchItems(doc.items, quoteFor, today), writes }, 200, cors);
  }
  if (req.method === "GET") return json({ error: "not_found" }, 404, cors);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "too_large" }, 413, cors);
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "bad_request" }, 400, cors);
    }
  }

  if (req.method === "POST" && parts.length === 1) {
    const doc = await readDoc(kv, email);
    const result = createWatchItem(doc, body, today, seedPrints());
    if (!result.ok) return fail(result, cors);
    await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
    await recordWrite(kv, email, identity, now, "create", result.item.id);
    log({ evt: "watchlist_write", op: "create", rowId: result.item.id, caller: callerOf(identity), at: new Date(now).toISOString() });
    const [item] = valueWatchItems([result.item], quoteFor, today);
    return json({ source: "piecebook", revision: result.doc.revision, item }, 201, cors);
  }

  if (req.method === "POST" && parts.length === 3 && parts[2] === "price") {
    let id = parts[1];
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return json({ error: "bad_id" }, 400, cors);
    }
    const doc = await readDoc(kv, email);
    const result = setWatchPrice(doc, id, body, today);
    if (!result.ok) return fail(result, cors);
    await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
    await recordWrite(kv, email, identity, now, "price", id);
    log({ evt: "watchlist_write", op: "price", rowId: id, caller: callerOf(identity), at: new Date(now).toISOString() });
    const [item] = valueWatchItems([result.item], quoteFor, today);
    return json({ source: "piecebook", revision: result.doc.revision, item }, 200, cors);
  }

  if (parts.length === 2) {
    let id = parts[1];
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return json({ error: "bad_id" }, 400, cors);
    }
    if (req.method === "PATCH") {
      const doc = await readDoc(kv, email);
      const result = patchWatchItem(doc, id, body, today, seedPrints());
      if (!result.ok) return fail(result, cors);
      await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
      await recordWrite(kv, email, identity, now, "patch", id);
      log({ evt: "watchlist_write", op: "patch", rowId: id, caller: callerOf(identity), at: new Date(now).toISOString() });
      const [item] = valueWatchItems([result.item], quoteFor, today);
      return json({ source: "piecebook", revision: result.doc.revision, item }, 200, cors);
    }
    if (req.method === "DELETE") {
      const doc = await readDoc(kv, email);
      const result = deleteWatchItem(doc, id, body);
      if (!result.ok) return fail(result, cors);
      await kv.put(keyFor(email, STORE), JSON.stringify(result.doc));
      await recordWrite(kv, email, identity, now, "delete", id);
      await forgetWatchAlert(kv, email, id);
      log({ evt: "watchlist_write", op: "delete", rowId: id, caller: callerOf(identity), at: new Date(now).toISOString() });
      return json({ source: "piecebook", revision: result.doc.revision }, 200, cors);
    }
  }

  return json({ error: "method_not_allowed" }, 405, cors);
}
