/**
 * GET /bought — the Bought tab, read-only, for a signed-in phone.
 * No key and no failure returns the fixture reason; the phone keeps the sample book.
 * Purchase rows are not written anywhere. PriceCharting columns are stripped
 * before the matrix leaves this Worker.
 */
import { BOUGHT_TAB_GID, omitIgnoredValueColumns } from "../../src/lib/boughtBook.ts";
import { readBoughtTab } from "../../src/lib/googleSheetsRead.ts";

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export async function handleBought(req, env, cors, deps = {}) {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
  const raw = typeof env.GOOGLE_SERVICE_ACCOUNT_JSON === "string" ? env.GOOGLE_SERVICE_ACCOUNT_JSON.trim() : "";
  const spreadsheetId = typeof env.BOUGHT_SHEET_ID === "string" ? env.BOUGHT_SHEET_ID.trim() : "";
  if (!raw || !spreadsheetId) return json({ source: "fixture", reason: "not_configured" }, 200, cors);
  let key;
  try {
    key = JSON.parse(raw);
  } catch {
    return json({ source: "fixture", reason: "bad_key" }, 200, cors);
  }
  if (!key || typeof key.client_email !== "string" || typeof key.private_key !== "string") {
    return json({ source: "fixture", reason: "bad_key" }, 200, cors);
  }
  const gidRaw = typeof env.BOUGHT_SHEET_GID === "string" ? env.BOUGHT_SHEET_GID.trim() : "";
  const sheetGid = gidRaw ? Number(gidRaw) : BOUGHT_TAB_GID;
  if (!Number.isInteger(sheetGid)) return json({ source: "fixture", reason: "bad_gid" }, 200, cors);
  const log = deps.log || (() => {});
  try {
    const read = await readBoughtTab({
      key,
      spreadsheetId,
      sheetGid,
      fetcher: deps.fetcher || fetch,
    });
    const matrix = omitIgnoredValueColumns(read.matrix);
    log({ evt: "bought_read", ok: true, rows: Math.max(0, matrix.length - 1) });
    return json({ source: "sheet", readAt: new Date().toISOString(), sheetId: sheetGid, matrix }, 200, cors);
  } catch (err) {
    const detail = String(err && err.message ? err.message : "sheets_read_failed").slice(0, 200);
    log({ evt: "bought_read", ok: false });
    return json({ source: "fixture", reason: "read_failed", detail }, 200, cors);
  }
}
