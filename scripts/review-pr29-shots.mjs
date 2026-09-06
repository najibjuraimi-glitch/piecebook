#!/usr/bin/env node
/**
 * Phone 390 (deviceScaleFactor 2) and wide 1280 shots of World (9.1).
 * Against vite preview. Chrome: /usr/local/bin/google-chrome.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/pr29')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4173'
const STARTED = 'piecebook.started.v1'
const CUTOFF = 'piecebook.readerCutoff.v1'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
})

async function open({ width, height, scale, cutoff }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  })
  const page = await context.newPage()
  await page.addInitScript(
    ({ started, cutoffKey, cutoff }) => {
      localStorage.setItem(started, new Date().toISOString())
      if (cutoff) localStorage.setItem(cutoffKey, cutoff)
      else localStorage.removeItem(cutoffKey)
    },
    { started: STARTED, cutoffKey: CUTOFF, cutoff },
  )
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
}

console.log(`9.1 shots → ${OUT}`)

{
  const { context, page } = await open({ width: 390, height: 844, scale: 2, cutoff: null })
  await go(page, '/start')
  await shot(page, 'phone-start.png')
  await go(page, '/belong')
  await shot(page, 'phone-world.png')
  await shot(page, 'phone-belong-debut.png')
  await go(page, '/belong/fruits')
  await shot(page, 'phone-fruits-debut.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 390, height: 844, scale: 2, cutoff: 'east-blue' })
  await go(page, '/belong')
  await shot(page, 'phone-belong-east-blue.png')
  await go(page, '/belong/story')
  await shot(page, 'phone-story.png')
  await shot(page, 'phone-story-east-blue.png')
  await go(page, '/belong/people')
  await page.getByText('Loading…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  await shot(page, 'phone-people.png')
  await go(page, '/belong/fruits')
  await shot(page, 'phone-fruits-east-blue.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 1280, height: 800, scale: 1, cutoff: null })
  await go(page, '/start')
  await shot(page, 'wide-start.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 1280, height: 800, scale: 1, cutoff: 'east-blue' })
  await go(page, '/belong')
  await shot(page, 'wide-world.png')
  await shot(page, 'wide-belong-east-blue.png')
  await go(page, '/belong/people')
  await page.getByText('Loading…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  await shot(page, 'wide-people.png')
  await context.close()
}

await browser.close()
console.log('done')
