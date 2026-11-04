// server/src/db/seed/billing.ts — OWNED BY THE `billing` MODULE AGENT.
// Pricing plans (billing-requirements §1), promo codes (§6), 24 Newcomer Kit partners (§5, logos /uploads/seed/partners/p01..p20.svg),
// 30+ historical orders/payments over the last 60 days (admin charts), boosts (NU rich, UIUC/NYU light, 2 nationwide),
// Pro subscriptions, Secure Payments in six states, referral chain, alice's wallet history, 30 days of partner clicks.
// Idempotent: every row we own carries a `bil-` id prefix (plans use the fixed b111… ids) and is deleted before insert.
import type { DatabaseSync } from 'node:sqlite';
import { q } from '../index';
import { insertSeedUpload } from '../../lib/uploads';
import { DAY, HOUR, nowIso, nowMs } from '../../lib/time';
import { sha256 } from '../../lib/ids';
import { seedUserId } from './core';

export const version = 5;

const PLAN_ID = (n: number) => `b1110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function bid(key: string): string {
  return `bil-${sha256(`billing:${key}`).slice(0, 20)}`;
}
function iso(msAgo: number): string {
  return new Date(nowMs() - msAgo).toISOString();
}
function userByEmail(email: string): string | null {
  return q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])?.id ?? seedUserId(email);
}

type PlanSpec = { n: number; key: string; kind: 'boost' | 'subscription' | 'escrow_fee' | 'service'; entity?: 'listing' | 'market_item' | 'buddy_post'; tier?: 'basic' | 'plus' | 'max'; days?: number; interval?: 'month' | 'year'; price: number; feeBps?: number; feeMin?: number; feeCap?: number; name: string; nameZh: string; desc?: string; descZh?: string; sort: number; minTrust?: number; badge?: string; addonFor?: string; selfServe?: boolean; active?: boolean; features?: string[] };
const PLANS: PlanSpec[] = [
  { n: 1, key: 'boost.listing.basic.3d', kind: 'boost', entity: 'listing', tier: 'basic', days: 3, price: 900, name: 'Boost · 3 days', nameZh: '推广 · 3 天', sort: 10, features: ['featuredSlots', 'boostedLabel'] },
  { n: 2, key: 'boost.listing.basic.7d', kind: 'boost', entity: 'listing', tier: 'basic', days: 7, price: 1900, name: 'Boost · 7 days', nameZh: '推广 · 7 天', sort: 11, features: ['featuredSlots', 'boostedLabel'] },
  { n: 3, key: 'boost.listing.basic.14d', kind: 'boost', entity: 'listing', tier: 'basic', days: 14, price: 3900, name: 'Boost · 14 days', nameZh: '推广 · 14 天', sort: 12, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel'] },
  { n: 4, key: 'boost.listing.basic.30d', kind: 'boost', entity: 'listing', tier: 'basic', days: 30, price: 6900, name: 'Boost · 30 days', nameZh: '推广 · 30 天', sort: 13, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel'] },
  { n: 5, key: 'boost.listing.plus.7d', kind: 'boost', entity: 'listing', tier: 'plus', days: 7, price: 2900, name: 'Boost Plus · 7 days (top of map)', nameZh: '推广 Plus · 7 天（地图置顶）', sort: 20, minTrust: 2, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel', 'mapTop'] },
  { n: 6, key: 'boost.listing.plus.14d', kind: 'boost', entity: 'listing', tier: 'plus', days: 14, price: 5900, name: 'Boost Plus · 14 days', nameZh: '推广 Plus · 14 天', sort: 21, minTrust: 2, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel', 'mapTop'] },
  { n: 7, key: 'boost.listing.max.7d', kind: 'boost', entity: 'listing', tier: 'max', days: 7, price: 4900, name: 'Boost Max · 7 days (home carousel)', nameZh: '推广 Max · 7 天（首页轮播）', sort: 30, minTrust: 2, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel', 'mapTop', 'homeSlot'] },
  { n: 8, key: 'boost.listing.max.14d', kind: 'boost', entity: 'listing', tier: 'max', days: 14, price: 8900, name: 'Boost Max · 14 days', nameZh: '推广 Max · 14 天', sort: 31, minTrust: 2, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel', 'mapTop', 'homeSlot'] },
  { n: 9, key: 'boost.listing.spotlight', kind: 'service', entity: 'listing', price: 1000, name: 'Nationwide Spotlight (add-on)', nameZh: '全美曝光（加购）', sort: 40, badge: 'supply_proof', addonFor: 'boost.listing.*', features: ['nationwide'] },
  { n: 10, key: 'boost.market_item.basic.1d', kind: 'boost', entity: 'market_item', tier: 'basic', days: 1, price: 299, name: 'Item boost · 1 day', nameZh: '二手推广 · 1 天', sort: 50, features: ['featuredSlots', 'boostedLabel'] },
  { n: 11, key: 'boost.market_item.basic.3d', kind: 'boost', entity: 'market_item', tier: 'basic', days: 3, price: 499, name: 'Item boost · 3 days', nameZh: '二手推广 · 3 天', sort: 51, features: ['featuredSlots', 'boostedLabel'] },
  { n: 12, key: 'boost.market_item.basic.7d', kind: 'boost', entity: 'market_item', tier: 'basic', days: 7, price: 999, name: 'Item boost · 7 days', nameZh: '二手推广 · 7 天', sort: 52, features: ['featuredSlots', 'boostedLabel'] },
  { n: 13, key: 'boost.bundle.basic.7d', kind: 'boost', entity: 'market_item', tier: 'basic', days: 7, price: 999, name: 'Move-out bundle boost · 7 days', nameZh: '打包推广 · 7 天', sort: 53, features: ['featuredSlots', 'boostedLabel', 'bundle'] },
  { n: 14, key: 'boost.buddy_post.basic.1d', kind: 'boost', entity: 'buddy_post', tier: 'basic', days: 1, price: 199, name: 'Event boost · 1 day', nameZh: '搭子推广 · 1 天', sort: 60, features: ['featuredSlots', 'boostedLabel'] },
  { n: 15, key: 'boost.buddy_post.basic.3d', kind: 'boost', entity: 'buddy_post', tier: 'basic', days: 3, price: 499, name: 'Event boost · 3 days', nameZh: '搭子推广 · 3 天', sort: 61, features: ['featuredSlots', 'boostedLabel'] },
  { n: 16, key: 'pack.moving_out', kind: 'service', entity: 'listing', price: 4400, name: 'Moving-out pack (14-day boost + bundle boost)', nameZh: '搬家打包（14 天推广 + 打包推广）', sort: 70, badge: 'supply_proof', features: ['featuredSlots', 'boostedLabel', 'bundle'] },
  { n: 17, key: 'pro.monthly', kind: 'subscription', interval: 'month', price: 2900, name: 'Landlord Pro · monthly', nameZh: '房东 Pro · 月付', sort: 100, minTrust: 3, badge: 'landlord_proof', features: ['unlimitedListings', 'leadInbox', 'analytics', 'badge', 'monthlyBoost'] },
  { n: 18, key: 'pro.yearly', kind: 'subscription', interval: 'year', price: 24900, name: 'Landlord Pro · yearly', nameZh: '房东 Pro · 年付', sort: 101, minTrust: 3, badge: 'landlord_proof', features: ['unlimitedListings', 'leadInbox', 'analytics', 'badge', 'monthlyBoost', 'yearlySavings'] },
  { n: 19, key: 'proplus.monthly', kind: 'subscription', interval: 'month', price: 7900, name: 'Landlord Pro+ · monthly', nameZh: '房东 Pro+ · 月付', sort: 110, minTrust: 3, badge: 'landlord_proof', features: ['unlimitedListings', 'leadInbox', 'analytics', 'badge', 'monthlyBoost3', 'seats', 'csvImport', 'leadExport'] },
  { n: 20, key: 'proplus.yearly', kind: 'subscription', interval: 'year', price: 69900, name: 'Landlord Pro+ · yearly', nameZh: '房东 Pro+ · 年付', sort: 111, minTrust: 3, badge: 'landlord_proof', features: ['unlimitedListings', 'leadInbox', 'analytics', 'badge', 'monthlyBoost3', 'seats', 'csvImport', 'leadExport', 'yearlySavings'] },
  { n: 21, key: 'escrow.standard', kind: 'escrow_fee', price: 0, feeBps: 300, feeMin: 500, feeCap: 6000, name: 'Secure Payment service fee', nameZh: '安心付服务费', sort: 200, minTrust: 3, features: ['heldUntilMoveIn', 'inspectionWindow', 'disputes'] },
  { n: 22, key: 'sponsor.local', kind: 'service', days: 30, price: 15000, name: 'Local Sponsor (per campus / month)', nameZh: '校园赞助 · 基础', sort: 300, selfServe: false, features: ['kitPlacement'] },
  { n: 23, key: 'sponsor.feed', kind: 'service', days: 30, price: 35000, name: 'Feed Sponsor', nameZh: '校园赞助 · 首页', sort: 301, selfServe: false, features: ['kitPlacement', 'homeFeed'] },
  { n: 24, key: 'sponsor.campus', kind: 'service', days: 30, price: 60000, name: 'Campus Partner', nameZh: '校园赞助 · 合作伙伴', sort: 302, selfServe: false, features: ['kitPlacement', 'homeFeed', 'digest', 'events'] },
  { n: 25, key: 'building.verified', kind: 'service', days: 30, price: 50000, name: 'Verified Building page', nameZh: '认证楼盘页', sort: 310, selfServe: false },
  { n: 26, key: 'building.verified.small', kind: 'service', days: 30, price: 30000, name: 'Verified Building page (≤ 50 beds)', nameZh: '认证楼盘页（≤50 床位）', sort: 311, selfServe: false },
  { n: 27, key: 'building.verified.metro', kind: 'service', days: 30, price: 100000, name: 'Verified Building · metro-wide', nameZh: '认证楼盘页 · 全都市圈', sort: 312, selfServe: false },
  { n: 28, key: 'building.lease_fee', kind: 'service', price: 30000, name: 'Attributed lease fee (12 mo)', nameZh: '签约归因费（12 个月）', sort: 320, selfServe: false },
  { n: 29, key: 'building.lease_fee.short', kind: 'service', price: 15000, name: 'Attributed lease fee (≤ 6 mo)', nameZh: '签约归因费（≤6 个月）', sort: 321, selfServe: false },
  { n: 30, key: 'viewing.badge', kind: 'service', entity: 'listing', price: 2900, name: 'Verified Viewing badge', nameZh: '认证实地看房', sort: 400, active: false, features: ['payout1800'] },
  { n: 31, key: 'viewing.private', kind: 'service', entity: 'listing', price: 3900, name: 'Private viewing report', nameZh: '私人看房报告', sort: 401, active: false, features: ['payout2500'] },
];

type PartnerSpec = { slug: string; name: string; nameZh: string; cat: string; tag: string; tagZh: string; promo?: string; promoZh?: string; payout: number; model?: string; network?: string; noSsn: boolean; url: string; site: string; sort: number; sponsored?: boolean; campus?: string; states?: string[]; sub?: string; stages: string[]; feeFree?: boolean; branch?: boolean; needs: string[]; desc: string; descZh: string; logo: number };
const PARTNERS: PartnerSpec[] = [
  { slug: 'chase-college-checking', name: 'Chase College Checking', nameZh: '大通学生支票账户', cat: 'bank', tag: 'Passport + I-20 accepted at branch; largest ATM network', tagZh: '凭护照 + I-20 即可开户，网点最多', promo: 'New-account bonus up to $100–300 (varies)', promoZh: '新开户奖励最高 $100–300（以官网为准）', payout: 7500, network: 'cj', noSsn: true, url: 'https://www.chase.com/personal/checking/college-checking?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.chase.com', sort: 10, stages: ['first_7_days'], branch: true, needs: ['passport', 'i20', 'address'], desc: 'The most common first bank account for international students: branches next to most campuses, a large ATM network, and a mobile app that works with Zelle. Bring your passport, I-20 and a local address; no SSN is required to open at a branch.', descZh: '留学生最常见的第一个银行账户：校园附近网点多，ATM 覆盖广，手机 App 支持 Zelle。带上护照、I-20 和本地地址即可在网点开户，无需 SSN。', logo: 1 },
  { slug: 'bofa-safebalance', name: 'Bank of America Advantage SafeBalance', nameZh: '美国银行学生账户', cat: 'bank', tag: 'No overdraft fees; campus branches', tagZh: '无透支费，校园附近有网点', promo: 'Periodic $200–300 bonus', promoZh: '不定期开户奖励', payout: 6000, network: 'impact', noSsn: true, url: 'https://www.bankofamerica.com/deposits/checking/advantage-banking/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.bankofamerica.com', sort: 11, stages: ['first_7_days'], branch: true, needs: ['passport', 'i20', 'address'], desc: 'A checking account with no overdraft fees and a $0 monthly fee for students under 25. Useful if your campus has a Bank of America branch nearby.', descZh: '无透支费，25 岁以下学生免月费。校园附近有网点的话很方便。', logo: 2 },
  { slug: 'wells-fargo-clear-access', name: 'Wells Fargo Clear Access Banking', nameZh: '富国银行', cat: 'bank', tag: 'Open with passport + ITIN or I-20', tagZh: '护照 + I-20 可开户', promo: 'Periodic $300 bonus', promoZh: '不定期奖励', payout: 6000, network: 'flexoffers', noSsn: true, url: 'https://www.wellsfargo.com/checking/clear-access-banking/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.wellsfargo.com', sort: 12, stages: ['first_7_days'], branch: true, needs: ['passport', 'i20'], desc: 'Checkless account with no overdraft fees. A solid alternative when Chase and Bank of America branches are far from campus.', descZh: '无支票、无透支费的账户。校园附近没有大通或美国银行网点时的好选择。', logo: 3 },
  { slug: 'zolve', name: 'Zolve', nameZh: 'Zolve 留学生账户', cat: 'bank', tag: 'Account + credit card before you land, no SSN', tagZh: '落地前即可开户，无需 SSN', promo: '$25–50 welcome', promoZh: '新用户奖励', payout: 5000, network: 'direct', noSsn: true, url: 'https://www.zolve.com/?ref=campus-sublet&subid={{clickId}}', site: 'https://www.zolve.com', sort: 13, stages: ['before_you_fly'], needs: ['passport', 'i20'], desc: 'Open a US account and credit card from your home country before you fly, so your card is ready on day one.', descZh: '出发前就能在国内开好美国账户和信用卡，落地当天即可使用。', logo: 4 },
  { slug: 'campus-credit-union', name: 'Campus credit union', nameZh: '校园信用社', cat: 'bank', tag: 'Member-owned, no bonus, no referral fee', tagZh: '会员所有，无开户奖励，我们不收佣金', payout: 0, noSsn: true, url: 'https://www.mycreditunion.gov/?utm_source=campus-sublet', site: 'https://www.mycreditunion.gov', sort: 14, sponsored: false, stages: ['first_month'], feeFree: true, branch: true, needs: ['passport', 'i20'], desc: 'Most universities have a member-owned credit union on campus. Lower fees, friendlier service, and we earn nothing when you join — listed so you always have a non-sponsored option.', descZh: '多数大学都有校园信用社：费用更低、服务更友好。我们不从中获得任何佣金，列出来是为了让你总有一个无赞助的选择。', logo: 5 },
  { slug: 'discover-it-student', name: 'Discover it Student Card', nameZh: 'Discover 学生信用卡', cat: 'bank', tag: 'First credit card, cashback match', tagZh: '第一张信用卡，返现翻倍', promo: 'Up to $100 referral credit (verify current terms)', promoZh: '最高 $100 奖励', payout: 7500, network: 'cj', noSsn: false, url: 'https://www.discover.com/credit-cards/student-credit-card/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.discover.com', sort: 20, sub: 'credit_card', stages: ['first_month'], needs: ['ssn', 'address'], desc: 'A starter credit card that matches all the cashback you earn in the first year. Requires an SSN, so apply after you have one from on-campus work.', descZh: '第一年返现翻倍的入门信用卡。需要 SSN，适合校内工作拿到 SSN 后申请。', logo: 6 },
  { slug: 'deserve-edu', name: 'Deserve EDU Mastercard', nameZh: 'Deserve 留学生信用卡', cat: 'bank', tag: 'No SSN, no credit history needed', tagZh: '无需 SSN 与信用记录', promo: '$30 welcome', promoZh: '新卡奖励', payout: 5000, network: 'direct', noSsn: true, url: 'https://www.deserve.com/edu?ref=campus-sublet&subid={{clickId}}', site: 'https://www.deserve.com', sort: 21, sub: 'credit_card', stages: ['first_month'], needs: ['passport', 'i20', 'bankAccount'], desc: 'Built for international students: no SSN or credit history required, 1% cashback, and it starts your US credit file.', descZh: '专为留学生设计：无需 SSN 和信用记录，1% 返现，帮你开始积累美国信用。', logo: 7 },
  { slug: 'mint-mobile', name: 'Mint Mobile', nameZh: 'Mint 手机卡', cat: 'sim', tag: 'T-Mobile network, from $15/mo', tagZh: 'T-Mobile 网络，$15 起', promo: '$45–60 referral credit', promoZh: '推荐返 $45–60', payout: 2500, network: 'impact', noSsn: true, url: 'https://www.mintmobile.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.mintmobile.com', sort: 30, stages: ['before_you_fly', 'first_7_days'], needs: ['unlockedPhone'], desc: 'Prepaid plans on the T-Mobile network, paid 3–12 months upfront. Order the SIM before you fly so you have a US number on arrival.', descZh: 'T-Mobile 网络的预付费套餐，一次买 3–12 个月。出发前先寄 SIM 卡，落地就有美国号码。', logo: 8 },
  { slug: 'visible', name: 'Visible by Verizon', nameZh: 'Visible 手机卡', cat: 'sim', tag: 'Unlimited on Verizon, $25/mo', tagZh: 'Verizon 无限流量', promo: '$20 credit each', promoZh: '双方各 $20', payout: 2000, network: 'impact', noSsn: true, url: 'https://www.visible.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.visible.com', sort: 31, stages: ['first_7_days'], needs: ['unlockedPhone'], desc: 'Unlimited data on the Verizon network with no contract. Good coverage in college towns where T-Mobile is weaker.', descZh: 'Verizon 网络无限流量，无合约。在 T-Mobile 信号弱的大学城覆盖更好。', logo: 9 },
  { slug: 'ultra-mobile', name: 'Ultra Mobile', nameZh: 'Ultra 手机卡（含中国通话）', cat: 'sim', tag: 'Plans with free calls to China', tagZh: '含免费拨打中国', payout: 1500, network: 'direct', noSsn: true, url: 'https://www.ultramobile.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.ultramobile.com', sort: 32, stages: ['first_7_days'], needs: ['unlockedPhone'], desc: 'Plans that include unlimited calls to China and other countries, on the T-Mobile network.', descZh: '套餐包含无限拨打中国等国家的通话，使用 T-Mobile 网络。', logo: 10 },
  { slug: 'airalo', name: 'Airalo eSIM', nameZh: 'Airalo 旅行 eSIM', cat: 'sim', tag: 'Data from the moment you land', tagZh: '落地即有流量', promo: '$3 credit', promoZh: '$3 抵扣', payout: 500, network: 'direct', noSsn: true, url: 'https://www.airalo.com/?ref=campus-sublet&subid={{clickId}}', site: 'https://www.airalo.com', sort: 33, stages: ['before_you_fly'], needs: ['esimPhone'], desc: 'A travel eSIM you install before departure, so maps and messaging work the moment you land. Bridge the first days until your US SIM arrives.', descZh: '出发前装好的旅行 eSIM，落地就能用地图和消息。过渡到美国 SIM 卡到手为止。', logo: 11 },
  { slug: 'lemonade-renters', name: 'Lemonade Renters Insurance', nameZh: 'Lemonade 租房保险', cat: 'insurance', tag: 'From $5/mo; often required by your lease', tagZh: '$5 起，很多租约要求', payout: 2000, network: 'impact', noSsn: true, url: 'https://www.lemonade.com/renters?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.lemonade.com', sort: 40, stages: ['first_month'], needs: ['address', 'bankAccount'], desc: 'Covers your belongings and liability for a few dollars a month. Many leases require proof of renters insurance before move-in.', descZh: '每月几美元保障个人物品和责任险。很多租约在入住前要求提供租房保险证明。', logo: 12 },
  { slug: 'toggle-renters', name: 'Toggle (Farmers)', nameZh: 'Toggle 租房保险', cat: 'insurance', tag: 'Month-to-month, covers roommates\' stuff optionally', tagZh: '按月付，可选覆盖室友物品', payout: 1500, network: 'cj', noSsn: true, url: 'https://www.gettoggle.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.gettoggle.com', sort: 41, stages: ['first_month'], needs: ['address', 'bankAccount'], desc: 'Month-to-month renters insurance from Farmers that you can cancel any time — handy for short sublets.', descZh: 'Farmers 旗下按月付的租房保险，随时可取消，适合短期转租。', logo: 13 },
  { slug: 'wise', name: 'Wise', nameZh: 'Wise 跨境汇款', cat: 'other', tag: 'Real exchange rate, CNY→USD', tagZh: '真实汇率', promo: 'Fee-free first transfer up to a cap', promoZh: '首笔免手续费', payout: 1500, network: 'direct', noSsn: true, url: 'https://wise.com/?ref=campus-sublet&subid={{clickId}}', site: 'https://wise.com', sort: 50, sub: 'transfer', stages: ['before_you_fly', 'first_month'], feeFree: true, needs: ['passport', 'bankAccount'], desc: 'Transfers at the mid-market exchange rate with a transparent fee. Good for tuition and rent deposits from home.', descZh: '按市场中间价换汇，手续费透明。适合从国内汇学费和押金。', logo: 14 },
  { slug: 'remitly', name: 'Remitly', nameZh: 'Remitly 汇款', cat: 'other', tag: 'Fast transfers, mobile first', tagZh: '到账快，手机操作', promo: '$5–25 in-app bonus', promoZh: '应用内奖励', payout: 2000, network: 'impact', noSsn: true, url: 'https://www.remitly.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.remitly.com', sort: 51, sub: 'transfer', stages: ['first_month'], needs: ['bankAccount'], desc: 'Mobile-first remittances with fast delivery; first transfers often carry a promotional rate.', descZh: '手机端汇款，到账快，首笔通常有优惠汇率。', logo: 15 },
  { slug: 'panda-remit', name: 'Panda Remit', nameZh: '熊猫速汇', cat: 'other', tag: 'CNY→USD with WeChat support', tagZh: '微信直达客服', promo: '¥30–50 referral', promoZh: '推荐返 ¥30–50', payout: 1000, network: 'direct', noSsn: true, url: 'https://www.pandaremit.com/?ref=campus-sublet&subid={{clickId}}', site: 'https://www.pandaremit.com', sort: 52, sub: 'transfer', stages: ['before_you_fly', 'first_month'], needs: ['bankAccount'], desc: 'Built for CNY to USD transfers with Chinese-language support on WeChat.', descZh: '专注人民币到美元汇款，微信中文客服。', logo: 16 },
  { slug: 'dolly', name: 'Dolly', nameZh: 'Dolly 搬运', cat: 'movers', tag: 'On-demand truck + helper for move-out day', tagZh: '随叫随到搬家', payout: 1500, network: 'impact', noSsn: true, url: 'https://dolly.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://dolly.com', sort: 60, stages: ['first_month'], needs: [], desc: 'Book a truck and a helper by the hour for moving day or a big furniture pickup.', descZh: '按小时预订货车和搬运工，适合搬家日或大件家具取货。', logo: 17 },
  { slug: 'pods-storage', name: 'PODS Student Storage', nameZh: 'PODS 学生仓储', cat: 'storage', tag: 'Summer storage, campus pickup', tagZh: '暑期寄存，校园取件', promo: 'Student rates', promoZh: '学生价', payout: 3000, network: 'impact', noSsn: true, url: 'https://www.pods.com/student-storage?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.pods.com', sort: 61, stages: ['first_month'], needs: [], desc: 'Store everything over the summer instead of shipping it home; a container is dropped off and picked up near campus.', descZh: '暑假把东西存起来而不是寄回家，集装箱送到校园附近再取走。', logo: 18 },
  { slug: 'collegeboxes', name: 'Collegeboxes (UPS)', nameZh: 'Collegeboxes 寄存', cat: 'storage', tag: 'Door-to-door summer storage', tagZh: '上门取件', payout: 2000, network: 'direct', noSsn: true, url: 'https://www.collegeboxes.com/?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.collegeboxes.com', sort: 62, stages: ['first_month'], needs: [], desc: 'UPS-backed box-by-box storage with pickup from your room and delivery to your next address.', descZh: 'UPS 旗下按箱寄存，从宿舍取件，寄到下一个地址。', logo: 19 },
  { slug: 'cort-student', name: 'CORT Student Furniture Rental', nameZh: 'CORT 学生家具租赁', cat: 'furniture', tag: '3-room package from $129/mo', tagZh: '三房套餐 $129/月起', promo: 'Campus delivery perks', promoZh: '校园配送优惠', payout: 5000, network: 'direct', noSsn: true, url: 'https://www.cort.com/furniture-rental/how-to-rent-furniture-for-students?utm_source=campus-sublet&subid={{clickId}}', site: 'https://www.cort.com', sort: 70, stages: ['first_7_days'], needs: ['address'], desc: 'Rent a furnished-apartment package for the semester instead of buying and reselling. Delivered and assembled.', descZh: '按学期租整套家具，不用买了再卖。送货上门并安装。', logo: 20 },
  { slug: 'amazon-prime-student', name: 'Amazon Prime Student', nameZh: '亚马逊学生 Prime', cat: 'other', tag: '6-month free trial', tagZh: '6 个月免费试用', promo: 'Free 6 months', promoZh: '免费 6 个月', payout: 300, network: 'amazon', noSsn: true, url: 'https://www.amazon.com/joinstudent?tag={{assocTag}}&subid={{clickId}}', site: 'https://www.amazon.com', sort: 80, stages: ['first_7_days'], needs: ['eduEmail'], desc: 'Six months free with your .edu email, then half price. Fast delivery for the first-week essentials.', descZh: '用 .edu 邮箱免费 6 个月，之后半价。第一周的生活必需品送得快。', logo: 1 },
  { slug: 'chicago-airport-pickup', name: 'Evanston–ORD Airport Pickup', nameZh: '芝加哥接机', cat: 'airport_pickup', tag: 'Fixed fares, Chinese-speaking drivers', tagZh: '一口价，中文司机', promo: '$5 off with code ANWO5', promoZh: '优惠码 ANWO5 减 $5', payout: 500, model: 'flat', network: 'direct', noSsn: true, url: 'https://example-pickup-chicago.test/book?src=campus-sublet&subid={{clickId}}', site: 'https://example-pickup-chicago.test', sort: 90, campus: 'northwestern', states: ['IL'], stages: ['before_you_fly'], needs: ['flightNumber'], desc: 'Pre-booked rides from O\'Hare to Evanston and Chicago campuses with fixed fares and Chinese-speaking drivers. Book with your flight number; the driver tracks delays.', descZh: '从奥黑尔机场到 Evanston 和芝加哥各校区的预约接机，一口价，中文司机。用航班号预订，司机会跟踪延误。', logo: 2 },
  { slug: 'nyc-airport-pickup', name: 'JFK/EWR Pickup', nameZh: '纽约接机', cat: 'airport_pickup', tag: 'Fixed fares, Chinese-speaking drivers', tagZh: '一口价，中文司机', payout: 500, model: 'flat', network: 'direct', noSsn: true, url: 'https://example-pickup-nyc.test/book?src=campus-sublet&subid={{clickId}}', site: 'https://example-pickup-nyc.test', sort: 91, campus: 'nyu', stages: ['before_you_fly'], needs: ['flightNumber'], desc: 'Fixed-fare rides from JFK, EWR and LGA to Manhattan and Brooklyn addresses.', descZh: '从 JFK、EWR、LGA 到曼哈顿和布鲁克林的一口价接机。', logo: 3 },
  { slug: 'champaign-airport-shuttle', name: 'ORD → Champaign Shuttle', nameZh: '芝加哥—香槟班车', cat: 'airport_pickup', tag: 'Shared shuttle, several departures a day', tagZh: '机场班车，每天多班', payout: 500, model: 'flat', network: 'direct', noSsn: true, url: 'https://example-shuttle-champaign.test/book?src=campus-sublet&subid={{clickId}}', site: 'https://example-shuttle-champaign.test', sort: 92, campus: 'uiuc', stages: ['before_you_fly'], needs: ['flightNumber'], desc: 'Shared shuttle from O\'Hare to the UIUC campus with several departures a day; reserve a seat with your arrival time.', descZh: '从奥黑尔到 UIUC 校园的共乘班车，每天多班，按到达时间预订座位。', logo: 4 },
  // ---- one non-paying option in every Kit category / subcategory (BUSINESS_PLAN §3.8 rule 8): no payout, no tracking id
  { slug: 'secured-card-own-bank', name: 'Secured card from your own bank', nameZh: '开户银行的担保信用卡', cat: 'bank', sub: 'credit_card', tag: 'Ask the bank you already use; no referral fee', tagZh: '直接问你开户的银行，我们不收佣金', payout: 0, noSsn: false, url: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-secured-credit-card-en-2063/', site: 'https://www.consumerfinance.gov', sort: 19, sponsored: false, stages: ['first_month'], needs: ['bankAccount'], desc: 'A secured card from the bank you opened an account with builds credit without any middleman. We earn nothing from it.', descZh: '在你开户的银行申请担保信用卡，同样能建立信用记录，没有中间方。我们不从中获得任何收入。', logo: 5 },
  { slug: 'carrier-prepaid-direct', name: 'Prepaid plan bought from the carrier', nameZh: '运营商官网预付套餐', cat: 'sim', tag: 'Buy directly from T-Mobile / Verizon / AT&T; no referral fee', tagZh: '直接在运营商官网购买，我们不收佣金', payout: 0, noSsn: true, url: 'https://www.fcc.gov/consumers/guides/prepaid-wireless-services', site: 'https://www.fcc.gov', sort: 29, sponsored: false, stages: ['before_you_fly', 'first_7_days'], needs: [], desc: 'Every major carrier sells prepaid plans in its own stores and website, no SSN needed. Listed so you always have a non-sponsored option.', descZh: '各大运营商的门店和官网都卖预付套餐，无需 SSN。列出来是为了让你总有一个无赞助的选择。', logo: 9 },
  { slug: 'university-renters-guide', name: "Your university's renters-insurance guide", nameZh: '学校的租房保险指南', cat: 'insurance', tag: 'Compare quotes yourself; no referral fee', tagZh: '自己比较报价，我们不收佣金', payout: 0, noSsn: true, url: 'https://content.naic.org/consumer/renters-insurance', site: 'https://content.naic.org', sort: 39, sponsored: false, stages: ['first_month'], needs: ['address'], desc: 'Most housing offices publish a renters-insurance guide; the NAIC consumer guide explains what to compare. We earn nothing from it.', descZh: '多数学校住房办公室都有租房保险指南；NAIC 消费者指南讲解了比较要点。我们不从中获得任何收入。', logo: 12 },
  { slug: 'wire-to-own-account', name: 'Bank wire to your own US account', nameZh: '银行电汇到自己的美国账户', cat: 'other', sub: 'transfer', tag: 'Your bank, your account; no referral fee', tagZh: '自己的银行、自己的账户，我们不收佣金', payout: 0, noSsn: true, url: 'https://www.consumerfinance.gov/consumer-tools/sending-money/', site: 'https://www.consumerfinance.gov', sort: 49, sponsored: false, stages: ['before_you_fly'], needs: ['bankAccount'], desc: 'A wire from your home bank to your own US account is often the simplest option for tuition-sized amounts. Never wire money to a landlord you have not met.', descZh: '从国内银行电汇到你自己的美国账户，往往是大额（如学费）最简单的方式。永远不要给没见过的房东电汇。', logo: 14 },
  { slug: 'university-move-out-donation', name: 'University move-out donation drive', nameZh: '学校搬家捐赠活动', cat: 'movers', tag: 'Donate what you cannot carry; free', tagZh: '带不走的东西捐出去，免费', payout: 0, noSsn: true, url: 'https://www.epa.gov/recycle', site: 'https://www.epa.gov', sort: 59, sponsored: false, stages: ['first_month'], needs: [], desc: 'Most campuses run a free move-out donation drive each spring. Ask your housing office; we earn nothing from it.', descZh: '多数学校每年春季都有免费的搬家捐赠活动，可咨询住房办公室。我们不从中获得任何收入。', logo: 17 },
  { slug: 'campus-storage-office', name: 'Campus storage / housing office', nameZh: '学校寄存 / 住房办公室', cat: 'storage', tag: 'Ask about on-campus summer storage; no referral fee', tagZh: '咨询校内暑期寄存，我们不收佣金', payout: 0, noSsn: true, url: 'https://www.usa.gov/housing', site: 'https://www.usa.gov', sort: 69, sponsored: false, stages: ['first_month'], needs: ['eduEmail'], desc: 'Some housing offices offer free or low-cost summer storage for residents. Listed so you always have a non-sponsored option.', descZh: '部分学校住房办公室为住宿生提供免费或低价的暑期寄存。列出来是为了让你总有一个无赞助的选择。', logo: 18 },
  { slug: 'university-surplus-furniture', name: 'University surplus & student swaps', nameZh: '学校二手处与学生转让', cat: 'furniture', tag: 'Surplus sales and the Anwo market; free to browse', tagZh: '学校二手处和安窝二手市场，免费浏览', payout: 0, noSsn: true, url: 'https://www.usa.gov/housing', site: 'https://www.usa.gov', sort: 79, sponsored: false, stages: ['first_7_days'], needs: [], desc: 'Many universities sell surplus furniture cheaply, and graduating students list theirs on the Anwo market. We earn nothing from either.', descZh: '很多学校的二手处会低价出售家具，毕业生也会在安窝二手市场转让。我们不从中获得任何收入。', logo: 20 },
  { slug: 'university-airport-shuttle', name: 'University arrival shuttle', nameZh: '学校新生接机班车', cat: 'airport_pickup', tag: 'Free or low-cost pickup run by the international office', tagZh: '国际学生办公室组织，免费或低价', payout: 0, noSsn: true, url: 'https://www.usa.gov/international-students', site: 'https://www.usa.gov', sort: 89, sponsored: false, stages: ['before_you_fly'], needs: [], desc: 'Many international student offices run arrival-day shuttles from the main airport. Check your admission email first; we earn nothing from it.', descZh: '很多学校的国际学生办公室会在开学前组织机场接机班车，先查看录取邮件。我们不从中获得任何收入。', logo: 8 },
];

type PromoSpec = { key: string; code: string; kind: 'percent_off' | 'fixed_off' | 'wallet_credit'; value: number; applies: string[]; campus?: string; max?: number; perUser?: number; endsAt?: string; active?: boolean; minOrder?: number };
const IGNITE_CAMPUSES = ['northwestern', 'uiuc', 'nyu', 'uchicago', 'uic', 'illinois-tech'];
const PROMOS: PromoSpec[] = [
  { key: 'founding50', code: 'FOUNDING50', kind: 'percent_off', value: 50, applies: ['pro.monthly'], max: 100, endsAt: '2027-02-28T23:59:59Z' },
  { key: 'welcome10', code: 'WELCOME10', kind: 'percent_off', value: 10, applies: ['boost'], perUser: 1 },
  { key: 'nufall', code: 'NUFALL', kind: 'fixed_off', value: 500, applies: ['boost'], campus: 'northwestern', max: 300, minOrder: 1500 },
  { key: 'welcome5', code: 'WELCOME5', kind: 'wallet_credit', value: 500, applies: ['boost'], active: false },
  ...IGNITE_CAMPUSES.flatMap((c): PromoSpec[] => [
    { key: `ignite-${c}`, code: `IGNITE-${c.toUpperCase()}`, kind: 'wallet_credit', value: 1900, applies: ['boost'], campus: c, max: 100 },
    { key: `sponsor50-${c}`, code: `SPONSOR50-${c.toUpperCase()}`, kind: 'percent_off', value: 50, applies: ['sponsor.local', 'sponsor.feed', 'sponsor.campus'], campus: c, max: 3 },
    { key: `cssa-${c}`, code: `CSSA-${c.toUpperCase()}`, kind: 'wallet_credit', value: 500, applies: ['boost'], campus: c, max: 500 },
  ]),
];

type ListingLite = { id: string; owner_id: string; campus_id: string; deposit_cents: number; title: string };
function listingsOf(campus: string, ownerEmail?: string): ListingLite[] {
  return ownerEmail
    ? q.all<ListingLite>("SELECT id, owner_id, campus_id, deposit_cents, title FROM listings WHERE campus_id = ? AND owner_id = ? AND status = 'active' ORDER BY published_at DESC", [campus, userByEmail(ownerEmail)])
    : q.all<ListingLite>("SELECT id, owner_id, campus_id, deposit_cents, title FROM listings WHERE campus_id = ? AND status = 'active' ORDER BY published_at DESC", [campus]);
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const t = nowIso();
  const logos: string[] = [];
  for (let i = 1; i <= 20; i++) logos.push(insertSeedUpload({ path: `seed/partners/p${String(i).padStart(2, '0')}.svg`, purpose: 'seed' }));
  const campusExists = (id: string) => !!q.get('SELECT 1 FROM campuses WHERE id = ?', [id]);

  q.tx(() => {
    // ---- wipe our rows
    const affected = q.all<{ user_id: string }>("SELECT DISTINCT user_id FROM wallet_ledger WHERE id LIKE 'bil-%'").map((r) => r.user_id);
    q.run("DELETE FROM promo_redemptions WHERE id LIKE 'bil-%' OR promo_code_id LIKE 'bil-%' OR order_id LIKE 'bil-%'");
    for (const tbl of ['escrow_events', 'escrows', 'boosts', 'subscriptions', 'payments', 'orders', 'wallet_ledger', 'referrals', 'partner_conversions', 'partner_clicks', 'sponsor_leads', 'listing_leads', 'sponsorship_invoices', 'sponsorships']) q.run(`DELETE FROM ${tbl} WHERE id LIKE 'bil-%'`);
    q.run("DELETE FROM events WHERE session_id = 'seed-billing'");
    q.run("DELETE FROM kit_checklist WHERE user_id = ?", [userByEmail('alice@u.northwestern.edu')]);
    q.run("DELETE FROM partners WHERE id LIKE 'bil-%'");
    q.run("DELETE FROM promo_codes WHERE id LIKE 'bil-%'");
    for (const u of affected) q.run('UPDATE users SET wallet_balance_cents = COALESCE((SELECT balance_after_cents FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 1), 0) WHERE id = ?', [u, u]);

    // ---- plans (upsert on fixed ids; keep admin price edits out of scope — seed restores the catalog)
    for (const p of PLANS) {
      q.run(
        `INSERT INTO pricing_plans (id, kind, key, name, name_zh, description, description_zh, entity_type, tier, duration_days, interval, price_cents, fee_bps, fee_min_cents, features_json, is_active, sort_order, fee_cap_cents, min_trust, requires_badge, addon_for, self_serve, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, key = excluded.key, name = excluded.name, name_zh = excluded.name_zh, entity_type = excluded.entity_type, tier = excluded.tier, duration_days = excluded.duration_days, interval = excluded.interval,
           price_cents = excluded.price_cents, fee_bps = excluded.fee_bps, fee_min_cents = excluded.fee_min_cents, features_json = excluded.features_json, is_active = excluded.is_active, sort_order = excluded.sort_order,
           fee_cap_cents = excluded.fee_cap_cents, min_trust = excluded.min_trust, requires_badge = excluded.requires_badge, addon_for = excluded.addon_for, self_serve = excluded.self_serve, updated_at = excluded.updated_at`,
        [PLAN_ID(p.n), p.kind, p.key, p.name, p.nameZh, p.desc ?? null, p.descZh ?? null, p.entity ?? null, p.tier ?? null, p.days ?? null, p.interval ?? null, p.price, p.feeBps ?? null, p.feeMin ?? null, JSON.stringify((p.features ?? []).map((f) => `billing.features.${f}`)), p.active === false ? 0 : 1, p.sort, p.feeCap ?? null, p.minTrust ?? 1, p.badge ?? null, p.addonFor ?? null, p.selfServe === false ? 0 : 1, t, t],
      );
    }
    const plan = (key: string) => q.get<{ id: string; price_cents: number; duration_days: number | null; tier: string | null }>('SELECT id, price_cents, duration_days, tier FROM pricing_plans WHERE key = ?', [key])!;

    // ---- promo codes
    const admin = userByEmail('admin@example.edu');
    for (const p of PROMOS) {
      if (p.campus && !campusExists(p.campus)) continue;
      q.run('INSERT OR REPLACE INTO promo_codes (id, code, kind, value, applies_to_json, campus_id, max_redemptions, redeemed_count, per_user_limit, min_order_cents, starts_at, ends_at, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?)', [
        bid(`promo:${p.key}`), p.code, p.kind, p.value, JSON.stringify(p.applies), p.campus ?? null, p.max ?? null, p.perUser ?? 1, p.minOrder ?? 0, p.endsAt ?? null, p.active === false ? 0 : 1, admin, iso(45 * DAY),
      ]);
    }

    // ---- partners
    for (const p of PARTNERS) {
      if (p.campus && !campusExists(p.campus)) continue;
      q.run(
        `INSERT INTO partners (id, slug, name, name_zh, category, tagline, tagline_zh, description, description_zh, logo_upload_id, website_url, affiliate_url, promo_text, promo_text_zh, payout_model, payout_cents, campus_id, states_json, is_sponsored, is_active, sort_order, click_count, network, no_ssn_ok, no_ssn_verified_at, rubric_json, payout_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [bid(`partner:${p.slug}`), p.slug, p.name, p.nameZh, p.cat, p.tag, p.tagZh, p.desc, p.descZh, logos[(p.logo - 1) % 20]!, p.site, p.url, p.promo ?? null, p.promoZh ?? null, p.model ?? 'cpa', p.payout, p.campus ?? null, JSON.stringify(p.states ?? []), p.sponsored === false ? 0 : 1, p.sort, p.network ?? null, p.noSsn ? 1 : 0, p.noSsn ? iso(20 * DAY) : null, JSON.stringify({ subcategory: p.sub ?? null, stages: p.stages, feeFree: !!p.feeFree, campusBranch: !!p.branch, needs: p.needs }), p.payout ? 'assumption; IO pending' : null, iso(60 * DAY), iso(20 * DAY)],
      );
    }

    // ---- users & listings we reference
    const alice = userByEmail('alice@u.northwestern.edu')!;
    const bob = userByEmail('bob@u.northwestern.edu')!;
    const newbie = userByEmail('newbie@u.northwestern.edu')!;
    const landlord = userByEmail('landlord@evanstonhomes.com')!;
    const yuting = userByEmail('yuting.chen@u.northwestern.edu')!;
    const ruoxi = userByEmail('ruoxi.sun@u.northwestern.edu')!;
    const nina = userByEmail('nina.zhou@u.northwestern.edu')!;
    const wenjun = userByEmail('wenjun.liu@u.northwestern.edu')!;
    const chloe = userByEmail('chloe.deng@u.northwestern.edu')!;
    const siyuan = userByEmail('siyuan.wu@u.northwestern.edu')!;
    const meilin = userByEmail('meilin.gao@illinois.edu')!;
    const yuxuan = userByEmail('yuxuan.li@illinois.edu')!;
    const ziyang = userByEmail('ziyang.pan@nyu.edu')!;
    const anqi = userByEmail('anqi.yang@nyu.edu')!;
    const kevin = userByEmail('kevin.xie@nyu.edu')!;
    const users = { alice, bob, newbie, landlord, yuting, ruoxi, nina, wenjun, chloe, siyuan, meilin, yuxuan, ziyang, anqi, kevin };
    const haveUsers = Object.values(users).every((u) => !!q.get('SELECT 1 FROM users WHERE id = ?', [u]));
    if (!haveUsers) return; // core seed missing — nothing user-bound can be inserted

    // payment methods for the subscribers / escrow payers when the verify seed has not provided one
    const ensureCard = (userId: string, brand: string, last4: string) => {
      const existing = q.get<{ id: string }>('SELECT id FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC LIMIT 1', [userId]);
      if (existing) return existing.id;
      const id = bid(`pm:${userId}`);
      q.run("INSERT OR IGNORE INTO payment_methods (id, user_id, provider, provider_token, brand, last4, exp_month, exp_year, is_default, created_at) VALUES (?, ?, 'mock_stripe', ?, ?, ?, 12, 2028, 1, ?)", [id, userId, `pm_mock_seed_${sha256(userId).slice(0, 12)}`, brand, last4, iso(90 * DAY)]);
      q.run('UPDATE users SET payment_verified_at = COALESCE(payment_verified_at, ?) WHERE id = ?', [iso(90 * DAY), userId]);
      return id;
    };
    const cardOf: Record<string, string> = {};
    for (const [k, v] of Object.entries({ landlord, yuting, ruoxi, nina, meilin, ziyang })) cardOf[v] = ensureCard(v, k === 'landlord' ? 'visa' : 'mastercard', k === 'landlord' ? '4242' : '4444');

    // ---- orders + payments helper (creates a fulfilled card order with its payment row)
    type OrderIn = { key: string; user: string; campus: string; kind: 'boost' | 'subscription' | 'subscription_renewal' | 'escrow_deposit'; planKey: string | null; entityType?: string; entityId?: string; subtotal: number; discount?: number; credit?: number; fee?: number; daysAgo: number; status?: 'fulfilled' | 'refunded' | 'failed'; metadata?: Record<string, unknown>; promo?: string };
    const orderIds: string[] = [];
    const mkOrder = (o: OrderIn): string => {
      const id = bid(`order:${o.key}`);
      const payId = bid(`pay:${o.key}`);
      const at = iso(o.daysAgo * DAY + (o.key.length % 7) * HOUR);
      const total = Math.max(0, o.subtotal - (o.discount ?? 0) - (o.credit ?? 0)) + (o.fee ?? 0);
      const status = o.status ?? 'fulfilled';
      const promoId = o.promo ? q.get<{ id: string }>('SELECT id FROM promo_codes WHERE code = ?', [o.promo])?.id ?? null : null;
      const planId = o.planKey ? plan(o.planKey).id : null;
      q.run(
        `INSERT INTO orders (id, user_id, campus_id, kind, plan_id, entity_type, entity_id, status, currency, subtotal_cents, discount_cents, credit_cents, fee_cents, total_cents, promo_code_id, payment_id, metadata_json, paid_at, fulfilled_at, cancelled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [id, o.user, o.campus, o.kind, planId, o.entityType ?? null, o.entityId ?? null, status, o.subtotal, o.discount ?? 0, o.credit ?? 0, o.fee ?? 0, total, promoId, payId, JSON.stringify({ seed: true, ...(o.metadata ?? {}) }), status === 'failed' ? null : at, status === 'failed' ? null : at, at, at],
      );
      const provider = total === 0 ? 'wallet' : 'mock_stripe';
      const pm = q.get<{ brand: string; last4: string }>('SELECT brand, last4 FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL LIMIT 1', [o.user]);
      q.run(
        `INSERT INTO payments (id, order_id, user_id, provider, provider_intent_id, provider_charge_id, client_secret, status, amount_cents, refunded_cents, currency, payment_method_id, method_brand, method_last4, failure_code, failure_message, raw_json, succeeded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'USD', NULL, ?, ?, ?, ?, '{}', ?, ?, ?)`,
        [payId, id, o.user, provider, provider === 'mock_stripe' ? `pi_mock_seed_${sha256(o.key).slice(0, 16)}` : null, provider === 'mock_stripe' ? `ch_mock_seed_${sha256(o.key).slice(0, 16)}` : null,
          status === 'failed' ? 'failed' : status === 'refunded' ? 'refunded' : 'succeeded', total, status === 'refunded' ? total : 0, pm?.brand ?? (provider === 'mock_stripe' ? 'visa' : null), pm?.last4 ?? (provider === 'mock_stripe' ? '4242' : null), status === 'failed' ? 'card_declined' : null, status === 'failed' ? 'Your card was declined.' : null, status === 'failed' ? null : at, at, at],
      );
      if (promoId && status !== 'failed') q.run('INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)', [bid(`redeem:${o.key}`), promoId, o.user, id, o.discount ?? 0, at]);
      // checkout funnel events for the admin dashboard
      const ev = (type: string, offsetMs: number) => q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [bid(`ev:${o.key}:${type}`), o.user, 'seed-billing', o.campus, type, 'order', id, JSON.stringify({ kind: o.kind, totalCents: total, seed: true }), '/checkout', new Date(Date.parse(at) - offsetMs).toISOString()]);
      ev('checkout.start', 4 * 60_000);
      ev('checkout.pay', 60_000);
      ev(status === 'failed' ? 'checkout.fail' : 'checkout.success', 0);
      orderIds.push(id);
      return id;
    };

    // ---- boosts (active now) tied to orders
    const nuListings = listingsOf('northwestern');
    const pick = (list: ListingLite[], owner: string, n = 0) => list.filter((l) => l.owner_id === owner)[n];
    type BoostIn = { key: string; user: string; campus: string; entityType: 'listing' | 'market_item' | 'buddy_post'; entityId: string; planKey: string; startedDaysAgo: number; nationwide?: boolean; impressions: number; clicks: number; status?: 'active' | 'expired' | 'cancelled' | 'scheduled' };
    const mkBoost = (b: BoostIn) => {
      const p = plan(b.planKey);
      const orderId = mkOrder({ key: `boost:${b.key}`, user: b.user, campus: b.campus, kind: 'boost', planKey: b.planKey, entityType: b.entityType, entityId: b.entityId, subtotal: p.price_cents + (b.nationwide ? 1000 : 0), daysAgo: b.startedDaysAgo, metadata: { addons: b.nationwide ? ['boost.listing.spotlight'] : [], nationwide: !!b.nationwide } });
      const starts = iso(b.startedDaysAgo * DAY);
      const ends = new Date(Date.parse(starts) + (p.duration_days ?? 7) * DAY).toISOString();
      const status = b.status ?? (Date.parse(ends) > nowMs() ? 'active' : 'expired');
      q.run('INSERT INTO boosts (id, user_id, campus_id, entity_type, entity_id, plan_id, order_id, tier, starts_at, ends_at, status, impressions, clicks, nationwide, paused_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)', [bid(`boost:${b.key}`), b.user, b.campus, b.entityType, b.entityId, p.id, orderId, p.tier ?? 'basic', starts, ends, status, b.impressions, b.clicks, b.nationwide ? 1 : 0, starts, starts]);
      // impression / click events spread over the boost window (fuel owner stats)
      const days = Math.max(1, Math.min(b.startedDaysAgo, p.duration_days ?? 7));
      for (let d = 0; d < days; d++) {
        const dayAt = Date.parse(starts) + d * DAY + 9 * HOUR;
        const imp = Math.round(b.impressions / days);
        const clk = Math.round(b.clicks / days);
        for (let i = 0; i < Math.min(imp, 12); i++) q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ev:boost:${b.key}:${d}:${i}`), 'seed-billing', b.campus, 'boost.impression', 'boost', bid(`boost:${b.key}`), JSON.stringify({ surface: 'list', seed: true }), new Date(dayAt + i * 37 * 60_000).toISOString()]);
        for (let i = 0; i < Math.min(clk, 4); i++) q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ev:boostclk:${b.key}:${d}:${i}`), 'seed-billing', b.campus, 'boost.click', 'boost', bid(`boost:${b.key}`), JSON.stringify({ surface: 'list', seed: true }), new Date(dayAt + i * 101 * 60_000).toISOString()]);
      }
    };
    const l = (owner: string, n = 0) => pick(nuListings, owner, n);
    if (l(chloe)) mkBoost({ key: 'nu1', user: chloe, campus: 'northwestern', entityType: 'listing', entityId: l(chloe)!.id, planKey: 'boost.listing.basic.7d', startedDaysAgo: 2, impressions: 412, clicks: 31 });
    if (l(wenjun)) mkBoost({ key: 'nu2', user: wenjun, campus: 'northwestern', entityType: 'listing', entityId: l(wenjun)!.id, planKey: 'boost.listing.basic.3d', startedDaysAgo: 1, impressions: 160, clicks: 14 });
    if (l(landlord, 0)) mkBoost({ key: 'nu3', user: landlord, campus: 'northwestern', entityType: 'listing', entityId: l(landlord, 0)!.id, planKey: 'boost.listing.max.14d', startedDaysAgo: 5, nationwide: true, impressions: 1980, clicks: 142 });
    if (l(nina)) mkBoost({ key: 'nu4', user: nina, campus: 'northwestern', entityType: 'listing', entityId: l(nina)!.id, planKey: 'boost.listing.plus.7d', startedDaysAgo: 3, nationwide: true, impressions: 870, clicks: 66 });
    const nuItems = q.all<{ id: string; seller_id: string }>("SELECT id, seller_id FROM market_items WHERE campus_id = 'northwestern' AND status = 'active' AND seller_id IN (?, ?) ORDER BY created_at DESC", [alice, siyuan]);
    if (nuItems[0]) mkBoost({ key: 'nu5', user: nuItems[0].seller_id, campus: 'northwestern', entityType: 'market_item', entityId: nuItems[0].id, planKey: 'boost.market_item.basic.3d', startedDaysAgo: 1, impressions: 96, clicks: 9 });
    const nuBuddy = q.get<{ id: string; author_id: string }>("SELECT id, author_id FROM buddy_posts WHERE campus_id = 'northwestern' AND status = 'open' AND starts_at > ? ORDER BY starts_at ASC LIMIT 1", [t]);
    if (nuBuddy) mkBoost({ key: 'nu6', user: nuBuddy.author_id, campus: 'northwestern', entityType: 'buddy_post', entityId: nuBuddy.id, planKey: 'boost.buddy_post.basic.3d', startedDaysAgo: 1, impressions: 58, clicks: 7 });
    // ended boosts for history (alice: one expired, one cancelled with prorated credit)
    if (l(alice)) {
      mkBoost({ key: 'nu7', user: alice, campus: 'northwestern', entityType: 'listing', entityId: l(alice)!.id, planKey: 'boost.listing.basic.7d', startedDaysAgo: 21, impressions: 640, clicks: 48, status: 'expired' });
      mkBoost({ key: 'nu8', user: alice, campus: 'northwestern', entityType: 'listing', entityId: l(alice)!.id, planKey: 'boost.listing.basic.3d', startedDaysAgo: 40, impressions: 120, clicks: 6, status: 'cancelled' });
    }
    const uiucListings = listingsOf('uiuc');
    const nyuListings = listingsOf('nyu');
    if (uiucListings[0]) mkBoost({ key: 'ui1', user: uiucListings[0].owner_id, campus: 'uiuc', entityType: 'listing', entityId: uiucListings[0].id, planKey: 'boost.listing.basic.7d', startedDaysAgo: 2, impressions: 210, clicks: 17 });
    if (uiucListings[1]) mkBoost({ key: 'ui2', user: uiucListings[1].owner_id, campus: 'uiuc', entityType: 'listing', entityId: uiucListings[1].id, planKey: 'boost.listing.basic.3d', startedDaysAgo: 1, impressions: 88, clicks: 6 });
    if (nyuListings[0]) mkBoost({ key: 'ny1', user: nyuListings[0].owner_id, campus: 'nyu', entityType: 'listing', entityId: nyuListings[0].id, planKey: 'boost.listing.basic.7d', startedDaysAgo: 3, impressions: 330, clicks: 24 });
    if (nyuListings[1]) mkBoost({ key: 'ny2', user: nyuListings[1].owner_id, campus: 'nyu', entityType: 'listing', entityId: nyuListings[1].id, planKey: 'boost.listing.basic.3d', startedDaysAgo: 1, impressions: 70, clicks: 5 });

    // ---- historical boost orders over the last 60 days (admin charts), spread across campuses & users
    const histUsers: [string, string][] = [[yuting, 'northwestern'], [ruoxi, 'northwestern'], [siyuan, 'northwestern'], [bob, 'northwestern'], [chloe, 'northwestern'], [yuxuan, 'uiuc'], [meilin, 'uiuc'], [anqi, 'nyu'], [kevin, 'nyu'], [nina, 'northwestern'], [wenjun, 'northwestern']];
    const histPlans = ['boost.listing.basic.7d', 'boost.listing.basic.3d', 'boost.market_item.basic.3d', 'boost.listing.plus.7d', 'boost.buddy_post.basic.1d', 'boost.listing.basic.14d', 'boost.market_item.basic.7d'];
    for (let i = 0; i < 22; i++) {
      const [u, c] = histUsers[i % histUsers.length]!;
      const pk = histPlans[i % histPlans.length]!;
      const p = plan(pk);
      const daysAgo = 4 + Math.round((i * 56) / 22) + (i % 3);
      const et = pk.includes('market_item') ? 'market_item' : pk.includes('buddy') ? 'buddy_post' : 'listing';
      mkOrder({ key: `hist:${i}`, user: u, campus: c, kind: 'boost', planKey: pk, entityType: et, entityId: `seed-history-${i}`, subtotal: p.price_cents, discount: i % 6 === 0 ? Math.round(p.price_cents * 0.1) : 0, promo: i % 6 === 0 ? 'WELCOME10' : undefined, credit: i % 5 === 0 ? Math.min(500, p.price_cents) : 0, daysAgo, status: i === 9 ? 'refunded' : i === 15 ? 'failed' : 'fulfilled' });
    }

    // ---- subscriptions (landlord NU Pro+, UIUC meilin Pro monthly, NYU ziyang Pro yearly) with their orders
    const mkSub = (key: string, user: string, campus: string, planKey: string, startedDaysAgo: number, opts: { trial?: boolean; renewals?: number; promo?: string } = {}) => {
      const p = plan(planKey);
      const interval = planKey.endsWith('yearly') ? 365 : 30;
      const subId = bid(`sub:${key}`);
      const firstOrder = mkOrder({ key: `sub:${key}:0`, user, campus, kind: 'subscription', planKey, entityType: 'subscription', entityId: subId, subtotal: opts.trial ? 0 : p.price_cents, discount: opts.promo ? Math.round(p.price_cents / 2) : 0, promo: opts.promo, daysAgo: startedDaysAgo, metadata: { trial: !!opts.trial, subscriptionId: subId, promo_renewals_left: opts.promo ? 11 : 0 } });
      let lastOrder = firstOrder;
      const renewals = opts.renewals ?? 0;
      for (let r = 1; r <= renewals; r++) lastOrder = mkOrder({ key: `sub:${key}:${r}`, user, campus, kind: 'subscription_renewal', planKey, entityType: 'subscription', entityId: subId, subtotal: p.price_cents, discount: opts.promo ? Math.round(p.price_cents / 2) : 0, daysAgo: startedDaysAgo - r * interval, metadata: { subscriptionId: subId, promo_renewals_left: opts.promo ? 11 - r : 0 } });
      const periodStart = iso((startedDaysAgo - renewals * interval) * DAY);
      const periodEnd = new Date(Date.parse(periodStart) + interval * DAY).toISOString();
      q.run('INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, trial_ends_at, last_order_id, payment_method_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)', [subId, user, p.id, 'active', periodStart, periodEnd, opts.trial ? iso((startedDaysAgo - 14) * DAY) : null, lastOrder, cardOf[user] ?? null, iso(startedDaysAgo * DAY), periodStart]);
      q.run('UPDATE users SET listing_quota = 999 WHERE id = ?', [user]);
      q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ev:sub:${key}`), user, 'seed-billing', campus, opts.trial ? 'pro.trial_start' : 'pro.subscribe', 'subscription', subId, JSON.stringify({ planKey, seed: true }), iso(startedDaysAgo * DAY)]);
      return subId;
    };
    const landlordSub = mkSub('landlord', landlord, 'northwestern', 'proplus.monthly', 52, { trial: true, renewals: 1 });
    mkSub('meilin', meilin, 'uiuc', 'pro.monthly', 33, { renewals: 1, promo: 'FOUNDING50' });
    mkSub('ziyang', ziyang, 'nyu', 'pro.yearly', 20);

    // ---- Secure Payments (escrows) in different states
    type EscrowIn = { key: string; listing: ListingLite | undefined; payer: string; campus: string; status: 'funded' | 'in_inspection' | 'released' | 'disputed' | 'accepted' | 'refunded'; amount: number; feePayer: 'payer' | 'payee' | 'split'; rail: 'ach' | 'card'; moveInDaysFromNow: number; createdDaysAgo: number; dispute?: { code: string; text: string } };
    const mkEscrow = (e: EscrowIn) => {
      if (!e.listing) return;
      const bps = 300;
      const fee = Math.min(6000, Math.max(500, Math.round((e.amount * bps) / 10000)));
      const payerFee = e.feePayer === 'payer' ? fee : e.feePayer === 'split' ? Math.ceil(fee / 2) : 0;
      const payeeFee = fee - payerFee;
      const railFee = e.rail === 'card' ? Math.round((e.amount * 290) / 10000) + 30 : 0;
      const id = bid(`escrow:${e.key}`);
      const created = iso(e.createdDaysAgo * DAY);
      const moveIn = new Date(nowMs() + e.moveInDaysFromNow * DAY).toISOString().slice(0, 10);
      const conv = q.get<{ id: string }>("SELECT id FROM conversations WHERE context_type = 'listing' AND context_id = ? AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?) LIMIT 1", [e.listing.id, e.payer])?.id ?? null;
      const funded = ['funded', 'in_inspection', 'released', 'disputed', 'refunded'].includes(e.status);
      let orderId: string | null = null;
      if (funded) orderId = mkOrder({ key: `escrow:${e.key}`, user: e.payer, campus: e.campus, kind: 'escrow_deposit', planKey: 'escrow.standard', entityType: 'escrow', entityId: id, subtotal: e.amount, fee: payerFee + railFee, daysAgo: e.createdDaysAgo - 1, metadata: { rail: e.rail, railFeeCents: railFee, listingId: e.listing.id }, status: e.status === 'refunded' ? 'refunded' : 'fulfilled' });
      const fundedAt = funded ? iso((e.createdDaysAgo - 1) * DAY) : null;
      const deadline = ['in_inspection', 'released', 'disputed'].includes(e.status) ? new Date(Date.parse(`${moveIn}T00:00:00Z`) + 48 * HOUR).toISOString() : null;
      q.run(
        `INSERT INTO escrows (id, listing_id, campus_id, conversation_id, payer_id, payee_id, amount_cents, fee_bps, fee_cents, fee_payer, status, order_id, move_in_date, inspection_hours, inspection_deadline_at, funded_at, released_at, refunded_at, disputed_at, dispute_reason, resolution, resolution_payee_cents, resolution_payer_cents, resolved_by, resolved_at, expires_at, created_by, rail, card_fee_cents, dispute_reason_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 48, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [id, e.listing.id, e.campus, conv, e.payer, e.listing.owner_id, e.amount, bps, fee, e.feePayer, e.status, orderId, moveIn, deadline, fundedAt, e.status === 'released' ? iso(1 * DAY) : null, e.status === 'refunded' ? iso(1 * DAY) : null, e.status === 'disputed' ? iso(0.5 * DAY) : null, e.dispute?.text ?? null, new Date(Date.parse(created) + 7 * DAY).toISOString(), e.payer, e.rail, railFee, e.dispute?.code ?? null, created, iso(0.4 * DAY)],
      );
      const chain: string[] = ['proposed', 'accepted'];
      if (funded) chain.push('funded');
      if (['in_inspection', 'released', 'disputed'].includes(e.status)) chain.push('in_inspection');
      if (['released', 'disputed', 'refunded'].includes(e.status)) chain.push(e.status);
      chain.forEach((st, i) => {
        q.run('INSERT INTO escrow_events (id, escrow_id, from_status, to_status, actor_id, note, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [bid(`escrow:${e.key}:ev:${st}`), id, i === 0 ? null : chain[i - 1]!, st, st === 'in_inspection' ? null : st === 'accepted' || st === 'refunded' ? e.listing!.owner_id : e.payer, st === 'disputed' ? e.dispute?.text ?? null : null, JSON.stringify(st === 'disputed' ? { reasonCode: e.dispute?.code } : {}), new Date(Date.parse(created) + i * 6 * HOUR + (st === e.status ? 2 * DAY : 0)).toISOString()]);
      });
      if (e.status === 'released') ledger(e.listing.owner_id, e.amount - payeeFee, 'topup', { refType: 'escrow', refId: id, note: 'secure_payment_release', at: iso(1 * DAY) });
      q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ev:escrow:${e.key}`), e.payer, 'seed-billing', e.campus, 'escrow.propose', 'escrow', id, JSON.stringify({ amountCents: e.amount, feeCents: fee, seed: true }), created]);
      if (funded) q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ev:escrowfund:${e.key}`), e.payer, 'seed-billing', e.campus, 'escrow.fund', 'escrow', id, JSON.stringify({ amountCents: e.amount, feeCents: fee, seed: true }), fundedAt]);
    };

    // ---- wallet ledger helper (chronological; cache via trigger)
    const balances = new Map<string, number>();
    const ledger = (user: string, delta: number, kind: string, o: { refType?: string; refId?: string; note?: string; expiresAt?: string | null; at: string }) => {
      const before = balances.get(user) ?? q.get<{ b: number }>('SELECT wallet_balance_cents AS b FROM users WHERE id = ?', [user])?.b ?? 0;
      const after = Math.max(0, before + delta);
      balances.set(user, after);
      q.run('INSERT INTO wallet_ledger (id, user_id, delta_cents, balance_after_cents, kind, ref_type, ref_id, note, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [bid(`ledger:${user}:${kind}:${o.at}:${o.note ?? ''}`), user, after - before, after, kind, o.refType ?? null, o.refId ?? null, o.note ?? null, o.expiresAt ?? null, o.at]);
    };

    const landlordListings = listingsOf('northwestern', 'landlord@evanstonhomes.com');
    mkEscrow({ key: 'nu-funded', listing: landlordListings[0], payer: yuting, campus: 'northwestern', status: 'funded', amount: 262000, feePayer: 'payer', rail: 'ach', moveInDaysFromNow: 12, createdDaysAgo: 6 });
    mkEscrow({ key: 'nu-inspection', listing: landlordListings[1] ?? landlordListings[0], payer: ruoxi, campus: 'northwestern', status: 'in_inspection', amount: 95000, feePayer: 'split', rail: 'ach', moveInDaysFromNow: -1, createdDaysAgo: 9 });
    const ninaListings = listingsOf('northwestern', 'nina.zhou@u.northwestern.edu');
    mkEscrow({ key: 'nu-released', listing: ninaListings[0], payer: alice, campus: 'northwestern', status: 'released', amount: 232000, feePayer: 'payer', rail: 'ach', moveInDaysFromNow: -4, createdDaysAgo: 16 });
    const lakeshore = listingsOf('northwestern', 'evanston.rentals@gmail.com');
    mkEscrow({ key: 'nu-disputed', listing: lakeshore[0], payer: siyuan, campus: 'northwestern', status: 'disputed', amount: 125000, feePayer: 'payer', rail: 'card', moveInDaysFromNow: -2, createdDaysAgo: 11, dispute: { code: 'not_as_described', text: 'The unit has no working heat and the photos showed a furnished living room; it is empty. I want the deposit back until this is fixed. 房间没有暖气，照片里的家具也不在。' } });
    const meilinListings = listingsOf('uiuc', 'meilin.gao@illinois.edu');
    mkEscrow({ key: 'ui-accepted', listing: meilinListings[0] ?? uiucListings[0], payer: yuxuan, campus: 'uiuc', status: 'accepted', amount: 110000, feePayer: 'payer', rail: 'ach', moveInDaysFromNow: 20, createdDaysAgo: 2 });
    const ziyangListings = listingsOf('nyu', 'ziyang.pan@nyu.edu');
    mkEscrow({ key: 'ny-funded', listing: ziyangListings[0] ?? nyuListings[0], payer: anqi, campus: 'nyu', status: 'funded', amount: 300000, feePayer: 'payee', rail: 'ach', moveInDaysFromNow: 8, createdDaysAgo: 4 });

    // ---- referrals: alice → bob (rewarded), bob → newbie (pending)
    const aliceCode = q.get<{ c: string }>('SELECT referral_code AS c FROM users WHERE id = ?', [alice])?.c ?? 'ALICE123';
    const bobCode = q.get<{ c: string }>('SELECT referral_code AS c FROM users WHERE id = ?', [bob])?.c ?? 'BOB12345';
    q.run('DELETE FROM referrals WHERE referred_id IN (?, ?)', [bob, newbie]);
    q.run("INSERT INTO referrals (id, referrer_id, referred_id, code, status, qualify_rule, referrer_reward_cents, referred_reward_cents, qualified_at, rewarded_at, created_at) VALUES (?, ?, ?, ?, 'rewarded', 'edu_verified', 500, 500, ?, ?, ?)", [bid('ref:alice-bob'), alice, bob, aliceCode, iso(50 * DAY), iso(50 * DAY), iso(52 * DAY)]);
    q.run("INSERT INTO referrals (id, referrer_id, referred_id, code, status, qualify_rule, referrer_reward_cents, referred_reward_cents, qualified_at, rewarded_at, created_at) VALUES (?, ?, ?, ?, 'pending', 'edu_verified', 500, 500, NULL, NULL, ?)", [bid('ref:bob-newbie'), bob, newbie, bobCode, iso(3 * DAY)]);
    q.run('UPDATE users SET referred_by = ? WHERE id = ?', [alice, bob]);
    q.run('UPDATE users SET referred_by = ? WHERE id = ?', [bob, newbie]);

    // ---- wallet history (alice rich; bob, landlord, meilin, ziyang light)
    ledger(alice, 500, 'referral_reward', { refType: 'referral', refId: bid('ref:alice-bob'), note: 'referral_reward', expiresAt: iso(-130 * DAY), at: iso(50 * DAY) });
    ledger(alice, 1900, 'promo_credit', { refType: 'promo_code', refId: bid('promo:ignite-northwestern'), note: 'IGNITE-NORTHWESTERN', expiresAt: iso(-138 * DAY), at: iso(42 * DAY) });
    ledger(alice, -900, 'order_payment', { refType: 'order', refId: bid('order:boost:nu8'), note: 'boost', at: iso(40 * DAY) });
    ledger(alice, 600, 'refund', { refType: 'boost', refId: bid('boost:nu8'), note: 'boost_cancel_prorated', expiresAt: iso(-141 * DAY), at: iso(39 * DAY) });
    ledger(alice, -1900, 'order_payment', { refType: 'order', refId: bid('order:boost:nu7'), note: 'boost', at: iso(21 * DAY) });
    ledger(alice, 500, 'promo_credit', { refType: 'promo_code', refId: bid('promo:cssa-northwestern'), note: 'CSSA-NORTHWESTERN', expiresAt: iso(-10 * DAY), at: iso(8 * DAY) });
    ledger(alice, 500, 'promo_credit', { refType: 'referral', refId: bid('ref:alice-bob'), note: 'post_bonus', expiresAt: iso(-170 * DAY), at: iso(5 * DAY) });
    ledger(bob, 500, 'referral_welcome', { refType: 'referral', refId: bid('ref:alice-bob'), note: 'referral_welcome', expiresAt: iso(-130 * DAY), at: iso(50 * DAY) });
    ledger(landlord, 5700, 'promo_credit', { refType: 'subscription', refId: landlordSub, note: 'pro_monthly_boost', expiresAt: iso(-38 * DAY), at: iso(22 * DAY) });
    ledger(landlord, -4900, 'order_payment', { refType: 'order', refId: bid('order:boost:nu3'), note: 'boost', at: iso(5 * DAY) });
    ledger(meilin, 1900, 'promo_credit', { refType: 'subscription', refId: bid('sub:meilin'), note: 'pro_monthly_boost', expiresAt: iso(-57 * DAY), at: iso(3 * DAY) });
    ledger(ziyang, 1900, 'promo_credit', { refType: 'subscription', refId: bid('sub:ziyang'), note: 'pro_monthly_boost', expiresAt: iso(-40 * DAY), at: iso(20 * DAY) });

    // ---- 30 days of partner clicks (≈ 180) with 12 conversions, mostly anonymous pre-arrival traffic
    const partnerRows = q.all<{ id: string; slug: string; payout_cents: number; campus_id: string | null }>("SELECT id, slug, payout_cents, campus_id FROM partners WHERE id LIKE 'bil-%'");
    const clickUsers = [null, null, null, alice, bob, newbie, null, kevin, yuxuan, null];
    const campuses = ['northwestern', 'northwestern', 'northwestern', 'uiuc', 'nyu', 'northwestern', 'usc', 'umich'].filter(campusExists);
    let ci = 0;
    for (let d = 0; d < 30; d++) {
      const perDay = 4 + ((d * 7) % 5);
      for (let k = 0; k < perDay; k++) {
        const p = partnerRows[(d * 3 + k * 5) % partnerRows.length]!;
        const campus = p.campus_id ?? campuses[(d + k) % campuses.length]!;
        const converted = ci % 15 === 7;
        const at = iso(d * DAY + (k * 3 + 7) * HOUR);
        q.run('INSERT INTO partner_clicks (id, partner_id, user_id, campus_id, session_id, placement, referer, ip_hash, user_agent, converted, converted_at, payout_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)', [bid(`click:${ci}`), p.id, clickUsers[ci % clickUsers.length], campus, `seed-aid-${(ci * 7) % 40}`, ci % 9 === 0 ? 'listing_detail' : ci % 11 === 0 ? 'onboarding' : 'kit', sha256(`ip:${(ci * 13) % 50}`).slice(0, 32), 'Mozilla/5.0 (seed)', converted ? 1 : 0, converted ? at : null, converted ? p.payout_cents : 0, at]);
        if (converted) q.run("INSERT OR IGNORE INTO partner_conversions (id, partner_id, click_id, network_ref, payout_cents, status, source, campus_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'postback', ?, ?)", [bid(`conv:${ci}`), p.id, bid(`click:${ci}`), `seed-${p.slug}-${ci}`, p.payout_cents, ci % 2 === 0 ? 'approved' : 'pending', campus, at]);
        q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [bid(`ev:click:${ci}`), clickUsers[ci % clickUsers.length], 'seed-billing', campus, 'affiliate.click', 'partner', p.id, JSON.stringify({ slug: p.slug, placement: 'kit', seed: true }), '/kit', at]);
        ci++;
      }
      for (let k = 0; k < 18 + ((d * 5) % 11); k++) q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?)', [bid(`ev:kitview:${d}:${k}`), 'seed-billing', campuses[(d + k) % campuses.length]!, 'kit.view', JSON.stringify({ preArrival: k % 3 !== 0, seed: true }), '/kit', iso(d * DAY + (6 + (k % 14)) * HOUR + k * 60_000)]);
    }
    // alice's checklist progress
    for (const slug of ['chase-college-checking', 'mint-mobile', 'amazon-prime-student']) q.run('INSERT OR REPLACE INTO kit_checklist (user_id, slug, done_at) VALUES (?, ?, ?)', [alice, slug, iso(12 * DAY)]);

    // ---- Pro lead inbox + analytics for the landlord (listing_leads rows we own carry the bil- prefix)
    const leadUsers = q.all<{ id: string }>("SELECT id FROM users WHERE campus_id = 'northwestern' AND role = 'student' AND id <> ? ORDER BY email LIMIT 14", [landlord]).map((r) => r.id);
    const leadSources = ['message', 'message', 'wanted_offer', 'message', 'escrow', 'phone_reveal'];
    const leadStatuses = ['new', 'new', 'replied', 'qualified', 'new', 'replied', 'closed', 'new', 'spam', 'qualified'];
    landlordListings.forEach((lst, li) => {
      leadUsers.forEach((u, ui) => {
        if ((ui + li) % 3 === 2) return;
        const conv = q.get<{ id: string }>("SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE c.context_type = 'listing' AND c.context_id = ? AND m.user_id = ? LIMIT 1", [lst.id, u])?.id ?? null;
        q.run('INSERT OR IGNORE INTO listing_leads (id, listing_id, owner_id, user_id, conversation_id, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [bid(`lead:${lst.id}:${u}`), lst.id, landlord, u, conv, leadSources[(ui + li) % leadSources.length]!, leadStatuses[(ui * 3 + li) % leadStatuses.length]!, iso(((ui * 5 + li * 7) % 28) * DAY + (ui % 9) * HOUR)]);
      });
      for (let d = 0; d < 30; d++) {
        const n = 2 + ((d * 7 + li * 3) % 6) + (d < 7 ? 2 : 0);
        for (let k = 0; k < n; k++) q.run('INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)', [bid(`ev:view:${lst.id}:${d}:${k}`), 'seed-billing', 'northwestern', 'listing.view', 'listing', lst.id, JSON.stringify({ seed: true }), `/listings/${lst.id}`, iso(d * DAY + (k * 2 + 8) * HOUR)]);
      }
    });

    // ---- sponsor leads
    q.run("INSERT INTO sponsor_leads (id, business_name, contact, campus_id, interest, note, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)", [bid('lead:1'), 'Joy Yee Noodle Evanston', 'owner@joyyee-evanston.example', 'northwestern', 'sponsor', 'Interested in the Newcomer Kit food section for fall arrivals.', 'contacted', iso(9 * DAY)]);
    q.run("INSERT INTO sponsor_leads (id, business_name, contact, campus_id, interest, note, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)", [bid('lead:2'), 'The Link Evanston', 'leasing@thelink.example', 'northwestern', 'building', 'Verified Building page for 2027 pre-leasing (240 beds).', 'new', iso(2 * DAY)]);

    // ---- sponsored placements (booked by the team; labelled 「赞助」 on the home feed) + their invoices
    const sponsorships: { key: string; name: string; plan: string; campus: string; title: string; titleZh: string; body: string; bodyZh: string; url: string; logo: number; price: number; startedDaysAgo: number }[] = [
      { key: 'sp:nu:1', name: 'Joy Yee Noodle Evanston', plan: 'sponsor.feed', campus: 'northwestern', title: 'Student lunch set $9.99 near campus', titleZh: '学生午餐套餐 $9.99，校园步行 5 分钟', body: 'Show your student ID · Mon–Fri', bodyZh: '出示学生证 · 周一至周五', url: 'https://example.com/joyyee-evanston', logo: 7, price: 35000, startedDaysAgo: 12 },
      { key: 'sp:nu:2', name: 'Evanston Bike Shop', plan: 'sponsor.local', campus: 'northwestern', title: 'Tune-up + lock bundle for new students', titleZh: '新生自行车保养 + 车锁套餐', body: '15% off through October', bodyZh: '10 月底前 85 折', url: 'https://example.com/evanston-bikes', logo: 12, price: 15000, startedDaysAgo: 5 },
      { key: 'sp:uiuc:1', name: 'Green Street Tea', plan: 'sponsor.feed', campus: 'uiuc', title: 'Bubble tea BOGO for UIUC students', titleZh: 'UIUC 学生奶茶买一送一', body: 'Green St · weekdays', bodyZh: 'Green St · 工作日', url: 'https://example.com/green-street-tea', logo: 15, price: 35000, startedDaysAgo: 8 },
    ];
    const adminUser = userByEmail('admin@example.edu');
    for (const s of sponsorships) {
      if (!campusExists(s.campus)) continue;
      const id = bid(s.key);
      q.run(
        `INSERT INTO sponsorships (id, sponsor_name, plan_key, campus_id, surface, kit_category, title, title_zh, body, body_zh, url, logo_upload_id, starts_at, ends_at, status, impressions, clicks, price_cents, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'home_feed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
        [id, s.name, s.plan, s.campus, s.title, s.titleZh, s.body, s.bodyZh, s.url, logos[s.logo - 1] ?? null, iso(s.startedDaysAgo * DAY), iso(-(30 - s.startedDaysAgo) * DAY), 40 * s.startedDaysAgo, 2 * s.startedDaysAgo, s.price, adminUser, iso(s.startedDaysAgo * DAY), iso(s.startedDaysAgo * DAY)],
      );
      q.run("INSERT INTO sponsorship_invoices (id, sponsorship_id, amount_cents, status, campus_id, issued_at, paid_at, note) VALUES (?, ?, ?, 'paid', ?, ?, ?, ?)", [bid(`${s.key}:inv`), id, s.price, s.campus, iso((s.startedDaysAgo + 3) * DAY), iso((s.startedDaysAgo + 1) * DAY), 'Seed invoice · paid by ACH']);
    }

    // ---- trust gate on demo boosts (BUSINESS_PLAN §3.2): Plus / Max tiers and listing boosts longer than 7 days need an
    // approved lease / ownership proof. Boost rows written by any module seed for owners without one are downgraded to
    // basic ≤ 7 days, then every live boost is asserted to pass the same rule planLock() applies at checkout.
    const proofSql = "EXISTS (SELECT 1 FROM verification_requests v WHERE v.user_id = b.user_id AND v.type = 'landlord_proof' AND v.status = 'approved') OR EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id AND u.role = 'admin')";
    const gated = `(b.tier IN ('plus','max') OR (b.entity_type = 'listing' AND julianday(b.ends_at) - julianday(b.starts_at) > 7.01) OR b.nationwide = 1)`;
    for (const r of q.all<{ id: string; entity_type: string; starts_at: string; ends_at: string }>(`SELECT b.id, b.entity_type, b.starts_at, b.ends_at FROM boosts b WHERE b.status IN ('active','scheduled') AND ${gated} AND NOT (${proofSql})`)) {
      const basic = q.get<{ id: string }>('SELECT id FROM pricing_plans WHERE key = ?', [`boost.${r.entity_type}.basic.7d`]);
      const cappedEnd = new Date(Math.min(Date.parse(r.ends_at), Date.parse(r.starts_at) + 7 * DAY)).toISOString();
      q.run("UPDATE boosts SET tier = 'basic', nationwide = 0, plan_id = COALESCE(?, plan_id), ends_at = ?, status = CASE WHEN ? <= ? THEN 'expired' ELSE status END WHERE id = ?", [basic?.id ?? null, cappedEnd, cappedEnd, t, r.id]);
    }
    const noFree = q.all<{ category: string }>('SELECT category FROM partners WHERE is_active = 1 GROUP BY category HAVING SUM(CASE WHEN is_sponsored = 0 THEN 1 ELSE 0 END) = 0');
    if (noFree.length) throw new Error(`seed: Kit categories without a non-sponsored option: ${noFree.map((r) => r.category).join(', ')}`);
    const violations = q.count(`SELECT COUNT(*) FROM boosts b WHERE b.status IN ('active','scheduled') AND ${gated} AND NOT (${proofSql})`);
    if (violations > 0) throw new Error(`seed: ${violations} live boost(s) break the supply-proof gate`);
  });
  void orderCount();
}

function orderCount(): number {
  return q.count("SELECT COUNT(*) FROM orders WHERE id LIKE 'bil-%'");
}
