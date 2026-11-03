// Core smoke walkthrough — scaffold routes at desktop + mobile, zh + en, light + dark.
//
//   WEB_PORT=5173 node docs/modules/core.spec.mjs
//
// Env: WEB_PORT (default 5173), CORE_TIMEOUT_MS (per page, default 20000), CORE_FULLPAGE=1 (full-page shots).
// Screenshots go to docs/screenshots/core/. Exit code 1 when any page threw a `pageerror`
// or a visit failed outright; a route that merely renders a 404 / empty state still passes.
//
// Playwright is installed globally. `docs/tools/shot.mjs` imports it as an ES module, which only
// resolves when `playwright` is reachable from the repo (NODE_PATH does not apply to ESM). We try
// shot.mjs first and fall back to an API-compatible local copy that loads playwright via `require`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5173);
const TIMEOUT = Number(process.env.CORE_TIMEOUT_MS || 20000);
const FULLPAGE = process.env.CORE_FULLPAGE === '1';
const MODULE_KEY = 'core';
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots', MODULE_KEY);

// ---------------------------------------------------------------- helpers (shot.mjs or fallback)
async function loadHelpers() {
  try {
    const mod = await import('../tools/shot.mjs');
    return { ...mod, source: 'docs/tools/shot.mjs' };
  } catch (err) {
    const { chromium } = createRequire(import.meta.url)('playwright');
    const DESKTOP = { width: 1280, height: 800 };
    const MOBILE = { width: 390, height: 844 };
    async function openApp({ webPort = 5173, viewport = DESKTOP, lang = 'zh' } = {}) {
      const base = `http://127.0.0.1:${webPort}`;
      const browser = await chromium.launch();
      const context = await browser.newContext({ baseURL: base, viewport, deviceScaleFactor: 1, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
      const page = await context.newPage();
      page.on('pageerror', (e) => console.error('[pageerror]', e.message));
      page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text()); });
      return { browser, context, page, base, url: (p) => base + p };
    }
    async function login(page, email, password = 'Passw0rd!') {
      const res = await page.request.post('/api/auth/login', { data: { email, password }, headers: { 'X-Requested-With': 'fetch' } }).catch(() => null);
      if (!res || !res.ok()) {
        await page.goto('/login');
        await page.getByLabel(/email|邮箱/i).fill(email);
        await page.getByLabel(/password|密码/i).fill(password);
        await page.getByRole('button', { name: /log ?in|登录/i }).click();
      }
    }
    async function shot(page, moduleKey, name, { fullPage = false } = {}) {
      const dir = path.join(ROOT, 'docs', 'screenshots', moduleKey);
      fs.mkdirSync(dir, { recursive: true });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(300);
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file, fullPage });
      console.log('[shot]', file);
      return file;
    }
    async function finish(browser) { await browser.close(); }
    return { openApp, login, shot, finish, DESKTOP, MOBILE, source: `fallback (${err.code || err.message})` };
  }
}

// ---------------------------------------------------------------- route plan
const PUBLIC_ROUTES = [
  ['/', 'home'],
  ['/welcome', 'welcome'],
  ['/login', 'login'],
];
const AUTHED_ROUTES = [
  ['/', 'home-authed'],
  ['/settings', 'settings'],
  ['/u/:aliceId', 'profile'],
  ['/notifications', 'notifications'],
  ['/dev/mailbox', 'dev-mailbox'],
  ['/search?q=a', 'search'],
];
const MODULE_ROUTES = [
  ['/listings', 'listings'],
  ['/wanted', 'wanted'],
  ['/chat', 'chat'],
  ['/verify', 'verify'],
  ['/map', 'map'],
  ['/shuttle', 'shuttle'],
  ['/market', 'market'],
  ['/buddy', 'buddy'],
  ['/pricing', 'pricing'],
  ['/admin', 'admin'],
];

// ---------------------------------------------------------------- run
const results = []; // { name, route, viewport, ok, ms, errors: [], note }
let pageErrors = []; // collected for the page currently visited

async function visit(page, shot, route, name, viewportLabel) {
  const started = Date.now();
  pageErrors = [];
  const entry = { name: `${name}-${viewportLabel}`, route, viewport: viewportLabel, ok: true, ms: 0, errors: [], note: '' };
  try {
    const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    if (resp && resp.status() >= 500) entry.note = `HTTP ${resp.status()}`;
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => { entry.note += ' (networkidle timeout)'; });
    // Let React Query settle and Leaflet lay out before the shot.
    await page.waitForSelector('#root > *', { timeout: TIMEOUT }).catch(() => { entry.note += ' (root empty)'; });
    await page.waitForTimeout(400);
    await shot(page, MODULE_KEY, entry.name, { fullPage: FULLPAGE });
    const title = await page.title().catch(() => '');
    entry.note = `${title}${entry.note ? ' ' + entry.note : ''}`.trim();
  } catch (err) {
    entry.ok = false;
    entry.errors.push(`visit failed: ${err.message.split('\n')[0]}`);
    await page.screenshot({ path: path.join(OUT_DIR, `${entry.name}-FAILED.png`) }).catch(() => {});
  }
  if (pageErrors.length) {
    entry.ok = false;
    entry.errors.push(...pageErrors.map((e) => `pageerror: ${e}`));
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  console.log(`${entry.ok ? 'ok  ' : 'FAIL'} ${entry.viewport.padEnd(7)} ${route.padEnd(20)} ${entry.ms}ms ${entry.note}${entry.errors.length ? '\n     ' + entry.errors.join('\n     ') : ''}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const H = await loadHelpers();
  console.log(`[core.spec] helpers: ${H.source}; web port ${WEB_PORT}; shots -> ${path.relative(ROOT, OUT_DIR)}`);

  const { browser, context, page, base } = await H.openApp({ webPort: WEB_PORT, viewport: H.DESKTOP, lang: 'zh' });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Is the app up at all?
  const probe = await page.request.get('/api/meta/health').catch(() => null);
  if (!probe || !probe.ok()) {
    console.error(`[core.spec] app not reachable at ${base} (GET /api/meta/health ${probe ? probe.status() : 'failed'}). Start it with: npm run dev`);
    await H.finish(browser);
    process.exit(2);
  }

  // 1. Public pages (logged out), desktop.
  for (const [route, name] of PUBLIC_ROUTES) await visit(page, H.shot, route, name, 'desktop');

  // 2. Log in as alice through the API; resolve her id for /u/:id.
  await H.login(page, 'alice@u.northwestern.edu');
  let aliceId = null;
  try {
    const me = await page.request.get('/api/auth/me');
    const body = await me.json();
    aliceId = body?.data?.id ?? null;
    console.log(`[core.spec] logged in as ${body?.data?.email ?? '?'} (${aliceId})`);
  } catch (err) {
    console.error('[core.spec] could not read /api/auth/me:', err.message);
  }
  const resolve = (route) => route.replace(':aliceId', aliceId ?? 'me');

  // 3. Authed core pages + module stub routes, desktop.
  for (const [route, name] of AUTHED_ROUTES) await visit(page, H.shot, resolve(route), name, 'desktop');
  for (const [route, name] of MODULE_ROUTES) await visit(page, H.shot, route, name, 'desktop');

  // 4. One dark-mode and one English shot (DESIGN.md §9 asks for both in walkthroughs).
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { try { localStorage.setItem('theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); } catch {} });
  await visit(page, H.shot, '/', 'home-dark', 'desktop');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => { try { localStorage.setItem('theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); } catch {} });
  await context.addCookies([{ name: 'lang', value: 'en', url: base }]);
  await visit(page, H.shot, '/', 'home-en', 'desktop');
  await visit(page, H.shot, '/listings', 'listings-en', 'desktop');
  await context.addCookies([{ name: 'lang', value: 'zh-CN', url: base }]);

  // 5. Mobile pass (same session, viewport swap).
  await page.setViewportSize(H.MOBILE);
  for (const [route, name] of [...PUBLIC_ROUTES.slice(0, 2), ...AUTHED_ROUTES.slice(1), ...MODULE_ROUTES]) await visit(page, H.shot, resolve(route), name, 'mobile');

  await H.finish(browser);

  // 6. Summary.
  const failed = results.filter((r) => !r.ok);
  const withErrors = results.filter((r) => r.errors.some((e) => e.startsWith('pageerror')));
  console.log('\n[core.spec] summary');
  console.log(`  pages visited: ${results.length}   ok: ${results.length - failed.length}   failed: ${failed.length}   with pageerror: ${withErrors.length}`);
  for (const r of failed) console.log(`  - ${r.name} (${r.route}): ${r.errors.join('; ')}`);
  const summaryFile = path.join(OUT_DIR, 'summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({ webPort: WEB_PORT, at: new Date().toISOString(), results }, null, 2));
  console.log(`  written: ${path.relative(ROOT, summaryFile)}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('[core.spec] fatal:', err);
  process.exit(1);
});
