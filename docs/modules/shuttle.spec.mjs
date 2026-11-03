// shuttle — Playwright walkthrough (BRIEF §8.3). Re-runnable against the seeded test DB.
//
//   # seed:    GEOCODE_OFFLINE=1 DB_PATH=server/data/test-shuttle.db npm run seed -w server -- --modules core,shuttle --force
//   # server:  GEOCODE_OFFLINE=1 PORT=4106 DB_PATH=server/data/test-shuttle.db npm run dev -w server
//   # web:     VITE_PORT=5106 VITE_API_TARGET=http://127.0.0.1:4106 npx vite --config web/vite.config.ts
//   WEB_PORT=5106 node docs/modules/shuttle.spec.mjs
//
// Flows: anonymous browse (Northwestern) · alice: route panel → stop detail with the next-departure countdown ·
// favorites tab · route detail + timetable day switch · mobile browse + stop sheet · "request my campus" create flow
// on a campus without data (Purdue) · admin: create an alert (create flow #2), see it on the public page, deactivate it ·
// dark mode · English route detail. Exit 1 on any `pageerror`, 2 when the app is unreachable.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5106);
const OUT = path.join(ROOT, 'docs', 'screenshots', 'shuttle');
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const H = { 'X-Requested-With': 'fetch' };
const RUN = Date.now().toString(36);

const ROUTE_LOOP = 'seed-shuttle-route-northwestern-campus-loop';
const ROUTE_IC = 'seed-shuttle-route-northwestern-intercampus-shuttle-evanston-chicago';
const STOP_NOYES = 'seed-shuttle-stop-northwestern-noyes';
const STOP_TECH = 'seed-shuttle-stop-northwestern-tech';

async function loadPlaywright() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return createRequire(import.meta.url)('playwright').chromium;
  }
}

const errors = [];
function watch(page, label) {
  page.on('pageerror', (e) => { errors.push(`[${label}] ${e.message}`); console.error('[pageerror]', label, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|tile\.openstreetmap/.test(m.text())) console.error('[console.error]', label, m.text()); });
}
async function shot(page, name, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log('[shot]', path.relative(ROOT, file));
}
async function login(page, email, campusId = 'northwestern') {
  const r = await page.request.post(`${BASE}/api/dev/login-as`, { data: { email }, headers: H });
  if (!r.ok()) throw new Error(`login-as ${email} failed: ${r.status()}`);
  const me = (await r.json()).data;
  // the shell prefers the profile campus over the cookie once logged in; the admin seed account has none
  if (campusId && me.campusId !== campusId) await page.request.patch(`${BASE}/api/users/me`, { data: { campusId }, headers: H }).catch(() => {});
  return me;
}
const assert = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); };

async function newContext(browser, { viewport = DESKTOP, campus = 'northwestern', lang = 'zh-CN', dark = false } = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport, deviceScaleFactor: 1, locale: lang, colorScheme: dark ? 'dark' : 'light' });
  await context.addCookies([
    { name: 'campus', value: campus, url: BASE },
    { name: 'lang', value: lang, url: BASE },
  ]);
  await context.addInitScript((theme) => { try { localStorage.setItem('theme', theme); localStorage.setItem('anwo.scope', JSON.stringify('campus')); } catch {} }, dark ? 'dark' : 'light');
  return context;
}

async function main() {
  const chromium = await loadPlaywright();
  const health = await fetch(`${BASE}/api/meta/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error('app not reachable on', BASE); process.exit(2); }
  const browser = await chromium.launch();
  let createdAlertId = null;

  try {
    // ------------------------------------------------------------ 1. anonymous browse (desktop)
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      watch(page, 'browse-anon');
      await page.goto('/shuttle');
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.getByText('Campus Loop', { exact: true }).first().waitFor();
      assert(await page.locator('[role="region"][aria-label]').count() >= 1, 'alerts banner rendered');
      assert(await page.locator('.leaflet-container').count() === 1, 'map rendered');
      await shot(page, 'browse-desktop');
      await ctx.close();
    }

    // ------------------------------------------------------------ 2. alice: route panel → stop detail → favorites
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      watch(page, 'alice');
      await login(page, 'alice@u.northwestern.edu');
      await page.goto('/shuttle');
      await page.getByText('Campus Loop', { exact: true }).first().click();
      await page.waitForURL(/route=/);
      await page.getByText(/沿途 8 站/).waitFor();
      await shot(page, 'route-panel-desktop');

      // stop detail from the route panel
      await page.locator('li button', { hasText: /Noyes/ }).first().click();
      await page.waitForURL(/stop=/);
      await page.getByRole('heading', { level: 3, name: /下一班/ }).waitFor();
      await page.locator('li:has-text("分钟")').first().waitFor({ timeout: 15000 });
      const countdowns = await page.locator('ul.divide-y li').count();
      assert(countdowns >= 1, `next departures listed (${countdowns})`);
      await shot(page, 'stop-desktop');

      // favorites: Tech is not saved yet → save it through the UI, then the favorites tab lists it
      await page.goto(`/shuttle?stop=${STOP_TECH}`);
      const favBtn = page.getByRole('button', { name: /收藏站点|已收藏/ }).first();
      await favBtn.waitFor();
      const wasSaved = (await favBtn.getAttribute('aria-pressed')) === 'true';
      if (!wasSaved) {
        await favBtn.click();
        await page.waitForTimeout(600);
      }
      const favs = await (await page.request.get(`${BASE}/api/shuttle/favorites`)).json();
      assert(favs.data.stops.some((s) => s.id === STOP_TECH), 'Tech stop is in favorites via API');
      await page.goto('/shuttle?tab=favorites');
      await page.getByText(/收藏的站点/).waitFor();
      await page.getByText(/Tech|科技学院/).first().waitFor();
      await shot(page, 'favorites-desktop');
      // leave the seed state as it was
      if (!wasSaved) await page.request.delete(`${BASE}/api/shuttle/favorites/stop/${STOP_TECH}`, { headers: H });

      // route detail + timetable day switch
      await page.goto(`/shuttle/${ROUTE_IC}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.locator('table').waitFor();
      const weekdayCells = await page.locator('table tbody td').count();
      assert(weekdayCells > 0, 'weekday timetable has cells');
      await shot(page, 'route-detail-desktop');
      await page.getByRole('tab', { name: '周六' }).click().catch(async () => page.getByRole('radio', { name: '周六' }).click());
      await page.waitForTimeout(600);
      await page.locator('table').waitFor();
      const satHeader = await page.locator('table thead th').count();
      assert(satHeader > 1, 'saturday timetable rendered');
      await shot(page, 'route-detail-saturday-desktop');
      await ctx.close();
    }

    // ------------------------------------------------------------ 3. mobile browse + stop sheet
    {
      const ctx = await newContext(browser, { viewport: MOBILE });
      const page = await ctx.newPage();
      watch(page, 'mobile');
      await login(page, 'bob@u.northwestern.edu');
      await page.goto('/shuttle');
      await page.getByText('Campus Loop', { exact: true }).first().waitFor();
      await shot(page, 'browse-mobile');
      await page.getByRole('tab', { name: /站点/ }).click();
      await page.locator('li button', { hasText: /Davis/ }).first().click();
      await page.waitForURL(/stop=/);
      await page.getByRole('dialog').waitFor();
      await page.locator('[role="dialog"] li:has-text("分钟")').first().waitFor({ timeout: 15000 });
      await shot(page, 'stop-sheet-mobile');
      await ctx.close();
    }

    // ------------------------------------------------------------ 4. create flow: request my campus (Purdue has no data)
    {
      const ctx = await newContext(browser, { campus: 'purdue' });
      const page = await ctx.newPage();
      watch(page, 'request');
      await page.goto('/shuttle');
      await page.getByRole('button', { name: /申请添加我的校区/ }).waitFor();
      await shot(page, 'no-data-desktop');
      await page.getByRole('button', { name: /申请添加我的校区/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByLabel(/官方校车页面链接/).fill('https://www.purdue.edu/parking/campus-shuttles/');
      await dialog.getByLabel(/联系邮箱/).fill(`shuttle-spec-${RUN}@purdue.edu`);
      await dialog.getByLabel(/备注/).fill('CityBus Gold Loop / Silver Loop 都是免费的，刷学生证就行。');
      await shot(page, 'request-form-desktop');
      await dialog.getByRole('button', { name: /提交申请/ }).click();
      await dialog.getByText(/申请已提交/).waitFor();
      await shot(page, 'request-success-desktop');
      const reqs = await (await (async () => {
        const p2 = await ctx.newPage();
        await login(p2, 'admin@example.edu');
        const r = await p2.request.get(`${BASE}/api/shuttle/admin/requests?status=open`);
        await p2.close();
        return r;
      })()).json();
      assert(reqs.data.items.some((r) => r.email === `shuttle-spec-${RUN}@purdue.edu`), 'request row created');
      await ctx.close();
    }

    // ------------------------------------------------------------ 5. admin: create an alert, see it live, deactivate
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      watch(page, 'admin');
      await login(page, 'admin@example.edu');
      await page.goto('/shuttle/admin');
      await page.getByRole('heading', { level: 1, name: /校车通知/ }).waitFor();
      await page.getByRole('button', { name: /新建通知/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const title = `Spec alert ${RUN}: Campus Loop skips Davis St after 20:00 tonight.`;
      await dialog.getByLabel(/标题（英文）/).fill(title);
      await dialog.getByLabel(/标题（中文）/).fill(`规格测试 ${RUN}：今晚 20:00 后 Campus Loop 不停靠 Davis 街车站。`);
      await dialog.getByLabel(/正文（中文）/).fill('街区活动封路，请改在 Dempster 街上车。');
      await shot(page, 'admin-alert-form-desktop');
      await dialog.getByRole('button', { name: /发布/ }).click();
      await page.getByText(new RegExp(`规格测试 ${RUN}`)).first().waitFor();
      await shot(page, 'admin-alerts-desktop');
      const list = await (await page.request.get(`${BASE}/api/shuttle/admin/alerts?campusId=northwestern&pageSize=50`)).json();
      const created = list.data.items.find((a) => a.title === title);
      assert(created && created.live, 'created alert is live');
      createdAlertId = created.id;

      // visible on the public page
      await page.goto('/shuttle');
      await page.getByText(new RegExp(`规格测试 ${RUN}`)).first().waitFor();
      await shot(page, 'alert-live-desktop');

      // deactivate through the row menu
      await page.goto('/shuttle/admin');
      const row = page.locator('tr', { hasText: `规格测试 ${RUN}` }).first();
      await row.waitFor();
      await row.getByRole('button', { name: /操作/ }).click();
      await page.getByRole('menuitem', { name: /停用/ }).click();
      await page.waitForTimeout(800);
      const after = await (await page.request.get(`${BASE}/api/shuttle/admin/alerts?campusId=northwestern&pageSize=50`)).json();
      const deactivated = after.data.items.find((a) => a.id === createdAlertId);
      assert(deactivated && !deactivated.isActive, 'alert deactivated');
      // requests tab (mobile stacks the table)
      await page.goto('/shuttle/admin?tab=requests');
      await page.getByText(/Purdue/).first().waitFor();
      await shot(page, 'admin-requests-desktop');
      await ctx.close();
    }

    // ------------------------------------------------------------ 6. dark mode
    {
      const ctx = await newContext(browser, { dark: true });
      const page = await ctx.newPage();
      watch(page, 'dark');
      await login(page, 'alice@u.northwestern.edu');
      await page.goto(`/shuttle?stop=${STOP_NOYES}`);
      await page.locator('li:has-text("分钟")').first().waitFor({ timeout: 15000 });
      await shot(page, 'stop-dark-desktop');
      await ctx.close();
    }

    // ------------------------------------------------------------ 7. English route detail (mobile)
    {
      const ctx = await newContext(browser, { viewport: MOBILE, lang: 'en' });
      const page = await ctx.newPage();
      watch(page, 'en');
      await page.goto(`/shuttle/${ROUTE_LOOP}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.getByText(/Every 20 min/).first().waitFor();
      await shot(page, 'route-detail-en-mobile', { fullPage: true });
      await ctx.close();
    }
  } finally {
    // clean up the spec alert so repeated runs do not pile up
    if (createdAlertId) {
      const ctx = await browser.newContext({ baseURL: BASE });
      const page = await ctx.newPage();
      await login(page, 'admin@example.edu').catch(() => {});
      await page.request.delete(`${BASE}/api/shuttle/admin/alerts/${createdAlertId}`, { headers: H }).catch(() => {});
      await ctx.close();
    }
    await browser.close();
  }

  const summary = { ok: errors.length === 0, errors, run: RUN, at: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  if (errors.length) {
    console.error('page errors:', errors);
    process.exit(1);
  }
  console.log('shuttle spec OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
