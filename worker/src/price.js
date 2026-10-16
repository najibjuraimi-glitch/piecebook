// Street price: one GET for both desks. Real sources only, each figure with its
// source URL and the date it was pulled, USD and SGD at a dated ECB rate, cached
// in KV. A source the Worker cannot read says `unavailable` or `not_configured`
// with the reason; nothing is ever guessed. Reference prices, never an offer.
//
//   GET /price?card=OP05-119&variant=SP&lang=EN&grade=PSA10      (Auction's spelling)
//   GET /street?code=EB02-010&variant=alt&grade=raw|psa10          (Cards' spelling)
//
// Sources:
//   tcgplayer      TCGplayer market via TCGCSV (tcgcsv.com, a once-a-day mirror of
//                  TCGplayer's API). Raw cards only. Works from a Worker, no key.
//   pricecharting  PriceCharting API (paid token PRICECHARTING_TOKEN). Ungraded,
//                  Grade 9 and PSA 10. not_configured until the token is set.
//   ebay_sold      Needs eBay developer keys with Marketplace Insights access.
//                  not_configured; no code path invents a comp.
//   collectr       Publishes no API. unavailable, always.
import ROSTER from "../../data/sets-roster-en.json";
import FX_FALLBACK from "../../data/fx-usd-sgd.json";
import PRODUCTS_CSV from "../../data/tcgplayer-products.csv";

export const PRICE_TTL_S = 6 * 60 * 60; // the TCGCSV mirror rebuilds once a day
export const GROUP_TTL_S = 6 * 60 * 60;
export const GROUPS_TTL_S = 24 * 60 * 60;
export const FX_TTL_S = 12 * 60 * 60;

const TCGCSV = "https://tcgcsv.com";
const TCGCSV_CATEGORY = 68; // One Piece Card Game
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const PRICECHARTING = "https://www.pricecharting.com";
const UA = "Piecebook/1.0 (+https://github.com/najibjuraimi-glitch/piecebook)";
export const DISCLAIMER = "Reference prices with a source and a date. Not an offer. Piecebook never buys, bids or offers.";

const GRADES = { raw: "raw", ungraded: "raw", loose: "raw", psa10: "psa10", "psa-10": "psa10", "10": "psa10", psa9: "psa9", "psa-9": "psa9", "9": "psa9" };
export const GRADE_WORDS = { raw: "raw", psa9: "PSA 9", psa10: "PSA 10" };

// What agents type → which TCGplayer name suffix. TCGplayer labels its prints
// in parentheses after the name: "(Alternate Art)", "(Parallel)", "(SP)", "(Manga)".
const VARIANT_WORDS = {
  base: ["", "base", "regular", "normal", "standard", "non-parallel"],
  alt: ["alt", "aa", "alternate", "alternate art", "alt art", "parallel", "p1", "alternate-art", "alt-art"],
  sp: ["sp", "special", "special card"],
  manga: ["manga", "manga art", "manga-art"],
  "box topper": ["box topper", "boxtopper", "topper"],
  "treasure rare": ["treasure", "treasure rare", "tr"],
  "full art": ["full art", "full-art", "fa"],
  "textured foil": ["textured", "textured foil"],
  "pirate foil": ["pirate", "pirate foil"],
};
const SUFFIX_TO_KEY = {
  "": "base",
  "alternate art": "alt",
  parallel: "alt",
  sp: "sp",
  manga: "manga",
  "box topper": "box topper",
  "treasure rare": "treasure rare",
  "full art": "full art",
  "textured foil": "textured foil",
  "pirate foil": "pirate foil",
};

function num(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
export function toSgd(usd, rate) {
  if (usd == null || rate == null) return null;
  return Math.round(usd * rate * 100) / 100;
}

// --- query -----------------------------------------------------------------

/** `EB02-010p1` → { base: "EB02-010", print: "p1", setToken: "EB02", setCode: "EB-02" }. */
export function parseCardNumber(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = /^([A-Z]{2,3})(\d{2})-(\d{3})(?:[_-]?(P\d))?$/.exec(s);
  if (!m) return null;
  const setToken = `${m[1]}${m[2]}`;
  return { base: `${setToken}-${m[3]}`, print: m[4] ? m[4].toLowerCase() : null, setToken, setCode: `${m[1]}-${m[2]}` };
}

export function normaliseVariant(raw) {
  const v = String(raw || "").trim().toLowerCase().replace(/[()]/g, "");
  if (v === "any" || v === "all") return "any";
  for (const [key, words] of Object.entries(VARIANT_WORDS)) if (words.includes(v)) return key;
  if (/^p[2-9]$/.test(v)) return v; // a Limitless print number: resolved through the product map
  return null;
}

export function normaliseGrade(raw) {
  const g = String(raw || "raw").trim().toLowerCase().replace(/\s+/g, "");
  return GRADES[g] || null;
}

export function parsePriceQuery(url) {
  const p = url.searchParams;
  const cardRaw = p.get("card") ?? p.get("code") ?? p.get("number") ?? "";
  const card = parseCardNumber(cardRaw);
  if (!card) return { error: "card_required", detail: "card (or code) must be a card number such as OP05-119 or EB02-010p1." };
  const variantRaw = p.get("variant") ?? p.get("parallel") ?? "";
  // A print suffix on the number wins over the variant word: EB02-010p1 is the p1 print.
  const variant = card.print ? card.print === "p1" ? "alt" : card.print : normaliseVariant(variantRaw);
  if (variant === null) return { error: "variant_unknown", detail: `variant "${variantRaw}" is not one of base, alt, SP, manga, box topper, treasure rare, full art, textured foil, pirate foil, p2…p9, any.` };
  const lang = (p.get("lang") ?? "EN").trim().toUpperCase();
  const grade = normaliseGrade(p.get("grade"));
  if (!grade) return { error: "grade_unknown", detail: `grade "${p.get("grade")}" is not one of raw, psa9, psa10.` };
  return { card: card.base, print: card.print, setToken: card.setToken, setCode: card.setCode, variant, lang, grade };
}

export function cacheKey(q) {
  return `price:v1:${q.card}|${q.variant}|${q.lang}|${q.grade}`;
}

// --- product map (data/tcgplayer-products.csv, bundled) --------------------

let productMap = null;
/** cardNumber → productId and productId → cardNumber, from the refresh's own CSV. */
export function loadProductMap(csv = PRODUCTS_CSV) {
  if (productMap && csv === PRODUCTS_CSV) return productMap;
  const byCard = new Map(), byProduct = new Map();
  for (const line of String(csv).split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [cardNumber, setCode, id] = line.split(",");
    const pid = num(id);
    if (!cardNumber || pid == null) continue;
    byCard.set(cardNumber.toUpperCase(), { productId: pid, setCode, cardNumber });
    byProduct.set(pid, cardNumber);
  }
  const map = { byCard, byProduct };
  if (csv === PRODUCTS_CSV) productMap = map;
  return map;
}

// --- TCGCSV ----------------------------------------------------------------

async function cached(kv, key, ttl, load) {
  if (kv) {
    try {
      const hit = await kv.get(key, "json");
      if (hit && typeof hit === "object") return { value: hit, hit: true };
    } catch { /* a cache miss, not an error */ }
  }
  const value = await load();
  if (kv && value != null) {
    try { await kv.put(key, JSON.stringify(value), { expirationTtl: ttl }); } catch { /* best effort */ }
  }
  return { value, hit: false };
}

async function tcgcsvJson(fetchFn, path) {
  const r = await fetchFn(`${TCGCSV}${path}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`tcgcsv ${path} ${r.status}`);
  const body = await r.json();
  if (!body || !Array.isArray(body.results)) throw new Error(`tcgcsv ${path} shape`);
  return body.results;
}

/** TCGCSV's own build stamp (last-updated.txt), so asOf is the mirror's date, not ours. Best effort. */
async function tcgcsvBuilt(fetchFn) {
  try {
    const r = await fetchFn(`${TCGCSV}/last-updated.txt`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const t = (await r.text()).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(t) ? t : null;
  } catch { return null; }
}

/** The sets whose boxes hold a print of this card, from the product map (OP05-119 → OP-05 and PRB-01). */
export function setsHolding(base, map) {
  const out = [];
  for (const [key, v] of map.byCard) if ((key === base || key.startsWith(base)) && v.setCode && !out.includes(v.setCode)) out.push(v.setCode);
  return out;
}

/**
 * Candidate TCGplayer groups: the roster's id for the set, the roster ids of
 * every other set holding a print of the card, then any group whose
 * abbreviation names the set (OP14-EB04 for EB04).
 */
export function candidateGroups(setCode, setToken, groups, roster = ROSTER, extraSetCodes = []) {
  const ids = [];
  for (const code of [setCode, ...extraSetCodes]) {
    for (const s of roster.sets || []) if (s.setCode === code && num(s.tcgplayerGroupId) != null && !ids.includes(s.tcgplayerGroupId)) ids.push(s.tcgplayerGroupId);
  }
  for (const g of groups || []) {
    const abbr = String(g.abbreviation || "").toUpperCase();
    const tokens = abbr.split(/[\s-]+/);
    if (tokens.includes(setToken) && !ids.includes(g.groupId)) ids.push(g.groupId);
  }
  return ids;
}

export function productNumber(p) {
  const e = Array.isArray(p.extendedData) ? p.extendedData.find((x) => x && x.name === "Number") : null;
  return e && typeof e.value === "string" ? e.value.trim().toUpperCase() : null;
}

/**
 * `Monkey.D.Luffy (119) (Alternate Art) (Manga)` → { name: "Monkey.D.Luffy",
 * suffixes: ["alternate art", "manga"] }. The three-digit number in brackets is
 * TCGplayer's own disambiguator, not a label; a bracketed card number
 * (`Jewelry Bonney (EB04-001)`) is dropped the same way.
 */
export function splitProductName(name) {
  let s = String(name || "").trim();
  s = s.replace(/\s*\((?:\d{3}|[A-Z]{2,3}\d{2}-\d{3})\)/g, " ").replace(/\s+/g, " ").trim();
  const suffixes = [];
  let m;
  while ((m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(s))) {
    suffixes.unshift(m[2].trim().toLowerCase());
    s = m[1].trim();
  }
  return { name: s, suffixes };
}

/** Every print of a card number in a group, with its TCGplayer label, market price and Piecebook number. */
export function printsFor(base, products, prices, map) {
  const priceById = new Map();
  for (const pr of prices || []) if (pr && num(pr.productId) != null) priceById.set(pr.productId, pr);
  const out = [];
  for (const p of products || []) {
    if (productNumber(p) !== base) continue;
    const { name, suffixes } = splitProductName(p.name);
    const pr = priceById.get(p.productId) || null;
    const keys = suffixes.length ? suffixes.map((x) => SUFFIX_TO_KEY[x] || x) : ["base"];
    out.push({
      productId: p.productId,
      cardNumber: map.byProduct.get(p.productId) || null,
      name,
      label: suffixes.length ? suffixes.map((x) => x.replace(/\b\w/g, (c) => c.toUpperCase())).join(" · ") : "Base",
      variantKeys: keys,
      url: typeof p.url === "string" ? p.url : `https://www.tcgplayer.com/product/${p.productId}`,
      market: pr ? num(pr.marketPrice) : null,
      low: pr ? num(pr.lowPrice) : null,
      mid: pr ? num(pr.midPrice) : null,
      subType: pr ? pr.subTypeName || null : null,
    });
  }
  return out;
}

function printRank(p) {
  if (!p.cardNumber) return 99;
  const m = /p(\d)$/i.exec(p.cardNumber);
  return m ? Number(m[1]) : 0;
}

/** Pick the print the query asked for. `any` returns nothing chosen and lists them all. */
export function choosePrint(prints, variant, print, map, base) {
  if (variant === "any") return { chosen: null, reason: "any" };
  if (print || /^p\d$/.test(variant)) {
    const number = `${base}${print || variant}`;
    const hit = map.byCard.get(number.toUpperCase());
    const chosen = hit ? prints.find((x) => x.productId === hit.productId) : null;
    return chosen ? { chosen, reason: "print_number" } : { chosen: null, reason: `no TCGplayer product is mapped to ${number}` };
  }
  // Exactly that label first ("Alternate Art"); then any print carrying it ("Alternate Art · Manga").
  const exact = prints.filter((x) => x.variantKeys.length === 1 && x.variantKeys[0] === variant);
  if (exact.length === 1) return { chosen: exact[0], reason: "label" };
  const matches = exact.length ? exact : prints.filter((x) => x.variantKeys.includes(variant));
  if (matches.length === 1) return { chosen: matches[0], reason: "label" };
  if (matches.length > 1) {
    // Several prints share the label (OP05-119p1 and the PRB-01 reprint p4 are both "Alternate Art").
    // Take the lowest Piecebook print number, the original, and say so; the rest stay in `prints`.
    const ranked = [...matches].sort((a, b) => printRank(a) - printRank(b));
    if (ranked[0].cardNumber) {
      return { chosen: ranked[0], reason: "label", note: `${matches.length} prints of ${base} are labelled ${variant} (${matches.map((x) => x.cardNumber || `TCGplayer ${x.productId}`).join(", ")}); this is ${ranked[0].cardNumber}, the lowest print number. Ask by print number for another.` };
    }
    return { chosen: null, reason: `${matches.length} prints of ${base} carry the label ${variant} and none is mapped to a print number; see prints[]` };
  }
  return { chosen: null, reason: `no print of ${base} is labelled ${variant} on TCGplayer; see prints[] for what it lists` };
}

async function tcgplayerSource(q, env, deps, kv, now) {
  const fetchFn = deps.fetch || fetch;
  const map = deps.productMap || loadProductMap();
  let groups;
  try {
    groups = (await cached(kv, "tcgcsv:groups", GROUPS_TTL_S, () => tcgcsvJson(fetchFn, `/tcgplayer/${TCGCSV_CATEGORY}/groups`))).value;
  } catch (e) {
    return { source: unavailable(`TCGCSV could not be read from the Worker: ${String(e.message || e).slice(0, 120)}`), prints: [], print: null };
  }
  const ids = candidateGroups(q.setCode, q.setToken, groups, deps.roster, setsHolding(q.card, map));
  if (!ids.length) return { source: unavailable(`no TCGplayer group is known for ${q.setCode}.`), prints: [], print: null };
  let prints = [];
  let pulledAt = null, built = null;
  const seen = new Set();
  for (const groupId of ids) {
    try {
      const { value } = await cached(kv, `tcgcsv:group:${groupId}`, GROUP_TTL_S, async () => {
        const [products, prices, lastUpdated] = await Promise.all([
          tcgcsvJson(fetchFn, `/tcgplayer/${TCGCSV_CATEGORY}/${groupId}/products`),
          tcgcsvJson(fetchFn, `/tcgplayer/${TCGCSV_CATEGORY}/${groupId}/prices`),
          tcgcsvBuilt(fetchFn),
        ]);
        return { products, prices, built: lastUpdated, pulledAt: now };
      });
      pulledAt = pulledAt || value.pulledAt;
      built = built || value.built || null;
      for (const p of printsFor(q.card, value.products, value.prices, map)) {
        if (seen.has(p.productId)) continue;
        seen.add(p.productId);
        prints.push({ ...p, groupId });
      }
    } catch (e) {
      return { source: unavailable(`TCGCSV group ${groupId} could not be read from the Worker: ${String(e.message || e).slice(0, 120)}`), prints: [], print: null };
    }
  }
  if (!prints.length) return { source: unavailable(`${q.card} is not listed in the TCGplayer groups for ${q.setCode}.`), prints, print: null };
  const pick = choosePrint(prints, q.variant, q.print, map, q.card);
  const asOf = built ? built.slice(0, 10) : pulledAt ? pulledAt.slice(0, 10) : null;
  const via = `${TCGCSV}/tcgplayer/${TCGCSV_CATEGORY}/${(pick.chosen || prints[0]).groupId}/prices`;
  if (!pick.chosen) {
    return { source: { status: pick.reason === "any" ? "list" : "unavailable", grade: "raw", note: pick.reason === "any" ? "variant=any lists every print; no single street figure." : pick.reason, via, asOf, pulledAt }, prints, print: null };
  }
  if (q.grade !== "raw") {
    return { source: { status: "not_applicable", grade: "raw", note: `TCGplayer market is for raw cards only; no ${GRADE_WORDS[q.grade]} figure here.`, url: pick.chosen.url, via, asOf, pulledAt }, prints, print: pick.chosen };
  }
  if (pick.chosen.market == null) {
    return { source: { status: "unavailable", grade: "raw", note: "TCGplayer lists this print without a market price today.", url: pick.chosen.url, via, asOf, pulledAt }, prints, print: pick.chosen };
  }
  return {
    source: {
      status: "ok",
      grade: "raw",
      usd: { market: pick.chosen.market, low: pick.chosen.low, mid: pick.chosen.mid },
      sgd: null, // filled once FX is known
      asOf,
      pulledAt,
      source: "TCGplayer market price (via TCGCSV, a once-a-day mirror of TCGplayer's API)",
      url: pick.chosen.url,
      via,
      ...(pick.note ? { note: pick.note } : {}),
    },
    prints,
    print: pick.chosen,
  };
}

// --- PriceCharting ---------------------------------------------------------

/** PriceCharting's card mapping, from its API documentation: pennies, loose = ungraded, graded = Grade 9, manual-only = PSA 10. */
export const PRICECHARTING_FIELDS = { raw: "loose-price", psa9: "graded-price", psa10: "manual-only-price" };

/** Pick the PriceCharting product for this card number and variant from a /api/products answer. */
export function choosePricechartingProduct(products, base, variant) {
  const list = (products || []).filter((p) => p && /one piece/i.test(String(p["console-name"] || "")));
  const byNumber = list.filter((p) => String(p["product-name"] || "").toUpperCase().includes(base));
  if (!byNumber.length) return null;
  const wantsAlt = variant !== "base";
  const alt = byNumber.filter((p) => /alternate|parallel|manga|\bsp\b|special/i.test(String(p["product-name"] || "")));
  const plain = byNumber.filter((p) => !alt.includes(p));
  const pool = wantsAlt ? alt : plain;
  return pool[0] || (wantsAlt ? null : byNumber[0]);
}

async function pricechartingSource(q, env, deps, now, printName) {
  const token = env.PRICECHARTING_TOKEN;
  if (!token) {
    return { status: "not_configured", note: "Needs PRICECHARTING_TOKEN (PriceCharting's paid API). Set it with `npx wrangler secret put PRICECHARTING_TOKEN --config worker/wrangler.toml`. Until then no PriceCharting figure is shown.", grade: q.grade, url: searchUrl(q, printName) };
  }
  const fetchFn = deps.fetch || fetch;
  const query = `one piece ${q.card}${printName ? ` ${printName}` : ""}`;
  try {
    const r = await fetchFn(`${PRICECHARTING}/api/products?t=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return { status: "unavailable", grade: q.grade, note: `PriceCharting answered ${r.status}.`, url: searchUrl(q, printName), pulledAt: now };
    const body = await r.json();
    if (body.status !== "success") return { status: "unavailable", grade: q.grade, note: `PriceCharting: ${String(body["error-message"] || body.status).slice(0, 120)}`, url: searchUrl(q, printName), pulledAt: now };
    const product = choosePricechartingProduct(body.products, q.card, q.variant);
    if (!product) return { status: "unavailable", grade: q.grade, note: `PriceCharting lists no ${q.variant === "base" ? "base" : q.variant} print for ${q.card}.`, url: searchUrl(q, printName), pulledAt: now };
    const field = PRICECHARTING_FIELDS[q.grade];
    const pennies = num(product[field]);
    const url = `${PRICECHARTING}/game/${encodeURIComponent(String(product.id))}`;
    if (pennies == null || pennies <= 0) return { status: "unavailable", grade: q.grade, note: `PriceCharting has no ${GRADE_WORDS[q.grade]} price for ${product["product-name"]}.`, url, pulledAt: now, product: product["product-name"] };
    return {
      status: "ok",
      grade: q.grade,
      usd: { [q.grade === "raw" ? "ungraded" : q.grade]: pennies / 100 },
      sgd: null,
      asOf: now.slice(0, 10),
      pulledAt: now,
      source: `PriceCharting ${GRADE_WORDS[q.grade]} (${field})`,
      product: product["product-name"],
      url,
    };
  } catch (e) {
    return { status: "unavailable", grade: q.grade, note: `PriceCharting could not be read from the Worker: ${String(e.message || e).slice(0, 120)}`, url: searchUrl(q, printName), pulledAt: now };
  }
}

function searchUrl(q, printName) {
  return `${PRICECHARTING}/search-products?type=prices&q=${encodeURIComponent(`one piece ${q.card}${printName ? ` ${printName}` : ""}`)}`;
}

// --- FX (ECB) --------------------------------------------------------------

/** SGD per USD from the ECB daily cube: EUR/SGD ÷ EUR/USD, dated by the cube's time attribute. */
export function parseEcb(xml) {
  const time = /<Cube[^>]*\btime=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
  const usd = /<Cube[^>]*currency=['"]USD['"][^>]*rate=['"]([\d.]+)['"]/.exec(xml);
  const sgd = /<Cube[^>]*currency=['"]SGD['"][^>]*rate=['"]([\d.]+)['"]/.exec(xml);
  if (!time || !usd || !sgd) return null;
  const eurUsd = Number(usd[1]), eurSgd = Number(sgd[1]);
  if (!(eurUsd > 0) || !(eurSgd > 0)) return null;
  return { rate: Math.round((eurSgd / eurUsd) * 10000) / 10000, asOf: time[1], eurUsd, eurSgd };
}

export async function fxSource(env, deps, kv, now) {
  const fetchFn = deps.fetch || fetch;
  try {
    const { value, hit } = await cached(kv, "fx:ecb:v1", FX_TTL_S, async () => {
      const r = await fetchFn(ECB_URL, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`ecb ${r.status}`);
      const parsed = parseEcb(await r.text());
      if (!parsed) throw new Error("ecb shape");
      return { ...parsed, pulledAt: now };
    });
    return { status: "ok", base: "USD", quote: "SGD", rate: value.rate, asOf: value.asOf, pulledAt: value.pulledAt, cached: hit, source: "European Central Bank euro foreign-exchange reference rates (EUR/SGD ÷ EUR/USD)", url: ECB_URL, note: "Not a bank quote." };
  } catch (e) {
    const fb = deps.fxFallback || FX_FALLBACK;
    return { status: "fallback", base: "USD", quote: "SGD", rate: fb.rate, asOf: fb.asOf, pulledAt: null, cached: false, source: `${fb.sourceName} (last table committed to the repo)`, url: fb.sourceUrl, note: `ECB could not be read from the Worker (${String(e.message || e).slice(0, 80)}); this is the last committed ECB table, dated ${fb.asOf}. Not a bank quote.` };
  }
}

// --- assembly --------------------------------------------------------------

function unavailable(note) {
  return { status: "unavailable", grade: "raw", note };
}

function withSgd(block, rate) {
  if (!block || block.status !== "ok" || !block.usd) return block;
  const sgd = {};
  for (const [k, v] of Object.entries(block.usd)) sgd[k] = toSgd(v, rate);
  return { ...block, sgd };
}

/** The one headline figure, when a source carries the grade that was asked for. */
export function headline(q, sources, fx) {
  const pc = sources.pricecharting;
  const tp = sources.tcgplayer;
  if (q.grade === "raw" && tp && tp.status === "ok") {
    return { usd: tp.usd.market, sgd: toSgd(tp.usd.market, fx.rate), grade: "raw", source: "tcgplayer", url: tp.url, asOf: tp.asOf, pulledAt: tp.pulledAt };
  }
  if (pc && pc.status === "ok") {
    const usd = Object.values(pc.usd)[0];
    return { usd, sgd: toSgd(usd, fx.rate), grade: q.grade, source: "pricecharting", url: pc.url, asOf: pc.asOf, pulledAt: pc.pulledAt };
  }
  return null;
}

export async function buildPrice(q, env, deps = {}) {
  const now = deps.now ? deps.now() : new Date().toISOString();
  const kv = env.PRICE_CACHE || env.VISION_CAP || null;
  const [tp, fx] = await Promise.all([tcgplayerSource(q, env, deps, kv, now), fxSource(env, deps, kv, now)]);
  const pc = await pricechartingSource(q, env, deps, now, tp.print ? tp.print.label === "Base" ? "" : tp.print.label : "");
  const sources = {
    tcgplayer: withSgd(tp.source, fx.rate),
    pricecharting: withSgd(pc, fx.rate),
    ebay_sold: { status: "not_configured", note: "Recent sold comps need eBay developer keys with Marketplace Insights access (EBAY_APP_ID, EBAY_CERT_ID). Not wired; nothing is invented in its place." },
    collectr: { status: "unavailable", note: "Collectr publishes no API. Its app reads TCGplayer market daily, which is the tcgplayer block here." },
  };
  const street = headline(q, sources, fx);
  const print = tp.print
    ? { cardNumber: tp.print.cardNumber || `${q.card}${q.print || ""}`, setCode: q.setCode, name: tp.print.name, variant: tp.print.label, tcgplayerProductId: tp.print.productId, url: tp.print.url }
    : null;
  const notes = [];
  if (q.lang !== "EN") notes.push(`Only English prices are available; lang=${q.lang} was asked for and the figures below are EN.`);
  if (!street) notes.push(q.grade === "raw" ? "No raw street figure: TCGplayer could not be read for this print." : `No ${GRADE_WORDS[q.grade]} street figure: PriceCharting is ${sources.pricecharting.status}.`);
  return {
    query: { card: q.card, variant: q.variant, lang: q.lang, grade: q.grade },
    print,
    prints: tp.prints.map((p) => ({ cardNumber: p.cardNumber, label: p.label, tcgplayerProductId: p.productId, marketUsd: p.market, marketSgd: toSgd(p.market, fx.rate), url: p.url })),
    street,
    sources,
    fx,
    notes,
    pulledAt: now,
    disclaimer: DISCLAIMER,
  };
}

/**
 * GET /price and GET /street. Read-only, so a service token is enough. The
 * whole answer is cached for PRICE_TTL_S; `cache.hit` says which it was.
 */
export async function handlePrice(req, env, cors, deps = {}) {
  const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": `private, max-age=${PRICE_TTL_S}`, ...cors } });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const q = parsePriceQuery(new URL(req.url));
  if (q.error) return json({ error: q.error, detail: q.detail }, 400);
  const kv = env.PRICE_CACHE || env.VISION_CAP || null;
  const key = cacheKey(q);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (kv && !fresh) {
    try {
      const hit = await kv.get(key, "json");
      if (hit && typeof hit === "object") return json({ ...hit, cache: { hit: true, ttlSeconds: PRICE_TTL_S } }, 200);
    } catch { /* miss */ }
  }
  const body = await buildPrice(q, env, deps);
  // Only an answer with at least one real figure is worth remembering; an outage should be retried next call.
  const worthCaching = Object.values(body.sources).some((s) => s && s.status === "ok");
  if (kv && worthCaching) {
    try { await kv.put(key, JSON.stringify(body), { expirationTtl: PRICE_TTL_S }); } catch { /* best effort */ }
  }
  return json({ ...body, cache: { hit: false, ttlSeconds: worthCaching ? PRICE_TTL_S : 0 } }, 200);
}
