import { describe, expect, it } from 'vitest'
import { encode as encodeJpeg } from 'jpeg-js'
import { makeSyntheticCard } from '../../src/lib/centering.ts'
import worker, { DEFECT_FLAGS, PROMPTS, answerText, classifyModelError, extractModelResult, firstJsonObject, normaliseResult, stripFences } from '../src/index.js'

// --- recorded generateContent shapes --------------------------------------
// Trimmed from real REST answers: the envelope and part layout are what matter.

const ANSWER = {
  identify: { set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: 'SR', parallel_guess: 'parallel/alt art', language: 'EN', confidence: 0.82 },
  condition: {
    corners: { flags: [], notes: 'Sharp at this resolution.', severity: 'none', confidence: 'high' },
    edges: { flags: ['whitening'], notes: 'Light whitening bottom edge.', severity: 'light', confidence: 'high' },
    surface: { flags: [], notes: 'No scratches visible.', severity: 'none', confidence: 'high' },
    psa10_ruled_out: true,
    reasons: ['edge whitening'],
  },
}
const MINIMAL_ANSWER = { identify: { set_code: 'EB02-010', language: 'EN' } }
const ANSWER_JSON = JSON.stringify(ANSWER)
const usage = (over: Record<string, number> = {}) => ({ promptTokenCount: 1812, candidatesTokenCount: 310, thoughtsTokenCount: 420, totalTokenCount: 2542, ...over })
const candidate = (parts: unknown[], finishReason = 'STOP') => ({ content: { role: 'model', parts }, finishReason, index: 0 })

const SHAPES = {
  /** One text part, pure JSON. The only shape the old parser accepted. */
  clean: { candidates: [candidate([{ text: ANSWER_JSON }])], usageMetadata: usage() },
  /** Thinking model: a thought summary first, a signature-only part, then the answer. */
  thoughtFirst: {
    candidates: [candidate([
      { text: '**Reading the card**\n\nI can see EB02-010 printed bottom-left; the art is not the base print.', thought: true },
      { thoughtSignature: 'CiQ4ZmQ3YjA5Zi1mYjM0LTQ2ZWEtYjA3Yy0xMjM0NTY3ODkwYWI=' },
      { text: ANSWER_JSON, thoughtSignature: 'CiQ4ZmQ3YjA5Zi0y' },
    ])],
    usageMetadata: usage(),
  },
  /** JSON fenced and wrapped in chatter. */
  fenced: { candidates: [candidate([{ text: 'Here is the result:\n```json\n' + ANSWER_JSON + '\n```\nLet me know if you need more.' }])], usageMetadata: usage() },
  /** Answer split across two text parts (seen on long structured outputs). */
  split: { candidates: [candidate([{ text: ANSWER_JSON.slice(0, 120) }, { text: ANSWER_JSON.slice(120) }])], usageMetadata: usage() },
  /** Thinking used the whole budget: empty text, MAX_TOKENS. */
  maxTokensEmpty: { candidates: [candidate([{ text: '' }], 'MAX_TOKENS')], usageMetadata: usage({ candidatesTokenCount: 0, thoughtsTokenCount: 12288 }) },
  /** Ran out of budget mid-answer. */
  maxTokensTruncated: { candidates: [candidate([{ text: ANSWER_JSON.slice(0, 200) }], 'MAX_TOKENS')], usageMetadata: usage({ thoughtsTokenCount: 11800 }) },
  /** Candidate blocked after generation started: no content at all. */
  safety: { candidates: [{ finishReason: 'SAFETY', index: 0, safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'MEDIUM', blocked: true }] }], usageMetadata: usage({ candidatesTokenCount: 0 }) },
  /** Recitation stop: the card text itself tripped the copyright filter. */
  recitation: { candidates: [{ finishReason: 'RECITATION', index: 0 }], usageMetadata: usage({ candidatesTokenCount: 0 }) },
  /** Prompt blocked: no candidates array, only promptFeedback. */
  promptBlocked: { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' }, usageMetadata: { promptTokenCount: 1812, totalTokenCount: 1812 } },
  /** Prose with no JSON. */
  prose: { candidates: [candidate([{ text: 'I cannot read the set code from this image, the corner is cut off.' }])], usageMetadata: usage() },
  /** Truncated JSON but STOP (the Gemini 3 "incomplete JSON" bug). */
  truncatedStop: { candidates: [candidate([{ text: ANSWER_JSON.slice(0, 150) }])], usageMetadata: usage() },
  /** Only thought parts, STOP (the Gemini 3 "zero text parts" bug). */
  thoughtOnly: { candidates: [candidate([{ text: 'Thinking about the corners…', thought: true }])], usageMetadata: usage({ candidatesTokenCount: 0 }) },
  /** Valid JSON that is not our schema. */
  wrongSchema: { candidates: [candidate([{ text: '{"answer":"EB02-010"}' }])], usageMetadata: usage() },
  /** The live Luffy EB02-010 failure after #39: recitation stop, no parts, front-only. */
  recitationLive: { candidates: [{ finishReason: 'RECITATION', index: 0 }], usageMetadata: { promptTokenCount: 1539, totalTokenCount: 1539 } },
  /** Minimal prompt answered. */
  minimal: { candidates: [candidate([{ text: JSON.stringify(MINIMAL_ANSWER) }])], usageMetadata: usage({ candidatesTokenCount: 18 }) },
}

/** Recorded Gemini 400 when the calling colo is in a country Gemini does not serve. */
const GEMINI_REGION_400 = {
  error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' },
}

// --- pure helpers --------------------------------------------------------

describe('classifyModelError', () => {
  it('names the region refusal from the message or the FAILED_PRECONDITION status', () => {
    expect(classifyModelError(400, JSON.stringify(GEMINI_REGION_400))).toMatchObject({ reason: 'region_unsupported', detail: /unavailable from this region right now, try again/ })
    expect(classifyModelError(400, JSON.stringify({ error: { code: 400, message: 'Precondition check failed.', status: 'FAILED_PRECONDITION' } })).reason).toBe('region_unsupported')
    expect(classifyModelError(200, 'User location is not supported for the API use.').reason).toBe('region_unsupported')
  })
  it('separates quota, key and outage problems and keeps the upstream text short', () => {
    expect(classifyModelError(429, JSON.stringify({ error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } })).reason).toBe('model_rate_limited')
    expect(classifyModelError(403, JSON.stringify({ error: { message: 'API key not valid', status: 'PERMISSION_DENIED' } })).reason).toBe('model_auth')
    expect(classifyModelError(503, '<html>upstream connect error</html>')).toMatchObject({ reason: 'model_down', upstream: '<html>upstream connect error</html>' })
    expect(classifyModelError(400, JSON.stringify({ error: { message: 'x'.repeat(500), status: 'INVALID_ARGUMENT' } })).upstream).toHaveLength(200)
    expect(classifyModelError(400, '').reason).toBe('model_http')
  })
})

describe('answerText', () => {
  it('concatenates non-thought text parts in order and skips signature-only parts', () => {
    expect(answerText(SHAPES.thoughtFirst.candidates[0].content.parts)).toBe(ANSWER_JSON)
    expect(answerText(SHAPES.split.candidates[0].content.parts)).toBe(ANSWER_JSON)
    expect(answerText(undefined)).toBe('')
    expect(answerText([{ thought: true, text: 'x' }])).toBe('')
  })
})

describe('stripFences', () => {
  it('removes ```json fences, with or without a closing fence', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripFences('```\n{"a":1}')).toBe('{"a":1}')
    expect(stripFences('  {"a":1}  ')).toBe('{"a":1}')
  })
})

describe('firstJsonObject', () => {
  it('finds the first balanced object even with chatter and braces inside strings', () => {
    expect(firstJsonObject('Sure: {"notes":"a } inside \\" quotes {","n":1} trailing').value).toEqual({ notes: 'a } inside " quotes {', n: 1 })
  })
  it('names the failure', () => {
    expect(firstJsonObject('no braces here').error).toBe('no_json')
    expect(firstJsonObject('{"a": {"b": 1').error).toBe('truncated_json')
    expect(firstJsonObject('{"a": undefined}').error).toBe('invalid_json')
  })
})

describe('extractModelResult', () => {
  it.each(['clean', 'thoughtFirst', 'fenced', 'split'] as const)('parses the %s shape', (name) => {
    const r = extractModelResult(SHAPES[name])
    expect(r.ok).toBe(true)
    expect(r.result).toEqual(ANSWER)
    expect(r.finishReason).toBe('STOP')
  })
  it('describes the part layout and token split without leaking text', () => {
    const r = extractModelResult(SHAPES.thoughtFirst)
    expect(r.parts).toEqual(['thought', 'signature', 'text'])
    expect(r.tokens).toEqual({ prompt: 1812, thoughts: 420, answer: 310 })
    expect(JSON.stringify({ ...r, result: undefined })).not.toContain('Luffy')
  })
  it.each([
    ['maxTokensEmpty', 'max_tokens', 'MAX_TOKENS'],
    ['maxTokensTruncated', 'max_tokens', 'MAX_TOKENS'],
    ['safety', 'blocked', 'SAFETY'],
    ['recitation', 'blocked', 'RECITATION'],
    ['promptBlocked', 'blocked', 'PROMPT_PROHIBITED_CONTENT'],
    ['prose', 'no_json', 'STOP'],
    ['truncatedStop', 'truncated_json', 'STOP'],
    ['thoughtOnly', 'empty_text', 'STOP'],
    ['wrongSchema', 'schema_mismatch', 'STOP'],
  ] as const)('%s → %s', (name, reason, finishReason) => {
    const r = extractModelResult(SHAPES[name])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe(reason)
    expect(r.finishReason).toBe(finishReason)
  })
  it('survives garbage bodies', () => {
    expect(extractModelResult(null)).toMatchObject({ ok: false, reason: 'empty_text', finishReason: 'NONE' })
    expect(extractModelResult({ candidates: [] })).toMatchObject({ ok: false, reason: 'empty_text' })
  })
  it('accepts an identify-only body only when condition is not required', () => {
    expect(extractModelResult(SHAPES.minimal)).toMatchObject({ ok: false, reason: 'schema_mismatch' })
    expect(extractModelResult(SHAPES.minimal, { requireCondition: false })).toMatchObject({ ok: true, result: MINIMAL_ANSWER })
  })
})

// --- prompts and schema: labels, never transcription ----------------------

describe('prompts', () => {
  const walk = (node: any, out: any[] = []): any[] => {
    if (node && typeof node === 'object') {
      out.push(node)
      for (const v of Object.values(node)) walk(v, out)
    }
    return out
  }
  it('never ask the model to write out card text', () => {
    for (const p of Object.values(PROMPTS)) {
      expect(p.text).not.toMatch(/read_text|any text you can read/i)
      expect(p.text).toMatch(/Never transcribe|Do not write out any text/i)
      expect(JSON.stringify(p.schema)).not.toContain('read_text')
    }
  })
  it('keep the schema strict: enums for language, rarity, variant and defect flags', () => {
    const full = PROMPTS.full.schema as any
    expect(full.properties.identify.properties.language.enum).toEqual(['EN', 'JP', 'CN', 'KR', 'FR'])
    expect(full.properties.identify.properties.rarity.enum).toContain('SEC')
    expect(full.properties.identify.properties.parallel_guess.enum).toEqual(['base', 'parallel/alt art', 'manga', 'SP'])
    expect(full.properties.condition.properties.corners.properties.flags.items.enum).toEqual(DEFECT_FLAGS)
    const freeStrings = walk(full).filter((n) => n.type === 'STRING' && !n.enum)
    // The only free-text fields are the short name, the set code and the condition notes/reasons.
    expect(freeStrings).toHaveLength(2 + 3 + 1)
  })
  it('asks for severity and confidence per part as closed enums, never as free text', () => {
    const full = PROMPTS.full.schema as any
    for (const part of ['corners', 'edges', 'surface']) {
      const section = full.properties.condition.properties[part]
      expect(section.properties.severity.enum).toEqual(['none', 'light', 'moderate', 'heavy', 'unclear'])
      expect(section.properties.confidence.enum).toEqual(['high', 'medium', 'low'])
      expect(section.required).toEqual(['flags', 'notes', 'severity', 'confidence'])
    }
    expect(PROMPTS.full.text).toMatch(/severity, one of "none"/)
    expect(PROMPTS.full.text).toMatch(/confidence, one of "high", "medium", "low"/)
    // The prompt still never asks for a grade or a number out of 10.
    expect(PROMPTS.full.text).not.toMatch(/out of 10|grade this|PSA \d+ grade/i)
  })
  it('minimal prompt asks for set code and language only', () => {
    const min = PROMPTS.minimal.schema as any
    expect(Object.keys(min.properties)).toEqual(['identify'])
    expect(Object.keys(min.properties.identify.properties)).toEqual(['set_code', 'language'])
    expect(PROMPTS.minimal.text).not.toMatch(/CONDITION|corners|edges|surface|psa10|whitening/i)
    expect(PROMPTS.minimal.text.length).toBeLessThan(PROMPTS.full.text.length / 3)
  })
})

describe('normaliseResult', () => {
  it('clamps labels to the known sets and keeps a full condition', () => {
    const r = normaliseResult(
      { identify: { set_code: ' eb02-010 ', name: 'Monkey.D.Luffy', rarity: 'XX', parallel_guess: 'alt art', language: 'English', confidence: 1.7 }, condition: { ...ANSWER.condition, edges: { flags: ['whitening', 'made_up'], notes: 'x' } } },
      PROMPTS.full,
    )
    expect(r.identify).toEqual({ set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: null, parallel_guess: null, language: 'EN', confidence: 1, graded_slab: false })
    expect(r.condition.edges.flags).toEqual(['whitening'])
    expect(r.coverage).toBe('full')
  })
  it('clamps severity and confidence to the enums and nulls anything else', () => {
    const r = normaliseResult(
      {
        identify: ANSWER.identify,
        condition: {
          ...ANSWER.condition,
          corners: { flags: [], notes: '', severity: 'Light', confidence: 'high' },
          edges: { flags: [], notes: '', severity: 'heavy', confidence: 'very sure' },
          surface: { flags: [], notes: '' },
        },
      },
      PROMPTS.full,
    )
    expect(r.condition.corners).toEqual({ flags: [], notes: '', severity: null, confidence: 'high' })
    expect(r.condition.edges).toEqual({ flags: [], notes: '', severity: 'heavy', confidence: null })
    expect(r.condition.surface).toEqual({ flags: [], notes: '', severity: null, confidence: null })
  })
  it('fills an empty, nothing-ruled-out condition for an identify-only answer', () => {
    const r = normaliseResult(MINIMAL_ANSWER, PROMPTS.minimal)
    expect(r.coverage).toBe('identify_only')
    expect(r.identify).toMatchObject({ set_code: 'EB02-010', language: 'EN', name: null, parallel_guess: null })
    const empty = { flags: [], notes: '', severity: null, confidence: null }
    expect(r.condition).toEqual({ corners: empty, edges: empty, surface: empty, psa10_ruled_out: false, reasons: [] })
  })
  it('nulls a set code that is not a card number', () => {
    expect(normaliseResult({ identify: { set_code: 'Luffy' } }, PROMPTS.minimal).identify.set_code).toBeNull()
  })
})

// --- /check end to end ---------------------------------------------------

class MemoryKV {
  store = new Map<string, string>()
  async get(name: string) {
    return this.store.get(name) ?? null
  }
  async put(name: string, value: string) {
    this.store.set(name, value)
  }
}

const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
const DAY = new Date().toISOString().slice(0, 10)

function harness(answers: unknown[], opts: { status?: number; body?: unknown; colo?: string } = {}) {
  const kv = new MemoryKV()
  const env = { GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'sk-SECRET-KEY', DAILY_CAP: '60', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: kv }
  const requests: { url: string; body: Record<string, unknown> }[] = []
  const logs: Record<string, unknown>[] = []
  const modelFetch = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) })
    const next = answers[Math.min(requests.length - 1, answers.length - 1)]
    if (opts.status && opts.status >= 400) return new Response(JSON.stringify(opts.body ?? { error: { message: 'upstream sad' } }), { status: opts.status })
    if (next instanceof Error) throw next
    return new Response(typeof next === 'string' ? next : JSON.stringify(next), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const runRequest = (req: Request) =>
    worker.fetch(Object.assign(req, { cf: { colo: opts.colo ?? 'SIN' } }), env, {} as never, { modelFetch, log: (l: Record<string, unknown>) => logs.push(l) })
  const run = (body: Record<string, unknown> = { front: PIXEL }) =>
    runRequest(new Request('https://piecebook-vision.najibjuraimi.workers.dev/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const used = () => Number(kv.store.get(`count:${DAY}`) ?? 0)
  return { run, runRequest, requests, logs, used, kv }
}

describe('/check', () => {
  it('answers 200 for the clean shape and charges one slot', async () => {
    const h = harness([SHAPES.clean])
    const r = await h.run()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.identify).toMatchObject({ set_code: 'EB02-010', language: 'EN' })
    expect(body.usage).toEqual({ today: 1, cap: 60 })
    expect(h.used()).toBe(1)
    expect(h.requests[0].body.generationConfig).toMatchObject({ maxOutputTokens: 12288, responseMimeType: 'application/json' })
  })

  it('says centering was not measured when the request carried none, instead of guessing', async () => {
    const h = harness([SHAPES.clean])
    const body = await (await h.run()).json()
    expect(body.centering).toMatchObject({ source: 'none', front: null, back: null, cannotBeTen: false })
    expect(body.centering.note).toMatch(/not measured/)
    expect(body.centering.note).toMatch(/does not read pixels/)
  })

  it('echoes centering measured on the device, recomputed from the border pixels', async () => {
    const h = harness([SHAPES.clean])
    const r = await h.run({
      front: PIXEL,
      centering: {
        // A caller cannot claim "fine" with these borders: the Worker recomputes.
        front: { left: 62, right: 38, top: 50, bottom: 50, leftRight: '50/50', cannotBeTen: false },
        back: { measured: false, reason: 'short-side', note: 'Back: short side is 448px (need 800).' },
      },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.centering).toMatchObject({
      source: 'device',
      cannotBeTen: true,
      limits: { front: '55/45', back: '75/25' },
      front: { measured: true, leftRight: '62/38', topBottom: '50/50', resolved: true, cannotBeTen: true },
      back: { measured: false, reason: 'short-side' },
    })
    expect(body.centering.verdict).toBe('Cannot be a 10 by centering: front 62/38 left to right is over 55/45.')
    expect(body.centering.note).toBe('Cannot be a 10 by centering: front 62/38 left to right is over 55/45. Back: short side is 448px (need 800).')
    // The model's own condition block is untouched by centering.
    expect(body.condition.psa10_ruled_out).toBe(true)
    // Centering never reaches the model.
    expect(JSON.stringify(h.requests[0].body)).not.toContain('62/38')
  })

  it('drops a malformed centering block rather than inventing a measurement', async () => {
    const h = harness([SHAPES.clean])
    const body = await (await h.run({ front: PIXEL, centering: { front: { left: 'wide', right: 40 }, back: '55/45' } })).json()
    expect(body.centering).toMatchObject({ source: 'none', front: null, back: null, cannotBeTen: false })
    const h2 = harness([SHAPES.clean])
    const body2 = await (await h2.run({ front: PIXEL, centering: { front: { measured: false, reason: 'cannotBeTen' } } })).json()
    expect(body2.centering.front).toBeNull()
  })

  it('reads centering from a multipart field too', async () => {
    const h = harness([SHAPES.clean])
    const fd = new FormData()
    fd.set('front', new Blob([Uint8Array.from(atob(PIXEL.split(',')[1]), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }), 'front.jpg')
    fd.set('centering', JSON.stringify({ front: { left: 50, right: 50, top: 54, bottom: 46 } }))
    const r = await h.runRequest(new Request('https://piecebook-vision.najibjuraimi.workers.dev/check', { method: 'POST', body: fd }))
    expect(r.status).toBe(200)
    expect((await r.json()).centering.front).toMatchObject({ topBottom: '54/46', cannotBeTen: false })
  })

  it('adds AI-estimate scores built from the device centering and the model severities', async () => {
    const h = harness([SHAPES.clean])
    const body = await (await h.run({
      front: PIXEL,
      back: PIXEL,
      centering: {
        front: { left: 52, right: 48, top: 51, bottom: 49 },
        back: { left: 50, right: 50, top: 50, bottom: 50 },
      },
    })).json()
    expect(body.scores).toMatchObject({
      estimate: true,
      label: 'AI estimate, not a grade',
      centering: { part: 'centering', score: 10, confidence: 'high' },
      corners: { part: 'corners', score: 10, low: 9.5, high: 10, confidence: 'high' },
      edges: { part: 'edges', score: 9, low: 8, high: 9.5, confidence: 'high' },
      surface: { part: 'surface', score: 10, confidence: 'high' },
      standards: { url: 'https://www.psacard.com/gradingstandards' },
    })
    // The model said a 10 is ruled out (edge whitening), so the top of the range is capped below 10.
    expect(body.scores.overall).toMatchObject({ low: 8, high: 9.5, text: '8 to 9.5.', tenRuledOut: true, tenRuledOutBy: ['the model saw a clear defect'] })
    expect(body.scores.lowConfidenceReasons).toEqual([])
    // Still one slot charged; scoring is free.
    expect(h.used()).toBe(1)
  })

  it('never shows a confirmed 10: a clean card tops out at "10 not ruled out"', async () => {
    const clean = { ...ANSWER, condition: { ...ANSWER.condition, edges: { flags: [], notes: '', severity: 'none', confidence: 'high' }, psa10_ruled_out: false, reasons: [] } }
    const h = harness([{ candidates: [candidate([{ text: JSON.stringify(clean) }])], usageMetadata: usage() }])
    const body = await (await h.run({ front: PIXEL, back: PIXEL, centering: { front: { left: 50, right: 50, top: 50, bottom: 50 }, back: { left: 50, right: 50, top: 50, bottom: 50 } } })).json()
    expect(body.scores.overall).toMatchObject({ low: 9.5, high: 10, text: '9.5 or better · 10 not ruled out.', tenRuledOut: false })
    expect(JSON.stringify(body.scores)).not.toMatch(/confirmed|guaranteed|is a 10/i)
  })

  it('rules a 10 out from centering alone even when the model saw nothing', async () => {
    const clean = { ...ANSWER, condition: { ...ANSWER.condition, edges: { flags: [], notes: '', severity: 'none', confidence: 'high' }, psa10_ruled_out: false, reasons: [] } }
    const h = harness([{ candidates: [candidate([{ text: JSON.stringify(clean) }])], usageMetadata: usage() }])
    const body = await (await h.run({ front: PIXEL, centering: { front: { left: 60, right: 40, top: 50, bottom: 50 } } })).json()
    expect(body.scores.centering).toMatchObject({ score: 9, confidence: 'medium' })
    expect(body.scores.centering.caveats).toContain('back not measured')
    expect(body.scores.overall).toMatchObject({ high: 9, tenRuledOut: true, tenRuledOutBy: ['centering'] })
  })

  it('marks scores low confidence when the photo was under 800px or glary', async () => {
    const glary = { ...ANSWER, condition: { ...ANSWER.condition, surface: { flags: ['glare'], notes: '', severity: 'unclear', confidence: 'low' } } }
    const h = harness([{ candidates: [candidate([{ text: JSON.stringify(glary) }])], usageMetadata: usage() }])
    const body = await (await h.run({
      front: PIXEL,
      centering: { front: { measured: false, reason: 'short-side', note: 'Front: short side is 600px (need 800).' } },
    })).json()
    expect(body.scores.centering).toMatchObject({ score: null, confidence: 'low' })
    expect(body.scores.surface).toMatchObject({ score: null, confidence: 'low' })
    expect(body.scores.overall.confidence).toBe('low')
    expect(body.scores.lowConfidenceReasons).toEqual(['front photo under 800px', 'glare'])
    expect(body.scores.overall.text).toMatch(/From 2 of 4 parts\./)
  })

  it('scores centering only on an identify-only answer, with no part scores from the model', async () => {
    const h = harness([SHAPES.recitationLive, SHAPES.minimal])
    const body = await (await h.run({ front: PIXEL, centering: { front: { left: 50, right: 50, top: 50, bottom: 50 } } })).json()
    expect(body.coverage).toBe('identify_only')
    expect(body.scores.centering.score).toBe(10)
    for (const part of ['corners', 'edges', 'surface']) expect(body.scores[part].score).toBeNull()
    // Front only, so medium confidence, which pulls the low end down half a point.
    expect(body.scores.overall).toMatchObject({ confidence: 'medium', text: '9.5. From 1 of 4 parts.' })
    expect(h.used()).toBe(1)
  })

  it('never says "back not sent" when the back photo went to the model, even with no centering for it', async () => {
    // Jib's Luffy EB02-010p1: both photos sent, centering block carried none for either side.
    const h = harness([SHAPES.clean])
    const body = await (await h.run({ front: PIXEL, back: PIXEL })).json()
    expect(h.requests[0].body.contents[0].parts.filter((p: Record<string, unknown>) => p.inline_data)).toHaveLength(2)
    expect(body.scores.corners.caveats).not.toContain('back not sent')
    expect(body.scores.edges.caveats).not.toContain('back not sent')
    expect(body.scores.corners.confidence).toBe('high')
    // Back sent and found, but no print edge read: still not "not sent".
    const h2 = harness([SHAPES.clean])
    const body2 = await (await h2.run({
      front: PIXEL,
      back: PIXEL,
      centering: { front: { left: 50, right: 50, top: 50, bottom: 50 }, back: { measured: false, reason: 'no-print-edge' } },
    })).json()
    expect(body2.scores.corners.caveats).toEqual(['back print edge not found'])
    expect(body2.scores.corners.confidence).toBe('low')
    expect(body2.scores.corners.caveats).not.toContain('back not sent')
    expect(body2.scores.centering.caveats).toEqual(['back print edge not found', 'back not measured'])
    // Front only: the caveat is right.
    const h3 = harness([SHAPES.clean])
    const body3 = await (await h3.run({ front: PIXEL })).json()
    expect(body3.scores.corners.caveats).toEqual(['back not sent'])
  })

  it('reports a sub-floor centering block as not measured, never as a 50/50', async () => {
    const h = harness([SHAPES.clean])
    const body = await (await h.run({ front: PIXEL, back: PIXEL, centering: { front: { left: 0, right: 0, top: 0, bottom: 0, leftRight: '50/50', topBottom: '50/50' } } })).json()
    expect(body.centering.front).toMatchObject({ measured: false, reason: 'no-print-edge' })
    expect(body.centering.note).not.toMatch(/50\/50/)
    expect(body.centering.verdict).toBe('Centering was not measured.')
    expect(body.scores.centering.score).toBeNull()
  })

  it('gives no score at all when nothing was measured and the model gave no severities', async () => {
    const h = harness([SHAPES.recitationLive, SHAPES.minimal])
    const body = await (await h.run()).json()
    expect(body.scores.overall).toMatchObject({ low: null, high: null, tenRuledOut: false })
    expect(body.scores.overall.text).toMatch(/^No score/)
  })

  it('keeps the refund on a failed check: no scores, no slot used', async () => {
    const h = harness([SHAPES.prose])
    const r = await h.run({ front: PIXEL, centering: { front: { left: 50, right: 50, top: 50, bottom: 50 } } })
    expect(r.status).toBe(502)
    expect((await r.json()).scores).toBeUndefined()
    expect(h.used()).toBe(0)
  })

  it.each(['thoughtFirst', 'fenced', 'split'] as const)('answers 200 for the %s shape', async (name) => {
    const h = harness([SHAPES[name]])
    const r = await h.run()
    expect(r.status).toBe(200)
    expect((await r.json()).identify.name).toBe('Monkey.D.Luffy')
  })

  it('retries once with a bigger budget on MAX_TOKENS and still charges one slot', async () => {
    const h = harness([SHAPES.maxTokensEmpty, SHAPES.clean])
    const r = await h.run()
    expect(r.status).toBe(200)
    expect(h.requests.map((q) => q.body.generationConfig.maxOutputTokens)).toEqual([12288, 32768])
    expect(h.used()).toBe(1)
    expect(h.logs.filter((l) => l.evt === 'check_model_output').map((l) => l.finishReason)).toEqual(['MAX_TOKENS', 'STOP'])
  })

  it('sends the full prompt with the strict schema and the image after it', async () => {
    const h = harness([SHAPES.clean])
    await h.run()
    const sent = h.requests[0].body as any
    expect(sent.contents[0].parts[0].text).toBe(PROMPTS.full.text)
    expect(sent.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg')
    expect(sent.generationConfig.responseSchema).toEqual(PROMPTS.full.schema)
    expect(JSON.stringify(sent)).not.toContain('read_text')
  })

  it('answers 200 coverage full with clamped labels', async () => {
    const h = harness([SHAPES.clean])
    const body = await (await h.run()).json()
    expect(body.coverage).toBe('full')
    expect(body.identify).toEqual({ set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: 'SR', parallel_guess: 'parallel/alt art', language: 'EN', confidence: 0.82, graded_slab: false })
    expect(body.condition.edges.flags).toEqual(['whitening'])
  })

  it('RECITATION on the full prompt → one minimal retry → 200 identify_only, one slot charged', async () => {
    const h = harness([SHAPES.recitationLive, SHAPES.minimal])
    const r = await h.run()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.coverage).toBe('identify_only')
    expect(body.identify).toMatchObject({ set_code: 'EB02-010', language: 'EN', name: null })
    expect(body.condition.psa10_ruled_out).toBe(false)
    expect(h.requests).toHaveLength(2)
    expect((h.requests[1].body as any).contents[0].parts[0].text).toBe(PROMPTS.minimal.text)
    expect((h.requests[1].body as any).generationConfig.responseSchema).toEqual(PROMPTS.minimal.schema)
    expect(h.used()).toBe(1)
    expect(h.logs.filter((l) => l.evt === 'check_model_output').map((l) => [l.prompt, l.finishReason])).toEqual([['full', 'RECITATION'], ['minimal', 'STOP']])
  })

  it('RECITATION twice → 502 blocked naming the minimal prompt, slot refunded, no third call', async () => {
    const h = harness([SHAPES.recitationLive, SHAPES.recitationLive])
    const r = await h.run()
    expect(r.status).toBe(502)
    const body = await r.json()
    expect(body).toMatchObject({ error: 'unparseable_model_output', reason: 'blocked', finishReason: 'RECITATION', prompt: 'minimal' })
    expect(body.detail).toMatch(/Type the card number/)
    expect(h.requests).toHaveLength(2)
    expect(h.used()).toBe(0)
  })

  it('a SAFETY block is not retried with the minimal prompt', async () => {
    const h = harness([SHAPES.safety, SHAPES.minimal])
    const r = await h.run()
    expect(r.status).toBe(502)
    expect(h.requests).toHaveLength(1)
  })

  it('MAX_TOKENS then RECITATION uses both retries, never a fourth call', async () => {
    const h = harness([SHAPES.maxTokensEmpty, SHAPES.recitationLive, SHAPES.minimal])
    const r = await h.run()
    expect(r.status).toBe(200)
    expect(h.requests.map((q) => [(q.body as any).contents[0].parts[0].text === PROMPTS.minimal.text ? 'minimal' : 'full', (q.body as any).generationConfig.maxOutputTokens])).toEqual([
      ['full', 12288],
      ['full', 32768],
      ['minimal', 32768],
    ])
  })

  it('gives up after the second MAX_TOKENS, says why, and refunds the slot', async () => {
    const h = harness([SHAPES.maxTokensTruncated, SHAPES.maxTokensEmpty])
    const r = await h.run()
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ error: 'unparseable_model_output', status: 200, reason: 'max_tokens', finishReason: 'MAX_TOKENS' })
    expect(h.requests).toHaveLength(2)
    expect(h.used()).toBe(0)
  })

  it.each([
    ['safety', 'blocked'],
    ['promptBlocked', 'blocked'],
    ['prose', 'no_json'],
    ['truncatedStop', 'truncated_json'],
    ['thoughtOnly', 'empty_text'],
    ['wrongSchema', 'schema_mismatch'],
  ] as const)('%s → 502 %s, one call, slot refunded', async (name, reason) => {
    const h = harness([SHAPES[name]])
    const r = await h.run()
    expect(r.status).toBe(502)
    const body = await r.json()
    expect(body).toMatchObject({ error: 'unparseable_model_output', reason })
    expect(typeof body.detail).toBe('string')
    expect(h.requests).toHaveLength(1)
    expect(h.used()).toBe(0)
  })

  it('Gemini 400 "User location is not supported" → 502 region_unsupported with a plain message, slot refunded, colo logged', async () => {
    const h = harness([SHAPES.clean], { status: 400, body: GEMINI_REGION_400, colo: 'SIN' })
    const r = await h.run()
    expect(r.status).toBe(502)
    const body = await r.json()
    expect(body).toMatchObject({
      error: 'model_error',
      status: 400,
      reason: 'region_unsupported',
      detail: 'AI check unavailable from this region right now, try again.',
      colo: 'SIN',
    })
    expect(body.upstream).toBe('FAILED_PRECONDITION: User location is not supported for the API use.')
    expect(h.requests).toHaveLength(1)
    expect(h.used()).toBe(0)
    const line = h.logs.find((l) => l.evt === 'check_model_error')
    expect(line).toMatchObject({ status: 400, reason: 'region_unsupported', colo: 'SIN' })
    expect(JSON.stringify(h.logs)).not.toContain('SECRET')
  })

  it('refunds on an upstream error and on a network drop', async () => {
    const bad = harness([SHAPES.clean], { status: 503 })
    expect((await bad.run()).status).toBe(502)
    expect(bad.used()).toBe(0)
    const drop = harness([new Error('socket hang up')])
    const r = await drop.run()
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ error: 'model_error', status: 0 })
    expect(drop.used()).toBe(0)
  })

  it('never lets the refund push the counter below zero or below other users', async () => {
    const h = harness([SHAPES.prose])
    await h.kv.put(`count:${DAY}`, '5')
    await h.run()
    expect(h.used()).toBe(5)
  })

  it('logs the finish reason and part layout but no key, image or model text', async () => {
    const h = harness([SHAPES.thoughtFirst])
    await h.run()
    const line = h.logs.find((l) => l.evt === 'check_model_output')
    expect(line).toMatchObject({ ok: true, finishReason: 'STOP', parts: ['thought', 'signature', 'text'], tokens: { thoughts: 420 } })
    const all = JSON.stringify(h.logs)
    expect(all).not.toContain('SECRET')
    expect(all).not.toContain('/9j/')
    expect(all).not.toContain('Luffy')
  })

  it('names a slab without asking the model to transcribe the label', () => {
    expect(PROMPTS.full.text).toMatch(/graded_slab: true only for a grading-company slab/)
    expect(PROMPTS.full.text).toMatch(/magnetic holder, or stand is not a slab/)
    expect(PROMPTS.full.text).not.toMatch(/read_text|any text you can read/i)
    expect((PROMPTS.full.schema as { properties: { identify: { properties: { graded_slab: { type: string } } } } }).properties.identify.properties.graded_slab.type).toBe('BOOLEAN')
  })

  it('omits scores when the photo is a graded slab', async () => {
    const slab = { ...ANSWER, identify: { ...ANSWER.identify, graded_slab: true } }
    const h = harness([{ candidates: [candidate([{ text: JSON.stringify(slab) }])], usageMetadata: usage() }])
    const body = await (await h.run({ front: PIXEL, back: PIXEL, centering: { front: { left: 50, right: 50, top: 50, bottom: 50 }, back: { left: 50, right: 50, top: 50, bottom: 50 } } })).json()
    expect(body.identify.graded_slab).toBe(true)
    expect(body.scores).toBeNull()
    expect(body.slab).toBe('This photo shows a graded slab. Piecebook does not pre-grade a card that is already in a slab.')
    expect(JSON.stringify(body.scores)).not.toMatch(/10 not ruled out/)
  })

  it('charges one slot for two attempts that share a checkId, and leaves a failure uncharged', async () => {
    const retry = harness([SHAPES.prose, SHAPES.clean, SHAPES.clean])
    expect((await retry.run({ front: PIXEL, checkId: 'retry-card-01' })).status).toBe(502)
    expect(retry.used()).toBe(0)
    expect((await retry.run({ front: PIXEL, checkId: 'retry-card-01' })).status).toBe(200)
    expect((await retry.run({ front: PIXEL, checkId: 'retry-card-01' })).status).toBe(200)
    expect(retry.used()).toBe(1)
    const two = harness([SHAPES.clean, SHAPES.clean])
    await two.run({ front: PIXEL, checkId: 'attempt-one-aaaa' })
    await two.run({ front: PIXEL, checkId: 'attempt-two-bbbb' })
    expect(two.used()).toBe(2)
  })
})

function cardJpeg(): string {
  const card = makeSyntheticCard({
    width: 1100,
    height: 1540,
    card: { x: 40, y: 50, w: 1020, h: 1440 },
    borders: { left: 56, right: 55, top: 74, bottom: 79 },
  })
  const encoded = encodeJpeg({ width: card.width, height: card.height, data: card.data }, 95)
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString('base64')}`
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('/pregrade', () => {
  const clean = {
    ...ANSWER,
    identify: { set_code: 'EB04-007', name: 'Roronoa Zoro', rarity: 'SP', parallel_guess: 'SP', language: 'EN', confidence: 0.9, graded_slab: false },
    condition: {
      corners: { flags: [], notes: '', severity: 'none', confidence: 'high' },
      edges: { flags: [], notes: '', severity: 'none', confidence: 'high' },
      surface: { flags: [], notes: '', severity: 'none', confidence: 'high' },
      psa10_ruled_out: false,
      reasons: [],
    },
  }
  const shape = { candidates: [candidate([{ text: JSON.stringify(clean) }])], usageMetadata: usage() }

  function run(h: ReturnType<typeof harness>, body: Record<string, unknown>) {
    return h.runRequest(new Request('https://piecebook-vision.najibjuraimi.workers.dev/pregrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
  }

  it('does not 500 when the JPEG cannot be decoded, and still runs the model', async () => {
    const h = harness([SHAPES.clean])
    const r = await run(h, { front: PIXEL, back: PIXEL })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.centering.front).toMatchObject({ measured: false, reason: 'unreadable' })
    expect(body.centering.front.note).toMatch(/could not be read/)
    expect(h.requests).toHaveLength(1)
    expect(h.used()).toBe(1)
  })

  it('leaves a PNG unmeasured and still runs the model', async () => {
    const h = harness([SHAPES.clean])
    const r = await run(h, { front: PNG })
    expect(r.status).toBe(200)
    expect((await r.json()).centering.front).toMatchObject({ measured: false, reason: 'unreadable' })
    expect(h.requests).toHaveLength(1)
  })

  it('measures the JPEG, ignores a client centering block, and gives a back-only verdict for a borderless SP', async () => {
    const jpeg = cardJpeg()
    const h = harness([shape])
    const r = await run(h, {
      front: jpeg,
      back: jpeg,
      centering: { front: { left: 90, right: 10, top: 90, bottom: 10 }, back: { left: 90, right: 10, top: 90, bottom: 10 } },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.centering.front).toMatchObject({ measured: false, reason: 'full-art', note: 'Front centering not applicable (full art)' })
    expect(body.centering.back).toMatchObject({ measured: true, leftRight: '50/50', topBottom: '48/52', cannotBeTen: false })
    expect(body.centering.verdict).toBe('Centering does not rule a 10 out. From the back only.')
    expect(body.centering.note).not.toMatch(/90\/10/)
    expect(body.scores.centering).toMatchObject({ score: 10, confidence: 'high' })
    expect(body.scores.overall.text).toMatch(/10 not ruled out/)
    expect(h.used()).toBe(1)
  })

  it('treats an exact borderless number the same way when the model includes the parallel suffix', async () => {
    const named = { ...clean, identify: { ...clean.identify, set_code: 'EB04-007p2', parallel_guess: 'base' } }
    const h = harness([{ candidates: [candidate([{ text: JSON.stringify(named) }])], usageMetadata: usage() }])
    const body = await (await run(h, { front: cardJpeg(), back: cardJpeg() })).json()
    expect(body.identify.set_code).toBeNull()
    expect(body.centering.front.reason).toBe('full-art')
    expect(body.centering.verdict).toBe('Centering does not rule a 10 out. From the back only.')
  })
})
