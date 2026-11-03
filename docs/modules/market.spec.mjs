// Market walkthrough — browse (grid / map / filters), item detail, wishlist, buy-via-chat, post an item (real upload),
// seller dashboard + mark sold, move-out bundle, mobile + dark + English shots. Exits 1 on any page error.
//
//   GEOCODE_OFFLINE=1 PORT=4107 DB_PATH=server/data/test-market.db npm run dev -w server
//   VITE_PORT=5107 VITE_API_TARGET=http://127.0.0.1:4107 npx vite --config web/vite.config.ts
//   WEB_PORT=5107 node docs/modules/market.spec.mjs
import { openApp, shot, finish, MOBILE, DESKTOP } from '../tools/shot.mjs';

const WEB_PORT = Number(process.env.WEB_PORT || 5107);
const MODULE = 'market';
const PASSWORD = 'Passw0rd!';
// 1×1 transparent PNG (a real upload through POST /api/uploads)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const errors = [];
const failures = [];

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|tile\.openstreetmap|net::ERR|Failed to load resource/i.test(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
}
async function login(page, email) {
  const res = await page.request.post('/api/auth/login', { data: { email, password: PASSWORD }, headers: { 'X-Requested-With': 'fetch' } });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
  return (await res.json()).data;
}
async function logout(page) {
  await page.request.post('/api/auth/logout', { headers: { 'X-Requested-With': 'fetch' } }).catch(() => {});
}
async function setCampus(context, base) {
  await context.addCookies([{ name: 'campus', value: 'northwestern', url: base }]);
}
async function step(name, fn) {
  try {
    await fn();
    console.log('[ok]', name);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error('[fail]', name, e.message);
  }
}
async function settle(page, ms = 400) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

// ------------------------------------------------------------------ desktop, zh
const { browser, context, page, base } = await openApp({ webPort: WEB_PORT, viewport: DESKTOP, lang: 'zh' });
watch(page, 'desktop');
await setCampus(context, base);

await step('browse grid', async () => {
  await page.goto('/market');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  const cards = await page.locator('article').count();
  if (cards < 12) throw new Error(`expected ≥12 cards, got ${cards}`);
  const sponsored = await page.getByText(/推广|Boosted/).count();
  if (sponsored < 1) throw new Error('no sponsored slot rendered');
  await shot(page, MODULE, 'browse-desktop');
});

await step('browse filters', async () => {
  await page.goto('/market?category=textbooks&sort=price_asc');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  const n = await page.locator('article').count();
  if (n < 3) throw new Error(`textbooks filter returned ${n}`);
  await page.goto('/market?free=1');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  await shot(page, MODULE, 'browse-free-desktop');
});

await step('browse map', async () => {
  await page.goto('/market?view=map');
  await page.waitForSelector('.leaflet-container', { timeout: 20000 });
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page, 1200);
  const pins = await page.locator('.leaflet-marker-icon').count();
  if (pins < 5) throw new Error(`expected pins on the map, got ${pins}`);
  await shot(page, MODULE, 'browse-map-desktop');
});

await step('item detail (anonymous)', async () => {
  await page.goto('/market/mkt-item-24');
  await page.waitForSelector('h1', { timeout: 20000 });
  await settle(page, 800);
  const h1 = await page.locator('h1').first().textContent();
  if (!/iPad/.test(h1 || '')) throw new Error(`unexpected h1: ${h1}`);
  if ((await page.getByText(/相似物品均价|Similar items average/).count()) < 1) throw new Error('price suggestion line missing');
  await shot(page, MODULE, 'detail-desktop');
});

await step('bundle page', async () => {
  await page.goto('/market/bundles/mkt-bundle-xinyi');
  await page.waitForSelector('h1', { timeout: 20000 });
  await settle(page, 600);
  const n = await page.locator('article').count();
  if (n < 4) throw new Error(`bundle items rendered: ${n}`);
  await shot(page, MODULE, 'bundle-desktop');
});

// ---- bob: wishlist + buy via chat
let bob;
await step('login bob', async () => { bob = await login(page, 'bob@u.northwestern.edu'); });

await step('wishlist + buy via chat', async () => {
  await page.goto('/market/mkt-item-08');
  await page.waitForSelector('h1', { timeout: 20000 });
  await settle(page);
  const wish = page.getByRole('button', { name: /加入心愿单|Add to wishlist/ }).first();
  await wish.click();
  await page.waitForSelector('text=/已在心愿单|In your wishlist/', { timeout: 10000 });
  await page.getByRole('button', { name: /私信购买|Buy via chat/ }).first().click();
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.locator('textarea').first().fill('你好，还在吗？周三下午可以在 Tech 面交。');
  await settle(page, 300);
  await shot(page, MODULE, 'detail-contact-modal-desktop');
  await page.getByRole('button', { name: /^发送$|^Send$/ }).click();
  await page.waitForURL(/\/chat\//, { timeout: 15000 });
  await page.goto('/market/wishlist');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  const n = await page.locator('article').count();
  if (n < 1) throw new Error('wishlist empty');
  await shot(page, MODULE, 'wishlist-desktop');
});

await step('logout bob', async () => { await logout(page); });

// ---- alice: post an item (create flow) → dashboard → mark sold → bundle form
let createdId = null;
await step('login alice', async () => { await login(page, 'alice@u.northwestern.edu'); });

await step('post item (create flow)', async () => {
  await page.goto('/post/item?category=kitchen');
  await page.waitForSelector('form', { timeout: 20000 });
  await settle(page);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'kettle.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelectorAll('img[src^="/uploads/"]').length > 0 || document.querySelector('[data-state="done"]'), null, { timeout: 15000 }).catch(() => {});
  await settle(page, 600);
  await page.getByLabel(/^标题|^Title/).fill('小熊电热水壶 1.2L Bear mini kettle');
  await page.getByLabel(/^价格|^Price/).first().fill('14');
  await page.getByLabel(/^描述|^Description/).fill('用了三个月，煮水很快。Three months old, boils fast. Davis St 面交。');
  await page.getByLabel(/地点描述|Landmark/).fill('Davis St Metra 站');
  await settle(page, 500);
  await shot(page, MODULE, 'post-item-desktop');
  await page.getByRole('button', { name: /^发布$|^Post$/ }).click();
  await page.waitForURL(/\/market\/[0-9a-f-]{36}$/, { timeout: 20000 });
  createdId = page.url().split('/').pop();
  await page.waitForSelector('h1', { timeout: 20000 });
  await settle(page, 800);
  const h1 = await page.locator('h1').first().textContent();
  if (!/小熊|Bear/.test(h1 || '')) throw new Error(`created item not shown: ${h1}`);
  await shot(page, MODULE, 'post-item-result-desktop');
});

await step('dashboard + mark sold', async () => {
  await page.goto('/market/mine');
  await page.waitForSelector('li', { timeout: 20000 });
  await settle(page);
  await shot(page, MODULE, 'mine-desktop');
  const row = page.locator('li', { hasText: /CLRS/ }).first();
  await row.getByRole('button', { name: /标记售出|Mark sold/ }).click();
  await page.waitForSelector('[role=dialog]', { timeout: 10000 });
  await settle(page, 600);
  const candidate = page.locator('[role=dialog] [role=radio]', { hasText: /Bob/ }).first();
  if ((await candidate.count()) === 0) throw new Error('buyer picker did not list bob');
  await candidate.click();
  await page.locator('[role=dialog] input[type=number]').fill('60');
  await shot(page, MODULE, 'mine-mark-sold-desktop');
  await page.getByRole('button', { name: /确认售出|Confirm sold/ }).click();
  await page.waitForSelector('text=/已标记为售出|Marked as sold/', { timeout: 10000 });
  await settle(page);
});

await step('bundle form', async () => {
  await page.goto('/market/bundles/new');
  await page.waitForSelector('form', { timeout: 20000 });
  await settle(page, 600);
  await page.getByLabel(/^标题|^Title/).fill('毕业甩卖：Tech 附近公寓 Grad move-out near Tech');
  const boxes = page.locator('form input[type=checkbox]');
  const n = await boxes.count();
  if (n < 1) throw new Error('no bundle candidates');
  await boxes.nth(0).check();
  if (n > 1) await boxes.nth(1).check();
  await settle(page, 300);
  await shot(page, MODULE, 'bundle-form-desktop');
  await page.getByRole('button', { name: /创建打包|Create bundle/ }).click();
  await page.waitForURL(/\/market\/bundles\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await settle(page, 600);
});

await step('logout alice', async () => { await logout(page); });

// ---- english + dark (desktop)
await step('english browse', async () => {
  await context.addCookies([{ name: 'lang', value: 'en', url: base }]);
  await page.goto('/market');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  await shot(page, MODULE, 'browse-desktop-en');
  await context.addCookies([{ name: 'lang', value: 'zh-CN', url: base }]);
});

await step('dark detail', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/market/mkt-item-49');
  await page.waitForSelector('h1', { timeout: 20000 });
  await settle(page, 800);
  await shot(page, MODULE, 'detail-desktop-dark');
  await page.emulateMedia({ colorScheme: 'light' });
});

await finish(browser);

// ------------------------------------------------------------------ mobile, zh
const m = await openApp({ webPort: WEB_PORT, viewport: MOBILE, lang: 'zh' });
watch(m.page, 'mobile');
await setCampus(m.context, m.base);

await step('mobile browse', async () => {
  await m.page.goto('/market');
  await m.page.waitForSelector('article', { timeout: 20000 });
  await settle(m.page);
  await shot(m.page, MODULE, 'browse-mobile');
});
await step('mobile map', async () => {
  await m.page.goto('/market?view=map');
  await m.page.waitForSelector('.leaflet-container', { timeout: 20000 });
  await settle(m.page, 1200);
  await shot(m.page, MODULE, 'browse-map-mobile');
});
await step('mobile detail', async () => {
  await m.page.goto('/market/mkt-item-11');
  await m.page.waitForSelector('h1', { timeout: 20000 });
  await settle(m.page, 800);
  await shot(m.page, MODULE, 'detail-mobile', { fullPage: true });
});
await step('mobile post form', async () => {
  await login(m.page, 'alice@u.northwestern.edu');
  await m.page.goto('/post/item');
  await m.page.waitForSelector('form', { timeout: 20000 });
  await settle(m.page, 600);
  await shot(m.page, MODULE, 'post-item-mobile');
});
await finish(m.browser);

// ------------------------------------------------------------------ summary
console.log('\nsteps failed:', failures.length, failures);
console.log('page errors:', errors.length, errors.slice(0, 10));
process.exit(failures.length || errors.length ? 1 : 0);
