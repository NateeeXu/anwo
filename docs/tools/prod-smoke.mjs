// Production smoke (release check): NODE_ENV=production server on :4500 serving web/dist. Usage: BASE=http://localhost:4500 [OUT=dir] [IGNORE_CSP=1] node docs/tools/prod-smoke.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = process.env.BASE || 'http://localhost:4500';
const OUT = process.env.OUT;
const results = [];
const rec = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const noise = (t) => (process.env.IGNORE_CSP && /Content Security Policy/.test(t)) || /ERR_TUNNEL_CONNECTION_FAILED|tile\.openstreetmap|ERR_NAME_NOT_RESOLVED|ERR_PROXY|Failed to load resource/.test(t);

// raw HTTP checks
const j = async (p, init) => { const r = await fetch(BASE + p, { redirect: 'manual', ...init }); return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() }; };
const meta = await j('/api/meta'); rec('GET /api/meta', meta.status === 200, String(meta.status));
const unk = await j('/api/nope'); rec('unknown /api/* -> JSON 404', unk.status === 404 && unk.ct.includes('json'), `${unk.status} ${unk.ct}`);
const dev = await j('/api/dev/mailbox?email=a@b.edu'); rec('/api/dev/* hidden in production', dev.status === 404, String(dev.status));
const ls = JSON.parse((await j('/api/listings?scope=nationwide&pageSize=1')).body);
const listingId = ls?.data?.items?.[0]?.id; rec('listing id for deep link', !!listingId, listingId || JSON.stringify(ls).slice(0, 200));

const browser = await pw.chromium.launch();
async function visit(page, path, name, check) {
  const errs = [];
  const onErr = (e) => errs.push('pageerror: ' + e.message);
  const onCon = (m) => { if (m.type() === 'error' && !noise(m.text())) errs.push('console: ' + m.text()); };
  page.on('pageerror', onErr); page.on('console', onCon);
  let status = 0;
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => page.goto(BASE + path, { waitUntil: 'load' }));
    status = res?.status() ?? 0;
    await page.waitForTimeout(800);
    const detail = check ? await check(page) : true;
    if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` });
    const ok = status === 200 && detail === true && errs.length === 0;
    rec(`page ${path}`, ok, `status=${status} url=${page.url().replace(BASE, '')}${detail !== true ? ' check=' + detail : ''}${errs.length ? ' errors=' + JSON.stringify(errs.slice(0, 3)) : ''}`);
  } finally { page.off('pageerror', onErr); page.off('console', onCon); }
}
const hasRoot = async (p) => ((await p.locator('#root *').count()) > 5) || 'empty #root';

const anon = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await anon.context().addCookies([{ name: 'campus', value: 'northwestern', url: BASE }]);
await visit(anon, '/', 'prod-home', hasRoot);
await visit(anon, '/listings', 'prod-listings', hasRoot);
await visit(anon, `/listings/${listingId}`, 'prod-listing-detail', async (p) => (await hasRoot(p)) === true && !/404|not found/i.test(await p.title()) ? true : 'detail not rendered: ' + (await p.title()));
await visit(anon, '/pricing', 'prod-pricing', hasRoot);

// admin via normal login API (dev login-as unavailable in prod)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto(BASE + '/');
const login = await page.request.post(BASE + '/api/auth/login', { data: { email: 'admin@example.edu', password: 'Passw0rd!' }, headers: { 'X-Requested-With': 'fetch' } });
const cookies = await ctx.cookies();
const sid = cookies.find((c) => c.name === 'sid');
rec('POST /api/auth/login (admin)', login.status() === 200 && !!sid, `status=${login.status()} sid=${!!sid} secure=${sid?.secure} httpOnly=${sid?.httpOnly}`);
const me = await page.request.get(BASE + '/api/auth/me');
const meJ = await me.json().catch(() => null);
rec('GET /api/auth/me as admin', me.status() === 200 && meJ?.data?.role === 'admin', `status=${me.status()} role=${meJ?.data?.role}`);
await visit(page, '/admin', 'prod-admin', async (p) => (p.url().includes('/admin') && !p.url().includes('/login')) ? ((await hasRoot(p)) === true ? true : 'empty') : 'redirected to ' + p.url());
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
