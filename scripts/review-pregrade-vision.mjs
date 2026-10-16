#!/usr/bin/env node
/**
 * Phone 390 (deviceScaleFactor 2) and wide 1280 shots of /pregrade photo check.
 * Mocks VISION_URL/check so Gemini and the daily cap are unused.
 * Against vite preview. Chrome: /usr/local/bin/google-chrome.
 * Run: REVIEW_BASE=http://127.0.0.1:4194 node --experimental-strip-types scripts/review-pregrade-vision.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { makeSyntheticCard } from '../src/lib/centering.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/pregrade-vision')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4194'
const STARTED = 'piecebook.started.v1'
const VISION_CHECK = 'https://piecebook-vision.najibjuraimi.workers.dev/check'

mkdirSync(OUT, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function rgbaToPng(img) {
  const { width, height, data } = img
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const frontPng = rgbaToPng(
  makeSyntheticCard({
    width: 1000,
    height: 1400,
    card: { x: 120, y: 100, w: 760, h: 1064 },
    borders: { left: 120, right: 80, top: 90, bottom: 90 },
  }),
)
const backPng = rgbaToPng(
  makeSyntheticCard({
    width: 1000,
    height: 1400,
    card: { x: 120, y: 100, w: 760, h: 1064 },
    borders: { left: 80, right: 80, top: 80, bottom: 80 },
  }),
)

const MOCK = {
  identify: {
    set_code: 'ST14-003',
    name: 'Sanji',
    parallel_guess: 'base',
    language: 'JP',
    confidence: 0.82,
    read_text: 'Sanji ST14-003',
  },
  condition: {
    corners: { flags: ['whitening'], notes: 'Top-left whitening.' },
    edges: { flags: [], notes: 'Clean from this photo.' },
    surface: { flags: ['scratch'], notes: 'Hairline on the art.' },
    psa10_ruled_out: true,
    reasons: ['Corner whitening', 'Surface scratch'],
  },
  ai_guess: true,
  model: 'gemini-3.8-flash',
  usage: { today: 1, cap: 60 },
  disclaimer: 'AI guess. Photos can rule out a PSA 10 but never confirm one.',
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open({ width, height, scale }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
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
  return { context, page }
}

async function shot(page, file) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, file), fullPage: true })
  console.log(`  ${file}`)
}

async function go(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  if (!res || !res.ok()) throw new Error(`${path}: HTTP ${res?.status()}`)
  await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15_000 })
}

async function uploadAndCheck(page) {
  const files = page.locator('input[type="file"]')
  await files.nth(0).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: frontPng })
  await page.waitForTimeout(200)
  await files.nth(1).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: backPng })
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Check photos' }).click()
  await page.getByText('Piecebook currently only has English card data and prices.').waitFor({ timeout: 20_000 })
}

console.log(`Pre-grade vision shots → ${OUT}`)

{
  const { context, page } = await open({ width: 390, height: 844, scale: 2 })
  await go(page, '/pregrade')
  await shot(page, 'phone-pregrade.png')
  await uploadAndCheck(page)
  await shot(page, 'phone-candidates-jp.png')
  await page.getByText('Piecebook currently only has English card data and prices.').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(OUT, 'phone-candidates-jp-fold.png'), fullPage: false })
  console.log('  phone-candidates-jp-fold.png')
  await page.getByRole('button', { name: 'Confirm this card' }).first().click()
  await page.getByRole('heading', { level: 1, name: 'Sanji' }).waitFor({ timeout: 15_000 })
  await page.getByText('These photos rule out a PSA 10.').waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Replace photo' }).first().waitFor({ timeout: 15_000 })
  await shot(page, 'phone-worksheet.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 1280, height: 800, scale: 1 })
  await go(page, '/pregrade')
  await uploadAndCheck(page)
  await shot(page, 'wide-candidates-jp.png')
  await page.getByText('Piecebook currently only has English card data and prices.').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(OUT, 'wide-candidates-jp-fold.png'), fullPage: false })
  console.log('  wide-candidates-jp-fold.png')
  await page.getByRole('button', { name: 'Confirm this card' }).first().click()
  await page.getByRole('heading', { level: 1, name: 'Sanji' }).waitFor({ timeout: 15_000 })
  await page.getByText('These photos rule out a PSA 10.').waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Replace photo' }).first().waitFor({ timeout: 15_000 })
  await shot(page, 'wide-worksheet.png')
  await context.close()
}

await browser.close()
console.log('done')
