// Admin walkthrough (Playwright, pre-installed globally). Run with the admin server + web on their ports:
//   GEOCODE_OFFLINE=1 RATE_LIMIT_DISABLED=1 PORT=4110 DB_PATH=server/data/test-admin.db npm start -w server
//   VITE_PORT=5110 VITE_API_TARGET=http://127.0.0.1:4110 npm run dev -w web -- --port 5110
//   node docs/modules/admin.spec.mjs
// Re-seeds the admin module first (POST /api/dev/seed, test DB only) so it is repeatable.
// Exercises: role guard (student → forbidden), overview tiles + SLA strip (seeded scam report is past its 12 h SLA → red),
// trend metric switch + table view, user search → drawer → suspend + restore (audited), report review → hide action,
// listings keyboard bulk hide (j / x) + restore, feature flag create → toggle → delete, campus request triage,
// audit log shows what we did, mobile overview + reports, dark revenue page, English flags page.
// Fails on any page error or console error, and if any admin i18n value says "escrow".
import fs from 'node:fs'
import { openApp, shot, finish, DESKTOP, MOBILE } from '../tools/shot.mjs'

const PORT = Number(process.env.WEB_PORT ?? 5110)
const errors = []
let step = ''
const ok = (cond, msg) => {
  if (!cond) throw new Error(`[${step}] ${msg}`)
}
const IGNORED = /ERR_TUNNEL_CONNECTION_FAILED|tile\.openstreetmap|status of 401\b/

async function session({ email = 'admin@example.edu', viewport = DESKTOP, lang = 'zh', theme = 'light' } = {}) {
  const app = await openApp({ webPort: PORT, viewport, lang })
  const { context, page, base } = app
  await context.addCookies([{ name: 'lang', value: lang === 'en' ? 'en' : 'zh-CN', url: base }])
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t)
    } catch {}
  }, theme)
  page.on('pageerror', (e) => errors.push(`${step}: pageerror ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`${step}: console ${m.text().slice(0, 200)}`)
  })
  const res = await page.request.post('/api/auth/login', { data: { email, password: 'Passw0rd!' }, headers: { 'X-Requested-With': 'fetch' } })
  ok(res.ok(), `login ${email} → ${res.status()}`)
  // keep the UI language deterministic regardless of the account's saved locale
  await page.request.patch('/api/users/me', { data: { locale: lang === 'en' ? 'en' : 'zh-CN' }, headers: { 'X-Requested-With': 'fetch' } })
  const api = async (method, path, body) => {
    const r = await page.request.fetch(path, { method, data: body, headers: { 'X-Requested-With': 'fetch' } })
    const j = await r.json().catch(() => ({}))
    return { status: r.status(), data: j.data, error: j.error }
  }
  return { ...app, api }
}
const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
}
async function confirmReason(page, reason) {
  const dlg = page.getByRole('dialog').last()
  await dlg.locator('textarea[name="reason"]').fill(reason)
  await dlg.getByTestId('reason-confirm').click()
  await dlg.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  await settle(page)
}

// 0 ---------------------------------------------------------------- copy rule
step = 'i18n'
{
  const src = fs.readFileSync('/home/user/campus-sublet/web/src/i18n/admin.ts', 'utf8')
  const bad = [...src.matchAll(/'admin\.[^']+':\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((v) => /escrow/i.test(v))
  ok(bad.length === 0, `i18n values mention escrow: ${bad.join(' | ')}`)
  console.log('[ok] no "escrow" in admin copy')
}

// 1 ---------------------------------------------------------------- non-admin is refused
step = 'guard'
{
  const s = await session({ email: 'alice@u.northwestern.edu' })
  const r = await s.api('GET', '/api/admin/overview')
  ok(r.status === 403, `student GET /api/admin/overview → ${r.status}`)
  await s.page.goto('/admin')
  await settle(s.page)
  ok(await s.page.getByText('没有权限查看这里').isVisible(), 'forbidden state for students')
  await finish(s.browser)
  console.log('[ok] role guard')
}

// 2 ---------------------------------------------------------------- admin desktop (zh, light)
const A = await session()
const { page } = A
step = 'reseed'
{
  const r = await A.api('POST', '/api/dev/seed', { modules: ['admin'], force: true })
  ok(r.status === 200, `reseed admin → ${r.status} ${JSON.stringify(r.error ?? '')}`)
}

step = 'overview'
{
  await page.goto('/admin')
  await settle(page)
  ok(await page.getByRole('heading', { name: '概览', level: 1 }).isVisible(), 'overview heading')
  ok(await page.getByTestId('tile-dau').isVisible(), 'DAU tile')
  ok(await page.getByTestId('tile-revenueCents').isVisible(), 'revenue tile')
  const sla = await page.locator('[data-sla="reports"]').getAttribute('data-status')
  ok(sla === 'breach', `reports SLA should be red (seeded scam report > 12 h), got ${sla}`)
  ok((await page.getByTestId('line-chart').count()) === 1, 'trend chart rendered')
  await shot(page, 'admin', 'overview-desktop')
  // switch trend metric → revenue, then table view
  await page.getByTestId('trend-metric').click()
  await page.getByRole('option', { name: '营收', exact: true }).click()
  await page.getByRole('button', { name: '表格' }).click()
  ok(await page.getByRole('table', { name: '营收' }).isVisible(), 'trend table view')
  await page.getByRole('button', { name: '图表' }).click()
  // campus filter narrows the KPIs
  await page.goto('/admin?cid=uiuc&range=7d')
  await settle(page)
  ok(await page.getByText('伊利诺伊大学', { exact: false }).first().isVisible(), 'campus filter shows UIUC')
  console.log('[ok] overview, SLA strip, trend, campus filter')
}

step = 'users'
{
  await page.goto('/admin/users')
  await settle(page)
  await page.getByPlaceholder('搜索姓名、邮箱或 ID').fill('deals4')
  await page.waitForTimeout(700)
  await settle(page)
  await page.getByTestId('users-table').getByText('低价好物 Deals4Students').first().click()
  await page.getByTestId('user-drawer').waitFor()
  await shot(page, 'admin', 'user-drawer-desktop')
  await page.getByTestId('user-ban').click()
  await confirmReason(page, '私信推销半价手机，要求先付款')
  ok(await page.getByTestId('user-drawer').getByText('停用原因').isVisible(), 'banned reason shown after suspend')
  const audit = await A.api('GET', '/api/admin/audit?action=user.ban&pageSize=5')
  ok(audit.data.items.some((a) => a.reason?.includes('半价手机')), 'user.ban audited with reason')
  await page.getByTestId('user-drawer').getByRole('button', { name: '恢复' }).click()
  await confirmReason(page, '申诉已核实，测试恢复')
  ok(await page.getByTestId('user-drawer').getByText('正常').first().isVisible(), 'restored')
  await page.keyboard.press('Escape')
  console.log('[ok] users: search, drawer, suspend + restore')
}

step = 'reports'
{
  await page.goto('/admin/reports')
  await settle(page)
  ok(await page.getByTestId('reports-table').isVisible(), 'reports table')
  await shot(page, 'admin', 'reports-desktop')
  // open the oldest scam report on a sublet and hide it
  await page.goto('/admin/reports?r=adm-rp-01')
  await page.getByTestId('report-drawer').waitFor()
  ok(await page.getByText('诈骗特征检查').isVisible(), 'scam checklist')
  await page.getByText('要求平台外转账', { exact: false }).first().click()
  await shot(page, 'admin', 'report-drawer-desktop')
  await page.getByTestId('report-apply').click()
  await confirmReason(page, '房东要求 Zelle 预付定金，人在国外无法看房')
  ok(await page.getByTestId('report-drawer').getByText('已处理').first().isVisible(), 'report actioned')
  const r = await A.api('GET', '/api/admin/reports/adm-rp-01')
  ok(r.data.status === 'actioned' && r.data.entity.moderationStatus === 'hidden', 'listing hidden by the action')
  await page.keyboard.press('Escape')
  console.log('[ok] reports: review + hide action')
}

step = 'listings'
{
  await page.goto('/admin/listings')
  await settle(page)
  const table = page.getByTestId('moderation-table')
  await table.waitFor()
  const href = await table.locator('tbody a[href^="/listings/"]').first().getAttribute('href')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('j')
  await page.keyboard.press('x')
  const bar = page.getByRole('region', { name: '批量操作' })
  ok(await bar.getByText('已选 1 项').isVisible(), 'keyboard selection')
  await shot(page, 'admin', 'listings-bulk-desktop')
  await bar.getByRole('button', { name: '隐藏' }).click()
  await confirmReason(page, '照片与其他房源重复')
  const id = href.split('/').pop()
  const after = await A.api('GET', `/api/admin/listings?q=${id}`)
  ok(after.data.items[0]?.moderationStatus === 'hidden', 'bulk hide applied')
  const restore = await A.api('PATCH', `/api/admin/listings/${id}/moderation`, { moderationStatus: 'ok', reason: 'walkthrough restore' })
  ok(restore.status === 200, 'restore listing')
  console.log('[ok] listings: keyboard bulk hide + restore')
}

step = 'flags'
{
  const KEY = 'housing.tour_booking'
  await A.api('DELETE', `/api/admin/flags/${KEY}?reason=cleanup`)
  await page.goto('/admin/flags')
  await settle(page)
  await page.getByTestId('flag-new').click()
  await page.locator('input[name="flag-key"]').fill(KEY)
  await page.locator('input[name="flag-description"]').fill('Book a viewing slot from the listing page')
  await page.locator('textarea[name="flag-value"]').fill('{ "slotsPerDay": 6 }')
  await page.getByTestId('flag-save').click()
  await settle(page)
  const sw = page.locator(`[data-flag="${KEY}"]`)
  ok(await sw.isVisible(), 'new flag row')
  ok((await sw.getAttribute('aria-checked')) === 'false', 'new flag starts off')
  await sw.click()
  await confirmReason(page, '在西北校区试点看房预约')
  ok((await sw.getAttribute('aria-checked')) === 'true', 'flag turned on')
  const meta = await A.api('GET', '/api/meta')
  ok(meta.data?.flags?.[KEY] !== undefined, 'public flags include the new key')
  await shot(page, 'admin', 'flags-desktop')
  await page.getByRole('button', { name: `删除 ${KEY}` }).click()
  await confirmReason(page, '试点结束')
  ok((await page.locator(`[data-flag="${KEY}"]`).count()) === 0, 'flag deleted')
  const locked = await A.api('PUT', '/api/admin/flags/scam_banner.enabled', { enabled: false, reason: 'try' })
  ok(locked.status === 409, 'scam banner flag cannot be turned off')
  console.log('[ok] flags: create, toggle, delete; safety flag locked')
}

step = 'campuses'
{
  await page.goto('/admin/campuses?tab=requests')
  await settle(page)
  const t = page.getByTestId('requests-table')
  ok(await t.getByText('Stevens Institute of Technology').first().isVisible(), 'campus requests listed')
  await shot(page, 'admin', 'campus-requests-desktop')
  await t.getByRole('button', { name: '暂不开通' }).last().click()
  await confirmReason(page, '目前留学生用户太少')
  await page.goto('/admin/campuses')
  await settle(page)
  ok(await page.getByTestId('campuses-table').isVisible(), 'campus table')
  console.log('[ok] campuses + request triage')
}

step = 'audit'
{
  await page.goto('/admin/audit')
  await settle(page)
  ok(await page.getByTestId('audit-table').getByText('flag.delete').first().isVisible(), 'flag.delete in audit log')
  ok(await page.getByTestId('audit-table').getByText('report.action').first().isVisible(), 'report.action in audit log')
  await page.getByTestId('audit-table').getByText('flag.create').first().click()
  ok(await page.getByRole('dialog').getByText('修改后').isVisible(), 'audit diff dialog')
  await page.keyboard.press('Escape')
  await shot(page, 'admin', 'audit-desktop')
  await page.goto('/admin/audit?tab=events')
  await settle(page)
  ok(await page.getByTestId('events-table').isVisible(), 'event explorer')
  await page.goto('/admin/system')
  await settle(page)
  ok((await page.getByTestId('health-status').innerText()).includes('所有检查通过'), 'health ok')
  await shot(page, 'admin', 'system-desktop')
  console.log('[ok] audit log, events, system health')
}

step = 'module panels'
{
  for (const p of ['/admin/verify', '/admin/revenue', '/admin/shuttle', '/admin/market', '/admin/buddy', '/admin/wanted', '/admin/chat']) {
    await page.goto(p)
    await settle(page)
    ok((await page.getByRole('heading', { level: 1 }).count()) >= 1, `${p} renders a page heading`)
  }
  console.log('[ok] module panels mount inside the shell')
}
await finish(A.browser)

// 3 ---------------------------------------------------------------- mobile
step = 'mobile'
{
  const s = await session({ viewport: MOBILE })
  await s.page.goto('/admin')
  await settle(s.page)
  ok(await s.page.getByRole('heading', { name: '概览', level: 1 }).isVisible(), 'mobile overview')
  const sw = await s.page.evaluate(() => document.documentElement.scrollWidth)
  ok(sw <= 392, `no horizontal scroll on mobile (scrollWidth ${sw})`)
  await shot(s.page, 'admin', 'overview-mobile')
  await s.page.goto('/admin/reports')
  await settle(s.page)
  await shot(s.page, 'admin', 'reports-mobile')
  await finish(s.browser)
  console.log('[ok] mobile overview + reports')
}

// 4 ---------------------------------------------------------------- dark + English
step = 'dark'
{
  const s = await session({ theme: 'dark' })
  await s.page.emulateMedia({ colorScheme: 'dark' })
  await s.page.goto('/admin/revenue')
  await settle(s.page)
  ok(await s.page.getByTestId('revenue-streams').isVisible(), 'revenue streams')
  ok((await s.page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied')
  await shot(s.page, 'admin', 'revenue-dark')
  await finish(s.browser)
  console.log('[ok] dark revenue')
}
step = 'english'
{
  const s = await session({ lang: 'en' })
  await s.page.goto('/admin/flags')
  await settle(s.page)
  ok(await s.page.getByRole('heading', { name: 'Feature flags', level: 1 }).isVisible(), 'english flags heading')
  await shot(s.page, 'admin', 'flags-en-desktop')
  await s.page.request.patch('/api/users/me', { data: { locale: 'en' }, headers: { 'X-Requested-With': 'fetch' } })
  await finish(s.browser)
  console.log('[ok] english flags')
}

if (errors.length) {
  console.error('\nPage/console errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('\nadmin spec passed')
