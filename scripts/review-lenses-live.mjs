#!/usr/bin/env node
/**
 * Live-site shots for the customer-lenses review (Collectr, Bandai, Piecebook).
 * Chrome: /usr/local/bin/google-chrome.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/review/lenses-live')
const CHROME = '/usr/local/bin/google-chrome'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
})

async function open({ width, height, scale }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  })
  const page = await context.newPage()
  return { context, page }
}

async function shot(page, file) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, file), fullPage: true })
  console.log(`  ${file}`)
}

async function go(page, url) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  console.log(`  goto ${url} → ${res?.status()}`)
  await page.waitForTimeout(2500)
  return res
}

const phone = { width: 390, height: 844, scale: 2 }
const wide = { width: 1280, height: 800, scale: 1 }

async function piecebook() {
  const { context, page } = await open(phone)
  await page.addInitScript(() => {
    localStorage.setItem('piecebook.started.v1', new Date().toISOString())
  })
  const base = 'https://najibjuraimi-glitch.github.io/piecebook'
  await go(page, `${base}/belong`)
  await shot(page, 'pb-phone-belong.png')
  await go(page, `${base}/`)
  await shot(page, 'pb-phone-sets.png')
  await go(page, `${base}/sets/OP-09`)
  await shot(page, 'pb-phone-op09.png')
  await go(page, `${base}/learn`)
  await shot(page, 'pb-phone-learn.png')
  await go(page, `${base}/start`)
  await shot(page, 'pb-phone-start.png')
  await go(page, `${base}/decks`)
  await shot(page, 'pb-phone-decks.png')
  await context.close()

  const wideCtx = await open(wide)
  await wideCtx.page.addInitScript(() => {
    localStorage.setItem('piecebook.started.v1', new Date().toISOString())
  })
  await go(wideCtx.page, `${base}/belong`)
  await shot(wideCtx.page, 'pb-wide-belong.png')
  await go(wideCtx.page, `${base}/`)
  await shot(wideCtx.page, 'pb-wide-sets.png')
  await go(wideCtx.page, `${base}/learn`)
  await shot(wideCtx.page, 'pb-wide-learn.png')
  await wideCtx.context.close()
}

async function collectr() {
  const { context, page } = await open(wide)
  await go(
    page,
    'https://app.getcollectr.com/?sortType=price&sortOrder=DESC&cardType=cards&category=68',
  )
  await page.waitForTimeout(4000)
  await shot(page, 'collectr-wide.png')
  await context.close()

  const phoneCtx = await open(phone)
  await go(
    phoneCtx.page,
    'https://app.getcollectr.com/?sortType=price&sortOrder=DESC&cardType=cards&category=68',
  )
  await phoneCtx.page.waitForTimeout(4000)
  await shot(phoneCtx.page, 'collectr-phone.png')
  await phoneCtx.context.close()
}

async function bandai() {
  const { context, page } = await open(wide)
  await go(page, 'https://en.onepiece-cardgame.com/beginners/how-to-play.php')
  await shot(page, 'bandai-howto-wide.png')
  await go(page, 'https://en.onepiece-cardgame.com/rules/')
  await shot(page, 'bandai-rules-wide.png')
  await context.close()

  const phoneCtx = await open(phone)
  await go(phoneCtx.page, 'https://en.onepiece-cardgame.com/beginners/how-to-play.php')
  await shot(phoneCtx.page, 'bandai-howto-phone.png')
  await phoneCtx.context.close()
}

console.log('Collectr')
await collectr()
console.log('Bandai')
await bandai()
console.log('Piecebook')
await piecebook()
await browser.close()
console.log('done')
