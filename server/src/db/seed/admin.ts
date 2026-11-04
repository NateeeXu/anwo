// server/src/db/seed/admin.ts — OWNED BY THE `admin` MODULE AGENT.
// Seeds what the admin console needs to look alive, across campuses (nothing hard-coded to one school):
//   • ~2,000 analytics events over the last 30 days (pageviews, listing/item/buddy views, contact clicks, searches,
//     partner clicks, signups, logins, chat starts) with a weekly rhythm and a growth trend
//   • 2 problem accounts (one banned scammer, one spammer under review)
//   • 15 reports in every state (open / in_review / actioned / dismissed), incl. one scam report past the 12 h SLA
//   • matching moderation state (one listing hidden, one flagged by 2 open reports)
//   • ~20 historical audit entries, extra feature flags from admin-requirements §5, 7 campus requests
// Idempotent: rows use deterministic ids (prefix adm-) and are deleted before insert. Works on partial seeds
// (missing listings/items/messages just skip the reports that need them).
import type { DatabaseSync } from 'node:sqlite';
import { q, tableExists } from '../index';
import { hashPassword } from '../../lib/auth';
import { invalidateFlags } from '../../lib/flags';
import { nowMs, DAY, HOUR, MINUTE } from '../../lib/time';
import { SEED_PASSWORD, seedUserId } from './core';

export const version = 1;

// ------------------------------------------------------------------ deterministic PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261103);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
function weighted<T extends string>(w: Record<T, number>): T {
  const total = Object.values<number>(w).reduce((s, v) => s + v, 0);
  let r = rnd() * total;
  for (const [k, v] of Object.entries<number>(w)) {
    r -= v;
    if (r <= 0) return k as T;
  }
  return Object.keys(w)[0] as T;
}
const iso = (ms: number) => new Date(ms).toISOString();
const pad = (n: number, w = 4) => String(n).padStart(w, '0');

const CAMPUS_WEIGHTS = { northwestern: 46, uiuc: 15, nyu: 15, usc: 10, umich: 8, columbia: 3, bu: 3 } as const;
type CampusKey = keyof typeof CAMPUS_WEIGHTS;

const EVENT_WEIGHTS = {
  pageview: 34,
  'listing.view': 22,
  'item.view': 9,
  'buddy.view': 6,
  search: 7,
  'listing.contact_click': 4.5,
  'item.contact_click': 2,
  'affiliate.click': 4,
  login: 5,
  'chat.start': 2.5,
  'listing.save': 2.5,
  'shuttle.view': 1.5,
  signup: 1.2,
} as const;
type EventType = keyof typeof EVENT_WEIGHTS;

const PATHS = ['/', '/listings', '/market', '/buddy', '/wanted', '/shuttle', '/map', '/kit', '/pricing', '/search'];
const SEARCHES = ['studio', '1b1b 转租', 'furnished', '暑期转租', 'near shuttle', 'desk', 'ikea 沙发', 'costco 拼车', 'airport pickup', 'bike', 'textbooks', '2b2b', '女生室友', 'move-out sale'];
const SOURCES = ['card', 'search', 'map', 'share', 'home'];

// ------------------------------------------------------------------ problem accounts (not in core)
const PROBLEM_USERS = [
  {
    email: 'quickrent.chicago@gmail.com', name: 'QuickRent Chicago', role: 'landlord', campus: 'northwestern', locale: 'en',
    bio: 'Luxury apartments, wire deposit to hold. 立即预订，定金可退。', banned: true,
    bannedReason: 'Off-platform deposit requests (Zelle) on multiple listings · 多次要求平台外转账定金', daysAgo: 9,
  },
  {
    email: 'deals4students@outlook.com', name: '低价好物 Deals4Students', role: 'student', campus: 'nyu', locale: 'zh-CN',
    bio: '全新 iPhone 半价，加微信下单。', banned: false, bannedReason: null, daysAgo: 4,
  },
] as const;

export default async function seed(_db: DatabaseSync): Promise<void> {
  const now = nowMs();
  const adminId = q.get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@example.edu'")?.id ?? null;
  const uidOf = (email: string) => q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])?.id ?? null;
  const hash = await hashPassword(SEED_PASSWORD);

  q.tx(() => {
    // ---------------------------------------------------------------- problem accounts
    for (const [i, u] of PROBLEM_USERS.entries()) {
      const id = seedUserId(u.email);
      const created = iso(now - u.daysAgo * DAY);
      q.run(
        `INSERT INTO users (id, email, password_hash, name, role, trust_level, locale, campus_id, bio, referral_code, banned, banned_reason, banned_at, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, bio = excluded.bio, banned = excluded.banned,
           banned_reason = excluded.banned_reason, banned_at = excluded.banned_at, campus_id = excluded.campus_id`,
        [id, u.email, hash, u.name, u.role, u.locale, u.campus, u.bio, `ADMSEED${i}`, u.banned ? 1 : 0, u.bannedReason, u.banned ? iso(now - 2 * DAY) : null, iso(now - (u.banned ? 2 : 0.2) * DAY), created, created],
      );
    }
    const scammer = seedUserId(PROBLEM_USERS[0].email);
    const spammer = seedUserId(PROBLEM_USERS[1].email);

    // ---------------------------------------------------------------- pools
    const campusIds = (Object.keys(CAMPUS_WEIGHTS) as CampusKey[]).filter((c) => q.get('SELECT 1 FROM campuses WHERE id = ?', [c]));
    const usersBy = new Map<string, string[]>();
    const listingsBy = new Map<string, string[]>();
    const itemsBy = new Map<string, string[]>();
    const buddyBy = new Map<string, string[]>();
    for (const c of campusIds) {
      usersBy.set(c, q.all<{ id: string }>("SELECT id FROM users WHERE campus_id = ? AND banned = 0 AND role <> 'admin'", [c]).map((r) => r.id));
      listingsBy.set(c, q.all<{ id: string }>("SELECT id FROM listings WHERE campus_id = ? AND status = 'active'", [c]).map((r) => r.id));
      itemsBy.set(c, q.all<{ id: string }>("SELECT id FROM market_items WHERE campus_id = ? AND status IN ('active','reserved')", [c]).map((r) => r.id));
      buddyBy.set(c, q.all<{ id: string }>("SELECT id FROM buddy_posts WHERE campus_id = ? AND status IN ('open','full')", [c]).map((r) => r.id));
    }
    const allUsers = [...usersBy.values()].flat();
    const partners = tableExists('partners') ? q.all<{ id: string; slug: string }>('SELECT id, slug FROM partners WHERE is_active = 1').map((p) => p) : [];
    const campusWeights = Object.fromEntries(campusIds.map((c) => [c, CAMPUS_WEIGHTS[c]])) as Record<CampusKey, number>;

    // ---------------------------------------------------------------- events (~2,000 over 30 days)
    q.run("DELETE FROM events WHERE id LIKE 'adm-ev-%'");
    let n = 0;
    for (let d = 29; d >= 0; d--) {
      const dayStart = now - d * DAY - (now % DAY);
      const dow = new Date(dayStart).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const growth = 1 + (29 - d) * 0.018; // gentle growth into move-in season
      const volume = Math.round((weekend ? 48 : 64) * growth * (0.9 + rnd() * 0.2));
      // each day a subset of users is "active"
      const activeToday = new Map<string, string[]>();
      for (const c of campusIds) {
        const pool = usersBy.get(c) ?? [];
        const share = (weekend ? 0.35 : 0.5) * Math.min(1.2, growth);
        activeToday.set(c, pool.filter(() => rnd() < share));
      }
      for (let i = 0; i < volume; i++) {
        const campus = campusIds.length ? weighted(campusWeights) : null;
        const type = weighted(EVENT_WEIGHTS) as EventType;
        // US-evening skew: most traffic 13:00–05:00 UTC
        const hour = (13 + Math.floor(Math.pow(rnd(), 0.8) * 16)) % 24;
        let ts = dayStart + hour * HOUR + Math.floor(rnd() * 60) * MINUTE + Math.floor(rnd() * 60_000);
        if (ts > now - MINUTE) ts = now - Math.floor(rnd() * 6 * HOUR) - MINUTE;
        const active = campus ? activeToday.get(campus) ?? [] : [];
        const anonymous = type === 'pageview' || type === 'listing.view' || type === 'search' ? rnd() < 0.38 : false;
        const userId = anonymous || !active.length ? (type === 'signup' || type === 'login' ? pick(allUsers.length ? allUsers : ['']) || null : null) : pick(active);
        const session = `aid-${campus ?? 'x'}-${userId ? userId.slice(0, 8) : Math.floor(rnd() * 400)}-${d}`;
        let entityType: string | null = null;
        let entityId: string | null = null;
        let path: string | null = null;
        let props: Record<string, unknown> = {};
        const L = campus ? listingsBy.get(campus) ?? [] : [];
        const I = campus ? itemsBy.get(campus) ?? [] : [];
        const B = campus ? buddyBy.get(campus) ?? [] : [];
        switch (type) {
          case 'pageview':
            path = pick(PATHS);
            props = { referrer: pick(['direct', 'wechat', 'google', 'xiaohongshu', 'instagram']) };
            break;
          case 'listing.view':
          case 'listing.contact_click':
          case 'listing.save':
            if (!L.length) continue;
            entityType = 'listing';
            entityId = pick(L);
            path = `/listings/${entityId}`;
            props = type === 'listing.view' ? { source: pick(SOURCES) } : { via: 'detail' };
            break;
          case 'item.view':
          case 'item.contact_click':
            if (!I.length) continue;
            entityType = 'market_item';
            entityId = pick(I);
            path = `/market/${entityId}`;
            break;
          case 'buddy.view':
            if (!B.length) continue;
            entityType = 'buddy_post';
            entityId = pick(B);
            path = `/buddy/${entityId}`;
            break;
          case 'search':
            path = '/search';
            props = { q: pick(SEARCHES), module: pick(['listings', 'market', 'buddy', 'all']) };
            break;
          case 'affiliate.click':
            if (!partners.length) continue;
            entityType = 'partner';
            entityId = pick(partners).id;
            path = '/kit';
            props = { placement: pick(['kit', 'kit', 'listing_detail', 'onboarding']) };
            break;
          case 'chat.start':
            if (!L.length) continue;
            entityType = 'listing';
            entityId = pick(L);
            props = { context: 'listing' };
            break;
          case 'shuttle.view':
            path = '/shuttle';
            break;
          case 'signup':
            path = '/register';
            props = { method: 'email', referral: rnd() < 0.25 };
            break;
          case 'login':
            path = '/login';
            break;
        }
        if ((type === 'signup' || type === 'login' || type === 'listing.contact_click' || type === 'chat.start' || type === 'listing.save' || type === 'item.contact_click') && !userId) continue;
        q.run(
          `INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, ip_hash, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          [`adm-ev-${pad(n++, 5)}`, userId, session, campus, type, entityType, entityId, JSON.stringify(props), path, pick(['iPhone Safari', 'Chrome macOS', 'WeChat in-app', 'Chrome Android', 'Edge Windows']), iso(ts)],
        );
      }
    }

    // ---------------------------------------------------------------- reports (15)
    q.run("DELETE FROM reports WHERE id LIKE 'adm-rp-%'");
    const firstListing = (campus: string, offset = 0) =>
      q.get<{ id: string; owner_id: string }>("SELECT id, owner_id FROM listings WHERE campus_id = ? AND status = 'active' ORDER BY published_at DESC LIMIT 1 OFFSET ?", [campus, offset]);
    const firstItem = (campus: string, offset = 0) =>
      q.get<{ id: string; seller_id: string }>("SELECT id, seller_id FROM market_items WHERE campus_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1 OFFSET ?", [campus, offset]);
    const firstBuddy = (campus: string, offset = 0) =>
      q.get<{ id: string; author_id: string }>("SELECT id, author_id FROM buddy_posts WHERE campus_id = ? AND status IN ('open','full') ORDER BY created_at DESC LIMIT 1 OFFSET ?", [campus, offset]);
    const firstWanted = (campus: string) => q.get<{ id: string }>("SELECT id FROM wanted_posts WHERE campus_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [campus]);
    const aMessage = q.get<{ id: string; conversation_id: string; campus_id: string | null }>(
      "SELECT m.id, m.conversation_id, c.campus_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.kind = 'text' AND m.sender_id IS NOT NULL AND c.kind = 'direct' ORDER BY m.created_at DESC LIMIT 1",
    );
    const reporters = {
      alice: uidOf('alice@u.northwestern.edu'),
      bob: uidOf('bob@u.northwestern.edu'),
      wenjun: uidOf('wenjun.liu@u.northwestern.edu'),
      yuxuan: uidOf('yuxuan.li@illinois.edu'),
      anqi: uidOf('anqi.yang@nyu.edu'),
      kevin: uidOf('kevin.xie@nyu.edu'),
      jingyi: uidOf('jingyi.cao@usc.edu'),
      haoran: uidOf('haoran.zhang@u.northwestern.edu'),
      ruijie: uidOf('ruijie.tang@umich.edu'),
      grace: uidOf('grace.hu@u.northwestern.edu'),
    };
    const nuScam = firstListing('northwestern', 0);
    const nuDup = firstListing('northwestern', 1);
    const nuHidden = firstListing('northwestern', 2);
    const uiucListing = firstListing('uiuc', 0);
    const nyuItem = firstItem('nyu', 0);
    const nuItem = firstItem('northwestern', 0);
    const uscBuddy = firstBuddy('usc', 0);
    const nuBuddy = firstBuddy('northwestern', 0);
    const umichWanted = firstWanted('umich');

    type R = { entityType: string; entityId: string | undefined | null; campus: string | null; reason: string; details: string; reporter: string | null; status: 'open' | 'in_review' | 'actioned' | 'dismissed'; hoursAgo: number; resolution?: string; reviewedHoursAgo?: number };
    const reports: R[] = [
      { entityType: 'listing', entityId: nuScam?.id, campus: 'northwestern', reason: 'scam', details: '房东说人在国外，要求先 Zelle 转 $1,500 定金才发钥匙。Host says he is abroad and wants a $1,500 Zelle deposit before showing the unit.', reporter: reporters.alice, status: 'open', hoursAgo: 19 },
      { entityType: 'listing', entityId: nuDup?.id, campus: 'northwestern', reason: 'duplicate', details: 'Same photos as another listing on Sherman Ave, different price. 同一套房子发了两次。', reporter: reporters.bob, status: 'open', hoursAgo: 7 },
      { entityType: 'listing', entityId: nuDup?.id, campus: 'northwestern', reason: 'wrong_info', details: '照片和实际不符，现场看是一楼不是顶楼。Photos do not match — it is a ground-floor unit.', reporter: reporters.grace, status: 'open', hoursAgo: 3 },
      { entityType: 'market_item', entityId: nyuItem?.id, campus: 'nyu', reason: 'spam', details: '同一个卖家每天重复发同一件商品。Seller reposts the same item every day.', reporter: reporters.anqi, status: 'open', hoursAgo: 2 },
      { entityType: 'user', entityId: spammer, campus: 'nyu', reason: 'scam', details: '私信推销「半价 iPhone」，要求加微信先付款。DMs offering half-price iPhones, asks to pay first on WeChat.', reporter: reporters.kevin, status: 'open', hoursAgo: 5 },
      { entityType: 'buddy_post', entityId: uscBuddy?.id, campus: 'usc', reason: 'inappropriate', details: 'Post asks members to bring alcohol for an underage group. 帖子内容不合适。', reporter: reporters.jingyi, status: 'open', hoursAgo: 1 },
      { entityType: 'message', entityId: aMessage?.id, campus: aMessage?.campus_id ?? 'northwestern', reason: 'harassment', details: '对方连续发消息，语气很冲，让我很不舒服。Repeated aggressive messages after I said no.', reporter: reporters.wenjun, status: 'open', hoursAgo: 0.6 },
      { entityType: 'listing', entityId: uiucListing?.id, campus: 'uiuc', reason: 'fake', details: 'Address is a parking lot on Google Maps. 地址在地图上是停车场。', reporter: reporters.yuxuan, status: 'in_review', hoursAgo: 10 },
      { entityType: 'wanted', entityId: umichWanted?.id, campus: 'umich', reason: 'other', details: '帖子里留了别人的电话号码。The post contains someone else’s phone number.', reporter: reporters.ruijie, status: 'in_review', hoursAgo: 4 },
      { entityType: 'listing', entityId: nuHidden?.id, campus: 'northwestern', reason: 'scam', details: 'Asked for a wire transfer to a "property agent" overseas. 要求电汇给海外「中介」。', reporter: reporters.haoran, status: 'actioned', hoursAgo: 60, resolution: 'hidden', reviewedHoursAgo: 52 },
      { entityType: 'user', entityId: scammer, campus: 'northwestern', reason: 'scam', details: 'Same Zelle deposit script across three listings. 三个房源同样的定金话术。', reporter: reporters.alice, status: 'actioned', hoursAgo: 70, resolution: 'banned', reviewedHoursAgo: 48 },
      { entityType: 'market_item', entityId: nuItem?.id, campus: 'northwestern', reason: 'wrong_info', details: 'Listed as like new but has a cracked screen. 标注几乎全新，实际屏幕有裂痕。', reporter: reporters.grace, status: 'actioned', hoursAgo: 120, resolution: 'warned', reviewedHoursAgo: 110 },
      { entityType: 'buddy_post', entityId: nuBuddy?.id, campus: 'northwestern', reason: 'spam', details: '看起来像广告。Looks like an ad.', reporter: reporters.bob, status: 'dismissed', hoursAgo: 96, resolution: 'Legit Costco carpool, not an ad. 正常拼车帖。', reviewedHoursAgo: 90 },
      { entityType: 'listing', entityId: uiucListing?.id, campus: 'uiuc', reason: 'other', details: 'Price seems too low. 价格低得不正常。', reporter: reporters.yuxuan, status: 'dismissed', hoursAgo: 200, resolution: 'Summer sublet discount confirmed with host. 已和房东确认是暑期优惠价。', reviewedHoursAgo: 180 },
      { entityType: 'market_item', entityId: nyuItem?.id, campus: 'nyu', reason: 'duplicate', details: 'Posted twice. 重复发布。', reporter: reporters.kevin, status: 'dismissed', hoursAgo: 150, resolution: 'Different item (second desk). 是另一张桌子。', reviewedHoursAgo: 140 },
    ];
    let ri = 0;
    for (const r of reports) {
      if (!r.entityId) continue;
      const id = `adm-rp-${pad(++ri, 2)}`;
      q.run(
        `INSERT INTO reports (id, reporter_id, entity_type, entity_id, campus_id, reason, details, status, reviewer_id, resolution, reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, r.reporter, r.entityType, r.entityId, r.campus, r.reason, r.details, r.status,
          r.status === 'open' ? null : adminId, r.resolution ?? null, r.reviewedHoursAgo !== undefined ? iso(now - r.reviewedHoursAgo * HOUR) : null,
          iso(now - r.hoursAgo * HOUR),
        ],
      );
    }

    // moderation state that matches the reports above (re-runs reset what a walkthrough may have changed)
    if (nuScam) q.run("UPDATE listings SET moderation_status = 'ok', moderation_note = NULL WHERE id = ?", [nuScam.id]);
    if (uiucListing) q.run("UPDATE listings SET moderation_status = 'ok', moderation_note = NULL WHERE id = ?", [uiucListing.id]);
    if (nyuItem) q.run("UPDATE market_items SET moderation_status = 'ok' WHERE id = ?", [nyuItem.id]);
    if (uscBuddy) q.run("UPDATE buddy_posts SET moderation_status = 'ok' WHERE id = ?", [uscBuddy.id]);
    if (nuHidden) q.run("UPDATE listings SET moderation_status = 'hidden', moderation_note = 'Overseas wire-transfer request (report adm-rp-10)' WHERE id = ?", [nuHidden.id]);
    if (nuDup) q.run("UPDATE listings SET moderation_status = 'flagged', moderation_note = 'auto: 2+ open reports' WHERE id = ?", [nuDup.id]);

    // ---------------------------------------------------------------- feature flags (requirements §5 keys not seeded by core)
    const extraFlags: { key: string; enabled: boolean; value: unknown; description: string; campusIds?: string[] }[] = [
      { key: 'boosts.max_tier_enabled', enabled: true, value: null, description: 'Allows the Max boost tier (home carousel)' },
      { key: 'boosts.spotlight.enabled', enabled: true, value: null, description: 'Nationwide Spotlight add-on for boosts' },
      { key: 'escrow.mock_demo', enabled: true, value: null, description: 'Lets the mock Secure Payment flow run in test mode' },
      { key: 'protection.enabled', enabled: false, value: { claimCapCents: 150000, monthlyCapCents: 2500000, reserveBps: 2000 }, description: 'Phase-2 Deposit Protection' },
      { key: 'affiliate.no_ssn_label', enabled: true, value: { reverifyDays: 90 }, description: 'Shows the “No SSN needed” chip only when verified recently' },
      { key: 'referrals.enabled', enabled: true, value: { rewardCents: 500, postBonusCents: 500, maxRewardedPer30d: 10 }, description: 'Referral credits' },
      { key: 'promo.ignite.enabled', enabled: true, value: { creditCents: 1900, maxPerCampus: 100 }, description: 'IGNITE-* campus launch promo codes' },
      { key: 'sponsors.enabled', enabled: true, value: { maxFeedPerCampus: 3 }, description: 'Local sponsor surfaces (campuses in stage lit or later)' },
      { key: 'buildings.enabled', enabled: true, value: null, description: 'Verified Building pages' },
      { key: 'viewing.enabled', enabled: false, value: { campuses: [] }, description: 'Verified Viewing pilot' },
      { key: 'fha_linter.enabled', enabled: true, value: { blockOnMatch: false }, description: 'Fair-housing wording check on publish (flag vs block)' },
      { key: 'campus.ignitions_per_month', enabled: true, value: { max: 6 }, description: 'Cadence cap for new campus launches' },
      { key: 'billing.live', enabled: false, value: null, description: 'Mirrors BILLING_LIVE for display; the server trusts env' },
      { key: 'digest.enabled', enabled: true, value: { hourUtc: 9 }, description: 'Nightly email-style digest' },
      { key: 'shuttle.live_eta', enabled: true, value: null, description: 'Live shuttle ETAs where the campus publishes a feed', campusIds: ['northwestern', 'uiuc'].filter((c) => campusIds.includes(c as CampusKey)) },
    ];
    const flagTimes = [26, 21, 18, 14, 12, 9, 7, 6, 5, 4, 3, 2, 2, 1, 0.5];
    extraFlags.forEach((f, i) => {
      q.run(
        `INSERT OR IGNORE INTO feature_flags (key, enabled, value_json, description, campus_ids_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [f.key, f.enabled ? 1 : 0, JSON.stringify(f.value), f.description, JSON.stringify(f.campusIds ?? []), adminId, iso(now - (flagTimes[i] ?? 1) * DAY)],
      );
    });
    invalidateFlags();

    // ---------------------------------------------------------------- campus requests
    q.run("DELETE FROM campus_requests WHERE id LIKE 'adm-cr-%'");
    const requests = [
      { school: 'Stevens Institute of Technology', city: 'Hoboken', state: 'NJ', email: 'lin.w@stevens.edu', note: '学校里中国学生很多，Hoboken 租房很难找。Lots of us here and Hoboken rentals are hard to find.', status: 'open', daysAgo: 12, user: null },
      { school: 'Stevens Institute of Technology', city: 'Hoboken', state: 'NJ', email: 'jchen12@stevens.edu', note: 'Would love sublets near PATH.', status: 'open', daysAgo: 6, user: null },
      { school: 'stevens institute of technology', city: 'Hoboken', state: 'NJ', email: null, note: '求开通！', status: 'open', daysAgo: 2, user: null },
      { school: 'Case Western Reserve University', city: 'Cleveland', state: 'OH', email: 'yxz@case.edu', note: 'Grad students looking for summer sublets near University Circle.', status: 'open', daysAgo: 9, user: null },
      { school: 'Lehigh University', city: 'Bethlehem', state: 'PA', email: 'mzh224@lehigh.edu', note: '希望有二手家具交易。', status: 'open', daysAgo: 3, user: null },
      { school: 'Clark University', city: 'Worcester', state: 'MA', email: null, note: 'Small school but many international students.', status: 'rejected', daysAgo: 30, user: null },
      { school: 'Illinois Institute of Technology', city: 'Chicago', state: 'IL', email: 'kli@hawk.iit.edu', note: 'Please add IIT, we are close to UChicago.', status: 'added', daysAgo: 40, user: uidOf('bob@u.northwestern.edu') },
    ];
    requests.forEach((r, i) => {
      q.run('INSERT INTO campus_requests (id, user_id, school_name, city, state, email, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        `adm-cr-${pad(i + 1, 2)}`, r.user, r.school, r.city, r.state, r.email, r.note, r.status, iso(now - r.daysAgo * DAY),
      ]);
    });

    // ---------------------------------------------------------------- audit history
    q.run("DELETE FROM audit_log WHERE id LIKE 'adm-au-%'");
    const audits: { action: string; entityType: string; entityId: string | null | undefined; before: unknown; after: unknown; reason: string | null; hoursAgo: number }[] = [
      { action: 'flag.update', entityType: 'feature_flag', entityId: 'protection.enabled', before: { enabled: true }, after: { enabled: false }, reason: 'Counsel review pending · 等待法务确认', hoursAgo: 26 * 24 },
      { action: 'campus.update', entityType: 'campus', entityId: 'uiuc', before: { default_radius_m: 5000 }, after: { default_radius_m: 6000 }, reason: 'Champaign + Urbana listings sit further out', hoursAgo: 22 * 24 },
      { action: 'campus_request.update', entityType: 'campus_request', entityId: 'adm-cr-07', before: { status: 'open' }, after: { status: 'added' }, reason: 'IIT added in the campus list refresh', hoursAgo: 20 * 24 },
      { action: 'user.role', entityType: 'user', entityId: uidOf('evanston.rentals@gmail.com'), before: { role: 'student' }, after: { role: 'landlord' }, reason: 'Property-management proof checked · 已核实物业管理资质', hoursAgo: 18 * 24 },
      { action: 'user.quota', entityType: 'user', entityId: uidOf('landlord@evanstonhomes.com'), before: { listingQuota: 2 }, after: { listingQuota: 3 }, reason: 'Family-owned building, 3 units', hoursAgo: 15 * 24 },
      { action: 'report.dismiss', entityType: 'report', entityId: 'adm-rp-14', before: { status: 'open' }, after: { status: 'dismissed' }, reason: 'Summer sublet discount confirmed with host', hoursAgo: 180 },
      { action: 'report.dismiss', entityType: 'report', entityId: 'adm-rp-15', before: { status: 'open' }, after: { status: 'dismissed' }, reason: 'Different item (second desk)', hoursAgo: 140 },
      { action: 'user.warn', entityType: 'user', entityId: nuItem?.seller_id, before: null, after: { reportId: 'adm-rp-12' }, reason: 'Condition overstated on a market item', hoursAgo: 110 },
      { action: 'report.action', entityType: 'report', entityId: 'adm-rp-12', before: { status: 'open' }, after: { status: 'actioned', action: 'warn_user' }, reason: 'Condition overstated on a market item', hoursAgo: 110 },
      { action: 'report.dismiss', entityType: 'report', entityId: 'adm-rp-13', before: { status: 'open' }, after: { status: 'dismissed' }, reason: 'Legit Costco carpool, not an ad', hoursAgo: 90 },
      { action: 'listing.hide', entityType: 'listing', entityId: nuHidden?.id, before: { moderationStatus: 'ok' }, after: { moderationStatus: 'hidden' }, reason: 'Overseas wire-transfer request', hoursAgo: 52 },
      { action: 'report.action', entityType: 'report', entityId: 'adm-rp-10', before: { status: 'open' }, after: { status: 'actioned', action: 'hide' }, reason: 'Overseas wire-transfer request', hoursAgo: 52 },
      { action: 'user.ban', entityType: 'user', entityId: scammer, before: { banned: false }, after: { banned: true, pausedListings: [], hidden: [], lockedConversations: [] }, reason: PROBLEM_USERS[0].bannedReason, hoursAgo: 48 },
      { action: 'report.action', entityType: 'report', entityId: 'adm-rp-11', before: { status: 'open' }, after: { status: 'actioned', action: 'ban_user' }, reason: 'Same Zelle script across listings', hoursAgo: 48 },
      { action: 'flag.update', entityType: 'feature_flag', entityId: 'shuttle.live_eta', before: { campusIds: ['northwestern'] }, after: { campusIds: ['northwestern', 'uiuc'] }, reason: 'UIUC MTD feed verified', hoursAgo: 12 },
      { action: 'report.claim', entityType: 'report', entityId: 'adm-rp-08', before: { status: 'open' }, after: { status: 'in_review' }, reason: 'Checking address with the host', hoursAgo: 9 },
      { action: 'report.claim', entityType: 'report', entityId: 'adm-rp-09', before: { status: 'open' }, after: { status: 'in_review' }, reason: 'Asked the poster to remove the phone number', hoursAgo: 3.5 },
      { action: 'listing.flag', entityType: 'listing', entityId: nuDup?.id, before: { moderationStatus: 'ok' }, after: { moderationStatus: 'flagged', auto: true }, reason: '2+ open reports', hoursAgo: 2.9 },
      { action: 'export.csv', entityType: 'table', entityId: 'partner_clicks', before: null, after: { rows: 180 }, reason: null, hoursAgo: 1.5 },
    ];
    audits.forEach((a, i) => {
      if (!a.entityId) return;
      q.run(
        'INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [`adm-au-${pad(i + 1, 2)}`, a.action === 'listing.flag' ? null : adminId, a.action === 'listing.flag' ? null : 'admin', a.action, a.entityType, a.entityId,
          a.before === null ? null : JSON.stringify(a.before), JSON.stringify(a.after), a.reason, iso(now - a.hoursAgo * HOUR)],
      );
    });
  });
}
