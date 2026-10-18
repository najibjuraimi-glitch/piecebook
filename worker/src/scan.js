/**
 * POST /scan. One photo of a case, binder page or listing.
 * The image is sent to the model and is not stored.
 * An image URL is fetched only when the caller sends that URL. The listing page is not fetched.
 * Street prices are stored English quotes. Japanese cards are not given an English price.
 */
import { legalGrade, singaporeToday } from "../../src/lib/boughtBook.ts";
import jpeg from "jpeg-js";
import { matchScan, normaliseCondition } from "../../src/lib/scanMatch.ts";
import { readCap, releaseCap, reserveCap } from "./cap.js";
import { bookEmail, keyFor } from "./holdings.js";
import { seedPrints, storedQuote } from "./storedPrice.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CARDS = 40;

export const SCAN_PROMPT = `You are looking at one photo of several One Piece TCG cards in a dealer case, binder page, showcase or listing.
Find every card. Read the slab label first when a card is in a grading slab. Read the card number from the label or the card face only when you can actually see it.
Put the set code (EB04, OP13, PRB02) in set. Put the label number (#106, #004) in code, even when that is all you can read. Do not put a year in code.
Each box_2d is [ymin, xmin, ymax, xmax] on a 0 to 1000 scale. 0 is the top or left edge. 1000 is the bottom or right edge.
Do not transcribe effect text. Do not guess a language from a set name. A label that says JP is Japanese even if the set name contains EN.
language_evidence is label when the slab says EN or JP, card_text_english when the rules text is English, or card_text_japanese when the card text is Japanese.
Do not guess a grade. Copy the grade and cert number from the label, or leave them null.
For each card return its place in the grid (row and column, left to right, top to bottom, starting at 0), the box, the set, the number, the print (base, aa, sp, manga, gold, silver, or 2nd anni), language from the label word or from language_evidence, a confidence from 0 to 1, any price sticker amount and its currency (SGD if the sticker shows no currency), and a short condition estimate from this crop.
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
          box_2d: { type: "ARRAY", items: { type: "NUMBER" }, nullable: true },
          box: BOX,
          code: { type: "STRING", nullable: true },
          set: { type: "STRING", nullable: true },
          name: { type: "STRING", nullable: true },
          language: { type: "STRING", nullable: true },
          language_evidence: { type: "STRING", nullable: true },
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

/**
 * Gemini box_2d is [ymin, xmin, ymax, xmax]. The usual scale is 0–1000.
 * When every value is at most 1, it is already a fraction of the photo.
 * Never clamped.
 */
export function boxFrom2d(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [ymin, xmin, ymax, xmax] = raw.map(Number)
  if (![ymin, xmin, ymax, xmax].every((n) => Number.isFinite(n))) return null
  const scale = [ymin, xmin, ymax, xmax].every((n) => n <= 1) ? 1 : 1000
  const round = (n) => Math.round(n * 1e6) / 1e6
  const x = round(xmin / scale)
  const y = round(ymin / scale)
  const w = round((xmax - xmin) / scale)
  const h = round((ymax - ymin) / scale)
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x > 1 || y > 1 || x + w > 1 || y + h > 1) return null
  return { x, y, w, h }
}

/** A box whose centre is on the wrong side of a neighbour in the same row or column is dropped. */
export function dropDisagreedBoxes(sights) {
  const bad = new Set()
  for (let i = 0; i < sights.length; i += 1) {
    for (let j = i + 1; j < sights.length; j += 1) {
      const a = sights[i]
      const b = sights[j]
      if (!a.box || !b.box) continue
      const ax = a.box.x + a.box.w / 2
      const ay = a.box.y + a.box.h / 2
      const bx = b.box.x + b.box.w / 2
      const by = b.box.y + b.box.h / 2
      if (a.row === b.row && a.col !== b.col) {
        const left = a.col < b.col ? ax : bx
        const right = a.col < b.col ? bx : ax
        if (left > right + 0.02) {
          bad.add(i)
          bad.add(j)
        }
      }
      if (a.col === b.col && a.row !== b.row) {
        const top = a.row < b.row ? ay : by
        const bottom = a.row < b.row ? by : ay
        if (top > bottom + 0.02) {
          bad.add(i)
          bad.add(j)
        }
      }
    }
  }
  return sights.map((sight, index) => (bad.has(index) ? { ...sight, box: null } : sight))
}

/** Width and height from the JPEG header. Does not decode the pixels. */
export function jpegSize(data) {
  try {
    const bytes = bytesFromBase64(data)
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { width: 0, height: 0 }
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue }
      const marker = bytes[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue }
      const len = (bytes[i + 2] << 8) + bytes[i + 3]
      if (len < 2 || i + 2 + len > bytes.length) break
      const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
      if (sof) return { height: (bytes[i + 5] << 8) + bytes[i + 6], width: (bytes[i + 7] << 8) + bytes[i + 8] }
      i += 2 + len
    }
  } catch { /* a box still works when the model sent fractions */ }
  return { width: 0, height: 0 }
}

function decodeJpeg(data) {
  try {
    const decoded = jpeg.decode(bytesFromBase64(data), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 8 })
    if (!decoded?.width || !decoded?.height || !decoded.data) return null
    return decoded
  } catch {
    return null
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
    const evidence = text(card?.language_evidence, 32)
    return {
      row: Number.isFinite(Number(card?.row)) ? Number(card.row) : 0,
      col: Number.isFinite(Number(card?.col)) ? Number(card.col) : 0,
      box: Array.isArray(card?.box_2d) ? boxFrom2d(card.box_2d) : normaliseBox(card?.box, image.width, image.height),
      codeText,
      code: text(card?.code, 24),
      setCode: [text(card?.set, 80), text(card?.set_name, 80)].filter(Boolean).join(' ') || null,
      name: text(card?.name, 60),
      language: text(card?.language, 12),
      languageEvidence: evidence === "label" || evidence === "card_text_english" || evidence === "card_text_japanese" ? evidence : null,
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
      .filter((item) => item && typeof item.code === "string" && (typeof item.targetSgd === "number" || typeof item.marketSgd === "number"))
      .map((item) => ({
        id: String(item.id || ""),
        printId: item.code,
        targetSgd: typeof item.targetSgd === "number" ? item.targetSgd : null,
        grade: legalGrade(String(item.grade || "")),
        marketSgd: typeof item.marketSgd === "number" ? item.marketSgd : null,
        marketAsOf: typeof item.marketAsOf === "string" ? item.marketAsOf : null,
        marketSource: typeof item.marketSource === "string" ? item.marketSource : null,
        marketUrl: typeof item.marketUrl === "string" ? item.marketUrl : null,
      }))
  } catch {
    return []
  }
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

const CROP_MAX = 1600

/** Scale down so the long edge is at most 1600px. Never upscale. */
export function cropScale(width, height) {
  const long = Math.max(width, height)
  if (long <= CROP_MAX) return 1
  return CROP_MAX / long
}

function bytesFromBase64(data) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64FromBytes(bytes) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** A JPEG of one card. The long edge is at most 1600px and is never enlarged. Null when the photo will not decode. */
export function cropJpeg(data, box) {
  if (!data || !box) return null
  const decoded = decodeJpeg(data)
  if (!decoded) return null
  try {
    return cropDecoded(decoded, box)
  } catch {
    return null
  }
}

function cropDecoded(decoded, box) {
  const x0 = Math.max(0, Math.min(decoded.width - 1, Math.floor(box.x * decoded.width)))
  const y0 = Math.max(0, Math.min(decoded.height - 1, Math.floor(box.y * decoded.height)))
  const w = Math.max(1, Math.min(decoded.width - x0, Math.round(box.w * decoded.width)))
  const h = Math.max(1, Math.min(decoded.height - y0, Math.round(box.h * decoded.height)))
  const scale = cropScale(w, h)
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))
  const out = new Uint8Array(tw * th * 4)
  for (let y = 0; y < th; y += 1) {
    const sy = y0 + Math.min(h - 1, Math.floor(y / scale))
    for (let x = 0; x < tw; x += 1) {
      const sx = x0 + Math.min(w - 1, Math.floor(x / scale))
      const from = (sy * decoded.width + sx) * 4
      const to = (y * tw + x) * 4
      out[to] = decoded.data[from]
      out[to + 1] = decoded.data[from + 1]
      out[to + 2] = decoded.data[from + 2]
      out[to + 3] = 255
    }
  }
  const encoded = jpeg.encode({ data: out, width: tw, height: th }, 80)
  return `data:image/jpeg;base64,${base64FromBytes(encoded.data)}`
}

function withCrops(sights, decoded) {
  if (!decoded?.width) return sights.map((sight) => ({ ...sight, crop: null }))
  return sights.map((sight) => {
    if (!sight.box) return { ...sight, crop: null }
    try {
      return { ...sight, crop: cropDecoded(decoded, sight.box) }
    } catch {
      return { ...sight, crop: null }
    }
  })
}

/**
 * One scan. `deps.modelFetch` and `deps.imageFetch` stand in for the network in tests.
 * The photo is not written to KV.
 */
/** How many scans are left today. Does not reserve a slot. */
export async function handleScanUsage(env, cors) {
  const room = await readCap(env, singaporeToday(Date.now()))
  return json({ usage: { today: room.used, cap: room.cap } }, 200, cors)
}

export async function handleScan(req, env, identity, cors, deps = {}) {
  let body
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400, cors) }
  const caption = typeof body.caption === "string" ? body.caption.slice(0, 4000) : ""
  const lotAsk = body.lotAskSgd == null || body.lotAskSgd === "" ? null : Number(body.lotAskSgd)
  if (lotAsk != null && (!Number.isFinite(lotAsk) || lotAsk < 0)) return json({ error: "bad_lot_ask" }, 400, cors)
  const lotAskCurrency = body.lotAskCurrency === "USD" ? "USD" : "SGD"
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
  const room = await reserveCap(env, day)
  if (room.limited) return json({ error: "daily_cap_reached", cap: room.cap, used: room.used }, 429, cors)
  let keep = false
  try {
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
    const size = jpegSize(image.data)
    const sights = dropDisagreedBoxes(normaliseScanSights(parsed, size)).map((sight) => ({ ...sight, crop: null }))
    const targets = await watchTargets(env, identity)
    const summary = matchScan({
      sights,
      prints: seedPrints(),
      quoteFor: (id, grade) => storedQuote(id, grade),
      today: singaporeToday(Date.now()),
      targets,
      caption,
      lotAskSgd: lotAsk,
      lotAskCurrency,
      imageUrl,
    })
    keep = true
    return json({
      ...summary,
      targets,
      imageStored: false,
      ai_guess: true,
      model: env.GEMINI_MODEL,
      usage: { today: room.used, cap: room.cap },
      disclaimer: "AI estimate. A condition note is not a grade and is not a PSA prediction.",
    }, 200, cors)
  } finally {
    if (!keep && room.held) await releaseCap(env, day).catch(() => {})
  }
}

/** One card, on request. Does not use the daily photo cap. A failure is crop: null. */
export async function handleScanCrop(req, env, cors, deps = {}) {
  try {
    let body
    try { body = await req.json() } catch { return json({ crop: null, imageStored: false }, 200, cors) }
    const box = body.box
    if (!box || typeof box !== "object") return json({ crop: null, imageStored: false }, 200, cors)
    let image = null
    if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
      const fetched = await imageFromUrl(body.imageUrl.trim(), deps.imageFetch || fetch)
      if (fetched.error) return json({ crop: null, imageStored: false }, 200, cors)
      image = fetched
    } else if (typeof body.image === "string") {
      image = parseDataUrl(body.image)
    }
    if (!image?.data || image.data.length * 0.75 > MAX_IMAGE_BYTES) return json({ crop: null, imageStored: false }, 200, cors)
    const started = Date.now()
    const decoded = decodeJpeg(image.data)
    if (!decoded || Date.now() - started > 1500) return json({ crop: null, imageStored: false }, 200, cors)
    const crop = cropDecoded(decoded, box)
    return json({ crop: crop || null, imageStored: false }, 200, cors)
  } catch {
    return json({ crop: null, imageStored: false }, 200, cors)
  }
}
