#!/usr/bin/env node
/**
 * Phone 390 (deviceScaleFactor 2) and wide 1280 shots of Pre-grade (Phase 11).
 * Against vite preview. Chrome: /usr/local/bin/google-chrome.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { makeSyntheticCard } from '../src/lib/centering.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/pr32')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4192'
const STARTED = 'piecebook.started.v1'

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

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open({ width, height, scale }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
  const page = await context.newPage()
  await page.addInitScript((started) => {
    localStorage.setItem(started, new Date().toISOString())
  }, STARTED)
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

async function fillNami(page) {
  await page.getByRole('button', { name: 'Fill the labelled Nami worksheet' }).click()
  await page.waitForTimeout(200)
}

async function uploadPair(page) {
  const inputs = page.locator('input[type="file"]')
  await inputs.nth(0).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: frontPng })
  await page.waitForTimeout(600)
  await inputs.nth(1).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: backPng })
  await page.waitForTimeout(600)
}

console.log(`Pre-grade shots → ${OUT}`)

{
  const { context, page } = await open({ width: 390, height: 844, scale: 2 })
  await go(page, '/pregrade')
  await shot(page, 'phone-pregrade.png')
  await go(page, '/pregrade/ST01-007')
  await shot(page, 'phone-nami-empty.png')
  await fillNami(page)
  await uploadPair(page)
  await shot(page, 'phone-nami-nogo.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 1280, height: 800, scale: 1 })
  await go(page, '/pregrade')
  await shot(page, 'wide-pregrade.png')
  await go(page, '/pregrade/ST01-007')
  await fillNami(page)
  await uploadPair(page)
  await shot(page, 'wide-nami-nogo.png')
  await context.close()
}

await browser.close()
console.log('done')
