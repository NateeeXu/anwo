// End-to-end user journey across every module (integration walkthrough) — screenshots in docs/screenshots/journey/01-… in order.
//
//   WEB_PORT=5173 node docs/modules/journey.spec.mjs        (stack running with a seeded DB; `npm run e2e` runs it too)
//
// New student registers with a .edu address → reads the code in /dev/mailbox → verifies → picks a campus → browses sublets
// (campus, nationwide, map) → opens a listing → messages the host → the host replies from a second browser (EN, dark) →
// posts a wanted request → sees matches → posts an item → joins a buddy group → posts + boosts a listing through the mock
// checkout → wallet → Newcomer Kit partner click (mobile) → admin dashboard (desktop + mobile dark).
// Exit code 1 when a step fails or a page throws.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, DESKTOP, MOBILE } from '../tools/shot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5173);
const OUT = path.join(ROOT, 'docs', 'screenshots', 'journey');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.rmSync(path.join(OUT, f));

const H = { 'X-Requested-With': 'fetch' };
const failures = [];
const pageErrors = [];
let n = 0;
const ts = Date.now().toString(36);
const EMAIL = `journey.${ts}@u.northwestern.edu`;
const PASSWORD = 'Passw0rd!';

function watch(page, who) {
  page.on('pageerror', (e) => { pageErrors.push(`${who}: ${e.message}`); console.error(`[pageerror ${who}]`, e.message); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|tile\.openstreetmap/.test(txt)) return; // OSM tiles are external
    console.error(`[console.error ${who}]`, txt);
  });
}
async function settle(page, ms = 500) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
async function shot(page, name, { fullPage = false } = {}) {
  await settle(page, 400);
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) failures.push(`${name}: horizontal overflow ${overflow}px`);
  const dotted = await page.evaluate(() => (document.body.innerText.match(/\b(?:[a-z]+\.){2,}[a-zA-Z]+\b/g) || []).filter((x) => !/\.(com|edu|org|net|io|svg|png|jpg)$/.test(x)));
  if (dotted.length) failures.push(`${name}: untranslated keys ${dotted.slice(0, 3).join(', ')}`);
  console.log('[shot]', path.relative(ROOT, file));
}
async function step(name, fn) {
  try {
    await fn();
    console.log('[ok]', name);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
    console.error('[fail]', name, e.message.split('\n')[0]);
  }
}
async function api(page, method, url, data) {
  const r = await page.request.fetch(url, { method, data, headers: H });
  const body = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${method} ${url} → ${r.status()} ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return body.data;
}
async function newCtx({ viewport = DESKTOP, lang = 'zh', dark = false, campus = 'northwestern' } = {}) {
  const app = await openApp({ webPort: WEB_PORT, viewport, lang });
  if (dark) await app.page.emulateMedia({ colorScheme: 'dark' });
  const cookies = [{ name: 'lang', value: lang === 'zh' ? 'zh-CN' : 'en', url: app.base }];
  if (campus) cookies.push({ name: 'campus', value: campus, url: app.base });
  await app.context.addCookies(cookies);
  return app;
}
async function loginApi(page, email, password = PASSWORD) {
  return api(page, 'POST', '/api/auth/login', { email, password });
}

// ------------------------------------------------------------------------------------------------ student (desktop · zh · light)
const S = await newCtx({ campus: null });
watch(S.page, 'student');
const sp = S.page;
let conversationId = null;
let hostListingId = null;

await step('first visit → campus picker', async () => {
  await sp.goto('/');
  await sp.waitForURL(/\/welcome/, { timeout: 15000 });
  await shot(sp, 'first-visit-welcome');
});

await step('register with a .edu email', async () => {
  await sp.goto('/register');
  await sp.locator('input[name=name]').fill('林小安 Journey');
  await sp.locator('input[name=email]').fill(EMAIL);
  await sp.locator('input[name=password]').fill(PASSWORD);
  await settle(sp, 600);
  await shot(sp, 'register');
  await sp.locator('form button[type=submit]').click();
  await sp.waitForURL(/\/verify-email/, { timeout: 15000 });
  await shot(sp, 'verify-email-sent');
});

await step('read the code in /dev/mailbox and verify', async () => {
  const box = await S.context.newPage();
  watch(box, 'mailbox');
  await box.goto(`/dev/mailbox?email=${encodeURIComponent(EMAIL)}`);
  await shot(box, 'dev-mailbox');
  const mail = await api(box, 'GET', `/api/dev/mailbox?email=${encodeURIComponent(EMAIL)}`);
  const items = Array.isArray(mail) ? mail : mail.emails ?? mail.items ?? [];
  const code = items.find((m) => m.code)?.code;
  if (!code) throw new Error('no code in the mailbox');
  await box.close();
  await sp.locator('input[autocomplete=one-time-code]').fill(code);
  await sp.locator('form button[type=submit]').last().click();
  await sp.waitForFunction(async () => {
    const r = await fetch('/api/auth/me');
    const j = await r.json();
    return j.ok && j.data.trustLevel >= 1;
  }, null, { timeout: 15000 });
  await shot(sp, 'email-verified');
});

await step('pick campus', async () => {
  await sp.goto('/welcome');
  await sp.getByRole('combobox', { name: /搜索学校或城市/ }).fill('Northwestern');
  await settle(sp, 400);
  await sp.getByRole('option', { name: /Northwestern/ }).first().click();
  await shot(sp, 'pick-campus');
  await sp.getByRole('button', { name: /就是这里|继续/ }).last().click();
  await sp.waitForURL((u) => !u.pathname.startsWith('/welcome'), { timeout: 15000 });
});

await step('browse sublets: campus, nationwide, map', async () => {
  await sp.goto('/listings');
  await sp.waitForSelector('[data-listing-id]', { timeout: 15000 });
  await shot(sp, 'listings-campus');
  await sp.goto('/listings?scope=nationwide');
  const toggle = sp.getByRole('radio', { name: /全美|Nationwide/ }).first();
  if (await toggle.count()) await toggle.click().catch(() => {});
  await sp.waitForSelector('[data-listing-id]', { timeout: 15000 });
  await shot(sp, 'listings-nationwide');
  const campusToggle = sp.getByRole('radio', { name: /Northwestern/ }).first();
  if (await campusToggle.count()) await campusToggle.click().catch(() => {});
  await sp.goto('/map');
  await sp.waitForSelector('[data-testid=map-explore]', { timeout: 15000 });
  await shot(sp, 'map-explore');
});

// host (landlord) in a second browser: English, dark
const HOST = await newCtx({ lang: 'en', dark: true });
watch(HOST.page, 'host');
const hp = HOST.page;
const host = await loginApi(hp, 'landlord@evanstonhomes.com');

await step('open a listing and message the host', async () => {
  const mine = await api(hp, 'GET', `/api/listings?ownerId=${host.id}&pageSize=20`);
  const l = mine.items.find((x) => x.status === 'active');
  if (!l) throw new Error('host has no active listing');
  hostListingId = l.id;
  await sp.goto(`/listings/${l.id}`);
  await sp.waitForSelector('#main h1', { timeout: 15000 });
  await shot(sp, 'listing-detail');
  await sp.getByRole('button', { name: '联系房东' }).first().click();
  const dlg = sp.getByRole('dialog');
  await dlg.locator('textarea').fill('您好！我是西北的新生，想问一下 6 月中可以入住吗？可以视频看房吗？');
  await dlg.getByRole('button', { name: '发送' }).click();
  await sp.waitForURL(/\/chat\/[^/]+$/, { timeout: 15000 });
  conversationId = sp.url().split('/').pop();
  await sp.waitForSelector('[data-message-id]', { timeout: 15000 });
  await shot(sp, 'chat-first-message');
});

await step('host replies from a second browser (EN · dark)', async () => {
  if (!conversationId) throw new Error('no conversation');
  await hp.goto(`/chat/${conversationId}`);
  await hp.waitForSelector('textarea', { timeout: 15000 });
  await hp.locator('textarea').fill('Hi! Yes, mid-June works. Happy to do a video tour tomorrow at 7 pm Central.');
  await hp.keyboard.press('Enter');
  await hp.waitForSelector('[data-message-id]:has-text("video tour")', { timeout: 15000 });
  await shot(hp, 'host-reply-en-dark');
  await sp.waitForSelector('[data-message-id]:has-text("video tour")', { timeout: 20000 });
  await shot(sp, 'student-sees-reply');
});

await step('post a wanted request and see matches', async () => {
  await sp.goto('/post/wanted');
  await sp.waitForSelector('form', { timeout: 20000 });
  await sp.getByLabel('标题').fill('新生找 6 月起 Evanston 一居室 / studio');
  await sp.getByLabel('详细说明').fill('MSCS 新生，安静不吸烟，6 月中入住，住到 8 月底。希望离 Davis 近一点。');
  await sp.getByLabel('最早入住').fill('2027-06-10');
  await sp.getByLabel('最晚入住').fill('2027-06-25');
  await sp.getByLabel('退租时间').fill('2027-08-31');
  const map = sp.locator('.leaflet-container').first();
  await map.waitFor({ timeout: 15000 });
  await map.scrollIntoViewIfNeeded();
  await sp.waitForTimeout(600);
  const box = await map.boundingBox();
  await sp.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await sp.locator('form').getByRole('button', { name: '发布' }).click();
  await sp.waitForURL(/\/wanted\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const id = sp.url().split('/').pop();
  await sp.goto(`/wanted/${id}/matches`);
  await settle(sp, 800);
  await shot(sp, 'wanted-matches');
});

await step('post a second-hand item', async () => {
  await sp.goto('/post/item?category=kitchen');
  await sp.waitForSelector('form', { timeout: 20000 });
  await settle(sp);
  await sp.getByLabel(/^标题/).fill('宜家台灯 + 收纳盒 搬家出');
  await sp.getByLabel(/^价格/).first().fill('15');
  await sp.getByLabel(/^描述/).fill('九成新，6 月前可在 Davis St 面交。');
  await sp.getByLabel(/地点描述/).fill('Davis St Metra 站');
  await sp.locator('form button[type=submit]').click();
  await sp.waitForURL(/\/market\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await sp.waitForSelector('#main h1', { timeout: 20000 });
  await shot(sp, 'item-posted');
});

await step('join a buddy group', async () => {
  const list = await api(sp, 'GET', '/api/buddy/posts?campusId=northwestern&pageSize=50&upcoming=1');
  const post = list.items.find((p) => p.status === 'open' && !p.myMembership && !p.requiresApproval && !p.verifiedOnly);
  if (!post) throw new Error('no joinable buddy post');
  await sp.goto(`/buddy/${post.id}`);
  await sp.waitForSelector('#main h1', { timeout: 15000 });
  await sp.getByRole('button', { name: '加入', exact: true }).first().click();
  const dlg = sp.getByRole('dialog');
  const agree = dlg.getByRole('checkbox');
  if (await agree.count()) await agree.first().check();
  await dlg.getByRole('button', { name: '加入', exact: true }).click();
  await sp.waitForSelector('text=/已加入|打开群聊|群聊/', { timeout: 15000 });
  await shot(sp, 'buddy-joined');
});

await step('post a sublet and boost it through the mock checkout', async () => {
  // photo through the real upload endpoint, then the listing through the same API the wizard uses (wizard UI is covered by listings.spec)
  const png = await sp.screenshot({ clip: { x: 0, y: 0, width: 640, height: 480 } });
  const up = await sp.request.post('/api/uploads', { headers: H, multipart: { purpose: 'listing', file: { name: 'room.png', mimeType: 'image/png', buffer: png } } });
  const upBody = await up.json();
  if (!up.ok()) throw new Error(`upload → ${up.status()} ${JSON.stringify(upBody.error)}`);
  const uploadId = (Array.isArray(upBody.data) ? upBody.data[0] : upBody.data.items?.[0] ?? upBody.data).id;
  const created = await api(sp, 'POST', '/api/listings', {
    title: 'Sherman Ave 单间转租 · 暑假 · Journey', description: '暑假实习期间转租，带家具，步行到校 12 分钟。', propertyType: 'room', listingType: 'sublet',
    address: { line1: '1930 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201' }, lat: 42.0533, lng: -87.6826, campusId: 'northwestern',
    priceCents: 115000, depositCents: 115000, bedrooms: 1, bathrooms: 1, furnished: 'full', availableFrom: '2027-06-15', availableTo: '2027-08-31',
    minTermMonths: 1, leaseType: 'sublease', roommatesCount: 2, genderPref: 'any', petsAllowed: false, parking: 'none', amenities: ['wifi', 'laundry_in_building'],
    photos: [{ uploadId }],
  });
  const id = created.id ?? created.listing?.id;
  if (created.status !== 'active') await api(sp, 'POST', `/api/listings/${id}/publish`);
  await sp.goto(`/listings/${id}`);
  await sp.waitForSelector('#main h1', { timeout: 15000 });
  await sp.getByRole('button', { name: '推广此房源' }).first().click();
  const sheet = sp.getByRole('dialog');
  await sheet.getByRole('radio', { name: /3 天/ }).first().click();
  const wallet = sheet.getByRole('switch', { name: /使用钱包额度/ });
  if (await wallet.count() && (await wallet.getAttribute('aria-checked')) === 'true') await wallet.click();
  await shot(sp, 'boost-sheet');
  await sheet.getByRole('button', { name: /去结账/ }).click();
  await sp.waitForURL(/\/checkout\//, { timeout: 15000 });
  await sp.getByLabel('卡号').fill('4242 4242 4242 4242');
  await sp.getByLabel('有效期').fill('12/30');
  await sp.getByLabel('安全码').fill('123');
  await shot(sp, 'mock-checkout');
  await sp.getByRole('button', { name: /支付 .* 测试模式/ }).click();
  await sp.waitForSelector('h1:has-text("推广已开始")', { timeout: 20000 });
  await shot(sp, 'boost-success');
});

await step('wallet', async () => {
  await sp.goto('/wallet');
  await sp.waitForSelector('#main h1', { timeout: 15000 });
  await shot(sp, 'wallet');
});
await S.browser.close();
await HOST.browser.close();

// ------------------------------------------------------------------------------------------------ same student on mobile: Newcomer Kit
const M = await newCtx({ viewport: MOBILE });
watch(M.page, 'mobile');
await step('newcomer kit partner click (mobile)', async () => {
  await loginApi(M.page, EMAIL);
  await M.page.goto('/kit');
  await M.page.waitForSelector('#main h1', { timeout: 15000 });
  await shot(M.page, 'kit-mobile');
  const link = M.page.locator('a[rel="sponsored noopener"]').first();
  const href = await link.getAttribute('href');
  const r = await M.page.request.get(href, { maxRedirects: 0 });
  if (r.status() !== 302 && r.status() !== 301) throw new Error(`partner go link answered ${r.status()}`);
  await M.page.locator('h3 a[href^="/kit/"]').first().click();
  await M.page.waitForURL(/\/kit\/[^/]+$/, { timeout: 15000 });
  await shot(M.page, 'kit-partner-mobile');
});
await M.browser.close();

// ------------------------------------------------------------------------------------------------ admin
const A = await newCtx();
watch(A.page, 'admin');
await step('admin dashboard (desktop)', async () => {
  await loginApi(A.page, 'admin@example.edu');
  await A.page.goto('/admin');
  await A.page.waitForSelector('#main h1', { timeout: 15000 });
  await settle(A.page, 1000);
  await shot(A.page, 'admin-dashboard');
  await A.page.goto('/admin/revenue');
  await A.page.waitForSelector('#main h1', { timeout: 15000 });
  await shot(A.page, 'admin-revenue');
});
await A.browser.close();
const AM = await newCtx({ viewport: MOBILE, lang: 'en', dark: true });
watch(AM.page, 'admin-mobile');
await step('admin dashboard (mobile · EN · dark)', async () => {
  await loginApi(AM.page, 'admin@example.edu');
  await AM.page.goto('/admin');
  await AM.page.waitForSelector('#main h1', { timeout: 15000 });
  await shot(AM.page, 'admin-mobile-en-dark');
});
await AM.browser.close();

console.log(`\n[journey] ${n} screenshots · ${failures.length} failure(s) · ${pageErrors.length} page error(s)`);
for (const f of failures) console.log('  -', f);
for (const e of pageErrors) console.log('  - pageerror', e);
process.exit(failures.length || pageErrors.length ? 1 : 0);
