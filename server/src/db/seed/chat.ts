// server/src/db/seed/chat.ts — OWNED BY THE `chat` MODULE AGENT.
// 25 conversations (21 direct about listings / items / buddy posts / general, 4 buddy group chats) across
// Northwestern (rich), UIUC and NYU, with bilingual threads, context cards, image messages, read states, mutes,
// archives, one blocked pair + scam report. Alice (alice@u.northwestern.edu) has 8 threads with unread messages.
//
// Context entities: we prefer rows other modules' seeds already created; when a referenced listing / item / buddy post
// is missing we insert a minimal fallback row (ids prefixed `chatseed-`) so the cards resolve. The context card is
// also stored on the thread's first message, so threads keep rendering even if another seed later removes the entity.
// Delete-and-insert: everything we own is prefixed `chatseed-` (conversations, messages, reports) and re-created.
import type { DatabaseSync } from 'node:sqlite';
import { q } from '../index';
import { nowMs } from '../../lib/time';
import { sha256 } from '../../lib/ids';
import { insertSeedUpload } from '../../lib/uploads';

export const version = 1;

type Ctx = { type: 'listing' | 'market_item' | 'buddy_post'; id: string };
type Msg =
  | { from: string | null; text: string; m: number; kind?: 'text' }
  | { from: string; kind: 'image'; image: string; text?: string; m: number }
  | { from: null; kind: 'system'; event: string; user?: string; m: number; data?: Record<string, unknown> };
type Conv = {
  id: string;
  kind: 'direct' | 'group';
  title?: string;
  campus: string;
  context?: Ctx;
  createdBy: string;
  members: string[];
  messages: Msg[];
  /** unread message count per member key (default 0 = read everything) */
  unread?: Record<string, number>;
  archived?: string[];
  muted?: string[];
  scamDismissed?: string[];
  left?: string[];
};

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EMAILS: Record<string, string> = {
  alice: 'alice@u.northwestern.edu', bob: 'bob@u.northwestern.edu', landlord: 'landlord@evanstonhomes.com', newbie: 'newbie@u.northwestern.edu',
  wenjun: 'wenjun.liu@u.northwestern.edu', haoran: 'haoran.zhang@u.northwestern.edu', yuting: 'yuting.chen@u.northwestern.edu',
  minjae: 'minjae.park@u.northwestern.edu', siyuan: 'siyuan.wu@u.northwestern.edu', tianyi: 'tianyi.zhao@u.northwestern.edu',
  xinyi: 'xinyi.lin@u.northwestern.edu', kai: 'kai.tanaka@u.northwestern.edu', ruoxi: 'ruoxi.sun@u.northwestern.edu',
  zihao: 'zihao.guo@u.northwestern.edu', mengyao: 'mengyao.xu@u.northwestern.edu', daniel: 'daniel.kim@u.northwestern.edu',
  yiran: 'yiran.feng@u.northwestern.edu', sophia: 'sophia.wang@u.northwestern.edu', leo: 'leo.ma@u.northwestern.edu',
  chloe: 'chloe.deng@u.northwestern.edu', ethan: 'ethan.luo@u.northwestern.edu', nina: 'nina.zhou@u.northwestern.edu',
  grace: 'grace.hu@u.northwestern.edu', lakeshore: 'evanston.rentals@gmail.com',
  yuxuan: 'yuxuan.li@illinois.edu', qianqian: 'qianqian.wang@illinois.edu', jason: 'jason.tan@illinois.edu', meilin: 'meilin.gao@illinois.edu',
  ryan: 'ryan.zhu@illinois.edu', hana: 'hana.sato@illinois.edu',
  anqi: 'anqi.yang@nyu.edu', kevin: 'kevin.xie@nyu.edu', lucia: 'lucia.fernandez@nyu.edu', ziyang: 'ziyang.pan@nyu.edu', mia: 'mia.cheng@nyu.edu',
};

function id(seedKey: string): string {
  const h = sha256('chatseed:' + seedKey);
  return `chatseed-${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function iso(msAgo: number, base: number): string {
  return new Date(base - msAgo).toISOString();
}

// ---------------------------------------------------------------- context entities (fallbacks)
type ListingSpec = { key: string; owner: string; campus: string; title: string; price: number; deposit?: number; bedrooms: number; bathrooms: number; address: string; city: string; state: string; zip: string; neighborhood: string; lat: number; lng: number; from: string; to?: string | null; furnished: 'none' | 'partial' | 'full'; type?: 'sublet' | 'lease_takeover' | 'new_lease'; property?: 'studio' | 'apartment' | 'house' | 'room'; cover: number; description: string };
const LISTINGS: ListingSpec[] = [
  { key: 'l1', owner: 'landlord', campus: 'northwestern', title: '1735 Chicago Ave 2B1B · 近 Davis 站', price: 125000, deposit: 125000, bedrooms: 2, bathrooms: 1, address: '1735 Chicago Ave', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Downtown Evanston', lat: 42.0479, lng: -87.6793, from: '2026-06-15', to: '2026-08-31', furnished: 'partial', cover: 1, description: 'Bright 2-bedroom two blocks from Davis St station. Water and heat included. 步行 8 分钟到校。' },
  { key: 'l2', owner: 'chloe', campus: 'northwestern', title: 'Davis St 附近 1B1B 带家具 · 7 月起', price: 148000, bedrooms: 1, bathrooms: 1, address: '820 Davis St', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Downtown Evanston', lat: 42.0464, lng: -87.6822, from: '2026-07-01', to: '2027-06-30', furnished: 'full', type: 'lease_takeover', cover: 2, description: '全套家具留下，床、书桌、沙发都是去年新买。楼下 Whole Foods，步行 10 分钟到校。' },
  { key: 'l3', owner: 'yuting', campus: 'northwestern', title: 'Sherman Ave Studio 带家具 · 市中心', price: 165000, bedrooms: 0, bathrooms: 1, address: '1630 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Downtown Evanston', lat: 42.0455, lng: -87.6815, from: '2026-06-01', to: '2026-08-31', furnished: 'full', property: 'studio', cover: 3, description: 'Furnished studio in a doorman building, gym and laundry in the basement. Summer only.' },
  { key: 'l6', owner: 'ruoxi', campus: 'northwestern', title: '2B2B 整租转让 · Sherman Plaza', price: 240000, bedrooms: 2, bathrooms: 2, address: '807 Davis St', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Sherman Plaza', lat: 42.0470, lng: -87.6830, from: '2026-09-01', to: '2027-08-31', furnished: 'partial', type: 'lease_takeover', cover: 6, description: '一年整租转让，可以分租单间。楼里有健身房和 package room。' },
  { key: 'l7', owner: 'nina', campus: 'northwestern', title: 'Hinman Ave 两室 · 8 月起', price: 190000, bedrooms: 2, bathrooms: 1, address: '1500 Hinman Ave', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Southeast Evanston', lat: 42.0432, lng: -87.6760, from: '2026-08-01', to: null, furnished: 'none', type: 'new_lease', cover: 7, description: 'Quiet tree-lined street, 12 minutes to campus on foot, 5 to the lake.' },
  { key: 'l8', owner: 'lakeshore', campus: 'northwestern', title: 'Sherman Ave 1B · July move-in', price: 139500, bedrooms: 1, bathrooms: 1, address: '1900 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'Downtown Evanston', lat: 42.0492, lng: -87.6818, from: '2026-07-01', to: null, furnished: 'none', type: 'new_lease', cover: 8, description: 'One bedroom on Sherman, hardwood floors, laundry in unit.' },
  { key: 'l9', owner: 'bob', campus: 'northwestern', title: 'Noyes 站旁 1B 暑期转租 · 包水电', price: 95000, bedrooms: 1, bathrooms: 1, address: '2100 Noyes St', city: 'Evanston', state: 'IL', zip: '60201', neighborhood: 'North Evanston', lat: 42.0582, lng: -87.6841, from: '2026-06-10', to: '2026-08-31', furnished: 'full', cover: 9, description: '暑期去湾区实习，6 月 10 日到 8 月底转租，包水电网，家具齐全，出门就是 Noyes 紫线站。' },
  { key: 'l4', owner: 'yuxuan', campus: 'uiuc', title: 'Green St 公寓暑期转租 · 近 Siebel', price: 90000, bedrooms: 1, bathrooms: 1, address: '519 E Green St', city: 'Champaign', state: 'IL', zip: '61820', neighborhood: 'Campustown', lat: 40.1105, lng: -88.2337, from: '2026-05-18', to: '2026-08-10', furnished: 'full', cover: 4, description: '暑期转租，走路 5 分钟到 Siebel Center，楼下就是 Target。' },
  { key: 'l5', owner: 'kevin', campus: 'nyu', title: 'East Village 1B 暑期转租 · 近 Astor Pl', price: 260000, bedrooms: 1, bathrooms: 1, address: '215 E 10th St', city: 'New York', state: 'NY', zip: '10003', neighborhood: 'East Village', lat: 40.7295, lng: -73.9863, from: '2026-06-01', to: '2026-08-31', furnished: 'full', cover: 5, description: '实习去西雅图，6–8 月整租转出，家具全留，走路 10 分钟到 Bobst。' },
  { key: 'l10', owner: 'ziyang', campus: 'nyu', title: 'Greenwich Village 1B · 9 月起', price: 320000, bedrooms: 1, bathrooms: 1, address: '45 W 11th St', city: 'New York', state: 'NY', zip: '10011', neighborhood: 'Greenwich Village', lat: 40.7352, lng: -73.9962, from: '2026-09-01', to: null, furnished: 'partial', type: 'new_lease', cover: 10, description: 'Pre-war one bedroom, elevator building, 6 minutes to Washington Square.' },
];
type ItemSpec = { key: string; seller: string; campus: string; title: string; price: number; category: string; condition: string; pickup: string; lat: number; lng: number; city: string; state: string; cover: number; description: string };
const ITEMS: ItemSpec[] = [
  { key: 'i1', seller: 'xinyi', campus: 'northwestern', title: 'IKEA 书桌 + 椅子（MICKE + MARKUS）', price: 6000, category: 'furniture', condition: 'good', pickup: 'Near Ridge Ave & Davis St', lat: 42.0466, lng: -87.6905, city: 'Evanston', state: 'IL', cover: 1, description: '毕业出闲置，桌面有一点划痕，椅子九成新。需自取。' },
  { key: 'i2', seller: 'leo', campus: 'northwestern', title: 'Trek FX 2 通勤自行车 · M 码', price: 18000, category: 'bikes', condition: 'good', pickup: 'Near Tech Institute', lat: 42.0578, lng: -87.6760, city: 'Evanston', state: 'IL', cover: 2, description: '骑了两年，刚换过刹车片，送车锁和前灯。' },
  { key: 'i3', seller: 'hana', campus: 'uiuc', title: 'Giant Escape 3 自行车 + 车锁', price: 12000, category: 'bikes', condition: 'fair', pickup: 'Near ISR', lat: 40.1120, lng: -88.2219, city: 'Urbana', state: 'IL', cover: 3, description: 'Graduating in May. Rides fine, some rust on the chain. U-lock included.' },
];
type BuddySpec = { key: string; author: string; campus: string; type: string; title: string; startsAt: number; location: string; lat: number; lng: number; dest?: string; max: number; description: string };
const BUDDIES: BuddySpec[] = [
  { key: 'b1', author: 'zihao', campus: 'northwestern', type: 'costco_run', title: '周六 Costco 拼车（Glenview）', startsAt: 2 * DAY, location: 'Tech Institute 门口', lat: 42.0578, lng: -87.6760, dest: 'Costco Glenview', max: 6, description: '周六上午 10 点出发，下午 1 点左右回来，SUV 后备箱大。' },
  { key: 'b2', author: 'siyuan', campus: 'northwestern', type: 'airport_pickup', title: '8/28 O\'Hare 接机（T5 → Evanston）', startsAt: 25 * DAY, location: "O'Hare Terminal 5", lat: 41.9742, lng: -87.9073, dest: 'Evanston', max: 4, description: '新生接机，白色 RAV4，可以带两个大箱子。' },
  { key: 'b3', author: 'daniel', campus: 'northwestern', type: 'study', title: 'CS 336 期末学习小组', startsAt: 1 * DAY, location: 'Mudd Library 3F', lat: 42.0581, lng: -87.6742, max: 6, description: 'Weekly problem-set sessions before the final. Everyone welcome.' },
  { key: 'b4', author: 'jason', campus: 'uiuc', type: 'carpool', title: '5 月 O\'Hare 拼车（Champaign → ORD）', startsAt: 9 * DAY, location: 'Green St & Wright St', lat: 40.1100, lng: -88.2290, dest: "O'Hare (ORD)", max: 4, description: 'Leaving May 12 around 8am. Gas split four ways.' },
];

function ensureContexts(users: Record<string, string>, base: number): void {
  const t = new Date(base).toISOString();
  for (const l of LISTINGS) {
    const lid = id('listing:' + l.key);
    if (q.get('SELECT id FROM listings WHERE id = ?', [lid])) continue;
    const cover = insertSeedUpload({ path: `seed/rooms/r${String(l.cover).padStart(2, '0')}.svg`, purpose: 'seed' });
    q.run(
      `INSERT INTO listings (id, owner_id, campus_id, title, description, listing_type, property_type, address_line1, city, state, zip, country, lat, lng, geocode_precision,
         hide_exact_address, neighborhood, price_cents, deposit_cents, utilities_included, bedrooms, bathrooms, furnished, available_from, available_to, min_term_months, lease_type,
         status, moderation_status, is_verified_listing, published_at, expires_at, cover_upload_id, photo_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, 'street', 1, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ?, 'active', 'ok', 1, ?, ?, ?, 1, ?, ?)`,
      [lid, users[l.owner]!, l.campus, l.title, l.description, l.type ?? 'sublet', l.property ?? (l.bedrooms === 0 ? 'studio' : 'apartment'), l.address, l.city, l.state, l.zip, l.lat, l.lng,
        l.neighborhood, l.price, l.deposit ?? l.price, l.bedrooms, l.bathrooms, l.furnished, l.from, l.to ?? null, l.type === 'lease_takeover' ? 'takeover' : l.type === 'new_lease' ? 'new_lease' : 'sublease',
        iso(12 * DAY, base), iso(-60 * DAY, base), cover, iso(12 * DAY, base), t],
    );
  }
  for (const i of ITEMS) {
    const iid = id('item:' + i.key);
    if (q.get('SELECT id FROM market_items WHERE id = ?', [iid])) continue;
    const cover = insertSeedUpload({ path: `seed/items/i${String(i.cover).padStart(2, '0')}.svg`, purpose: 'seed' });
    q.run(
      `INSERT INTO market_items (id, seller_id, campus_id, title, description, category, condition, price_cents, is_free, obo, pickup_label, pickup_lat, pickup_lng, city, state, delivery_option, status, moderation_status, cover_upload_id, photo_count, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, 'pickup', 'active', 'ok', ?, 1, ?, ?, ?)`,
      [iid, users[i.seller]!, i.campus, i.title, i.description, i.category, i.condition, i.price, i.pickup, i.lat, i.lng, i.city, i.state, cover, iso(-45 * DAY, base), iso(9 * DAY, base), t],
    );
  }
  for (const b of BUDDIES) {
    const bid = id('buddy:' + b.key);
    if (q.get('SELECT id FROM buddy_posts WHERE id = ?', [bid])) continue;
    q.run(
      `INSERT INTO buddy_posts (id, author_id, campus_id, type, title, description, starts_at, ends_at, is_all_day, location_name, lat, lng, destination_name, languages_json, max_members, member_count, verified_only, min_trust_level, requires_approval, status, moderation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, '["zh","en"]', ?, 1, 0, 0, 0, 'open', 'ok', ?, ?)`,
      [bid, users[b.author]!, b.campus, b.type, b.title, b.description, iso(-b.startsAt, base), iso(-b.startsAt - 3 * HOUR, base), b.location, b.lat, b.lng, b.dest ?? null, b.max, iso(6 * DAY, base), t],
    );
  }
}

type CardRow = { type: Ctx['type']; id: string; title: string; subtitle?: string; priceCents?: number; imageUrl?: string | null; link: string; status?: string };
function cardFor(ctx: Ctx): CardRow {
  if (ctx.type === 'listing') {
    const r = q.get<{ title: string; price_cents: number; neighborhood: string | null; city: string; status: string; cover_url: string | null }>(
      'SELECT l.title, l.price_cents, l.neighborhood, l.city, l.status, u.url AS cover_url FROM listings l LEFT JOIN uploads u ON u.id = l.cover_upload_id WHERE l.id = ?', [ctx.id])!;
    return { type: 'listing', id: ctx.id, title: r.title, subtitle: [r.neighborhood, r.city].filter(Boolean).join(', '), priceCents: r.price_cents, imageUrl: r.cover_url, link: `/listings/${ctx.id}`, status: r.status };
  }
  if (ctx.type === 'market_item') {
    const r = q.get<{ title: string; price_cents: number; is_free: number; status: string; category: string; cover_url: string | null }>(
      'SELECT m.title, m.price_cents, m.is_free, m.status, m.category, u.url AS cover_url FROM market_items m LEFT JOIN uploads u ON u.id = m.cover_upload_id WHERE m.id = ?', [ctx.id])!;
    return { type: 'market_item', id: ctx.id, title: r.title, subtitle: r.category, priceCents: r.is_free ? 0 : r.price_cents, imageUrl: r.cover_url, link: `/market/${ctx.id}`, status: r.status };
  }
  const r = q.get<{ title: string; type: string; starts_at: string | null; status: string }>('SELECT title, type, starts_at, status FROM buddy_posts WHERE id = ?', [ctx.id])!;
  return { type: 'buddy_post', id: ctx.id, title: r.title, subtitle: [r.type, r.starts_at].filter(Boolean).join(' · '), link: `/buddy/${ctx.id}`, status: r.status };
}

// ---------------------------------------------------------------- conversations
function conversations(): Conv[] {
  const L = (k: string): Ctx => ({ type: 'listing', id: id('listing:' + k) });
  const I = (k: string): Ctx => ({ type: 'market_item', id: id('item:' + k) });
  const B = (k: string): Ctx => ({ type: 'buddy_post', id: id('buddy:' + k) });
  const sys = (event: string, user: string | undefined, m: number): Msg => ({ from: null, kind: 'system', event, user, m });
  return [
    // ---- alice (8 unread threads)
    {
      id: 'c01', kind: 'direct', campus: 'northwestern', context: L('l1'), createdBy: 'alice', members: ['alice', 'landlord'],
      messages: [
        { from: 'alice', text: '你好，看到 1735 Chicago Ave 的两室，请问 6 月 15 日还能入住吗？', m: 3 * DAY },
        { from: 'landlord', text: 'Hi Alice! Yes, the unit is available from June 15. The lease runs through Aug 31 and can go month-to-month after that.', m: 3 * DAY - 25 * MIN },
        { from: 'alice', text: '太好了。水电网是包含在 $1,250 里吗？', m: 3 * DAY - 40 * MIN },
        { from: 'landlord', text: 'Water and heat are included. Electricity and internet are separate, about $60 a month combined.', m: 2 * DAY + 20 * HOUR },
        { from: 'alice', text: '明白。这周五下午 3 点可以看房吗？', m: 2 * DAY + 18 * HOUR },
        { from: 'landlord', text: 'Friday 3 PM works. I\'ll meet you at the front door on Chicago Ave — message me when you\'re 5 minutes away.', m: 46 * MIN },
        { from: 'landlord', text: 'One more thing: please don\'t send any deposit before you\'ve seen the place. We only take deposits through Anwo escrow.', m: 41 * MIN },
      ],
      unread: { alice: 2 }, scamDismissed: ['alice', 'landlord'],
    },
    {
      id: 'c02', kind: 'direct', campus: 'northwestern', context: L('l2'), createdBy: 'alice', members: ['alice', 'chloe'],
      messages: [
        { from: 'alice', text: 'Hi 可可～ 看到你的 Davis St 一居，我 7 月初想搬，家具都留下吗？', m: 2 * DAY + 6 * HOUR },
        { from: 'chloe', text: '都留！床、桌子、沙发都是去年买的，走的时候会打扫干净。', m: 2 * DAY + 5 * HOUR },
        { from: 'chloe', kind: 'image', image: 'seed/rooms/r02.svg', m: 2 * DAY + 5 * HOUR - 2 * MIN },
        { from: 'alice', text: '那太省事了。附近停车方便吗？我有一辆车。', m: 2 * DAY + 4 * HOUR },
        { from: 'chloe', text: '楼下有 street parking，Evanston 居民停车证一年 $30 左右。', m: 2 * DAY + 3 * HOUR },
        { from: 'chloe', text: '明天晚上 7 点以后可以视频看房，你方便吗？', m: 2 * HOUR + 10 * MIN },
      ],
      unread: { alice: 1 }, scamDismissed: ['alice'],
    },
    {
      id: 'c03', kind: 'direct', campus: 'northwestern', context: L('l3'), createdBy: 'alice', members: ['alice', 'yuting'],
      messages: [
        { from: 'alice', text: '请问 studio 有洗衣机吗？', m: 4 * DAY + 2 * HOUR },
        { from: 'yuting', text: '楼里地下室有公用洗衣房，刷卡的，一次 $2。', m: 4 * DAY + 1 * HOUR },
        { from: 'alice', text: '好的谢谢，我再考虑一下～', m: 4 * DAY },
      ],
      scamDismissed: ['alice', 'yuting'],
    },
    {
      id: 'c04', kind: 'direct', campus: 'northwestern', context: I('i1'), createdBy: 'alice', members: ['alice', 'xinyi'],
      messages: [
        { from: 'alice', text: '桌子还在吗？想周末来取。', m: DAY + 5 * HOUR },
        { from: 'xinyi', text: '在的！周六下午都在家，Ridge Ave 这边。', m: DAY + 4 * HOUR },
        { from: 'alice', text: '周六 2 点可以吗？我开车来。', m: DAY + 3 * HOUR },
        { from: 'xinyi', text: '可以，到了给我发消息，我帮你搬下楼。', m: 70 * MIN },
        { from: 'xinyi', kind: 'image', image: 'seed/items/i01.svg', text: '对了这是现在的样子，桌面有一点点划痕。', m: 66 * MIN },
      ],
      unread: { alice: 2 }, scamDismissed: ['alice', 'xinyi'],
    },
    {
      id: 'c05', kind: 'direct', campus: 'northwestern', context: I('i2'), createdBy: 'alice', members: ['alice', 'leo'],
      messages: [
        { from: 'alice', text: '车子的尺码是多少？我 165cm。', m: 5 * HOUR },
        { from: 'leo', text: 'M 码，我 175 骑着刚好，165 的话把座椅调低一点就行。', m: 4 * HOUR },
        { from: 'leo', text: '价格可以商量，下周就搬走了，$150 也行。', m: 32 * MIN },
      ],
      unread: { alice: 2 },
    },
    {
      id: 'c06', kind: 'direct', campus: 'northwestern', createdBy: 'bob', members: ['alice', 'bob'],
      messages: [
        { from: 'bob', text: '晓雨！听说你在找房，我 6–8 月要去湾区实习，我这间可以转租给你，Noyes 站旁边。', m: DAY + 2 * HOUR },
        { from: 'alice', text: '真的吗？多少钱一个月？', m: DAY + 1 * HOUR },
        { from: 'bob', text: '$950 包水电，家具都有。你要不要周末来看看？', m: 20 * HOUR },
        { from: 'bob', text: '我刚挂到安窝上了：「Noyes 站旁 1B 暑期转租」，搜我的名字就能看到。', m: 3 * HOUR + 15 * MIN },
      ],
      unread: { alice: 2 }, scamDismissed: ['alice', 'bob'],
    },
    {
      id: 'c07', kind: 'direct', campus: 'northwestern', createdBy: 'wenjun', members: ['alice', 'wenjun'],
      messages: [
        { from: 'wenjun', text: '晓雨，周四的 Costco 你还去吗？', m: 6 * DAY + 3 * HOUR },
        { from: 'alice', text: '去的，三点出发。', m: 6 * DAY + 2 * HOUR },
        { from: 'wenjun', text: '好，我顺便帮你带一箱气泡水。', m: 6 * DAY + 1 * HOUR },
        { from: 'alice', text: '谢谢文君 🙏', m: 6 * DAY },
      ],
      scamDismissed: ['alice', 'wenjun'],
    },
    {
      id: 'c08', kind: 'group', title: '周六 Costco 拼车（Glenview）', campus: 'northwestern', context: B('b1'), createdBy: 'zihao', members: ['zihao', 'alice', 'siyuan', 'mengyao', 'haoran'],
      messages: [
        sys('group_created', 'zihao', 3 * DAY + 2 * HOUR),
        { from: 'zihao', text: '周六上午 10 点 Tech 门口集合，车上还有 3 个位置。', m: 3 * DAY + 1 * HOUR },
        sys('member_joined', 'alice', 3 * DAY),
        sys('member_joined', 'siyuan', 2 * DAY + 22 * HOUR),
        sys('member_joined', 'mengyao', 2 * DAY + 20 * HOUR),
        { from: 'mengyao', text: '我要买的东西有点多，后备箱够吗？', m: 2 * DAY + 19 * HOUR },
        { from: 'zihao', text: '够的，SUV，放心买。', m: 2 * DAY + 18 * HOUR },
        { from: 'siyuan', text: '人多的话我可以开第二辆车。', m: 2 * DAY + 17 * HOUR },
        sys('member_joined', 'haoran', 90 * MIN),
        { from: 'haoran', text: '+1，顺便买个微波炉。', m: 85 * MIN },
        { from: 'zihao', text: '那就两辆车，10 点准时哦。', m: 22 * MIN },
      ],
      unread: { alice: 4, mengyao: 3, siyuan: 3, haoran: 1 },
    },
    {
      id: 'c09', kind: 'group', title: '8/28 O\'Hare 接机（T5 → Evanston）', campus: 'northwestern', context: B('b2'), createdBy: 'siyuan', members: ['siyuan', 'alice', 'yiran', 'ethan'],
      messages: [
        sys('group_created', 'siyuan', 2 * DAY + 4 * HOUR),
        sys('member_joined', 'yiran', 2 * DAY + 3 * HOUR),
        sys('member_joined', 'ethan', 2 * DAY + 2 * HOUR),
        sys('member_joined', 'alice', 2 * DAY + 1 * HOUR),
        { from: 'siyuan', text: '大家把航班号发我一下，我排个顺序。', m: DAY + 8 * HOUR },
        { from: 'yiran', text: 'CA 983，预计 28 号下午 2:40 到 T5。', m: DAY + 7 * HOUR },
        { from: 'ethan', text: 'UA 835，28 号 3:15 到，谢谢学长！', m: DAY + 6 * HOUR },
        { from: 'alice', text: '我是陪同去接的，可以帮忙搬行李 😄', m: DAY + 5 * HOUR },
        { from: 'siyuan', text: '收到。到了先过海关，出来后在 T5 的 Door 5E 等我，我开白色 RAV4。', m: 3 * HOUR + 5 * MIN },
      ],
      unread: { alice: 1, yiran: 1, ethan: 1 },
    },
    {
      id: 'c10', kind: 'direct', campus: 'northwestern', context: L('l6'), createdBy: 'alice', members: ['alice', 'ruoxi'],
      messages: [
        { from: 'alice', text: '若曦学姐，2B2B 可以只租一间吗？', m: 8 * HOUR },
        { from: 'ruoxi', text: '可以的，另一间现在是我室友，她 9 月也会留下。单间 $1,200。', m: 7 * HOUR },
        { from: 'alice', text: '好的，她是学生吗？作息怎么样？', m: 6 * HOUR },
        { from: 'ruoxi', text: 'Kellogg 的，作息很规律，不开 party 😂 下周可以约看。', m: 5 * HOUR + 12 * MIN },
      ],
      unread: { alice: 1 },
    },
    {
      id: 'c11', kind: 'direct', campus: 'northwestern', context: L('l7'), createdBy: 'alice', members: ['alice', 'nina'],
      messages: [
        { from: 'alice', text: '请问 8 月还有空吗？', m: 9 * DAY },
        { from: 'nina', text: '不好意思，已经租出去了～', m: 9 * DAY - 2 * HOUR },
        { from: 'alice', text: '好的，谢谢！', m: 9 * DAY - 3 * HOUR },
      ],
      archived: ['alice'], scamDismissed: ['alice', 'nina'],
    },
    {
      id: 'c12', kind: 'direct', campus: 'northwestern', createdBy: 'alice', members: ['alice', 'newbie'],
      messages: [
        { from: 'alice', text: '欢迎来西北！看到你还在找房，Davis St 附近有几家公寓 9 月还有空，有问题随时问我。', m: 2 * DAY + 10 * HOUR },
        { from: 'newbie', text: '谢谢学姐！想问一下 Evanston 是不是一定要有车？', m: 2 * DAY + 9 * HOUR },
        { from: 'alice', text: '不用，校车 + CTA 够用了，Costco 可以蹭拼车。', m: 2 * DAY + 8 * HOUR },
        { from: 'newbie', text: '太好了，那我就放心了 🙏', m: 2 * DAY + 7 * HOUR },
      ],
      scamDismissed: ['alice'],
    },
    {
      id: 'c13', kind: 'direct', campus: 'northwestern', createdBy: 'grace', members: ['alice', 'grace'],
      messages: [
        { from: 'grace', text: '晓雨，我看到你也在找 roommate，要不要一起看 2B 的？', m: 5 * DAY + 4 * HOUR },
        { from: 'alice', text: '可以呀，预算多少？', m: 5 * DAY + 3 * HOUR },
        { from: 'grace', text: '$1,100 以内吧，离学校走路 15 分钟内。', m: 5 * DAY + 2 * HOUR },
        { from: 'alice', text: '那我们可以看看 Sherman 那边的。', m: 5 * DAY + 1 * HOUR },
      ],
      muted: ['alice'], scamDismissed: ['alice', 'grace'],
    },
    {
      id: 'c14', kind: 'direct', campus: 'northwestern', context: L('l8'), createdBy: 'alice', members: ['alice', 'lakeshore'],
      messages: [
        { from: 'alice', text: 'Hi, is the 1B on Sherman still available for July?', m: 7 * DAY + 6 * HOUR },
        { from: 'lakeshore', text: 'Yes. High demand — send a $500 holding deposit by Zelle today and I\'ll take it off the market.', m: 7 * DAY + 5 * HOUR },
        { from: 'alice', text: '我还没有看房，先不付押金。可以约个时间看一下吗？', m: 7 * DAY + 4 * HOUR },
        { from: 'lakeshore', text: 'No viewings before deposit. Zelle to lakeshore.rentals@gmail.com and I\'ll send the lease after.', m: 7 * DAY + 3 * HOUR },
      ],
      archived: ['alice'],
    },
    {
      id: 'c15', kind: 'direct', campus: 'northwestern', createdBy: 'siyuan', members: ['alice', 'siyuan'],
      messages: [
        { from: 'siyuan', text: '接机的群建好了，你看一下有没有问题。', m: 2 * DAY + 50 * MIN },
        { from: 'alice', text: '看到了，没问题！', m: 2 * DAY + 45 * MIN },
      ],
      scamDismissed: ['alice', 'siyuan'],
    },
    // ---- other northwestern users
    {
      id: 'c16', kind: 'direct', campus: 'northwestern', context: L('l9'), createdBy: 'haoran', members: ['haoran', 'bob'],
      messages: [
        { from: 'haoran', text: '博哥，你这间 6 月几号可以入住？', m: 10 * HOUR },
        { from: 'bob', text: '6 月 10 号，我 9 号搬走。', m: 9 * HOUR },
        { from: 'haoran', text: '能不能短租到 8 月 15 号？我 8 月中回国。', m: 8 * HOUR },
        { from: 'bob', text: '可以，剩下半个月我再找人。', m: 7 * HOUR + 30 * MIN },
      ],
      unread: { haoran: 1 }, scamDismissed: ['bob'],
    },
    {
      id: 'c17', kind: 'direct', campus: 'northwestern', createdBy: 'minjae', members: ['minjae', 'bob'],
      messages: [
        { from: 'minjae', text: 'Hey Bob, still looking for a roommate near Noyes for the fall?', m: DAY + 12 * HOUR },
        { from: 'bob', text: 'Yes — 2B on Noyes St, $1,400 total, split evenly.', m: DAY + 11 * HOUR },
        { from: 'minjae', text: 'Sounds good. Can we see it this week?', m: DAY + 10 * HOUR },
        { from: 'bob', text: 'Thursday after 5 works for me.', m: DAY + 9 * HOUR },
      ],
      unread: { minjae: 1 }, scamDismissed: ['minjae', 'bob'],
    },
    {
      id: 'c18', kind: 'group', title: 'CS 336 期末学习小组', campus: 'northwestern', context: B('b3'), createdBy: 'daniel', members: ['daniel', 'kai', 'minjae', 'tianyi', 'sophia'],
      messages: [
        sys('group_created', 'daniel', 4 * DAY),
        { from: 'daniel', text: 'Mudd Library 3rd floor, Tuesday 7pm. Bring the problem sets.', m: 4 * DAY - 10 * MIN },
        sys('member_joined', 'kai', 3 * DAY + 20 * HOUR),
        sys('member_joined', 'minjae', 3 * DAY + 18 * HOUR),
        sys('member_joined', 'tianyi', 3 * DAY + 2 * HOUR),
        { from: 'tianyi', text: '我是大一的，可以旁听吗？', m: 3 * DAY + 1 * HOUR },
        { from: 'daniel', text: 'Of course — everyone\'s welcome.', m: 3 * DAY },
        sys('member_joined', 'sophia', 2 * DAY + 6 * HOUR),
        { from: 'sophia', text: '我订了一个 group study room，3 小时。', m: 2 * DAY + 5 * HOUR },
        { from: 'kai', text: 'I\'ll bring snacks.', m: 2 * DAY + 4 * HOUR },
      ],
      unread: { tianyi: 3, minjae: 2 },
    },
    // ---- UIUC
    {
      id: 'c19', kind: 'direct', campus: 'uiuc', context: L('l4'), createdBy: 'qianqian', members: ['qianqian', 'yuxuan'],
      messages: [
        { from: 'qianqian', text: '雨轩，你的 Green St 暑期转租还在吗？我 5 月 20 号到。', m: DAY + 3 * HOUR },
        { from: 'yuxuan', text: '在的，5 月 18 号后就空了。', m: DAY + 2 * HOUR },
        { from: 'qianqian', text: '价格还能便宜一点吗？整个夏天都租。', m: DAY + 1 * HOUR },
        { from: 'yuxuan', text: '整个夏天的话 $850 吧，水电另算。', m: 50 * MIN },
      ],
      unread: { qianqian: 1 }, scamDismissed: ['yuxuan'],
    },
    {
      id: 'c20', kind: 'direct', campus: 'uiuc', context: I('i3'), createdBy: 'jason', members: ['jason', 'hana'],
      messages: [
        { from: 'jason', text: 'Is the bike still available? I\'m on campus and could pick it up today.', m: 6 * HOUR },
        { from: 'hana', text: 'Yes! I\'m near ISR, free after 4.', m: 5 * HOUR },
        { from: 'jason', text: '4:30 at the ISR bike racks?', m: 4 * HOUR + 40 * MIN },
        { from: 'hana', text: 'Perfect, see you there.', m: 4 * HOUR + 30 * MIN },
      ],
      unread: { jason: 1 },
    },
    {
      id: 'c21', kind: 'group', title: '5 月 O\'Hare 拼车（Champaign → ORD）', campus: 'uiuc', context: B('b4'), createdBy: 'jason', members: ['jason', 'yuxuan', 'meilin', 'ryan'],
      messages: [
        sys('group_created', 'jason', 5 * DAY),
        { from: 'jason', text: 'Leaving May 12 around 8am from Green St. 3 seats, gas split.', m: 5 * DAY - 5 * MIN },
        sys('member_joined', 'yuxuan', 4 * DAY + 20 * HOUR),
        { from: 'yuxuan', text: '我 12 号中午的飞机，刚好。', m: 4 * DAY + 19 * HOUR },
        sys('member_joined', 'meilin', 4 * DAY + 10 * HOUR),
        { from: 'meilin', text: '可以分摊油费，大概多少？', m: 4 * DAY + 9 * HOUR },
        { from: 'jason', text: 'Around $15 each.', m: 4 * DAY + 8 * HOUR },
        sys('member_joined', 'ryan', 2 * HOUR),
        { from: 'ryan', text: '我也要去，可以带两个大箱子吗？', m: 110 * MIN },
      ],
      unread: { jason: 1, yuxuan: 2, meilin: 2 },
    },
    // ---- NYU
    {
      id: 'c22', kind: 'direct', campus: 'nyu', context: L('l5'), createdBy: 'anqi', members: ['anqi', 'kevin'],
      messages: [
        { from: 'anqi', text: 'Kevin，East Village 这间 6 月到 8 月可以吗？我室友也想一起看。', m: 2 * DAY + 2 * HOUR },
        { from: 'kevin', text: '可以的，6/1–8/31。能视频看房，我现在人在西雅图。', m: 2 * DAY + 1 * HOUR },
        { from: 'anqi', text: '周末视频吧，周六上午 11 点？', m: DAY + 20 * HOUR },
        { from: 'kevin', text: '好的，到时候我用微信视频。', m: DAY + 19 * HOUR },
      ],
      unread: { anqi: 1 }, scamDismissed: ['anqi', 'kevin'],
    },
    {
      id: 'c23', kind: 'direct', campus: 'nyu', context: L('l10'), createdBy: 'ziyang', members: ['ziyang', 'mia'],
      messages: [
        { from: 'ziyang', text: 'Hi Mia，看到你在求租 9 月的房子，我 Greenwich Village 的一居 9 月初空出来，有兴趣可以看看。', m: 3 * DAY + 5 * HOUR },
        { from: 'mia', text: '谢谢学长！$3,200 对我有点高，可以只租半年吗？', m: 3 * DAY + 4 * HOUR },
        { from: 'ziyang', text: '半年可以，最短 6 个月。', m: 3 * DAY + 3 * HOUR },
      ],
      unread: { mia: 1 },
    },
    {
      id: 'c24', kind: 'direct', campus: 'nyu', createdBy: 'lucia', members: ['lucia', 'anqi'],
      messages: [
        { from: 'lucia', text: 'Hi Anqi! Saw your post about study buddies at Bobst — I\'m usually there Tue/Thu afternoons.', m: DAY + 6 * HOUR },
        { from: 'anqi', text: 'Nice, same here. 4th floor quiet zone?', m: DAY + 5 * HOUR },
        { from: 'lucia', text: 'Perfect. Thursday 2pm?', m: DAY + 4 * HOUR },
      ],
      unread: { anqi: 1 }, scamDismissed: ['lucia', 'anqi'],
    },
    // ---- landlord's second thread on the same listing
    {
      id: 'c25', kind: 'direct', campus: 'northwestern', context: L('l1'), createdBy: 'wenjun', members: ['wenjun', 'landlord'],
      messages: [
        { from: 'wenjun', text: '王先生您好，1735 Chicago 的两室可以 9 月起租一年吗？', m: 12 * HOUR },
        { from: 'landlord', text: 'Hi Wenjun — the current sublet ends Aug 31; a 12-month lease from Sept 1 is possible at $1,350.', m: 11 * HOUR },
        { from: 'wenjun', text: '好的，我再和室友商量一下，谢谢。', m: 10 * HOUR + 20 * MIN },
      ],
      unread: { landlord: 1 }, scamDismissed: ['wenjun', 'landlord'],
    },
  ];
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const users: Record<string, string> = {};
  for (const [key, email] of Object.entries(EMAILS)) {
    const r = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email]);
    if (!r) throw new Error(`chat seed: core user ${email} is missing — run the core seed first`);
    users[key] = r.id;
  }
  const base = nowMs();

  q.tx(() => {
    ensureContexts(users, base);

    // reset everything we own
    q.run("DELETE FROM message_reads WHERE message_id IN (SELECT id FROM messages WHERE conversation_id LIKE 'chatseed-%')");
    q.run("DELETE FROM messages WHERE conversation_id LIKE 'chatseed-%'");
    q.run("DELETE FROM conversation_members WHERE conversation_id LIKE 'chatseed-%'");
    q.run("DELETE FROM conversations WHERE id LIKE 'chatseed-%'");
    q.run("DELETE FROM reports WHERE id LIKE 'chatseed-%'");
    q.run("DELETE FROM notifications WHERE user_id = ? AND json_extract(data_json, '$.chatSeed') = 1", [users.alice]);
    q.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [users.alice, users.lakeshore]);

    for (const c of conversations()) {
      const convId = id('conv:' + c.id);
      const card = c.context ? cardFor(c.context) : null;
      // the context card is the first message → the thread starts slightly before the first spec'd message
      const lastSpecMs = Math.max(...c.messages.map((m) => m.m));
      const createdAt = iso(lastSpecMs + 5 * MIN, base);
      const members = c.members.map((k) => users[k]!);
      const directKey = c.kind === 'direct' ? [...[members[0]!, members[1]!].sort(), c.context?.type ?? '', c.context?.id ?? ''].join('|') : null;
      q.run(
        `INSERT INTO conversations (id, kind, title, campus_id, context_type, context_id, created_by, direct_key, message_count, is_locked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [convId, c.kind, c.title ?? null, c.campus, c.context?.type ?? null, c.context?.id ?? null, users[c.createdBy]!, directKey, createdAt, createdAt],
      );
      for (const k of c.members) {
        const joinedAt = c.kind === 'group' ? (c.messages.find((m) => m.kind === 'system' && m.event === 'member_joined' && m.user === k) as { m: number } | undefined) : undefined;
        q.run('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, archived, muted_until, scam_banner_dismissed) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          convId, users[k]!, c.kind === 'group' && k === c.createdBy ? 'owner' : 'member', joinedAt ? iso(joinedAt.m, base) : createdAt,
          c.archived?.includes(k) ? 1 : 0, c.muted?.includes(k) ? iso(-30 * DAY, base) : null, c.scamDismissed?.includes(k) ? 1 : 0,
        ]);
      }
      // messages in chronological order (trigger maintains conversation summary + unread counts)
      const inserted: { id: string; at: string; sender: string | null }[] = [];
      const insertMessage = (sender: string | null, kind: string, body: string | null, uploadId: string | null, context: Record<string, unknown> | null, at: string, n: number) => {
        const mid = id(`msg:${c.id}:${n}`);
        q.run('INSERT INTO messages (id, conversation_id, sender_id, kind, body, upload_id, context_json, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)', [
          mid, convId, sender, kind, body, uploadId, context ? JSON.stringify(context) : null, at,
        ]);
        inserted.push({ id: mid, at, sender });
      };
      let n = 0;
      if (card) insertMessage(users[c.createdBy]!, 'context_card', card.title, null, card, createdAt, n++);
      const ordered = [...c.messages].sort((a, b) => b.m - a.m);
      for (const m of ordered) {
        const at = iso(m.m, base);
        if (m.kind === 'system') {
          insertMessage(null, 'system', m.event, null, { event: m.event, ...(m.user ? { userId: users[m.user]! } : {}), ...(m.data ?? {}) }, at, n++);
        } else if (m.kind === 'image') {
          const uploadId = insertSeedUpload({ path: m.image, purpose: 'seed', ownerId: users[m.from]! });
          insertMessage(users[m.from]!, 'image', m.text ?? null, uploadId, null, at, n++);
        } else {
          insertMessage(users[m.from]!, 'text', m.text, null, null, at, n++);
        }
      }
      // read states: every member has read everything except the last `unread[k]` messages
      for (const k of c.members) {
        const uid = users[k]!;
        const unread = c.unread?.[k] ?? 0;
        const others = inserted.filter((m) => m.sender !== uid);
        const readUpTo = unread === 0 ? inserted[inserted.length - 1] : others[others.length - unread - 1] ?? null;
        const lastReadAt = readUpTo ? new Date(Math.min(base, Date.parse(readUpTo.at) + 3 * MIN)).toISOString() : null;
        q.run('UPDATE conversation_members SET unread_count = ?, last_read_message_id = ?, last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [
          unread, readUpTo?.id ?? null, lastReadAt, convId, uid,
        ]);
        if (readUpTo) {
          for (const m of inserted) {
            if (m.sender === uid || m.sender === null || m.at > readUpTo.at) continue;
            q.run('INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)', [m.id, uid, lastReadAt]);
          }
        }
      }
    }

    // blocked pair + scam report (alice blocked Lakeshore Rentals after the off-platform deposit request)
    q.run('INSERT OR REPLACE INTO blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, ?)', [users.alice, users.lakeshore, '要求平台外转账押金', iso(7 * DAY + 2 * HOUR, base)]);
    q.run(
      `INSERT INTO reports (id, reporter_id, entity_type, entity_id, campus_id, reason, details, status, created_at)
       VALUES (?, ?, 'conversation', ?, 'northwestern', 'scam', ?, 'open', ?)`,
      [id('report:c14'), users.alice, id('conv:c14'), '对方要求看房前通过 Zelle 预付 $500 押金，不愿意约看房。', iso(7 * DAY + 2 * HOUR, base)],
    );

    // unread bell notifications for alice's two newest threads (what lib/notify would have created)
    const bell = [
      { conv: 'c01', title: 'Evanston Homes · 王先生 发来新消息', body: 'One more thing: please don\'t send any deposit before you\'ve seen the place…', m: 41 * MIN },
      { conv: 'c05', title: '马立 Leo 发来新消息', body: '价格可以商量，下周就搬走了，$150 也行。', m: 32 * MIN },
    ];
    for (const b of bell) {
      q.run('INSERT INTO notifications (id, user_id, kind, title, body, link, entity_type, entity_id, data_json, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [
        id('notif:' + b.conv), users.alice, 'chat.message', b.title, b.body, `/chat/${id('conv:' + b.conv)}`, 'conversation', id('conv:' + b.conv), JSON.stringify({ chatSeed: 1 }), iso(b.m, base),
      ]);
    }
  });
}
