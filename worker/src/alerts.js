/**
 * Alerts the phone and Cards can both read. Dismissals live in USER_DATA for
 * the signed-in person, so they hold on every device.
 *
 *   GET  /alerts
 *   POST /alerts/dismiss
 *
 * underAllIn is a held or listed copy whose English or manual price is under
 * its all-in. watchlist is a target whose English price is at or under the
 * target. The same price does not fire again. A Japanese price is never used.
 */
import { valueCopies } from "../../src/lib/boughtBook.ts";
import { currentAlerts, dismissAlertIds, normaliseAlerts } from "../../src/lib/alertsBook.ts";
import { boughtCopyFromHolding, emptyHoldings } from "../../src/lib/holdings.ts";
import { emptyWatch, valueWatchItems } from "../../src/lib/watchlist.ts";
import { bookEmail, callerOf, keyFor, writeNote } from "./holdings.js";
import { storedQuote } from "./storedPrice.js";

const ALERTS = "alerts.v1";
const HOLDINGS = "holdings.v1";
const WATCH = "watchlist.v1";
const MAX_BODY = 200_000;

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

async function readHoldings(kv, email) {
  const doc = await kv.get(keyFor(email, HOLDINGS), "json");
  if (!doc || typeof doc.revision !== "number" || !Array.isArray(doc.copies)) return emptyHoldings();
  return doc;
}

async function readWatch(kv, email) {
  const doc = await kv.get(keyFor(email, WATCH), "json");
  if (!doc || typeof doc.revision !== "number" || !Array.isArray(doc.items)) return emptyWatch();
  return doc;
}

async function readAlerts(kv, email) {
  return normaliseAlerts(await kv.get(keyFor(email, ALERTS), "json"));
}

function hitsFor(holdings, watch, alerts, today) {
  const copies = valueCopies(holdings.copies.map(boughtCopyFromHolding), storedQuote, today);
  const items = valueWatchItems(watch.items, storedQuote, today);
  return currentAlerts(copies, items, alerts);
}

export async function handleAlerts(req, env, identity, cors, deps = {}) {
  const kv = env.USER_DATA;
  if (!kv) return json({ error: "alerts_not_configured", detail: "no USER_DATA binding" }, 503, cors);
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "alerts") return json({ error: "not_found" }, 404, cors);
  const now = deps.now ? deps.now() : Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const log = deps.log || (() => {});
  const email = bookEmail(identity, env);
  if (!email) return json({ error: "no_identity" }, 403, cors);

  const declared = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_BODY) return json({ error: "too_large" }, 413, cors);

  if (req.method === "GET" && parts.length === 1) {
    const alerts = await readAlerts(kv, email);
    const current = hitsFor(await readHoldings(kv, email), await readWatch(kv, email), alerts, today);
    return json({ source: "piecebook", revision: alerts.revision, ...current, writes: alerts.writes }, 200, cors);
  }

  if (req.method === "POST" && parts.length === 2 && parts[1] === "dismiss") {
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
    const alerts = await readAlerts(kv, email);
    const current = hitsFor(await readHoldings(kv, email), await readWatch(kv, email), alerts, today);
    const result = dismissAlertIds(alerts, body, current.underAllIn, current.watchlist, writeNote(identity, now, "dismiss"));
    if (!result.ok) return fail(result, cors);
    if (result.changed) {
      await kv.put(keyFor(email, ALERTS), JSON.stringify(result.doc));
      log({ evt: "alerts_write", op: "dismiss", caller: callerOf(identity), at: new Date(now).toISOString() });
    }
    const next = hitsFor(await readHoldings(kv, email), await readWatch(kv, email), result.doc, today);
    return json({ source: "piecebook", revision: result.doc.revision, ...next, writes: result.doc.writes }, 200, cors);
  }

  return json({ error: "method_not_allowed" }, 405, cors);
}
