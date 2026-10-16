#!/usr/bin/env node
/**
 * Phone 390 (deviceScaleFactor 2) shots of the live-test Nami OP09-070 flow.
 * Mocks VISION_URL/check with the recorded identify payload.
 * Run: REVIEW_BASE=http://127.0.0.1:4195 node --experimental-strip-types scripts/review-pregrade-live.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/pregrade-live')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4195'
const STARTED = 'piecebook.started.v1'
const VISION_CHECK = 'https://piecebook-vision.najibjuraimi.workers.dev/check'
const FRONT = readFileSync(join(ROOT, 'src/lib/fixtures/nami-op09-070-sp-front.jpg'))
const BACK = readFileSync(join(ROOT, 'src/lib/fixtures/nami-op09-070-sp-back.jpg'))

mkdirSync(OUT, { recursive: true })

const MOCK = {
  identify: {
    set_code: 'OP09-070',
    name: 'Nami',
    language: 'EN',
    confidence: 1,
    parallel_guess: 'base',
    read_text: 'Nami OP09-070 SPECIAL',
  },
  condition: {
    corners: { flags: [], notes: '' },
    edges: { flags: [], notes: '' },
    surface: { flags: [], notes: '' },
    psa10_ruled_out: false,
    reasons: [],
  },
  ai_guess: true,
  model: 'gemini-3.8-flash',
  usage: { today: 1, cap: 60 },
  disclaimer: 'AI guess. Photos can rule out a PSA 10 but never confirm one.',
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.addInitScript((started) => {
  localStorage.setItem(started, new Date().toISOString())
}, STARTED)
await page.route(VISION_CHECK, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK),
  })
})

async function shot(file, fullPage = true) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, file), fullPage })
  console.log(`  ${file}`)
}

const res = await page.goto(`${BASE}/pregrade`, { waitUntil: 'networkidle' })
if (!res || !res.ok()) throw new Error(`/pregrade: HTTP ${res?.status()}`)
await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15_000 })

const files = page.locator('input[type="file"]')
await files.nth(0).setInputFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: FRONT })
await page.waitForTimeout(200)
await files.nth(1).setInputFiles({ name: 'back.jpg', mimeType: 'image/jpeg', buffer: BACK })
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Check photos' }).click()
await page.getByText('Read as Nami · OP09-070').waitFor({ timeout: 20_000 })
await page.getByText('no price for this version').first().waitFor({ timeout: 10_000 })
await page.getByText('no price for this version').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
await shot('phone-candidates.png', false)

await page.getByRole('button', { name: 'Confirm this card' }).first().click()
await page.getByRole('heading', { level: 1, name: 'Nami' }).waitFor({ timeout: 15_000 })
await page.getByRole('button', { name: 'Replace photo' }).first().waitFor({ timeout: 20_000 })
await shot('phone-worksheet.png', true)

await browser.close()
console.log(`done → ${OUT}`)
