// Playwright walkthrough for the `listings` module (BRIEF §8.3). Run with the module servers up:
//   GEOCODE_OFFLINE=1 PORT=4101 DB_PATH=server/data/test-listings.db npm run dev -w server
//   VITE_PORT=5101 VITE_API_TARGET=http://127.0.0.1:4101 npx vite --config web/vite.config.ts
//   WEB_PORT=5101 node docs/modules/listings.spec.mjs
// Logs in as alice (L2) through the API, browses (desktop + mobile, map view), opens a detail page (light + dark),
// saves/unsaves, checks /listings/mine and /listings/saved, posts a listing end-to-end through the 5-step wizard
// (geocode → pin → photos → publish → success page) and takes the EN nationwide shot. Exit 1 on any page error.
import { openApp, shot, finish, DESKTOP, MOBILE } from '../tools/shot.mjs';

// Logs in through the API with the CSRF header the scaffold requires on writes (shot.mjs's login omits it and falls back to the UI form).
async function login(page, email, password = 'Passw0rd!') {
  const res = await page.request.post('/api/auth/login', { data: { email, password }, headers: { 'X-Requested-With': 'fetch' } });
  if (!res.ok()) throw new Error(`login ${email} failed: ${res.status()}`);
}

const WEB_PORT = Number(process.env.WEB_PORT ?? 5101);
const MODULE = 'listings';
const errors = [];
const failures = [];

async function step(name, fn) {
  try {
    await fn();
    console.log('[ok]', name);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error('[fail]', name, e.message);
  }
}

function watch(page) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    // OSM tiles are unreachable in the sandbox; everything else is a real error.
    if (m.type() === 'error' && !/ERR_TUNNEL|tile\.openstreetmap|net::ERR/.test(text)) errors.push(`console: ${text.slice(0, 200)}`);
  });
}

async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

const { browser, page, context } = await openApp({ webPort: WEB_PORT, viewport: DESKTOP });
watch(page);

// reachability
const health = await page.request.get('/api/meta/health').catch(() => null);
if (!health || !health.ok()) {
  console.error('app not reachable on', WEB_PORT);
  await finish(browser);
  process.exit(2);
}

await login(page, 'alice@u.northwestern.edu');
// the browse page is campus-scoped; a device without a campus cookie is sent to /welcome
await context.addCookies([{ name: 'campus', value: 'northwestern', url: `http://127.0.0.1:${WEB_PORT}` }]);

let firstId = null;
await step('browse desktop', async () => {
  await page.goto('/listings');
  await settle(page, 1200);
  const cards = page.locator('[data-listing-id]');
  if ((await cards.count()) < 10) throw new Error('expected seeded cards');
  firstId = await cards.first().getAttribute('data-listing-id');
  // hover a card → the map pin becomes hovered (list ↔ map sync)
  await cards.nth(1).hover();
  await page.waitForTimeout(200);
  await shot(page, MODULE, 'browse-desktop');
});

await step('filters + sort + saved search', async () => {
  await page.getByRole('button', { name: '带家具' }).first().click();
  await settle(page);
  await page.getByRole('button', { name: '价格' }).first().click();
  await page.waitForTimeout(300);
  await shot(page, MODULE, 'browse-price-filter');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '保存搜索', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole('textbox').first().fill('Evanston 带家具');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await settle(page);
  const url = new URL(page.url());
  if (!url.searchParams.get('furnished')) throw new Error('furnished filter not in URL');
  await page.goto('/listings?sort=price_asc&bedrooms=1,2&priceMax=150000');
  await settle(page);
  if ((await page.locator('[data-listing-id]').count()) < 1) throw new Error('filtered list empty');
});

await step('detail desktop', async () => {
  await page.goto(`/listings/${firstId}`);
  await page.locator('h1').first().waitFor({ timeout: 15000 });
  await settle(page, 1200);
  if (!(await page.locator('h1').first().textContent())) throw new Error('no title');
  await shot(page, MODULE, 'detail-desktop');
  await page.getByRole('button', { name: '分享' }).first().click();
  await page.waitForTimeout(400);
  await shot(page, MODULE, 'detail-share');
  await page.keyboard.press('Escape');
});

await step('detail dark', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { localStorage.setItem('theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(300);
  await shot(page, MODULE, 'detail-dark');
  await page.evaluate(() => { localStorage.removeItem('theme'); document.documentElement.setAttribute('data-theme', 'light'); });
  await page.emulateMedia({ colorScheme: 'light' });
});

await step('save / unsave from a non-owner', async () => {
  // bob views alice's listing and saves it
  await login(page, 'bob@u.northwestern.edu');
  await page.goto(`/listings/${firstId}`);
  await settle(page, 800);
  const btn = page.getByRole('button', { name: /收藏/ }).first();
  const before = await btn.getAttribute('aria-pressed');
  await btn.click();
  await page.waitForTimeout(600);
  const after = await btn.getAttribute('aria-pressed');
  if (before === after) throw new Error('save toggle did not change');
  await btn.click(); // back to the original state
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '联系房东' }).first().click();
  await page.waitForTimeout(400);
  await shot(page, MODULE, 'detail-contact');
  await page.keyboard.press('Escape');
  await login(page, 'alice@u.northwestern.edu');
});

await step('my listings + saved', async () => {
  await page.goto('/listings/mine');
  await settle(page, 1000);
  await shot(page, MODULE, 'mine-desktop');
  await page.getByRole('button', { name: /^\d+$/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, MODULE, 'mine-leads');
  await page.keyboard.press('Escape');
  await page.goto('/listings/saved');
  await settle(page);
  if ((await page.locator('[data-listing-id]').count()) < 1) throw new Error('alice should have saved listings');
});

await step('post wizard end-to-end', async () => {
  await page.evaluate(() => localStorage.removeItem('anwo.listings.draft'));
  await page.goto('/post/listing');
  await settle(page);
  await page.getByLabel('地址').first().fill('2020 Ridge Ave');
  await page.getByLabel('邮编').fill('60201');
  await page.getByRole('button', { name: '定位' }).click();
  await page.waitForTimeout(1200);
  await page.getByLabel('街区 / 小区名').fill('West Evanston');
  await shot(page, MODULE, 'wizard-step1');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('标题').fill('Ridge Ave 2B1B 暑期转租 · Playwright 测试房源');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '整个暑假' }).click();
  await page.getByLabel('月租').fill('1450');
  await page.getByLabel('押金').fill('1450');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('描述').fill('Playwright 自动化创建的测试房源。Created by the listings walkthrough spec.');
  await page.getByRole('button', { name: '下一步' }).click();
  // upload a real PNG (a screenshot of the page itself) through the PhotoUploader
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 640, height: 480 } });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: png });
  await page.waitForTimeout(1500);
  await shot(page, MODULE, 'wizard-step5');
  await page.locator('form').getByRole('button', { name: /^发布$/ }).click();
  await page.waitForURL(/\/listings\/[0-9a-f-]+\/success/, { timeout: 15000 });
  await settle(page, 800);
  await shot(page, MODULE, 'post-success');
  const m = /\/listings\/([0-9a-f-]+)\/success/.exec(page.url());
  const res = await page.request.get(`/api/listings/${m[1]}`);
  const body = await res.json();
  if (!body.ok || body.data.status !== 'active') throw new Error('created listing is not active');
  // clean up: remove the test listing so the seed state stays stable for other screenshots
  await page.request.delete(`/api/listings/${m[1]}`, { headers: { 'X-Requested-With': 'fetch' } });
});

await step('nationwide (EN)', async () => {
  await context.addCookies([{ name: 'lang', value: 'en', url: `http://127.0.0.1:${WEB_PORT}` }]);
  await page.goto('/listings?scope=nationwide');
  await settle(page);
  await page.getByRole('radio', { name: /Nationwide/i }).click().catch(() => page.evaluate(() => localStorage.setItem('anwo.scope', 'nationwide')));
  await settle(page, 800);
  await shot(page, MODULE, 'browse-nationwide-en');
  await page.evaluate(() => localStorage.setItem('anwo.scope', 'campus'));
  await context.addCookies([{ name: 'lang', value: 'zh-CN', url: `http://127.0.0.1:${WEB_PORT}` }]);
});

// mobile
await page.setViewportSize(MOBILE);
await step('browse mobile list + map', async () => {
  await page.goto('/listings');
  await settle(page, 1000);
  await shot(page, MODULE, 'browse-mobile');
  await page.getByRole('radio', { name: '地图' }).click();
  await settle(page, 1200);
  await shot(page, MODULE, 'browse-mobile-map');
  await page.getByRole('radio', { name: '列表' }).click();
  await page.getByRole('button', { name: '更多筛选' }).click();
  await page.waitForTimeout(500);
  await shot(page, MODULE, 'browse-mobile-filters');
  await page.keyboard.press('Escape');
});

await step('detail mobile', async () => {
  await page.goto(`/listings/${firstId}`);
  await settle(page, 1000);
  await shot(page, MODULE, 'detail-mobile');
  await page.goto('/listings/mine');
  await settle(page, 800);
  await shot(page, MODULE, 'mine-mobile');
});

await finish(browser);
console.log('\nfailures:', failures.length, '\nerrors:', errors.length);
for (const f of failures) console.log(' -', f);
for (const e of errors) console.log(' -', e);
process.exit(failures.length || errors.length ? 1 : 0);
