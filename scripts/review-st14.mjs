/**
 * Phone 390 (deviceScaleFactor 2) shot of the ST-14 set grid.
 * Against vite preview. Chrome: /usr/local/bin/google-chrome.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/pr33')
const CHROME = '/usr/local/bin/google-chrome'
const BASE = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4179'
const STARTED = 'piecebook.started.v1'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.addInitScript((started) => {
  localStorage.setItem(started, new Date().toISOString())
}, STARTED)

const res = await page.goto(`${BASE}/sets/ST-14`, { waitUntil: 'networkidle' })
if (!res || !res.ok()) throw new Error(`/sets/ST-14: HTTP ${res?.status()}`)
await page.waitForFunction(
  () => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0 && /ST14-/.test(i.src)).length >= 6,
  { timeout: 20_000 },
)
await page.evaluate(() => {
  const el = [...document.querySelectorAll('img')].find((i) => /ST14-001/.test(i.src))
  el?.closest('li, article, a, div')?.scrollIntoView({ block: 'start' })
})
await page.waitForTimeout(300)
const file = join(OUT, 'phone-st14-grid.png')
await page.screenshot({ path: file, fullPage: false })
console.log(`  ${file}`)
await browser.close()
