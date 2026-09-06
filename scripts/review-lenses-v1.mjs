#!/usr/bin/env node
/**
 * Phone 390 and wide 1280 shots of customer-lenses v1 (Start, Learn, Sets).
 * Against vite preview. Chrome: /usr/local/bin/google-chrome.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/lenses-v2')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4173'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
})

async function open({ width, height, scale, started }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  })
  const page = await context.newPage()
  await page.addInitScript(
    ({ started, flag }) => {
      if (flag) localStorage.setItem(started, new Date().toISOString())
      else localStorage.removeItem(started)
    },
    { started: 'piecebook.started.v1', flag: started },
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

const phone = { width: 390, height: 844, scale: 2 }
const wide = { width: 1280, height: 800, scale: 1 }

async function run(size, prefix) {
  const { context, page } = await open({ ...size, started: false })
  await go(page, '/start')
  await shot(page, `${prefix}-start.png`)
  await context.close()

  const next = await open({ ...size, started: true })
  await go(next.page, '/learn')
  await shot(next.page, `${prefix}-learn.png`)
  await go(next.page, '/')
  await shot(next.page, `${prefix}-sets.png`)
  await next.context.close()
}

await run(phone, 'phone')
await run(wide, 'wide')
await browser.close()
console.log('done')
