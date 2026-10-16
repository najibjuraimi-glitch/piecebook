import { describe, expect, it } from 'vitest'
import worker, { DEFECT_FLAGS, PROMPTS, answerText, extractModelResult, firstJsonObject, normaliseResult, stripFences } from '../src/index.js'

// --- recorded generateContent shapes --------------------------------------
// Trimmed from real REST answers: the envelope and part layout are what matter.

const ANSWER = {
  identify: { set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: 'SR', parallel_guess: 'parallel/alt art', language: 'EN', confidence: 0.82 },
  condition: {
    corners: { flags: [], notes: 'Sharp at this resolution.' },
    edges: { flags: ['whitening'], notes: 'Light whitening bottom edge.' },
    surface: { flags: [], notes: 'No scratches visible.' },
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

// --- pure helpers --------------------------------------------------------

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
    expect(r.identify).toEqual({ set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: null, parallel_guess: null, language: 'EN', confidence: 1 })
    expect(r.condition.edges.flags).toEqual(['whitening'])
    expect(r.coverage).toBe('full')
  })
  it('fills an empty, nothing-ruled-out condition for an identify-only answer', () => {
    const r = normaliseResult(MINIMAL_ANSWER, PROMPTS.minimal)
    expect(r.coverage).toBe('identify_only')
    expect(r.identify).toMatchObject({ set_code: 'EB02-010', language: 'EN', name: null, parallel_guess: null })
    expect(r.condition).toEqual({ corners: { flags: [], notes: '' }, edges: { flags: [], notes: '' }, surface: { flags: [], notes: '' }, psa10_ruled_out: false, reasons: [] })
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

function harness(answers: unknown[], opts: { status?: number } = {}) {
  const kv = new MemoryKV()
  const env = { GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'sk-SECRET-KEY', DAILY_CAP: '60', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', VISION_CAP: kv }
  const requests: { url: string; body: Record<string, unknown> }[] = []
  const logs: Record<string, unknown>[] = []
  const modelFetch = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) })
    const next = answers[Math.min(requests.length - 1, answers.length - 1)]
    if (opts.status && opts.status >= 400) return new Response(JSON.stringify({ error: { message: 'upstream sad' } }), { status: opts.status })
    if (next instanceof Error) throw next
    return new Response(typeof next === 'string' ? next : JSON.stringify(next), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const run = (body: Record<string, unknown> = { front: PIXEL }) =>
    worker.fetch(
      new Request('https://piecebook-vision.najibjuraimi.workers.dev/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      env,
      {} as never,
      { modelFetch, log: (l: Record<string, unknown>) => logs.push(l) },
    )
  const used = () => Number(kv.store.get(`count:${DAY}`) ?? 0)
  return { run, requests, logs, used, kv }
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
    expect(body.identify).toEqual({ set_code: 'EB02-010', name: 'Monkey.D.Luffy', rarity: 'SR', parallel_guess: 'parallel/alt art', language: 'EN', confidence: 0.82 })
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
})
