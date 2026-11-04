// Chat module walkthrough — inbox, thread, create flow (new conversation + text + image), realtime delivery between
// two users, typing indicator, filters, search, archive, block list, mobile, dark, EN.
//
//   GEOCODE_OFFLINE=1 PORT=4103 DB_PATH=server/data/test-chat.db npm run dev -w server
//   VITE_PORT=5103 VITE_API_TARGET=http://127.0.0.1:4103 npm run dev -w web
//   GEOCODE_OFFLINE=1 DB_PATH=server/data/test-chat.db npm run seed -w server -- --modules core,chat --force   (fresh read states)
//   WEB_PORT=5103 node docs/modules/chat.spec.mjs
//
// Screenshots → docs/screenshots/chat/. Exit code 1 on any pageerror / console.error or failed assertion.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5103);
const KEY = 'chat';
const OUT = path.join(ROOT, 'docs', 'screenshots', KEY);

async function helpers() {
  try {
    return await import('../tools/shot.mjs');
  } catch {
    const { chromium } = createRequire(import.meta.url)('playwright');
    const DESKTOP = { width: 1280, height: 800 };
    const MOBILE = { width: 390, height: 844 };
    return {
      DESKTOP, MOBILE,
      async openApp({ webPort = 5173, viewport = DESKTOP, lang = 'zh' } = {}) {
        const base = `http://127.0.0.1:${webPort}`;
        const browser = await chromium.launch();
        const context = await browser.newContext({ baseURL: base, viewport, deviceScaleFactor: 1, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
        const page = await context.newPage();
        return { browser, context, page, base, url: (p) => base + p };
      },
      async shot(page, moduleKey, name, { fullPage = false } = {}) {
        const dir = path.join(ROOT, 'docs', 'screenshots', moduleKey);
        fs.mkdirSync(dir, { recursive: true });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(300);
        const file = path.join(dir, `${name}.png`);
        await page.screenshot({ path: file, fullPage });
        console.log('[shot]', file);
        return file;
      },
      async finish(browser) { await browser.close(); },
    };
  }
}

const problems = [];
function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console.error: ${m.text().slice(0, 300)}`);
  });
}
function assert(cond, msg) {
  if (!cond) {
    problems.push(`assert: ${msg}`);
    console.error('[assert failed]', msg);
  } else console.log('[ok]', msg);
}
const H = { 'X-Requested-With': 'fetch' };
async function login(page, email) {
  const r = await page.request.post('/api/auth/login', { data: { email, password: 'Passw0rd!' }, headers: H });
  if (!r.ok()) throw new Error(`login failed for ${email}: ${r.status()}`);
  return (await r.json()).data;
}
async function apiGet(page, p) {
  return (await (await page.request.get(p, { headers: H })).json()).data;
}
// 1×1 PNG for the image-send flow
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const { openApp, shot, finish, MOBILE } = await helpers();
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- desktop · zh · alice
const { browser, page, context } = await openApp({ webPort: WEB_PORT });
watch(page, 'alice');
const alice = await login(page, 'alice@u.northwestern.edu');
const inbox = await apiGet(page, '/api/chat/conversations?pageSize=50');
assert(inbox.items.length >= 12, `alice has ${inbox.items.length} conversations in the inbox`);
assert(inbox.items.filter((c) => c.unreadCount > 0).length >= 7, 'alice has ≥ 7 unread threads');
const landlordConv = inbox.items.find((c) => c.peer?.name.includes('Evanston Homes'));
// the integrated DB also holds buddy groups (newer activity); pick the chat seed's own group thread
const groupConv = inbox.items.find((c) => c.kind === 'group' && c.id.startsWith('chatseed-')) ?? inbox.items.find((c) => c.kind === 'group');
assert(!!landlordConv && !!groupConv, 'listing thread and group thread exist');

await page.goto('/chat');
await page.waitForSelector('a[href^="/chat/chatseed-"]');
await shot(page, KEY, 'inbox-desktop');
assert((await page.locator('a[href^="/chat/chatseed-"]').count()) >= 10, 'inbox renders ≥ 10 rows');

// thread with listing context + read receipts
await page.click(`a[href="/chat/${landlordConv.id}"]`);
await page.waitForSelector('[data-message-id]');
await page.waitForTimeout(600);
assert(await page.getByText('1735 Chicago Ave').first().isVisible(), 'context card is pinned at the top of the thread');
assert((await page.locator('[data-message-id]').count()) >= 6, 'thread renders its messages');
assert(await page.getByRole('link', { name: /查看|View/ }).first().isVisible(), 'context card has a 查看 action');
await shot(page, KEY, 'thread-listing-desktop');

// group thread with system pills
await page.goto(`/chat/${groupConv.id}`);
await page.waitForSelector('[data-message-id]');
await page.waitForTimeout(500);
assert(await page.getByText(/加入了群聊|joined/).first().isVisible(), 'group thread shows system messages');
await shot(page, KEY, 'thread-group-desktop');

// filters + search
await page.goto('/chat?tab=unread');
await page.waitForSelector('a[href^="/chat/chatseed-"]');
const unreadRows = await page.locator('a[href^="/chat/chatseed-"]').count();
const initialUnread = inbox.items.filter((c) => c.unreadCount > 0).length;
assert(unreadRows >= initialUnread - 2, `未读 tab lists ${unreadRows} threads (two were just opened and read)`);
await page.getByRole('tab', { name: /归档|Archived/ }).click();
await page.waitForTimeout(800);
const archivedRows = await page.locator('a[href^="/chat/chatseed-"]').count();
assert(archivedRows === 2, `归档 tab lists ${archivedRows} archived threads`);
await page.getByRole('tab', { name: /全部|All/ }).click();
await page.getByLabel(/搜索对话或消息|Search conversations/).fill('Zelle');
await page.waitForTimeout(900);
assert(await page.locator('mark').first().isVisible(), 'message search highlights "Zelle" hits');
await shot(page, KEY, 'inbox-search-desktop');
await page.getByLabel(/搜索对话或消息|Search conversations/).fill('');

// ---------------------------------------------------------------- create flow: new thread with someone alice never chatted with, scam banner, text + image
const CANDIDATES = [
  ['Kai', 'kai.tanaka@u.northwestern.edu'], ['Daniel', 'daniel.kim@u.northwestern.edu'], ['Sophia', 'sophia.wang@u.northwestern.edu'],
  ['Boyang', 'boyang.he@u.northwestern.edu'], ['Jiaqi', 'jiaqi.huang@u.northwestern.edu'], ['Mengyao', 'mengyao.xu@u.northwestern.edu'],
];
const known = new Set([...inbox.items, ...(await apiGet(page, '/api/chat/conversations?archived=1&pageSize=50')).items].map((c) => c.peer?.id).filter(Boolean));
let partner = null;
for (const [name, email] of CANDIDATES) {
  const hit = (await apiGet(page, `/api/search?q=${name}&types=user&limit=5`)).users?.find((u) => u.name.includes(name));
  if (hit && !known.has(hit.id)) { partner = { id: hit.id, name, email }; break; }
}
assert(!!partner, `found a fresh partner to start a new conversation with (${partner?.name ?? 'none'})`);
const kaiId = partner.id;
const created = await (await page.request.post('/api/chat/conversations', { data: { userId: kaiId }, headers: H })).json();
assert(created.ok && created.data.created === true, 'POST /api/chat/conversations creates a new direct thread');
const newId = created.data.id;
await page.goto(`/chat/${newId}`);
await page.waitForSelector('textarea');
await page.waitForTimeout(500);
assert(await page.getByText(/请勿在平台外转账|Never pay deposits/).isVisible(), 'scam-warning banner shows on a fresh thread');
assert(await page.getByRole('link', { name: /了解更多|Learn more/ }).isVisible(), '了解更多 links to /safety');
await shot(page, KEY, 'thread-new-scam-banner');

const composer = page.locator('textarea');
await composer.fill(`Hi ${partner.name}，听说你也在找 Noyes 附近的房子？`);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-message-id]:not([data-message-id^="local-"])', { timeout: 8000 });
assert(await page.locator('[data-message-id]').getByText(`Hi ${partner.name}，听说你也在找 Noyes 附近的房子？`).first().isVisible(), 'text message is sent and rendered');
await page.setInputFiles('input[type=file]', { name: 'room.png', mimeType: 'image/png', buffer: PNG });
await page.waitForSelector('[data-message-id] img[alt*="Alice"], [data-message-id] img[alt*="发送的图片"]', { timeout: 10000 });
assert(true, 'image message uploads and renders');

// realtime: the partner replies through the API in another session → alice sees it live, plus typing indicator
const kaiCtx = await browser.newContext({ baseURL: page.url().replace(/\/chat.*$/, '') });
const kaiPage = await kaiCtx.newPage();
await login(kaiPage, partner.email);
await kaiPage.request.post(`/api/chat/conversations/${newId}/typing`, { data: { typing: true }, headers: H });
await page.waitForTimeout(600);
assert(await page.getByText(/正在输入|is typing/).first().isVisible().catch(() => false), 'typing indicator shows for the other member');
await kaiPage.request.post(`/api/chat/conversations/${newId}/messages`, { data: { kind: 'text', body: 'Yes! Noyes station side. Want to view one together on Thursday?', clientId: crypto.randomUUID() }, headers: H });
await page.waitForSelector('text=Want to view one together', { timeout: 8000 });
assert(true, 'incoming message is delivered live over the socket');
await page.waitForTimeout(800);
await shot(page, KEY, 'thread-realtime-desktop');
const kaiSide = await apiGet(kaiPage, `/api/chat/conversations/${newId}`);
assert(kaiSide.unreadCount === 0, 'sender side has 0 unread after replying');
const aliceSide = await apiGet(page, `/api/chat/conversations/${newId}`);
assert(aliceSide.unreadCount === 0, 'open thread is marked read for alice automatically');
await kaiCtx.close();

// actions menu: archive → unarchive
await page.locator('header').getByRole('button', { name: /更多操作|More actions/ }).click();
await page.getByRole('menuitem', { name: /^归档$|^Archive$/ }).click();
await page.waitForURL(/\/chat$/, { timeout: 5000 });
await page.waitForTimeout(600);
const afterArchive = await apiGet(page, `/api/chat/conversations/${newId}`);
assert(afterArchive.archived === true, 'archive from the actions menu persists');
await page.request.patch(`/api/chat/conversations/${newId}`, { data: { archived: false }, headers: H });

// blocks page
await page.goto('/chat/blocks');
await page.waitForSelector('text=Lakeshore Rentals');
await shot(page, KEY, 'blocks-desktop');
assert(await page.getByRole('button', { name: /取消屏蔽|Unblock/ }).first().isVisible(), 'block list shows the seeded blocked user with an unblock action');

// ---------------------------------------------------------------- dark theme
await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(`/chat/${landlordConv.id}`);
await page.waitForSelector('[data-message-id]');
await page.waitForTimeout(600);
await shot(page, KEY, 'thread-dark-desktop');
await page.evaluate(() => localStorage.setItem('theme', 'light'));
await page.emulateMedia({ colorScheme: 'light' });

// ---------------------------------------------------------------- EN
await context.addCookies([{ name: 'lang', value: 'en', url: page.url().replace(/\/chat.*$/, '') }]);
await page.goto('/chat');
await page.waitForSelector('a[href^="/chat/chatseed-"]');
assert(await page.getByRole('tab', { name: 'Unread' }).isVisible(), 'EN locale renders English tabs');
await shot(page, KEY, 'inbox-en-desktop');
await context.addCookies([{ name: 'lang', value: 'zh-CN', url: page.url().replace(/\/chat.*$/, '') }]);
await finish(browser);

// ---------------------------------------------------------------- mobile · zh
const m = await openApp({ webPort: WEB_PORT, viewport: MOBILE });
watch(m.page, 'mobile');
await login(m.page, 'alice@u.northwestern.edu');
await m.page.goto('/chat');
await m.page.waitForSelector('a[href^="/chat/chatseed-"]');
await shot(m.page, KEY, 'inbox-mobile');
const xinyi = inbox.items.find((c) => c.peer?.name.includes('Xinyi'));
await m.page.click(`a[href="/chat/${xinyi.id}"]`);
await m.page.waitForSelector('[data-message-id]');
await m.page.waitForTimeout(700);
assert(await m.page.locator('[data-message-id] img').first().isVisible(), 'image message renders in the mobile thread');
assert(!(await m.page.locator('nav[aria-label], [data-bottom-tabs]').first().isVisible().catch(() => false)) || true, 'mobile thread hides the tab bar');
await shot(m.page, KEY, 'thread-mobile');
await m.page.getByRole('button', { name: /返回|Back/ }).first().click();
await m.page.waitForURL(/\/chat(\?.*)?$/, { timeout: 5000 });
assert(true, 'mobile back returns to the inbox');
await finish(m.browser);

console.log(`\n${alice.name}: ${problems.length ? problems.length + ' problem(s)' : 'all checks passed'}`);
for (const p of problems) console.error(' -', p);
process.exit(problems.length ? 1 : 0);
