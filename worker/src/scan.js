/**
 * POST /scan. One photo of a case, binder page or listing.
 * The image is sent to the model and is not stored.
 * An image URL is fetched only when the caller sends that URL. The listing page is not fetched.
 * Street prices are stored English quotes. Japanese cards are not given an English price.
 */
import { singaporeToday } from "../../src/lib/boughtBook.ts";
import jpeg from "jpeg-js";
import { matchScan, normaliseCondition } from "../../src/lib/scanMatch.ts";
import { bookEmail, keyFor } from "./holdings.js";
import { seedPrints, storedQuote } from "./storedPrice.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CARDS = 40;

export const SCAN_PROMPT = `You are looking at one photo of several One Piece TCG cards in a dealer case, binder page, showcase or listing.
Find every card. Read the slab label first when a card is in a grading slab. Read the card number from the label or the card face only when you can actually see it. Put that text in code even when it is only a set code such as EB04.
Bounding boxes are fractions of the photo from 0 to 1, not pixels.
Do not transcribe effect text. Do not guess a language from a set name. A label that says JP is Japanese even if the set name contains EN.
Do not guess a grade. Copy the grade and cert number from the label, or leave them null.
For each card return its place in the grid (row and column, left to right, top to bottom, starting at 0), a bounding box as fractions of the photo (x, y, w, h from 0 to 1), the card number, the print (base, aa, sp, manga, gold, silver, or 2nd anni), language EN or JP only when you read that word, a confidence from 0 to 1, any price sticker amount and its currency (SGD if the sticker shows no currency), and a short condition estimate from this crop.
Condition is an estimate, never a grade and never a PSA prediction. If the crop is too small or too blurry to judge, say so.
Return ONLY JSON matching the schema.`;

const BOX = {
  type: "OBJECT",
  properties: { x: { type: "NUMBER" }, y: { type: "NUMBER" }, w: { type: "NUMBER" }, h: { type: "NUMBER" } },
  required: ["x", "y", "w", "h"],
};

export const SCAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    cards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          row: { type: "INTEGER" },
          col: { type: "INTEGER" },
          box: BOX,
          code: { type: "STRING", nullable: true },
          name: { type: "STRING", nullable: true },
          language: { type: "STRING", nullable: true },
          label_text: { type: "STRING", nullable: true },
          parallel: { type: "STRING", nullable: true },
          confidence: { type: "NUMBER" },
          sticker_amount: { type: "NUMBER", nullable: true },
          sticker_currency: { type: "STRING", nullable: true },
          grader: { type: "STRING", nullable: true },
          grade: { type: "STRING", nullable: true },
          cert: { type: "STRING", nullable: true },
          label_year: { type: "STRING", nullable: true },
          set_name: { type: "STRING", nullable: true },
          black_label: { type: "BOOLEAN" },
          condition_judge: { type: "STRING", nullable: true },
          condition_confidence: { type: "STRING", nullable: true },
          whitening: { type: "BOOLEAN" },
          surface: { type: "ARRAY", items: { type: "STRING" } },
          left_right: { type: "STRING", nullable: true },
          top_bottom: { type: "STRING", nullable: true },
          condition_note: { type: "STRING", nullable: true },
        },
        required: ["row", "col", "confidence"],
      },
    },
  },
  required: ["cards"],
};

function text(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

/**
 * A box is fractions of the photo, 0 to 1. Values above 1 are pixels and are
 * divided by the image size. They are not clamped, which turned every pixel
 * box into {x:1,y:0,w:1,h:1}.
 */
export function normaliseBox(box, width, height) {
  if (!box) return null
  let x = Number(box.x)
  let y = Number(box.y)
  let w = Number(box.w)
  let h = Number(box.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0 || x < 0 || y < 0) return null
  if (x > 1 || y > 1 || w > 1 || h > 1) {
    if (!width || !height) return null
    x /= width
    y /= height
    w /= width
    h /= height
  }
  if (x > 1 || y > 1 || w > 1 || h > 1 || x + w > 1.02 || y + h > 1.02) return null
  return { x, y, w, h }
}

function imageSize(data) {
  try {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 24 })
    if (!decoded?.width || !decoded?.height) return { width: 0, height: 0 }
    return { width: decoded.width, height: decoded.height }
  } catch {
    return { width: 0, height: 0 }
  }
}

/** Model cards into the shape the matcher prices. Drops nothing the model returned except empty rows past the cap. */
export function normaliseScanSights(raw, image = { width: 0, height: 0 }) {
  const cards = Array.isArray(raw?.cards) ? raw.cards.slice(0, MAX_CARDS) : []
  return cards.map((card) => {
    const amount = Number(card?.sticker_amount)
    const codeText = text(card?.code, 80)
    const grader = text(card?.grader, 20)
    const grade = text(card?.grade, 20)
    const cert = text(card?.cert, 24)
    const slab = grader || grade || cert ? {
      grader,
      grade,
      cert,
      year: text(card?.label_year, 8),
      setName: text(card?.set_name, 80),
      blackLabel: card?.black_label === true,
    } : null
    return {
      row: Number.isFinite(Number(card?.row)) ? Number(card.row) : 0,
      col: Number.isFinite(Number(card?.col)) ? Number(card.col) : 0,
      box: normaliseBox(card?.box, image.width, image.height),
      codeText,
      code: text(card?.code, 24),
      name: text(card?.name, 60),
      language: text(card?.language, 12),
      labelText: text(card?.label_text, 160),
      parallel: text(card?.parallel, 40),
      confidence: Number.isFinite(Number(card?.confidence)) ? Math.min(1, Math.max(0, Number(card.confidence))) : 0,
      sticker: Number.isFinite(amount) && amount > 0 ? { amount, currency: (text(card?.sticker_currency, 8) || "SGD").toUpperCase() } : null,
      slab,
      condition: normaliseCondition({
        judge: card?.condition_judge,
        confidence: card?.condition_confidence,
        whitening: card?.whitening === true,
        surface: card?.surface,
        leftRight: card?.left_right,
        topBottom: card?.top_bottom,
        note: card?.condition_note,
      }),
    }
  })
}

function parseDataUrl(value) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(value || "")
  return match ? { mime: match[1], data: match[2] } : null
}

async function imageFromUrl(url, fetchImpl) {
  let parsed
  try { parsed = new URL(url) } catch { return { error: "bad_image_url" } }
  if (parsed.protocol !== "https:") return { error: "bad_image_url" }
  let response
  try { response = await fetchImpl(parsed.toString(), { redirect: "follow" }) } catch { return { error: "image_unreachable" } }
  if (!response.ok) return { error: "image_unreachable" }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  if (!type.startsWith("image/")) return { error: "not_an_image" }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: "too_large" }
  const mime = type
  let binary = ""
  const view = new Uint8Array(bytes)
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  return { mime, data: btoa(binary) }
}

async function watchTargets(env, identity) {
  try {
    if (!env.USER_DATA || !identity) return []
    const email = bookEmail(identity, env)
    if (!email) return []
    const raw = await env.USER_DATA.get(keyFor(email, "watchlist.v1"))
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!doc || !Array.isArray(doc.items)) return []
    return doc.items
      .filter((item) => item && typeof item.code === "string" && typeof item.targetSgd === "number")
      .map((item) => ({ id: String(item.id || ""), printId: item.code, targetSgd: item.targetSgd }))
  } catch {
    return []
  }
}

async function capState(env, day) {
  const cap = parseInt(env.DAILY_CAP || "60", 10)
  const key = `count:${day}`
  const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10)
  return { cap, key, used, limited: used >= cap }
}

async function charge(env, state) {
  const next = state.used + 1
  await env.VISION_CAP.put(state.key, String(next), { expirationTtl: 60 * 60 * 48 })
  return { used: next, cap: state.cap }
}

function safeDetail(text) {
  return String(text || "")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 300)
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } })
}

/**
 * One scan. `deps.modelFetch` and `deps.imageFetch` stand in for the network in tests.
 * The photo is not written to KV.
 */
export async function handleScan(req, env, identity, cors, deps = {}) {
  let body
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400, cors) }
  const caption = typeof body.caption === "string" ? body.caption.slice(0, 4000) : ""
  const lotAsk = body.lotAskSgd == null || body.lotAskSgd === "" ? null : Number(body.lotAskSgd)
  if (lotAsk != null && (!Number.isFinite(lotAsk) || lotAsk < 0)) return json({ error: "bad_lot_ask" }, 400, cors)
  let image = null
  let imageUrl = null
  if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    imageUrl = body.imageUrl.trim()
    const fetched = await imageFromUrl(imageUrl, deps.imageFetch || fetch)
    if (fetched.error) return json({ error: fetched.error }, 400, cors)
    image = fetched
  } else if (typeof body.image === "string") {
    image = parseDataUrl(body.image)
  }
  if (!image?.data) return json({ error: "image_required" }, 400, cors)
  if (image.data.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "too_large" }, 413, cors)

  const day = singaporeToday(Date.now())
  const room = await capState(env, day)
  if (room.limited) return json({ error: "daily_cap_reached", cap: room.cap, used: room.used }, 429, cors)

  const modelFetch = deps.modelFetch || fetch
  let response
  try {
    response = await modelFetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: SCAN_PROMPT }, { inline_data: { mime_type: image.mime || "image/jpeg", data: image.data } }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCAN_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 12288,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    })
  } catch {
    return json({ error: "model_error" }, 502, cors)
  }
  if (!response.ok) {
    let detail = ""
    try { detail = await response.text() } catch { detail = "" }
    return json({ error: "model_error", status: response.status, detail: safeDetail(detail) }, 502, cors)
  }
  let payload
  try { payload = await response.json() } catch { return json({ error: "unparseable_model_output" }, 502, cors) }
  const textPart = payload?.candidates?.[0]?.content?.parts?.filter((part) => part && !part.thought && typeof part.text === "string").map((part) => part.text).join("") || ""
  let parsed
  try { parsed = JSON.parse(textPart) } catch { return json({ error: "unparseable_model_output" }, 502, cors) }
  const sights = normaliseScanSights(parsed, imageSize(image.data))
  const usage = await charge(env, room)
  const summary = matchScan({
    sights,
    prints: seedPrints(),
    quoteFor: (id, grade) => storedQuote(id, grade),
    today: singaporeToday(Date.now()),
    targets: await watchTargets(env, identity),
    caption,
    lotAskSgd: lotAsk,
    imageUrl,
  })
  return json({
    ...summary,
    imageStored: false,
    ai_guess: true,
    model: env.GEMINI_MODEL,
    usage: { today: usage.used, cap: usage.cap },
    disclaimer: "AI estimate. A condition note is not a grade and is not a PSA prediction.",
  }, 200, cors)
}
