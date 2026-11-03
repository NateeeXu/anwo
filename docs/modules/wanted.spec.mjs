// Wanted module walkthrough — browse → detail → matches → create → offer flow, desktop + mobile, zh + en, light + dark.
//
//   WEB_PORT=5102 node docs/modules/wanted.spec.mjs
//
// Prereqs: server on 4102 with DB_PATH=server/data/test-wanted.db seeded (core,listings,wanted) and web on 5102.
// Screenshots go to docs/screenshots/wanted/. Exit code 1 on any `pageerror`, a failed assertion, or a failed visit.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5102);
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const OUT = path.join(ROOT, 'docs', 'screenshots', 'wanted');
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
fs.mkdirSync(OUT, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');
const pageErrors = [];
const consoleErrors = [];
const failures = [];
const shots = [];

async function newPage(browser, { viewport = DESKTOP, lang = 'zh', theme = 'light', campus = 'northwestern' } = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport, deviceScaleFactor: 1, locale: lang === 'zh' ? 'zh-CN' : 'en-US', colorScheme: theme });
  await context.addCookies([
    { name: 'campus', value: campus, url: BASE },
    { name: 'lang', value: lang === 'zh' ? 'zh-CN' : 'en', url: BASE },
  ]);
  await context.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, theme);
  const page = await context.newPage();
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.error('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { consoleErrors.push(m.text()); console.error('[console.error]', m.text().slice(0, 200)); } });
  return { context, page };
}
async function login(page, email, password = 'Passw0rd!') {
  const res = await page.request.post('/api/auth/login', { data: { email, password }, headers: { 'X-Requested-With': 'fetch' } });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
}
async function shot(page, name, opts = {}) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  shots.push(file);
  console.log('[shot]', path.relative(ROOT, file));
}
function expect(cond, msg) { if (!cond) { failures.push(msg); console.error('[assert]', msg); } else console.log('[ok]', msg); }
async function step(name, fn) {
  try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); console.error('[step failed]', name, e.message); }
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- 1. anonymous browse (desktop zh) + map view + filters
await step('browse', async () => {
  const { context, page } = await newPage(browser);
  await page.goto('/wanted');
  await page.waitForSelector('article[data-status]', { timeout: 20000 });
  const cards = await page.locator('article[data-status]').count();
  expect(cards >= 5, `browse lists wanted cards (${cards})`);
  expect(await page.locator('h1.text-h1').first().textContent() !== '', 'browse has an h1');
  await shot(page, 'browse-desktop');
  // budget filter chip opens a popover with the price range
  await page.getByRole('button', { name: /预算/ }).first().click();
  await page.waitForTimeout(300);
  await shot(page, 'browse-filter-budget');
  await page.keyboard.press('Escape');
  // map view
  await page.getByRole('radio', { name: /地图/ }).click();
  await page.waitForSelector('.leaflet-container', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(page, 'browse-map');
  // nationwide scope shows campus lines
  await page.getByRole('radio', { name: /全美/ }).click();
  await page.waitForTimeout(800);
  const nationwideCards = await page.locator('article[data-status]').count();
  expect(nationwideCards >= cards, `nationwide shows at least as many posts (${nationwideCards})`);
  await page.getByRole('radio', { name: /Northwestern/ }).click();
  await context.close();
});

// ---------------------------------------------------------------- 2. seeker (alice): own detail with matches panel, matches page, mine, digest
await step('seeker', async () => {
  const { context, page } = await newPage(browser);
  await login(page, 'alice@u.northwestern.edu');
  await page.goto('/wanted/wseed-w-01');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  await page.waitForSelector('article[data-status]', { timeout: 20000 }); // first MatchRow in the rail
  expect((await page.locator('h1.text-h1').textContent() || '').includes('Davis'), 'detail shows alice’s post title');
  expect(await page.getByText('为你速配').count() > 0, 'owner sees the 为你速配 panel');
  await shot(page, 'detail-owner-matches');
  await page.goto('/wanted/wseed-w-01/matches');
  await page.waitForSelector('article[data-status]', { timeout: 20000 });
  const n = await page.locator('article[data-status]').count();
  expect(n >= 3, `matches page lists ranked listings (${n})`);
  expect(await page.locator('[role="meter"]').count() >= 6, 'first match shows score breakdown bars');
  await shot(page, 'matches-page');
  await page.goto('/wanted/mine');
  await page.waitForSelector('article[data-status]', { timeout: 20000 });
  await shot(page, 'mine');
  await page.goto('/wanted/digest');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'digest');
  await context.close();
});

// ---------------------------------------------------------------- 3. create flow (alice) through the real form
let createdId = null;
await step('create', async () => {
  const { context, page } = await newPage(browser);
  await login(page, 'alice@u.northwestern.edu');
  await page.goto('/post/wanted');
  await page.waitForSelector('form', { timeout: 20000 });
  await page.getByLabel('标题').fill('Playwright 测试：找 2 月起 Davis 附近 studio');
  await page.getByLabel('详细说明').fill('自动化测试创建的求租，带家具 studio，2 月入住，6 月底退租。\nCreated by the walkthrough spec.');
  await page.getByLabel('最早入住').fill('2027-02-01');
  await page.getByLabel('最晚入住').fill('2027-02-20');
  await page.getByLabel('退租时间').fill('2027-06-30');
  // must-have chip + an area circle by clicking the map
  await page.getByRole('button', { name: '带家具', exact: true }).first().click();
  const map = page.locator('.leaflet-container').first();
  await map.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.waitForTimeout(300);
  expect(await page.getByText(/区域 1/).count() > 0, 'map click added an area circle');
  await shot(page, 'post-form', { fullPage: true });
  await page.getByRole('button', { name: '发布' }).click();
  await page.waitForURL(/\/wanted\/[0-9a-f-]{36}$/, { timeout: 20000 });
  createdId = page.url().split('/').pop();
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  expect((await page.locator('h1.text-h1').textContent() || '').includes('Playwright'), 'created post opens its detail page');
  await page.waitForTimeout(800);
  await shot(page, 'post-created');
  await context.close();
});

// ---------------------------------------------------------------- 4. host (chloe): offer my place
await step('offer', async () => {
  const { context, page } = await newPage(browser);
  await login(page, 'chloe.deng@u.northwestern.edu');
  await page.goto('/wanted/wseed-w-19');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  await page.getByRole('button', { name: '我有房源，推荐给 TA' }).click();
  await page.waitForSelector('[role="radio"]', { timeout: 20000 });
  await page.locator('[role="radio"]').first().click();
  await page.getByLabel('打个招呼').fill('你好！我的 1B1B 1 月初可入住，带家具，离 Davis 站 5 分钟，欢迎约看。');
  await shot(page, 'offer-modal');
  await page.getByRole('button', { name: '发送推荐' }).click();
  await page.waitForTimeout(1500);
  expect(await page.getByText('已推荐').count() > 0, 'host sees 已推荐 after offering');
  await shot(page, 'offer-done');
  await page.goto('/wanted/for-my-listings');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, 'for-my-listings');
  await context.close();
});

// ---------------------------------------------------------------- 5. mobile (zh): browse + detail, filter sheet
await step('mobile', async () => {
  const { context, page } = await newPage(browser, { viewport: MOBILE });
  await page.goto('/wanted');
  await page.waitForSelector('article[data-status]', { timeout: 20000 });
  await shot(page, 'browse-mobile');
  await page.getByRole('button', { name: /筛选/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, 'browse-mobile-filters');
  await page.keyboard.press('Escape');
  await page.goto('/wanted/wseed-w-02');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  await shot(page, 'detail-mobile');
  await context.close();
});

// ---------------------------------------------------------------- 6. english + dark
await step('en-dark', async () => {
  const { context, page } = await newPage(browser, { lang: 'en' });
  await page.goto('/wanted/wseed-w-20');
  await page.waitForSelector('h1.text-h1', { timeout: 20000 });
  expect(await page.getByText('Offer my place').count() > 0 || await page.getByText('Log in to offer a place').count() > 0, 'english detail renders English CTA');
  await shot(page, 'detail-en');
  await context.close();
  const dark = await newPage(browser, { theme: 'dark' });
  await login(dark.page, 'alice@u.northwestern.edu');
  await dark.page.goto('/wanted/wseed-w-01/matches');
  await dark.page.waitForSelector('article[data-status]', { timeout: 20000 });
  await shot(dark.page, 'matches-dark');
  await dark.context.close();
});

// ---------------------------------------------------------------- cleanup: delete the created post so re-runs stay tidy
if (createdId) {
  const { context, page } = await newPage(browser);
  await login(page, 'alice@u.northwestern.edu');
  await page.request.delete(`/api/wanted/${createdId}`, { headers: { 'X-Requested-With': 'fetch' } }).catch(() => {});
  await context.close();
}

await browser.close();
console.log(`\n${shots.length} screenshots · ${failures.length} failures · ${pageErrors.length} page errors · ${consoleErrors.length} console errors`);
if (failures.length || pageErrors.length) process.exit(1);
