// Shared Playwright helper for module walkthrough specs.
// Usage from docs/modules/<key>.spec.mjs:
//   import { openApp, login, shot, finish } from '../tools/shot.mjs'
//   const { browser, page } = await openApp({ webPort: 5101 })
//   await login(page, 'alice@u.northwestern.edu')
//   await page.goto(url('/listings'))  // or page.goto(base + '/listings')
//   await shot(page, 'listings', 'browse-desktop')
//   await finish(browser)
// Playwright is pre-installed globally; never npm-install it. It is resolved with createRequire so the helper works
// whether or not node_modules/playwright is symlinked to the global install (ESM imports ignore NODE_PATH).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function loadPlaywright() {
  const req = createRequire(import.meta.url)
  try { return req('playwright') } catch {}
  try { return req(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')) } catch {}
  throw new Error('playwright not found (expected a global install)')
}
const { chromium } = loadPlaywright()

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DESKTOP = { width: 1280, height: 800 }
export const MOBILE = { width: 390, height: 844 }

export async function openApp({ webPort = 5173, viewport = DESKTOP, lang = 'zh' } = {}) {
  const base = `http://127.0.0.1:${webPort}`
  const browser = await chromium.launch()
  // baseURL makes relative paths work for both page.goto('/x') and page.request.post('/api/x')
  const context = await browser.newContext({ baseURL: base, viewport, deviceScaleFactor: 1, locale: lang === 'zh' ? 'zh-CN' : 'en-US' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text()) })
  return { browser, context, page, base, url: (p) => base + p }
}

// Logs in through the real API so the httpOnly `sid` cookie is set on the browser context.
export async function login(page, email, password = 'Passw0rd!') {
  const res = await page.request.post('/api/auth/login', { data: { email, password }, headers: { 'X-Requested-With': 'fetch' } }).catch(() => null)
  if (!res || !res.ok()) {
    // fall back to the UI form
    await page.goto('/login')
    await page.getByLabel(/email|邮箱/i).fill(email)
    await page.getByLabel(/password|密码/i).fill(password)
    await page.getByRole('button', { name: /log ?in|登录/i }).click()
  }
}

export async function shot(page, moduleKey, name, { fullPage = false } = {}) {
  const dir = path.join(ROOT, 'docs', 'screenshots', moduleKey)
  fs.mkdirSync(dir, { recursive: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(300)
  const file = path.join(dir, `${name}.png`)
  await page.screenshot({ path: file, fullPage })
  console.log('[shot]', file)
  return file
}

export async function finish(browser) {
  await browser.close()
}
