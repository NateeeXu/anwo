// map — Playwright walkthrough (BRIEF §8.3). Re-runnable against the seeded test DB.
//
//   # seed:    GEOCODE_OFFLINE=1 DB_PATH=server/data/test-map.db npm run seed -w server -- --modules core,listings,market,buddy,shuttle,map --force
//   # server:  GEOCODE_OFFLINE=1 PORT=4105 DB_PATH=server/data/test-map.db npm run dev -w server
//   # web:     VITE_PORT=5105 VITE_API_TARGET=http://127.0.0.1:4105 npm run dev -w web
//   WEB_PORT=5105 node docs/modules/map.spec.mjs
//
// Flows (alice, Northwestern): explore page with every layer → layer toggle → POI pin → selection panel with the
// commute card → draw-radius search (preset change) → pan + 「在此区域搜索」 → address search (warmed geocode cache)
// → nationwide campus bubbles → switch to UIUC and back → suggest a place (create flow, alice) → admin approves it and
// creates a POI (create flow #2) → alice gets the bell notification and the place is live on the map → mobile explore +
// drawer + selection → dark mode → English. API contract checks for /layers, /commute, /pois, /reverse, /campus-suggest.
// Exit 1 on any `pageerror` or failed assertion, 2 when the app is unreachable.
import path from 'node:path';
import { openApp, login as apiLogin, shot as takeShot, finish, DESKTOP, MOBILE } from '../tools/shot.mjs';

const ROOT = '/home/user/campus-sublet';
const WEB_PORT = Number(process.env.WEB_PORT || 5105);
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const H = { 'X-Requested-With': 'fetch' };
const RUN = Date.now().toString(36).slice(-5);
void ROOT; void path;

const errors = [];
const consoleErrors = [];
// network noise in the sandbox: OSM tiles are unreachable, favicon probes
const NOISE = /favicon|net::ERR|Failed to load resource|tile\.openstreetmap|WebSocket connection to/;
function watch(page, label) {
  page.on('pageerror', (e) => { errors.push(`[${label}] ${e.message}`); console.error('[pageerror]', label, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) { consoleErrors.push(`[${label}] ${m.text()}`); console.error('[console.error]', label, m.text()); } });
}
const shot = (page, name, opts) => takeShot(page, 'map', name, opts);
const assert = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); };
const api = async (page, method, url, data) => {
  const res = await page.request.fetch(url, { method, data, headers: H });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
};

async function prepareContext(context, { campus = 'northwestern', lang = 'zh-CN', dark = false } = {}) {
  await context.setExtraHTTPHeaders(H);
  await context.addCookies([
    { name: 'campus', value: campus, url: BASE },
    { name: 'lang', value: lang, url: BASE },
  ]);
  await context.addInitScript((theme) => { try { localStorage.setItem('theme', theme); } catch {} }, dark ? 'dark' : 'light');
  return context;
}
async function newContext(browser, { viewport = DESKTOP, campus, lang = 'zh-CN', dark = false } = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport, deviceScaleFactor: 1, locale: lang, colorScheme: dark ? 'dark' : 'light' });
  return prepareContext(context, { campus, lang, dark });
}
async function login(page, email, campusId = 'northwestern') {
  await apiLogin(page, email);
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  if (!me?.id) throw new Error(`login ${email} failed`);
  if (campusId && me.campusId !== campusId) await page.request.patch('/api/users/me', { data: { campusId }, headers: H }).catch(() => {});
  return me;
}
/** Waits for the explore page: map + at least one loaded layer pin. */
async function waitExplore(page) {
  await page.getByTestId('map-explore').waitFor();
  await page.locator('.leaflet-container').waitFor();
  await page.locator('.leaflet-marker-icon').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}
// div icons have no box of their own (iconSize undefined) — interact with the visible pin span inside
const marker = (page, title) => page.locator(`.leaflet-marker-icon[title="${title}"] > span`).first();
/** Selects a pin the way a keyboard user does (DESIGN §4.4: pins are focusable, Enter selects) — dense clusters may sit on top. */
async function pickPin(page, title) {
  const el = page.locator(`.leaflet-marker-icon[title="${title}"]`).first();
  await el.waitFor({ state: 'attached', timeout: 15000 });
  await el.focus();
  await page.keyboard.press('Enter');
}

async function main() {
  const health = await fetch(`${BASE}/api/meta/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error('app not reachable on', BASE); process.exit(2); }
  const app = await openApp({ webPort: WEB_PORT, viewport: DESKTOP, lang: 'zh' });
  const browser = app.browser;
  const suggestionName = `Norbucks Coffee ${RUN}`;

  try {
    // ------------------------------------------------------------ 0. API contract (public)
    {
      const page = app.page;
      const layers = (await api(page, 'GET', '/api/map/layers?campusId=northwestern&bbox=-87.72,42.02,-87.64,42.08')).body.data;
      assert(layers.counts.listings > 0 && layers.counts.pois >= 30 && layers.shuttleStops.length > 0, `layers counts ${JSON.stringify(layers.counts)}`);
      assert(layers.listings.every((p) => p.link.startsWith('/listings/')), 'listing pins link to detail');
      const tooBig = await api(page, 'GET', '/api/map/layers?bbox=-90,40,-85,44');
      assert(tooBig.status === 400 && tooBig.body.error.code === 'BAD_REQUEST', 'bbox > 2° rejected');
      const commute = (await api(page, 'GET', '/api/map/commute?lat=42.0488&lng=-87.6795&campusId=northwestern')).body.data;
      assert(commute.walkMin > 0 && commute.bikeMin > 0 && commute.campus.id === 'northwestern', `commute ${JSON.stringify(commute)}`);
      for (const c of ['uiuc', 'nyu', 'usc']) {
        const pois = (await api(page, 'GET', `/api/map/pois?campusId=${c}`)).body.data;
        assert(pois.length >= 12, `${c} has ≥ 12 POIs (${pois.length})`);
      }
      const grocery = (await api(page, 'GET', '/api/map/pois?campusId=northwestern&category=grocery,transit')).body.data;
      assert(grocery.some((p) => /Whole Foods/.test(p.name)) && grocery.some((p) => /Purple Line/.test(p.name)), 'NU grocery + CTA POIs');
      const suggest = (await api(page, 'GET', '/api/map/campus-suggest?lat=40.73&lng=-73.99')).body.data;
      assert(suggest.suggested?.id === 'nyu', 'campus-suggest picks NYU in Manhattan');
      const stats = (await api(page, 'GET', '/api/map/campus-stats')).body.data;
      assert(stats.campuses.length > 50 && stats.campuses[0].id === 'northwestern', 'campus stats ranked');
      const bounds = (await api(page, 'GET', '/api/map/campus/uiuc/bounds')).body.data;
      assert(bounds.center.lat > 40 && bounds.defaultZoom >= 12, 'campus bounds');
      const anonReverse = await api(page, 'GET', '/api/map/reverse?lat=42.05&lng=-87.68');
      assert(anonReverse.status === 401, 'reverse needs a session');
    }

    // ------------------------------------------------------------ 1. alice desktop: explore, layers, POI + commute
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    watch(page, 'alice-desktop');
    const alice = await login(page, 'alice@u.northwestern.edu');
    const rev = (await api(page, 'GET', '/api/map/reverse?lat=42.0471&lng=-87.6836')).body.data;
    assert(rev.city === 'Evanston' && rev.nearestCampus.id === 'northwestern', `reverse ${JSON.stringify(rev)}`);
    const geo = (await api(page, 'GET', '/api/map/geocode?q=1735%20Chicago%20Ave%2C%20Evanston%2C%20IL%2060201')).body.data;
    assert(geo.results[0].precision === 'rooftop' && geo.results[0].campusSuggestion.suggested.id === 'northwestern', 'geocode cache hit');

    await page.goto('/map');
    await waitExplore(page);
    await page.getByTestId('map-rail').getByRole('heading', { name: /房源/ }).waitFor();
    assert(await page.locator('.leaflet-marker-icon').count() > 20, 'pins rendered');
    await shot(page, 'explore-desktop');

    // layer toggle: turn 二手 off → its group leaves the drawer and the URL records the layers
    const itemsChip = page.getByTestId('map-search-card').getByRole('button', { name: /二手/ });
    await itemsChip.click();
    await page.waitForURL(/layers=/);
    assert((await itemsChip.getAttribute('aria-pressed')) === 'false', 'items layer off');
    assert(await page.getByTestId('map-rail').getByRole('heading', { name: /^二手/ }).count() === 0, 'items group hidden');
    await itemsChip.click();
    await page.waitForURL((u) => !u.search.includes('layers='));

    // POI pin → selection panel with commute tiles
    await pickPin(page, '主图书馆');
    const panel = page.getByTestId('map-selection');
    await panel.waitFor();
    await panel.getByText('到校通勤').waitFor();
    await panel.getByText(/分钟/).first().waitFor();
    await page.waitForURL(/sel=poi/); // selection is part of the shareable URL
    await shot(page, 'poi-commute-desktop');

    // 「以此为圆心」 → draw-radius search around the library, then switch to the 500 m preset
    await panel.getByRole('button', { name: '以此为圆心' }).click();
    const drawBar = page.getByTestId('draw-bar');
    await drawBar.waitFor();
    await page.waitForURL(/[?&]r=/);
    await drawBar.getByRole('radio').first().click(); // smallest preset (500 m, shown in the viewer's unit)
    await page.waitForURL(/r=[^&]*(%2C|,)500(&|$)/); // radius is written to the URL (debounced)
    const inside = await drawBar.innerText();
    assert(/圈内 \d+ 条/.test(inside), `draw count shown (${inside})`);
    await shot(page, 'draw-radius-desktop');
    await drawBar.getByRole('button', { name: '清除圆圈' }).click();
    await page.waitForURL((u) => !/[?&]r=/.test(u.search));

    // close the selection, pan → 「在此区域搜索」
    if (await panel.count()) await panel.getByRole('button', { name: '关闭' }).click().catch(() => {});
    const box = await page.locator('.leaflet-container').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45, { steps: 8 });
    await page.mouse.up();
    const searchArea = page.getByTestId('search-area');
    await searchArea.waitFor();
    await searchArea.click();
    await searchArea.waitFor({ state: 'detached' });

    // address search (warmed cache, rooftop) → search pin + commute
    const box2 = page.getByRole('combobox', { name: /搜地址/ });
    await box2.fill('1735 Chicago Ave, Evanston, IL 60201');
    await box2.press('Enter');
    await panel.getByText('1735 Chicago Ave').waitFor();
    await panel.getByText(/步行|分钟/).first().waitFor();
    await shot(page, 'search-address-desktop');

    // nationwide campus bubbles → UIUC → back to Northwestern
    await page.getByTestId('map-search-card').getByRole('radio', { name: /全美/ }).click();
    const nw = page.getByTestId('nationwide-list');
    await nw.waitFor();
    await page.locator('.anwo-bubble').first().waitFor();
    assert(await page.locator('.anwo-bubble').count() > 50, 'one bubble per campus');
    await page.waitForTimeout(900);
    await shot(page, 'nationwide-desktop');
    await nw.getByRole('button', { name: /厄巴纳/ }).click();
    await page.getByTestId('map-rail').getByText(/伊利诺伊|UIUC/).first().waitFor();
    await marker(page, 'Grainger 工程图书馆').waitFor({ timeout: 15000 });
    await page.getByTestId('map-search-card').getByRole('radio', { name: /全美/ }).click();
    await nw.getByRole('button', { name: /^\d+ 西北大学/ }).click();
    await marker(page, '主图书馆').waitFor({ timeout: 15000 });

    // ------------------------------------------------------------ 2. create flow: alice suggests a place
    await page.getByTestId('ctl-suggest').click();
    const modal = page.getByTestId('suggest-modal');
    await modal.waitFor();
    await modal.getByLabel('英文名称').fill(suggestionName);
    await modal.getByLabel('中文名称').fill(`Norbucks 咖啡 ${RUN}`);
    await modal.getByRole('radio', { name: '餐饮' }).click();
    const mini = modal.locator('.leaflet-container');
    const mb = await mini.boundingBox();
    await page.mouse.click(mb.x + mb.width * 0.62, mb.y + mb.height * 0.4);
    await modal.getByLabel('地址').fill('1999 Campus Dr, Evanston, IL 60208');
    await modal.getByLabel('补充说明').fill('Norris 一楼的咖啡店，期末周开到很晚。');
    await shot(page, 'suggest-modal-desktop');
    await page.getByRole('button', { name: '提交' }).click();
    await page.getByTestId('my-suggestions').getByText(`Norbucks 咖啡 ${RUN}`).waitFor();
    await page.getByTestId('my-suggestions').getByText('审核中').first().waitFor();
    await page.keyboard.press('Escape');

    // ------------------------------------------------------------ 3. admin: approve the suggestion + create a POI
    {
      const actx = await newContext(browser);
      const ap = await actx.newPage();
      watch(ap, 'admin');
      await login(ap, 'admin@example.edu');
      const bell = (await api(ap, 'GET', '/api/notifications?pageSize=5')).body.data.items;
      assert(bell.some((n) => n.title.includes(`Norbucks`)), 'admins notified of the new suggestion');
      await ap.goto('/map/admin');
      const card = ap.getByTestId('suggestion-card').filter({ hasText: `Norbucks 咖啡 ${RUN}` });
      await card.waitFor();
      await shot(ap, 'admin-suggestions-desktop');
      await card.getByRole('button', { name: '通过' }).click();
      await ap.getByText(/已上线/).first().waitFor();

      // POI tab: create a place through the form (create flow #2)
      await ap.getByRole('tab', { name: /校园地点/ }).click();
      await ap.getByText(/个地点/).first().waitFor();
      await ap.getByTestId('poi-new').click();
      const form = ap.getByTestId('poi-form');
      await form.waitFor();
      await form.getByLabel('英文名称').fill(`Evanston Print Shop ${RUN}`);
      await form.getByLabel('中文名称').fill(`打印店 ${RUN}`);
      const fb = await form.locator('.leaflet-container').boundingBox();
      await ap.mouse.click(fb.x + fb.width * 0.4, fb.y + fb.height * 0.55);
      await shot(ap, 'admin-poi-form-desktop');
      await ap.getByRole('button', { name: '保存' }).click();
      await ap.getByText(`打印店 ${RUN}`).first().waitFor();
      await actx.close();
    }

    // alice: bell notification + the approved place is live on the map
    const notes = (await api(page, 'GET', '/api/notifications?pageSize=10')).body.data.items;
    const live = notes.find((n) => n.title.includes('Norbucks'));
    assert(live && /\/map\?/.test(live.link), `alice notified (${notes.map((n) => n.title).join(' | ')})`);
    await page.goto(live.link);
    await waitExplore(page);
    await page.getByTestId('map-selection').getByText(`Norbucks 咖啡 ${RUN}`).waitFor({ timeout: 15000 });
    await shot(page, 'approved-place-desktop');
    void alice;
    await ctx.close();

    // ------------------------------------------------------------ 4. mobile: explore → drawer → selection
    {
      const mctx = await newContext(browser, { viewport: MOBILE });
      const mp = await mctx.newPage();
      watch(mp, 'mobile');
      await login(mp, 'alice@u.northwestern.edu');
      await mp.goto('/map');
      await waitExplore(mp);
      await shot(mp, 'explore-mobile');
      const drawer = mp.getByTestId('map-drawer');
      await drawer.getByRole('button', { expanded: false }).click();
      await drawer.getByRole('heading', { name: /房源/ }).waitFor();
      await shot(mp, 'drawer-mobile');
      await drawer.getByRole('button', { expanded: true }).click();
      await pickPin(mp, 'Whole Foods 超市');
      await mp.getByTestId('map-selection').getByText('到校通勤').waitFor();
      await mp.getByTestId('map-selection').getByText(/分钟/).first().waitFor();
      await shot(mp, 'selection-mobile');
      await mctx.close();
    }

    // ------------------------------------------------------------ 5. dark + English
    {
      const dctx = await newContext(browser, { dark: true });
      const dp = await dctx.newPage();
      watch(dp, 'dark');
      await login(dp, 'bob@u.northwestern.edu');
      await dp.goto('/map?layers=listings,shuttle,pois');
      await waitExplore(dp);
      await pickPin(dp, 'Davis 站（紫线）');
      await dp.getByTestId('map-selection').waitFor();
      await dp.getByTestId('ctl-legend').click();
      await shot(dp, 'explore-dark');
      await dctx.close();

      const ectx = await newContext(browser, { lang: 'en' });
      const ep = await ectx.newPage();
      watch(ep, 'english');
      await login(ep, 'bob@u.northwestern.edu');
      await ep.goto('/map');
      await waitExplore(ep);
      await ep.getByTestId('map-rail').getByRole('heading', { name: /Sublets/ }).waitFor();
      await shot(ep, 'explore-en');
      await ep.goto('/map?scope=nationwide');
      await ep.getByTestId('nationwide-list').waitFor();
      await ep.locator('.anwo-bubble').first().waitFor();
      await shot(ep, 'nationwide-mobile-en'.replace('-mobile', ''));
      await ectx.close();
    }
  } catch (e) {
    errors.push(`[flow] ${e.message}`);
    console.error(e);
  } finally {
    await finish(browser);
  }

  if (consoleErrors.length) console.warn(`console errors (${consoleErrors.length}):\n` + consoleErrors.join('\n'));
  if (errors.length) {
    console.error(`FAILED (${errors.length}):\n` + errors.join('\n'));
    process.exit(1);
  }
  console.log('map spec: OK');
}

main();
