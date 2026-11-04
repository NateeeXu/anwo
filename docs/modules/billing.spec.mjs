// Billing walkthrough (Playwright, pre-installed globally). Run with the billing server + web on their ports:
//   GEOCODE_OFFLINE=1 PORT=4109 DB_PATH=server/data/test-billing.db RATE_LIMIT_DISABLED=1 npm start -w server
//   VITE_PORT=5109 VITE_API_TARGET=http://127.0.0.1:4109 npm run dev -w web
//   node docs/modules/billing.spec.mjs
// Exercises: pricing (desktop/mobile, EN), Newcomer Kit + tracked /go redirect, Boost sheet → checkout (declined card, then
// 4242) → success, wallet promo error, Secure Payment create → accept (host) → fund → confirm move-in, Pro dashboard + leads,
// admin revenue panel (dark). Fails on any page error or console error, and if any billing i18n value says "escrow".
import fs from 'node:fs'
import { openApp, shot, finish, DESKTOP, MOBILE } from '../tools/shot.mjs'

const PORT = Number(process.env.WEB_PORT ?? 5109)
const errors = []
let step = ''
const ok = (cond, msg) => { if (!cond) throw new Error(`[${step}] ${msg}`) }

async function session({ email, viewport = DESKTOP, lang = 'zh', theme = 'light' } = {}) {
  const app = await openApp({ webPort: PORT, viewport, lang })
  const { context, page, base } = app
  await context.addCookies([{ name: 'campus', value: 'northwestern', url: base }, { name: 'lang', value: lang === 'en' ? 'en' : 'zh-CN', url: base }])
  await context.addInitScript((t) => { try { localStorage.setItem('theme', t) } catch {} }, theme)
  page.on('pageerror', (e) => errors.push(`${step}: pageerror ${e.message}`))
  // anonymous sessions legitimately get 401 from /api/auth/me and expected 4xx (PAYMENT_FAILED, PROMO_INVALID) are logged by the browser
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|402|400)\b/.test(m.text())) errors.push(`${step}: console ${m.text().slice(0, 200)}`) })
  let user = null
  if (email) {
    const res = await page.request.post('/api/auth/login', { data: { email, password: 'Passw0rd!' }, headers: { 'X-Requested-With': 'fetch' } })
    ok(res.ok(), `login ${email} → ${res.status()}`)
    user = (await res.json()).data
  }
  const api = async (path, opts = {}) => {
    const r = opts.body ? await page.request.post(path, { data: opts.body, headers: { 'X-Requested-With': 'fetch' } }) : await page.request.get(path, { headers: { 'X-Requested-With': 'fetch' } })
    const j = await r.json().catch(() => ({}))
    return { status: r.status(), data: j.data, error: j.error }
  }
  return { ...app, user, api }
}
const settle = async (page) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(400) }

// 0 ---------------------------------------------------------------- copy rule: no "escrow" in any user-facing billing string
step = 'i18n'
{
  const src = fs.readFileSync('/home/user/campus-sublet/web/src/i18n/billing.ts', 'utf8')
  const bad = [...src.matchAll(/'billing\.[^']+':\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((v) => /escrow/i.test(v))
  ok(bad.length === 0, `i18n values mention escrow: ${bad.join(' | ')}`)
  console.log('[ok] i18n has no "escrow" copy')
}

// 1 ---------------------------------------------------------------- anonymous: pricing, kit, tracked outbound
step = 'anon'
{
  const s = await session()
  await s.page.goto('/pricing'); await settle(s.page)
  ok(await s.page.getByRole('heading', { name: '免费发布，按需加速。' }).isVisible(), 'pricing headline')
  ok(await s.page.getByText('测试模式 Test mode').first().isVisible(), 'test-mode band on pricing')
  await shot(s.page, 'billing', 'pricing-desktop')
  await s.page.getByRole('button', { name: '为什么有些推广需要上传租约？' }).click()
  await s.page.getByRole('radio', { name: '商家' }).click(); await settle(s.page)
  ok(await s.page.getByText('认证楼盘页').first().isVisible(), 'business tab rate card')
  await s.page.goto('/kit'); await settle(s.page)
  ok(await s.page.getByText('我们可能从合作伙伴获得佣金，不影响你的价格。').first().isVisible(), 'kit disclosure')
  ok(await s.page.getByText('无赞助').first().isVisible(), 'non-sponsored option present')
  await s.page.getByRole('checkbox', { name: /大通学生支票账户/ }).first().check()
  await shot(s.page, 'billing', 'kit-desktop')
  const go = await s.page.request.get('/api/billing/partners/chase-college-checking/go?placement=kit&campusId=northwestern', { maxRedirects: 0 })
  ok(go.status() === 302 && /chase\.com/.test(go.headers()['location'] ?? ''), `tracked /go redirect (${go.status()})`)
  ok(/subid=[0-9a-f-]{36}/.test(go.headers()['location']), 'click id substituted into affiliate url')
  await s.page.goto('/kit/chase-college-checking'); await settle(s.page)
  ok(await s.page.getByRole('link', { name: /前往 大通学生支票账户/ }).getAttribute('rel') === 'sponsored noopener', 'rel=sponsored on outbound')
  await finish(s.browser)

  const m = await session({ viewport: MOBILE })
  await m.page.goto('/pricing'); await settle(m.page)
  await shot(m.page, 'billing', 'pricing-mobile', { fullPage: true })
  await m.page.goto('/kit/share/uiuc'); await settle(m.page)
  ok(await m.page.getByText('芝加哥—香槟班车').first().isVisible(), 'UIUC share page shows the campus-scoped partner')
  await shot(m.page, 'billing', 'kit-share-uiuc-mobile')
  await finish(m.browser)
  console.log('[ok] anonymous pricing + kit')
}

// 2 ---------------------------------------------------------------- alice: boost an item → checkout (decline, then 4242) → success
step = 'boost'
{
  const s = await session({ email: 'alice@u.northwestern.edu' })
  const items = await s.api(`/api/market/items?sellerId=${s.user.id}&pageSize=20`)
  const item = (items.data?.items ?? []).find((i) => i.status === 'active')
  ok(item, 'alice has an active market item')
  await s.page.goto(`/pricing?boost=market_item:${item.id}`); await settle(s.page)
  const sheet = s.page.getByRole('dialog')
  ok(await sheet.getByText('推广这条发布').isVisible(), 'boost sheet opened from deep link')
  await sheet.getByRole('radio', { name: /3 天/ }).click()
  const walletSwitch = sheet.getByRole('switch', { name: /使用钱包额度/ })
  if (await walletSwitch.count()) { if ((await walletSwitch.getAttribute('aria-checked')) === 'true') await walletSwitch.click() }
  await shot(s.page, 'billing', 'boost-sheet-desktop')
  await sheet.getByRole('button', { name: /去结账/ }).click()
  await s.page.waitForURL(/\/checkout\//); await settle(s.page)
  ok(await s.page.getByText('测试模式 Test mode').first().isVisible(), 'test-mode band on checkout')
  await s.page.getByLabel('卡号').fill('4000 0000 0000 0002')
  await s.page.getByLabel('有效期').fill('12/30')
  await s.page.getByLabel('安全码').fill('123')
  await s.page.getByRole('button', { name: /支付 .* 测试模式/ }).click()
  await s.page.getByRole('alert').filter({ hasText: '卡片被拒绝' }).waitFor()
  await shot(s.page, 'billing', 'checkout-declined-desktop')
  await s.page.getByLabel('卡号').fill('4242 4242 4242 4242')
  await s.page.getByRole('button', { name: /支付 .* 测试模式/ }).click()
  await s.page.waitForURL(/\/billing\/success/); await settle(s.page)
  ok(await s.page.getByRole('heading', { name: '推广已开始' }).isVisible(), 'success heading')
  await shot(s.page, 'billing', 'checkout-success-desktop')
  const boosts = await s.api('/api/billing/boosts?status=active')
  ok((boosts.data?.items ?? []).some((b) => b.entityId === item.id), 'boost row exists for the item')

  await s.page.goto('/wallet'); await settle(s.page)
  await s.page.getByLabel('兑换码').fill('NOPE123')
  await s.page.getByRole('button', { name: '兑换' }).click()
  await s.page.getByText('找不到这个优惠码').waitFor()
  await finish(s.browser)

  const m = await session({ email: 'alice@u.northwestern.edu', viewport: MOBILE })
  await m.page.goto('/wallet'); await settle(m.page)
  await shot(m.page, 'billing', 'wallet-mobile', { fullPage: true })
  await m.page.goto('/billing/boosts'); await settle(m.page)
  await shot(m.page, 'billing', 'my-boosts-mobile')
  await finish(m.browser)
  console.log('[ok] boost purchase + checkout + wallet')
}

// 3 ---------------------------------------------------------------- Secure Payment: nina proposes → landlord accepts → nina funds → confirms move-in
step = 'secure'
{
  const host = await session({ email: 'landlord@evanstonhomes.com' })
  const listings = await host.api(`/api/listings?ownerId=${host.user.id}&scope=nationwide&pageSize=20`)
  const listing = (listings.data?.items ?? []).find((l) => l.status === 'active')
  ok(listing, 'landlord has an active listing')

  const s = await session({ email: 'nina.zhou@u.northwestern.edu' })
  await s.page.goto(`/escrow/new?listingId=${listing.id}`); await settle(s.page)
  const moveIn = new Date(Date.now() + (30 + Math.floor(Math.random() * 300)) * 86400_000).toISOString().slice(0, 10)
  await s.page.getByLabel('押金金额').fill('1500')
  await s.page.getByLabel('入住日期').fill(moveIn)
  await settle(s.page)
  ok(await s.page.getByText('服务费 3%').first().isVisible(), 'fee shown as its own line before paying')
  await shot(s.page, 'billing', 'secure-new-desktop')
  await s.page.getByRole('button', { name: '发送给对方' }).click()
  await s.page.waitForURL(/\/escrow\/[^n]/); await settle(s.page)
  const escrowId = s.page.url().split('/escrow/')[1]

  const acc = await host.api(`/api/billing/escrows/${escrowId}/accept`, { body: {} })
  ok(acc.status === 200 && acc.data.status === 'accepted', `host accepts (${acc.status} ${acc.error?.code ?? ''})`)
  await finish(host.browser)

  await s.page.reload(); await settle(s.page)
  await s.page.getByRole('button', { name: /^支付 / }).click()
  const dlg = s.page.getByRole('dialog')
  await dlg.getByText('支付押金').waitFor()
  await settle(s.page, 800) // saved cards load after the dialog opens and replace the card form when present
  if (await dlg.getByLabel('卡号').count()) { await dlg.getByLabel('卡号').fill('4242424242424242'); await dlg.getByLabel('有效期').fill('12/30'); await dlg.getByLabel('安全码').fill('123') }
  await dlg.getByRole('button', { name: /支付 .* 测试模式/ }).click()
  await s.page.waitForURL(/\/billing\/success/); await settle(s.page)
  ok(await s.page.getByRole('heading', { name: '押金已存入安心付' }).isVisible(), 'deposit success page')
  await s.page.goto(`/escrow/${escrowId}`); await settle(s.page)
  ok(await s.page.getByText('押金已存入').first().isVisible(), 'funded state')
  await s.page.getByRole('button', { name: '确认入住，放款' }).click()
  await s.page.getByRole('dialog').getByRole('button', { name: '确认放款' }).click()
  await s.page.getByText('押金已放款给房东。').waitFor()
  await finish(s.browser)

  const d = await session({ email: 'nina.zhou@u.northwestern.edu', theme: 'dark', lang: 'en' })
  await d.page.goto(`/escrow/${escrowId}`); await settle(d.page)
  const h1 = d.page.getByRole('heading', { level: 1, name: 'Secure Payment' })
  if (!(await h1.isVisible().catch(() => false))) { await d.page.getByRole('radio', { name: 'EN' }).first().click(); await settle(d.page) }
  ok(await h1.isVisible(), 'EN copy')
  ok(await d.page.getByText('Released', { exact: true }).first().isVisible(), 'released state in EN')
  await shot(d.page, 'billing', 'secure-detail-dark-en')
  await d.page.getByRole('radio', { name: '中' }).first().click(); await settle(d.page)
  await finish(d.browser)
  console.log('[ok] Secure Payment propose → accept → fund → release')
}

// 4 ---------------------------------------------------------------- landlord Pro dashboard + lead inbox
step = 'pro'
{
  const s = await session({ email: 'landlord@evanstonhomes.com' })
  await s.page.goto('/pro'); await settle(s.page)
  ok(await s.page.getByRole('heading', { name: 'Pro 后台' }).isVisible(), 'Pro dashboard')
  await shot(s.page, 'billing', 'pro-dashboard-desktop')
  await s.page.getByRole('radio', { name: '线索' }).click(); await settle(s.page)
  ok(await s.page.getByText('只显示对方的信任等级').isVisible(), 'lead privacy note')
  await shot(s.page, 'billing', 'pro-leads-desktop')
  await finish(s.browser)
  const m = await session({ email: 'bob@u.northwestern.edu', viewport: MOBILE })
  await m.page.goto('/pro'); await settle(m.page)
  ok(await m.page.getByText('先完成房东验证').isVisible(), 'badge gate for non-landlords')
  await shot(m.page, 'billing', 'pro-gate-mobile')
  await finish(m.browser)
  console.log('[ok] Pro')
}

// 5 ---------------------------------------------------------------- admin revenue panel (dark) + disputes
step = 'admin'
{
  const s = await session({ email: 'admin@example.edu', theme: 'dark' })
  await s.page.goto('/billing/admin'); await settle(s.page)
  ok(await s.page.getByRole('heading', { name: '营收' }).isVisible(), 'admin revenue heading')
  ok(await s.page.getByText('待处理争议').isVisible(), 'disputes block')
  await shot(s.page, 'billing', 'admin-revenue-dark', { fullPage: true })
  const rev = await s.api('/api/billing/admin/revenue')
  ok(rev.data.totals.revenueCents > 0 && rev.data.series.length >= 28, 'revenue series present')
  await finish(s.browser)
  console.log('[ok] admin')
}

// 5 ---------------------------------------------------------------- sponsored click accounting: card link ?boost=<id> → boosts.clicks + 1
step = 'boost-click'
{
  const a = await session({ email: 'admin@example.edu' })
  const list = await a.api('/api/listings?campusId=northwestern&pageSize=20')
  const sp = (list.data?.items ?? []).find((l) => l.sponsored && l.boostId)
  ok(sp, 'a sponsored listing card carries its boostId')
  if (sp) {
    const before = (await a.api(`/api/billing/boosts/${sp.boostId}/stats`)).data?.boost?.clicks ?? 0
    const v = await session({ email: 'bob@u.northwestern.edu' })
    // the detail page fetches GET /api/listings/:id?boost=<id> (Detail.tsx); call it directly — the page itself loads
    // OSM tiles, which the offline sandbox cannot reach
    const det = await v.api(`/api/listings/${sp.id}?boost=${sp.boostId}`)
    ok(det.status === 200, 'sponsored detail loads')
    await finish(v.browser)
    const after = (await a.api(`/api/billing/boosts/${sp.boostId}/stats`)).data?.boost?.clicks ?? 0
    ok(after >= before + 1, `boosts.clicks increments on a sponsored click (${before} → ${after})`)
  }
  const home = await a.api('/api/billing/sponsorships?campusId=northwestern&surface=home_feed')
  ok((home.data?.items ?? []).length >= 1 && (home.data?.items ?? []).length <= 3, 'home feed sponsors: 1–3 labelled cards')
  await finish(a.browser)
  console.log('[ok] boost click accounting + sponsored placements')
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('billing spec passed')
