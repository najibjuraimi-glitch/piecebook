// Piecebook vision worker. Secret: GEMINI_API_KEY (wrangler secret put). No keys in source.
const PROMPT = `You are inspecting photos of a One Piece TCG card for Piecebook, a collector app.
Image 1 is the FRONT. Image 2, if present, is the BACK.
Tasks:
1. IDENTIFY: read the set code printed on the card (e.g. "OP01-016", "ST14-003"), the card name, the printed language, and any text you can read. Only report a set_code you can actually read in the image. If it is not legible, set_code must be null. Never guess or invent a set code.
parallel_guess — pick one:
- "SP" for a Special Card / SP foil (holographic SP treatment, a printed SP rarity, or SPECIAL used as a foil/rarity stamp). Prefer SP over base when the card is clearly an SP foil even if the printed number looks like a base code.
- "parallel/alt art" for an alternate illustration (not the set's standard art).
- "manga" for the manga-panel treatment.
- "base" only for the standard set print with no parallel treatment.
- null if you cannot tell.
The attack attribute "Special" (Strike / Slash / Special next to power) is not enough by itself. Foil plus SPECIAL / SP as a rarity mark is. Do not default to "base" when the foil, stamp, or read text says SP, SPECIAL, Alternate, or Manga.
language: "EN", "JP", "CN", "KR", "FR", or null — read from the card text (English effect text vs Japanese, Chinese, Korean, French). Do not infer language from the set code alone. If the text is not legible, language must be null.
2. CONDITION: inspect corners, edges and surface for whitening, dings, chips, creases, scratches, print lines, dents, stains.
Photos can rule out a PSA 10 but never confirm one. Set psa10_ruled_out true only if you see a clear defect; otherwise false (which means "not ruled out", never "is a 10"). Be conservative and say when photo quality limits what you can see.
Return ONLY JSON matching the schema.`;

const SECTION = { type: "OBJECT", properties: { flags: { type: "ARRAY", items: { type: "STRING" } }, notes: { type: "STRING" } }, required: ["flags", "notes"] };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    identify: { type: "OBJECT", properties: {
      set_code: { type: "STRING", nullable: true }, name: { type: "STRING", nullable: true },
      parallel_guess: { type: "STRING", nullable: true }, language: { type: "STRING", nullable: true },
      confidence: { type: "NUMBER" },
      read_text: { type: "STRING" } }, required: ["set_code", "name", "parallel_guess", "language", "confidence", "read_text"] },
    condition: { type: "OBJECT", properties: {
      corners: SECTION, edges: SECTION, surface: SECTION,
      psa10_ruled_out: { type: "BOOLEAN" }, reasons: { type: "ARRAY", items: { type: "STRING" } } },
      required: ["corners", "edges", "surface", "psa10_ruled_out", "reasons"] },
  },
  required: ["identify", "condition"],
};

function corsHeaders(origin) {
  const ok = origin === "https://najibjuraimi-glitch.github.io" || /^http:\/\/localhost(:\d+)?$/.test(origin || "") || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin || "");
  return ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" } : { "Vary": "Origin" };
}
const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

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

async function readImages(req) {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData(); const out = {};
    for (const k of ["front", "back"]) { const f = fd.get(k); if (f && typeof f !== "string") out[k] = { mime: f.type || "image/jpeg", data: b64FromBuffer(await f.arrayBuffer()) }; }
    return out;
  }
  const body = await req.json();
  return { front: parseDataUrl(body.front), back: parseDataUrl(body.back) };
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req.headers.get("Origin"));
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return json({ ok: true, model: env.GEMINI_MODEL }, 200, cors);
    if (url.pathname !== "/check" || req.method !== "POST") return json({ error: "not_found" }, 404, cors);
    const origin = req.headers.get("Origin");
    if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);

    let imgs;
    try { imgs = await readImages(req); } catch { return json({ error: "bad_request" }, 400, cors); }
    if (!imgs.front) return json({ error: "front_required" }, 400, cors);
    const size = (imgs.front.data.length + (imgs.back?.data.length || 0)) * 0.75;
    if (size > 8 * 1024 * 1024) return json({ error: "too_large", hint: "downscale to ~1600px long edge" }, 413, cors);

    // Daily cap (UTC day). KV is eventually consistent; good enough as a spend guard.
    const day = new Date().toISOString().slice(0, 10);
    const key = `count:${day}`;
    const cap = parseInt(env.DAILY_CAP || "60", 10);
    const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10);
    if (used >= cap) return json({ error: "daily_cap_reached", cap, used }, 429, cors);
    await env.VISION_CAP.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });

    const parts = [{ text: PROMPT }, { inline_data: { mime_type: imgs.front.mime, data: imgs.front.data } }];
    if (imgs.back) parts.push({ inline_data: { mime_type: imgs.back.mime, data: imgs.back.data } });
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: {
          responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.1,
          thinkingConfig: { thinkingLevel: "low" } } }),
      });
    } catch (e) {
      return json({ error: "model_error", status: 0, detail: String(e && e.message ? e.message : e).slice(0, 300) }, 502, cors);
    }
    if (!r.ok) {
      let detail = "";
      try { detail = (await r.text()).slice(0, 300); } catch { detail = "unreadable_model_response"; }
      return json({ error: "model_error", status: r.status, detail }, 502, cors);
    }
    let out;
    try { out = await r.json(); } catch { return json({ error: "model_error", status: r.status, detail: "unreadable_model_response" }, 502, cors); }
    const text = out?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    let result; try { result = JSON.parse(text); } catch { return json({ error: "unparseable_model_output", status: r.status }, 502, cors); }
    if (result?.identify?.set_code && !/^[A-Z]{2,3}\d{2}-\d{3}$/.test(result.identify.set_code.trim().toUpperCase())) result.identify.set_code = null;
    else if (result?.identify?.set_code) result.identify.set_code = result.identify.set_code.trim().toUpperCase();
    if (result?.identify) result.identify.language = normLang(result.identify.language);
    return json({ ...result, ai_guess: true, model: env.GEMINI_MODEL, usage: { today: used + 1, cap }, disclaimer: "AI guess. Photos can rule out a PSA 10 but never confirm one." }, 200, cors);
  },
};
