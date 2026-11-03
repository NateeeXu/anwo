// Buddy module walkthrough — Playwright on the module's ports (server 4108, web 5108, DB server/data/test-buddy.db).
//
//   GEOCODE_OFFLINE=1 PORT=4108 DB_PATH=server/data/test-buddy.db npm run dev -w server
//   VITE_PORT=5108 VITE_API_TARGET=http://127.0.0.1:4108 npm run dev -w web
//   DB_PATH=server/data/test-buddy.db npm run seed -w server -- --modules core,buddy --force
//   WEB_PORT=5108 node docs/modules/buddy.spec.mjs
//
// Flows: browse (list + calendar, filters), detail + join (instant join → group chat), request-to-join + host approval,
// create a carpool post through /post/buddy, edit, my groups, leave, dark mode, English, mobile. Exit 1 on any page error
// or failed assertion. Screenshots → docs/screenshots/buddy/.
import { openApp, shot, finish, DESKTOP, MOBILE } from '../tools/shot.mjs';

const WEB_PORT = Number(process.env.WEB_PORT || 5108);
const MODULE = 'buddy';
const failures = [];
const pageErrors = [];

function assert(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error('[assert]', msg);
  } else console.log('[ok]', msg);
}

async function login(page, email, password = 'Passw0rd!') {
  const res = await page.request.post('/api/auth/login', { data: { email, password }, headers: { 'X-Requested-With': 'fetch' } });
  assert(res.ok(), `login ${email}`);
}
async function logout(page) {
  await page.request.post('/api/auth/logout', { headers: { 'X-Requested-With': 'fetch' } }).catch(() => {});
}
async function apiGet(page, path) {
  const r = await page.request.get(path);
  return (await r.json()).data;
}
async function setCampus(context, id = 'northwestern') {
  await context.addCookies([{ name: 'campus', value: id, url: `http://127.0.0.1:${WEB_PORT}` }]);
}
async function settle(page, ms = 400) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function run() {
  const app = await openApp({ webPort: WEB_PORT, viewport: DESKTOP, lang: 'zh' });
  const { browser, context, page } = app;
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await setCampus(context);

  // ---------------------------------------------------------------- 1. browse (logged out)
  await page.goto('/buddy');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  const cards = await page.locator('article').count();
  assert(cards >= 6, `browse renders cards (${cards})`);
  await shot(page, MODULE, 'browse-desktop');

  // type tab + verified-only chip
  await page.getByRole('tab', { name: /接机/ }).first().click();
  await settle(page);
  assert(page.url().includes('tab=ride'), 'type tab updates the URL');
  await page.getByRole('button', { name: '仅限已验证' }).click();
  await settle(page);
  const filteredCards = await page.locator('article').count();
  assert(filteredCards >= 1, `verified-only ride posts (${filteredCards})`);
  await shot(page, MODULE, 'browse-filtered-ride-verified');

  // calendar view
  await page.goto('/buddy?view=calendar');
  await page.waitForSelector('[role=grid]', { timeout: 20000 });
  await settle(page, 800);
  const dots = await page.locator('[role=gridcell] span.rounded-pill.size-1\\.5').count();
  assert(dots >= 5, `calendar shows dots (${dots})`);
  // click the first day that has events
  const dayWithEvents = page.locator('[role=gridcell][aria-label*="个活动"]').first();
  await dayWithEvents.click();
  await settle(page);
  assert((await page.locator('article').count()) >= 1, 'calendar day list shows cards');
  await shot(page, MODULE, 'browse-calendar');

  // ---------------------------------------------------------------- 2. detail + instant join (bob, L1)
  await login(page, 'bob@u.northwestern.edu');
  const list = await apiGet(page, '/api/buddy/posts?campusId=northwestern&pageSize=50&hasSpace=0');
  const find = (s) => list.items.find((p) => p.title.includes(s));
  const costco = find('周六 Costco Glenview');
  const ca987 = find('CA 987 上海');
  const study = find('CS 336');
  assert(!!costco && !!ca987 && !!study, 'seed posts found through the API');

  await page.goto(`/buddy/${costco.id}`);
  await page.waitForSelector('main h1', { timeout: 20000 });
  await settle(page);
  assert((await page.locator('main h1').innerText()).includes('Costco'), 'detail h1');
  assert((await page.getByText('安全提示').count()) >= 1, 'safety card visible');
  await shot(page, MODULE, 'detail-desktop');

  await page.getByRole('button', { name: '加入', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('我已阅读安全提示').check();
  await page.getByRole('dialog').getByLabel('给发起人留句话').fill('我带两箱水的空间就够了');
  await shot(page, MODULE, 'detail-join-modal');
  await page.getByRole('dialog').getByRole('button', { name: '加入', exact: true }).click();
  await page.getByRole('link', { name: '进入群聊' }).waitFor({ timeout: 15000 });
  await settle(page);
  const after = await apiGet(page, `/api/buddy/posts/${costco.id}`);
  assert(after.myMembership?.status === 'joined', 'bob is joined after the modal');
  assert(!!after.conversationId, 'group chat id is exposed to members');
  assert(after.status === 'full', 'post became full at max members');
  await shot(page, MODULE, 'detail-joined');

  // request-to-join flow (approval required)
  await page.goto(`/buddy/${ca987.id}`);
  await page.waitForSelector('main h1');
  await settle(page);
  await page.getByRole('button', { name: '申请加入' }).first().click();
  await page.getByRole('dialog').getByLabel('我已阅读安全提示').check();
  await page.getByRole('dialog').getByRole('button', { name: '申请加入' }).click();
  await page.getByText('等待发起人通过').waitFor({ timeout: 15000 });
  const pendingState = await apiGet(page, `/api/buddy/posts/${ca987.id}`);
  assert(pendingState.myMembership?.status === 'pending', 'bob is pending on an approval post');
  await shot(page, MODULE, 'detail-pending');

  // my groups
  await page.goto('/buddy/mine');
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page);
  assert((await page.locator('article').count()) >= 2, 'my groups lists joined posts');
  await shot(page, MODULE, 'mine-desktop');

  // ---------------------------------------------------------------- 3. create flow (bob)
  await page.goto('/post/buddy');
  await page.getByRole('button', { name: /拼车/ }).first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^拼车/ }).first().click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('标题').fill('周日 Mitsuwa 拼车 · 测试发布');
  const start = new Date(Date.now() + 3 * 86400000);
  start.setHours(14, 0, 0, 0);
  const local = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}T14:00`;
  await page.getByLabel('开始时间').fill(local);
  await page.getByLabel('集合地点').fill('Noyes 站');
  await page.getByLabel('目的地').fill('Mitsuwa Marketplace');
  await page.getByLabel('详情').fill('周日下午去 Mitsuwa 买食材，油费 AA。\n\nSunday grocery run to Mitsuwa, split gas.');
  await page.getByLabel('每人费用').fill('6');
  await settle(page, 600);
  await shot(page, MODULE, 'form-step-details');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('switch', { name: /加入需要我审核/ }).click();
  await shot(page, MODULE, 'form-step-rules');
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.waitForURL(/\/buddy\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await page.waitForSelector('main h1');
  await settle(page);
  const createdId = page.url().split('/').pop();
  const created = await apiGet(page, `/api/buddy/posts/${createdId}`);
  assert(created?.title === '周日 Mitsuwa 拼车 · 测试发布', 'created post title');
  assert(created?.type === 'carpool' && created.requiresApproval === true && created.costSplitCents === 600, 'created post fields');
  assert(created?.myMembership?.role === 'host', 'creator is host');
  await shot(page, MODULE, 'detail-created-host');

  // edit
  await page.goto(`/buddy/${createdId}/edit`);
  await page.getByLabel('标题').waitFor({ timeout: 20000 });
  await page.getByLabel('标题').fill('周日 Mitsuwa 拼车 · 已编辑');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await page.waitForURL(new RegExp(`/buddy/${createdId}$`), { timeout: 20000 });
  await settle(page);
  assert((await apiGet(page, `/api/buddy/posts/${createdId}`)).title === '周日 Mitsuwa 拼车 · 已编辑', 'edit saved');

  // leave the costco group
  await page.goto(`/buddy/${costco.id}`);
  await page.getByRole('button', { name: '退出' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '退出' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '退出' }).click();
  await page.getByRole('button', { name: '加入', exact: true }).first().waitFor({ timeout: 15000 });
  assert((await apiGet(page, `/api/buddy/posts/${costco.id}`)).status === 'open', 'leaving reopens a full post');
  await logout(page);

  // ---------------------------------------------------------------- 4. host approval (yuting, L3)
  await login(page, 'yuting.chen@u.northwestern.edu');
  await page.goto(`/buddy/${ca987.id}?tab=requests`);
  await page.getByRole('tab', { name: /申请/ }).waitFor({ timeout: 20000 });
  await settle(page);
  await shot(page, MODULE, 'detail-host-requests');
  const approveButtons = page.getByRole('button', { name: '通过' });
  const nApprove = await approveButtons.count();
  assert(nApprove >= 2, `host sees pending requests (${nApprove})`);
  await approveButtons.first().click();
  await settle(page, 800);
  const members = await apiGet(page, `/api/buddy/posts/${ca987.id}/members`);
  assert(members.filter((m) => m.status === 'joined').length >= 3, 'approval adds a member');
  await logout(page);

  // ---------------------------------------------------------------- 5. dark + english + mobile
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
  await page.goto('/buddy');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForSelector('article', { timeout: 20000 });
  await settle(page, 600);
  await shot(page, MODULE, 'browse-dark');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.emulateMedia({ colorScheme: 'light' });

  await context.addCookies([{ name: 'lang', value: 'en', url: `http://127.0.0.1:${WEB_PORT}` }]);
  await page.goto(`/buddy/${study.id}`);
  await page.waitForSelector('main h1', { timeout: 20000 });
  await settle(page, 600);
  assert((await page.getByText('Safety tips').count()) >= 1, 'English safety card');
  await shot(page, MODULE, 'detail-en');
  await context.addCookies([{ name: 'lang', value: 'zh-CN', url: `http://127.0.0.1:${WEB_PORT}` }]);

  const mobile = await context.newPage();
  mobile.on('pageerror', (e) => pageErrors.push(e.message));
  await mobile.setViewportSize(MOBILE);
  await mobile.goto('/buddy');
  await mobile.waitForSelector('article', { timeout: 20000 });
  await settle(mobile, 600);
  await shot(mobile, MODULE, 'browse-mobile');
  await mobile.goto(`/buddy/${costco.id}`);
  await mobile.waitForSelector('main h1', { timeout: 20000 });
  await settle(mobile, 600);
  await shot(mobile, MODULE, 'detail-mobile', { fullPage: true });
  await mobile.goto('/buddy?view=calendar');
  await mobile.waitForSelector('[role=grid]', { timeout: 20000 });
  await settle(mobile, 600);
  await shot(mobile, MODULE, 'calendar-mobile');
  await mobile.close();

  await finish(browser);
}

try {
  await run();
} catch (e) {
  failures.push(`run threw: ${e?.message ?? e}`);
  console.error(e);
}
const ok = failures.length === 0 && pageErrors.length === 0;
console.log(JSON.stringify({ ok, failures, pageErrors }, null, 2));
process.exit(ok ? 0 : 1);
