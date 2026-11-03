// verify — Playwright walkthrough (BRIEF §8.3). Re-runnable: every run registers fresh spec users through the API.
//
//   # server:  GEOCODE_OFFLINE=1 PORT=4104 DB_PATH=server/data/test-verify.db npm run dev -w server
//   # web:     VITE_PORT=5104 VITE_API_TARGET=http://127.0.0.1:4104 npx vite --config web/vite.config.ts
//   WEB_PORT=5104 node docs/modules/verify.spec.mjs
//
// Flows: verification center (bob, pending seed request) desktop + mobile · create flow for a freshly registered user
// (edu code → private upload → submit ID in the UI → SMS code → mock card → verified-only switch) · admin queue +
// review modal with the audited document viewer (approve; keyboard reject) desktop + mobile · public trust profile ·
// fully verified center · dark mode · English rejected state. Exit 1 on any `pageerror`, 2 when the app is unreachable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WEB_PORT = Number(process.env.WEB_PORT || 5104);
const OUT = path.join(ROOT, 'docs', 'screenshots', 'verify');
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const H = { 'X-Requested-With': 'fetch' };
const RUN = Date.now().toString(36);

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
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) console.error('[console.error]', label, m.text()); });
}
async function shot(page, name, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(350);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log('[shot]', path.relative(ROOT, file));
}
async function login(page, email) {
  const r = await page.request.post(`${BASE}/api/dev/login-as`, { data: { email }, headers: H });
  if (!r.ok()) throw new Error(`login-as ${email} failed: ${r.status()}`);
  return (await r.json()).data;
}
const assert = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); };
const heading = (page, name) => page.locator('#main').getByRole('heading', { level: 1, name });

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Registers a Northwestern student through the API and confirms the auto-sent edu code (→ L1). Returns UserMe. */
async function registerL1(page, slug, name) {
  const email = `verify-spec-${slug}-${RUN}@u.northwestern.edu`;
  const reg = await page.request.post(`${BASE}/api/auth/register`, { data: { email, password: 'Passw0rd!', name, locale: 'zh-CN', campusId: 'northwestern' }, headers: H });
  assert(reg.ok(), `register ${email}: ${reg.status()}`);
  const mailbox = await (await page.request.get(`${BASE}/api/dev/mailbox?email=${encodeURIComponent(email)}`)).json();
  const code = mailbox.data.emails.find((m) => m.purpose === 'edu_verify')?.code;
  assert(code, 'edu code in dev mailbox');
  const conf = await page.request.post(`${BASE}/api/verify/edu/confirm`, { data: { email, code }, headers: H });
  assert(conf.ok(), `edu confirm: ${conf.status()}`);
  const me = (await conf.json()).data;
  assert(me.trustLevel === 1, 'registered user is L1');
  return me;
}

async function main() {
  const chromium = await loadPlaywright();
  const health = await fetch(`${BASE}/api/meta/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error('app not reachable on', BASE); process.exit(2); }
  const browser = await chromium.launch();
  let applicant = null; // the user whose request the admin approves
  let rejectee = null; // the user whose request the admin rejects via keyboard

  // ------------------------------------------------------------ 1. verification center as bob (L1, pending seed request)
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'zh-CN' });
    const page = await ctx.newPage();
    watch(page, 'center');
    await login(page, 'bob@u.northwestern.edu');
    await page.goto('/verify');
    await heading(page, '身份验证').waitFor();
    await page.getByText('审核中', { exact: false }).first().waitFor();
    await shot(page, 'verify-center-desktop');
    await page.setViewportSize(MOBILE);
    await page.goto('/verify');
    await heading(page, '身份验证').waitFor();
    await shot(page, 'verify-center-mobile', { fullPage: true });
    await ctx.close();
  }

  // ------------------------------------------------------------ 2. create flow for a fresh L1 user: ID → phone → card → switch
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'zh-CN' });
    const page = await ctx.newPage();
    watch(page, 'create');
    applicant = await registerL1(page, 'a', '周舟 Spec');
    await page.goto('/verify');
    await heading(page, '身份验证').waitFor();
    // the ID step is the active step → opens by default with the upload form
    await page.getByLabel('证件上的姓名').waitFor();
    await page.getByLabel('证件上的姓名').fill('Zhou Zhou');
    await page.getByLabel('证件号后 4 位').fill('7788');
    const tmp = path.join(os.tmpdir(), 'anwo-verify-front.png');
    fs.writeFileSync(tmp, PNG_1x1);
    const uploaded = page.waitForResponse((r) => r.url().includes('/api/uploads') && r.request().method() === 'POST');
    await page.locator('input[type=file]').first().setInputFiles(tmp);
    const upRes = await uploaded;
    assert(upRes.ok(), 'private upload succeeded');
    const upJson = await upRes.json();
    assert(upJson.data[0].isPrivate === true, 'verification upload is private');
    await page.waitForTimeout(400);
    const submitted = page.waitForResponse((r) => r.url().endsWith('/api/verify/id') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '提交审核' }).click();
    const subRes = await submitted;
    assert(subRes.ok(), `submit returned ${subRes.status()}`);
    await page.getByText('审核中', { exact: false }).first().waitFor();
    await shot(page, 'verify-id-submitted');

    // phone: open the step, request a code, use the dev code, confirm
    await page.locator('#phone').getByRole('button').click();
    await page.getByLabel('手机号').fill('+1 847 555 0188');
    await page.getByRole('button', { name: '发送短信' }).click();
    const devCode = page.locator('#phone button.font-mono');
    await devCode.waitFor();
    await devCode.click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.locator('#phone').getByText('已验证', { exact: false }).waitFor();

    // payment: mock card (declined test number first, then a good one)
    await page.locator('#payment').getByRole('button').click();
    await page.getByLabel('卡号').fill('4000 0000 0000 0002');
    await page.getByLabel('有效期').fill('12 / 29');
    await page.getByLabel('安全码').fill('123');
    await page.getByLabel('持卡人姓名').fill('Zhou Zhou');
    await page.getByRole('button', { name: '保存支付方式' }).click();
    await page.getByText('这张卡被拒绝了', { exact: false }).waitFor();
    await page.getByLabel('卡号').fill('4242 4242 4242 4242');
    await page.getByRole('button', { name: '保存支付方式' }).click();
    await page.getByText('•••• 4242').waitFor();
    await page.waitForTimeout(500);
    const status = await (await page.request.get(`${BASE}/api/verify/status`)).json();
    assert(status.data.steps.phone.done && status.data.steps.payment.done, 'phone + payment done');
    assert(status.data.steps.id.request.status === 'pending', 'ID request pending');
    await shot(page, 'verify-phone-payment-done', { fullPage: true });

    // verified-only messaging switch (PATCH /api/users/me)
    await page.getByRole('switch').click();
    await page.getByText('设置已保存').waitFor();
    const me = await (await page.request.get(`${BASE}/api/auth/me`)).json();
    assert(me.data.verifiedOnlyMessaging === true, 'verified-only switch persisted');

    // a second user whose request the admin will reject through the keyboard flow (API only)
    rejectee = await registerL1(page, 'b', '吴雨 Spec');
    const up = await page.request.post(`${BASE}/api/uploads`, { headers: H, multipart: { file: { name: 'front.png', mimeType: 'image/png', buffer: PNG_1x1 }, purpose: 'verification' } });
    assert(up.ok(), 'rejectee upload');
    const upId = (await up.json()).data[0].id;
    const sub = await page.request.post(`${BASE}/api/verify/id`, { headers: H, data: { type: 'passport', frontUploadId: upId, fullName: 'WU YU' } });
    assert(sub.ok(), 'rejectee submit');
    await ctx.close();
  }

  // ------------------------------------------------------------ 3. admin queue + review (modal on a seeded request, approve, keyboard reject)
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'zh-CN' });
    const page = await ctx.newPage();
    watch(page, 'admin');
    await login(page, 'admin@example.edu');
    await page.goto('/verify/admin');
    await heading(page, '验证队列').waitFor();
    await page.locator('table tbody tr').first().waitFor();
    await shot(page, 'admin-queue-desktop');

    // open the oldest open request (seeded, with placeholder documents) for the modal screenshot; ← → switch sides
    await page.locator('table tbody tr').first().click();
    const first = page.getByRole('dialog');
    await first.waitFor();
    const seedImg = first.locator('img[src*="/api/verify/admin/requests/"]');
    await seedImg.waitFor();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await seedImg.elementHandle());
    await shot(page, 'admin-review-modal');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await first.waitFor({ state: 'detached' });

    // approve the applicant: search → open → 通过 → confirm
    const search = page.getByLabel('搜索姓名、邮箱');
    await search.fill(applicant.email);
    await page.locator('table tbody tr', { hasText: applicant.email }).first().waitFor();
    await page.locator('table tbody tr').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByText('证件姓名').waitFor();
    await dialog.locator('img[src*="/api/verify/admin/requests/"]').waitFor();
    await dialog.getByRole('button', { name: /^通过/ }).click();
    const approved = page.waitForResponse((r) => r.url().includes('/approve') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: '通过', exact: true }).click();
    assert((await approved).ok(), 'approve ok');
    await page.getByText(`已通过 ${applicant.name}`).waitFor();
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    // keyboard flow on the rejectee: J/K move, Enter opens, R → reject with the rubric code + text
    await search.fill(rejectee.email);
    await page.locator('table tbody tr', { hasText: rejectee.email }).first().waitFor();
    await page.locator('#main h1').click();
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('r');
    await page.getByRole('dialog').getByText('拒绝申请').waitFor();
    const rejected = page.waitForResponse((r) => r.url().includes('/reject') && r.request().method() === 'POST');
    await page.getByRole('dialog').getByRole('button', { name: '拒绝', exact: true }).click();
    assert((await rejected).ok(), 'reject ok');
    await page.getByText(`已拒绝 ${rejectee.name}`).waitFor();

    // document views and decisions are audited
    const audit = await (await page.request.get(`${BASE}/api/admin/audit?action=verify.view_document&pageSize=5`)).json().catch(() => null);
    if (audit && audit.ok && Array.isArray(audit.data?.items)) assert(audit.data.items.length > 0, 'view_document audited');

    await page.setViewportSize(MOBILE);
    await page.goto('/verify/admin');
    await heading(page, '验证队列').waitFor();
    await shot(page, 'admin-queue-mobile');
    await ctx.close();
  }

  // ------------------------------------------------------------ 4. applicant is L3; public trust profile; fully verified center
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'zh-CN' });
    const page = await ctx.newPage();
    watch(page, 'after');
    await login(page, applicant.email);
    const me = await (await page.request.get(`${BASE}/api/auth/me`)).json();
    assert(me.data.trustLevel === 3, `applicant is L3 after approval (got ${me.data.trustLevel})`);
    const notes = await (await page.request.get(`${BASE}/api/notifications?pageSize=10`)).json();
    assert(notes.data.items.some((n) => n.kind === 'verify.approved'), 'verify.approved notification delivered');
    await page.goto(`/verify/trust/${applicant.id}`);
    await heading(page, '信任档案').waitFor();
    await page.getByText('完全认证').first().waitFor();
    await shot(page, 'trust-profile-desktop');

    await page.goto('/verify');
    await page.getByText('你已完成全部验证').waitFor();
    await shot(page, 'verify-center-complete');
    await ctx.close();
  }
  // ------------------------------------------------------------ 5. rejectee sees the rejection in English; alice in dark mode
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'en-US' });
    await ctx.addCookies([{ name: 'lang', value: 'en', url: BASE }]);
    const page = await ctx.newPage();
    watch(page, 'en');
    await login(page, rejectee.email);
    await page.goto('/verify');
    await heading(page, 'Verification').waitFor();
    await page.getByText('Not approved', { exact: false }).first().waitFor();
    await shot(page, 'verify-center-rejected-en');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: DESKTOP, locale: 'zh-CN', colorScheme: 'dark' });
    const page = await ctx.newPage();
    watch(page, 'dark');
    await login(page, 'alice@u.northwestern.edu');
    await page.goto('/verify');
    await heading(page, '身份验证').waitFor();
    await shot(page, 'verify-center-dark');
    await ctx.close();
  }

  await browser.close();
  if (errors.length) {
    console.error(`${errors.length} page error(s):\n` + errors.join('\n'));
    process.exit(1);
  }
  console.log('verify spec passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
