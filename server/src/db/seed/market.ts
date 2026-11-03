// server/src/db/seed/market.ts — OWNED BY THE `market` MODULE AGENT.
// 90 secondhand items across Northwestern (55), UIUC, NYU and USC with bilingual titles/descriptions, realistic pickup
// spots with coordinates, seed photos from /uploads/seed/items/*.svg, some sold (with buyers + sold prices), a couple boosted,
// wishlists (incl. price drops) and 3 move-out bundles linked to the sellers' sublet listings.
// Idempotent: every row this file writes carries a `mkt-` id prefix and is deleted before re-insert (inside one tx).
import type { DatabaseSync } from 'node:sqlite';
import { q } from '../index';
import { insertSeedUpload } from '../../lib/uploads';
import { DAY, nowIso, nowMs } from '../../lib/time';
import { seedUserId } from './core';

export const version = 1;

type Cat = 'furniture' | 'electronics' | 'textbooks' | 'kitchen' | 'bikes' | 'clothing' | 'home' | 'tickets' | 'move_out' | 'free' | 'other';
type Cond = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
type Spot = { label: string; lat: number; lng: number };
type ItemSpec = {
  seller: string; campus: 'northwestern' | 'uiuc' | 'nyu' | 'usc'; cat: Cat; cond: Cond;
  title: string; zh: string; en: string;
  price: number; // dollars; 0 = free
  obo?: boolean; orig?: number; brand?: string; spot: Spot; delivery?: 'pickup' | 'delivery' | 'both';
  status?: 'active' | 'reserved' | 'sold' | 'expired'; soldPrice?: number; buyer?: string; soldDaysAgo?: number;
  photos: number[]; daysAgo: number; bundle?: string; views?: number;
};

// ---------------------------------------------------------------- pickup spots (never exact addresses)
const NU = {
  tech: { label: 'Tech Institute 门口 · Tech Institute entrance', lat: 42.0577, lng: -87.676 },
  norris: { label: 'Norris 学生中心 · Norris University Center', lat: 42.0533, lng: -87.6727 },
  davis: { label: 'Davis St Metra 站 · Davis St station', lat: 42.0469, lng: -87.6833 },
  sherman: { label: 'Sherman Ave & Church St', lat: 42.048, lng: -87.681 },
  foster: { label: 'Foster-Walker 宿舍 · Foster-Walker Complex', lat: 42.0545, lng: -87.678 },
  kellogg: { label: 'Kellogg Global Hub', lat: 42.0572, lng: -87.6722 },
  main: { label: 'Main St 紫线站 · Main St Purple Line', lat: 42.0333, lng: -87.6797 },
  wholefoods: { label: 'Whole Foods Evanston 停车场 · Whole Foods lot', lat: 42.0548, lng: -87.69 },
  engelhart: { label: 'Engelhart Hall 大堂 · Engelhart lobby', lat: 42.0516, lng: -87.683 },
  noyes: { label: 'Noyes St 紫线站 · Noyes station', lat: 42.0583, lng: -87.6835 },
  ridge: { label: 'Ridge Ave & Davis St', lat: 42.047, lng: -87.688 },
  target: { label: 'Target Evanston 门口 · Target on Sherman', lat: 42.045, lng: -87.6815 },
};
const UI = {
  green: { label: 'Green St & Wright St', lat: 40.1105, lng: -88.2292 },
  union: { label: 'Illini Union 门口 · Illini Union', lat: 40.1092, lng: -88.2272 },
  grainger: { label: 'Grainger 图书馆 · Grainger Library', lat: 40.1125, lng: -88.2269 },
  lincoln: { label: 'Lincoln Ave & Nevada St (Urbana)', lat: 40.1075, lng: -88.217 },
  siebel: { label: 'Siebel Center 大堂 · Siebel Center lobby', lat: 40.1138, lng: -88.2249 },
  county: { label: 'County Market 停车场 · County Market lot', lat: 40.114, lng: -88.2425 },
};
const NY = {
  wsp: { label: 'Washington Square Park 拱门 · WSP arch', lat: 40.7308, lng: -73.9973 },
  bobst: { label: 'Bobst 图书馆门口 · Bobst Library', lat: 40.7295, lng: -73.9972 },
  union: { label: 'Union Square 地铁站 · Union Square station', lat: 40.7359, lng: -73.9911 },
  astor: { label: 'Astor Place 地铁站 · Astor Pl station', lat: 40.73, lng: -73.9915 },
  stuy: { label: 'Stuyvesant Town 1st Ave 门口', lat: 40.7317, lng: -73.9777 },
  ev: { label: 'East Village · 2nd Ave & E 7th St', lat: 40.7272, lng: -73.9876 },
};
const SC = {
  tommy: { label: 'Tommy Trojan 雕像 · Tommy Trojan', lat: 34.0205, lng: -118.2854 },
  village: { label: 'USC Village Target 门口 · USC Village', lat: 34.0252, lng: -118.2851 },
  expo: { label: 'Expo Park 地铁站 · Expo Park/USC station', lat: 34.0164, lng: -118.288 },
  figueroa: { label: 'Figueroa St & Jefferson Blvd', lat: 34.0233, lng: -118.278 },
  leavey: { label: 'Leavey 图书馆 · Leavey Library', lat: 34.0217, lng: -118.2828 },
};

// ---------------------------------------------------------------- items (photos = seed/items/iNN.svg numbers)
const N = (e: string) => `${e}@u.northwestern.edu`;
const I = (e: string) => `${e}@illinois.edu`;
const Y = (e: string) => `${e}@nyu.edu`;
const S = (e: string) => `${e}@usc.edu`;

const ITEMS: ItemSpec[] = [
  // ============================================================ Northwestern (55)
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'furniture', cond: 'like_new', title: '宜家 MALM 书桌（白色） IKEA MALM desk', zh: '用了一年，桌面无划痕，带一个抽屉。毕业搬离，6 月 10 日前取走。', en: 'One year old, no scratches on the top, one drawer. Graduating — pick up before Jun 10.', price: 45, obo: true, orig: 129, brand: 'IKEA', spot: NU.sherman, photos: [6, 1], daysAgo: 4, bundle: 'xinyi' },
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: '宜家 KALLAX 2×2 书架 IKEA KALLAX shelf', zh: '黑棕色，稳固，可以拆开搬。', en: 'Black-brown, sturdy, comes apart for the move.', price: 25, orig: 60, brand: 'IKEA', spot: NU.sherman, photos: [11], daysAgo: 4, bundle: 'xinyi' },
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'kitchen', cond: 'good', title: '象印 5.5 杯电饭煲 Zojirushi rice cooker', zh: '日本产，内胆无磨损，煮糙米也很香。', en: 'Made in Japan, inner pot in great shape, cooks brown rice well.', price: 60, obo: true, orig: 170, brand: 'Zojirushi', spot: NU.sherman, photos: [4, 9], daysAgo: 4, bundle: 'xinyi', views: 88 },
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'electronics', cond: 'like_new', title: 'Dell 27 寸 4K 显示器 Dell S2722QC 27" 4K monitor', zh: 'USB-C 一线连 Mac，带原装线和包装。', en: 'USB-C single-cable to a Mac, original cable and box included.', price: 180, obo: true, orig: 329, brand: 'Dell', spot: NU.sherman, photos: [7, 2], daysAgo: 4, bundle: 'xinyi', views: 140 },
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'home', cond: 'good', title: '落地灯 + 全身镜 Floor lamp and full-length mirror', zh: '两件一起走，灯泡送。', en: 'Both together; bulb included.', price: 20, spot: NU.sherman, photos: [21, 56], daysAgo: 4, bundle: 'xinyi' },
  { seller: N('xinyi.lin'), campus: 'northwestern', cat: 'free', cond: 'fair', title: '免费：衣架 40 个 + 收纳箱 Free hangers and storage bins', zh: '搬家送，先到先得，取货时一起拿。', en: 'Free with the move, first come first served — grab them at pickup.', price: 0, spot: NU.sherman, photos: [56], daysAgo: 4, bundle: 'xinyi' },
  { seller: N('alice'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'Calculus: Early Transcendentals 8e (Stewart)', zh: 'MATH 220 用书，内页有少量铅笔笔记，可擦。', en: 'Used for MATH 220; a few pencil notes inside, erasable.', price: 35, obo: true, orig: 250, brand: 'Cengage', spot: NU.tech, photos: [3], daysAgo: 6 },
  { seller: N('alice'), campus: 'northwestern', cat: 'textbooks', cond: 'like_new', title: 'Introduction to Algorithms 4e (CLRS)', zh: '硬壳，几乎没翻过，CS 336 结课出。', en: 'Hardcover, barely opened. Done with CS 336.', price: 70, orig: 135, brand: 'MIT Press', spot: NU.tech, delivery: 'both', photos: [23], daysAgo: 9, views: 120 },
  { seller: N('alice'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'Logitech MX Master 3 鼠标 Logitech MX Master 3', zh: '换了 3S 所以出，滚轮顺滑，附 USB 接收器。', en: 'Upgraded to the 3S. Scroll wheel still smooth, USB receiver included.', price: 40, brand: 'Logitech', spot: NU.tech, delivery: 'both', photos: [37], daysAgo: 12 },
  { seller: N('alice'), campus: 'northwestern', cat: 'kitchen', cond: 'like_new', title: '小米电热水壶 1.5L Xiaomi electric kettle', zh: '用了半年，水垢已清理。', en: 'Six months old, descaled.', price: 12, brand: 'Xiaomi', spot: NU.davis, photos: [9], daysAgo: 20, status: 'sold', soldPrice: 10, buyer: N('haoran.zhang'), soldDaysAgo: 8 },
  { seller: N('bob'), campus: 'northwestern', cat: 'bikes', cond: 'good', title: 'Trek FX 2 通勤自行车 Trek FX 2 hybrid bike, size M', zh: '2022 款，刚换了刹车片，送 U 锁和前后灯。暑期去湾区实习所以出。', en: '2022 model, fresh brake pads, U-lock and lights included. Leaving for a Bay Area internship.', price: 320, obo: true, orig: 599, brand: 'Trek', spot: NU.foster, photos: [10, 25, 40], daysAgo: 3, views: 210 },
  { seller: N('bob'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: '单人沙发椅（灰色） Grey armchair', zh: 'Wayfair 买的，坐感偏软，无破损。', en: 'From Wayfair, on the softer side, no damage.', price: 55, obo: true, orig: 160, spot: NU.foster, photos: [16], daysAgo: 3 },
  { seller: N('bob'), campus: 'northwestern', cat: 'electronics', cond: 'fair', title: 'HP 无线打印机 HP DeskJet 2755e', zh: '能用，但墨盒快没了，自己换。', en: 'Works, ink is low — bring your own cartridge.', price: 20, brand: 'HP', spot: NU.foster, photos: [22], daysAgo: 7 },
  { seller: N('bob'), campus: 'northwestern', cat: 'kitchen', cond: 'good', title: '铸铁平底锅 10 寸 Lodge 10" cast iron skillet', zh: '已开锅，越用越好。', en: 'Seasoned, only gets better.', price: 15, brand: 'Lodge', spot: NU.foster, photos: [14], daysAgo: 7 },
  { seller: N('leo.ma'), campus: 'northwestern', cat: 'bikes', cond: 'fair', title: '通勤单车 Schwinn 单速 Schwinn single-speed commuter', zh: '骑了两年，链条需要上油，车架没问题，便宜出。', en: 'Two years of commuting; chain needs oil, frame is fine. Cheap.', price: 80, obo: true, brand: 'Schwinn', spot: NU.noyes, photos: [50, 55], daysAgo: 5 },
  { seller: N('leo.ma'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: '升降电动桌 120cm FlexiSpot standing desk', zh: '电动升降，记忆高度，桌面有一处小磕碰。', en: 'Electric sit-stand, memory presets, one small ding on the top.', price: 150, obo: true, orig: 300, brand: 'FlexiSpot', spot: NU.noyes, photos: [6], daysAgo: 5, views: 95 },
  { seller: N('leo.ma'), campus: 'northwestern', cat: 'bikes', cond: 'like_new', title: 'Kryptonite U 锁 Kryptonite U-lock with bracket', zh: '带车架支架，两把钥匙。', en: 'Comes with the frame bracket and two keys.', price: 25, brand: 'Kryptonite', spot: NU.noyes, photos: [25], daysAgo: 15, status: 'sold', soldPrice: 25, buyer: N('daniel.kim'), soldDaysAgo: 2 },
  { seller: N('wenjun.liu'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'Organic Chemistry 2e (Clayden)', zh: 'CHEM 215 用，附带做过的习题册。', en: 'Used for CHEM 215, worked solutions booklet included.', price: 40, orig: 110, brand: 'Oxford', spot: NU.tech, photos: [8], daysAgo: 11 },
  { seller: N('wenjun.liu'), campus: 'northwestern', cat: 'home', cond: 'like_new', title: '加湿器 Levoit 4L 冷雾加湿器 Levoit humidifier', zh: 'Evanston 冬天太干了，必备。用了一个冬天。', en: 'Evanston winters are dry. One winter of use.', price: 22, brand: 'Levoit', spot: NU.engelhart, photos: [42], daysAgo: 13 },
  { seller: N('wenjun.liu'), campus: 'northwestern', cat: 'kitchen', cond: 'good', title: '不锈钢汤锅 + 蒸屉 Stock pot with steamer insert', zh: '煮火锅、蒸包子都够大。', en: 'Big enough for hot pot and steaming buns.', price: 18, spot: NU.engelhart, photos: [19, 49], daysAgo: 13 },
  { seller: N('haoran.zhang'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'Sony WH-1000XM4 降噪耳机 Sony XM4 headphones', zh: '耳罩有轻微使用痕迹，降噪正常，带收纳盒。', en: 'Light wear on the pads, ANC works perfectly, case included.', price: 140, obo: true, orig: 349, brand: 'Sony', spot: NU.norris, delivery: 'both', photos: [17], daysAgo: 2, views: 180 },
  { seller: N('haoran.zhang'), campus: 'northwestern', cat: 'textbooks', cond: 'like_new', title: 'Introductory Econometrics 7e (Wooldridge)', zh: 'MS Analytics 必修，干净无笔记。', en: 'Required for MS Analytics; clean, no notes.', price: 55, orig: 200, brand: 'Cengage', spot: NU.kellogg, photos: [28], daysAgo: 10 },
  { seller: N('haoran.zhang'), campus: 'northwestern', cat: 'other', cond: 'good', title: 'Spalding 篮球 7 号 Spalding indoor/outdoor basketball', zh: '周末 SPAC 打球用，手感还不错。', en: 'Weekend SPAC pickup games; still has decent grip.', price: 12, brand: 'Spalding', spot: NU.norris, photos: [46], daysAgo: 18 },
  { seller: N('siyuan.wu'), campus: 'northwestern', cat: 'electronics', cond: 'like_new', title: 'iPad Air 5 64GB 蓝色 + Pencil 2', zh: '课堂记笔记用的，贴了类纸膜，电池健康 96%。', en: 'Used for lecture notes, paper-like screen protector on, battery health 96%.', price: 420, obo: true, orig: 728, brand: 'Apple', spot: NU.tech, delivery: 'both', photos: [32, 12], daysAgo: 1, views: 260 },
  { seller: N('siyuan.wu'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: '双人沙发（米色） Beige loveseat', zh: '可以帮忙用车送到 Evanston 范围内（+$10）。', en: 'Can deliver within Evanston by car (+$10).', price: 90, obo: true, orig: 280, spot: NU.ridge, delivery: 'both', photos: [16], daysAgo: 8 },
  { seller: N('siyuan.wu'), campus: 'northwestern', cat: 'kitchen', cond: 'like_new', title: 'Ninja 空气炸锅 4qt Ninja air fryer', zh: '基本没怎么用，附食谱。', en: 'Barely used, recipe booklet included.', price: 45, orig: 100, brand: 'Ninja', spot: NU.ridge, photos: [44], daysAgo: 8, status: 'reserved' },
  { seller: N('jiaqi.huang'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'Canon EOS M50 微单 + 15-45 套机 Canon M50 kit', zh: 'Medill 课程用，快门数约 8k，附电池 ×2。', en: 'Used for Medill coursework, ~8k shutter count, two batteries.', price: 380, obo: true, orig: 649, brand: 'Canon', spot: NU.norris, delivery: 'both', photos: [12, 52], daysAgo: 6, views: 150 },
  { seller: N('jiaqi.huang'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'The Elements of Style + AP Stylebook 2024', zh: '新闻写作两本一起，各有少量标注。', en: 'Two journalism staples together, light highlighting in each.', price: 18, spot: NU.norris, photos: [58], daysAgo: 14 },
  { seller: N('jiaqi.huang'), campus: 'northwestern', cat: 'clothing', cond: 'like_new', title: 'Canada Goose Chilliwack 羽绒服 女 S Canada Goose parka, women’s S', zh: '穿了一个冬天，干洗过。芝加哥冬天靠它。', en: 'One winter of wear, dry-cleaned. Survived a Chicago winter.', price: 480, obo: true, orig: 1095, brand: 'Canada Goose', spot: NU.davis, photos: [56], daysAgo: 2, views: 310 },
  { seller: N('mengyao.xu'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: 'Full 床架 + 床垫 Zinus full bed frame and mattress', zh: '床垫 10 寸记忆棉，有防水垫一直套着。只能自提，需要两个人。', en: '10" memory foam mattress, always had a waterproof protector. Pickup only, two people needed.', price: 120, obo: true, orig: 420, brand: 'Zinus', spot: NU.ridge, photos: [26], daysAgo: 7, views: 75 },
  { seller: N('mengyao.xu'), campus: 'northwestern', cat: 'home', cond: 'good', title: '地毯 5×7 浅灰 Rug 5×7 light grey', zh: '洗过，无污渍。', en: 'Washed, no stains.', price: 25, spot: NU.ridge, photos: [51], daysAgo: 7 },
  { seller: N('mengyao.xu'), campus: 'northwestern', cat: 'free', cond: 'good', title: '免费：绿植两盆（绿萝、虎皮兰） Free plants: pothos and snake plant', zh: '好养活，搬家带不走。', en: 'Easy to keep alive, can’t take them with me.', price: 0, spot: NU.ridge, photos: [21], daysAgo: 1 },
  { seller: N('sophia.wang'), campus: 'northwestern', cat: 'other', cond: 'like_new', title: '瑜伽垫 + 哑铃 2×10lb Yoga mat and dumbbells', zh: '健身搭子退坑了，一起出。', en: 'Gym buddy quit, selling as a set.', price: 30, spot: NU.main, photos: [46], daysAgo: 9 },
  { seller: N('sophia.wang'), campus: 'northwestern', cat: 'kitchen', cond: 'like_new', title: 'Nespresso Vertuo 咖啡机 Nespresso Vertuo Next', zh: '附 20 颗胶囊。早八续命神器。', en: '20 pods included. Got me through 8 a.m. classes.', price: 70, orig: 180, brand: 'Nespresso', spot: NU.main, photos: [34], daysAgo: 9 },
  { seller: N('chloe.deng'), campus: 'northwestern', cat: 'furniture', cond: 'like_new', title: '餐桌 + 2 椅 Dining table with two chairs', zh: '实木桌面，桌腿可拆，适合 1B1B。', en: 'Solid wood top, legs come off, ideal for a 1B1B.', price: 85, obo: true, orig: 230, spot: NU.davis, photos: [36, 46], daysAgo: 5 },
  { seller: N('chloe.deng'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'TCL 43 寸 4K Roku 电视 TCL 43" Roku TV', zh: '带遥控器和挂架，自提。', en: 'Remote and wall mount included, pickup only.', price: 130, obo: true, orig: 260, brand: 'TCL', spot: NU.davis, photos: [52], daysAgo: 5, views: 66 },
  { seller: N('chloe.deng'), campus: 'northwestern', cat: 'home', cond: 'good', title: '宜家 床头柜 ×2 IKEA nightstands (pair)', zh: '白色，一对出。', en: 'White, sold as a pair.', price: 30, brand: 'IKEA', spot: NU.davis, photos: [41], daysAgo: 16, status: 'sold', soldPrice: 25, soldDaysAgo: 5 },
  { seller: N('kai.tanaka'), campus: 'northwestern', cat: 'electronics', cond: 'like_new', title: 'BenQ ScreenBar 屏幕挂灯 BenQ ScreenBar Halo', zh: '护眼，桌面不占地方。', en: 'Easy on the eyes and takes zero desk space.', price: 65, orig: 119, brand: 'BenQ', spot: NU.tech, delivery: 'both', photos: [57], daysAgo: 4 },
  { seller: N('kai.tanaka'), campus: 'northwestern', cat: 'other', cond: 'good', title: '攀岩鞋 La Sportiva Tarantulace 42 码 Climbing shoes', zh: '送粉袋。', en: 'Chalk bag included.', price: 45, brand: 'La Sportiva', spot: NU.tech, photos: [46], daysAgo: 12 },
  { seller: N('kai.tanaka'), campus: 'northwestern', cat: 'kitchen', cond: 'good', title: '拉面碗套装 + 筷子 Ramen bowl set', zh: '4 个大碗，日式。', en: 'Four large Japanese-style bowls.', price: 16, spot: NU.tech, photos: [39, 24], daysAgo: 12 },
  { seller: N('daniel.kim'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'Keychron K2 机械键盘 茶轴 Keychron K2, brown switches', zh: '蓝牙 + 有线，键帽完整。', en: 'Bluetooth and wired, all keycaps intact.', price: 50, brand: 'Keychron', spot: NU.norris, delivery: 'both', photos: [37], daysAgo: 3 },
  { seller: N('daniel.kim'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'Operating Systems: Three Easy Pieces (印刷版)', zh: 'CS 343 用，线上有免费版，纸质翻着舒服。', en: 'CS 343. Free online, but paper is nicer to flip through.', price: 15, spot: NU.norris, photos: [23], daysAgo: 3 },
  { seller: N('boyang.he'), campus: 'northwestern', cat: 'textbooks', cond: 'fair', title: 'Microeconomic Theory (Mas-Colell, Whinston, Green)', zh: '博一必修，书脊有磨损，内容完整。', en: 'First-year PhD staple; spine is worn, pages complete.', price: 60, obo: true, orig: 150, brand: 'Oxford', spot: NU.kellogg, delivery: 'both', photos: [13, 53], daysAgo: 21 },
  { seller: N('boyang.he'), campus: 'northwestern', cat: 'furniture', cond: 'good', title: '人体工学椅 Hbada 办公椅 Ergonomic office chair', zh: '可躺，腰托可调，用了两年。', en: 'Reclines, adjustable lumbar, two years old.', price: 60, obo: true, orig: 180, brand: 'Hbada', spot: NU.main, photos: [1], daysAgo: 21, views: 58 },
  { seller: N('grace.hu'), campus: 'northwestern', cat: 'home', cond: 'like_new', title: '书桌台灯 + 小风扇 Desk lamp and USB fan', zh: '打包出，暑假用正好。', en: 'Bundle price, good for summer.', price: 15, spot: NU.foster, photos: [57, 42], daysAgo: 6 },
  { seller: N('grace.hu'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'Epidemiology 6e (Gordis)', zh: 'MPH 核心课，有荧光笔标记。', en: 'MPH core text, some highlighting.', price: 30, orig: 80, spot: NU.foster, photos: [48], daysAgo: 6 },
  { seller: N('nina.zhou'), campus: 'northwestern', cat: 'furniture', cond: 'like_new', title: '北欧风衣柜 2 门 Wardrobe, 2 doors', zh: '白色，内有挂杆和两层隔板。自提，需拆装。', en: 'White, hanging rail plus two shelves. Pickup only, needs disassembly.', price: 110, obo: true, orig: 260, spot: NU.sherman, photos: [31], daysAgo: 10 },
  { seller: N('nina.zhou'), campus: 'northwestern', cat: 'kitchen', cond: 'new', title: '全新 Instant Pot Duo 6qt（未拆封） Instant Pot Duo, sealed', zh: '收到两个，多的一个原价出。', en: 'Got two as gifts; selling the sealed one.', price: 55, orig: 89, brand: 'Instant Pot', spot: NU.sherman, delivery: 'both', photos: [29], daysAgo: 10 },
  { seller: N('yuting.chen'), campus: 'northwestern', cat: 'electronics', cond: 'like_new', title: 'MacBook Air M2 13 寸 8/256 午夜色 MacBook Air M2', zh: 'Kellogg 两年用机，电池循环 180 次，附 Apple Care+ 到 2026 年 8 月。', en: 'Two years at Kellogg, 180 battery cycles, AppleCare+ until Aug 2026.', price: 650, obo: true, orig: 1199, brand: 'Apple', spot: NU.kellogg, delivery: 'both', photos: [2, 7], daysAgo: 2, views: 420 },
  { seller: N('yuting.chen'), campus: 'northwestern', cat: 'clothing', cond: 'like_new', title: '西装套装 Theory 女 2 码 Theory suit set, size 2', zh: '面试穿过两次，干洗过。', en: 'Worn to two interviews, dry-cleaned.', price: 160, obo: true, orig: 650, brand: 'Theory', spot: NU.kellogg, photos: [56], daysAgo: 8 },
  { seller: N('yuting.chen'), campus: 'northwestern', cat: 'home', cond: 'good', title: 'Dyson V8 吸尘器 Dyson V8 cordless vacuum', zh: '续航正常，附三个吸头。', en: 'Battery still fine, three attachments.', price: 150, obo: true, orig: 400, brand: 'Dyson', spot: NU.kellogg, photos: [42], daysAgo: 8, views: 101 },
  { seller: N('alice'), campus: 'northwestern', cat: 'bikes', cond: 'good', title: '折叠自行车 Dahon 20 寸 Dahon folding bike', zh: '放宿舍不占地方，去 Davis 买菜方便。', en: 'Fits in a dorm room; perfect for Davis St grocery runs.', price: 210, obo: true, orig: 450, brand: 'Dahon', spot: NU.tech, photos: [30, 20], daysAgo: 30, status: 'sold', soldPrice: 190, buyer: N('bob'), soldDaysAgo: 12 },
  { seller: N('haoran.zhang'), campus: 'northwestern', cat: 'free', cond: 'fair', title: '免费：课桌椅一把 Free desk chair', zh: '有点旧但能坐，自提。', en: 'Old but solid, pickup only.', price: 0, spot: NU.norris, photos: [1], daysAgo: 25, status: 'sold', soldPrice: 0, soldDaysAgo: 20 },
  { seller: N('leo.ma'), campus: 'northwestern', cat: 'electronics', cond: 'good', title: 'TP-Link AX1800 路由器 TP-Link Archer AX21', zh: 'Wi-Fi 6，覆盖 1B1B 没问题。', en: 'Wi-Fi 6, covers a 1B1B easily.', price: 35, brand: 'TP-Link', spot: NU.noyes, delivery: 'both', photos: [47], daysAgo: 40, status: 'sold', soldPrice: 30, buyer: N('grace.hu'), soldDaysAgo: 28 },
  { seller: N('mengyao.xu'), campus: 'northwestern', cat: 'textbooks', cond: 'good', title: 'Statistics 4e (Freedman, Pisani, Purves)', zh: '统计入门经典，无笔记。', en: 'Classic intro stats, no notes.', price: 25, spot: NU.ridge, photos: [28], daysAgo: 70, status: 'expired' },

  // ============================================================ UIUC (13)
  { seller: I('yuxuan.li'), campus: 'uiuc', cat: 'furniture', cond: 'good', title: '书桌 + 椅子 Desk and chair set', zh: 'Green St 公寓转租前清空，一起出。', en: 'Clearing out the Green St apartment before the sublet.', price: 50, obo: true, spot: UI.green, photos: [6, 1], daysAgo: 5, bundle: 'yuxuan' },
  { seller: I('yuxuan.li'), campus: 'uiuc', cat: 'electronics', cond: 'like_new', title: 'LG 27 寸 2K 显示器 LG 27QN600', zh: '写代码用，无坏点。', en: 'Coding monitor, no dead pixels.', price: 120, obo: true, orig: 230, brand: 'LG', spot: UI.green, photos: [7], daysAgo: 5, bundle: 'yuxuan', views: 90 },
  { seller: I('yuxuan.li'), campus: 'uiuc', cat: 'kitchen', cond: 'good', title: '微波炉 + 电饭煲 Microwave and rice cooker', zh: '两件 $35，分开 $20 一件。', en: '$35 for both, $20 each separately.', price: 35, spot: UI.green, photos: [4, 34], daysAgo: 5, bundle: 'yuxuan' },
  { seller: I('yuxuan.li'), campus: 'uiuc', cat: 'home', cond: 'good', title: 'Twin XL 床垫 + 床架 Twin XL mattress and frame', zh: '带防水套，自提。', en: 'Waterproof cover included, pickup only.', price: 60, obo: true, spot: UI.green, photos: [26], daysAgo: 5, bundle: 'yuxuan' },
  { seller: I('hana.sato'), campus: 'uiuc', cat: 'bikes', cond: 'good', title: 'Giant Escape 3 混合自行车 Giant Escape 3, size S', zh: '毕业前出，刚做过保养。', en: 'Selling before graduation, just serviced.', price: 220, obo: true, orig: 480, brand: 'Giant', spot: UI.union, photos: [5, 40], daysAgo: 3, views: 130 },
  { seller: I('hana.sato'), campus: 'uiuc', cat: 'furniture', cond: 'like_new', title: '宜家 LINNMON 桌 + ADILS 腿 IKEA LINNMON desk', zh: '白色 120×60，无划痕。', en: 'White 120×60, scratch-free.', price: 30, brand: 'IKEA', spot: UI.union, photos: [6], daysAgo: 3 },
  { seller: I('qianqian.wang'), campus: 'uiuc', cat: 'textbooks', cond: 'good', title: 'Intermediate Accounting 18e (Kieso)', zh: 'ACCY 301/302 用，含 access code 已用。', en: 'ACCY 301/302; access code already used.', price: 45, orig: 190, brand: 'Wiley', spot: UI.grainger, delivery: 'both', photos: [38], daysAgo: 9 },
  { seller: I('qianqian.wang'), campus: 'uiuc', cat: 'kitchen', cond: 'like_new', title: '电火锅 分体式 Electric hot pot with divider', zh: '鸳鸯锅，聚餐神器。', en: 'Split-pot, great for group dinners.', price: 28, spot: UI.lincoln, photos: [49], daysAgo: 9 },
  { seller: I('jason.tan'), campus: 'uiuc', cat: 'electronics', cond: 'good', title: 'Raspberry Pi 4 8GB + 外壳 Raspberry Pi 4 kit', zh: 'ECE 课程项目剩下的，附电源和 SD 卡。', en: 'Left over from an ECE project; power supply and SD card included.', price: 55, brand: 'Raspberry Pi', spot: UI.siebel, delivery: 'both', photos: [47], daysAgo: 4 },
  { seller: I('jason.tan'), campus: 'uiuc', cat: 'textbooks', cond: 'like_new', title: 'Microelectronic Circuits 8e (Sedra/Smith)', zh: 'ECE 342 用。', en: 'Used for ECE 342.', price: 70, orig: 180, brand: 'Oxford', spot: UI.siebel, photos: [33], daysAgo: 4 },
  { seller: I('meilin.gao'), campus: 'uiuc', cat: 'furniture', cond: 'good', title: '三人沙发（深蓝） Navy three-seat sofa', zh: 'Urbana 公寓的，需要两人搬。', en: 'From the Urbana apartment, two people to carry.', price: 140, obo: true, orig: 400, spot: UI.lincoln, photos: [16], daysAgo: 7, views: 48 },
  { seller: I('meilin.gao'), campus: 'uiuc', cat: 'free', cond: 'good', title: '免费：工程课本一箱 Free box of engineering textbooks', zh: 'CEE 本科课本，拿走就行。', en: 'Undergrad CEE texts, just take them.', price: 0, spot: UI.lincoln, photos: [18, 33], daysAgo: 2 },
  { seller: I('hana.sato'), campus: 'uiuc', cat: 'electronics', cond: 'good', title: 'Anker 65W 充电器 + 线 Anker 65W GaN charger', zh: '双口，送 2 米 C-C 线。', en: 'Dual port, 2 m C-to-C cable included.', price: 18, brand: 'Anker', spot: UI.union, delivery: 'delivery', photos: [27], daysAgo: 20, status: 'sold', soldPrice: 18, buyer: I('jason.tan'), soldDaysAgo: 15 },

  // ============================================================ NYU (12)
  { seller: Y('kevin.xie'), campus: 'nyu', cat: 'furniture', cond: 'good', title: '宜家 MALM 五斗柜 IKEA MALM 6-drawer dresser', zh: 'East Village 转租前清空，6 月 1 日前取。', en: 'Clearing the East Village place before the sublet; pick up by Jun 1.', price: 70, obo: true, orig: 229, brand: 'IKEA', spot: NY.ev, photos: [31], daysAgo: 6, bundle: 'kevin' },
  { seller: Y('kevin.xie'), campus: 'nyu', cat: 'electronics', cond: 'like_new', title: 'Samsung 32 寸曲面显示器 Samsung 32" curved monitor', zh: '数据可视化看着舒服，附 HDMI 线。', en: 'Great for dashboards; HDMI cable included.', price: 150, obo: true, orig: 300, brand: 'Samsung', spot: NY.ev, photos: [7], daysAgo: 6, bundle: 'kevin', views: 70 },
  { seller: Y('kevin.xie'), campus: 'nyu', cat: 'kitchen', cond: 'good', title: '厨房套装：锅 3 件 + 刀具 Kitchen set: 3 pans and knives', zh: '一起打包，单买不拆。', en: 'Sold as a set, not splitting.', price: 40, spot: NY.ev, photos: [14, 54], daysAgo: 6, bundle: 'kevin' },
  { seller: Y('kevin.xie'), campus: 'nyu', cat: 'home', cond: 'good', title: '空调 窗机 8000 BTU Window AC unit 8000 BTU', zh: '纽约夏天必备，去年买的。', en: 'NYC summer essential, bought last year.', price: 90, obo: true, orig: 260, brand: 'Frigidaire', spot: NY.ev, photos: [42], daysAgo: 6, bundle: 'kevin', views: 112 },
  { seller: Y('anqi.yang'), campus: 'nyu', cat: 'electronics', cond: 'good', title: 'Wacom Intuos Pro M 数位板 Wacom Intuos Pro medium', zh: 'IDM 课程用，笔尖换过。', en: 'Used for IDM classes, new nibs.', price: 180, obo: true, orig: 380, brand: 'Wacom', spot: NY.wsp, delivery: 'both', photos: [32], daysAgo: 3, views: 64 },
  { seller: Y('anqi.yang'), campus: 'nyu', cat: 'furniture', cond: 'like_new', title: '宜家 ALEX 抽屉柜 IKEA ALEX drawer unit', zh: '白色，Brooklyn 工作室取。', en: 'White, pickup at the Brooklyn studio.', price: 45, orig: 90, brand: 'IKEA', spot: NY.astor, photos: [41], daysAgo: 3 },
  { seller: Y('lucia.fernandez'), campus: 'nyu', cat: 'textbooks', cond: 'good', title: 'International Relations 12e (Goldstein/Pevehouse)', zh: 'Global Affairs 必修。', en: 'Required for Global Affairs.', price: 30, orig: 120, spot: NY.bobst, delivery: 'both', photos: [43], daysAgo: 10 },
  { seller: Y('lucia.fernandez'), campus: 'nyu', cat: 'bikes', cond: 'fair', title: '城市单车 Citi-style cruiser bike', zh: '有锈，能骑，适合曼哈顿短途。', en: 'Some rust, rides fine, good for short Manhattan trips.', price: 60, obo: true, spot: NY.union, photos: [50], daysAgo: 10 },
  { seller: Y('ziyang.pan'), campus: 'nyu', cat: 'furniture', cond: 'like_new', title: 'West Elm 书桌 Mid-Century West Elm desk', zh: 'Greenwich Village 公寓，搬去办公室所以出。', en: 'From the Greenwich Village apartment, moving to an office.', price: 260, obo: true, orig: 699, brand: 'West Elm', spot: NY.wsp, photos: [6], daysAgo: 2, views: 95 },
  { seller: Y('ziyang.pan'), campus: 'nyu', cat: 'clothing', cond: 'like_new', title: 'Patagonia 抓绒 男 M Patagonia Better Sweater, men’s M', zh: '穿过几次。', en: 'Worn a few times.', price: 55, orig: 139, brand: 'Patagonia', spot: NY.stuy, delivery: 'both', photos: [56], daysAgo: 12 },
  { seller: Y('anqi.yang'), campus: 'nyu', cat: 'kitchen', cond: 'good', title: 'Vitamix E310 破壁机 Vitamix blender', zh: '每天打果汁，马达强劲。', en: 'Daily smoothies, motor still strong.', price: 150, obo: true, orig: 350, brand: 'Vitamix', spot: NY.astor, photos: [29], daysAgo: 35, status: 'sold', soldPrice: 130, buyer: Y('lucia.fernandez'), soldDaysAgo: 22 },
  { seller: Y('kevin.xie'), campus: 'nyu', cat: 'free', cond: 'good', title: '免费：纸箱 + 泡沫膜 Free moving boxes and bubble wrap', zh: '搬家剩的，East Village 自取。', en: 'Leftover from a move, pickup in the East Village.', price: 0, spot: NY.ev, photos: [11], daysAgo: 1 },

  // ============================================================ USC (10)
  { seller: S('jingyi.cao'), campus: 'usc', cat: 'furniture', cond: 'good', title: '宜家全套：床 + 桌 + 椅 IKEA set: bed, desk, chair', zh: 'Viterbi 毕业，整套 $150，拆开也可以。', en: 'Graduating from Viterbi; $150 for the set, will split.', price: 150, obo: true, orig: 420, brand: 'IKEA', spot: SC.village, photos: [26, 6, 1], daysAgo: 4, views: 85 },
  { seller: S('jingyi.cao'), campus: 'usc', cat: 'electronics', cond: 'like_new', title: 'Apple Magic Keyboard + Trackpad', zh: '白色，附线。', en: 'White, cable included.', price: 110, orig: 230, brand: 'Apple', spot: SC.village, delivery: 'both', photos: [37], daysAgo: 4 },
  { seller: S('jingyi.cao'), campus: 'usc', cat: 'kitchen', cond: 'good', title: '电饭煲 + 电磁炉 Rice cooker and induction cooktop', zh: '一起 $40。', en: '$40 for both.', price: 40, spot: SC.village, photos: [4, 34], daysAgo: 4 },
  { seller: S('weichen.du'), campus: 'usc', cat: 'electronics', cond: 'good', title: 'Oculus Quest 2 128GB', zh: '附 Elite 头带，账号已退出。', en: 'Elite strap included, account signed out.', price: 160, obo: true, orig: 299, brand: 'Meta', spot: SC.figueroa, delivery: 'both', photos: [52], daysAgo: 8, views: 72 },
  { seller: S('weichen.du'), campus: 'usc', cat: 'bikes', cond: 'good', title: '电动滑板车 Segway Ninebot F30 Electric scooter', zh: '通勤 Expo 到校区正好，续航 20 英里。', en: 'Perfect Expo-to-campus commute, 20 mi range.', price: 280, obo: true, orig: 549, brand: 'Segway', spot: SC.expo, photos: [15], daysAgo: 2, views: 160 },
  { seller: S('ava.nguyen'), campus: 'usc', cat: 'other', cond: 'good', title: '徒步背包 Osprey Daylite Plus Hiking daypack', zh: 'Runyon 周日徒步用，九成新。', en: 'Sunday Runyon hikes, like new.', price: 35, brand: 'Osprey', spot: SC.leavey, photos: [60], daysAgo: 9 },
  { seller: S('ava.nguyen'), campus: 'usc', cat: 'textbooks', cond: 'good', title: 'Essentials of Epidemiology in Public Health 4e', zh: 'MPH 核心课本。', en: 'MPH core textbook.', price: 28, orig: 95, spot: SC.leavey, delivery: 'both', photos: [48], daysAgo: 9 },
  { seller: S('hongyu.shi'), campus: 'usc', cat: 'furniture', cond: 'like_new', title: '真皮办公椅 Herman Miller Sayl Office chair', zh: 'Marshall MBA 两年，搬去旧金山所以出。', en: 'Two years at Marshall, moving to SF.', price: 350, obo: true, orig: 795, brand: 'Herman Miller', spot: SC.tommy, photos: [1], daysAgo: 5, views: 140 },
  { seller: S('hongyu.shi'), campus: 'usc', cat: 'home', cond: 'good', title: '落地灯 + 地毯 Floor lamp and rug', zh: '一起 $30。', en: '$30 together.', price: 30, spot: SC.tommy, photos: [21, 51], daysAgo: 5 },
  { seller: S('weichen.du'), campus: 'usc', cat: 'kitchen', cond: 'like_new', title: 'Keurig K-Mini 咖啡机 Keurig K-Mini', zh: '附 10 个胶囊。', en: '10 pods included.', price: 35, orig: 90, brand: 'Keurig', spot: SC.figueroa, photos: [34], daysAgo: 28, status: 'sold', soldPrice: 30, buyer: S('ava.nguyen'), soldDaysAgo: 18 },
];

// ---------------------------------------------------------------- bundles (linked to the seller's sublet listing)
type BundleSpec = { key: string; seller: string; campus: ItemSpec['campus']; title: string; description: string; discountPct: number; moveOutDate: string; listing: { title: string; address: string; city: string; state: string; zip: string; lat: number; lng: number; price: number; bedrooms: number; from: string; to: string; neighborhood: string; photo: number } };
const BUNDLES: BundleSpec[] = [
  {
    key: 'xinyi', seller: N('xinyi.lin'), campus: 'northwestern', title: '毕业搬离甩卖：Sherman Ave 1B1B 全屋 Move-out sale: Sherman Ave 1B1B', discountPct: 20, moveOutDate: '2026-06-10',
    description: '毕业离开 Evanston，整屋家具电器一起打包 8 折。6 月 10 日前自提，接手转租的同学优先。\nGraduating and leaving Evanston — everything in the apartment, 20% off if you take it all. Pickup before Jun 10; whoever takes over the sublet gets first dibs.',
    listing: { title: 'Sherman Ave 1B1B 带家具夏季转租 Furnished 1B1B on Sherman', address: '1720 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0478, lng: -87.6812, price: 1450, bedrooms: 1, from: '2026-06-15', to: '2026-08-31', neighborhood: 'Downtown Evanston', photo: 7 },
  },
  {
    key: 'yuxuan', seller: I('yuxuan.li'), campus: 'uiuc', title: '暑期转租甩卖：Green St 公寓 Move-out sale: Green St apartment', discountPct: 15, moveOutDate: '2026-05-20',
    description: '暑期去西雅图实习，Green St 公寓的家具打包 85 折。\nOff to Seattle for the summer; Green St apartment furniture, 15% off for the lot.',
    listing: { title: 'Green St 1B1B 暑期转租 Summer sublet on Green St', address: '512 E Green St', city: 'Champaign', state: 'IL', zip: '61820', lat: 40.1104, lng: -88.2301, price: 950, bedrooms: 1, from: '2026-05-20', to: '2026-08-15', neighborhood: 'Campustown', photo: 14 },
  },
  {
    key: 'kevin', seller: Y('kevin.xie'), campus: 'nyu', title: 'East Village 搬离打包 East Village move-out bundle', discountPct: 25, moveOutDate: '2026-06-01',
    description: '实习去西雅图，East Village 一居的东西整套 75 折，接手转租可以直接留在屋里。\nInternship in Seattle: 25% off everything in the East Village 1B; if you take the sublet it can all stay put.',
    listing: { title: 'East Village 1B 夏季转租 East Village 1B summer sublet', address: '229 E 7th St', city: 'New York', state: 'NY', zip: '10009', lat: 40.7265, lng: -73.9838, price: 2600, bedrooms: 1, from: '2026-06-01', to: '2026-08-31', neighborhood: 'East Village', photo: 21 },
  },
];

const WISHLISTS: { user: string; item: number; priceAtAdd?: number; daysAgo: number }[] = [
  { user: N('alice'), item: 10, priceAtAdd: 350, daysAgo: 2 }, // Trek bike: price drop demo
  { user: N('alice'), item: 20, daysAgo: 1 },
  { user: N('alice'), item: 23, priceAtAdd: 450, daysAgo: 1 },
  { user: N('alice'), item: 3, daysAgo: 3 },
  { user: N('bob'), item: 23, daysAgo: 1 },
  { user: N('bob'), item: 48, daysAgo: 1 },
  { user: N('bob'), item: 0, daysAgo: 2 },
  { user: N('haoran.zhang'), item: 23, daysAgo: 1 },
  { user: N('daniel.kim'), item: 10, daysAgo: 2 },
  { user: N('grace.hu'), item: 28, priceAtAdd: 520, daysAgo: 1 },
  { user: N('newbie'), item: 48, daysAgo: 0 },
  { user: I('ryan.zhu'), item: 59, daysAgo: 1 },
  { user: Y('mia.cheng'), item: 76, daysAgo: 1 },
  { user: S('ava.nguyen'), item: 84, daysAgo: 1 },
];

// two boosted Northwestern items (billing owns `boosts`; these seed rows carry a mkt- prefix so both seeds stay idempotent)
const BOOSTS: { item: number; tier: 'plus' | 'max'; days: number }[] = [
  { item: 23, tier: 'max', days: 7 }, // iPad Air
  { item: 10, tier: 'plus', days: 3 }, // Trek bike
];

const itemId = (i: number) => `mkt-item-${String(i + 1).padStart(2, '0')}`;
const photoPath = (n: number) => `seed/items/i${String(n).padStart(2, '0')}.svg`;
const roomPath = (n: number) => `seed/rooms/r${String(n).padStart(2, '0')}.svg`;
const iso = (daysAgo: number, hourJitter = 0) => new Date(nowMs() - daysAgo * DAY - hourJitter * 3_600_000).toISOString();

export default async function seed(_db: DatabaseSync): Promise<void> {
  const t = nowIso();
  const userId = (email: string): string => {
    const row = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    return row?.id ?? seedUserId(email);
  };

  q.tx(() => {
    // ---- wipe previous market seed rows (cascades: photos, wishlists)
    q.run("DELETE FROM boosts WHERE id LIKE 'mkt-seed-boost-%'");
    q.run("DELETE FROM wishlists WHERE item_id LIKE 'mkt-item-%'");
    q.run("DELETE FROM market_items WHERE id LIKE 'mkt-item-%'");
    q.run("DELETE FROM market_bundles WHERE id LIKE 'mkt-bundle-%'");
    q.run("DELETE FROM listing_photos WHERE listing_id LIKE 'mkt-seed-listing-%'");
    q.run("DELETE FROM listings WHERE id LIKE 'mkt-seed-listing-%'");

    // ---- bundles + the sublet they link to (reuse the seller's own active listing when the listings seed has one)
    const bundleIds = new Map<string, string>();
    for (const b of BUNDLES) {
      const sellerId = userId(b.seller);
      let listingId = q.get<{ id: string }>("SELECT id FROM listings WHERE owner_id = ? AND status = 'active' ORDER BY published_at DESC LIMIT 1", [sellerId])?.id ?? null;
      if (!listingId) {
        listingId = `mkt-seed-listing-${b.key}`;
        const coverId = insertSeedUpload({ path: roomPath(b.listing.photo), purpose: 'seed' });
        const published = iso(14);
        q.run(
          `INSERT INTO listings (id, owner_id, campus_id, title, description, listing_type, property_type, address_line1, city, state, zip, lat, lng, geocode_precision,
             hide_exact_address, neighborhood, price_cents, deposit_cents, bedrooms, bathrooms, furnished, available_from, available_to, min_term_months, lease_type,
             status, moderation_status, is_verified_listing, published_at, expires_at, cover_upload_id, photo_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'sublet', 'apartment', ?, ?, ?, ?, ?, ?, 'rooftop', 1, ?, ?, ?, ?, 1, 'full', ?, ?, 2, 'sublease', 'active', 'ok', 1, ?, ?, ?, 1, ?, ?)`,
          [listingId, sellerId, b.campus, b.listing.title, `${b.title}\n${b.description}`, b.listing.address, b.listing.city, b.listing.state, b.listing.zip, b.listing.lat, b.listing.lng,
            b.listing.neighborhood, b.listing.price * 100, b.listing.price * 100, b.listing.bedrooms, b.listing.from, b.listing.to, published, iso(-60), coverId, published, t],
        );
        q.run('INSERT INTO listing_photos (id, listing_id, upload_id, sort_order, created_at) VALUES (?, ?, ?, 0, ?)', [`${listingId}-p0`, listingId, coverId, published]);
      }
      const id = `mkt-bundle-${b.key}`;
      bundleIds.set(b.key, id);
      q.run(
        'INSERT INTO market_bundles (id, seller_id, campus_id, listing_id, title, description, discount_pct, move_out_date, status, item_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
        [id, sellerId, b.campus, listingId, b.title, b.description, b.discountPct, b.moveOutDate, 'active', iso(5), t],
      );
    }

    // ---- items
    ITEMS.forEach((s, i) => {
      const id = itemId(i);
      const sellerId = userId(s.seller);
      const status = s.status ?? 'active';
      const createdAt = iso(s.daysAgo, (i * 7) % 23);
      const isFree = s.price === 0 || s.cat === 'free';
      const uploadIds = s.photos.map((n) => insertSeedUpload({ path: photoPath(n), purpose: 'seed' }));
      const soldAt = status === 'sold' ? iso(s.soldDaysAgo ?? 1) : null;
      const views = s.views ?? 6 + ((i * 13) % 40);
      q.run(
        `INSERT INTO market_items (id, seller_id, campus_id, bundle_id, title, description, category, condition, price_cents, is_free, obo, original_price_cents, brand,
           pickup_label, pickup_lat, pickup_lng, city, state, delivery_option, status, moderation_status, buyer_id, sold_at, sold_price_cents, cover_upload_id,
           photo_count, view_count, wishlist_count, chat_count, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
        [
          id, sellerId, s.campus, s.bundle ? bundleIds.get(s.bundle) ?? null : null, s.title, `${s.zh}\n\n${s.en}`, s.cat, s.cond, isFree ? 0 : s.price * 100, isFree ? 1 : 0, s.obo && !isFree ? 1 : 0,
          s.orig ? s.orig * 100 : null, s.brand ?? null, s.spot.label, s.spot.lat, s.spot.lng, campusCity(s.campus).city, campusCity(s.campus).state, s.delivery ?? 'pickup', status,
          s.buyer ? userId(s.buyer) : null, soldAt, status === 'sold' ? (s.soldPrice ?? s.price) * 100 : null, uploadIds[0] ?? null,
          views, status === 'sold' ? 2 + (i % 4) : i % 3, status === 'expired' ? iso(2) : status === 'active' || status === 'reserved' ? iso(s.daysAgo - 60) : null,
          createdAt, soldAt ?? createdAt,
        ],
      );
      uploadIds.forEach((uploadId, k) => q.run('INSERT INTO market_item_photos (id, item_id, upload_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [`${id}-p${k}`, id, uploadId, k, createdAt]));
    });

    // ---- wishlists (price_at_add_cents drives the price-drop badge)
    for (const w of WISHLISTS) {
      const spec = ITEMS[w.item];
      if (!spec) continue;
      const price = spec.price === 0 || spec.cat === 'free' ? 0 : spec.price * 100;
      q.run('INSERT OR IGNORE INTO wishlists (user_id, item_id, price_at_add_cents, created_at) VALUES (?, ?, ?, ?)', [userId(w.user), itemId(w.item), w.priceAtAdd ? w.priceAtAdd * 100 : price, iso(w.daysAgo)]);
    }

    // ---- boosts (active, so the browse list gets its sponsored slots)
    BOOSTS.forEach((b, k) => {
      const spec = ITEMS[b.item]!;
      const id = `mkt-seed-boost-${k + 1}`;
      q.run(
        "INSERT INTO boosts (id, user_id, campus_id, entity_type, entity_id, tier, starts_at, ends_at, status, impressions, clicks, created_at, updated_at) VALUES (?, ?, ?, 'market_item', ?, ?, ?, ?, 'active', ?, ?, ?, ?)",
        [id, userId(spec.seller), spec.campus, itemId(b.item), b.tier, iso(1), iso(-b.days), 40 + k * 17, 3 + k, iso(1), t],
      );
      q.run('UPDATE market_items SET boosted_until = ? WHERE id = ? AND (boosted_until IS NULL OR boosted_until < ?)', [iso(-b.days), itemId(b.item), iso(-b.days)]);
    });
  });
}

function campusCity(campus: ItemSpec['campus']): { city: string; state: string } {
  switch (campus) {
    case 'northwestern': return { city: 'Evanston', state: 'IL' };
    case 'uiuc': return { city: 'Urbana', state: 'IL' };
    case 'nyu': return { city: 'New York', state: 'NY' };
    case 'usc': return { city: 'Los Angeles', state: 'CA' };
  }
}
