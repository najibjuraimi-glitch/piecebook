// Piecebook Worker: photo check (/check, Gemini), cloud sync (/sync, KV) and
// street price (/price and /street, TCGCSV + ECB, cached in KV).
// Secret: GEMINI_API_KEY (wrangler secret put). No keys in source.
// Behind Cloudflare Access once ACCESS_TEAM_DOMAIN + ACCESS_AUD are set: every
// route but /health then needs a valid Access JWT (see access.js).
import { accessConfigured, verifyAccess } from "./access.js";
import { handleSync } from "./sync.js";
import { handlePrice } from "./price.js";
// Same words and limits as the app. wrangler bundles the TypeScript; no pixels are read here.
import { parsePhotoCentering, summariseCentering } from "../../src/lib/centeringSummary.ts";
import { CONFIDENCES, SEVERITIES, buildScores } from "../../src/lib/gradeScore.ts";

// The prompts ask for labels, never for printed text. Transcribing a card's
// effect text reproduces copyrighted wording that is indexed all over the web,
// and Gemini then stops with finishReason RECITATION and no parts at all.

const IDENTIFY_RULES = `set_code: the card number printed in the bottom-left corner, e.g. "OP01-016", "ST14-003", "EB02-010". Report it only if you can actually read it; otherwise null. Never guess or invent one.
language: the label for the script the card is printed in — "EN", "JP", "CN", "KR" or "FR" — judged from the look of the text, not from the set code. If the text is not legible, null. Do not write out any card text.`;

const PROMPT = `You are inspecting photos of a One Piece TCG card for Piecebook, a collector app.
Image 1 is the FRONT. Image 2, if present, is the BACK.
Answer with short labels only. Never transcribe, quote or paraphrase any text printed on the card.
1. IDENTIFY
${IDENTIFY_RULES}
name: the character or card title as a short label (1–4 words, e.g. "Monkey.D.Luffy"), or null if you cannot read it.
rarity: the rarity mark printed next to the card number — "L", "SEC", "SR", "R", "UC", "C", "SP", "P" — or null.
parallel_guess — pick one:
- "SP" for a Special Card / SP foil (holographic SP treatment, a printed SP rarity, or SPECIAL used as a foil/rarity stamp). Prefer SP over base when the card is clearly an SP foil even if the printed number looks like a base code.
- "parallel/alt art" for an alternate illustration (not the set's standard art).
- "manga" for the manga-panel treatment.
- "base" only for the standard set print with no parallel treatment.
- null if you cannot tell.
The attack attribute "Special" (Strike / Slash / Special next to power) is not enough by itself. Foil plus SPECIAL / SP as a rarity mark is. Do not default to "base" when the foil or stamp says SP, SPECIAL, Alternate, or Manga.
2. CONDITION: inspect corners, edges and surface. For each, list the defect flags you can actually see from the allowed list, add at most twelve words of your own describing where and how bad, and give:
- severity, one of "none" (no defect visible), "light" (visible only up close), "moderate" (plain at arm's length), "heavy" (damage), "unclear" (the photo does not let you judge this part). Be strict: a defect you can see is at least "light".
- confidence, one of "high", "medium", "low", for how well these photos show that part.
Describe the card's physical state only; never mention what is written on it.
Photos can rule out a PSA 10 but never confirm one. Set psa10_ruled_out true only if you see a clear defect; otherwise false (which means "not ruled out", never "is a 10"). reasons: up to three short phrases of your own (max eight words each) naming the defects that drove psa10_ruled_out. Be conservative and flag "unclear_photo" when photo quality limits what you can see.
Return ONLY JSON matching the schema.`;

// Fallback when the full prompt is still refused: identity only, nothing descriptive.
const MINIMAL_PROMPT = `Look at this photo of a One Piece TCG card. Answer with two labels only. Do not write out any text printed on the card.
${IDENTIFY_RULES}
Return ONLY JSON matching the schema.`;

export const LANGUAGES = ["EN", "JP", "CN", "KR", "FR"];
export const RARITIES = ["L", "SEC", "SR", "R", "UC", "C", "SP", "P"];
export const PARALLELS = ["base", "parallel/alt art", "manga", "SP"];
export const DEFECT_FLAGS = ["whitening", "ding", "chip", "crease", "scratch", "print_line", "dent", "stain", "bend", "peel", "dirt", "glare", "blur", "unclear_photo"];
export { SEVERITIES, CONFIDENCES };

const SECTION = {
  type: "OBJECT",
  properties: {
    flags: { type: "ARRAY", items: { type: "STRING", enum: DEFECT_FLAGS } },
    notes: { type: "STRING" },
    severity: { type: "STRING", enum: SEVERITIES },
    confidence: { type: "STRING", enum: CONFIDENCES },
  },
  required: ["flags", "notes", "severity", "confidence"],
};
const IDENTIFY_MINIMAL = {
  type: "OBJECT",
  properties: { set_code: { type: "STRING", nullable: true }, language: { type: "STRING", enum: LANGUAGES, nullable: true } },
  required: ["set_code", "language"],
};
const IDENTIFY_FULL = {
  type: "OBJECT",
  properties: {
    ...IDENTIFY_MINIMAL.properties,
    name: { type: "STRING", nullable: true },
    rarity: { type: "STRING", enum: RARITIES, nullable: true },
    parallel_guess: { type: "STRING", enum: PARALLELS, nullable: true },
    confidence: { type: "NUMBER" },
  },
  required: ["set_code", "language", "name", "rarity", "parallel_guess", "confidence"],
};
const SCHEMA = {
  type: "OBJECT",
  properties: {
    identify: IDENTIFY_FULL,
    condition: { type: "OBJECT", properties: {
      corners: SECTION, edges: SECTION, surface: SECTION,
      psa10_ruled_out: { type: "BOOLEAN" }, reasons: { type: "ARRAY", items: { type: "STRING" } } },
      required: ["corners", "edges", "surface", "psa10_ruled_out", "reasons"] },
  },
  required: ["identify", "condition"],
};
const MINIMAL_SCHEMA = { type: "OBJECT", properties: { identify: IDENTIFY_MINIMAL }, required: ["identify"] };

export const PROMPTS = {
  full: { name: "full", text: PROMPT, schema: SCHEMA, requireCondition: true },
  minimal: { name: "minimal", text: MINIMAL_PROMPT, schema: MINIMAL_SCHEMA, requireCondition: false },
};

const EMPTY_SECTION = () => ({ flags: [], notes: "", severity: null, confidence: null });
/** Condition block for an identify-only answer: nothing seen, nothing ruled out. */
export const emptyCondition = () => ({ corners: EMPTY_SECTION(), edges: EMPTY_SECTION(), surface: EMPTY_SECTION(), psa10_ruled_out: false, reasons: [] });

const DEFAULT_ORIGINS = "https://najibjuraimi-glitch.github.io,https://piecebook.pages.dev,https://*.piecebook.pages.dev";

/** Browser origins allowed to call this Worker directly. `https://*.host` matches one subdomain level. */
export function originAllowed(origin, env) {
  if (!origin) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  const list = String(env?.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of list) {
    if (entry === origin) return true;
    const m = /^https:\/\/\*\.(.+)$/.exec(entry);
    if (m && new RegExp(`^https://[a-z0-9-]+\\.${m[1].replace(/\./g, "\\.")}$`, "i").test(origin)) return true;
  }
  return false;
}

export function corsHeaders(origin, env) {
  return originAllowed(origin, env)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, CF-Access-Client-Id, CF-Access-Client-Secret",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      }
    : { "Vary": "Origin" };
}
const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 24 * 1024 * 1024;

function b64FromBuffer(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function normLang(v) {
  if (!v || typeof v !== "string") return null;
  const u = v.trim().toUpperCase();
  if (["EN", "JP", "CN", "KR", "FR"].includes(u)) return u;
  if (/^EN/.test(u) || u === "ENGLISH") return "EN";
  if (/^(JP|JA|JPN|JAPANESE)/.test(u)) return "JP";
  if (/^(CN|ZH|CHINESE)/.test(u)) return "CN";
  if (/^(KR|KO|KOR|KOREAN)/.test(u)) return "KR";
  if (/^(FR|FRA|FRENCH)/.test(u)) return "FR";
  return null;
}
function parseDataUrl(v) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(v || "");
  return m ? { mime: m[1], data: m[2] } : v ? { mime: "image/jpeg", data: v } : null;
}

// --- Model output parsing -----------------------------------------------
// generateContent answers are not always "one text part holding JSON": thinking
// models add `thought: true` parts and signature-only parts, a budget overrun
// leaves empty text with finishReason MAX_TOKENS, a blocked answer has no parts
// at all, and JSON can arrive fenced or with chatter around it. Everything below
// is pure and exported so the shapes can be pinned in tests.

const BLOCKED_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT", "SPII", "OTHER"]);
const MAX_OUTPUT_TOKENS = 12288;
// REST generateContent refuses anything above 32768 without a continuation token.
const MAX_OUTPUT_TOKENS_RETRY = 32768;

/** Text the model meant as its answer: every non-thought text part, in order. */
export function answerText(parts) {
  if (!Array.isArray(parts)) return "";
  return parts.filter((p) => p && !p.thought && typeof p.text === "string").map((p) => p.text).join("");
}

/** ```json … ``` → …; tolerates a language tag, missing closing fence, and surrounding whitespace. */
export function stripFences(text) {
  let s = String(text ?? "").trim();
  const open = /^```[A-Za-z0-9_-]*[ \t]*\r?\n?/.exec(s);
  if (open) s = s.slice(open[0].length);
  s = s.replace(/\r?\n?```\s*$/, "");
  return s.trim();
}

/**
 * First complete JSON object in `text` (brace-balanced, string-aware), parsed.
 * Returns { value } or { error: "no_json" | "truncated_json" | "invalid_json" }.
 */
export function firstJsonObject(text) {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  if (start < 0) return { error: "no_json" };
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return { value: JSON.parse(s.slice(start, i + 1)) }; } catch { return { error: "invalid_json" }; }
      }
    }
  }
  return { error: "truncated_json" };
}

function partKinds(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((p) => {
    if (!p || typeof p !== "object") return "other";
    if (p.thought) return "thought";
    if (typeof p.text === "string") return p.text ? "text" : "empty";
    const keys = Object.keys(p).filter((k) => k !== "thoughtSignature");
    return keys[0] || "signature";
  });
}

/**
 * Turn a generateContent body into { ok, result } or { ok, reason, ... }.
 * `reason` is one of blocked | max_tokens | empty_text | no_json | truncated_json
 * | invalid_json | schema_mismatch. Never includes image data or the raw text.
 */
export function extractModelResult(body, { requireCondition = true } = {}) {
  const cand = body?.candidates?.[0];
  const blockReason = body?.promptFeedback?.blockReason;
  const finishReason = cand?.finishReason || (blockReason ? `PROMPT_${blockReason}` : "NONE");
  const parts = cand?.content?.parts;
  const usage = body?.usageMetadata || {};
  const meta = {
    finishReason,
    parts: partKinds(parts),
    tokens: { prompt: usage.promptTokenCount ?? null, thoughts: usage.thoughtsTokenCount ?? null, answer: usage.candidatesTokenCount ?? null },
  };
  const text = stripFences(answerText(parts));
  meta.textLength = text.length;
  if (!text) {
    if (blockReason || BLOCKED_REASONS.has(finishReason)) return { ok: false, reason: "blocked", ...meta };
    if (finishReason === "MAX_TOKENS") return { ok: false, reason: "max_tokens", ...meta };
    return { ok: false, reason: "empty_text", ...meta };
  }
  const parsed = firstJsonObject(text);
  if (!parsed.value) {
    const reason = parsed.error === "truncated_json" && finishReason === "MAX_TOKENS" ? "max_tokens" : parsed.error;
    return { ok: false, reason, ...meta };
  }
  const result = parsed.value;
  if (!result || typeof result !== "object" || !result.identify || (requireCondition && !result.condition)) return { ok: false, reason: "schema_mismatch", ...meta };
  return { ok: true, result, ...meta };
}

const FAILURE_HINT = {
  blocked: "The model declined to read this card. Type the card number; your photos still go to the worksheet.",
  max_tokens: "The model ran out of room before answering. Try again.",
  empty_text: "The model answered without any text. Try again.",
  no_json: "The model answered in prose instead of JSON. Try again.",
  truncated_json: "The model's answer was cut off. Try again.",
  invalid_json: "The model's answer was not valid JSON. Try again.",
  schema_mismatch: "The model's answer was missing the card read. Try again.",
};

/**
 * Name a non-2xx Gemini answer. `body` is the raw response text; Gemini's errors
 * look like {"error":{"code":400,"message":"…","status":"FAILED_PRECONDITION"}}.
 * Returns { reason, detail (for the phone), upstream (status + message, for logs) }.
 */
export function classifyModelError(status, body) {
  let message = "", apiStatus = "";
  try {
    const parsed = JSON.parse(body || "");
    message = String(parsed?.error?.message || "");
    apiStatus = String(parsed?.error?.status || "");
  } catch {
    message = String(body || "").replace(/\s+/g, " ").trim();
  }
  const upstream = [apiStatus, message].filter(Boolean).join(": ").slice(0, 200);
  if (/user location is not supported/i.test(message) || (status === 400 && apiStatus === "FAILED_PRECONDITION")) {
    return { reason: "region_unsupported", detail: "AI check unavailable from this region right now, try again.", upstream };
  }
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") return { reason: "model_rate_limited", detail: "The AI is busy right now. Try again in a minute.", upstream };
  if (status === 401 || status === 403 || apiStatus === "PERMISSION_DENIED" || apiStatus === "UNAUTHENTICATED") return { reason: "model_auth", detail: "The AI key was refused. Try again later.", upstream };
  if (status >= 500) return { reason: "model_down", detail: "The AI did not answer. Try again.", upstream };
  return { reason: "model_http", detail: "The AI refused the request. Try again.", upstream };
}

async function readImages(req) {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData(); const out = {};
    for (const k of ["front", "back"]) { const f = fd.get(k); if (f && typeof f !== "string") out[k] = { mime: f.type || "image/jpeg", data: b64FromBuffer(await f.arrayBuffer()) }; }
    const c = fd.get("centering");
    if (typeof c === "string" && c.trim()) { try { out.centering = JSON.parse(c); } catch { out.centering = undefined; } }
    return out;
  }
  const body = await req.json();
  return { front: parseDataUrl(body.front), back: parseDataUrl(body.back), centering: body.centering };
}

/**
 * The centering block of a /check answer. The Worker has no pixel decoder, so
 * the measurement comes with the request (the app measures on the phone with
 * src/lib/centering.ts). Border pixels are validated and the ratios and the
 * rule-out are recomputed here; a caller cannot assert `cannotBeTen` directly.
 * Without a usable measurement the block says so instead of guessing.
 */
export function centeringBlock(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const front = parsePhotoCentering(r.front, "front");
  const back = parsePhotoCentering(r.back, "back");
  if (!front && !back) return summariseCentering(null, null, "none");
  return summariseCentering(front, back, "device");
}

export default {
  async fetch(req, env, _ctx, deps = {}) {
    const cors = corsHeaders(req.headers.get("Origin"), env);
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    // colo: the data center this Worker ran in. With [placement] in wrangler.toml it should be a US code (IAD, EWR, …).
    if (url.pathname === "/health") return json({ ok: true, model: env.GEMINI_MODEL, access: accessConfigured(env) ? "on" : "off", sync: env.USER_DATA ? "on" : "off", colo: req.cf?.colo || null }, 200, cors);
    const origin = req.headers.get("Origin");
    if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);

    const isSync = url.pathname === "/sync" || url.pathname.startsWith("/sync/");
    const isCheck = url.pathname === "/check" && req.method === "POST";
    // Street price: one endpoint, two spellings (Auction's /price, Cards' /street).
    const isPrice = url.pathname === "/price" || url.pathname === "/street";
    if (url.pathname === "/whoami" && req.method === "GET") {
      const who = await verifyAccess(req, env, deps);
      if (!who.ok) return json({ error: who.error, detail: who.detail }, who.status, cors);
      return json({ identity: who.identity.email, kind: who.identity.kind, readOnly: Boolean(who.identity.readOnly) }, 200, cors);
    }
    if (!isSync && !isCheck && !isPrice) return json({ error: "not_found" }, 404, cors);

    // Fail closed once Access is configured. Until then /check stays open for the
    // old public site and /sync says so rather than pretending to be signed in.
    let identity = null;
    const who = await verifyAccess(req, env, deps);
    if (who.ok) identity = who.identity;
    else if (isSync || isPrice) return json({ error: who.status === 503 && who.error === "access_not_configured" ? (isPrice ? "price_not_configured" : "sync_not_configured") : who.error, detail: who.detail }, who.status, cors);
    else if (who.status !== 503 || who.error !== "access_not_configured") return json({ error: who.error, detail: who.detail }, who.status, cors);

    if (isSync) return handleSync(req, env, identity, cors, deps);
    if (isPrice) return handlePrice(req, env, cors, deps);
    // Two 8 MB images as base64 JSON are ~22 MB. Refuse bigger bodies before parsing them into memory.
    const declared = parseInt(req.headers.get("Content-Length") || "0", 10);
    if (declared > MAX_BODY_BYTES) return json({ error: "too_large", hint: "downscale to ~1600px long edge" }, 413, cors);

    let imgs;
    try { imgs = await readImages(req); } catch { return json({ error: "bad_request" }, 400, cors); }
    if (!imgs.front) return json({ error: "front_required" }, 400, cors);
    const size = (imgs.front.data.length + (imgs.back?.data.length || 0)) * 0.75;
    if (size > MAX_IMAGE_BYTES) return json({ error: "too_large", hint: "downscale to ~1600px long edge" }, 413, cors);
    const centering = centeringBlock(imgs.centering);

    // Daily cap (UTC day). KV is eventually consistent; good enough as a spend guard.
    // The slot is reserved before the call and handed back on any failure, so
    // only answers that reach the phone count against the day.
    const day = new Date().toISOString().slice(0, 10);
    const key = `count:${day}`;
    const cap = parseInt(env.DAILY_CAP || "60", 10);
    const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10);
    if (used >= cap) return json({ error: "daily_cap_reached", cap, used }, 429, cors);
    await env.VISION_CAP.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
    const fail = async (body, status) => {
      await refundCap(env, key);
      return json(body, status, cors);
    };

    const images = [{ inline_data: { mime_type: imgs.front.mime, data: imgs.front.data } }];
    if (imgs.back) images.push({ inline_data: { mime_type: imgs.back.mime, data: imgs.back.data } });
    const modelFetch = deps.modelFetch || fetch;
    const log = deps.log || ((line) => console.log(JSON.stringify(line)));
    const callModel = (prompt, maxOutputTokens) =>
      modelFetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt.text }, ...images] }], generationConfig: {
          responseMimeType: "application/json", responseSchema: prompt.schema, temperature: 0.1, maxOutputTokens,
          thinkingConfig: { thinkingLevel: "low" } } }),
      });

    // Attempt plan: full prompt; once more with a bigger budget if thinking ate
    // it; once more with the minimal prompt if the copyright filter refused.
    const queue = [{ prompt: PROMPTS.full, budget: MAX_OUTPUT_TOKENS }];
    let retriedBudget = false, retriedMinimal = false;
    let extracted = null, status = 0, prompt = PROMPTS.full, budget = MAX_OUTPUT_TOKENS, attempt = 0;
    const colo = req.cf?.colo || null;
    while (queue.length) {
      ({ prompt, budget } = queue.shift());
      attempt++;
      let r;
      try { r = await callModel(prompt, budget); } catch (e) {
        log({ evt: "check_model_error", attempt, prompt: prompt.name, status: 0 });
        return fail({ error: "model_error", status: 0, detail: String(e && e.message ? e.message : e).slice(0, 300) }, 502);
      }
      status = r.status;
      if (!r.ok) {
        let body = "";
        try { body = await r.text(); } catch { body = ""; }
        const why = classifyModelError(r.status, body);
        // colo = where this Worker ran; with [placement] it should be a US airport code.
        log({ evt: "check_model_error", attempt, prompt: prompt.name, status: r.status, reason: why.reason, upstream: why.upstream, colo });
        return fail({ error: "model_error", status: r.status, reason: why.reason, detail: why.detail, upstream: why.upstream, colo }, 502);
      }
      let out;
      try { out = await r.json(); } catch {
        log({ evt: "check_model_error", attempt, prompt: prompt.name, status: r.status, reason: "unreadable_body" });
        return fail({ error: "model_error", status: r.status, detail: "unreadable_model_response" }, 502);
      }
      extracted = extractModelResult(out, { requireCondition: prompt.requireCondition });
      // No secrets, no image bytes, no model text: just the shape of what came back.
      log({ evt: "check_model_output", attempt, prompt: prompt.name, ok: extracted.ok, reason: extracted.reason, finishReason: extracted.finishReason, parts: extracted.parts, tokens: extracted.tokens, textLength: extracted.textLength, maxOutputTokens: budget });
      if (extracted.ok) break;
      if (extracted.reason === "max_tokens" && !retriedBudget) {
        retriedBudget = true;
        queue.push({ prompt, budget: MAX_OUTPUT_TOKENS_RETRY });
      } else if (extracted.reason === "blocked" && extracted.finishReason === "RECITATION" && !retriedMinimal) {
        retriedMinimal = true;
        queue.push({ prompt: PROMPTS.minimal, budget });
      }
    }
    if (!extracted.ok) {
      return fail({ error: "unparseable_model_output", status, reason: extracted.reason, finishReason: extracted.finishReason, prompt: prompt.name, detail: FAILURE_HINT[extracted.reason] || FAILURE_HINT.invalid_json }, 502);
    }
    const result = normaliseResult(extracted.result, prompt);
    // Scores: an AI estimate, never a grade. Same function as the app (src/lib/gradeScore.ts).
    // backSent is about the photo the model saw, not whether the back's centering was measured.
    const scores = buildScores({ front: centering.front, back: centering.back, backSent: Boolean(imgs.back), condition: result.coverage === "full" ? result.condition : null });
    return json({ ...result, centering, scores, ai_guess: true, model: env.GEMINI_MODEL, usage: { today: used + 1, cap }, disclaimer: "AI guess. Photos can rule out a PSA 10 but never confirm one." }, 200, cors);
  },
};

/** Clamp model labels to what the app understands; fill the condition block for an identify-only answer. */
export function normaliseResult(raw, prompt) {
  const id = raw.identify || {};
  const code = typeof id.set_code === "string" ? id.set_code.trim().toUpperCase() : "";
  const identify = {
    set_code: /^[A-Z]{2,3}\d{2}-\d{3}$/.test(code) ? code : null,
    name: typeof id.name === "string" && id.name.trim() ? id.name.trim().slice(0, 60) : null,
    rarity: RARITIES.includes(id.rarity) ? id.rarity : null,
    parallel_guess: PARALLELS.includes(id.parallel_guess) ? id.parallel_guess : null,
    language: normLang(id.language),
    confidence: Number.isFinite(Number(id.confidence)) ? Math.min(1, Math.max(0, Number(id.confidence))) : 0,
  };
  const full = prompt.requireCondition && raw.condition && typeof raw.condition === "object";
  const section = (s) => ({
    flags: Array.isArray(s?.flags) ? s.flags.filter((f) => DEFECT_FLAGS.includes(f)) : [],
    notes: typeof s?.notes === "string" ? s.notes.trim().slice(0, 160) : "",
    severity: SEVERITIES.includes(s?.severity) ? s.severity : null,
    confidence: CONFIDENCES.includes(s?.confidence) ? s.confidence : null,
  });
  const condition = full
    ? {
        corners: section(raw.condition.corners), edges: section(raw.condition.edges), surface: section(raw.condition.surface),
        psa10_ruled_out: Boolean(raw.condition.psa10_ruled_out),
        reasons: Array.isArray(raw.condition.reasons) ? raw.condition.reasons.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 3) : [],
      }
    : emptyCondition();
  return { identify, condition, coverage: full ? "full" : "identify_only" };
}

/** Hand a reserved daily-cap slot back. Best effort: a refund must never turn a 502 into a 500. */
async function refundCap(env, key) {
  try {
    const cur = parseInt((await env.VISION_CAP.get(key)) || "0", 10);
    await env.VISION_CAP.put(key, String(Math.max(0, cur - 1)), { expirationTtl: 60 * 60 * 48 });
  } catch { /* the cap is a spend guard, not a ledger */ }
}
